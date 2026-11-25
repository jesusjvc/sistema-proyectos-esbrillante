import { Router } from 'express'
import { timingSafeEqual } from 'crypto'
import { requireAuth } from '../middleware/auth.js'
import prisma from '../lib/prisma.js'
import { urlPublicaPrototipos } from '../lib/baseUrl.js'
import { logEntry } from '../lib/logEntry.js'
import { notificarRevisionTerminada } from '../lib/notificarRevision.js'
import {
  listarPrototipos,
  obtenerPrototipoPorSlug,
  publicarPrototipo,
  registrarPaginaExterna,
  asignarProyecto,
  cambiarEstado,
  eliminarPrototipo,
} from '../lib/prototipoService.js'

const router = Router()

function requireNotifyKey(req, res, next) {
  const header = req.headers.authorization || ''
  const [scheme, token] = header.split(' ')
  const expected = process.env.PROTOTIPOS_NOTIFY_KEY
  if (scheme === 'Bearer' && token && expected) {
    const a = Buffer.from(token)
    const b = Buffer.from(expected)
    if (a.length === b.length && timingSafeEqual(a, b)) return next()
  }
  res.status(401).json({ error: 'No autorizado' })
}

// Mismo formato que devolvía el servicio viejo (PageMeta de esbrillante-pages-mcp),
// porque el frontend lee esos campos tal cual.
function aPageMeta(p, base) {
  return {
    slug: p.slug,
    nombre_original: p.nombreOriginal,
    url: `${base}/p/${p.slug}`,
    archivo: p.urlExterna ? undefined : `${p.slug}.html`,
    urlExterna: p.urlExterna ?? undefined,
    fecha_creacion: p.creadoEn,
    fecha_actualizacion: p.actualizadoEn,
    version: p.version,
    proyectoSlug: p.proyectoSlug ?? p.proyecto?.slug ?? undefined,
    proyectoNombre: p.proyectoNombre ?? p.proyecto?.cliente?.nombreComercial ?? undefined,
    tipo: p.tipo,
    estado: p.estado,
    comentariosPendientes: p.comentariosPendientes,
  }
}

// Los servicios lanzan Error plano para validaciones ("No existe...", "Slug
// inválido...") y dejan pasar los errores de Prisma/DB tal cual — esos sí son 500.
function responderError(res, err) {
  if (err?.code || err?.name?.startsWith('Prisma')) {
    console.error(err)
    return res.status(500).json({ error: 'Error interno' })
  }
  const mensaje = err instanceof Error ? err.message : String(err)
  res.status(mensaje.startsWith('No existe') ? 404 : 400).json({ error: mensaje })
}

async function proyectoIdDeSlug(proyectoSlug) {
  if (!proyectoSlug) return null
  const proyecto = await prisma.proyecto.findUnique({ where: { slug: proyectoSlug }, select: { id: true } })
  if (!proyecto) throw new Error(`No existe el proyecto "${proyectoSlug}".`)
  return proyecto.id
}

async function auditar(proyectoId, usuario, accion, detalle) {
  if (!proyectoId) return
  try {
    await logEntry(proyectoId, usuario.nombre, accion, detalle)
  } catch (err) {
    console.error('No se pudo registrar en el historial una acción sobre un prototipo:', err)
  }
}

// GET /api/prototipos — lista todos los prototipos
router.get('/', requireAuth, async (req, res) => {
  try {
    const base = urlPublicaPrototipos(req)
    res.json((await listarPrototipos()).map((p) => aPageMeta(p, base)))
  } catch (err) {
    responderError(res, err)
  }
})

// POST /api/prototipos — publica un nuevo prototipo/página web, opcionalmente ligado a un proyecto
router.post('/', requireAuth, async (req, res) => {
  const { nombre, tipo, modo, html, url, accion, proyectoSlug } = req.body
  if (!nombre?.trim()) return res.status(400).json({ error: 'nombre es requerido' })
  if (modo === 'url' ? !url?.trim() : !html) {
    return res.status(400).json({ error: modo === 'url' ? 'url es requerida' : 'html es requerido' })
  }

  try {
    const proyectoId = await proyectoIdDeSlug(proyectoSlug)
    const base = urlPublicaPrototipos(req)

    if (modo === 'url') {
      const creado = await registrarPaginaExterna({ nombre: nombre.trim(), urlExterna: url.trim(), proyectoId })
      await auditar(proyectoId, req.user, 'Página web registrada', `${creado.nombreOriginal} — ${base}/p/${creado.slug}`)
      return res.json(aPageMeta(creado, base))
    }

    const tipoValido = tipo === 'pagina_web' ? 'pagina_web' : 'prototipo'
    const resultado = await publicarPrototipo({ nombre: nombre.trim(), html, accion, tipo: tipoValido, proyectoId })
    if (resultado.slug) {
      await auditar(proyectoId, req.user, 'Prototipo publicado', `${nombre.trim()} — ${base}/p/${resultado.slug}`)
    }
    res.json(resultado)
  } catch (err) {
    responderError(res, err)
  }
})

// PATCH /api/prototipos/:slug — reasignar proyecto y/o cambiar estado
router.patch('/:slug', requireAuth, async (req, res) => {
  const { slug } = req.params
  const { proyectoSlug, estado } = req.body
  try {
    if (proyectoSlug !== undefined) await asignarProyecto(slug, await proyectoIdDeSlug(proyectoSlug))
    if (estado !== undefined) await cambiarEstado(slug, estado)

    const actualizado = await obtenerPrototipoPorSlug(slug)
    if (!actualizado) return res.status(404).json({ error: `No existe la página con slug "${slug}".` })
    if (proyectoSlug !== undefined) await auditar(actualizado.proyectoId, req.user, 'Prototipo asignado al proyecto', actualizado.nombreOriginal)
    if (estado !== undefined) await auditar(actualizado.proyectoId, req.user, 'Estado de prototipo cambiado', `${actualizado.nombreOriginal} → ${estado}`)
    res.json(aPageMeta(actualizado, urlPublicaPrototipos(req)))
  } catch (err) {
    responderError(res, err)
  }
})

// DELETE /api/prototipos/:slug — es irreversible, pero admin y equipo comparten la gestión de prototipos
router.delete('/:slug', requireAuth, async (req, res) => {
  const { slug } = req.params
  try {
    const existente = await obtenerPrototipoPorSlug(slug)
    const mensaje = await eliminarPrototipo(slug)
    await auditar(existente?.proyectoId, req.user, 'Prototipo eliminado', existente?.nombreOriginal || slug)
    res.json({ ok: true, mensaje })
  } catch (err) {
    responderError(res, err)
  }
})

// POST /api/prototipos/:slug/notificar-revision — llamado por esbrillante-pages-mcp
// (server-to-server, con PROTOTIPOS_NOTIFY_KEY) cuando el cliente da clic en "Terminar
// revisión" en el widget. Se mantiene mientras el servicio viejo siga sirviendo
// tráfico (hasta el corte); las páginas ya servidas por Foco avisan directo desde
// prototiposPublico.js.
router.post('/:slug/notificar-revision', requireNotifyKey, async (req, res) => {
  const { nombrePrototipo, urlPrototipo, proyectoSlug, tipo } = req.body
  try {
    await notificarRevisionTerminada(req.params.slug, { nombrePrototipo, urlPrototipo, proyectoSlug, tipo })
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Error interno' })
  }
})

export default router
