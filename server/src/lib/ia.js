// Cliente del gateway de OpenCode (plan Go por defecto). Recorre la lista de
// modelos en orden: si uno falla, prueba el siguiente.

const BASE_POR_DEFECTO = 'https://opencode.ai/inference/go'
const MODELOS_POR_DEFECTO = 'glm-5.3,glm-5.3-flash,kimi-k3'
const TIEMPO_LIMITE_MS = 90_000

function llave() {
  return process.env.OPENCODE_API_KEY || process.env.ANTHROPIC_API_KEY || ''
}

export function iaConfigurada() {
  return !!llave()
}

function modelos() {
  return (process.env.IA_MODELOS || MODELOS_POR_DEFECTO).split(',').map((m) => m.trim()).filter(Boolean)
}

function base() {
  return (process.env.IA_BASE_URL || BASE_POR_DEFECTO).replace(/\/+$/, '')
}

// Claude y Qwen solo se sirven por la API de Anthropic en OpenCode.
function usaAnthropic(modelo) {
  return /^(claude|qwen)/i.test(modelo)
}

function pedido(modelo, { sistema, mensajes, maxTokens }) {
  if (usaAnthropic(modelo)) {
    return {
      ruta: '/anthropic/v1/messages',
      cuerpo: { model: modelo, max_tokens: maxTokens, ...(sistema ? { system: sistema } : {}), messages: mensajes },
      leer: (json) => (json.content || []).filter((c) => c.type === 'text').map((c) => c.text).join(''),
    }
  }
  return {
    ruta: '/openai/v1/chat/completions',
    cuerpo: { model: modelo, max_tokens: maxTokens, messages: [...(sistema ? [{ role: 'system', content: sistema }] : []), ...mensajes] },
    leer: (json) => json.choices?.[0]?.message?.content || '',
  }
}

async function llamar(modelo, opciones) {
  const { ruta, cuerpo, leer } = pedido(modelo, opciones)
  const control = new AbortController()
  const temporizador = setTimeout(() => control.abort(), TIEMPO_LIMITE_MS)
  try {
    const res = await fetch(`${base()}${ruta}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${llave()}` },
      body: JSON.stringify(cuerpo),
      signal: control.signal,
    })
    if (!res.ok) return { codigo: String(res.status) }
    const texto = String(leer(await res.json().catch(() => ({}))) || '').trim()
    return texto ? { texto } : { codigo: 'vacío' }
  } catch (err) {
    return { codigo: err.name === 'AbortError' ? 'tiempo agotado' : 'sin conexión' }
  } finally {
    clearTimeout(temporizador)
  }
}

export async function generarTexto({ sistema, mensajes, maxTokens = 8000 }) {
  if (!iaConfigurada()) {
    const error = new Error('La IA no está configurada en el servidor')
    error.status = 503
    throw error
  }
  const fallas = []
  for (const modelo of modelos()) {
    const resultado = await llamar(modelo, { sistema, mensajes, maxTokens })
    if (resultado.texto) return { texto: resultado.texto, modelo }
    fallas.push(`${modelo}: ${resultado.codigo}`)
  }
  const error = new Error(`La IA no respondió (${fallas.join(', ')})`)
  error.status = 502
  throw error
}
