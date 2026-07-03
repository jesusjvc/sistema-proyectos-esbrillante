import { copiarTareasDesde, getPlantilla, FASES_WEB } from './plantillas'

const KEY_PROYECTOS = 'esbrillante_proyectos'
const KEY_MIEMBROS = 'esbrillante_miembros'
const KEY_SESSION = 'esbrillante_session'

// ─── Utilidades ────────────────────────────────────────────────────────────

function uuid() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function generarSlug(nombre) {
  const base = nombre
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 22)
    .replace(/-+$/, '')
  const sufijo = Math.random().toString(36).slice(2, 6)
  return `${base}-${sufijo}`
}

function ahora() {
  return new Date().toISOString()
}

// ─── Sesión ────────────────────────────────────────────────────────────────

export function getSession() {
  try {
    return JSON.parse(sessionStorage.getItem(KEY_SESSION)) || null
  } catch {
    return null
  }
}

export function setSession(session) {
  sessionStorage.setItem(KEY_SESSION, JSON.stringify(session))
}

export function clearSession() {
  sessionStorage.removeItem(KEY_SESSION)
}

// ─── Proyectos ─────────────────────────────────────────────────────────────

export function getProyectos() {
  try {
    const proyectos = JSON.parse(localStorage.getItem(KEY_PROYECTOS)) || []
    let modificado = false
    proyectos.forEach((p) => {
      if (!p.slug) {
        p.slug = generarSlug(p.cliente.nombreComercial)
        modificado = true
      }
    })
    if (modificado) saveProyectos(proyectos)
    return proyectos
  } catch {
    return []
  }
}

export function getProyectoPorSlug(slug) {
  return getProyectos().find((p) => p.slug === slug || p.id === slug) || null
}

function saveProyectos(proyectos) {
  localStorage.setItem(KEY_PROYECTOS, JSON.stringify(proyectos))
}

export function getProyecto(id) {
  return getProyectos().find((p) => p.id === id) || null
}

export function crearProyecto(datos) {
  const plantilla = getPlantilla(datos.plantillaId)
  const tareas = copiarTareasDesde(datos.plantillaId, datos.condicionesTecnicas, datos.extras || [])

  const proyecto = {
    id: uuid(),
    creadoEn: ahora(),
    status: datos.anticipoConfirmado ? 'activo' : 'pendiente_anticipo',
    cliente: datos.cliente,
    proyecto: {
      paquete: datos.paquete,
      plantillaId: datos.plantillaId,
      fases: plantilla?.fases || FASES_WEB,
      extras: datos.extras || [],
      tareasOmitidas: [],
      fechaInicio: datos.fechaInicio,
      fechaEstimadaEntrega: datos.fechaEstimadaEntrega,
      anticipoConfirmado: datos.anticipoConfirmado,
      pagoFinalConfirmado: false,
    },
    condicionesTecnicas: datos.condicionesTecnicas,
    equipo: datos.equipo,
    slug: generarSlug(datos.cliente.nombreComercial),
    passwordCliente: datos.passwordCliente || generarPassword(),
    linksCliente: {
      drive: '',
      brief: '',
      boceto: '',
      diseno: '',
    },
    tareas,
    tiempos: {
      inicio: datos.anticipoConfirmado ? ahora() : null,
      cierre: null,
      pausas: [],
    },
    log: [
      {
        id: uuid(),
        fecha: ahora(),
        usuario: datos.creadoPor || 'Admin',
        accion: 'Proyecto creado',
        detalle: `Paquete: ${datos.paquete}`,
      },
    ],
  }

  const proyectos = getProyectos()
  proyectos.push(proyecto)
  saveProyectos(proyectos)
  return proyecto
}

export function actualizarLinksCliente(proyectoId, cambios) {
  const proyectos = getProyectos()
  const p = proyectos.find((p) => p.id === proyectoId)
  if (!p) return null
  p.linksCliente = { ...(p.linksCliente || {}), ...cambios }
  saveProyectos(proyectos)
  return p
}

