import { Router } from 'express'
import bcrypt from 'bcryptjs'
import prisma from '../lib/prisma.js'
import { requireAdmin, requireAuth, requireAuthOrApiKey, requireAdminOrApiKey } from '../middleware/auth.js'

const router = Router()

const AREAS_VALIDAS = ['web', 'diseno_grafico', 'redes_sociales']

// GET /api/miembros
router.get('/', requireAuthOrApiKey, async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, email: true, nombre: true, rol: true, esKarla: true, area: true, activo: true, avatarUrl: true, habilidades: true },
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
  const { email, password, nombre, rol, esKarla, area, habilidades } = req.body
  if (!email || !password || !nombre) return res.status(400).json({ error: 'email, password y nombre son requeridos' })
  if (area && !AREAS_VALIDAS.includes(area)) return res.status(400).json({ error: `area inválida — valores permitidos: ${AREAS_VALIDAS.join(', ')}` })

  try {
    const hash = await bcrypt.hash(password, 12)
    const user = await prisma.user.create({
      data: { email: email.toLowerCase().trim(), password: hash, nombre, rol: rol || 'EQUIPO', esKarla: esKarla || false, area: area || null, habilidades: Array.isArray(habilidades) ? habilidades : [] },
      select: { id: true, email: true, nombre: true, rol: true, esKarla: true, area: true, activo: true, avatarUrl: true, habilidades: true },
    })
    res.status(201).json(user)
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'El email ya está registrado' })
    console.error(err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// PUT /api/miembros/:id
router.put('/:id', requireAdminOrApiKey, async (req, res) => {
  const { nombre, email, rol, esKarla, area, activo, password, habilidades, avatarUrl } = req.body
  if (area && !AREAS_VALIDAS.includes(area)) return res.status(400).json({ error: `area inválida — valores permitidos: ${AREAS_VALIDAS.join(', ')}` })
  try {
    const data = {}
    if (nombre !== undefined) data.nombre = nombre
    if (email !== undefined) data.email = email.toLowerCase().trim()
    if (rol !== undefined) data.rol = rol
    if (esKarla !== undefined) data.esKarla = esKarla
    if (area !== undefined) data.area = area || null
    if (activo !== undefined) data.activo = activo
    if (password) data.password = await bcrypt.hash(password, 12)
    if (habilidades !== undefined) data.habilidades = Array.isArray(habilidades) ? habilidades : []
    // Misma validación que PUT /api/auth/me/avatar: data URL de imagen,
    // ya redimensionada en el cliente, con tope de peso.
    if (avatarUrl !== undefined) {
      if (avatarUrl === null) {
        data.avatarUrl = null
      } else if (typeof avatarUrl !== 'string' || !avatarUrl.startsWith('data:image/')) {
        return res.status(400).json({ error: 'Imagen inválida' })
      } else if (avatarUrl.length > 700_000) {
        return res.status(413).json({ error: 'La imagen es demasiado pesada' })
      } else {
        data.avatarUrl = avatarUrl
      }
    }

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data,
      select: { id: true, email: true, nombre: true, rol: true, esKarla: true, area: true, activo: true, avatarUrl: true, habilidades: true },
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
