import { Router } from 'express'
import prisma from '../lib/prisma.js'
import { firmarToken, verificarToken } from '../lib/jwt.js'
import { requireClienteToken } from '../middleware/auth.js'

const router = Router()

async function getProyecto(slug) {
  return prisma.proyecto.findFirst({
    where: { OR: [{ slug }, { id: slug }] },
    include: { tareas: true },
  })
}

// POST /api/cliente/login
router.post('/login', async (req, res) => {
  const { slug, password } = req.body
  if (!slug || !password) return res.status(400).json({ error: 'Datos incompletos' })

  try {
    const p = await getProyecto(slug)
    if (!p) return res.status(401).json({ error: 'Proyecto no encontrado' })
    if (p.passwordCliente !== password) return res.status(401).json({ error: 'Contraseña incorrecta' })

    const token = firmarToken({ tipo: 'cliente', proyectoId: p.id, slug: p.slug }, { expiresIn: '30d' })

    res.cookie('clienteToken', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    })

    res.json(proyectoPublico(p))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// GET /api/cliente/:slug
router.get('/:slug', requireClienteToken, async (req, res) => {
  try {
    const p = await getProyecto(req.params.slug)
    if (!p || p.id !== req.clienteProyectoId) return res.status(403).json({ error: 'Sin acceso' })
    res.json(proyectoPublico(p))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// POST /api/cliente/:slug/tareas/:tareaId/completar
router.post('/:slug/tareas/:tareaId/completar', requireClienteToken, async (req, res) => {
  const { slug, tareaId } = req.params
  try {
    const p = await getProyecto(slug)
    if (!p || p.id !== req.clienteProyectoId) return res.status(403).json({ error: 'Sin acceso' })

    await prisma.tarea.update({
      where: { id: tareaId },
      data: { estado: 'completada', completadaPor: 'Cliente', completadaEn: new Date() },
    })
    await prisma.logEntry.create({
      data: { proyectoId: p.id, usuario: 'Cliente', accion: 'Tarea completada por cliente', detalle: tareaId },
    })

    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// POST /api/cliente/logout
router.post('/logout', (req, res) => {
  res.clearCookie('clienteToken')
  res.json({ ok: true })
})

function proyectoPublico(p) {
  const { passwordCliente, ...rest } = p
  return rest
}

export default router
