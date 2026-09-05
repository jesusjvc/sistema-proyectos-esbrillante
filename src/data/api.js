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
export const actualizarMiAvatar = (avatarUrl) => req('PUT', '/api/auth/me/avatar', { avatarUrl })
export const eliminarMiAvatar = () => req('DELETE', '/api/auth/me/avatar')
export const actualizarMisHabilidades = (habilidades) => req('PUT', '/api/auth/me/habilidades', { habilidades })

// ─── Proyectos ─────────────────────────────────────────────────────────────
export const getProyectos = () => req('GET', '/api/proyectos')
export const getProyecto = (slug) => req('GET', `/api/proyectos/${slug}`)
export const crearProyecto = (data) => req('POST', '/api/proyectos', data)
export const eliminarProyecto = (slug) => req('DELETE', `/api/proyectos/${slug}`)
export const actualizarLinks = (slug, links) => req('PUT', `/api/proyectos/${slug}/links`, links)
export const crearCarpetaDriveProyecto = (slug) => req('POST', `/api/proyectos/${slug}/drive`)
export const actualizarDescripcion = (slug, descripcion) => req('PUT', `/api/proyectos/${slug}/descripcion`, { descripcion })
export const confirmarAnticipo = (slug) => req('POST', `/api/proyectos/${slug}/anticipo`)
export const iniciarPausa = (slug, fase) => req('POST', `/api/proyectos/${slug}/pausa`, { fase })
export const terminarPausa = (slug) => req('DELETE', `/api/proyectos/${slug}/pausa`)
export const cerrarProyecto = (slug) => req('POST', `/api/proyectos/${slug}/cerrar`)
export const cambiarTipoProyecto = (slug, tipo) => req('PUT', `/api/proyectos/${slug}/tipo`, { tipo })
export const actualizarEquipoProyecto = (slug, equipo) => req('PUT', `/api/proyectos/${slug}/equipo`, { equipo })
export const marcarVisto = (slug) => req('POST', `/api/proyectos/${slug}/marcar-visto`)
export const regenerarPasswordCliente = (slug) => req('POST', `/api/proyectos/${slug}/regenerar-password`)
export const actualizarAreasProyecto = (slug, areas) => req('PUT', `/api/proyectos/${slug}/areas`, { areas })

// ─── Tareas ────────────────────────────────────────────────────────────────
export const iniciarTarea = (slug, tareaId) => req('POST', `/api/proyectos/${slug}/tareas/${tareaId}/iniciar`)
export const completarTarea = (slug, tareaId) => req('POST', `/api/proyectos/${slug}/tareas/${tareaId}/completar`)
export const reabrirTarea = (slug, tareaId) => req('POST', `/api/proyectos/${slug}/tareas/${tareaId}/reabrir`)
export const omitirTarea = (slug, tareaId) => req('POST', `/api/proyectos/${slug}/tareas/${tareaId}/omitir`)
export const editarTarea = (slug, tareaId, data) => req('PUT', `/api/proyectos/${slug}/tareas/${tareaId}`, data)
export const moverTarea = (slug, tareaId, data) => req('POST', `/api/proyectos/${slug}/tareas/${tareaId}/mover`, data)
export const reordenarTarea = (slug, tareaId, data) => req('POST', `/api/proyectos/${slug}/tareas/${tareaId}/reordenar`, data)
export const agregarTarea = (slug, data) => req('POST', `/api/proyectos/${slug}/tareas`, data)
export const eliminarTarea = (slug, tareaId) => req('DELETE', `/api/proyectos/${slug}/tareas/${tareaId}`)
export const listarComentarios = (slug, tareaId) => req('GET', `/api/proyectos/${slug}/tareas/${tareaId}/comentarios`)
export const crearComentario = (slug, tareaId, data) => req('POST', `/api/proyectos/${slug}/tareas/${tareaId}/comentarios`, data)

