import { Router } from 'express'
import prisma from '../lib/prisma.js'
import { verificarToken } from '../lib/jwt.js'
import { requireAuth } from '../middleware/auth.js'
import { suscribirse } from '../lib/eventos.js'

const router = Router()

function abrirStream(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  })
  res.write('\n')
  return setInterval(() => res.write(':ping\n\n'), 25000)
}

// GET /api/eventos/global — para vistas que muestran varios proyectos a la vez (Dashboard, MisTareas)
router.get('/global', requireAuth, (req, res) => {
  const keepAlive = abrirStream(res)
  const cancelar = suscribirse((evento) => res.write(`data: ${JSON.stringify(evento)}\n\n`))
  req.on('close', () => { clearInterval(keepAlive); cancelar() })
})

// GET /api/eventos/proyecto/:slug — acepta sesión de equipo/admin, o token de cliente de ESE proyecto
router.get('/proyecto/:slug', async (req, res) => {
  let autorizado = false

  if (req.cookies?.token) {
    try { verificarToken(req.cookies.token); autorizado = true } catch { /* no válido */ }
  }

  const p = await prisma.proyecto.findFirst({ where: { OR: [{ slug: req.params.slug }, { id: req.params.slug }] } })
  if (!p) return res.status(404).json({ error: 'Proyecto no encontrado' })

  if (!autorizado && req.cookies?.clienteToken) {
    try {
      const payload = verificarToken(req.cookies.clienteToken)
      if (payload.tipo === 'cliente' && payload.proyectoId === p.id) autorizado = true
    } catch { /* no válido */ }
  }

  if (!autorizado) return res.status(401).json({ error: 'No autenticado' })

  const keepAlive = abrirStream(res)
  const cancelar = suscribirse((evento) => {
    if (evento.proyectoId === p.id) res.write(`data: ${JSON.stringify(evento)}\n\n`)
  })
  req.on('close', () => { clearInterval(keepAlive); cancelar() })
})

export default router
