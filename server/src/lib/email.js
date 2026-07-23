function mailjetConfigurado() {
  return !!(process.env.MAILJET_API_KEY && process.env.MAILJET_API_SECRET && process.env.MAILJET_FROM_EMAIL)
}

// Envía un correo transaccional vía Mailjet. No lanza si falla — devuelve
// { enviado: false, motivo } para que el llamador decida si le importa.
async function enviarEmail({ to, nombreDestino, asunto, texto, html }) {
  if (!mailjetConfigurado()) return { enviado: false, motivo: 'Mailjet no configurado' }

  try {
    const auth = Buffer.from(`${process.env.MAILJET_API_KEY}:${process.env.MAILJET_API_SECRET}`).toString('base64')
    const res = await fetch('https://api.mailjet.com/v3.1/send', {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        Messages: [{
          From: { Email: process.env.MAILJET_FROM_EMAIL, Name: process.env.MAILJET_FROM_NAME || 'EsBrillante' },
          To: [{ Email: to, Name: nombreDestino || to }],
          Subject: asunto,
          TextPart: texto,
          HTMLPart: html || texto,
        }],
      }),
    })
    if (!res.ok) {
      console.error('Mailjet error:', res.status, await res.text())
      return { enviado: false, motivo: `Mailjet error ${res.status}` }
    }
    return { enviado: true }
  } catch (err) {
    console.error('Mailjet error:', err)
    return { enviado: false, motivo: err.message }
  }
}

export { mailjetConfigurado, enviarEmail }
