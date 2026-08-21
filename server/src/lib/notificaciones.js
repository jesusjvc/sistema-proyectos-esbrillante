import { enviarEmail } from './email.js'

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
