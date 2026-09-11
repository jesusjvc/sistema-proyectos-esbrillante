import nodemailer from 'nodemailer'

function mailtrapConfigurado() {
  return !!(process.env.MAILTRAP_SMTP_HOST && process.env.MAILTRAP_SMTP_USER && process.env.MAILTRAP_SMTP_PASS && process.env.MAILTRAP_FROM_EMAIL)
}

let transporter = null
function getTransporter() {
  if (transporter) return transporter
  transporter = nodemailer.createTransport({
    host: process.env.MAILTRAP_SMTP_HOST,
    port: Number(process.env.MAILTRAP_SMTP_PORT || 587),
    secure: false, // STARTTLS en el puerto 587, no TLS implícito
    auth: {
      user: process.env.MAILTRAP_SMTP_USER,
      pass: process.env.MAILTRAP_SMTP_PASS,
    },
  })
  return transporter
}

// Envía un correo transaccional vía Mailtrap (SMTP). No lanza si falla —
// devuelve { enviado: false, motivo } para que el llamador decida si le
// importa (la mayoría de los llamadores solo lo intentan "mejor esfuerzo").
async function enviarEmail({ to, nombreDestino, asunto, texto, html }) {
  if (!mailtrapConfigurado()) return { enviado: false, motivo: 'Mailtrap no configurado' }

  try {
    await getTransporter().sendMail({
      from: `"${process.env.MAILTRAP_FROM_NAME || 'EsBrillante'}" <${process.env.MAILTRAP_FROM_EMAIL}>`,
      to: nombreDestino ? `"${nombreDestino}" <${to}>` : to,
      subject: asunto,
      text: texto,
      html: html || texto,
    })
    return { enviado: true }
  } catch (err) {
    console.error('Mailtrap error:', err)
    return { enviado: false, motivo: err.message }
  }
}

export { mailtrapConfigurado, enviarEmail }
