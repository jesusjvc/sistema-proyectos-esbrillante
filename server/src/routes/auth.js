import { Router } from 'express'
import bcrypt from 'bcryptjs'
import prisma from '../lib/prisma.js'
import { firmarToken, setCookie, clearCookie } from '../lib/jwt.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body
  if (!email || !password) return res.status(400).json({ error: 'Email y contraseña requeridos' })

  try {
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } })
    if (!user || !user.activo) return res.status(401).json({ error: 'Credenciales incorrectas' })

    const ok = await bcrypt.compare(password, user.password)
    if (!ok) return res.status(401).json({ error: 'Credenciales incorrectas' })

    const token = firmarToken({
      id: user.id,
      email: user.email,
      nombre: user.nombre,
      rol: user.rol,
      esKarla: user.esKarla,
    })

    setCookie(res, token)
    res.json({ id: user.id, email: user.email, nombre: user.nombre, rol: user.rol, esKarla: user.esKarla, area: user.area })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  clearCookie(res)
  res.json({ ok: true })
})

// GET /api/auth/me
router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, email: true, nombre: true, rol: true, esKarla: true, area: true, avatarUrl: true },
    })
    if (!user) return res.status(401).json({ error: 'Sesión inválida' })
    res.json(user)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// PUT /api/auth/me/habilidades — el usuario edita sus propias etiquetas de
// habilidad (lista plana, sin niveles ni jerarquía — ver docs/plan-foco.md 2.4).
router.put('/me/habilidades', requireAuth, async (req, res) => {
  const { habilidades } = req.body
  if (!Array.isArray(habilidades) || habilidades.some((h) => typeof h !== 'string')) {
    return res.status(400).json({ error: 'habilidades debe ser un array de texto' })
  }
  const limpio = [...new Set(habilidades.map((h) => h.trim()).filter(Boolean))].slice(0, 20).map((h) => h.slice(0, 40))

  try {
    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: { habilidades: limpio },
      select: { id: true, email: true, nombre: true, rol: true, esKarla: true, area: true, avatarUrl: true, habilidades: true },
    })
    res.json(user)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// PUT /api/auth/me/avatar — el usuario sube su propia foto de perfil como data URL
// (ya redimensionada/comprimida en el navegador antes de llegar aquí).
router.put('/me/avatar', requireAuth, async (req, res) => {
  const { avatarUrl } = req.body
  if (typeof avatarUrl !== 'string' || !avatarUrl.startsWith('data:image/')) {
    return res.status(400).json({ error: 'Imagen inválida' })
  }
  if (avatarUrl.length > 700_000) {
    return res.status(413).json({ error: 'La imagen es demasiado pesada' })
  }

  try {
    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: { avatarUrl },
      select: { id: true, email: true, nombre: true, rol: true, esKarla: true, area: true, avatarUrl: true },
    })
    res.json(user)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// DELETE /api/auth/me/avatar
router.delete('/me/avatar', requireAuth, async (req, res) => {
  try {
    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: { avatarUrl: null },
      select: { id: true, email: true, nombre: true, rol: true, esKarla: true, area: true, avatarUrl: true },
    })
    res.json(user)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Error interno' })
  }
})

export default router
