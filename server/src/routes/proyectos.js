import { Router } from 'express'
import prisma from '../lib/prisma.js'
import { requireAuth, requireAdmin, requireAdminOrApiKey, requireAuthOrApiKey } from '../middleware/auth.js'
import { generarSlug } from '../lib/slug.js'
import { generarPasswordSimple } from '../lib/passwords.js'
import { emitirCambio } from '../lib/eventos.js'
import { validarYNormalizarEquipo } from '../lib/permisos.js'
import { obtenerOCrearCarpetaProyecto, driveConfigurado } from '../lib/drive.js'
import tareasRouter from './tareas.js'
import solicitudesRouter from './solicitudes.js'

const router = Router()

// Lista fija por ahora — duplicada (no importada) de src/lib/areas.js porque
// frontend y backend se despliegan como apps separadas en Coolify.
const AREAS_VALIDAS = ['web', 'diseno_grafico', 'redes_sociales']
function areasValidas(areas) {
  return Array.isArray(areas) && areas.every((a) => AREAS_VALIDAS.includes(a))
}

router.use('/:slug/tareas', tareasRouter)
router.use('/:slug/solicitudes', solicitudesRouter)

const INCLUDE = {
  tareas: { include: { comentarios: { orderBy: { creadoEn: 'asc' } } } },
  log: { orderBy: { fecha: 'desc' }, take: 100 },
  solicitudes: { orderBy: { creadaEn: 'desc' } },
}

async function getProyecto(slug) {
  return prisma.proyecto.findFirst({
    where: { OR: [{ slug }, { id: slug }] },
    include: INCLUDE,
  })
}

async function logEntry(proyectoId, usuario, accion, detalle = '') {
  return prisma.logEntry.create({ data: { proyectoId, usuario, accion, detalle } })
}

