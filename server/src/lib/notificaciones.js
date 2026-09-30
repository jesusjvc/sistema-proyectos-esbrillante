import { enviarEmail } from './email.js'
import prisma from './prisma.js'
import { idsDeRol } from './permisos.js'
import { destinatariosDeTarea } from './tareaHelpers.js'
import { crearNotificacion } from './notificacionesHelper.js'

const ROLES_EQUIPO_TAREA = ['copy', 'disenador', 'programador', 'redes']

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// Avisa por correo a cada usuario mencionado con "@" en un comentario de una
// tarea. Fire-and-forget: no lanza si Mailjet no está configurado o algún
// envío falla (ver enviarEmail). `usuarios` trae { email, nombre, rol } —
// el link cambia según el rol para no mandar a un equipo a una ruta de admin
// (o viceversa) que lo expulsaría por el guard de rutas del frontend.
export async function notificarMencion(proyecto, tarea, autor, texto, usuarios) {
  if (!usuarios.length) return

  const nombreCliente = proyecto.cliente?.nombreComercial || proyecto.slug
  const clientUrl = process.env.CLIENT_URL || ''

  await Promise.all(usuarios.map((u) => {
    const base = u.rol === 'ADMIN' ? '/admin' : '/equipo'
    const linkProyecto = `${clientUrl}${base}/proyecto/${proyecto.slug}`

    const textoPlano = `${autor} te mencionó en "${tarea.titulo}" (${nombreCliente}):\n\n${texto}\n\nVer proyecto: ${linkProyecto}`
    const html = `
      <p><strong>${escapeHtml(autor)}</strong> te mencionó en "<strong>${escapeHtml(tarea.titulo)}</strong>" (${escapeHtml(nombreCliente)}).</p>
      <p>${escapeHtml(texto)}</p>
      <p><a href="${linkProyecto}">Ver proyecto en el sistema →</a></p>
    `

    return enviarEmail({
      to: u.email,
      nombreDestino: u.nombre,
      asunto: `💬 ${autor} te mencionó — ${tarea.titulo}`,
      texto: textoPlano,
      html,
    })
  }))
}

// Usuarios a quienes avisar por la asignación de una tarea: las personas que
// ocupan el rol del responsable en el equipo del proyecto, las Karlas si el
// responsable es "karla", o la persona asignada directamente (responsable =
// su userId). "equipo" (nadie en particular), "admin" y "cliente" no
// disparan correo — "equipo" es justo el caso de tarea sin asignar y
// avisarles a todos los admin sería ruido para el propio asignador.
async function destinatariosDe(proyecto, responsable) {
  let ids = []
  if (ROLES_EQUIPO_TAREA.includes(responsable)) {
    ids = idsDeRol(proyecto.equipo, responsable)
  } else if (responsable === 'karla') {
    const karlas = await prisma.user.findMany({ where: { esKarla: true, activo: true }, select: { id: true } })
    ids = karlas.map((k) => k.id)
  } else if (responsable && !['equipo', 'admin', 'cliente'].includes(responsable)) {
    ids = [responsable]
  }
  if (!ids.length) return []
  return prisma.user.findMany({ where: { id: { in: ids }, activo: true }, select: { id: true, email: true, nombre: true, rol: true } })
}