export function actualizarProyecto(id, cambios) {
  const proyectos = getProyectos()
  const idx = proyectos.findIndex((p) => p.id === id)
  if (idx === -1) return null

  proyectos[idx] = { ...proyectos[idx], ...cambios }
  saveProyectos(proyectos)
  return proyectos[idx]
}

export function eliminarProyecto(id) {
  const proyectos = getProyectos().filter((p) => p.id !== id)
  saveProyectos(proyectos)
}

// ─── Tareas ────────────────────────────────────────────────────────────────

export function completarTarea(proyectoId, tareaId, usuario) {
  const proyectos = getProyectos()
  const p = proyectos.find((p) => p.id === proyectoId)
  if (!p) return null

  const tarea = p.tareas.find((t) => t.id === tareaId)
  if (!tarea) return null

  tarea.estado = 'completada'
  tarea.completadaPor = usuario
  tarea.completadaEn = ahora()

  p.log.push({
    id: uuid(),
    fecha: ahora(),
    usuario,
    accion: 'Tarea completada',
    detalle: tarea.titulo,
  })

  saveProyectos(proyectos)
  return p
}

export function reabrirTarea(proyectoId, tareaId, usuario) {
  const proyectos = getProyectos()
  const p = proyectos.find((p) => p.id === proyectoId)
  if (!p) return null

  const tarea = p.tareas.find((t) => t.id === tareaId)
  if (!tarea) return null

  tarea.estado = 'pendiente'
  tarea.completadaPor = null
  tarea.completadaEn = null

  p.log.push({
    id: uuid(),
    fecha: ahora(),
    usuario,
    accion: 'Tarea reabierta',
    detalle: tarea.titulo,
  })

  saveProyectos(proyectos)
  return p
}

export function omitirTarea(proyectoId, tareaId, usuario) {
  const proyectos = getProyectos()
  const p = proyectos.find((p) => p.id === proyectoId)
  if (!p) return null

  const tarea = p.tareas.find((t) => t.id === tareaId)
  if (!tarea) return null

  tarea.estado = 'omitida'
  p.log.push({
    id: uuid(),
    fecha: ahora(),
    usuario,
    accion: 'Tarea omitida',
    detalle: tarea.titulo,
  })

  saveProyectos(proyectos)
  return p
}

// ─── Pausas de tiempo ──────────────────────────────────────────────────────

export function iniciarPausa(proyectoId, faseActual, usuario) {
  const proyectos = getProyectos()
  const p = proyectos.find((p) => p.id === proyectoId)
  if (!p) return null

  const pausaActiva = p.tiempos.pausas.find((pa) => !pa.fin)
  if (pausaActiva) return p

  p.tiempos.pausas.push({
    id: uuid(),
    inicio: ahora(),
    fin: null,
    fase: faseActual,
    motivo: 'Esperando respuesta del cliente',
  })
  p.status = 'en_pausa'
  p.log.push({ id: uuid(), fecha: ahora(), usuario, accion: 'Proyecto en pausa', detalle: `Fase ${faseActual}` })

  saveProyectos(proyectos)
  return p
}

export function terminarPausa(proyectoId, usuario) {
  const proyectos = getProyectos()
  const p = proyectos.find((p) => p.id === proyectoId)
  if (!p) return null

  const pausaActiva = p.tiempos.pausas.find((pa) => !pa.fin)
  if (pausaActiva) {
    pausaActiva.fin = ahora()
  }
  p.status = 'activo'
  p.log.push({ id: uuid(), fecha: ahora(), usuario, accion: 'Pausa terminada', detalle: '' })

  saveProyectos(proyectos)
  return p
}

export function confirmarAnticipo(proyectoId, usuario) {
  const proyectos = getProyectos()
  const p = proyectos.find((p) => p.id === proyectoId)
  if (!p) return null

  p.proyecto.anticipoConfirmado = true
  p.status = 'activo'
  if (!p.tiempos.inicio) p.tiempos.inicio = ahora()
  p.log.push({ id: uuid(), fecha: ahora(), usuario, accion: 'Anticipo confirmado', detalle: '' })

  saveProyectos(proyectos)
  return p
}

