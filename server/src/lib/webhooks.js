// Webhook saliente para reenviar avisos a un canal externo — pensado para
// que una app propia de WhatsApp lo consuma y mande su propio recordatorio
// por ese medio. Mejor esfuerzo: si falla o no está configurado, no rompe
// ni bloquea el flujo que lo dispara (igual que enviarEmail).
function webhookRecordatoriosConfigurado() {
  return !!process.env.RECORDATORIOS_WEBHOOK_URL
}

// payload sugerido:
// {
//   tipo: 'recordatorio_tareas_vencidas',
//   proyecto: { slug, nombre, urlPortal },
//   cliente: { nombre, correo, whatsapp },
//   tareas: [{ titulo, atraso }],
// }
async function dispararWebhookRecordatorio(payload) {
  if (!webhookRecordatoriosConfigurado()) return { disparado: false, motivo: 'Webhook no configurado' }

  try {
    const headers = { 'Content-Type': 'application/json' }
    if (process.env.RECORDATORIOS_WEBHOOK_SECRET) {
      headers.Authorization = `Bearer ${process.env.RECORDATORIOS_WEBHOOK_SECRET}`
    }
    const res = await fetch(process.env.RECORDATORIOS_WEBHOOK_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      console.error('Webhook de recordatorios error:', res.status, await res.text())
      return { disparado: false, motivo: `Webhook error ${res.status}` }
    }
    return { disparado: true }
  } catch (err) {
    console.error('Webhook de recordatorios error:', err)
    return { disparado: false, motivo: err.message }
  }
}

export { webhookRecordatoriosConfigurado, dispararWebhookRecordatorio }
