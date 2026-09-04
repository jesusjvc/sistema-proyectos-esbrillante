import { Router } from 'express'
import prisma from '../lib/prisma.js'
import { requireAuth, requireAdmin } from '../middleware/auth.js'
import { ordenAlFinal, ordenAntesDe, ordenDespuesDe } from '../lib/orden.js'
import { emitirCambio } from '../lib/eventos.js'
import { tareaLeCorresponde } from '../lib/permisos.js'
import { crearTareaCustom, activarTareasClienteDisponibles } from '../lib/tareaHelpers.js'
import comentariosRouter from './comentarios.js'

const router = Router({ mergeParams: true })

router.use('/:tareaId/comentarios', comentariosRouter)

const ESTADOS_TABLERO = ['pendiente', 'en_proceso', 'revision', 'completada']

async function getProyecto(slug) {
  return prisma.proyecto.findFirst({
    where: { OR: [{ slug }, { id: slug }] },
    include: { tareas: true },
  })
}

async function logEntry(proyectoId, usuario, accion, detalle = '') {
  return prisma.logEntry.create({ data: { proyectoId, usuario, accion, detalle } })
}

// Defensa en profundidad: en la UI, "Mis tareas" ya no ofrece iniciar/completar
// una tarea bloqueada, pero eso es solo convención de frontend — sin esto,
// nada impide llamar estos endpoints directo sobre una tarea con dependencias
// pendientes.
function dependenciasResueltas(tarea, todasLasTareas) {
  if (!tarea.dependencias.length) return true
  const completadasIds = new Set(todasLasTareas.filter((t) => t.estado === 'completada').map((t) => t.id))
  return tarea.dependencias.every((d) => completadasIds.has(d))
}

