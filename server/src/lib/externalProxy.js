import { lookup } from 'dns/promises'
import { ASSET_VERSION } from './assetVersion.js'

const FETCH_TIMEOUT_MS = 10_000
const USER_AGENT = 'Mozilla/5.0 (compatible; FocoPagesBot/1.0; +https://prototipos.esbrillante.mx)'

// Rangos IPv4 privados/reservados que nunca debe alcanzar el fetch server-side (guard SSRF).
function esIpv4Privada(ip) {
  const partes = ip.split('.').map(Number)
  if (partes.length !== 4 || partes.some((n) => Number.isNaN(n))) return false
  const [a, b] = partes
  if (a === 10) return true // 10.0.0.0/8
  if (a === 127) return true // loopback
  if (a === 169 && b === 254) return true // link-local (incluye metadata cloud)
  if (a === 172 && b >= 16 && b <= 31) return true // 172.16.0.0/12
  if (a === 192 && b === 168) return true // 192.168.0.0/16
  if (a === 0) return true // 0.0.0.0/8
  return false
}

// Rangos IPv6 privados/reservados equivalentes.
function esIpv6Privada(ip) {
  const norm = ip.toLowerCase()
  if (norm === '::1') return true // loopback
  if (norm.startsWith('fe80:')) return true // link-local
  if (norm.startsWith('fc') || norm.startsWith('fd')) return true // unique local fc00::/7
  return false
}

// Valida que una URL sea segura para que el servidor la fetchee: esquema http/https y el
// hostname no resuelve a una IP privada/loopback/link-local. Cualquier Admin/Equipo autenticado
// puede registrar una página externa, y el fetch lo hace nuestro propio servidor con acceso de
// red al resto de la infraestructura interna — sin este guard, alguien podría usar el proxy para
// alcanzar servicios internos (SSRF).
export async function esUrlSegura(urlStr) {
  let url
  try {
    url = new URL(urlStr)
  } catch {
    return false
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false

  try {
    const { address, family } = await lookup(url.hostname)
    if (family === 4 && esIpv4Privada(address)) return false
    if (family === 6 && esIpv6Privada(address)) return false
    return true
  } catch {
    return false // no resuelve — mejor no fetchear
  }
}

const MAX_REDIRECTS_EXTERNOS = 5

// Fetchea el HTML de una página externa con timeout y validación de que sea HTML.
// Sigue redirects a mano (en vez de redirect:"follow") con un cookie jar mínimo: algunos sitios
// externos (Shopify al previsualizar un tema no publicado vía ?preview_theme_id=, en particular)
// setean una cookie de sesión en el 302 y la necesitan de vuelta para saber qué servir en el
// siguiente salto — fetch() sigue redirects solo, sin cookie jar, así que esa cookie se perdía y
// el sitio terminaba sirviendo el contenido publicado normal en vez del preview pedido.
export async function fetchHtmlExterno(urlExterna) {
  let url = urlExterna
  const cookies = new Map()

  for (let intento = 0; intento <= MAX_REDIRECTS_EXTERNOS; intento++) {
    if (!(await esUrlSegura(url))) {
      throw new Error(`No se puede acceder a la URL externa "${url}".`)
    }

    const headers = { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml' }
    if (cookies.size) headers.Cookie = [...cookies].map(([k, v]) => `${k}=${v}`).join('; ')

    const resp = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: 'manual',
      headers,
    })

    for (const raw of resp.headers.getSetCookie?.() ?? []) {
      const [parNombreValor] = raw.split(';', 1)
      const eq = parNombreValor.indexOf('=')
      if (eq > 0) cookies.set(parNombreValor.slice(0, eq).trim(), parNombreValor.slice(eq + 1).trim())
    }

    if (resp.status >= 300 && resp.status < 400 && resp.headers.get('location')) {
      url = new URL(resp.headers.get('location'), url).toString()
      continue
    }

    if (!resp.ok) {
      throw new Error(`La página externa respondió ${resp.status}.`)
    }
    const contentType = resp.headers.get('content-type') ?? ''
    if (!contentType.includes('text/html')) {
      throw new Error(`La página externa no es HTML (Content-Type: ${contentType || 'desconocido'}).`)
    }

    const html = await resp.text()
    return { html, finalUrl: resp.url || url }
  }

  throw new Error(`Demasiados redirects al cargar "${urlExterna}".`)
}

