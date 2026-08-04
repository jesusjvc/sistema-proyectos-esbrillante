const BASE = (process.env.PAGES_MCP_URL || 'https://prototipos.esbrillante.mx').replace(/\/$/, '')
const API_KEY = process.env.PAGES_MCP_API_KEY || ''

async function req(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Error ${res.status} al hablar con pages-mcp`)
  return data
}

export const listarPrototipos = () => req('GET', '/api/prototipos')
export const crearPrototipo = (data) => req('POST', '/api/prototipos', data)
export const actualizarPrototipo = (slug, data) => req('PATCH', `/api/prototipos/${slug}`, data)
export const eliminarPrototipo = (slug) => req('DELETE', `/api/prototipos/${slug}`)
