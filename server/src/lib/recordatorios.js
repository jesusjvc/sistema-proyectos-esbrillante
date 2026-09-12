import prisma from './prisma.js'
import { enviarEmail } from './email.js'
import { dispararWebhookRecordatorio } from './webhooks.js'

const HORA_MS = 3600_000
const DIA_MS = 24 * HORA_MS
// Cadencia entre recordatorios de un mismo proyecto — antes era diaria,
// ahora cada 2 días para no saturar al cliente.
const INTERVALO_RECORDATORIO_MS = 2 * DIA_MS
const DOMINGO = 0

function tareaVencida(t) {
  return t.esCliente && t.estado === 'pendiente' && t.disponibleDesde && t.plazoHoras
    && (Date.now() - new Date(t.disponibleDesde).getTime()) > t.plazoHoras * HORA_MS
}

function pasoElIntervalo(t) {
  if (!t.ultimoRecordatorioEn) return true
  return (Date.now() - new Date(t.ultimoRecordatorioEn).getTime()) >= INTERVALO_RECORDATORIO_MS
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
// superó su plazoHoras y no tiene los avisos apagados. Domingo es día de
// descanso — no se manda nada ese día.
//
// El disparo es a nivel PROYECTO, no por tarea: basta con que UNA tarea
// vencida ya cumpla su ventana de INTERVALO_RECORDATORIO_MS para mandar el
// aviso, pero ese aviso incluye TODAS las vencidas del proyecto y
// resincroniza el ultimoRecordatorioEn de todas al mismo instante. Si se
// disparara por tarea individual, cada una arrastraría su propio reloj y
// el cliente terminaría recibiendo dos avisos separados el mismo día
// conforme sus ventanas se desalinean (pasó en producción: EE Shipping
// recibió dos avisos el mismo día por esto).
export async function revisarRecordatoriosVencidos() {
  if (new Date().getDay() === DOMINGO) return

  const proyectos = await prisma.proyecto.findMany({
    where: { status: 'activo' },
    include: { tareas: true },
  })

  for (const p of proyectos) {
    const vencidas = p.tareas.filter((t) => tareaVencida(t) && !t.avisosDesactivados)
    if (!vencidas.length) continue
    if (!vencidas.some(pasoElIntervalo)) continue

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

    // El webhook es un canal aparte (pensado para una app externa de
    // WhatsApp) — se dispara junto con el correo pero no depende de que
    // este tenga éxito, ni su resultado bloquea nada de lo que sigue.
    dispararWebhookRecordatorio({
      tipo: 'recordatorio_tareas_vencidas',
      proyecto: { slug: p.slug, nombre: nombreCliente, urlPortal: linkProyecto },
      cliente: { nombre: nombreCliente, correo, whatsapp: p.cliente?.whatsapp || null },
      tareas: items,
    })

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
