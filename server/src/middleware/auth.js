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