export function cerrarProyecto(proyectoId, usuario) {
  const proyectos = getProyectos()
  const p = proyectos.find((p) => p.id === proyectoId)
  if (!p) return null

  p.status = 'completado'
  p.tiempos.cierre = ahora()
  p.log.push({ id: uuid(), fecha: ahora(), usuario, accion: 'Proyecto cerrado', detalle: '' })

  saveProyectos(proyectos)
  return p
}

// ─── Cálculo de tiempos ────────────────────────────────────────────────────

export function calcularTiempos(proyecto) {
  const { tiempos } = proyecto
  if (!tiempos.inicio) return { totalHoras: 0, pausaHoras: 0, activoHoras: 0 }

  const fin = tiempos.cierre ? new Date(tiempos.cierre) : new Date()
  const inicio = new Date(tiempos.inicio)
  const totalMs = fin - inicio

  const pausaMs = tiempos.pausas.reduce((acc, p) => {
    const ini = new Date(p.inicio)
    const fi = p.fin ? new Date(p.fin) : new Date()
    return acc + (fi - ini)
  }, 0)

  const activoMs = totalMs - pausaMs

  return {
    totalHoras: +(totalMs / 3600000).toFixed(1),
    pausaHoras: +(pausaMs / 3600000).toFixed(1),
    activoHoras: +(activoMs / 3600000).toFixed(1),
  }
}

// ─── Porcentaje de avance ──────────────────────────────────────────────────

export function calcularAvance(proyecto) {
  const tareas = proyecto.tareas.filter((t) => !t.opcional && t.estado !== 'omitida')
  if (!tareas.length) return 0
  const completadas = tareas.filter((t) => t.estado === 'completada').length
  return Math.round((completadas / tareas.length) * 100)
}

// ─── Estado de tareas (calculado) ─────────────────────────────────────────

export function calcularEstadoTareas(proyecto) {
  const tareas = proyecto.tareas
  const completadasIds = new Set(tareas.filter((t) => t.estado === 'completada').length ? tareas.filter((t) => t.estado === 'completada').map((t) => t.id) : [])

  return tareas.map((tarea) => {
    if (tarea.estado === 'completada' || tarea.estado === 'omitida') return tarea

    const depsSatisfechas = tarea.dependencias.every((dep) => completadasIds.has(dep))

    if (!depsSatisfechas) {
      return { ...tarea, estadoCalculado: 'bloqueada_dependencia' }
    }

    if (tarea.esCliente) {
      return { ...tarea, estadoCalculado: 'bloqueada_cliente' }
    }

    return { ...tarea, estadoCalculado: 'disponible' }
  })
}

// ─── Fase actual ──────────────────────────────────────────────────────────

export function getFaseActual(proyecto) {
  const tareas = proyecto.tareas
  for (let fase = 1; fase <= 7; fase++) {
    const tareasF = tareas.filter((t) => t.fase === fase && t.estado !== 'omitida')
    const incompletas = tareasF.filter((t) => t.estado !== 'completada')
    if (incompletas.length > 0) return fase
  }
  return 7
}

// ─── Tareas: edición y creación custom ────────────────────────────────────

export function editarTarea(proyectoId, tareaId, cambios, usuario) {
  const proyectos = getProyectos()
  const p = proyectos.find((p) => p.id === proyectoId)
  if (!p) return null

  const tarea = p.tareas.find((t) => t.id === tareaId)
  if (!tarea) return null

  const camposEditables = ['titulo', 'descripcion', 'queHacer', 'necesitasAntes', 'plantillaMensaje', 'queEntregas', 'responsable', 'instruccionesCliente', 'plazoHoras', 'esRutaCritica', 'soloKarlaOAdmin', 'esCliente']
  camposEditables.forEach((campo) => {
    if (cambios[campo] !== undefined) tarea[campo] = cambios[campo]
  })

  p.log.push({ id: uuid(), fecha: ahora(), usuario, accion: 'Tarea editada', detalle: tarea.titulo })
  saveProyectos(proyectos)
  return p
}