// Reescribe los href="" de los <a> y action="" de los <form> que apunten al mismo origen que la
// página externa, para que sigan pasando por nuestro proxy (/p/:slug/...) en vez de llevarse al
// visitante fuera de la revisión. Enlaces a otro dominio, anclas (#...), mailto:, tel: y
// javascript: se dejan intactos. No toca <link>/<img>/<script>/<base> — esos deben seguir
// resolviendo contra el dominio real (vía <base>) para que assets/estilos carguen bien.
export function reescribirLinksProxy(html, slug, paginaUrl, baseUrl) {
  let origenExterno
  try {
    origenExterno = new URL(paginaUrl).origin
  } catch {
    return html
  }

  function proxificar(valorCrudo) {
    const valor = valorCrudo.trim()
    if (!valor || /^(#|mailto:|tel:|javascript:|data:)/i.test(valor)) return null
    let resuelta
    try {
      resuelta = new URL(valor, paginaUrl)
    } catch {
      return null
    }
    if (resuelta.origin !== origenExterno) return null // otro dominio: se deja igual, sí sale de la revisión
    return `${baseUrl}/p/${slug}${resuelta.pathname}${resuelta.search}${resuelta.hash}`
  }

  function reescribirEnTags(html2, tagRe, attr) {
    const attrRe = new RegExp(`(\\s${attr}\\s*=\\s*)("([^"]*)"|'([^']*)')`, 'i')
    return html2.replace(tagRe, (tagFull) =>
      tagFull.replace(attrRe, (m, pre, _todo, dq, sq) => {
        const nueva = proxificar(dq !== undefined ? dq : sq ?? '')
        if (nueva === null) return m
        const quote = dq !== undefined ? '"' : "'"
        return `${pre}${quote}${nueva}${quote}`
      })
    )
  }

  let out = reescribirEnTags(html, /<a\b[^>]*>/gi, 'href')
  out = reescribirEnTags(out, /<form\b[^>]*>/gi, 'action')
  return out
}

// Inserta el <base> (para que las rutas relativas de la página externa sigan resolviendo contra
// su dominio original) y los <script> del widget de revisión, con src absoluto a baseUrl para
// que sigan hablando con este servidor sin importar el <base> recién insertado. También reescribe
// los enlaces internos del sitio para que la navegación por su menú siga pasando por nuestro
// proxy — así el widget no se pierde al entrar a otra página del mismo sitio.
// `baseUrl` es el dominio donde se ve la página (los links reescritos se quedan
// ahí); `widgetBase` es de dónde se carga el widget (ver urlPublicaApi).
export function inyectarWidgetProxy(html, finalUrl, tipo, slug, baseUrl, widgetBase = baseUrl) {
  let out = html

  if (!/<base[\s>]/i.test(out)) {
    const baseTag = `<base href="${finalUrl}">`
    out = /<head[^>]*>/i.test(out)
      ? out.replace(/<head[^>]*>/i, (m) => `${m}${baseTag}`)
      : `${baseTag}${out}`
  }

  out = reescribirLinksProxy(out, slug, finalUrl, baseUrl)

  const widgetTag =
    `<script src="${widgetBase}/resources/gsap.min.js?v=${ASSET_VERSION}"></script>` +
    `<script src="${widgetBase}/resources/revision.js?v=${ASSET_VERSION}" data-tipo="${tipo}"></script>`
  out = /<\/body>/i.test(out) ? out.replace(/<\/body>/i, `${widgetTag}</body>`) : out + widgetTag

  return out
}

// Página de error para cuando el proxy no logra cargar la URL externa (a diferencia del 404 genérico).
export function paginaErrorProxy(urlExterna) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>No se pudo cargar la página — Foco</title>
  <style>
    body { font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #f8f9fa; }
    .card { text-align: center; padding: 2rem; max-width: 480px; }
    h1 { color: #343a40; font-size: 1.5rem; margin-bottom: 0.5rem; }
    p { color: #6c757d; margin-bottom: 1rem; }
    a { color: #b08200; font-weight: 700; }
  </style>
</head>
<body>
  <div class="card">
    <h1>No pudimos cargar esta página.</h1>
    <p>La URL externa no respondió o no está disponible en este momento.</p>
    <a href="${urlExterna}" target="_blank" rel="noreferrer">Intentar abrirla directamente →</a>
  </div>
</body>
</html>`
}
