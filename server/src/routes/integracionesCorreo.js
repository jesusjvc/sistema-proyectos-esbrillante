// Correo de soporte → tickets de la mesa de mantenimiento. El puente local
// (correo-bridge/) lee por IMAP el buzón de soporte@esbrillante.mx en
// Google Workspace y le pega aquí con CORREO_INGEST_KEY.
//
// El cruce de datos con el remitente decide el rumbo:
//  - Cliente + sitio identificados → ticket directo (origen "correo") y acuse
//    con folio al remitente.
//  - Solo cliente, o remitente desconocido → queda en la bandeja de
//    pendientes con aviso al equipo; nadie se inventa como cliente.
import { Router } from 'express'
import { createHash, timingSafeEqual } from 'crypto'
import prisma from '../lib/prisma.js'
import { requireAuth } from '../middleware/auth.js'
import { resolverClienteTicket } from '../lib/resolverCliente.js'
import { dominioDesde } from '../lib/clientesCrm.js'
import { enviarEmail } from '../lib/email.js'
import { enviarGoogleChat } from '../lib/googleChat.js'
import { emitirCambio } from '../lib/eventos.js'

const router = Router()

const INCLUDE = {
  cliente: { select: { id: true, crmId: true, nombreComercial: true, contactoNombre: true, correo: true, whatsapp: true } },
  sitio: true,
}

// Server-to-server: solo acepta la key dedicada del worker (patrón
// PROTOTIPOS_NOTIFY_KEY — distinta de la MCP_API_KEY a propósito).
function requireIngestKey(req, res, next) {
  const header = req.headers.authorization || ''
  const [scheme, token] = header.split(' ')
  const expected = process.env.CORREO_INGEST_KEY
  if (scheme === 'Bearer' && token && expected) {
    const a = Buffer.from(token)
    const b = Buffer.from(expected)
    if (a.length === b.length && timingSafeEqual(a, b)) return next()
  }
  res.status(401).json({ error: 'No autorizado' })
}

// Remitentes que no son personas (rebotes, autorespuestas, notificaciones de
// sistemas): contestarles un acuse garantiza un bucle de correo.
const NO_RESPONDER = /^(no-?reply|noreply|no_?responder|mailer-?daemon|postmaster|bounce[s]?|auto-?reply|autorespuesta|notifications?|avisos?|alertas?)@/i

const CORREO_SOPORTE = process.env.CORREO_SOPORTE || 'soporte@esbrillante.mx'

function folioTexto(numero) {
  return `WEB-${String(numero).padStart(4, '0')}`
}

