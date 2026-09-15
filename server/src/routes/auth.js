import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { OAuth2Client } from 'google-auth-library'
import prisma from '../lib/prisma.js'
import { firmarToken, setCookie, clearCookie } from '../lib/jwt.js'
import { requireAuth } from '../middleware/auth.js'
import { generarApiKey } from '../lib/apiKeys.js'

const router = Router()
const googleClient = process.env.GOOGLE_CLIENT_ID ? new OAuth2Client(process.env.GOOGLE_CLIENT_ID) : null

// Firma la cookie de sesión y arma la respuesta — compartido entre login con
// correo/contraseña y login con Google, ambos terminan en la misma sesión.
function iniciarSesion(res, user) {
  const token = firmarToken({
    id: user.id,
    email: user.email,
    nombre: user.nombre,
    rol: user.rol,
    esKarla: user.esKarla,
  })
  setCookie(res, token)
  res.json({ id: user.id, email: user.email, nombre: user.nombre, rol: user.rol, esKarla: user.esKarla, area: user.area })
}

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body
  if (!email || !password) return res.status(400).json({ error: 'Email y contraseña requeridos' })

  try {
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } })
    if (!user || !user.activo) return res.status(401).json({ error: 'Credenciales incorrectas' })

    const ok = await bcrypt.compare(password, user.password)
    if (!ok) return res.status(401).json({ error: 'Credenciales incorrectas' })

    iniciarSesion(res, user)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// POST /api/auth/google — login con Google Identity Services. No da de alta
// cuentas nuevas: el correo verificado por Google debe coincidir con un User
// ya existente y activo (los da de alta un admin en /admin/equipo, igual que
// siempre). No se restringe por dominio (hd) — el control real es este match.
router.post('/google', async (req, res) => {
  if (!googleClient) return res.status(503).json({ error: 'Login con Google no está configurado' })

  const { credential } = req.body
  if (!credential) return res.status(400).json({ error: 'Falta el credential de Google' })

  try {
    const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: process.env.GOOGLE_CLIENT_ID })
    const payload = ticket.getPayload()
    if (!payload?.email || !payload.email_verified) {
      return res.status(401).json({ error: 'No se pudo verificar el correo de Google' })
    }

    const user = await prisma.user.findUnique({ where: { email: payload.email.toLowerCase().trim() } })
    if (!user || !user.activo) {
      return res.status(401).json({ error: 'No hay una cuenta con ese correo — pide a un admin que te dé de alta primero.' })
    }

    iniciarSesion(res, user)
  } catch (err) {
    console.error('Login con Google:', err)
    res.status(401).json({ error: 'No se pudo verificar la sesión de Google' })
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

// GET /api/auth/me/api-keys — nunca incluye el hash ni el token completo.
router.get('/me/api-keys', requireAuth, async (req, res) => {
  try {
    const keys = await prisma.apiKey.findMany({
      where: { userId: req.user.id },
      select: { id: true, nombre: true, prefijo: true, creadaEn: true, ultimoUso: true, revocadaEn: true },
      orderBy: { creadaEn: 'desc' },
    })
    res.json(keys)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// POST /api/auth/me/api-keys — el token completo solo se devuelve aquí, una vez.
router.post('/me/api-keys', requireAuth, async (req, res) => {
  const nombre = typeof req.body?.nombre === 'string' ? req.body.nombre.trim().slice(0, 60) : ''

  try {
    const { token, hash, prefijo } = generarApiKey()
    const key = await prisma.apiKey.create({
      data: { userId: req.user.id, nombre, prefijo, hash },
      select: { id: true, nombre: true, prefijo: true, creadaEn: true },
    })
    res.status(201).json({ ...key, token })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// DELETE /api/auth/me/api-keys/:id — solo revoca keys propias.
router.delete('/me/api-keys/:id', requireAuth, async (req, res) => {
  try {
    const { count } = await prisma.apiKey.updateMany({
      where: { id: req.params.id, userId: req.user.id, revocadaEn: null },
      data: { revocadaEn: new Date() },
    })
    if (!count) return res.status(404).json({ error: 'Key no encontrada' })
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Error interno' })
  }
})

export default router
