import prisma from './prisma.js'
import { enviarEmail } from './email.js'
import { enviarGoogleChat } from './googleChat.js'
import { urlPanel } from './urlPanel.js'

// Prototipos (bocetos/copy) quedan a cargo de Minuette; páginas web (diseño) a cargo de Mario.
// Sin campo de "asignado" por prototipo — se resuelve por tipo, como acordamos.
const RESPONSABLE_POR_TIPO = {
  prototipo: 'minuette.ruiz@gmail.com',
  pagina_web: 'mruiz.graphics@gmail.com',
}

// Escapa también comillas porque se usa dentro de atributos href.
function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// Avisa por correo (y Google Chat) a quien tenga a cargo ese tipo de trabajo que
// alguien dio clic en "Terminar revisión" en el widget.
export async function notificarRevisionTerminada(slug, { nombrePrototipo, urlPrototipo, proyectoSlug, tipo }) {
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
    ? `${urlPanel()}/admin/proyecto/${proyecto.slug}`
    : `${urlPanel()}/admin/prototipos`

  const contexto = nombreProyecto ? ` (proyecto: ${nombreProyecto})` : ''
  const texto =
    `El cliente terminó de revisar "${nombrePrototipo}"${contexto} y dejó sus comentarios.\n\n` +
    `Ver prototipo: ${urlPrototipo}\n` +
    `Gestionar: ${linkGestion}`

  const html = `
    <p>El cliente terminó de revisar <strong>${escapeHtml(nombrePrototipo)}</strong>${contexto ? ` <span style="color:#64748b">${escapeHtml(contexto)}</span>` : ''} y dejó sus comentarios.</p>
    <p><a href="${escapeHtml(urlPrototipo)}">Ver prototipo →</a></p>
    <p><a href="${escapeHtml(linkGestion)}">Gestionar en el sistema →</a></p>
  `

  await Promise.all(destinatarios.map((a) => enviarEmail({
    to: a.email,
    nombreDestino: a.nombre,
    asunto: `📝 Revisión terminada — ${nombrePrototipo}`,
    texto,
    html,
  })))
  enviarGoogleChat(`📝 Revisión terminada — ${nombrePrototipo}\n${texto}`)
}
