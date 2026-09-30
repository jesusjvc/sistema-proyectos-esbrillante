// Puente local OpenWA → Foco.
//
// Corre en la máquina del equipo (NO se despliega): conecta WhatsApp Web con
// @open-wa/wa-automate, escucha los mensajes de los grupos rastreados (los
// que figuran en la Info clave de cada proyecto en Foco) y a la hora de
// envío entrega el lote del día a la API de Foco, donde la automatización
// diaria los resume en el tab Status del proyecto.
//
// Setup: cp .env.example .env (llenar FOCO_API_KEY) → npm install → npm start
// (escanear el QR la primera vez; la sesión queda persistida en ./session).

import 'dotenv/config'
import { create } from '@open-wa/wa-automate'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'

const FOCO_URL = (process.env.FOCO_URL || '').replace(/\/$/, '')
const FOCO_API_KEY = process.env.FOCO_API_KEY || ''
const HORA_ENVIO = process.env.HORA_ENVIO || '21:00'
const BUFFER_PATH = new URL('./buffer.json', import.meta.url).pathname

if (!FOCO_URL || !FOCO_API_KEY) {
  console.error('Faltan FOCO_URL o FOCO_API_KEY en el .env — copia .env.example y llénalos.')
  process.exit(1)
}

// ── Buffer persistente: los mensajes llegan aquí mientras esperan el envío.
// Sobrevive reinicios de la máquina — no se pierde nada de lo recibido.
let buffer = {}
let enviandoHoy = null // fecha (YYYY-MM-DD) del último envío

function cargarBuffer() {
  try {
    if (existsSync(BUFFER_PATH)) {
      buffer = JSON.parse(readFileSync(BUFFER_PATH, 'utf8'))
      const total = Object.values(buffer).reduce((n, lista) => n + lista.length, 0)
      if (total) console.log(`Buffer restaurado: ${total} mensaje(s) pendientes de envío.`)
    }
  } catch (err) {
    console.error('No se pudo leer el buffer:', err.message)
    buffer = {}
  }
}

function guardarBuffer() {
  writeFileSync(BUFFER_PATH, JSON.stringify(buffer, null, 2))
}

function acumular(grupo, mensaje) {
  if (!buffer[grupo]) buffer[grupo] = []
  buffer[grupo].push(mensaje)
  guardarBuffer()
}

// ── Foco
async function api(ruta, opciones = {}) {
  const res = await fetch(`${FOCO_URL}${ruta}`, {
    ...opciones,
    headers: { Authorization: `Bearer ${FOCO_API_KEY}`, 'Content-Type': 'application/json', ...opciones.headers },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data
}

let gruposRastreados = [] // nombres en minúsculas
async function refrescarGrupos(client) {
  try {
    const grupos = await api('/api/integraciones/whatsapp/grupos')
    gruposRastreados = grupos.map((g) => g.grupo.trim().toLowerCase())
    console.log(`Grupos rastreados (${gruposRastreados.length}):`, gruposRastreados.join(', ') || '(ninguno — agrega el grupo en la Info clave de un proyecto)')
  } catch (err) {
    console.error('No se pudo refrescar la lista de grupos:', err.message)
  }
}

// Envía el buffer completo a Foco, grupo por grupo.
async function enviarBuffer() {
  const grupos = Object.keys(buffer)
  if (!grupos.length) return
  for (const grupo of grupos) {
    const mensajes = buffer[grupo]
    if (!mensajes.length) continue
    try {
      const resp = await api('/api/integraciones/whatsapp/mensajes', {
        method: 'POST',
        body: JSON.stringify({ grupo, mensajes }),
      })
      console.log(`Enviado "${grupo}": ${resp.guardados} guardado(s) → ${resp.proyectos.join(', ')}${resp.descartados ? ` (${resp.descartados} descartados)` : ''}`)
      delete buffer[grupo]
      guardarBuffer()
      enviandoHoy = new Date().toISOString().slice(0, 10)
    } catch (err) {
      console.error(`No se pudo enviar "${grupo}" — queda en el buffer:`, err.message)
    }
  }
}

const minutosAhora = () => {
  const d = new Date()
  return d.getHours() * 60 + d.getMinutes()
}
const minutosDe = (hhmm) => {
  const [h, m] = String(hhmm).split(':').map(Number)
  return h * 60 + (m || 0)
}

cargarBuffer()

// ── WhatsApp
create({
  sessionId: 'foco-bridge',
  // La sesión queda en ./session — QR solo la primera vez.
  headless: true,
  restartOnCrash: start,
  qrTimeout: 0,
}).then(start)

async function start(client) {
  console.log('WhatsApp conectado.')

  // Mapa id de chat → nombre (para reconocer los grupos rastreados).
  let nombresPorId = {}
  async function refrescarNombres() {
    try {
      const chats = await client.getChats()
      nombresPorId = Object.fromEntries(chats.map((c) => [c.id._serialized, c.name || c.formattedTitle || '']))
    } catch (err) {
      console.error('No se pudieron listar los chats:', err.message)
    }
  }

  await refrescarNombres()
  await refrescarGrupos(client)

  // Refresco de nombres/grupos cada hora; chequeo de envío cada minuto.
  setInterval(() => { refrescarNombres(); refrescarGrupos(client) }, 60 * 60 * 1000)
  setInterval(() => {
    if (enviandoHoy === new Date().toISOString().slice(0, 10)) return
    if (minutosAhora() >= minutosDe(HORA_ENVIO)) {
      console.log(`Hora de envío (${HORA_ENVIO}) — enviando buffer...`)
      enviarBuffer()
    }
  }, 60 * 1000)
  if (Object.keys(buffer).length) console.log('Hay mensajes pendientes — se enviarán a la hora de envío o al salir (Ctrl+C).')

  client.onMessage(async (msg) => {
    try {
      if (!msg.isGroupMsg || !msg.body?.trim()) return
      const nombreChat = nombresPorId[msg.from]
      if (!nombreChat) return
      if (!gruposRastreados.includes(nombreChat.trim().toLowerCase())) return

      const autor = msg.sender?.pushname || msg.sender?.verifiedName || msg.notifyName || 'Desconocido'
      acumular(nombreChat, {
        autor,
        texto: msg.body,
        fecha: new Date(msg.t * 1000).toISOString(),
      })
      console.log(`Recibido en "${nombreChat}" de ${autor}: ${msg.body.slice(0, 60)}...`)
    } catch (err) {
      console.error('Error procesando mensaje:', err.message)
    }
  })

  // Salida limpia: envía lo pendiente antes de apagarse.
  async function salir() {
    console.log('Apagando — enviando buffer pendiente...')
    await enviarBuffer()
    process.exit(0)
  }
  process.on('SIGINT', salir)
  process.on('SIGTERM', salir)
}
