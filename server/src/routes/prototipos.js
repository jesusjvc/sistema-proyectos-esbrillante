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

// POST /api/prototipos — publica un nuevo prototipo/página web, opcionalmente ligado a un proyecto
router.post('/', requireAuth, async (req, res) => {
  const { nombre, tipo, modo, html, url, proyectoSlug, proyectoNombre } = req.body
  if (!nombre) return res.status(400).json({ error: 'nombre es requerido' })
  if (modo === 'url' ? !url : !html) {
    return res.status(400).json({ error: modo === 'url' ? 'url es requerida' : 'html es requerido' })
  }

  try {
    res.json(await crearPrototipo({ nombre, tipo, modo, html, url, proyectoSlug, proyectoNombre }))
  } catch (err) {
    console.error(err)
    res.status(502).json({ error: err.message })
  }
})

// PATCH /api/prototipos/:slug — reasignar proyecto y/o cambiar estado
router.patch('/:slug', requireAuth, async (req, res) => {
  const { proyectoSlug, proyectoNombre, estado } = req.body
  try {
    res.json(await actualizarPrototipo(req.params.slug, { proyectoSlug, proyectoNombre, estado }))
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
