import prisma from './prisma.js'
import { enviarEmail } from './email.js'

const HORA_MS = 3600_000
const DIA_MS = 24 * HORA_MS

function tareaVencida(t) {
  return t.esCliente && t.estado === 'pendiente' && t.disponibleDesde && t.plazoHoras
    && (Date.now() - new Date(t.disponibleDesde).getTime()) > t.plazoHoras * HORA_MS
}

function elegibleParaRecordatorio(t) {
  if (t.avisosDesactivados) return false
  if (!t.ultimoRecordatorioEn) return true
  return (Date.now() - new Date(t.ultimoRecordatorioEn).getTime()) >= DIA_MS
}

function formatoAtraso(disponibleDesde, plazoHoras) {
  const venceEn = new Date(disponibleDesde).getTime() + plazoHoras * HORA_MS
  const horasAtraso = Math.floor((Date.now() - venceEn) / HORA_MS)
  if (horasAtraso < 24) return `${horasAtraso} hora${horasAtraso === 1 ? '' : 's'}`
  const dias = Math.floor(horasAtraso / 24)
  return `${dias} día${dias === 1 ? '' : 's'}`
}

// Revisa todos los proyectos activos y envía un correo (uno por proyecto,
// agrupando todas sus tareas vencidas) al cliente cuando alguna tarea suya
// superó su plazoHoras y no tiene los avisos apagados. No reenvía antes de
// 24h por tarea (ultimoRecordatorioEn).
export async function revisarRecordatoriosVencidos() {
  const proyectos = await prisma.proyecto.findMany({
    where: { status: 'activo' },
    include: { tareas: true },
  })

  for (const p of proyectos) {
    const vencidas = p.tareas.filter((t) => tareaVencida(t) && elegibleParaRecordatorio(t))
    if (!vencidas.length) continue

    const correo = p.cliente?.correo
    if (!correo) continue

    const nombreCliente = p.cliente?.nombreComercial || p.slug
    const linkProyecto = `${process.env.CLIENT_URL || ''}/cliente/${p.slug}`

    const items = vencidas.map((t) => ({ titulo: t.titulo, atraso: formatoAtraso(t.disponibleDesde, t.plazoHoras) }))

    const texto = [
      `Hola ${nombreCliente}, tienes actividad${items.length > 1 ? 'es' : ''} pendiente${items.length > 1 ? 's' : ''} que ya pasó su tiempo sugerido:`,
      ...items.map((i) => `- ${i.titulo} (atrasada ${i.atraso})`),
      `\nEntra a tu portal para responder: ${linkProyecto}`,
    ].join('\n')

    const html = `
      <p>Hola <strong>${nombreCliente}</strong>, tienes actividad${items.length > 1 ? 'es' : ''} pendiente${items.length > 1 ? 's' : ''} que ya pasó su tiempo sugerido:</p>
      <ul>${items.map((i) => `<li><strong>${i.titulo}</strong> — atrasada ${i.atraso}</li>`).join('')}</ul>
      <p><a href="${linkProyecto}">Ir a tu portal →</a></p>
    `

    const { enviado } = await enviarEmail({
      to: correo,
      nombreDestino: nombreCliente,
      asunto: `⏰ Tienes ${items.length} actividad${items.length > 1 ? 'es' : ''} pendiente${items.length > 1 ? 's' : ''} — ${nombreCliente}`,
      texto,
      html,
    })
    if (!enviado) continue

    const now = new Date()
    await Promise.all(vencidas.map((t) =>
      prisma.tarea.update({ where: { id: t.id }, data: { ultimoRecordatorioEn: now } })
    ))
    await prisma.logEntry.create({
      data: {
        proyectoId: p.id,
        usuario: 'Sistema',
        accion: 'Recordatorio enviado al cliente',
        detalle: items.map((i) => i.titulo).join(', '),
      },
    })
  }
}
