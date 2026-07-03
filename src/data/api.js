const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001'

async function req(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const error = new Error(err.error || `Error ${res.status}`)
    error.status = res.status
    throw error
  }
  return res.json()
}

// ─── Auth ──────────────────────────────────────────────────────────────────
export const login = (email, password) => req('POST', '/api/auth/login', { email, password })
export const logout = () => req('POST', '/api/auth/logout')
export const getMe = () => req('GET', '/api/auth/me')

// ─── Proyectos ─────────────────────────────────────────────────────────────
export const getProyectos = () => req('GET', '/api/proyectos')
export const getProyecto = (slug) => req('GET', `/api/proyectos/${slug}`)
export const crearProyecto = (data) => req('POST', '/api/proyectos', data)
export const eliminarProyecto = (slug) => req('DELETE', `/api/proyectos/${slug}`)
export const actualizarLinks = (slug, links) => req('PUT', `/api/proyectos/${slug}/links`, links)
export const confirmarAnticipo = (slug) => req('POST', `/api/proyectos/${slug}/anticipo`)
export const iniciarPausa = (slug, fase) => req('POST', `/api/proyectos/${slug}/pausa`, { fase })
export const terminarPausa = (slug) => req('DELETE', `/api/proyectos/${slug}/pausa`)
export const cerrarProyecto = (slug) => req('POST', `/api/proyectos/${slug}/cerrar`)

// ─── Tareas ────────────────────────────────────────────────────────────────
export const completarTarea = (slug, tareaId) => req('POST', `/api/proyectos/${slug}/tareas/${tareaId}/completar`)
export const reabrirTarea = (slug, tareaId) => req('POST', `/api/proyectos/${slug}/tareas/${tareaId}/reabrir`)
export const omitirTarea = (slug, tareaId) => req('POST', `/api/proyectos/${slug}/tareas/${tareaId}/omitir`)
export const editarTarea = (slug, tareaId, data) => req('PUT', `/api/proyectos/${slug}/tareas/${tareaId}`, data)
export const agregarTarea = (slug, data) => req('POST', `/api/proyectos/${slug}/tareas`, data)
export const eliminarTarea = (slug, tareaId) => req('DELETE', `/api/proyectos/${slug}/tareas/${tareaId}`)

// ─── Miembros ──────────────────────────────────────────────────────────────
export const getMiembros = () => req('GET', '/api/miembros')
export const crearMiembro = (data) => req('POST', '/api/miembros', data)
export const editarMiembro = (id, data) => req('PUT', `/api/miembros/${id}`, data)
export const eliminarMiembro = (id) => req('DELETE', `/api/miembros/${id}`)

// ─── Cliente ───────────────────────────────────────────────────────────────
export const loginCliente = (slug, password) => req('POST', '/api/cliente/login', { slug, password })
export const getProyectoCliente = (slug) => req('GET', `/api/cliente/${slug}`)
export const completarTareaCliente = (slug, tareaId) => req('POST', `/api/cliente/${slug}/tareas/${tareaId}/completar`)
export const logoutCliente = () => req('POST', '/api/cliente/logout')
