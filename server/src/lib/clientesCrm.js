// Servicio de clientes respaldado por el CRM (Perfex). Compartido entre las
// rutas REST (/api/clientes) y las tools MCP de tickets — una sola fuente de
// verdad para importar/vincular clientes desde el CRM.
import prisma from './prisma.js'
import {
  crmConfigurado,
  terminoSeguro,
  obtenerCustomer,
  obtenerContacto,
  buscarContacts,
} from './perfexClient.js'

export { crmConfigurado }

export function dominioDesde(valor) {
  if (!valor?.trim()) return null
  try {
    return new URL(valor.includes('://') ? valor : `https://${valor}`).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return null
  }
}

// Normalización para búsqueda: minúsculas, sin acentos, solo alfanuméricos —
// así "Ban&Home" coincide con "banhome" y "ZOÉ" con "zoe".
export function normBusqueda(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

// Trae los datos maestros de un customer del CRM + su contacto principal.
// El contactoId opcional se valida contra el CRM; si no viene, se resuelve
// buscando contactos por la primera palabra de la empresa (segura para el WAF).
export async function resolverClienteCrm(crmId, contactoId) {
  const customer = await obtenerCustomer(crmId)
  if (!customer || !customer.userid) throw new Error('Ese cliente no existe en el CRM')

  let contacto = null
  if (contactoId) {
    const candidato = await obtenerContacto(contactoId)
    if (candidato && String(candidato.userid) === String(crmId)) contacto = candidato
  }
  if (!contacto) {
    const primera = terminoSeguro(String(customer.company || '').split(/\s+/)[0] || '')
    if (primera) {
      const contactos = await buscarContacts(primera).catch(() => [])
      const delCustomer = (contactos || []).filter((c) => String(c.userid) === String(crmId))
      contacto = delCustomer.find((c) => String(c.is_primary) === '1') || delCustomer[0] || null
    }
  }

  return {
    crmId: String(customer.userid),
    nombreComercial: String(customer.company || '').trim(),
    contactoNombre: contacto ? [contacto.firstname, contacto.lastname].filter(Boolean).join(' ').trim() || null : null,
    correo: String(contacto?.email || '').trim() || null,
    whatsapp: String(contacto?.phonenumber || customer.phonenumber || '').trim() || null,
    website: String(customer.website || '').trim() || null,
    contactoId: contacto ? String(contacto.id) : null,
  }
}

// Upsert idempotente del Cliente local a partir del CRM: si ya está vinculado,
// refresca sus datos con los del CRM (el CRM manda); si no, lo crea.
// Devuelve { cliente, sitioSugerido } — sitioSugerido prellena el dominio
// del website del CRM al registrar el primer sitio del cliente.
export async function importarClienteCrm(crmId, contactoId) {
  const datos = await resolverClienteCrm(crmId, contactoId)
  if (!datos.nombreComercial) throw new Error('El cliente del CRM no tiene nombre de empresa')

  const data = {
    nombreComercial: datos.nombreComercial,
    contactoNombre: datos.contactoNombre,
    correo: datos.correo,
    whatsapp: datos.whatsapp,
  }

  let cliente
  const existente = await prisma.cliente.findUnique({ where: { crmId: datos.crmId } })
  if (existente) {
    cliente = await prisma.cliente.update({ where: { id: existente.id }, data })
  } else {
    try {
      cliente = await prisma.cliente.create({ data: { crmId: datos.crmId, ...data } })
    } catch (err) {
      if (err.code === 'P2002') cliente = await prisma.cliente.findUniqueOrThrow({ where: { crmId: datos.crmId } })
      else throw err
    }
  }

  const sitioSugerido = datos.website ? { dominio: dominioDesde(datos.website), url: datos.website } : null
  return { cliente, sitioSugerido }
}
