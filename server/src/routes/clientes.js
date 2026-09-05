import { Router } from 'express'
import prisma from '../lib/prisma.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

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
  const { nombre, url, hostingProveedor, dnsProveedor, tipoInstalacion, driveFolderUrl, contactoTecnico, coberturaMantenimiento } = req.body
  if (!nombre?.trim()) return res.status(400).json({ error: 'El nombre del sitio es requerido (ej. "Sitio principal")' })

  try {
    const cliente = await prisma.cliente.findUnique({ where: { id: req.params.clienteId } })
    if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' })

    const sitio = await prisma.sitio.create({
      data: {
        clienteId: cliente.id,
        nombre,
        url: url || null,
        hostingProveedor: hostingProveedor || null,
        dnsProveedor: dnsProveedor || null,
        tipoInstalacion: tipoInstalacion || null,
        driveFolderUrl: driveFolderUrl || null,
        contactoTecnico: contactoTecnico || null,
        coberturaMantenimiento: coberturaMantenimiento || null,
      },
    })
    res.status(201).json(sitio)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// PUT /api/clientes/sitios/:sitioId
router.put('/sitios/:sitioId', requireAuth, async (req, res) => {
  const campos = ['nombre', 'url', 'hostingProveedor', 'dnsProveedor', 'tipoInstalacion', 'driveFolderUrl', 'contactoTecnico', 'coberturaMantenimiento']
  const data = {}
  campos.forEach((c) => { if (req.body[c] !== undefined) data[c] = req.body[c] || null })
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
