// Resolución de cliente a partir de cualquier identificador — compartida por
// las tools MCP (crear_ticket) y la ingesta de correos de soporte
// (/api/integraciones/correo). El CRM (Perfex) es la fuente de verdad: si el
// cliente no existe en Foco pero sí en el CRM, se importa/vincula al vuelo.
import prisma from './prisma.js'
import { normBusqueda, crmConfigurado, importarClienteCrm } from './clientesCrm.js'
import { listarCustomers, buscarContacts, terminoSeguro } from './perfexClient.js'

// Devuelve { cliente, aviso } — cliente null si no hubo cruce en Foco ni en
// el CRM (llamador decide: en tickets falla con mensaje; en correos va a la
// bandeja de pendientes).
export async function resolverClienteTicket(param) {
  const directo = await prisma.cliente.findFirst({ where: { OR: [{ id: param }, { crmId: param }] } })
  if (directo) return { cliente: directo, aviso: '' }

  // Correo exacto entre clientes locales — paso barato que evita ir al CRM
  // cuando el remitente ya está vinculado.
  if (param.includes('@')) {
    const porCorreo = await prisma.cliente.findFirst({ where: { correo: { equals: param.trim(), mode: 'insensitive' } } })
    if (porCorreo) return { cliente: porCorreo, aviso: '' }
  }

  const nq = normBusqueda(param)
  if (!nq) return {}

  const locales = await prisma.cliente.findMany()
  const local = locales.find((c) => normBusqueda(c.nombreComercial) === nq)
    || locales.find((c) => normBusqueda(c.nombreComercial).includes(nq) || nq.includes(normBusqueda(c.nombreComercial)))
  if (local) return { cliente: local, aviso: '' }

  if (crmConfigurado()) {
    // Empresas del CRM (listado cacheado, inmune al WAF) por nombre normalizado
    let customers = []
    try { customers = await listarCustomers() } catch { customers = [] }
    const match = customers.find((c) => normBusqueda(c.company) === nq)
      || customers.find((c) => normBusqueda(c.company).includes(nq) || nq.includes(normBusqueda(c.company)))
    if (match) {
      const { cliente } = await importarClienteCrm(String(match.userid))
      return { cliente, aviso: `Cliente importado del CRM (crmId ${match.userid}).` }
    }
    // Contactos del CRM por nombre/correo/teléfono (con truco de sufijo para teléfonos con espacios)
    const termino = terminoSeguro(param)
    let contactos = []
    try { contactos = await buscarContacts(termino) } catch { contactos = [] }
    const digitos = param.replace(/\D/g, '')
    if (digitos.length >= 7 && !contactos.length) {
      try { contactos = await buscarContacts(digitos.slice(-4)) } catch { contactos = [] }
      contactos = contactos.filter((c) => String(c.phonenumber || '').replace(/\D/g, '').includes(digitos))
    }
    const porDatos = contactos.find((c) =>
      normBusqueda(`${c.firstname} ${c.lastname}`).includes(nq)
      || normBusqueda(c.email) === nq)
      || contactos.find((c) => String(c.phonenumber || '').replace(/\D/g, '').includes(digitos))
    if (porDatos?.userid) {
      const { cliente } = await importarClienteCrm(String(porDatos.userid))
      return { cliente, aviso: `Cliente vinculado por contacto del CRM (crmId ${porDatos.userid}).` }
    }
  }
  return {}
}
