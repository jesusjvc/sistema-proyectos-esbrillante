import { timingSafeEqual } from 'crypto'
import { verificarToken } from '../lib/jwt.js'
import { baseUrl } from '../lib/baseUrl.js'
import prisma from '../lib/prisma.js'

const IDENTIDAD_MCP_COMPARTIDA = { id: 'mcp', email: 'mcp@esbrillante.mx', nombre: 'Claude Code (MCP)', rol: 'ADMIN', esKarla: false }

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

export function esApiKeyValida(token) {
  const expected = process.env.MCP_API_KEY
  if (!token || !expected) return false

  const a = Buffer.from(token)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

function tieneApiKeyValida(req) {
  const header = req.headers.authorization || ''
  const [scheme, token] = header.split(' ')
  return scheme === 'Bearer' && esApiKeyValida(token)
}

// Acepta el API key compartido directo (Claude Code/Desktop con config
// estática — queda con la identidad genérica "mcp", equivalente a Admin), o
// un access token emitido por el flujo OAuth de /oauth (usado por conectores
// tipo claude.ai/Cowork). El OAuth queda ligado a la persona que inició
// sesión con SU cuenta en /oauth/authorize, así que aquí resolvemos su
// identidad real desde la base — necesario para que el sistema de permisos
// por proyecto (lib/permisos.js) sepa quién es quién.
export async function requireMcpAuth(req, res, next) {
  const header = req.headers.authorization || ''
  const [scheme, token] = header.split(' ')

  if (scheme === 'Bearer' && token) {
    if (esApiKeyValida(token)) {
      req.user = IDENTIDAD_MCP_COMPARTIDA
      return next()
    }
    try {
      const payload = verificarToken(token)
      if (payload.tipo === 'mcp_oauth') {
        const user = await prisma.user.findUnique({ where: { id: payload.userId } })
        if (user && user.activo) {
          req.user = { id: user.id, email: user.email, nombre: user.nombre, rol: user.rol, esKarla: user.esKarla }
          return next()
        }
      }
    } catch {
      // Token inválido/expirado: cae al 401 de abajo.
    }
  }

  res.set('WWW-Authenticate', `Bearer resource_metadata="${baseUrl(req)}/.well-known/oauth-protected-resource"`)
  res.status(401).json({ error: 'No autenticado' })
}

// Acepta la API key del MCP (rol equivalente a Admin) o, si no viene, cae a la sesión de Admin normal.
export function requireAdminOrApiKey(req, res, next) {
  if (tieneApiKeyValida(req)) {
    req.user = IDENTIDAD_MCP_COMPARTIDA
    return next()
  }
  requireAdmin(req, res, next)
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

// Permite ver la página de estado del cliente sin contraseña si ya hay una sesión
// de Admin o Equipo activa (cookie "token"). Si no, exige el login normal de cliente.
export function requireClienteAcceso(req, res, next) {
  const staffToken = req.cookies?.token
  if (staffToken) {
    try {
      const payload = verificarToken(staffToken)
      if (payload.rol === 'ADMIN' || payload.rol === 'EQUIPO') {
        req.esStaff = true
        return next()
      }
    } catch {
      // Token de staff inválido o expirado: seguimos con el flujo de cliente normal.
    }
  }
  requireClienteToken(req, res, next)
}
