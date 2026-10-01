// Sincronización de cartera: baja los dominios gestionados desde Enhance
// (hosting) y Cloudflare (DNS) y los cruza contra clientes del CRM y sitios
// ya registrados en Foco, para que la mesa de mantenimiento tenga el
// inventario completo en la tabla `sitios` — con sus IDs de infraestructura
// (enhancedSiteId/enhancedServerId/cloudflareZoneId) llenos.
//
// El cruce por dominio, en orden de confianza:
//   1. Sitio ya registrado en Foco        → solo llena los IDs que falten.
//   2. Website de la empresa en el CRM    → importa el cliente y registra el sitio.
//   3. Dominio del correo de un cliente local → registra el sitio bajo ese cliente.
//   4. Contacto del CRM con correo @dominio   → importa el cliente y registra el sitio.
//   5. Sin cruce                          → queda en la lista "sin asignar"
//      (nunca se inventa cliente; se reparte a mano).
//
// Uso: cd server && node src/scripts/sincronizarCartera.js [--fuente=enhance|cloudflare|ambas] [--aplicar]
//   Sin --aplicar es DRY-RUN: imprime el plan y no escribe nada.
// Requiere ENHANCE_API_TOKEN + ENHANCE_ORG_ID y/o CLOUDFLARE_API_TOKEN en .env.
import 'dotenv/config'
import prisma from '../lib/prisma.js'
import { dominioDesde, crmConfigurado, importarClienteCrm } from '../lib/clientesCrm.js'
import { listarCustomers, buscarContacts } from '../lib/perfexClient.js'

// Dominios de correo público: que el contacto de un cliente use Gmail no
// significa que gmail.com sea su sitio — se excluyen de la atribución por
// correo (pasos 3 y 4).
const CORREO_PUBLICO = new Set([
  'gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.es', 'outlook.com', 'live.com', 'live.com.mx',
  'yahoo.com', 'yahoo.com.mx', 'icloud.com', 'me.com', 'protonmail.com', 'proton.me', 'aol.com',
])

function argumentos() {
  const args = { fuente: 'ambas', aplicar: false }
  for (const a of process.argv.slice(2)) {
    if (a.startsWith('--fuente=')) args.fuente = a.split('=')[1]
    if (a === '--aplicar') args.aplicar = true
  }
  return args
}

function propios() {
  return (process.env.CARTERA_EXCLUIR || 'esbrillante.mx')
    .split(',').map((d) => d.trim().toLowerCase()).filter(Boolean)
}

function esPropio(dominio) {
  return propios().some((d) => dominio === d || dominio.endsWith(`.${d}`))
}

function dominioValido(valor) {
  if (!valor || valor.includes('*') || !valor.includes('.')) return null
  return dominioDesde(valor)
}

// ─── Fuentes ─────────────────────────────────────────────────────────────────

