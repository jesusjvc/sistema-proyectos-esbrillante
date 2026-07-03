const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID
const PARENT_ID = import.meta.env.VITE_DRIVE_CLIENTES_FOLDER_ID || null

export function driveConfigurado() {
  return !!CLIENT_ID
}

let tokenActivo = null

function pedirToken() {
  return new Promise((resolve, reject) => {
    if (!window.google?.accounts?.oauth2) {
      reject(new Error('Google Identity Services no cargado aún — intenta de nuevo en un momento'))
      return
    }
    window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: 'https://www.googleapis.com/auth/drive',
      callback: (res) => {
        if (res.error) {
          reject(new Error(res.error_description || res.error))
        } else {
          tokenActivo = res.access_token
          resolve(res.access_token)
        }
      },
    }).requestAccessToken()
  })
}

async function drivePost(path, body, token) {
  const res = await fetch(`https://www.googleapis.com/drive/v3${path}&supportsAllDrives=true`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (res.status === 401) {
    tokenActivo = null
    throw new Error('token_expirado')
  }
  if (!res.ok) throw new Error(`Drive API error ${res.status}`)
  return res.json()
}

async function crearCarpeta(nombre, parentId, token) {
  const body = { name: nombre, mimeType: 'application/vnd.google-apps.folder' }
  if (parentId) body.parents = [parentId]
  const data = await drivePost('/files?fields=id', body, token)
  return data.id
}

async function construir(nombreCliente, token) {
  const año = new Date().getFullYear()
  const rootId = await crearCarpeta(`${nombreCliente} — ${año}`, PARENT_ID, token)

  const ids = {}
  for (const sub of ['Brief', 'Recursos del Cliente', 'Prototipo', 'Diseño', 'Entregables']) {
    ids[sub] = await crearCarpeta(sub, rootId, token)
  }

  const url = (id) => `https://drive.google.com/drive/folders/${id}`
  return {
    drive: url(ids['Recursos del Cliente']),
    briefFolder: url(ids['Brief']),
  }
}

export async function crearCarpetasCliente(nombreCliente) {
  const token = tokenActivo || await pedirToken()
  try {
    return await construir(nombreCliente, token)
  } catch (err) {
    if (err.message === 'token_expirado') {
      return await construir(nombreCliente, await pedirToken())
    }
    throw err
  }
}
