import { JWT } from 'google-auth-library'

// Envío a un Space de Google Chat vía webhook entrante — canal adicional al
// correo para avisos a admins (nunca lo reemplaza). Mismo patrón de mejor
// esfuerzo que webhooks.js: si no está configurado o falla, no rompe ni
// bloquea el flujo que lo dispara.
function googleChatConfigurado() {
  return !!process.env.GOOGLE_CHAT_WEBHOOK_URL
}

async function enviarGoogleChat(texto) {
  if (!googleChatConfigurado()) return { enviado: false, motivo: 'Google Chat no configurado' }

  try {
    const res = await fetch(process.env.GOOGLE_CHAT_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify({ text: texto }),
    })
    if (!res.ok) {
      console.error('Google Chat error:', res.status, await res.text())
      return { enviado: false, motivo: `Google Chat error ${res.status}` }
    }
    return { enviado: true }
  } catch (err) {
    console.error('Google Chat error:', err)
    return { enviado: false, motivo: err.message }
  }
}

// ── Lectura de mensajes de espacios (Google Chat API + delegación de dominio)
//
// Requiere: GOOGLE_SERVICE_ACCOUNT_KEY (la misma de Drive) y
// GOOGLE_CHAT_IMPERSONATE_USER (un correo del Workspace miembro de los
// espacios). El super admin del Workspace debe autorizar la delegación del
// client ID de la service account con estos scopes:
//   https://www.googleapis.com/auth/chat.messages.readonly
//   https://www.googleapis.com/auth/chat.spaces.readonly

const CHAT_API = 'https://chat.googleapis.com/v1'
const CHAT_SCOPES = [
  'https://www.googleapis.com/auth/chat.messages.readonly',
  'https://www.googleapis.com/auth/chat.spaces.readonly',
]

function chatDwdConfigurado() {
  return !!(process.env.GOOGLE_SERVICE_ACCOUNT_KEY && process.env.GOOGLE_CHAT_IMPERSONATE_USER)
}

let chatAuthClient = null
async function chatToken() {
  if (!chatAuthClient) {
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY)
    chatAuthClient = new JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: CHAT_SCOPES,
      // Delegación de dominio: la API pide autenticación de USUARIO para leer
      // mensajes (con app auth solo devuelve mensajes públicos).
      subject: process.env.GOOGLE_CHAT_IMPERSONATE_USER,
    })
  }
  const { token } = await chatAuthClient.getAccessToken()
  return token
}

async function chatGet(ruta) {
  const token = await chatToken()
  const res = await fetch(`${CHAT_API}${ruta}`, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`Chat API ${res.status} en ${ruta.split('?')[0]}: ${(await res.text()).slice(0, 200)}`)
  return res.json()
}

export async function chatEspacios() {
  const data = await chatGet('/spaces?pageSize=100')
  return (data.spaces || []).map((s) => ({ id: s.name, nombre: s.displayName || s.name, tipo: s.spaceType }))
}

export async function chatMensajes(spaceId, { desde } = {}) {
  const params = new URLSearchParams({ pageSize: '200' })
  if (desde) params.set('filter', `createTime > "${desde}"`)
  // spaceId ya es el nombre completo del recurso ('spaces/XXX') — no lleva
  // prefijo adicional (el /spaces/ duplicado daba 404).
  const data = await chatGet(`/${spaceId}/messages?${params}`)
  return (data.messages || []).map((m) => ({
    id: m.name,
    // Id crudo del autor ('users/xxx') — el que sincroniza lo resuelve a
    // nombre con los miembros del espacio.
    autor: m.sender?.name || m.author || 'Desconocido',
    texto: (m.argumentText || m.text || '').trim(),
    fecha: m.createTime,
  })).filter((m) => m.texto)
}

export async function chatMiembros(spaceId) {
  const data = await chatGet(`/${spaceId}/members?pageSize=100`)
  const mapa = {}
  for (const m of data.memberships || []) {
    if (m.member?.name && m.member?.displayName) mapa[m.member.name] = m.member.displayName
  }
  return mapa
}

export { googleChatConfigurado, enviarGoogleChat, chatDwdConfigurado }
