import { Router } from 'express'
import { randomUUID } from 'crypto'
import prisma from '../lib/prisma.js'
import { requireAuth, requireAdmin } from '../middleware/auth.js'
import { ordenAlFinal } from '../lib/orden.js'
import { emitirCambio } from '../lib/eventos.js'

const router = Router({ mergeParams: true })

async function getProyecto(slug) {
  return prisma.proyecto.findFirst({
    where: { OR: [{ slug }, { id: slug }] },
  })
}

async function logEntry(proyectoId, usuario, accion, detalle = '') {
  return prisma.logEntry.create({ data: { proyectoId, usuario, accion, detalle } })
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

    await prisma.tarea.update({
      where: { id: tareaId },
      data: { estado: 'completada', completadaPor: usuario, completadaEn: new Date() },
    })
    await logEntry(p.id, usuario, 'Tarea completada', tarea.titulo)

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

// PUT /api/proyectos/:slug/tareas/:tareaId
router.put('/:tareaId', requireAuth, async (req, res) => {
  const { slug, tareaId } = req.params
  const usuario = req.user.nombre
  const campos = ['titulo', 'descripcion', 'queHacer', 'necesitasAntes', 'plantillaMensaje',
    'queEntregas', 'responsable', 'instruccionesCliente', 'plazoHoras',
    'esRutaCritica', 'soloKarlaOAdmin', 'esCliente']

  try {
    const p = await getProyecto(slug)
    if (!p) return res.status(404).json({ error: 'Proyecto no encontrado' })

    const data = {}
    campos.forEach((c) => { if (req.body[c] !== undefined) data[c] = req.body[c] })

    const tarea = await prisma.tarea.update({ where: { id: tareaId }, data })
    await logEntry(p.id, usuario, 'Tarea editada', tarea.titulo)

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

    const { fase, titulo, descripcion, instruccionesCliente, responsable, esCliente, plazoHoras } = req.body
    const faseFinal = fase || 1
    const tareasFase = await prisma.tarea.findMany({ where: { proyectoId: p.id, fase: faseFinal } })

    const nueva = await prisma.tarea.create({
      data: {
        id: randomUUID(),
        proyectoId: p.id,
        fase: faseFinal,
        orden: ordenAlFinal(tareasFase),
        titulo,
        descripcion: descripcion || '',
        instruccionesCliente: instruccionesCliente || '',
        responsable: esCliente ? 'cliente' : (responsable || 'equipo'),
        esCliente: esCliente || false,
        plazoHoras: plazoHoras ? Number(plazoHoras) : null,
        dependencias: [],
        custom: true,
        estado: 'pendiente',
      },
    })
    await logEntry(p.id, usuario, 'Tarea agregada', nueva.titulo)

    emitirCambio(p.id)
    res.status(201).json(nueva)
  } catch (err) {
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
