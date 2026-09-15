import { Router } from 'express'
import prisma from '../lib/prisma.js'
import { requireAuth } from '../middleware/auth.js'
import {
  crmConfigurado,
  dominioDesde,
  normBusqueda,
  importarClienteCrm,
} from '../lib/clientesCrm.js'
import {
  terminoSeguro,
  buscarCustomers,
  buscarContacts,
  crearCustomer,
  crearContacto,
  listarCustomers,
  invalidarCacheCustomers,
} from '../lib/perfexClient.js'

const router = Router()

// ─── CRM como fuente de verdad de clientes ─────────────────────────────────
// Foco no inventa clientes: los importa del CRM (si ya existen) o los crea
// primero en el CRM y luego los vincula. El vínculo local es `Cliente.crmId`.
// La importación/vinculación vive en server/src/lib/clientesCrm.js (compartida
// con las tools MCP de tickets).

function crmNoConfigurado(res) {
  return res.status(503).json({ error: 'El CRM no está configurado en el servidor (PERFEX_BASE_URL / PERFEX_API_TOKEN)' })
}

// GET /api/clientes/crm/buscar?q=...
// Busca en TODO el directorio del CRM: empresas (listado completo cacheado +
// filtrado local, inmune al WAF y a los espacios en teléfonos) y contactos
// (búsqueda viva: nombre, correo, teléfono). Deduplica por empresa, marca si
// ya está vinculado en Foco y rankea: empresa exacta > prefijo > contiene >
// solo contacto.
router.get('/crm/buscar', requireAuth, async (req, res) => {
  if (!crmConfigurado()) return crmNoConfigurado(res)
  const q = String(req.query.q || '').trim()
  if (q.length < 2) return res.json([])

  try {
    const [todos, vivos, contactos] = await Promise.all([
      listarCustomers().catch(() => []),
      buscarCustomers(q).catch(() => []),
      buscarContacts(q).catch(() => []),
    ])

    // Teléfono largo (7+ dígitos): el LIKE del CRM no matchea números guardados
    // con espacios ("+52 1 55 4342 0734" no contiene "43420734"). Se busca por
    // sufijo — que sí matchea — y se filtra aquí por dígitos completos.
    const digitosQuery = q.replace(/\D/g, '')
    if (digitosQuery.length >= 7) {
      const porSufijo = await buscarContacts(digitosQuery.slice(-4)).catch(() => [])
      for (const c of porSufijo || []) {
        if (!String(c.phonenumber || '').replace(/\D/g, '').includes(digitosQuery)) continue
        if (!contactos.some((x) => String(x.id) === String(c.id))) contactos.push(c)
      }
    }

    const normQ = normBusqueda(q)
    const digitosQ = digitosQuery
    const porCrmId = new Map()

    for (const c of [...(todos || []), ...(vivos || [])]) {
      if (!c?.userid) continue
      const nombreEmpresa = normBusqueda(c.company)
      let puntaje = null
      if (normQ && nombreEmpresa === normQ) puntaje = 0
      else if (normQ && nombreEmpresa.startsWith(normQ)) puntaje = 1
      else if (normQ && nombreEmpresa.includes(normQ)) puntaje = 2
      else if (digitosQ.length >= 4 && String(c.phonenumber || '').replace(/\D/g, '').includes(digitosQ)) puntaje = 2
      if (puntaje === null) continue

      const key = String(c.userid)
      const actual = porCrmId.get(key)
      if (!actual || puntaje < actual.puntaje) {
        porCrmId.set(key, {
          crmId: key,
          nombreComercial: String(c.company || '').trim() || '(Empresa sin nombre)',
          contactoNombre: actual?.contactoNombre || null,
          contactoId: actual?.contactoId || null,
          correo: actual?.correo || null,
          whatsapp: actual?.whatsapp || String(c.phonenumber || '').trim() || null,
          website: actual?.website || String(c.website || '').trim() || null,
          puntaje,
        })
      }
    }

    for (const c of contactos || []) {
      if (!c?.userid) continue
      const key = String(c.userid)
      const actual = porCrmId.get(key) || {
        crmId: key,
        nombreComercial: String(c.company || '').trim() || '(Empresa sin nombre)',
        contactoNombre: null,
        contactoId: null,
        correo: null,
        whatsapp: null,
        website: null,
        puntaje: 3,
      }
      const primario = String(c.is_primary) === '1'
      if (!actual.contactoId || primario) {
        actual.contactoNombre = [c.firstname, c.lastname].filter(Boolean).join(' ').trim() || actual.contactoNombre
        actual.correo = String(c.email || '').trim() || actual.correo
        actual.whatsapp = String(c.phonenumber || '').trim() || actual.whatsapp
        actual.contactoId = String(c.id)
      }
      porCrmId.set(key, actual)
    }

    // Empresas matcheadas por nombre normalizado (ej. "Ban&Home") pueden
    // quedar sin contacto porque el término con & no pasa el WAF. Se reintenta
    // con un prefijo seguro del término ("Ban") y se enriquece lo que coincida.
    const sinContacto = [...porCrmId.values()].filter((r) => !r.contactoId)
    const primera = q.split(/\s+/)[0] || ''
    const indiceEspecial = primera.search(/[^\p{L}\p{N}]/u)
    const semilla = indiceEspecial > 2 ? primera.slice(0, indiceEspecial) : terminoSeguro(primera)
    if (sinContacto.length && semilla.length >= 3 && semilla !== q.trim()) {
      const extra = await buscarContacts(semilla).catch(() => [])
      for (const c of extra || []) {
        const actual = porCrmId.get(String(c.userid))
        if (!actual || actual.contactoId) continue
        actual.contactoNombre = [c.firstname, c.lastname].filter(Boolean).join(' ').trim() || null
        actual.correo = String(c.email || '').trim() || null
        actual.whatsapp = String(c.phonenumber || '').trim() || actual.whatsapp
        actual.contactoId = String(c.id)
      }
    }

    const resultados = [...porCrmId.values()]
    const locales = await prisma.cliente.findMany({
      where: { crmId: { in: resultados.map((r) => r.crmId) } },
      select: { id: true, crmId: true },
    })
    const localPorCrm = new Map(locales.map((l) => [l.crmId, l.id]))
    for (const r of resultados) {
      r.estadoLocal = localPorCrm.has(r.crmId) ? 'ya_vinculado' : 'nuevo'
      r.clienteLocalId = localPorCrm.get(r.crmId) || null
    }
    resultados.sort((a, b) => a.puntaje - b.puntaje || a.nombreComercial.localeCompare(b.nombreComercial, 'es'))
    res.json(resultados.slice(0, 20))
  } catch (err) {
    console.error(err)
    res.status(502).json({ error: err.message || 'No pudimos consultar el CRM' })
  }
})

