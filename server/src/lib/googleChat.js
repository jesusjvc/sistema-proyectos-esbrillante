// Envío a un Space de Google Chat vía webhook entrante — canal adicional al
// correo para avisos a admins (nunca lo reemplaza). Mismo patrón de mejor
// esfuerzo que webhooks.js: si no está configurado o falla, no rompe ni
// bloquea el flujo que lo dispara.
function googleChatConfigurado() {
  return !!process.env.GOOGLE_CHAT_WEBHOOK_URL
}

async function enviarGoogleChat(texto) {
  if (!googleChatConfigurado()) return { enviado: false, motivo: 'Google Chat no configurado' }

  try {
    const res = await fetch(process.env.GOOGLE_CHAT_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify({ text: texto }),
    })
    if (!res.ok) {
      console.error('Google Chat error:', res.status, await res.text())
      return { enviado: false, motivo: `Google Chat error ${res.status}` }
    }
    return { enviado: true }
  } catch (err) {
    console.error('Google Chat error:', err)
    return { enviado: false, motivo: err.message }
  }
}

export { googleChatConfigurado, enviarGoogleChat }
