// Cliente HTTP para la API REST de Perfex CRM (crm.esbrillante.mx).
// El CRM es la fuente de verdad de clientes y contactos: Foco nunca inventa
// un cliente — lo importa desde aquí o lo crea aquí primero.
//
// Autenticación: header `Authtoken` con el token de usuario API del CRM
// (Usuarios → API en el panel de Perfex). Vive solo en server/.env —
// nunca en el bundle del navegador.
//
// Detalles descubiertos probando la API real (2026-09):
// - GET  /customers/{id}            → customer (company, phonenumber, website…)
// - GET  /customers/search/{key}    → array (busca company, vat y teléfono del customer)
// - POST /customers                 → { status, record_id } — campo: company, phonenumber
// - GET  /contacts/search/{key}     → array (busca nombre, email, teléfono y
//                                     empresa del customer padre; cada resultado
//                                     trae userid + datos completos)
// - GET  /contacts/{id}             → array con el contacto (para validar uno puntual)
// - POST /contacts                  → { status, record_id } — campos: customer_id,
//                                     firstname, lastname, email, phonenumber
// - Un WAF frontal devuelve 403 con caracteres como & % ? en el término de
//   búsqueda — por eso terminoSeguro() los elimina antes de armar la URL.

const BASE_URL = process.env.PERFEX_BASE_URL
const TOKEN = process.env.PERFEX_API_TOKEN

export function crmConfigurado() {
  return Boolean(BASE_URL && TOKEN)
}

async function req(method, path, body) {
  if (!crmConfigurado()) throw new Error('CRM no configurado (PERFEX_BASE_URL / PERFEX_API_TOKEN)')
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Authtoken: TOKEN,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  // El WAF responde 403 con HTML; no intentamos parsearlo como JSON.
  if (!res.ok) throw new Error(`CRM respondió ${res.status}`)
  const data = await res.json()
  // Perfex devuelve { status: false, message } en "sin resultados" y errores.
  if (data && data.status === false) {
    if (/no data/i.test(data.message || '')) return null
    throw new Error(data.message || data.error || 'El CRM rechazó la operación')
  }
  return data
}

// Sanitiza el término de búsqueda: el WAF bloquea &, %, ?, etc. en la URL.
export function terminoSeguro(q) {
  return (q || '')
    .trim()
    .replace(/[^\p{L}\p{N}\s@.-]/gu, '')
    .replace(/\s+/g, ' ')
    .slice(0, 64)
}

export async function obtenerCustomer(crmId) {
  return req('GET', `/customers/${encodeURIComponent(crmId)}`)
}

export async function buscarCustomers(termino) {
  const t = terminoSeguro(termino)
  if (!t) return []
  return (await req('GET', `/customers/search/${encodeURIComponent(t)}`)) || []
}

export async function buscarContacts(termino) {
  const t = terminoSeguro(termino)
  if (!t) return []
  return (await req('GET', `/contacts/search/${encodeURIComponent(t)}`)) || []
}

export async function obtenerContacto(contactoId) {
  const lista = await req('GET', `/contacts/${encodeURIComponent(contactoId)}`)
  return Array.isArray(lista) ? lista[0] || null : lista
}

export async function crearCustomer({ company, phonenumber }) {
  return req('POST', '/customers', { company, phonenumber: phonenumber || '' })
}

export async function crearContacto({ customer_id, firstname, lastname, email, phonenumber }) {
  return req('POST', '/contacts', { customer_id, firstname, lastname, email: email || '', phonenumber: phonenumber || '' })
}

// Cache en memoria del listado completo de customers. La búsqueda por path
// (/customers/search/{key}) no soporta & (WAF) ni teléfonos guardados con
// espacios; con el listado completo (379 hoy, per_page máx 100 = 4 peticiones)
// el filtrado lo hace Foco de forma robusta. TTL corto: 5 minutos.
let cacheCustomers = { lista: null, expiraEn: 0 }

export function invalidarCacheCustomers() {
  cacheCustomers = { lista: null, expiraEn: 0 }
}

export async function listarCustomers() {
  if (cacheCustomers.lista && Date.now() < cacheCustomers.expiraEn) return cacheCustomers.lista
  const primera = await req('GET', '/customers?per_page=100')
  const lista = [...(primera?.data || [])]
  const totalPaginas = Number(primera?.meta?.total_pages || 1)
  if (totalPaginas > 1) {
    const paginas = await Promise.all(
      Array.from({ length: totalPaginas - 1 }, (_, i) =>
        req('GET', `/customers?per_page=100&page=${i + 2}`).catch(() => null)),
    )
    for (const pagina of paginas) if (Array.isArray(pagina?.data)) lista.push(...pagina.data)
  }
  cacheCustomers = { lista, expiraEn: Date.now() + 5 * 60 * 1000 }
  return lista
}
