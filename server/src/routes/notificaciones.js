import { Router } from 'express'
import prisma from '../lib/prisma.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

// GET /api/notificaciones?leida=true|false&limit=20&antesDe=<ISO>
router.get('/', requireAuth, async (req, res) => {
  const { leida, limit, antesDe } = req.query
  const where = { destinatarioId: req.user.id }
  if (leida === 'true') where.leida = true
  if (leida === 'false') where.leida = false
  if (antesDe) where.creadaEn = { lt: new Date(antesDe) }

  const notificaciones = await prisma.notificacion.findMany({
    where,
    orderBy: { creadaEn: 'desc' },
    take: Math.min(Number(limit) || 20, 100),
  })
  res.json(notificaciones)
})

// GET /api/notificaciones/no-leidas — solo el contador, para pintar el badge al cargar la app
router.get('/no-leidas', requireAuth, async (req, res) => {
  const total = await prisma.notificacion.count({ where: { destinatarioId: req.user.id, leida: false } })
  res.json({ total })
})

// POST /api/notificaciones/:id/leida
router.post('/:id/leida', requireAuth, async (req, res) => {
  const n = await prisma.notificacion.findFirst({ where: { id: req.params.id, destinatarioId: req.user.id } })
  if (!n) return res.status(404).json({ error: 'No encontrada' })
  await prisma.notificacion.update({ where: { id: n.id }, data: { leida: true, leidaEn: new Date() } })
  res.json({ ok: true })
})

// POST /api/notificaciones/marcar-todas-leidas
router.post('/marcar-todas-leidas', requireAuth, async (req, res) => {
  await prisma.notificacion.updateMany({
    where: { destinatarioId: req.user.id, leida: false },
    data: { leida: true, leidaEn: new Date() },
  })
  res.json({ ok: true })
})

export default router
