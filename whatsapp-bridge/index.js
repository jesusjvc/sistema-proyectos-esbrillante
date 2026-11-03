// Puente OpenWA (open-wa.org) → Foco.
//
// Corre en la máquina del equipo (NO se despliega): cada INTERVALO_MINUTOS
// sincroniza los mensajes nuevos de los grupos rastreados (los que figuran
// en la Info clave de cada proyecto en Foco) desde la API de tu OpenWA a la
// API de Foco, donde la automatización diaria los resume en el tab Status.
//
// Setup: cp .env.example .env (llenar OPENWA_URL, OPENWA_API_KEY, FOCO_*)
// → npm install → npm start

import 'dotenv/config'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const OPENWA_URL = (process.env.OPENWA_URL || '').replace(/\/$/, '')
const OPENWA_API_KEY = process.env.OPENWA_API_KEY || ''
const OPENWA_SESION = process.env.OPENWA_SESION || ''
const FOCO_URL = (process.env.FOCO_URL || '').replace(/\/$/, '')
const FOCO_API_KEY = process.env.FOCO_API_KEY || ''
const INTERVALO_MINUTOS = Math.max(Number(process.env.INTERVALO_MINUTOS) || 60, 5)
const ESTADO_PATH = fileURLToPath(new URL('./estado.json', import.meta.url))
const ALERTAS_PATH = fileURLToPath(new URL('./alertas.json', import.meta.url))

if (!OPENWA_URL || !OPENWA_API_KEY || !FOCO_URL || !FOCO_API_KEY) {
  console.error('Faltan variables en el .env — copia .env.example y llena OPENWA_*/FOCO_*.')
  process.exit(1)
}

// ── Estado: por chatId, el timestamp (segundos) del último mensaje enviado a
// Foco. Así cada vuelta solo manda lo nuevo, aunque el poller se reinicie.
let estado = {}
function cargarEstado() {
  try {
    if (existsSync(ESTADO_PATH)) estado = JSON.parse(readFileSync(ESTADO_PATH, 'utf8'))
  } catch (err) {
    console.error('No se pudo leer estado.json:', err.message)
    estado = {}
  }
}
function guardarUltimo(chatId, ts) {
  if (!estado[chatId] || ts > estado[chatId]) {
    estado[chatId] = ts
    writeFileSync(ESTADO_PATH, JSON.stringify(estado, null, 2))
  }
}

// ── Guard de sesión desconectada: estado persistente (sobrevive reinicios
// del proceso) para no espamear una nota interna por proyecto cada vuelta
// mientras la sesión de OpenWA siga caída — solo notifica al iniciar la
// caída y, como mucho, cada HORAS_RENOTIFICAR mientras no se recupere.
const HORAS_RENOTIFICAR = 12
let alertas = { activa: false, desde: null, ultimaNotificacion: null }
function cargarAlertas() {
  try {
    if (existsSync(ALERTAS_PATH)) {
      alertas = { activa: false, desde: null, ultimaNotificacion: null, ...JSON.parse(readFileSync(ALERTAS_PATH, 'utf8')) }
    }
  } catch (err) {
    console.error('No se pudo leer alertas.json:', err.message)
    alertas = { activa: false, desde: null, ultimaNotificacion: null }
  }
}
function guardarAlertas() {
  writeFileSync(ALERTAS_PATH, JSON.stringify(alertas, null, 2))
}

async function notificarAlertaFoco(motivo) {
  try {
    await postFoco('/api/integraciones/whatsapp/alerta', { motivo })
  } catch (err) {
    console.error('No se pudo avisar la alerta a Foco:', err.message)
  }
}

// Marca (o re-marca) la sesión como desconectada y dispara la nota interna
// en Foco — solo la primera vez que cae, y luego como mucho cada 12h.
async function marcarSesionDesconectada(motivo) {
  const ahora = Date.now()
  if (!alertas.activa) {
    alertas = { activa: true, desde: new Date(ahora).toISOString(), ultimaNotificacion: new Date(ahora).toISOString() }
    guardarAlertas()
    await notificarAlertaFoco(`⚠️ Sesión de WhatsApp (OpenWA) desconectada — los grupos vinculados a este proyecto dejaron de sincronizar mensajes nuevos desde ${alertas.desde}. Motivo: ${motivo}`)
    return
  }
  const pasaronHoras = !alertas.ultimaNotificacion
    || (ahora - new Date(alertas.ultimaNotificacion).getTime()) >= HORAS_RENOTIFICAR * 3600_000
  if (pasaronHoras) {
    alertas.ultimaNotificacion = new Date(ahora).toISOString()
    guardarAlertas()
    await notificarAlertaFoco(`⚠️ Sesión de WhatsApp (OpenWA) sigue desconectada desde ${alertas.desde} — los grupos vinculados a este proyecto siguen sin sincronizar mensajes nuevos. Motivo: ${motivo}`)
  }
}

// Limpia el flag cuando la sesión vuelve a estar conectada tras una caída.
async function marcarSesionRecuperada() {
  if (!alertas.activa) return
  console.log(`Sesión de WhatsApp recuperada (había caído desde ${alertas.desde}).`)
  alertas = { activa: false, desde: null, ultimaNotificacion: null }
  guardarAlertas()
}

async function get(url, headers = {}) {
  const res = await fetch(url, { headers })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.message || data.error || `HTTP ${res.status} en ${url}`)
  return data
}

const openwa = (ruta) => get(`${OPENWA_URL}/api${ruta}`, { 'X-API-Key': OPENWA_API_KEY })
const foco = (ruta) => get(`${FOCO_URL}${ruta}`, { Authorization: `Bearer ${FOCO_API_KEY}` })