export function agregarTareaCustom(proyectoId, datos, usuario) {
  const proyectos = getProyectos()
  const p = proyectos.find((p) => p.id === proyectoId)
  if (!p) return null

  const nueva = {
    id: uuid(),
    fase: datos.fase,
    titulo: datos.titulo,
    descripcion: datos.descripcion || '',
    queHacer: datos.queHacer || '',
    necesitasAntes: datos.necesitasAntes || '',
    plantillaMensaje: datos.plantillaMensaje || '',
    queEntregas: datos.queEntregas || '',
    responsable: datos.responsable || 'equipo',
    dependencias: [],
    esCliente: datos.esCliente || false,
    instruccionesCliente: datos.instruccionesCliente || '',
    plazoHoras: datos.plazoHoras || null,
    esRutaCritica: false,
    soloAdmin: false,
    soloKarlaOAdmin: false,
    opcional: false,
    estado: 'pendiente',
    completadaPor: null,
    completadaEn: null,
    asignadoA: null,
    custom: true,
  }

  p.tareas.push(nueva)
  p.log.push({ id: uuid(), fecha: ahora(), usuario, accion: 'Tarea agregada', detalle: nueva.titulo })
  saveProyectos(proyectos)
  return p
}

export function eliminarTareaCustom(proyectoId, tareaId, usuario) {
  const proyectos = getProyectos()
  const p = proyectos.find((p) => p.id === proyectoId)
  if (!p) return null

  const tarea = p.tareas.find((t) => t.id === tareaId)
  if (!tarea) return null

  p.tareas = p.tareas.filter((t) => t.id !== tareaId)
  p.log.push({ id: uuid(), fecha: ahora(), usuario, accion: 'Tarea eliminada', detalle: tarea.titulo })
  saveProyectos(proyectos)
  return p
}

// ─── Miembros del equipo ───────────────────────────────────────────────────

const MIEMBROS_DEFAULT = [
  { id: 'jesus', nombre: 'Jesús', esAdmin: true, esKarla: false },
  { id: 'karla', nombre: 'Karla', esAdmin: false, esKarla: true },
]

export function getMiembros() {
  try {
    const guardados = JSON.parse(localStorage.getItem(KEY_MIEMBROS))
    if (guardados && guardados.length) return guardados
  } catch {}
  // Primera vez: guardar los defaults para que sean editables
  localStorage.setItem(KEY_MIEMBROS, JSON.stringify(MIEMBROS_DEFAULT))
  return MIEMBROS_DEFAULT
}

export function agregarMiembro(nombre, opts = {}) {
  const miembros = getMiembros()
  const nuevo = { id: uuid(), nombre: nombre.trim(), esAdmin: opts.esAdmin || false, esKarla: opts.esKarla || false }
  miembros.push(nuevo)
  localStorage.setItem(KEY_MIEMBROS, JSON.stringify(miembros))
  return nuevo
}

export function editarMiembro(id, cambios) {
  const miembros = getMiembros()
  const idx = miembros.findIndex((m) => m.id === id)
  if (idx === -1) return null
  miembros[idx] = { ...miembros[idx], ...cambios }
  localStorage.setItem(KEY_MIEMBROS, JSON.stringify(miembros))
  return miembros[idx]
}

export function eliminarMiembro(id) {
  const miembros = getMiembros().filter((m) => m.id !== id)
  localStorage.setItem(KEY_MIEMBROS, JSON.stringify(miembros))
}

// ─── Autenticación cliente ─────────────────────────────────────────────────

export function autenticarCliente(slugOrId, password) {
  const p = getProyectoPorSlug(slugOrId)
  if (!p) return false
  return p.passwordCliente === password
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function generarPassword() {
  const palabras = ['sol', 'mar', 'luna', 'viento', 'fuego', 'rio', 'cielo', 'estrella']
  const numeros = Math.floor(100 + Math.random() * 900)
  const p1 = palabras[Math.floor(Math.random() * palabras.length)]
  const p2 = palabras[Math.floor(Math.random() * palabras.length)]
  return `${p1}${numeros}${p2}`
}

export function formatFecha(isoString) {
  if (!isoString) return '—'
  return new Date(isoString).toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export function formatFechaHora(isoString) {
  if (!isoString) return '—'
  return new Date(isoString).toLocaleString('es-MX', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}
