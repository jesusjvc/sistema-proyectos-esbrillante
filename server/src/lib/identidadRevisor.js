import { verificarToken } from './jwt.js'

// Identidad de quien revisa un prototipo, resuelta desde la sesión real de
// Foco (cookie "token" de requireAuth) en vez del nombre plano por query
// param que usaba el sistema viejo — ese quedaba congelado en el link
// copiado, así que compartirlo o reabrirlo atribuía los comentarios a quien
// lo generó, no a quien realmente estaba revisando.
//
// Devuelve null si no hay sesión de staff activa (cookie ausente, inválida,
// expirada, o de un cliente) — en ese caso el widget cae al flujo actual de
// pedir el nombre una vez y cachearlo en su propio localStorage, que no
// cambia con esta migración.
export function resolverIdentidadRevisor(req) {
  const token = req.cookies?.token
  if (!token) return null
  try {
    const payload = verificarToken(token)
    if (payload.rol !== 'ADMIN' && payload.rol !== 'EQUIPO') return null
    return { userId: payload.id, nombre: payload.nombre, rol: 'equipo' }
  } catch {
    return null
  }
}