// POST /api/clientes/crm
// Da de alta un customer NUEVO en el CRM (con su contacto, si hay datos) y lo
// vincula en Foco. Camino obligatorio cuando el cliente no existe en el CRM.
router.post('/crm', requireAuth, async (req, res) => {
  if (!crmConfigurado()) return crmNoConfigurado(res)
  const { company, phonenumber, contactoNombre, correo } = req.body
  if (!company?.trim()) return res.status(400).json({ error: 'El nombre de la empresa es obligatorio para darla de alta en el CRM' })

  try {
    const creado = await crearCustomer({ company: company.trim(), phonenumber: phonenumber?.trim() || '' })
    if (!creado?.record_id) throw new Error('El CRM no devolvió el ID del cliente creado')
    invalidarCacheCustomers()

    // El CRM exige correo para dar de alta contactos: sin él no se crea
    // (el customer sí queda creado). Si falla teniendo todo, se registra.
    const correoContacto = correo?.trim() || ''
    const partes = contactoNombre?.trim().split(/\s+/).filter(Boolean) || []
    if (correoContacto && partes.length) {
      await crearContacto({
        customer_id: String(creado.record_id),
        firstname: partes[0] || '',
        lastname: partes.slice(1).join(' '),
        email: correoContacto,
        phonenumber: phonenumber?.trim() || '',
      }).catch((err) => console.error('No se pudo crear el contacto en el CRM:', err.message))
    }

    const { cliente, sitioSugerido } = await importarClienteCrm(String(creado.record_id))
    res.status(201).json({ cliente, sitioSugerido })
  } catch (err) {
    console.error(err)
    res.status(502).json({ error: err.message || 'No pudimos crear el cliente en el CRM' })
  }
})

// POST /api/clientes/crm/vincular
// Importa (o refresca) un cliente que ya existe en el CRM hacia Foco.
// No confía en los datos del navegador: re-obtiene todo del CRM.
router.post('/crm/vincular', requireAuth, async (req, res) => {
  if (!crmConfigurado()) return crmNoConfigurado(res)
  const { crmId, contactoId } = req.body
  if (!crmId) return res.status(400).json({ error: 'Falta el id del cliente en el CRM' })

  try {
    const { cliente, sitioSugerido } = await importarClienteCrm(String(crmId), contactoId ? String(contactoId) : null)
    res.json({ cliente, sitioSugerido })
  } catch (err) {
    if (/no existe en el CRM/i.test(err.message)) return res.status(404).json({ error: err.message })
    console.error(err)
    res.status(502).json({ error: err.message || 'No pudimos importar el cliente del CRM' })
  }
})

