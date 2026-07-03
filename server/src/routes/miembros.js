import { Router } from 'express'
import bcrypt from 'bcryptjs'
import prisma from '../lib/prisma.js'
import { requireAdmin, requireAuth } from '../middleware/auth.js'

const router = Router()

// GET /api/miembros
router.get('/', requireAuth, async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, email: true, nombre: true, rol: true, esKarla: true, activo: true },
      orderBy: { nombre: 'asc' },
    })
    res.json(users)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// POST /api/miembros
router.post('/', requireAdmin, async (req, res) => {
  const { email, password, nombre, rol, esKarla } = req.body
  if (!email || !password || !nombre) return res.status(400).json({ error: 'email, password y nombre son requeridos' })

  try {
    const hash = await bcrypt.hash(password, 12)
    const user = await prisma.user.create({
      data: { email: email.toLowerCase().trim(), password: hash, nombre, rol: rol || 'EQUIPO', esKarla: esKarla || false },
      select: { id: true, email: true, nombre: true, rol: true, esKarla: true, activo: true },
    })
    res.status(201).json(user)
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'El email ya está registrado' })
    console.error(err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// PUT /api/miembros/:id
router.put('/:id', requireAdmin, async (req, res) => {
  const { nombre, email, rol, esKarla, activo, password } = req.body
  try {
    const data = {}
    if (nombre !== undefined) data.nombre = nombre
    if (email !== undefined) data.email = email.toLowerCase().trim()
    if (rol !== undefined) data.rol = rol
    if (esKarla !== undefined) data.esKarla = esKarla
    if (activo !== undefined) data.activo = activo
    if (password) data.password = await bcrypt.hash(password, 12)

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data,
      select: { id: true, email: true, nombre: true, rol: true, esKarla: true, activo: true },
    })
    res.json(user)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// DELETE /api/miembros/:id
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    await prisma.user.update({ where: { id: req.params.id }, data: { activo: false } })
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Error interno' })
  }
})

export default router