function escapeHtml(texto) {
  return String(texto || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function normalizarDe(valor) {
  // El worker manda "de" ya como dirección, pero un "Nombre <correo>" que se
  // cuele no debe romper el cruce.
  const match = /<([^>]+)>/.exec(String(valor || ''))
  return (match ? match[1] : String(valor || '')).trim().toLowerCase()
}

// Sitio afectado dentro del cliente: si el asunto/cuerpo menciona un dominio
// registrado suyo, ese; si tiene uno solo, ese; ambiguo → null (cola).
async function resolverSitio(cliente, textoBusqueda) {
  const sitios = await prisma.sitio.findMany({ where: { clienteId: cliente.id } })
  if (!sitios.length) return { sitio: null, motivo: `El cliente "${cliente.nombreComercial}" no tiene sitios registrados.` }
  if (sitios.length === 1) return { sitio: sitios[0] }

  const mencionados = new Set()
  for (const sitio of sitios) {
    const dominio = sitio.dominio || dominioDesde(sitio.url)
    if (dominio && textoBusqueda.toLowerCase().includes(dominio)) mencionados.add(sitio.id)
  }
  if (mencionados.size === 1) {
    return { sitio: sitios.find((s) => mencionados.has(s.id)) }
  }
  if (mencionados.size > 1) {
    return { sitio: null, motivo: `Menciona varios sitios del cliente (${sitios.map((s) => s.dominio || s.nombre).join(', ')}).` }
  }
  return { sitio: null, motivo: `El cliente "${cliente.nombreComercial}" tiene ${sitios.length} sitios y el correo no menciona ninguno.` }
}

async function enviarAcuse(to, nombreDestino, folio, asunto) {
  if (!to || NO_RESPONDER.test(to)) return
  const f = folioTexto(folio)
  await enviarEmail({
    to,
    nombreDestino,
    asunto: `Recibimos tu solicitud — ${f}`,
    replyTo: CORREO_SOPORTE,
    texto: `Hola,\n\nRecibimos tu reporte "${asunto}" y quedó registrado con el folio ${f}. Nuestro equipo lo revisará y te contactará si necesitamos más detalles.\n\nSi necesitas agregar información, responde este correo o escríbenos a ${CORREO_SOPORTE}.`,
    html: `
      <p>Hola,</p>
      <p>Recibimos tu reporte <strong>"${escapeHtml(asunto)}"</strong> y quedó registrado con el folio <strong>${f}</strong>.</p>
      <p>Nuestro equipo lo revisará y te contactará si necesitamos más detalles.</p>
      <p style="color:#64748b">Si necesitas agregar información, responde este correo o escríbenos a ${CORREO_SOPORTE}.</p>
    `,
  })
}

async function notificarAdminsPendiente(correo, motivo) {
  const admins = await prisma.user.findMany({ where: { rol: 'ADMIN', activo: true }, select: { email: true, nombre: true } })
  if (!admins.length) return

  const link = `${process.env.CLIENT_URL || ''}/admin/mantenimiento`
  const texto = [
    `Correo de ${correo.de} sin cliente identificado.`,
    `\nAsunto: ${correo.asunto}`,
    motivo ? `\nMotivo: ${motivo}` : '',
    `\nAsígnalo o descártalo desde la mesa de mantenimiento: ${link}`,
  ].join('')

  const html = `
    <p>Llegó un correo a <strong>${CORREO_SOPORTE}</strong> de <strong>${escapeHtml(correo.de)}</strong> que no se pudo cruzar con ningún cliente.</p>
    <p><strong>Asunto:</strong> ${escapeHtml(correo.asunto)}</p>
    ${motivo ? `<p style="color:#64748b">Motivo: ${escapeHtml(motivo)}</p>` : ''}
    <p><a href="${link}">Asignarlo en la mesa de mantenimiento →</a></p>
  `

  await Promise.all(admins.map((a) => enviarEmail({
    to: a.email,
    nombreDestino: a.nombre,
    asunto: `📨 Correo sin cliente — ${correo.asunto.slice(0, 60)}`,
    texto,
    html,
  })))
  enviarGoogleChat(`📨 Correo sin cliente en ${CORREO_SOPORTE} — "${correo.asunto}" (de ${correo.de}). Asignar en ${link}`)
}

// POST /api/integraciones/correo/ingest — entra un correo parseado del worker.
// Siempre responde 2xx salvo error real del server: Cloudflare reintenta los
// 5xx, y un "no cruce con cliente" no es razón para reintentar.
router.post('/ingest', requireIngestKey, async (req, res) => {
  const { messageId, nombreDe, fecha } = req.body || {}
  const de = normalizarDe(req.body?.de)
  const asunto = String(req.body?.asunto || '').trim()
  const texto = String(req.body?.texto || '').trim().slice(0, 20000)

  if (!de || !de.includes('@') || !asunto) {
    return res.status(400).json({ error: 'de y asunto son obligatorios' })
  }

  const id = String(messageId || '').trim()
    || createHash('sha256').update(`${de}|${asunto}|${fecha || ''}`).digest('hex')

  try {
    const duplicado = await prisma.correoEntrante.findUnique({ where: { messageId: id } })
    if (duplicado) return res.json({ ok: true, duplicado: true, estado: duplicado.estado })

    const fechaCorreo = fecha && !Number.isNaN(new Date(fecha).getTime()) ? new Date(fecha) : null
    const base = { messageId: id, de, nombreDe: nombreDe || null, asunto, texto, fechaCorreo }

    let cliente = null
    const notas = []
    if (NO_RESPONDER.test(de)) {
      notas.push('Remitente tipo no-respuesta (rebote/autorespuesta).')
    } else {
      const cruce = await resolverClienteTicket(de).catch(() => ({}))
      cliente = cruce.cliente || null
      if (cruce.aviso) notas.push(cruce.aviso)
      if (!cliente) notas.push('El remitente no cruzó con ningún cliente de Foco ni del CRM.')
    }

    if (cliente) {
      const { sitio, motivo } = await resolverSitio(cliente, `${asunto}\n${texto}`)
      if (sitio) {
        const ticket = await prisma.incidencia.create({
          data: {
            clienteId: cliente.id,
            sitioId: sitio.id,
            titulo: asunto,
            descripcion: texto,
            estado: 'todo',
            origen: 'correo',
            reportadoPor: nombreDe || de,
          },
          include: INCLUDE,
        })
        await prisma.correoEntrante.create({ data: { ...base, estado: 'asignada', incidenciaId: ticket.id } })
        emitirCambio('incidencias')
        enviarAcuse(de, nombreDe, ticket.folio, asunto).catch((err) => console.error('Acuse de correo falló:', err))
        return res.status(201).json({ ok: true, folio: ticket.folio, ticketId: ticket.id })
      }
      notas.push(motivo)
    }

    const correo = await prisma.correoEntrante.create({ data: { ...base, estado: 'pendiente', notas: notas.join(' ') || null } })
    notificarAdminsPendiente(correo, notas.join(' ')).catch((err) => console.error('Aviso de correo pendiente falló:', err))
    return res.status(202).json({ ok: true, pendiente: true, id: correo.id })
  } catch (err) {
    console.error('Ingesta de correo falló:', err)
    res.status(500).json({ error: 'No pudimos procesar el correo' })
  }
})

// ─── Bandeja de pendientes (staff) ──────────────────────────────────────────

// GET /api/integraciones/correo/pendientes
router.get('/pendientes', requireAuth, async (req, res) => {
  try {
    const pendientes = await prisma.correoEntrante.findMany({
      where: { estado: 'pendiente' },
      include: { incidencia: { select: { id: true, folio: true } } },
      orderBy: { creadoEn: 'asc' },
    })
    res.json(pendientes)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'No pudimos cargar los correos pendientes' })
  }
})