// Avisa por correo que una o varias tareas quedaron asignadas a alguien.
// Agrupa por destinatario (una acción masiva sobre N tareas = UN solo correo
// por persona, con la lista) y nunca avisa a quien hizo la asignación. Como
// notificarMencion, es fire-and-forget: si el correo no está configurado o
// un envío falla, se registra en consola pero no interrumpe la operación.
export async function notificarAsignacion(proyecto, tareas, actor) {
  try {
    const porUsuario = new Map()
    for (const tarea of tareas) {
      for (const u of await destinatariosDe(proyecto, tarea.responsable)) {
        if (u.id === actor?.id) continue
        if (!porUsuario.has(u.id)) porUsuario.set(u.id, { usuario: u, tareas: [] })
        porUsuario.get(u.id).tareas.push(tarea)
      }
    }
    if (!porUsuario.size) return

    const nombreCliente = proyecto.cliente?.nombreComercial || proyecto.slug
    const clientUrl = process.env.CLIENT_URL || ''

    await Promise.all([...porUsuario.values()].map(({ usuario, tareas }) => {
      const base = usuario.rol === 'ADMIN' ? '/admin' : '/equipo'
      const linkProyecto = `${clientUrl}${base}/proyecto/${proyecto.slug}`
      const una = tareas.length === 1
      const autor = actor?.nombre || 'Alguien'

      const texto = [
        `${autor} te asignó ${una ? 'una tarea' : `${tareas.length} tareas`} en ${nombreCliente}:`,
        '',
        ...tareas.map((t) => `- ${t.titulo}`),
        '',
        `Ver proyecto: ${linkProyecto}`,
      ].join('\n')

      const html = `
        <p><strong>${escapeHtml(autor)}</strong> te asignó ${una ? 'una tarea' : `${tareas.length} tareas`} en <strong>${escapeHtml(nombreCliente)}</strong>:</p>
        <ul>${tareas.map((t) => `<li><strong>${escapeHtml(t.titulo)}</strong></li>`).join('')}</ul>
        <p><a href="${linkProyecto}">Ver proyecto en el sistema →</a></p>
      `

      return enviarEmail({
        to: usuario.email,
        nombreDestino: usuario.nombre,
        asunto: `${una ? '📌 Nueva tarea asignada' : `📌 ${tareas.length} tareas asignadas`} — ${nombreCliente}`,
        texto,
        html,
      })
    }))
  } catch (err) {
    console.error('notificarAsignacion falló:', err?.message || err)
  }
}

// Avisa al equipo responsable de una tarea que quedó desbloqueada porque el
// cliente ya envió la información que se le pidió. In-app + correo, con el
// enlace al proyecto y el excerpt de lo que respondió.
export async function notificarInformacionLista(proyecto, tareaDesbloqueada, tareaCliente, respuesta) {
  try {
    const destinatarioIds = await destinatariosDeTarea(tareaDesbloqueada, proyecto.equipo)
    if (!destinatarioIds.length) return

    const usuarios = await prisma.user.findMany({
      where: { id: { in: destinatarioIds }, activo: true },
      select: { id: true, email: true, nombre: true, rol: true },
    })
    if (!usuarios.length) return

    const nombreCliente = proyecto.cliente?.nombreComercial || proyecto.slug
    const clientUrl = process.env.CLIENT_URL || ''

    await crearNotificacion({
      destinatarioIds: usuarios.map((u) => u.id),
      tipo: 'tarea_informacion_lista',
      mensaje: `El cliente envió la información — "${tareaDesbloqueada.titulo}" ya está desbloqueada`,
      proyecto,
      tarea: tareaDesbloqueada,
    })

    await Promise.all(usuarios.map((u) => {
      const base = u.rol === 'ADMIN' ? '/admin' : '/equipo'
      const linkProyecto = `${clientUrl}${base}/proyecto/${proyecto.slug}`
      const excerpt = respuesta?.texto ? `Respuesta del cliente: "${respuesta.texto.slice(0, 300)}"` : ''
      const archivo = respuesta?.archivoUrl ? `\nArchivo: ${respuesta.archivoUrl}` : ''

      const texto = [
        `El cliente ya envió la información que se le pidió en "${tareaCliente.titulo}" (${nombreCliente}).`,
        excerpt,
        `Puedes continuar con: "${tareaDesbloqueada.titulo}"`,
        '',
        `Ver proyecto: ${linkProyecto}`,
      ].filter(Boolean).join('\n')

      const html = `
        <p>El cliente ya envió la información que se le pidió en <strong>${escapeHtml(tareaCliente.titulo)}</strong> (${escapeHtml(nombreCliente)}).</p>
        ${excerpt ? `<p>${escapeHtml(excerpt)}</p>` : ''}
        ${respuesta?.archivoUrl ? `<p><a href="${respuesta.archivoUrl}">Ver el archivo que subió →</a></p>` : ''}
        <p>Puedes continuar con: <strong>${escapeHtml(tareaDesbloqueada.titulo)}</strong></p>
        <p><a href="${linkProyecto}">Ver proyecto en el sistema →</a></p>
      `

      return enviarEmail({
        to: u.email,
        nombreDestino: u.nombre,
        asunto: `📩 Información lista del cliente — ${tareaDesbloqueada.titulo}`,
        texto,
        html,
      })
    }))
  } catch (err) {
    console.error('notificarInformacionLista falló:', err?.message || err)
  }
}