async function postFoco(ruta, body) {
  const res = await fetch(`${FOCO_URL}${ruta}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${FOCO_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data
}

// ── Sincronización
async function sincronizar() {
  // 1. Grupos rastreados según Foco (Info clave de cada proyecto activo).
  const grupos = await foco('/api/integraciones/whatsapp/grupos')
  if (!grupos.length) {
    console.log('Sin grupos rastreados — pon el nombre del grupo en la Info clave de un proyecto.')
    return
  }

  // 2. Resolver la sesión de WhatsApp en OpenWA — y el guard de sesión
  // desconectada: cualquier caso en el que no haya una sesión usable y
  // conectada dispara (o mantiene) la alerta en vez de solo loguearlo.
  const sesiones = await openwa('/sessions')
  const lista = Array.isArray(sesiones) ? sesiones : sesiones.sessions || sesiones.data || []
  const ESTADOS_SESION_OK = ['connected', 'ready']
  const sesionConectada = (s) => !!s && ESTADOS_SESION_OK.includes(String(s.status || '').toLowerCase())

  let sesion = null
  let motivoDesconexion = null
  if (!lista.length) {
    motivoDesconexion = 'OpenWA no tiene sesiones — escanea el QR en su dashboard.'
  } else {
    sesion = OPENWA_SESION
      ? lista.find((s) => s.id === OPENWA_SESION || s.name === OPENWA_SESION)
      : lista.find((s) => sesionConectada(s)) || lista[0]
    if (!sesion) {
      motivoDesconexion = `No encontré la sesión "${OPENWA_SESION}" — sesiones disponibles: ${lista.map((s) => s.name || s.id).join(', ')}`
    } else if (!sesionConectada(sesion)) {
      motivoDesconexion = `La sesión de WhatsApp "${sesion.name || sesion.id}" no está conectada (status: ${sesion.status || 'desconocido'})`
    }
  }

  if (motivoDesconexion) {
    console.log(motivoDesconexion)
    await marcarSesionDesconectada(motivoDesconexion)
    return
  }
  await marcarSesionRecuperada()
  const sesionId = sesion.id || sesion.name

  // 3. Chats de la sesión → chatId de cada grupo rastreado.
  const chats = await openwa(`/sessions/${sesionId}/chats`)
  const listaChats = Array.isArray(chats) ? chats : chats.chats || chats.data || []
  const objetivos = []
  for (const g of grupos) {
    const chat = listaChats.find((c) => (c.name || '').trim().toLowerCase() === g.grupo.trim().toLowerCase())
    if (chat) objetivos.push({ ...g, chatId: chat.id })
    else console.log(`El grupo "${g.grupo}" (${g.cliente}) no aparece en los chats de esta sesión — ¿el nombre coincide exacto?`)
  }
  if (!objetivos.length) {
    console.log('Ninguno de los grupos rastreados aparece en esta sesión de WhatsApp.')
    return
  }

  // 4. Mensajes nuevos por grupo (solo entrantes; la sincronización es
  // continua, ya no hace falta el lote diario a hora fija).
  for (const objetivo of objetivos) {
    // Mapa id de participante → nombre: los senders pueden llegar como ids
    // de privacidad (@lid) sin nombre en el mensaje.
    let nombresPorId = {}
    try {
      const info = await openwa(`/sessions/${sesionId}/groups/${encodeURIComponent(objetivo.chatId)}`)
      for (const p of info.participants || []) {
        if (p.name) nombresPorId[p.id] = p.name
      }
    } catch (err) {
      console.log(`No pude traer los participantes de "${objetivo.grupo}": ${err.message}`)
    }

    const ultimo = estado[objetivo.chatId] || 0
    const pagina = await openwa(`/sessions/${sesionId}/messages?chatId=${encodeURIComponent(objetivo.chatId)}&limit=500&inlineMedia=false`)
    const mensajes = pagina.messages || []
    const nuevos = mensajes
      .filter((m) => (m.timestamp || 0) > ultimo && (m.body || '').trim())
      .filter((m) => ['incoming', 'outgoing'].includes(String(m.direction || '').toLowerCase()))
      .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
      .map((m) => ({
        // outgoing = enviado por el account del puente (respuestas del equipo);
        // incoming = el resto del grupo. El nombre humano va cuando el
        // contacto lo expone; el id crudo como último recurso.
        autor: String(m.direction || '').toLowerCase() === 'outgoing'
          ? 'Equipo (WhatsApp)'
          : (m.contact?.pushName || m.contact?.name || nombresPorId[m.author] || m.author || 'Desconocido'),
        texto: m.body,
        fecha: new Date((m.timestamp || 0) * 1000).toISOString(),
      }))

    if (!nuevos.length) {
      console.log(`"${objetivo.grupo}": sin mensajes nuevos.`)
      continue
    }

    const resp = await postFoco('/api/integraciones/whatsapp/mensajes', {
      grupo: objetivo.grupo,
      mensajes: nuevos,
    })
    guardarUltimo(objetivo.chatId, Math.floor(new Date(nuevos[nuevos.length - 1].fecha).getTime() / 1000))
    console.log(`"${objetivo.grupo}" → ${resp.guardados} mensaje(s) a Foco (${resp.proyectos.join(', ')}).`)
  }
}

// ── Loop
cargarEstado()
cargarAlertas()
async function vuelta() {
  try {
    await sincronizar()
  } catch (err) {
    console.error('Vuelta con error:', err.message)
  }
}
await vuelta()
setInterval(vuelta, INTERVALO_MINUTOS * 60 * 1000)
console.log(`Puente corriendo — sincroniza cada ${INTERVALO_MINUTOS} min. Ctrl+C para salir.`)