// POST /api/integraciones/correo/:id/asignar — dos formas de asignar:
//  a) { incidenciaId } — la UI creó el ticket con el modal normal (origen
//     "correo") y aquí solo se vincula el correo a ese ticket.
//  b) { clienteId, sitioId, tipo?, prioridad?, responsableId? } — se crea el
//     ticket desde la bandeja (cruce hecho a mano).
// En ambos casos se manda el acuse con folio al remitente.
router.post('/:id/asignar', requireAuth, async (req, res) => {
  const { incidenciaId, clienteId, sitioId, tipo, prioridad, responsableId } = req.body || {}
  const TIPOS = ['falla', 'actualizacion', 'preventivo', 'consulta']
  const PRIORIDADES = ['urgente', 'normal', 'cuando_se_pueda']
  if (tipo && !TIPOS.includes(tipo)) return res.status(400).json({ error: 'Tipo inválido' })
  if (prioridad && !PRIORIDADES.includes(prioridad)) return res.status(400).json({ error: 'Prioridad inválida' })

  try {
    const correo = await prisma.correoEntrante.findUnique({ where: { id: req.params.id } })
    if (!correo) return res.status(404).json({ error: 'Correo no encontrado' })
    if (correo.estado !== 'pendiente') return res.status(409).json({ error: `Ese correo ya está ${correo.estado}` })

    let ticket
    if (incidenciaId) {
      ticket = await prisma.incidencia.findUnique({ where: { id: incidenciaId }, include: INCLUDE })
      if (!ticket) return res.status(404).json({ error: 'Ticket no encontrado' })
    } else {
      if (!clienteId || !sitioId) return res.status(400).json({ error: 'Cliente y sitio son obligatorios' })
      const sitio = await prisma.sitio.findFirst({ where: { id: sitioId, clienteId } })
      if (!sitio) return res.status(400).json({ error: 'El sitio no pertenece al cliente seleccionado' })
      if (responsableId && !(await prisma.user.findFirst({ where: { id: responsableId, activo: true }, select: { id: true } }))) {
        return res.status(400).json({ error: 'El responsable no es un usuario activo' })
      }
      ticket = await prisma.incidencia.create({
        data: {
          clienteId,
          sitioId,
          titulo: correo.asunto,
          descripcion: correo.texto,
          estado: 'todo',
          origen: 'correo',
          tipo: tipo || 'falla',
          prioridad: prioridad || 'normal',
          cobertura: sitio.coberturaMantenimiento || 'por_valorar',
          infraestructura: sitio.infraestructura || 'sin_localizar',
          responsableId: responsableId || null,
          reportadoPor: correo.nombreDe || correo.de,
        },
        include: INCLUDE,
      })
      emitirCambio('incidencias')
    }

    await prisma.correoEntrante.update({ where: { id: correo.id }, data: { estado: 'asignada', incidenciaId: ticket.id } })
    enviarAcuse(correo.de, correo.nombreDe, ticket.folio, correo.asunto).catch((err) => console.error('Acuse de correo falló:', err))
    res.status(201).json(ticket)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'No pudimos asignar el correo' })
  }
})

// POST /api/integraciones/correo/:id/descartar
router.post('/:id/descartar', requireAuth, async (req, res) => {
  try {
    const correo = await prisma.correoEntrante.findUnique({ where: { id: req.params.id } })
    if (!correo) return res.status(404).json({ error: 'Correo no encontrado' })
    if (correo.estado !== 'pendiente') return res.status(409).json({ error: `Ese correo ya está ${correo.estado}` })
    const actualizado = await prisma.correoEntrante.update({
      where: { id: correo.id },
      data: { estado: 'descartada', notas: `${correo.notas || ''} Descartada por ${req.user.nombre}.`.trim() },
    })
    res.json(actualizado)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'No pudimos descartar el correo' })
  }
})

export default router
