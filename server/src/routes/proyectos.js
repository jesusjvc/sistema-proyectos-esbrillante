import { Router } from 'express'
import prisma from '../lib/prisma.js'
import { requireAuth, requireAdmin, requireAdminOrApiKey } from '../middleware/auth.js'
import { generarSlug } from '../lib/slug.js'
import tareasRouter from './tareas.js'

const router = Router()

router.use('/:slug/tareas', tareasRouter)

const INCLUDE = {
  tareas: true,
  log: { orderBy: { fecha: 'desc' }, take: 100 },
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
router.post('/', requireAdminOrApiKey, async (req, res) => {
  const { cliente, proyecto, condicionesTecnicas, equipo, passwordCliente, tareas, creadoPor } = req.body
  const slug = generarSlug(cliente.nombreComercial)

  try {
    const result = await prisma.$transaction(async (tx) => {
      const p = await tx.proyecto.create({
        data: {
          slug,
          status: proyecto.anticipoConfirmado ? 'activo' : 'pendiente_anticipo',
          cliente,
          proyecto,
          condicionesTecnicas,
          equipo,
          passwordCliente,
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
          data: tareas.map((t) => ({
            id: t.id,
            proyectoId: p.id,
            fase: t.fase,
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
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// PUT /api/proyectos/:slug/links
router.put('/:slug/links', requireAuth, async (req, res) => {
  try {
    const p = await prisma.proyecto.findFirst({ where: { OR: [{ slug: req.params.slug }, { id: req.params.slug }] } })
    if (!p) return res.status(404).json({ error: 'Proyecto no encontrado' })

    const linksCliente = { ...(p.linksCliente || {}), ...req.body }
    await prisma.proyecto.update({ where: { id: p.id }, data: { linksCliente } })
    res.json({ ok: true, linksCliente })
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
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// POST /api/proyectos/:slug/cerrar
router.post('/:slug/cerrar', requireAdmin, async (req, res) => {
  try {
    const p = await prisma.proyecto.findFirst({ where: { OR: [{ slug: req.params.slug }, { id: req.params.slug }] } })
    if (!p) return res.status(404).json({ error: 'Proyecto no encontrado' })

    const tiempos = { ...(p.tiempos || {}), cierre: new Date().toISOString() }
    await prisma.proyecto.update({ where: { id: p.id }, data: { status: 'completado', tiempos } })
    await logEntry(p.id, req.user.nombre, 'Proyecto cerrado')
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Error interno' })
  }
})

export default router
