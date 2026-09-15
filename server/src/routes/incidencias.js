import { Router } from 'express'
import prisma from '../lib/prisma.js'
import { requireAuth } from '../middleware/auth.js'
import { emitirCambio } from '../lib/eventos.js'

const router = Router()

const VALIDOS = {
  estado: ['todo', 'doing', 'revision', 'done'],
  prioridad: ['urgente', 'normal', 'cuando_se_pueda'],
  cobertura: ['incluido', 'cortesia', 'adicional', 'por_valorar'],
  infraestructura: ['esbrillante', 'externa', 'sin_localizar'],
  origen: ['whatsapp', 'telefono', 'interno', 'monitoreo'],
  tipo: ['falla', 'actualizacion', 'preventivo', 'consulta'],
}

const INCLUDE = {
  cliente: { select: { id: true, crmId: true, nombreComercial: true, contactoNombre: true, correo: true, whatsapp: true } },
  sitio: true,
}

function validarValores(data) {
  for (const [campo, valores] of Object.entries(VALIDOS)) {
    if (data[campo] !== undefined && !valores.includes(data[campo])) {
      return `${campo} invalido`
    }
  }
  return null
}

async function validarSitio(clienteId, sitioId) {
  return prisma.sitio.findFirst({ where: { id: sitioId, clienteId } })
}

// GET /api/incidencias
router.get('/', requireAuth, async (req, res) => {
  try {
    const incidencias = await prisma.incidencia.findMany({
      where: { archivada: req.query.archivadas === 'true' ? undefined : false },
      include: INCLUDE,
      orderBy: { creadoEn: 'desc' },
    })
    res.json(incidencias)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'No pudimos cargar los tickets' })
  }
})

// GET /api/incidencias/:id
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const incidencia = await prisma.incidencia.findUnique({ where: { id: req.params.id }, include: INCLUDE })
    if (!incidencia) return res.status(404).json({ error: 'Ticket no encontrado' })
    res.json(incidencia)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'No pudimos cargar el ticket' })
  }
})

// POST /api/incidencias
router.post('/', requireAuth, async (req, res) => {
  const { clienteId, sitioId, titulo } = req.body
  if (!clienteId || !sitioId || !titulo?.trim()) {
    return res.status(400).json({ error: 'Cliente, sitio y problema son obligatorios' })
  }
  const errorValor = validarValores(req.body)
  if (errorValor) return res.status(400).json({ error: errorValor })

  try {
    const sitio = await validarSitio(clienteId, sitioId)
    if (!sitio) return res.status(400).json({ error: 'El sitio no pertenece al cliente seleccionado' })

    const incidencia = await prisma.incidencia.create({
      data: {
        clienteId,
        sitioId,
        titulo: titulo.trim(),
        descripcion: req.body.descripcion?.trim() || '',
        estado: req.body.estado || 'todo',
        prioridad: req.body.prioridad || 'normal',
        cobertura: req.body.cobertura || sitio.coberturaMantenimiento || 'por_valorar',
        infraestructura: req.body.infraestructura || sitio.infraestructura || 'sin_localizar',
        origen: req.body.origen || 'interno',
        tipo: req.body.tipo || 'falla',
        responsableId: req.body.responsableId || null,
        reportadoPor: req.body.reportadoPor || req.user.nombre,
        telefonoOrigen: req.body.telefonoOrigen || null,
        fechaLimite: req.body.fechaLimite ? new Date(req.body.fechaLimite) : null,
        iniciadoEn: req.body.estado === 'doing' ? new Date() : null,
        resueltoEn: req.body.estado === 'done' ? new Date() : null,
      },
      include: INCLUDE,
    })
    emitirCambio('incidencias')
    res.status(201).json(incidencia)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'No pudimos crear el ticket' })
  }
})

// PUT /api/incidencias/:id
router.put('/:id', requireAuth, async (req, res) => {
  const campos = [
    'titulo', 'descripcion', 'estado', 'prioridad', 'cobertura', 'infraestructura',
    'origen', 'tipo', 'responsableId', 'reportadoPor', 'telefonoOrigen',
    'diagnostico', 'resolucion', 'causaRaiz', 'archivada', 'clienteId', 'sitioId',
  ]
  const data = Object.fromEntries(campos.filter((campo) => req.body[campo] !== undefined).map((campo) => [campo, req.body[campo]]))
  const errorValor = validarValores(data)
  if (errorValor) return res.status(400).json({ error: errorValor })
  if (data.titulo !== undefined && !data.titulo?.trim()) return res.status(400).json({ error: 'El problema no puede quedar vacio' })
  if (req.body.fechaLimite !== undefined) data.fechaLimite = req.body.fechaLimite ? new Date(req.body.fechaLimite) : null

  try {
    const actual = await prisma.incidencia.findUnique({ where: { id: req.params.id } })
    if (!actual) return res.status(404).json({ error: 'Ticket no encontrado' })

    const clienteId = data.clienteId || actual.clienteId
    const sitioId = data.sitioId || actual.sitioId
    if (!(await validarSitio(clienteId, sitioId))) {
      return res.status(400).json({ error: 'El sitio no pertenece al cliente seleccionado' })
    }

    if (data.estado === 'doing' && !actual.iniciadoEn) data.iniciadoEn = new Date()
    if (data.estado === 'done') data.resueltoEn = actual.resueltoEn || new Date()
    if (data.estado && data.estado !== 'done') data.resueltoEn = null

    const incidencia = await prisma.incidencia.update({ where: { id: req.params.id }, data, include: INCLUDE })
    emitirCambio('incidencias')
    res.json(incidencia)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'No pudimos guardar el ticket' })
  }
})

export default router
