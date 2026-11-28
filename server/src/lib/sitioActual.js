import { dominioDesde } from './clientesCrm.js'

// Revisión rápida del sitio actual del cliente antes de planear un rediseño o
// migración: qué páginas tiene, cómo está armado y con qué. Es de mejor
// esfuerzo: nunca lanza; si el sitio no responde o lo protege un WAF regresa
// `bloqueado` para que el plan deje la revisión a un agente local.

const USER_AGENT = 'foco-coordinador/1.0'
const TIMEOUT_HOME_MS = 15000
const TIMEOUT_SITEMAP_MS = 10000
const MAX_HTML = 1_500_000
const MAX_RESUMEN = 6000

// Solo TLD comunes: "Node.js" o "AstroJS" en el alcance no son dominios.
const RE_DOMINIO = /(?<![@\w.-])((?:https?:\/\/)?(?:www\.)?[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.(?:com\.mx|org\.mx|gob\.mx|edu\.mx|net\.mx|com|mx|net|org|io|co|app|dev|info|biz|store|shop|site|online|tech|agency|es|us))(?![\w-])/i

const MARCAS_STACK = [
  [/wp-content|wp-includes/i, 'WordPress'],
  [/elementor/i, 'Elementor'],
  [/et_pb_|divi/i, 'Divi'],
  [/\/_astro\//i, 'Astro'],
  [/\/_next\//i, 'Next.js'],
  [/__nuxt|\/_nuxt\//i, 'Nuxt'],
  [/static\.wixstatic\.com|wix\.com/i, 'Wix'],
  [/cdn\.shopify\.com|shopify/i, 'Shopify'],
  [/squarespace/i, 'Squarespace'],
  [/webflow/i, 'Webflow'],
  [/woocommerce/i, 'WooCommerce'],
  [/gtag\(|googletagmanager\.com/i, 'Google Tag/Analytics'],
]

// Solo marcas propias de las páginas de desafío: un widget de Turnstile o
// reCAPTCHA en el formulario de contacto no significa que el sitio bloquee.
const MARCAS_BLOQUEO = [
  [/<title>\s*just a moment\.\.\.|cf_chl_opt|cf-chl-/i, 'desafío de Cloudflare'],
  [/attention required! \| cloudflare/i, 'bloqueo de Cloudflare'],
  [/sucuri website firewall|access denied - sucuri/i, 'firewall de Sucuri'],
]

function textoPlano(html) {
  return String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizarUrl(valor) {
  const texto = String(valor || '').trim()
  if (!texto) return null
  try {
    const url = new URL(/^https?:\/\//i.test(texto) ? texto : `https://${texto}`)
    if (!/^https?:$/.test(url.protocol) || !url.hostname.includes('.')) return null
    return `${url.protocol}//${url.hostname}${url.pathname === '/' ? '' : url.pathname}`
  } catch {
    return null
  }
}

export function urlDelSitio(proyecto) {
  const datos = proyecto?.proyecto || {}
  const directa = normalizarUrl(datos.contextoTecnico?.sitioActual) || normalizarUrl(datos.infoClave?.dominio)
  if (directa) return directa
  const alcance = datos.alcance || {}
  const textos = [alcance.titulo, datos.descripcion, ...(alcance.conceptos || []).flatMap((c) => [c.descripcion, c.detalle])]
  for (const texto of textos) {
    const hallado = String(texto || '').match(RE_DOMINIO)?.[1]
    const dominio = hallado && dominioDesde(hallado)
    if (dominio) return `https://${dominio}`
  }
  return null
}

async function pedir(url, timeoutMs) {
  const res = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
    headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
  })
  const texto = (await res.text()).slice(0, MAX_HTML)
  return { status: res.status, ok: res.ok, url: res.url || url, texto }
}

function motivoDeError(err) {
  if (err?.name === 'TimeoutError' || err?.name === 'AbortError') return 'no respondió a tiempo'
  const causa = err?.cause?.code || err?.code
  if (causa === 'ENOTFOUND' || causa === 'EAI_AGAIN') return 'el dominio no resuelve'
  if (causa === 'ECONNREFUSED') return 'conexión rechazada'
  if (causa && /CERT|SSL|TLS/i.test(causa)) return 'certificado SSL inválido'
  return `sin conexión${causa ? ` (${causa})` : ''}`
}

function unicos(lista, max) {
  return [...new Set(lista.filter(Boolean))].slice(0, max)
}

function encabezados(html) {
  const lista = []
  for (const m of html.matchAll(/<h([1-3])\b[^>]*>([\s\S]*?)<\/h\1>/gi)) {
    const texto = textoPlano(m[2]).slice(0, 120)
    if (texto) lista.push(`h${m[1]}: ${texto}`)
    if (lista.length >= 30) break
  }
  return lista
}

function enlacesInternos(html, base) {
  const host = base.hostname.replace(/^www\./, '')
  const rutas = []
  for (const m of html.matchAll(/<a\b[^>]*\bhref\s*=\s*(?:"([^"#]*)"|'([^'#]*)'|([^\s>#"']+))/gi)) {
    const href = m[1] ?? m[2] ?? m[3]
    if (!href) continue
    try {
      const url = new URL(href, base)
      if (!/^https?:$/.test(url.protocol) || url.hostname.replace(/^www\./, '') !== host) continue
      if (/\.(jpe?g|png|gif|webp|svg|pdf|zip|mp4|css|js|xml)$/i.test(url.pathname)) continue
      rutas.push(url.pathname)
    } catch { /* href inválido */ }
  }
  return unicos(rutas, 40)
}

function rutasDeLocs(xml) {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => {
    try { return new URL(m[1].replace(/&amp;/g, '&')).pathname } catch { return null }
  }).filter(Boolean)
}

async function leerSitemap(origen) {
  for (const ruta of ['/sitemap.xml', '/sitemap_index.xml', '/wp-sitemap.xml']) {
    try {
      const r = await pedir(`${origen}${ruta}`, TIMEOUT_SITEMAP_MS)
      if (!r.ok || !/<(urlset|sitemapindex)\b/i.test(r.texto)) continue
      if (!/<sitemapindex\b/i.test(r.texto)) {
        const rutas = rutasDeLocs(r.texto)
        return { url: ruta, total: rutas.length, rutas: unicos(rutas, 50) }
      }
      // Índice de sitemaps (Yoast, WordPress): se leen los primeros hijos.
      const hijos = [...r.texto.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1].replace(/&amp;/g, '&')).slice(0, 4)
      const rutas = []
      for (const hijo of hijos) {
        try {
          const h = await pedir(hijo, TIMEOUT_SITEMAP_MS)
          if (h.ok) rutas.push(...rutasDeLocs(h.texto))
        } catch { /* un hijo caído no invalida el resto */ }
      }
      return { url: ruta, sitemapsHijos: hijos.length, total: rutas.length, rutas: unicos(rutas, 50) }
    } catch { /* se intenta la siguiente ruta */ }
  }
  return null
}

function recortar(resumen) {
  const listas = ['rutasSitemap', 'enlacesInternos', 'encabezados']
  let texto = JSON.stringify(resumen)
  while (texto.length > MAX_RESUMEN && listas.some((k) => resumen[k]?.length)) {
    const mayor = listas.reduce((a, b) => ((resumen[a]?.length || 0) >= (resumen[b]?.length || 0) ? a : b))
    resumen[mayor] = resumen[mayor].slice(0, Math.floor(resumen[mayor].length / 2))
    texto = JSON.stringify(resumen)
  }
  return resumen
}

function resumenCortoDe(r) {
  const partes = [
    r.titulo ? `"${r.titulo}"` : null,
    r.sitemap ? `${r.sitemap.total} URLs en el sitemap` : `${r.enlacesInternos.length} enlaces internos en la portada`,
    r.stack.length ? r.stack.join(', ') : null,
  ].filter(Boolean)
  return partes.join(' · ').slice(0, 300)
}

export async function revisarSitioActual(url) {
  if (!url) return { estado: 'sin_sitio' }
  try {
    let home
    try {
      home = await pedir(url, TIMEOUT_HOME_MS)
    } catch (err) {
      return { estado: 'bloqueado', url, motivo: motivoDeError(err) }
    }
    const bloqueo = MARCAS_BLOQUEO.find(([re]) => re.test(home.texto.slice(0, 20000)))
    if (!home.ok || bloqueo) {
      const motivo = [!home.ok && `HTTP ${home.status}`, bloqueo?.[1]].filter(Boolean).join(', ')
      return { estado: 'bloqueado', url: home.url, motivo }
    }

    const final = new URL(home.url)
    const html = home.texto
    const meta = (nombre) => textoPlano(
      html.match(new RegExp(`<meta[^>]+name=["']${nombre}["'][^>]*content=["']([^"']*)["']`, 'i'))?.[1]
      || html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*name=["']${nombre}["']`, 'i'))?.[1],
    ).slice(0, 300)
    const generador = meta('generator')
    const sitemap = await leerSitemap(final.origin)
    const resumen = recortar({
      urlFinal: home.url,
      status: home.status,
      titulo: textoPlano(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]).slice(0, 200),
      descripcion: meta('description'),
      stack: unicos([...MARCAS_STACK.filter(([re]) => re.test(html)).map(([, nombre]) => nombre), generador], 8),
      encabezados: encabezados(html),
      enlacesInternos: enlacesInternos(html, final),
      sitemap: sitemap ? { url: sitemap.url, total: sitemap.total, ...(sitemap.sitemapsHijos ? { sitemapsHijos: sitemap.sitemapsHijos } : {}) } : null,
      rutasSitemap: sitemap?.rutas || [],
    })
    return { estado: 'revisado', url: home.url, resumen, resumenCorto: resumenCortoDe(resumen) }
  } catch (err) {
    return { estado: 'bloqueado', url, motivo: `no se pudo analizar (${String(err?.message || err).slice(0, 80)})` }
  }
}