// POST /api/proyectos/:slug/tareas/:tareaId/iniciar
router.post('/:tareaId/iniciar', requireAuth, async (req, res) => {
  const { slug, tareaId } = req.params
  const usuario = req.user.nombre

  try {
    const p = await getProyecto(slug)
    if (!p) return res.status(404).json({ error: 'Proyecto no encontrado' })

    const tarea = await prisma.tarea.findFirst({ where: { id: tareaId, proyectoId: p.id } })
    if (!tarea) return res.status(404).json({ error: 'Tarea no encontrada' })
    if (!tareaLeCorresponde(tarea, p.equipo, req.user)) {
      return res.status(403).json({ error: 'No tienes permiso para operar esta tarea' })
    }
    if (!dependenciasResueltas(tarea, p.tareas)) {
      return res.status(400).json({ error: 'Esta tarea depende de otras que aún no se completan.' })
    }

    await prisma.tarea.update({
      where: { id: tareaId },
      data: { estado: 'en_proceso', asignadoA: usuario },
    })
    await logEntry(p.id, usuario, 'Tarea en proceso', tarea.titulo)

    emitirCambio(p.id)
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// POST /api/proyectos/:slug/tareas/:tareaId/completar
router.post('/:tareaId/completar', requireAuth, async (req, res) => {
  const { slug, tareaId } = req.params
  const usuario = req.user.nombre

  try {
    const p = await getProyecto(slug)
    if (!p) return res.status(404).json({ error: 'Proyecto no encontrado' })

    const tarea = await prisma.tarea.findFirst({ where: { id: tareaId, proyectoId: p.id } })
    if (!tarea) return res.status(404).json({ error: 'Tarea no encontrada' })
    if (!tareaLeCorresponde(tarea, p.equipo, req.user)) {
      return res.status(403).json({ error: 'No tienes permiso para operar esta tarea' })
    }
    if (!dependenciasResueltas(tarea, p.tareas)) {
      return res.status(400).json({ error: 'Esta tarea depende de otras que aún no se completan.' })
    }

    await prisma.tarea.update({
      where: { id: tareaId },
      data: { estado: 'completada', completadaPor: usuario, completadaEn: new Date() },
    })
    await logEntry(p.id, usuario, 'Tarea completada', tarea.titulo)
    await activarTareasClienteDisponibles(p.id)

    emitirCambio(p.id)
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// POST /api/proyectos/:slug/tareas/:tareaId/reabrir
router.post('/:tareaId/reabrir', requireAuth, async (req, res) => {
  const { slug, tareaId } = req.params
  const usuario = req.user.nombre

  try {
    const p = await getProyecto(slug)
    if (!p) return res.status(404).json({ error: 'Proyecto no encontrado' })

    const tarea = await prisma.tarea.findFirst({ where: { id: tareaId, proyectoId: p.id } })
    if (!tarea) return res.status(404).json({ error: 'Tarea no encontrada' })

    await prisma.tarea.update({
      where: { id: tareaId },
      data: { estado: 'pendiente', completadaPor: null, completadaEn: null, asignadoA: null },
    })
    await logEntry(p.id, usuario, 'Tarea reabierta', tarea.titulo)

    emitirCambio(p.id)
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// POST /api/proyectos/:slug/tareas/:tareaId/omitir
router.post('/:tareaId/omitir', requireAuth, async (req, res) => {
  const { slug, tareaId } = req.params
  const usuario = req.user.nombre

  try {
    const p = await getProyecto(slug)
    if (!p) return res.status(404).json({ error: 'Proyecto no encontrado' })

    const tarea = await prisma.tarea.findFirst({ where: { id: tareaId, proyectoId: p.id } })
    if (!tarea) return res.status(404).json({ error: 'Tarea no encontrada' })

    await prisma.tarea.update({ where: { id: tareaId }, data: { estado: 'omitida' } })
    await logEntry(p.id, usuario, 'Tarea omitida', tarea.titulo)

    emitirCambio(p.id)
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// POST /api/proyectos/:slug/tareas/:tareaId/mover
// Cambia de columna (estado) y/o reordena una tarjeta dentro de un tablero
// Kanban (proyectos de tipo "continuo"). El orden se calcula entre las
// tareas que ya están en la columna destino (mismo `estado`), no por fase.
router.post('/:tareaId/mover', requireAuth, async (req, res) => {
  const { slug, tareaId } = req.params
  const { estado, antesDeTareaId, despuesDeTareaId } = req.body
  const usuario = req.user.nombre

  if (!ESTADOS_TABLERO.includes(estado)) {
    return res.status(400).json({ error: `Estado inválido: "${estado}"` })
  }

  try {
    const p = await getProyecto(slug)
    if (!p) return res.status(404).json({ error: 'Proyecto no encontrado' })

    const tarea = p.tareas.find((t) => t.id === tareaId)
    if (!tarea) return res.status(404).json({ error: 'Tarea no encontrada' })
    if (!tareaLeCorresponde(tarea, p.equipo, req.user)) {
      return res.status(403).json({ error: 'No tienes permiso para operar esta tarea' })
    }

    const refId = antesDeTareaId || despuesDeTareaId
    let orden
    if (refId) {
      const ref = p.tareas.find((t) => t.id === refId && t.estado === estado)
      if (!ref) return res.status(400).json({ error: `No se encontró la tarjeta de referencia "${refId}" en esa columna.` })
      const columna = p.tareas.filter((t) => t.estado === estado && t.id !== tareaId).sort((a, b) => a.orden - b.orden)
      orden = antesDeTareaId ? ordenAntesDe(columna, ref) : ordenDespuesDe(columna, ref)
    } else {
      const columna = p.tareas.filter((t) => t.estado === estado && t.id !== tareaId)
      orden = ordenAlFinal(columna)
    }

    const data = { estado, orden }
    if (estado === 'completada' && tarea.estado !== 'completada') {
      data.completadaPor = usuario
      data.completadaEn = new Date()
    } else if (estado !== 'completada' && tarea.estado === 'completada') {
      data.completadaPor = null
      data.completadaEn = null
    }
    if (estado === 'en_proceso') data.asignadoA = usuario

    await prisma.tarea.update({ where: { id: tareaId }, data })

    const columnaLabel = { pendiente: 'Todo', en_proceso: 'Doing', revision: 'Revisión', completada: 'Done' }[estado]
    await logEntry(p.id, usuario, 'Tarjeta movida', `${tarea.titulo} → ${columnaLabel}`)
    if (data.estado === 'completada') await activarTareasClienteDisponibles(p.id)

    emitirCambio(p.id)
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// POST /api/proyectos/:slug/tareas/:tareaId/reordenar
// Reordena una tarea dentro de su misma fase (proyectos "finito"), sin
// tocar su estado — a diferencia de /mover, que reordena por columna
// Kanban (estado) en proyectos "continuo".
router.post('/:tareaId/reordenar', requireAuth, async (req, res) => {
  const { slug, tareaId } = req.params
  const { antesDeTareaId, despuesDeTareaId } = req.body

  try {
    const p = await getProyecto(slug)
    if (!p) return res.status(404).json({ error: 'Proyecto no encontrado' })

    const tarea = p.tareas.find((t) => t.id === tareaId)
    if (!tarea) return res.status(404).json({ error: 'Tarea no encontrada' })
    if (!tareaLeCorresponde(tarea, p.equipo, req.user)) {
      return res.status(403).json({ error: 'No tienes permiso para operar esta tarea' })
    }

    const refId = antesDeTareaId || despuesDeTareaId
    let orden
    if (refId) {
      const ref = p.tareas.find((t) => t.id === refId && t.fase === tarea.fase)
      if (!ref) return res.status(400).json({ error: `No se encontró la tarea de referencia "${refId}" en esa fase.` })
      const faseOrdenada = p.tareas.filter((t) => t.fase === tarea.fase && t.id !== tareaId).sort((a, b) => a.orden - b.orden)
      orden = antesDeTareaId ? ordenAntesDe(faseOrdenada, ref) : ordenDespuesDe(faseOrdenada, ref)
    } else {
      const faseSinTarea = p.tareas.filter((t) => t.fase === tarea.fase && t.id !== tareaId)
      orden = ordenAlFinal(faseSinTarea)
    }

    await prisma.tarea.update({ where: { id: tareaId }, data: { orden } })

    emitirCambio(p.id)
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// PUT /api/proyectos/:slug/tareas/:tareaId
router.put('/:tareaId', requireAuth, async (req, res) => {
  const { slug, tareaId } = req.params
  const usuario = req.user.nombre
  const campos = ['titulo', 'descripcion', 'queHacer', 'necesitasAntes', 'plantillaMensaje',
    'queEntregas', 'responsable', 'instruccionesCliente', 'plazoHoras',
    'esRutaCritica', 'soloKarlaOAdmin', 'esCliente', 'dependencias', 'avisosDesactivados']

  try {
    const p = await getProyecto(slug)
    if (!p) return res.status(404).json({ error: 'Proyecto no encontrado' })

    const data = {}
    campos.forEach((c) => { if (req.body[c] !== undefined) data[c] = req.body[c] })

    if (data.dependencias) {
      const idsProyecto = new Set(p.tareas.map((t) => t.id))
      const invalidos = data.dependencias.filter((id) => id === tareaId || !idsProyecto.has(id))
      if (invalidos.length > 0) {
        return res.status(400).json({ error: `Dependencias inválidas: ${invalidos.join(', ')}` })
      }
    }

    const tarea = await prisma.tarea.update({ where: { id: tareaId }, data })
    await logEntry(p.id, usuario, 'Tarea editada', tarea.titulo)
    await activarTareasClienteDisponibles(p.id)

    emitirCambio(p.id)
    res.json(tarea)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// POST /api/proyectos/:slug/tareas  (agregar tarea custom)
router.post('/', requireAuth, async (req, res) => {
  const { slug } = req.params
  const usuario = req.user.nombre

  try {
    const p = await getProyecto(slug)
    if (!p) return res.status(404).json({ error: 'Proyecto no encontrado' })

    const { fase, columna, titulo, descripcion, instruccionesCliente, responsable, esCliente, plazoHoras, dependencias } = req.body

    const nueva = await crearTareaCustom(p, { fase, columna, titulo, descripcion, instruccionesCliente, responsable, esCliente, plazoHoras, dependencias })
    await logEntry(p.id, usuario, 'Tarea agregada', nueva.titulo)

    emitirCambio(p.id)
    res.status(201).json(nueva)
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message })
    console.error(err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// DELETE /api/proyectos/:slug/tareas/:tareaId
router.delete('/:tareaId', requireAuth, async (req, res) => {
  const { slug, tareaId } = req.params
  const usuario = req.user.nombre

  try {
    const p = await getProyecto(slug)
    if (!p) return res.status(404).json({ error: 'Proyecto no encontrado' })

    const tarea = await prisma.tarea.findFirst({ where: { id: tareaId, proyectoId: p.id } })
    if (!tarea) return res.status(404).json({ error: 'Tarea no encontrada' })
    if (!tarea.custom) return res.status(400).json({ error: 'Solo se pueden eliminar tareas personalizadas' })

    await prisma.tarea.delete({ where: { id: tareaId } })
    await logEntry(p.id, usuario, 'Tarea eliminada', tarea.titulo)

    emitirCambio(p.id)
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Error interno' })
  }
})

export default router
