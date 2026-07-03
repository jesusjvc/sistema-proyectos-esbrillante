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
    res.json({ id: user.id, email: user.email, nombre: user.nombre, rol: user.rol, esKarla: user.esKarla })
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
router.get('/me', requireAuth, (req, res) => {
  res.json(req.user)
})

export default router