// GET /api/clientes
router.get('/', requireAuth, async (req, res) => {
  try {
    const clientes = await prisma.cliente.findMany({
      include: { _count: { select: { proyectos: true, sitios: true } } },
      orderBy: { nombreComercial: 'asc' },
    })
    res.json(clientes)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// POST /api/clientes — CRM obligatorio: solo vincula clientes que existen en
// el CRM. Para crear uno nuevo primero hay que darlo de alta en el CRM
// (POST /api/clientes/crm). Los datos maestros siempre salen del CRM.
router.post('/', requireAuth, async (req, res) => {
  if (!crmConfigurado()) return crmNoConfigurado(res)
  const { crmId, contactoId } = req.body
  if (!crmId?.trim()) {
    return res.status(400).json({ error: 'Los clientes nacen en el CRM: búscalo e impórtalo, o regístralo primero en el CRM' })
  }

  try {
    const { cliente } = await importarClienteCrm(crmId.trim(), contactoId ? String(contactoId) : null)
    res.status(201).json(cliente)
  } catch (err) {
    if (/no existe en el CRM/i.test(err.message)) return res.status(404).json({ error: err.message })
    if (err.code === 'P2002') return res.status(409).json({ error: 'Ese cliente del CRM ya existe en Foco' })
    console.error(err)
    res.status(502).json({ error: err.message || 'No pudimos crear el cliente' })
  }
})

// GET /api/clientes/:id
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const cliente = await prisma.cliente.findUnique({
      where: { id: req.params.id },
      include: {
        sitios: { orderBy: { creadoEn: 'asc' } },
        proyectos: { select: { slug: true, tipo: true, status: true, proyecto: true } },
      },
    })
    if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' })
    res.json(cliente)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// POST /api/clientes/:clienteId/sitios
router.post('/:clienteId/sitios', requireAuth, async (req, res) => {
  const { nombre, url, dominio, hostingProveedor, dnsProveedor, tipoInstalacion, driveFolderUrl, contactoTecnico, coberturaMantenimiento, infraestructura, enhancedSiteId, enhancedServerId, cloudflareZoneId } = req.body
  if (!nombre?.trim()) return res.status(400).json({ error: 'El nombre del sitio es requerido (ej. "Sitio principal")' })

  try {
    const cliente = await prisma.cliente.findUnique({ where: { id: req.params.clienteId } })
    if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' })

    const sitio = await prisma.sitio.create({
      data: {
        clienteId: cliente.id,
        nombre,
        dominio: dominioDesde(dominio || url),
        url: url || null,
        hostingProveedor: hostingProveedor || null,
        dnsProveedor: dnsProveedor || null,
        tipoInstalacion: tipoInstalacion || null,
        driveFolderUrl: driveFolderUrl || null,
        contactoTecnico: contactoTecnico || null,
        coberturaMantenimiento: coberturaMantenimiento || null,
        infraestructura: infraestructura || 'sin_localizar',
        enhancedSiteId: enhancedSiteId || null,
        enhancedServerId: enhancedServerId || null,
        cloudflareZoneId: cloudflareZoneId || null,
      },
    })
    res.status(201).json(sitio)
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Ese dominio ya esta registrado' })
    console.error(err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// PUT /api/clientes/sitios/:sitioId
router.put('/sitios/:sitioId', requireAuth, async (req, res) => {
  const campos = ['nombre', 'url', 'hostingProveedor', 'dnsProveedor', 'tipoInstalacion', 'driveFolderUrl', 'contactoTecnico', 'coberturaMantenimiento', 'infraestructura', 'enhancedSiteId', 'enhancedServerId', 'cloudflareZoneId']
  const data = {}
  campos.forEach((c) => { if (req.body[c] !== undefined) data[c] = req.body[c] || null })
  if (req.body.dominio !== undefined || req.body.url !== undefined) data.dominio = dominioDesde(req.body.dominio || req.body.url)
  if (data.nombre === null) return res.status(400).json({ error: 'El nombre del sitio no puede quedar vacío' })

  try {
    const sitio = await prisma.sitio.update({ where: { id: req.params.sitioId }, data })
    res.json(sitio)
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Sitio no encontrado' })
    console.error(err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// DELETE /api/clientes/sitios/:sitioId
router.delete('/sitios/:sitioId', requireAuth, async (req, res) => {
  try {
    await prisma.sitio.delete({ where: { id: req.params.sitioId } })
    res.json({ ok: true })
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Sitio no encontrado' })
    console.error(err)
    res.status(500).json({ error: 'Error interno' })
  }
})

export default router
