import { Router } from 'express'
import { baseUrl, urlPublicaPrototipos, urlPublicaApi } from '../lib/baseUrl.js'
import { logEntry } from '../lib/logEntry.js'
import { resolverIdentidadRevisor } from '../lib/identidadRevisor.js'
import { fetchHtmlExterno, inyectarWidgetProxy, paginaErrorProxy } from '../lib/externalProxy.js'
import { ASSET_VERSION } from '../lib/assetVersion.js'
import { notificarRevisionTerminada } from '../lib/notificarRevision.js'
import { emitirCambioAnotaciones, suscribirseAnotaciones } from '../lib/eventos.js'
import {
  obtenerPrototipoPorSlug,
  finalizarRevisionCliente,
} from '../lib/prototipoService.js'
import {
  listarAnotaciones,
  crearAnotacion,
  actualizarAnotacion,
  eliminarAnotacion,
} from '../lib/anotacionService.js'

const router = Router()

const PAGE_404 = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Página no encontrada — Foco</title>
  <style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f0f0f1;}</style>
</head>
<body>
  <h1 style="color:#000;font-family:system-ui,sans-serif;">404 — Página no encontrada</h1>
</body>
</html>`

// Identidad del autor de una anotación o acción: si hay sesión de staff real
// (ver identidadRevisor.js), se usa ESA — nunca lo que mande el body, que
// cualquiera con el link podría falsificar. Sin sesión (cliente externo sin
// cuenta en Foco), se mantiene el flujo actual: lo que mande el body.
function identidadDe(req) {
  const real = resolverIdentidadRevisor(req)
  if (real) return { autor: real.nombre, rol: real.rol, userId: real.userId }
  return { autor: req.body?.autor, rol: req.body?.rol, userId: null }
}

// Deja rastro en el historial del proyecto de cualquier escritura hecha por
// alguien con sesión real — "mejor esfuerzo": si el prototipo no tiene
// proyecto asignado, o falla el log, no debe tumbar la respuesta ya aplicada.
async function auditar(prototipo, userId, autor, accion, detalle = '') {
  if (!userId || !prototipo.proyectoId) return
  try {
    await logEntry(prototipo.proyectoId, autor, accion, detalle)
  } catch (err) {
    console.error('No se pudo registrar en el historial una acción sobre un prototipo:', err)
  }
}

// Las páginas solo se sirven en el dominio público de prototipos: ahí no existe
// la cookie de staff de Foco. Servidas desde el host del API, el HTML arbitrario
// de un prototipo (o los scripts de un sitio proxeado) correría en el mismo
// origen que todo el API con la sesión del staff disponible. Solo GET: el POST
// de finalizar-revision lo manda el widget al host del API a propósito.
router.use('/p', (req, res, next) => {
  const publica = process.env.PROTOTIPOS_PUBLIC_URL
  if (!publica || req.method !== 'GET') return next()
  const destino = new URL(publica)
  if (req.get('host') === destino.host) return next()
  res.redirect(302, `${destino.origin}${req.originalUrl}`)
})

// "¿Quién soy?" del widget: lo llama con credentials:'include' contra el host
// del API, que es donde el navegador manda la cookie de sesión de Foco.
router.get('/api/prototipos/yo', (req, res) => {
  const real = resolverIdentidadRevisor(req)
  res.set('Cache-Control', 'no-store')
  res.json({ sesion: real ? { nombre: real.nombre, rol: real.rol } : null })
})

router.get('/p/:slug', async (req, res) => {
  const { slug } = req.params
  const prototipo = await obtenerPrototipoPorSlug(slug)
  if (!prototipo) return res.status(404).type('html').send(PAGE_404)

  const tipo = prototipo.tipo === 'pagina_web' ? 'pagina_web' : 'prototipo'
  const base = baseUrl(req)
  const widgetBase = urlPublicaApi(req)

  // Página externa (sin HTML local) — proxy de la URL real, inyectando el
  // mismo widget de revisión para que sus funciones que necesitan DOM directo
  // (marcar para eliminar, sugerir cambio de texto, pines en coordenadas de
  // documento) funcionen igual que con una página local.
  if (!prototipo.html && prototipo.urlExterna) {
    try {
      const { html: htmlExterno, finalUrl } = await fetchHtmlExterno(prototipo.urlExterna)
      res.type('html').send(inyectarWidgetProxy(htmlExterno, finalUrl, tipo, slug, base, widgetBase))
    } catch (err) {
      console.error(`Error proxeando "${prototipo.urlExterna}":`, err)
      res.status(502).type('html').send(paginaErrorProxy(prototipo.urlExterna))
    }
    return
  }

  if (!prototipo.html) return res.status(404).type('html').send(PAGE_404)

  // El widget de revisión está activo por default en toda página publicada;
  // se inyecta con src absoluto (no ruta raíz-relativa) para que revision.js
  // siga hablando con este servidor incluso si la página trae su propio
  // <base> (caso proxy de arriba).
  const tag = `<script src="${widgetBase}/resources/gsap.min.js?v=${ASSET_VERSION}"></script><script src="${widgetBase}/resources/revision.js?v=${ASSET_VERSION}" data-tipo="${tipo}"></script>`
  const html = /<\/body>/i.test(prototipo.html)
    ? prototipo.html.replace(/<\/body>/i, `${tag}</body>`)
    : prototipo.html + tag
  res.type('html').send(html)
})

router.get('/p/:slug/download', async (req, res) => {
  const { slug } = req.params
  const prototipo = await obtenerPrototipoPorSlug(slug)
  if (!prototipo) return res.status(404).type('html').send(PAGE_404)

  if (!prototipo.html && prototipo.urlExterna) {
    try {
      const { html } = await fetchHtmlExterno(prototipo.urlExterna)
      res.set('Content-Disposition', `attachment; filename="${slug}.html"`)
      res.type('html').send(html)
    } catch {
      res.status(502).type('html').send(paginaErrorProxy(prototipo.urlExterna))
    }
    return
  }

  if (!prototipo.html) return res.status(404).type('html').send(PAGE_404)
  res.set('Content-Disposition', `attachment; filename="${slug}.html"`)
  res.type('html').send(prototipo.html)
})

// Disparado por el widget de revisión cuando alguien (cliente o equipo) da
// clic en "Terminar revisión" — mismo nivel de acceso público que
// /api/anotaciones (cualquiera con el link ya puede comentar). Avisa por correo
// al responsable (antes lo hacía el servicio viejo vía HTTP a notificar-revision)
// y, si quien lo dispara tiene sesión real de Foco, queda auditado en el historial.
router.post('/p/:slug/finalizar-revision', async (req, res) => {
  const { slug } = req.params
  const entry = await finalizarRevisionCliente(slug)
  if (!entry) return res.status(404).json({ error: 'Página no encontrada' })

  const { autor, userId } = identidadDe(req)
  await auditar(entry, userId, autor, 'Revisión de prototipo terminada')
  // Sin await: el correo no debe hacer esperar ni tumbar la respuesta al widget.
  notificarRevisionTerminada(slug, {
    nombrePrototipo: entry.nombreOriginal,
    urlPrototipo: `${urlPublicaPrototipos(req)}/p/${slug}`,
    proyectoSlug: entry.proyecto?.slug ?? null,
    tipo: entry.tipo,
  }).catch((err) => console.error('No se pudo avisar la revisión terminada:', err))
  res.json({ ok: true, estado: entry.estado })
})

// Sub-páginas de un sitio externo multipágina (menú de navegación real, ej.
// Elementor/WordPress): reescribirLinksProxy ya reescribió los <a href> del
// sitio para que apunten aquí en vez de al dominio real, así que cualquier
// página que el equipo/cliente visite desde el menú sigue pasando por el
// proxy y conserva el widget de revisión. Solo aplica a páginas externas —
// los prototipos locales (un único archivo HTML) no tienen sub-rutas.
router.get('/p/:slug/*', async (req, res) => {
  const { slug } = req.params
  const prototipo = await obtenerPrototipoPorSlug(slug)
  if (!prototipo || prototipo.html || !prototipo.urlExterna) return res.status(404).type('html').send(PAGE_404)

  const tipo = prototipo.tipo === 'pagina_web' ? 'pagina_web' : 'prototipo'
  const prefix = `/p/${slug}`
  const resto = req.originalUrl.startsWith(prefix) ? req.originalUrl.slice(prefix.length) : '/'
  const origenExterno = new URL(prototipo.urlExterna).origin
  const targetUrl = origenExterno + (resto || '/')

  try {
    const { html: htmlExterno, finalUrl } = await fetchHtmlExterno(targetUrl)
    res.type('html').send(inyectarWidgetProxy(htmlExterno, finalUrl, tipo, slug, baseUrl(req), urlPublicaApi(req)))
  } catch (err) {
    console.error(`Error proxeando sub-página "${targetUrl}":`, err)
    res.status(502).type('html').send(paginaErrorProxy(targetUrl))
  }
})

router.get('/api/anotaciones/:slug', async (req, res) => {
  const { slug } = req.params
  const prototipo = await obtenerPrototipoPorSlug(slug)
  if (!prototipo) return res.status(404).json({ error: 'Prototipo no encontrado' })
  const anns = await listarAnotaciones(prototipo.id, req.query.estado)
  res.json(anns)
})

// Server-Sent Events: avisa a los widgets de revisión abiertos en este slug
// que hay anotaciones nuevas/cambiadas, para que varias personas revisando el
// mismo prototipo a la vez se vean entre sí sin recargar. Mismo nivel de
// acceso público que el resto de /api/anotaciones — no manda el contenido,
// solo un aviso de "algo cambió" para que el cliente vuelva a pedir la lista.
router.get('/api/anotaciones/:slug/eventos', (req, res) => {
  const { slug } = req.params
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  })
  res.write('\n')
  const keepAlive = setInterval(() => res.write(':ping\n\n'), 25000)
  const cancelar = suscribirseAnotaciones((evento) => {
    if (evento.slug === slug) res.write(`data: ${JSON.stringify(evento)}\n\n`)
  })
  req.on('close', () => { clearInterval(keepAlive); cancelar() })
})

router.post('/api/anotaciones/:slug', async (req, res) => {
  const { slug } = req.params
  const prototipo = await obtenerPrototipoPorSlug(slug)
  if (!prototipo) return res.status(404).json({ error: 'Prototipo no encontrado' })

  const { autor, rol, userId } = identidadDe(req)
  try {
    const ann = await crearAnotacion(prototipo.id, { ...req.body, autor, rol })
    await auditar(prototipo, userId, autor, 'Comentario en prototipo', `${ann.tipo} — ${(ann.contenido?.texto || '').slice(0, 80)}`)
    emitirCambioAnotaciones(slug)
    res.status(201).json(ann)
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) })
  }
})

router.patch('/api/anotaciones/:slug/:id', async (req, res) => {
  const { slug, id } = req.params
  const prototipo = await obtenerPrototipoPorSlug(slug)
  if (!prototipo) return res.status(404).json({ error: 'Prototipo no encontrado' })

  const { userId, autor } = identidadDe(req)
  try {
    const ann = await actualizarAnotacion(prototipo.id, id, req.body)
    if (!ann) return res.status(404).json({ error: 'Anotación no encontrada' })
    await auditar(prototipo, userId, autor, req.body?.estado === 'resuelto' ? 'Comentario de prototipo resuelto' : 'Comentario de prototipo editado')
    emitirCambioAnotaciones(slug)
    res.json(ann)
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) })
  }
})

router.delete('/api/anotaciones/:slug/:id', async (req, res) => {
  const { slug, id } = req.params
  const prototipo = await obtenerPrototipoPorSlug(slug)
  if (!prototipo) return res.status(404).json({ error: 'Prototipo no encontrado' })

  const { userId, autor } = identidadDe(req)
  const deleted = await eliminarAnotacion(prototipo.id, id)
  if (!deleted) return res.status(404).json({ error: 'Anotación no encontrada' })
  await auditar(prototipo, userId, autor, 'Comentario de prototipo eliminado')
  emitirCambioAnotaciones(slug)
  res.json({ ok: true })
})

export default router