// GET /api/proyectos
router.get('/', requireAuth, async (req, res) => {
  try {
    const proyectos = await prisma.proyecto.findMany({
      orderBy: { creadoEn: 'desc' },
      include: INCLUDE,
    })
    res.json(proyectos)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// GET /api/proyectos/:slug
router.get('/:slug', requireAuth, async (req, res) => {
  try {
    const p = await getProyecto(req.params.slug)
    if (!p) return res.status(404).json({ error: 'Proyecto no encontrado' })
    res.json(p)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// POST /api/proyectos
router.post('/', requireAuthOrApiKey, async (req, res) => {
  const { tipo, cliente, proyecto, condicionesTecnicas, equipo, passwordCliente, tareas, creadoPor, areas } = req.body
  if (areas !== undefined && !areasValidas(areas)) return res.status(400).json({ error: `areas inválido — valores permitidos: ${AREAS_VALIDAS.join(', ')}` })
  const slug = generarSlug(cliente.nombreComercial)

  try {
    const result = await prisma.$transaction(async (tx) => {
      const p = await tx.proyecto.create({
        data: {
          slug,
          tipo: tipo === 'continuo' ? 'continuo' : 'finito',
          status: proyecto.anticipoConfirmado ? 'activo' : 'pendiente_anticipo',
          cliente,
          proyecto,
          condicionesTecnicas,
          equipo,
          areas: areas || [],
          passwordCliente: passwordCliente || generarPasswordSimple(),
          linksCliente: { drive: '', brief: '', boceto: '', diseno: '' },
          tiempos: {
            inicio: proyecto.anticipoConfirmado ? new Date().toISOString() : null,
            cierre: null,
            pausas: [],
          },
        },
      })

      if (tareas?.length) {
        await tx.tarea.createMany({
          data: tareas.map((t, idx) => ({
            id: t.id,
            proyectoId: p.id,
            fase: t.fase,
            orden: idx,
            titulo: t.titulo,
            responsable: t.responsable || 'equipo',
            dependencias: t.dependencias || [],
            condicion: t.condicion || null,
            descripcion: t.descripcion || '',
            queHacer: t.queHacer || '',
            necesitasAntes: t.necesitasAntes || '',
            plantillaMensaje: t.plantillaMensaje || '',
            queEntregas: t.queEntregas || '',
            linkTipo: t.linkTipo || null,
            esCliente: t.esCliente || false,
            instruccionesCliente: t.instruccionesCliente || '',
            plazoHoras: t.plazoHoras || null,
            esRutaCritica: t.esRutaCritica || false,
            soloAdmin: t.soloAdmin || false,
            soloKarlaOAdmin: t.soloKarlaOAdmin || false,
            opcional: t.opcional || false,
            custom: false,
            estado: 'pendiente',
            completadaPor: null,
            completadaEn: null,
            asignadoA: null,
            disponibleDesde: t.esCliente && !(t.dependencias || []).length ? new Date() : null,
          })),
        })
      }

      await tx.logEntry.create({
        data: {
          proyectoId: p.id,
          usuario: creadoPor || 'Admin',
          accion: 'Proyecto creado',
          detalle: `Paquete: ${proyecto.paquete}`,
        },
      })

      return tx.proyecto.findUnique({ where: { id: p.id }, include: INCLUDE })
    })

    if (driveConfigurado()) {
      try {
        const carpetaId = await obtenerOCrearCarpetaProyecto(result)
        result.driveRespuestasId = carpetaId
        await prisma.proyecto.update({ where: { id: result.id }, data: { driveRespuestasId: carpetaId } })
      } catch (err) {
        console.error('Error creando carpeta de Drive al crear proyecto:', err)
      }
    }

    emitirCambio(result.id)
    res.status(201).json(result)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Error al crear el proyecto' })
  }
})

// DELETE /api/proyectos/:slug
router.delete('/:slug', requireAdminOrApiKey, async (req, res) => {
  try {
    const p = await prisma.proyecto.findFirst({ where: { OR: [{ slug: req.params.slug }, { id: req.params.slug }] } })
    if (!p) return res.status(404).json({ error: 'Proyecto no encontrado' })
    await prisma.proyecto.delete({ where: { id: p.id } })
    emitirCambio(p.id)
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// POST /api/proyectos/:slug/marcar-visto
router.post('/:slug/marcar-visto', requireAuth, async (req, res) => {
  try {
    const p = await prisma.proyecto.findFirst({ where: { OR: [{ slug: req.params.slug }, { id: req.params.slug }] } })
    if (!p) return res.status(404).json({ error: 'Proyecto no encontrado' })

    await prisma.proyecto.update({ where: { id: p.id }, data: { vistoAdminEn: new Date() } })
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// POST /api/proyectos/:slug/drive
// Genera (o reutiliza, es idempotente) la carpeta de Drive del proyecto —
// para proyectos creados antes de que esto se hiciera automático al crear.
router.post('/:slug/drive', requireAuth, async (req, res) => {
  try {
    const p = await prisma.proyecto.findFirst({ where: { OR: [{ slug: req.params.slug }, { id: req.params.slug }] } })
    if (!p) return res.status(404).json({ error: 'Proyecto no encontrado' })
    if (!driveConfigurado()) return res.status(503).json({ error: 'Drive no está configurado en el servidor' })

    const carpetaId = await obtenerOCrearCarpetaProyecto(p)
    if (!p.driveRespuestasId) await prisma.proyecto.update({ where: { id: p.id }, data: { driveRespuestasId: carpetaId } })
    emitirCambio(p.id)
    res.json({ ok: true, driveRespuestasId: carpetaId })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Error al crear la carpeta de Drive' })
  }
})

// PUT /api/proyectos/:slug/links
router.put('/:slug/links', requireAuth, async (req, res) => {
  try {
    const p = await prisma.proyecto.findFirst({ where: { OR: [{ slug: req.params.slug }, { id: req.params.slug }] } })
    if (!p) return res.status(404).json({ error: 'Proyecto no encontrado' })

    const linksCliente = { ...(p.linksCliente || {}), ...req.body }
    await prisma.proyecto.update({ where: { id: p.id }, data: { linksCliente } })
    emitirCambio(p.id)
    res.json({ ok: true, linksCliente })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// PUT /api/proyectos/:slug/descripcion
router.put('/:slug/descripcion', requireAuth, async (req, res) => {
  const { descripcion } = req.body
  if (typeof descripcion !== 'string') return res.status(400).json({ error: 'descripcion inválida' })

  try {
    const p = await prisma.proyecto.findFirst({ where: { OR: [{ slug: req.params.slug }, { id: req.params.slug }] } })
    if (!p) return res.status(404).json({ error: 'Proyecto no encontrado' })

    const proyecto = { ...p.proyecto, descripcion: descripcion.trim() }
    await prisma.proyecto.update({ where: { id: p.id }, data: { proyecto } })
    emitirCambio(p.id)
    res.json({ ok: true, descripcion: proyecto.descripcion })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// PUT /api/proyectos/:slug/equipo
router.put('/:slug/equipo', requireAuth, async (req, res) => {
  const { equipo } = req.body
  if (!equipo || typeof equipo !== 'object') return res.status(400).json({ error: 'equipo inválido' })

  try {
    const p = await prisma.proyecto.findFirst({ where: { OR: [{ slug: req.params.slug }, { id: req.params.slug }] } })
    if (!p) return res.status(404).json({ error: 'Proyecto no encontrado' })

    const nuevoEquipo = await validarYNormalizarEquipo(prisma, equipo)
    await prisma.proyecto.update({ where: { id: p.id }, data: { equipo: nuevoEquipo } })
    emitirCambio(p.id)
    res.json({ ok: true, equipo: nuevoEquipo })
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message })
    console.error(err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// PUT /api/proyectos/:slug/areas
router.put('/:slug/areas', requireAuth, async (req, res) => {
  const { areas } = req.body
  if (!areasValidas(areas)) return res.status(400).json({ error: `areas inválido — valores permitidos: ${AREAS_VALIDAS.join(', ')}` })

  try {
    const p = await prisma.proyecto.findFirst({ where: { OR: [{ slug: req.params.slug }, { id: req.params.slug }] } })
    if (!p) return res.status(404).json({ error: 'Proyecto no encontrado' })

    await prisma.proyecto.update({ where: { id: p.id }, data: { areas } })
    emitirCambio(p.id)
    res.json({ ok: true, areas })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// POST /api/proyectos/:slug/regenerar-password
router.post('/:slug/regenerar-password', requireAuth, async (req, res) => {
  try {
    const p = await prisma.proyecto.findFirst({ where: { OR: [{ slug: req.params.slug }, { id: req.params.slug }] } })
    if (!p) return res.status(404).json({ error: 'Proyecto no encontrado' })

    const passwordCliente = generarPasswordSimple()
    await prisma.proyecto.update({ where: { id: p.id }, data: { passwordCliente } })
    await logEntry(p.id, req.user.nombre, 'Contraseña de cliente regenerada')
    emitirCambio(p.id)
    res.json({ ok: true, passwordCliente })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// POST /api/proyectos/:slug/anticipo
router.post('/:slug/anticipo', requireAdmin, async (req, res) => {
  try {
    const p = await prisma.proyecto.findFirst({ where: { OR: [{ slug: req.params.slug }, { id: req.params.slug }] } })
    if (!p) return res.status(404).json({ error: 'Proyecto no encontrado' })

    const tiempos = { ...(p.tiempos || {}), inicio: p.tiempos?.inicio || new Date().toISOString() }
    await prisma.proyecto.update({ where: { id: p.id }, data: { status: 'activo', proyecto: { ...p.proyecto, anticipoConfirmado: true }, tiempos } })
    await logEntry(p.id, req.user.nombre, 'Anticipo confirmado')

    emitirCambio(p.id)
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// POST /api/proyectos/:slug/pausa
router.post('/:slug/pausa', requireAuth, async (req, res) => {
  try {
    const p = await prisma.proyecto.findFirst({ where: { OR: [{ slug: req.params.slug }, { id: req.params.slug }] } })
    if (!p) return res.status(404).json({ error: 'Proyecto no encontrado' })

    const tiempos = p.tiempos || { pausas: [] }
    if (tiempos.pausas?.find((pa) => !pa.fin)) return res.status(400).json({ error: 'Ya hay una pausa activa' })

    tiempos.pausas = [...(tiempos.pausas || []), {
      id: crypto.randomUUID(),
      inicio: new Date().toISOString(),
      fin: null,
      fase: req.body.fase || 1,
      motivo: 'Esperando respuesta del cliente',
    }]

    await prisma.proyecto.update({ where: { id: p.id }, data: { status: 'en_pausa', tiempos } })
    await logEntry(p.id, req.user.nombre, 'Proyecto en pausa')
    emitirCambio(p.id)
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// DELETE /api/proyectos/:slug/pausa
router.delete('/:slug/pausa', requireAuth, async (req, res) => {
  try {
    const p = await prisma.proyecto.findFirst({ where: { OR: [{ slug: req.params.slug }, { id: req.params.slug }] } })
    if (!p) return res.status(404).json({ error: 'Proyecto no encontrado' })

    const tiempos = p.tiempos || { pausas: [] }
    const pausaActiva = tiempos.pausas?.find((pa) => !pa.fin)
    if (pausaActiva) pausaActiva.fin = new Date().toISOString()

    await prisma.proyecto.update({ where: { id: p.id }, data: { status: 'activo', tiempos } })
    await logEntry(p.id, req.user.nombre, 'Pausa terminada')
    emitirCambio(p.id)
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// POST /api/proyectos/:slug/cerrar
router.post('/:slug/cerrar', requireAuth, async (req, res) => {
  try {
    const p = await prisma.proyecto.findFirst({ where: { OR: [{ slug: req.params.slug }, { id: req.params.slug }] } })
    if (!p) return res.status(404).json({ error: 'Proyecto no encontrado' })

    const tiempos = { ...(p.tiempos || {}), cierre: new Date().toISOString() }
    await prisma.proyecto.update({ where: { id: p.id }, data: { status: 'completado', tiempos } })
    await logEntry(p.id, req.user.nombre, 'Proyecto cerrado')
    emitirCambio(p.id)
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// PUT /api/proyectos/:slug/tipo
// Convierte un proyecto entre "finito" (fases) y "continuo" (tablero Kanban).
// Al pasar a continuo, las tareas conservan su `estado` (que es justo lo que
// define la columna del tablero) y solo se les resetea `fase` a 1. Al volver
// a finito, todas las tareas quedan en fase 1 (el admin las reorganiza a
// mano) y cualquier tarea en "revision" (estado exclusivo de Kanban) pasa a
// "en_proceso", que es lo más cercano que reconoce el flujo por fases.
router.put('/:slug/tipo', requireAuth, async (req, res) => {
  const { tipo } = req.body
  if (tipo !== 'finito' && tipo !== 'continuo') return res.status(400).json({ error: 'tipo inválido' })

  try {
    const p = await prisma.proyecto.findFirst({ where: { OR: [{ slug: req.params.slug }, { id: req.params.slug }] } })
    if (!p) return res.status(404).json({ error: 'Proyecto no encontrado' })
    if (p.tipo === tipo) return res.json({ ok: true })

    await prisma.$transaction(async (tx) => {
      if (tipo === 'continuo') {
        await tx.proyecto.update({
          where: { id: p.id },
          data: { tipo, proyecto: { ...p.proyecto, fases: [] } },
        })
        await tx.tarea.updateMany({ where: { proyectoId: p.id }, data: { fase: 1 } })
      } else {
        const fasesFinal = p.proyecto?.fases?.length ? p.proyecto.fases : [
          { numero: 1, nombre: 'Planeación' },
          { numero: 2, nombre: 'Desarrollo' },
          { numero: 3, nombre: 'Entrega' },
        ]
        await tx.proyecto.update({
          where: { id: p.id },
          data: { tipo, proyecto: { ...p.proyecto, fases: fasesFinal } },
        })
        await tx.tarea.updateMany({ where: { proyectoId: p.id }, data: { fase: 1 } })
        await tx.tarea.updateMany({ where: { proyectoId: p.id, estado: 'revision' }, data: { estado: 'en_proceso' } })
      }

      await tx.logEntry.create({
        data: { proyectoId: p.id, usuario: req.user.nombre, accion: 'Tipo de proyecto cambiado', detalle: `${p.tipo} → ${tipo}` },
      })
    })

    emitirCambio(p.id)
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Error interno' })
  }
})

export default router