async function dominiosCloudflare() {
  const token = process.env.CLOUDFLARE_API_TOKEN
  if (!token) { console.log('⚠ CLOUDFLARE_API_TOKEN no configurado — se omite Cloudflare.'); return [] }
  const dominios = []
  let page = 1
  for (;;) {
    const resp = await fetch(`https://api.cloudflare.com/client/v4/zones?per_page=50&page=${page}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const json = await resp.json()
    if (!json.success) throw new Error(`Cloudflare API: ${json.errors?.map((e) => e.message).join('; ') || resp.status}`)
    for (const zona of json.result || []) {
      const dominio = dominioValido(zona.name)
      if (dominio && !esPropio(dominio)) dominios.push({ dominio, cloudflareZoneId: zona.id, fuente: 'Cloudflare' })
    }
    if (!json.result_info || page >= (json.result_info.total_pages || 1)) break
    page += 1
  }
  return dominios
}

async function paginarEnhance(url, token) {
  const salida = []
  let siguiente = url
  for (;;) {
    const resp = await fetch(siguiente, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } })
    if (!resp.ok) throw new Error(`Enhance API ${resp.status}: ${await resp.text().catch(() => '')}`.slice(0, 300))
    const json = await resp.json()
    salida.push(...(json.data || []))
    siguiente = json.links?.next || null
    if (!siguiente) break
  }
  return salida
}

async function dominiosEnhance() {
  const token = process.env.ENHANCE_API_TOKEN
  const org = process.env.ENHANCE_ORG_ID
  if (!token || !org) { console.log('⚠ ENHANCE_API_TOKEN/ENHANCE_ORG_ID no configurados — se omite Enhance.'); return [] }

  const servidores = {}
  for (const srv of await paginarEnhance(`https://api.enhance.com/api/v1/org/${org}/servers`, token)) {
    servidores[srv.id] = srv
  }

  const dominios = []
  const ver = (valor, sitio) => {
    const dominio = dominioValido(valor)
    if (!dominio || esPropio(dominio)) return
    dominios.push({
      dominio,
      enhancedSiteId: sitio.id,
      enhancedServerId: sitio.server_id || sitio.serverId || null,
      fuente: 'Enhance',
    })
  }
  for (const sitio of await paginarEnhance(`https://api.enhance.com/api/v1/org/${org}/sites`, token)) {
    ver(sitio.domain, sitio)
    for (const campo of ['domain_aliases', 'aliases', 'domains']) {
      if (Array.isArray(sitio[campo])) sitio[campo].forEach((a) => ver(a, sitio))
    }
  }
  return dominios
}

// ─── Cruce ───────────────────────────────────────────────────────────────────

async function atribucion() {
  // Sitios de Foco por dominio, clientes locales por dominio de su correo.
  const sitios = await prisma.sitio.findMany({ select: { id: true, clienteId: true, nombre: true, dominio: true } })
  const porDominio = new Map(sitios.filter((s) => s.dominio).map((s) => [s.dominio, s]))

  const clientes = await prisma.cliente.findMany({ select: { id: true, nombreComercial: true, correo: true } })
  const clientePorCorreoDominio = new Map()
  for (const c of clientes) {
    const dominio = String(c.correo || '').split('@')[1]?.toLowerCase().trim()
    if (dominio && !CORREO_PUBLICO.has(dominio) && !clientePorCorreoDominio.has(dominio)) {
      clientePorCorreoDominio.set(dominio, c)
    }
  }

  // Website de empresas del CRM (listado cacheado — mismo que usan los tickets).
  const crmSitioPorDominio = new Map()
  if (crmConfigurado()) {
    try {
      for (const customer of await listarCustomers()) {
        const dominio = dominioValido(customer.website)
        if (dominio && !crmSitioPorDominio.has(dominio)) crmSitioPorDominio.set(dominio, String(customer.userid))
      }
    } catch (err) {
      console.log(`⚠ No pude listar clientes del CRM (${err.message}) — se omite esa vía.`)
    }
  }

  return { porDominio, clientePorCorreoDominio, crmSitioPorDominio }
}

// Contacto del CRM con correo @dominio — la vía más lenta, solo si las otras fallaron.
async function clientePorContactoCrm(dominio) {
  if (!crmConfigurado() || CORREO_PUBLICO.has(dominio)) return null
  try {
    const contactos = (await buscarContacts(dominio)).filter((c) => String(c.email || '').toLowerCase().endsWith(`@${dominio}`))
    const crmIds = [...new Set(contactos.map((c) => String(c.userid)).filter(Boolean))]
    return crmIds.length === 1 ? crmIds[0] : null
  } catch {
    return null
  }
}

async function main() {
  const { fuente, aplicar } = argumentos()
  console.log(`\n=== Sincronización de cartera (${aplicar ? 'APLICAR' : 'DRY-RUN — no escribe nada'}) ===\n`)

  const dominios = new Map()
  const juntar = (lista) => {
    for (const d of lista) {
      const actual = dominios.get(d.dominio) || { dominio: d.dominio, fuentes: new Set() }
      if (d.enhancedSiteId) { actual.enhancedSiteId = d.enhancedSiteId; actual.enhancedServerId = d.enhancedServerId || actual.enhancedServerId }
      if (d.cloudflareZoneId) actual.cloudflareZoneId = d.cloudflareZoneId
      actual.fuentes.add(d.fuente)
      dominios.set(d.dominio, actual)
    }
  }

  if (fuente === 'cloudflare' || fuente === 'ambas') juntar(await dominiosCloudflare())
  if (fuente === 'enhance' || fuente === 'ambas') juntar(await dominiosEnhance())
  if (!dominios.size) { console.log('Sin dominios que sincronizar.'); return }

  const { porDominio, clientePorCorreoDominio, crmSitioPorDominio } = await atribucion()

  const plan = { actualizar: [], crear: [], sinAsignar: [] }
  for (const d of dominios.values()) {
    const existente = porDominio.get(d.dominio)
    if (existente) {
      const faltan = {}
      if (d.enhancedSiteId) { faltan.enhancedSiteId = d.enhancedSiteId; if (d.enhancedServerId) faltan.enhancedServerId = d.enhancedServerId }
      if (d.cloudflareZoneId) faltan.cloudflareZoneId = d.cloudflareZoneId
      plan.actualizar.push({ dominio: d.dominio, sitio: existente, faltan })
      continue
    }

    if (crmSitioPorDominio.has(d.dominio)) {
      plan.crear.push({ dominio: d.dominio, ...d, via: `website del CRM (crmId ${crmSitioPorDominio.get(d.dominio)})`, crmId: crmSitioPorDominio.get(d.dominio) })
      continue
    }
    const local = clientePorCorreoDominio.get(d.dominio)
    if (local) {
      plan.crear.push({ dominio: d.dominio, ...d, via: `correo del cliente (${local.correo})`, clienteLocal: local })
      continue
    }
    const crmIdContacto = await clientePorContactoCrm(d.dominio)
    if (crmIdContacto) {
      plan.crear.push({ dominio: d.dominio, ...d, via: `contacto del CRM con correo @${d.dominio} (crmId ${crmIdContacto})`, crmId: crmIdContacto })
      continue
    }
    plan.sinAsignar.push(d)
  }

  if (plan.actualizar.length) {
    console.log(`── ${plan.actualizar.length} sitio(s) ya registrados — IDs por llenar:`)
    for (const a of plan.actualizar) {
      console.log(`  ${a.dominio} → [${Object.keys(a.faltan).join(', ')}] (${a.sitio.nombre})`)
    }
  } else console.log('── Ningún sitio registrado necesita IDs nuevos.')

  if (plan.crear.length) {
    console.log(`\n── ${plan.crear.length} sitio(s) nuevos por registrar:`)
    for (const c of plan.crear) console.log(`  ${c.dominio} → ${c.via} [${[...c.fuentes].join(', ')}]`)
  } else console.log('\n── Ningún sitio nuevo por registrar.')

  if (plan.sinAsignar.length) {
    console.log(`\n── ${plan.sinAsignar.length} dominio(s) SIN cliente identificado (repartir a mano):`)
    for (const s of plan.sinAsignar) console.log(`  ${s.dominio} [${[...s.fuentes].join(', ')}]${s.enhancedSiteId ? ` enhanceSite=${s.enhancedSiteId}` : ''}${s.cloudflareZoneId ? ` zone=${s.cloudflareZoneId}` : ''}`)
  } else console.log('\n── Todos los dominios de la cartera quedaron asignados.')

  if (!aplicar) {
    console.log('\nDRY-RUN terminado. Con --aplicar se escriben estos cambios en la base.')
    return
  }

  let actualizados = 0
  for (const a of plan.actualizar) {
    if (!Object.keys(a.faltan).length) continue
    await prisma.sitio.update({ where: { id: a.sitio.id }, data: a.faltan })
    actualizados += 1
  }

  const cacheClientes = new Map()
  let creados = 0
  for (const c of plan.crear) {
    try {
      let cliente = c.clienteLocal || null
      if (!cliente && c.crmId) {
        if (!cacheClientes.has(c.crmId)) cacheClientes.set(c.crmId, (await importarClienteCrm(c.crmId)).cliente)
        cliente = cacheClientes.get(c.crmId)
      }
      const sitiosCliente = await prisma.sitio.count({ where: { clienteId: cliente.id } })
      await prisma.sitio.create({
        data: {
          clienteId: cliente.id,
          nombre: sitiosCliente === 0 ? 'Sitio principal' : c.dominio,
          dominio: c.dominio,
          url: `https://${c.dominio}`,
          ...(c.enhancedSiteId ? { hostingProveedor: 'Enhance', enhancedSiteId: c.enhancedSiteId, ...(c.enhancedServerId ? { enhancedServerId: c.enhancedServerId } : {}) } : {}),
          ...(c.cloudflareZoneId ? { dnsProveedor: 'Cloudflare', cloudflareZoneId: c.cloudflareZoneId } : {}),
        },
      })
      creados += 1
    } catch (err) {
      console.log(`  ⚠ ${c.dominio}: ${err.code === 'P2002' ? 'el dominio ya se registró en paralelo' : err.message}`)
    }
  }

  console.log(`\nListo: ${actualizados} sitio(s) con IDs nuevos, ${creados} sitio(s) creados, ${plan.sinAsignar.length} sin asignar.`)
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
