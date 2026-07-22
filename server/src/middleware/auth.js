import { timingSafeEqual } from 'crypto'
import { verificarToken } from '../lib/jwt.js'

export function requireAuth(req, res, next) {
  const token = req.cookies?.token
  if (!token) return res.status(401).json({ error: 'No autenticado' })
  try {
    req.user = verificarToken(token)
    next()
  } catch {
    res.status(401).json({ error: 'Sesión expirada' })
  }
}

export function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.rol !== 'ADMIN') return res.status(403).json({ error: 'Solo Admin' })
    next()
  })
}

export function requireApiKey(req, res, next) {
  const header = req.headers.authorization || ''
  const [scheme, token] = header.split(' ')
  const expected = process.env.MCP_API_KEY

  if (scheme !== 'Bearer' || !token || !expected) return res.status(401).json({ error: 'No autenticado' })

  const a = Buffer.from(token)
  const b = Buffer.from(expected)
  const valido = a.length === b.length && timingSafeEqual(a, b)
  if (!valido) return res.status(401).json({ error: 'No autenticado' })

  next()
}

export function requireClienteToken(req, res, next) {
  const token = req.cookies?.clienteToken
  if (!token) return res.status(401).json({ error: 'No autenticado' })
  try {
    const payload = verificarToken(token)
    if (payload.tipo !== 'cliente') return res.status(401).json({ error: 'Token inválido' })
    req.clienteProyectoId = payload.proyectoId
    next()
  } catch {
    res.status(401).json({ error: 'Sesión expirada' })
  }
}
