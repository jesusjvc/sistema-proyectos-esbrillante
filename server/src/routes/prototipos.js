import { Router } from 'express'
import { requireAuth, requireAdmin } from '../middleware/auth.js'
import {
  listarPrototipos,
  crearPrototipo,
  actualizarPrototipo,
  eliminarPrototipo,
} from '../lib/pagesMcpClient.js'

const router = Router()

// GET /api/prototipos — lista todos los prototipos (esbrillante-pages-mcp es la fuente de verdad)
router.get('/', requireAuth, async (req, res) => {
  try {
    res.json(await listarPrototipos())
  } catch (err) {
    console.error(err)
    res.status(502).json({ error: err.message })
  }
})

// POST /api/prototipos — publica un nuevo prototipo, opcionalmente ligado a un proyecto
router.post('/', requireAuth, async (req, res) => {
  const { nombre, html, proyectoSlug, proyectoNombre } = req.body
  if (!nombre || !html) return res.status(400).json({ error: 'nombre y html son requeridos' })

  try {
    res.json(await crearPrototipo({ nombre, html, proyectoSlug, proyectoNombre }))
  } catch (err) {
    console.error(err)
    res.status(502).json({ error: err.message })
  }
})

// PATCH /api/prototipos/:slug — reasignar proyecto y/o marcar aprobado
router.patch('/:slug', requireAuth, async (req, res) => {
  const { proyectoSlug, proyectoNombre, aprobado } = req.body
  try {
    res.json(await actualizarPrototipo(req.params.slug, { proyectoSlug, proyectoNombre, aprobado }))
  } catch (err) {
    console.error(err)
    res.status(502).json({ error: err.message })
  }
})

// DELETE /api/prototipos/:slug — solo Admin, es irreversible
router.delete('/:slug', requireAdmin, async (req, res) => {
  try {
    res.json(await eliminarPrototipo(req.params.slug))
  } catch (err) {
    console.error(err)
    res.status(502).json({ error: err.message })
  }
})

export default router
