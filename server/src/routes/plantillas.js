import { Router } from 'express'
import prisma from '../lib/prisma.js'
import { requireAdmin } from '../middleware/auth.js'
import { ordenAlFinal, ordenAntesDe, ordenDespuesDe } from '../lib/orden.js'
import { materializarTareasDesdePlantilla } from '../lib/plantillaHelpers.js'

const router = Router()

const INCLUDE = { tareas: { orderBy: { orden: 'asc' } } }

// GET /api/plantillas
router.get('/', requireAdmin, async (req, res) => {
  try {
    const plantillas = await prisma.plantilla.findMany({ include: INCLUDE, orderBy: { creadoEn: 'asc' } })
    res.json(plantillas)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// GET /api/plantillas/:id
router.get('/:id', requireAdmin, async (req, res) => {
  try {
    const p = await prisma.plantilla.findUnique({ where: { id: req.params.id }, include: INCLUDE })
    if (!p) return res.status(404).json({ error: 'Plantilla no encontrada' })
    res.json(p)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// POST /api/plantillas
router.post('/', requireAdmin, async (req, res) => {
  const { nombre, area, descripcion, fases, copiarDeId } = req.body
  if (!nombre?.trim()) return res.status(400).json({ error: 'El nombre es requerido' })

  try {
    const data = {
      nombre: nombre.trim(),
      area: area?.trim() || 'General',
      descripcion: descripcion || '',
      fases: fases || [],
    }

    if (copiarDeId) {
      const origen = await prisma.plantilla.findUnique({ where: { id: copiarDeId }, include: INCLUDE })
      if (!origen) return res.status(404).json({ error: 'Plantilla de origen no encontrada' })
      data.fases = fases || origen.fases
      // Las dependencias no se remapean al copiar entre plantillas distintas
      // (los ids nuevos se generan en el create y no se conocen de antemano)
      // — quedan sin dependencias, hay que revisarlas a mano tras copiar.
      data.tareas = {
        create: origen.tareas.map(({ id: _id, plantillaId: _plantillaId, ...t }) => ({ ...t, dependencias: [] })),
      }
    }

    const nueva = await prisma.plantilla.create({ data, include: INCLUDE })
    res.status(201).json(nueva)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// PUT /api/plantillas/:id
router.put('/:id', requireAdmin, async (req, res) => {
  const campos = ['nombre', 'area', 'descripcion', 'fases']
  try {
    const data = {}
    campos.forEach((c) => { if (req.body[c] !== undefined) data[c] = req.body[c] })
    const p = await prisma.plantilla.update({ where: { id: req.params.id }, data, include: INCLUDE })
    res.json(p)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// DELETE /api/plantillas/:id
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    await prisma.plantilla.delete({ where: { id: req.params.id } })
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// POST /api/plantillas/:id/tareas
router.post('/:id/tareas', requireAdmin, async (req, res) => {
  const { id } = req.params
  const { fase, titulo, responsable, dependencias, condicion, descripcion, queHacer, necesitasAntes,
    plantillaMensaje, queEntregas, linkTipo, esCliente, instruccionesCliente, plazoHoras,
    esRutaCritica, soloAdmin, soloKarlaOAdmin, opcional } = req.body

  if (!titulo?.trim()) return res.status(400).json({ error: 'El título es requerido' })
  if (!fase) return res.status(400).json({ error: 'La fase es requerida' })

  try {
    const plantilla = await prisma.plantilla.findUnique({ where: { id }, include: INCLUDE })
    if (!plantilla) return res.status(404).json({ error: 'Plantilla no encontrada' })

    if (dependencias?.length) {
      const idsValidos = new Set(plantilla.tareas.map((t) => t.id))
      const invalidos = dependencias.filter((d) => !idsValidos.has(d))
      if (invalidos.length) return res.status(400).json({ error: `Dependencias inválidas: ${invalidos.join(', ')}` })
    }

    const tareasFase = plantilla.tareas.filter((t) => t.fase === fase)
    const nueva = await prisma.tareaPlantilla.create({
      data: {
        plantillaId: id,
        fase,
        orden: ordenAlFinal(tareasFase),
        titulo: titulo.trim(),
        responsable: responsable || 'equipo',
        dependencias: dependencias || [],
        condicion: condicion || null,
        descripcion: descripcion || '',
        queHacer: queHacer || '',
        necesitasAntes: necesitasAntes || '',
        plantillaMensaje: plantillaMensaje || '',
        queEntregas: queEntregas || '',
        linkTipo: linkTipo || null,
        esCliente: esCliente || false,
        instruccionesCliente: instruccionesCliente || '',
        plazoHoras: plazoHoras ? Number(plazoHoras) : null,
        esRutaCritica: esRutaCritica || false,
        soloAdmin: soloAdmin || false,
        soloKarlaOAdmin: soloKarlaOAdmin || false,
        opcional: opcional || false,
      },
    })
    res.status(201).json(nueva)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// PUT /api/plantillas/:id/tareas/:tareaId
router.put('/:id/tareas/:tareaId', requireAdmin, async (req, res) => {
  const { id, tareaId } = req.params
  const campos = ['fase', 'titulo', 'responsable', 'dependencias', 'condicion', 'descripcion', 'queHacer',
    'necesitasAntes', 'plantillaMensaje', 'queEntregas', 'linkTipo', 'esCliente', 'instruccionesCliente',
    'plazoHoras', 'esRutaCritica', 'soloAdmin', 'soloKarlaOAdmin', 'opcional']

  try {
    const plantilla = await prisma.plantilla.findUnique({ where: { id }, include: INCLUDE })
    if (!plantilla) return res.status(404).json({ error: 'Plantilla no encontrada' })

    const data = {}
    campos.forEach((c) => { if (req.body[c] !== undefined) data[c] = req.body[c] })

    if (data.dependencias) {
      const idsValidos = new Set(plantilla.tareas.map((t) => t.id))
      const invalidos = data.dependencias.filter((d) => d === tareaId || !idsValidos.has(d))
      if (invalidos.length) return res.status(400).json({ error: `Dependencias inválidas: ${invalidos.join(', ')}` })
    }

    const { antesDeTareaId, despuesDeTareaId } = req.body
    if (antesDeTareaId || despuesDeTareaId) {
      const faseFinal = data.fase !== undefined ? data.fase : plantilla.tareas.find((t) => t.id === tareaId)?.fase
      const refId = antesDeTareaId || despuesDeTareaId
      const ref = plantilla.tareas.find((t) => t.id === refId && t.fase === faseFinal)
      if (!ref) return res.status(400).json({ error: `No se encontró la tarea de referencia "${refId}" en esa fase.` })
      const tareasFase = plantilla.tareas.filter((t) => t.fase === faseFinal && t.id !== tareaId).sort((a, b) => a.orden - b.orden)
      data.fase = faseFinal
      data.orden = antesDeTareaId ? ordenAntesDe(tareasFase, ref) : ordenDespuesDe(tareasFase, ref)
    }

    const tarea = await prisma.tareaPlantilla.update({ where: { id: tareaId }, data })
    res.json(tarea)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// DELETE /api/plantillas/:id/tareas/:tareaId
router.delete('/:id/tareas/:tareaId', requireAdmin, async (req, res) => {
  try {
    await prisma.tareaPlantilla.delete({ where: { id: req.params.tareaId } })
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// POST /api/plantillas/:id/materializar
router.post('/:id/materializar', requireAdmin, async (req, res) => {
  const { condicionesTecnicas, extras } = req.body
  try {
    const tareas = await materializarTareasDesdePlantilla(req.params.id, condicionesTecnicas, extras)
    res.json(tareas)
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message })
    console.error(err)
    res.status(500).json({ error: 'Error interno' })
  }
})

export default router
