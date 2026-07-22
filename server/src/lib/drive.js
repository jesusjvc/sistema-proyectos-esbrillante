import { JWT } from 'google-auth-library'

let authClient = null

function driveConfigurado() {
  return !!(process.env.GOOGLE_SERVICE_ACCOUNT_KEY && process.env.DRIVE_RESPUESTAS_ROOT_ID)
}

function getAuthClient() {
  if (authClient) return authClient
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY)
  authClient = new JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ['https://www.googleapis.com/auth/drive'],
  })
  return authClient
}

async function getToken() {
  const client = getAuthClient()
  const { token } = await client.getAccessToken()
  return token
}

async function crearCarpeta(nombre, parentId, token) {
  const res = await fetch('https://www.googleapis.com/drive/v3/files?fields=id,webViewLink&supportsAllDrives=true', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: nombre, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }),
  })
  if (!res.ok) throw new Error(`Drive API error al crear carpeta: ${res.status} ${await res.text()}`)
  return res.json()
}

// Devuelve el ID de la carpeta de respuestas del proyecto, creándola la primera vez.
export async function obtenerOCrearCarpetaProyecto(proyecto) {
  if (proyecto.driveRespuestasId) return proyecto.driveRespuestasId

  const token = await getToken()
  const carpeta = await crearCarpeta(
    `${proyecto.cliente?.nombreComercial || proyecto.slug} — Respuestas`,
    process.env.DRIVE_RESPUESTAS_ROOT_ID,
    token,
  )
  return carpeta.id
}

// Sube un archivo (buffer en memoria, viene de multer) a una carpeta de Drive.
// Devuelve { url, nombre } — la subida es multipart simple (metadata + contenido en un solo POST).
export async function subirArchivo({ carpetaId, nombre, mimeType, buffer }) {
  const token = await getToken()

  const boundary = `esbrillante-${Date.now()}`
  const metadata = { name: nombre, parents: [carpetaId] }

  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`),
    buffer,
    Buffer.from(`\r\n--${boundary}--`),
  ])

  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink&supportsAllDrives=true', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  })
  if (!res.ok) throw new Error(`Drive API error al subir archivo: ${res.status} ${await res.text()}`)

  const data = await res.json()

  // Compartir el archivo como "cualquiera con el link puede ver" para que el link sirva
  // directo (Claude Code y el equipo no tienen por qué tener acceso a la cuenta de servicio).
  await fetch(`https://www.googleapis.com/drive/v3/files/${data.id}/permissions?supportsAllDrives=true`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'reader', type: 'anyone' }),
  })

  return { url: data.webViewLink, nombre }
}

export { driveConfigurado }
