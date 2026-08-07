import { Router } from 'express'
import prisma from '../lib/prisma.js'
import { requireAuth } from '../middleware/auth.js'
import { emitirCambio } from '../lib/eventos.js'
import { crearTareaCustom } from '../lib/tareaHelpers.js'

const router = Router({ mergeParams: true })

async function getProyecto(slug) {
  return prisma.proyecto.findFirst({
    where: { OR: [{ slug }, { id: slug }] },
    include: { tareas: true },
  })
}

async function logEntry(proyectoId, usuario, accion, detalle = '') {
  return prisma.logEntry.create({ data: { proyectoId, usuario, accion, detalle } })
}

// POST /api/proyectos/:slug/solicitudes/:id/aprobar
// Admin o Equipo aprueban una solicitud del cliente: se convierte en una
// tarea real del proyecto (ver server/src/lib/tareaHelpers.js).
router.post('/:id/aprobar', requireAuth, async (req, res) => {
  const { slug, id } = req.params
  const { fase, columna, responsable, dependencias } = req.body
  const usuario = req.user.nombre

  try {
    const p = await getProyecto(slug)
    if (!p) return res.status(404).json({ error: 'Proyecto no encontrado' })

    const solicitud = await prisma.solicitud.findFirst({ where: { id, proyectoId: p.id } })
    if (!solicitud) return res.status(404).json({ error: 'Solicitud no encontrada' })
    if (solicitud.estado !== 'pendiente') return res.status(400).json({ error: 'Esta solicitud ya fue resuelta' })

    const nueva = await crearTareaCustom(p, {
      fase,
      columna,
      titulo: solicitud.titulo,
      descripcion: solicitud.descripcion,
      responsable,
      esCliente: false,
      dependencias,
    })

    const actualizada = await prisma.solicitud.update({
      where: { id },
      data: { estado: 'aprobada', tareaId: nueva.id, resueltaPor: usuario, resueltaEn: new Date() },
    })
    await logEntry(p.id, usuario, 'Solicitud aprobada', solicitud.titulo)

    emitirCambio(p.id)
    res.json(actualizada)
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message })
    console.error(err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// POST /api/proyectos/:slug/solicitudes/:id/rechazar
router.post('/:id/rechazar', requireAuth, async (req, res) => {
  const { slug, id } = req.params
  const motivo = req.body?.motivo?.trim()
  const usuario = req.user.nombre

  if (!motivo) return res.status(400).json({ error: 'El motivo de rechazo es obligatorio' })

  try {
    const p = await getProyecto(slug)
    if (!p) return res.status(404).json({ error: 'Proyecto no encontrado' })

    const solicitud = await prisma.solicitud.findFirst({ where: { id, proyectoId: p.id } })
    if (!solicitud) return res.status(404).json({ error: 'Solicitud no encontrada' })
    if (solicitud.estado !== 'pendiente') return res.status(400).json({ error: 'Esta solicitud ya fue resuelta' })

    const actualizada = await prisma.solicitud.update({
      where: { id },
      data: { estado: 'rechazada', motivoRechazo: motivo, resueltaPor: usuario, resueltaEn: new Date() },
    })
    await logEntry(p.id, usuario, 'Solicitud rechazada', `${solicitud.titulo} — ${motivo}`)

    emitirCambio(p.id)
    res.json(actualizada)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Error interno' })
  }
})

export default router
