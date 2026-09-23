import { Router } from 'express'
import prisma from '../lib/prisma.js'
import { requireAuth } from '../middleware/auth.js'
import { emitirCambio } from '../lib/eventos.js'
import { notificarMencion } from '../lib/notificaciones.js'
import { crearNotificacion } from '../lib/notificacionesHelper.js'
import { destinatariosDeTarea } from '../lib/tareaHelpers.js'

const router = Router({ mergeParams: true })

async function getProyecto(slug) {
  return prisma.proyecto.findFirst({
    where: { OR: [{ slug }, { id: slug }] },
    include: { tareas: true },
  })
}

// GET /api/proyectos/:slug/tareas/:tareaId/comentarios
router.get('/', requireAuth, async (req, res) => {
  const { slug, tareaId } = req.params
  try {
    const p = await getProyecto(slug)
    if (!p) return res.status(404).json({ error: 'Proyecto no encontrado' })
    if (!p.tareas.some((t) => t.id === tareaId)) return res.status(404).json({ error: 'Tarea no encontrada' })

    const comentarios = await prisma.comentario.findMany({ where: { tareaId }, orderBy: { creadoEn: 'asc' } })
    res.json(comentarios)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// POST /api/proyectos/:slug/tareas/:tareaId/comentarios
// Comentario interno sobre una actividad — nunca visible para el cliente.
// `mencionados` (opcional) trae userIds ya resueltos por el picker del frontend.
router.post('/', requireAuth, async (req, res) => {
  const { slug, tareaId } = req.params
  const texto = req.body?.texto?.trim()
  const mencionados = Array.isArray(req.body?.mencionados) ? req.body.mencionados : []

  if (!texto) return res.status(400).json({ error: 'El comentario no puede estar vacío' })

  try {
    const p = await getProyecto(slug)
    if (!p) return res.status(404).json({ error: 'Proyecto no encontrado' })
    const tarea = p.tareas.find((t) => t.id === tareaId)
    if (!tarea) return res.status(404).json({ error: 'Tarea no encontrada' })

    const comentario = await prisma.comentario.create({
      data: { tareaId, autor: req.user.nombre, autorId: req.user.id, texto, mencionados },
    })

    if (mencionados.length) {
      const usuarios = await prisma.user.findMany({
        where: { id: { in: mencionados }, activo: true },
        select: { id: true, email: true, nombre: true, rol: true },
      })
      notificarMencion(p, tarea, req.user.nombre, texto, usuarios).catch((err) => {
        console.error('Error notificando mención:', err)
      })
      await crearNotificacion({
        destinatarioIds: usuarios.map((u) => u.id),
        tipo: 'tarea_mencion',
        mensaje: `${req.user.nombre} te mencionó en "${tarea.titulo}"`,
        actor: req.user,
        proyecto: p,
        tarea,
        comentarioId: comentario.id,
      })
    }

    const destinatariosComentario = (await destinatariosDeTarea(tarea, p.equipo)).filter((id) => !mencionados.includes(id))
    await crearNotificacion({
      destinatarioIds: destinatariosComentario,
      tipo: 'tarea_comentario',
      mensaje: `${req.user.nombre} comentó en "${tarea.titulo}"`,
      actor: req.user,
      proyecto: p,
      tarea,
      comentarioId: comentario.id,
    })

    emitirCambio(p.id)
    res.status(201).json(comentario)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Error interno' })
  }
})

export default router
