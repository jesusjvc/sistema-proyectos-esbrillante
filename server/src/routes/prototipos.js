import { Router } from 'express'
import { timingSafeEqual } from 'crypto'
import { requireAuth } from '../middleware/auth.js'
import {
  listarPrototipos,
  crearPrototipo,
  actualizarPrototipo,
  eliminarPrototipo,
} from '../lib/pagesMcpClient.js'
import prisma from '../lib/prisma.js'
import { enviarEmail } from '../lib/email.js'

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

// GET /api/prototipos — lista todos los prototipos (esbrillante-pages-mcp es la fuente de verdad)
router.get('/', requireAuth, async (req, res) => {
  try {
    res.json(await listarPrototipos())
  } catch (err) {
    console.error(err)
    res.status(502).json({ error: err.message })
  }
})

// POST /api/prototipos — publica un nuevo prototipo/página web, opcionalmente ligado a un proyecto
router.post('/', requireAuth, async (req, res) => {
  const { nombre, tipo, modo, html, url, proyectoSlug, proyectoNombre } = req.body
  if (!nombre) return res.status(400).json({ error: 'nombre es requerido' })
  if (modo === 'url' ? !url : !html) {
    return res.status(400).json({ error: modo === 'url' ? 'url es requerida' : 'html es requerido' })
  }

  try {
    res.json(await crearPrototipo({ nombre, tipo, modo, html, url, proyectoSlug, proyectoNombre }))
  } catch (err) {
    console.error(err)
    res.status(502).json({ error: err.message })
  }
})

// PATCH /api/prototipos/:slug — reasignar proyecto y/o cambiar estado
router.patch('/:slug', requireAuth, async (req, res) => {
  const { proyectoSlug, proyectoNombre, estado } = req.body
  try {
    res.json(await actualizarPrototipo(req.params.slug, { proyectoSlug, proyectoNombre, estado }))
  } catch (err) {
    console.error(err)
    res.status(502).json({ error: err.message })
  }
})

// DELETE /api/prototipos/:slug — es irreversible, pero admin y equipo comparten la gestión de prototipos
router.delete('/:slug', requireAuth, async (req, res) => {
  try {
    res.json(await eliminarPrototipo(req.params.slug))
  } catch (err) {
    console.error(err)
    res.status(502).json({ error: err.message })
  }
})

// Prototipos (bocetos/copy) quedan a cargo de Minuette; páginas web (diseño) a cargo de Mario.
// Sin campo de "asignado" por prototipo — se resuelve por tipo, como acordamos.
const RESPONSABLE_POR_TIPO = {
  prototipo: 'minuette.ruiz@gmail.com',
  pagina_web: 'mruiz.graphics@gmail.com',
}

// POST /api/prototipos/:slug/notificar-revision — llamado por esbrillante-pages-mcp
// (server-to-server, con PROTOTIPOS_NOTIFY_KEY) cuando el cliente da clic en "Terminar
// revisión" en el widget. Avisa por correo a quien tenga a cargo ese tipo de trabajo.
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

async function notificarRevisionTerminada(slug, { nombrePrototipo, urlPrototipo, proyectoSlug, tipo }) {
  const emailResponsable = RESPONSABLE_POR_TIPO[tipo]
  let destinatarios = emailResponsable
    ? await prisma.user.findMany({ where: { email: emailResponsable, activo: true }, select: { email: true, nombre: true } })
    : []

  // Si no se resolvió a nadie (tipo desconocido, o esa cuenta ya no existe/está inactiva), caemos a Admin.
  if (!destinatarios.length) {
    destinatarios = await prisma.user.findMany({ where: { rol: 'ADMIN', activo: true }, select: { email: true, nombre: true } })
  }
  if (!destinatarios.length) return

  let proyecto = null
  if (proyectoSlug) {
    proyecto = await prisma.proyecto.findFirst({ where: { slug: proyectoSlug } })
  }

  const nombreProyecto = proyecto?.cliente?.nombreComercial
  const linkGestion = proyecto
    ? `${process.env.CLIENT_URL || ''}/admin/proyecto/${proyecto.slug}`
    : `${process.env.CLIENT_URL || ''}/admin/prototipos`

  const contexto = nombreProyecto ? ` (proyecto: ${nombreProyecto})` : ''
  const texto =
    `El cliente terminó de revisar "${nombrePrototipo}"${contexto} y dejó sus comentarios.\n\n` +
    `Ver prototipo: ${urlPrototipo}\n` +
    `Gestionar: ${linkGestion}`

  const html = `
    <p>El cliente terminó de revisar <strong>${nombrePrototipo}</strong>${contexto ? ` <span style="color:#64748b">${contexto}</span>` : ''} y dejó sus comentarios.</p>
    <p><a href="${urlPrototipo}">Ver prototipo →</a></p>
    <p><a href="${linkGestion}">Gestionar en el sistema →</a></p>
  `

  await Promise.all(destinatarios.map((a) => enviarEmail({
    to: a.email,
    nombreDestino: a.nombre,
    asunto: `📝 Revisión terminada — ${nombrePrototipo}`,
    texto,
    html,
  })))
}

export default router