// ─── Solicitudes ───────────────────────────────────────────────────────────
export const aprobarSolicitud = (slug, id, data) => req('POST', `/api/proyectos/${slug}/solicitudes/${id}/aprobar`, data)
export const rechazarSolicitud = (slug, id, motivo) => req('POST', `/api/proyectos/${slug}/solicitudes/${id}/rechazar`, { motivo })

// ─── Prototipos (esbrillante-pages-mcp) ──────────────────────────────────────
export const getPrototipos = () => req('GET', '/api/prototipos')
export const crearPrototipo = (data) => req('POST', '/api/prototipos', data)
export const actualizarPrototipo = (slug, data) => req('PATCH', `/api/prototipos/${slug}`, data)
export const eliminarPrototipo = (slug) => req('DELETE', `/api/prototipos/${slug}`)

// ─── Plantillas ────────────────────────────────────────────────────────────
export const getPlantillasApi = () => req('GET', '/api/plantillas')
export const getPlantillaApi = (id) => req('GET', `/api/plantillas/${id}`)
export const crearPlantillaApi = (data) => req('POST', '/api/plantillas', data)
export const actualizarPlantillaApi = (id, data) => req('PUT', `/api/plantillas/${id}`, data)
export const eliminarPlantillaApi = (id) => req('DELETE', `/api/plantillas/${id}`)
export const agregarTareaPlantillaApi = (plantillaId, data) => req('POST', `/api/plantillas/${plantillaId}/tareas`, data)
export const editarTareaPlantillaApi = (plantillaId, tareaId, data) => req('PUT', `/api/plantillas/${plantillaId}/tareas/${tareaId}`, data)
export const eliminarTareaPlantillaApi = (plantillaId, tareaId) => req('DELETE', `/api/plantillas/${plantillaId}/tareas/${tareaId}`)
export const materializarPlantilla = (plantillaId, condicionesTecnicas, extras) => req('POST', `/api/plantillas/${plantillaId}/materializar`, { condicionesTecnicas, extras })

// ─── Miembros ──────────────────────────────────────────────────────────────
export const getMiembros = () => req('GET', '/api/miembros')
export const crearMiembro = (data) => req('POST', '/api/miembros', data)
export const editarMiembro = (id, data) => req('PUT', `/api/miembros/${id}`, data)
export const eliminarMiembro = (id) => req('DELETE', `/api/miembros/${id}`)

// ─── Cliente ───────────────────────────────────────────────────────────────
export const loginCliente = (slug, password) => req('POST', '/api/cliente/login', { slug, password })
export const getProyectoCliente = (slug) => req('GET', `/api/cliente/${slug}`)
export const logoutCliente = () => req('POST', '/api/cliente/logout')
// titulo es obligatorio; descripcion y archivo son opcionales
export async function crearSolicitudCliente(slug, { titulo, descripcion, archivo } = {}) {
  const form = new FormData()
  form.append('titulo', titulo)
  if (descripcion) form.append('descripcion', descripcion)
  if (archivo) form.append('archivo', archivo)

  const res = await fetch(`${BASE}/api/cliente/${slug}/solicitudes`, {
    method: 'POST',
    credentials: 'include',
    body: form,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const error = new Error(err.error || `Error ${res.status}`)
    error.status = res.status
    throw error
  }
  return res.json()
}

// texto y/o archivo son opcionales — completar sin ninguno equivale al "Ya lo hice" simple
export async function completarTareaCliente(slug, tareaId, { texto, archivo } = {}) {
  const form = new FormData()
  if (texto) form.append('respuestaTexto', texto)
  if (archivo) form.append('archivo', archivo)

  const res = await fetch(`${BASE}/api/cliente/${slug}/tareas/${tareaId}/completar`, {
    method: 'POST',
    credentials: 'include',
    body: form,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const error = new Error(err.error || `Error ${res.status}`)
    error.status = res.status
    throw error
  }
  return res.json()
}
