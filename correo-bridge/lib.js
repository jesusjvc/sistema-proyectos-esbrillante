// Transformación e ingesta del puente de correo: MIME → payload de Foco y
// política de "marcar como leído" (la prueba de que un correo ya se procesó —
// sobrevive reinicios y no necesita cursor aparte, como estado.json del
// puente de WhatsApp).
import { createHash } from 'crypto'
import { simpleParser } from 'mailparser'

export function textoDesdeHtml(html) {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// MIME (buffer crudo del correo) → payload que espera
// POST /api/integraciones/correo/ingest. Si el cliente de correo no trae
// Message-ID, el hash evita que un reenvío del mismo correo duplique ticket.
export async function mensajeAPayload(source) {
  let p
  try {
    p = await simpleParser(source)
  } catch (err) {
    err.esDeParseo = true
    throw err
  }
  const de = p.from?.value?.[0]?.address || ''
  if (!de) {
    const err = new Error('correo sin remitente identificable')
    err.esDeParseo = true
    throw err
  }
  return {
    messageId: p.messageId || createHash('sha256').update(`${de}|${p.subject}|${p.date || ''}`).digest('hex'),
    de,
    nombreDe: p.from?.value?.[0]?.name || '',
    asunto: p.subject || '(sin asunto)',
    texto: p.text || textoDesdeHtml(p.html),
    fecha: p.date ? p.date.toISOString() : new Date().toISOString(),
  }
}

export async function ingerir(payload, { url, key }) {
  const resp = await fetch(`${url}/api/integraciones/correo/ingest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify(payload),
  })
  // 4xx: el correo no va a mejorar por sí solo (falta de datos, dedupe, etc.)
  // → se marca como leído para no reintentar eternamente. 5xx/red: Foco está
  // caído o con problemas → dejar sin marcar; el siguiente ciclo reintenta.
  return { reintentar: resp.status >= 500, status: resp.status, cuerpo: await resp.text().catch(() => '') }
}

// Recorre los no leídos del buzón, los ingesta y marca según resultado.
async function* noLeidos(cliente, buzon) {
  const candado = await cliente.getMailboxLock(buzon)
  try {
    const uids = await cliente.search({ seen: false }, { uid: true })
    for (const uid of uids || []) {
      const mensaje = await cliente.fetchOne(String(uid), { source: true }, { uid: true })
      yield { uid, source: mensaje?.source }
    }
  } finally {
    candado.release()
  }
}

export async function procesarBuzon(cliente, { url, key, buzon, moverA }) {
  if (!url || !key) throw new Error('FOCO_URL/FOCO_API_KEY no configuradas')
  const resumen = { procesados: 0, reintentan: 0 }
  for await (const { uid, source } of noLeidos(cliente, buzon)) {
    if (!source) continue
    try {
      const payload = await mensajeAPayload(source)
      const { reintentar, status } = await ingerir(payload, { url, key })
      if (reintentar) {
        resumen.reintentan += 1
        console.error(`uid ${uid}: Foco respondió ${status} — queda sin leer para reintento`)
        continue
      }
      resumen.procesados += 1
      const candado = await cliente.getMailboxLock(buzon)
      try {
        await cliente.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true })
        if (moverA) await cliente.messageMove(String(uid), moverA, { uid: true })
      } finally {
        candado.release()
      }
    } catch (err) {
      // Parseo fallido o red caída a medias: dejar sin leer salvo que sea un
      // problema del contenido (parseo) — esos sí se marcan para no trabar la fila.
      if (err.esDeParseo) {
        await cliente.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true }).catch(() => {})
        console.error(`uid ${uid}: correo ilegible, marcado leído sin ingestar (${err.message})`)
      } else {
        resumen.reintentan += 1
        console.error(`uid ${uid}: ${err.message} — queda sin leer`)
      }
    }
  }
  return resumen
}
