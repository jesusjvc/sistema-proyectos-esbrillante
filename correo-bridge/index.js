// Puente de correo de soporte → Foco. Lee el buzón IMAP de
// soporte@esbrillante.mx (Google Workspace — los MX del dominio ya apuntan a
// Google, no se toca nada de DNS) cada INTERVALO_MINUTOS y manda los mensajes
// no leídos a la ingesta de Foco (POST /api/integraciones/correo/ingest con
// CORREO_INGEST_KEY), donde se cruzan con clientes y se vuelven tickets.
//
// Mismo espíritu que whatsapp-bridge: proceso local, sin despliegue, la BD
// solo se toca vía API. Si el puente está apagado, el correo se acumula en el
// buzón (nada se pierde) y se ingesta al volver.
//
// Uso: cd correo-bridge && node index.js   (ver README.md y .env.example)
import 'dotenv/config'
import { ImapFlow } from 'imapflow'
import { procesarBuzon } from './lib.js'

const INTERVALO = Math.max(1, Number(process.env.INTERVALO_MINUTOS || 5)) * 60_000

function configImap() {
  const faltan = ['IMAP_HOST', 'IMAP_USER', 'IMAP_PASS'].filter((v) => !process.env[v])
  if (faltan.length) {
    console.error(`Faltan variables de entorno: ${faltan.join(', ')} (ver .env.example)`)
    process.exit(1)
  }
  return {
    host: process.env.IMAP_HOST,
    port: Number(process.env.IMAP_PORT || 993),
    secure: true,
    auth: { user: process.env.IMAP_USER, pass: process.env.IMAP_PASS },
    logger: false,
  }
}

async function ciclo() {
  const cliente = new ImapFlow(configImap())
  try {
    await cliente.connect()
    const resumen = await procesarBuzon(cliente, {
      url: process.env.FOCO_URL,
      key: process.env.FOCO_API_KEY,
      buzon: process.env.CORREO_BUZON || 'INBOX',
      moverA: process.env.CORREO_MOVER_A || '',
    })
    if (resumen.procesados || resumen.reintentan) {
      console.log(new Date().toISOString(), `→ ${resumen.procesados} ingerido(s), ${resumen.reintentan} reintentan después`)
    }
  } catch (err) {
    console.error(new Date().toISOString(), 'ciclo falló:', err.message)
  } finally {
    cliente.close().catch(() => {})
  }
}

await ciclo()
setInterval(ciclo, INTERVALO)
console.log(`Puente de correo activo — ${process.env.IMAP_USER} cada ${INTERVALO / 60_000} min`)
