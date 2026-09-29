import { Router } from 'express'
import prisma from '../lib/prisma.js'
import { requireAuth } from '../middleware/auth.js'
import { emitirCambio } from '../lib/eventos.js'
import { notificarMencion } from '../lib/notificaciones.js'
import { crearNotificacion } from '../lib/notificacionesHelper.js'

const router = Router({ mergeParams: true })

const TEXTO_MAX = 5000

// Notas de estatus del proyecto — el hilo del tab "Status". Equipo interno:
// nunca se exponen al portal del cliente. Mismo contrato de menciones que
// los comentarios de tarea: el frontend manda `mencionados` como userIds ya
// resueltos por su picker, y aquí van correo + notificación in-app con el
// link directo al proyecto.
router.get('/', requireAuth, async (req, res) => {
  try {
    const p = await prisma.proyecto.findFirst({
      where: { OR: [{ slug: req.params.slug }, { id: req.params.slug }] },
      select: { id: true },
    })
    if (!p) return res.status(404).json({ error: 'Proyecto no encontrado' })

    const notas = await prisma.notaProyecto.findMany({
      where: { proyectoId: p.id },
      orderBy: { creadoEn: 'desc' },
      take: 200,
    })
    res.json(notas)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Error interno' })
  }
})

router.post('/', requireAuth, async (req, res) => {
  const texto = req.body?.texto?.trim()
  const mencionados = Array.isArray(req.body?.mencionados) ? req.body.mencionados : []
  if (!texto) return res.status(400).json({ error: 'La nota no puede estar vacía' })
  if (texto.length > TEXTO_MAX) return res.status(400).json({ error: `La nota no puede exceder ${TEXTO_MAX} caracteres` })

  try {
    const p = await prisma.proyecto.findFirst({
      where: { OR: [{ slug: req.params.slug }, { id: req.params.slug }] },
    })
    if (!p) return res.status(404).json({ error: 'Proyecto no encontrado' })

    const nota = await prisma.notaProyecto.create({
      data: { proyectoId: p.id, autor: req.user.nombre, autorId: req.user.id, texto, mencionados },
    })
    await prisma.logEntry.create({
      data: { proyectoId: p.id, usuario: req.user.nombre, accion: 'Nota de status', detalle: texto.slice(0, 80) },
    })

    if (mencionados.length) {
      const usuarios = await prisma.user.findMany({
        where: { id: { in: mencionados }, activo: true },
        select: { id: true, email: true, nombre: true, rol: true },
      })
      notificarMencion(p, { titulo: 'Nota de status del proyecto' }, req.user.nombre, texto, usuarios).catch((err) => {
        console.error('Error notificando mención en nota:', err)
      })
      await crearNotificacion({
        destinatarioIds: usuarios.map((u) => u.id),
        tipo: 'proyecto_nota_mencion',
        mensaje: `${req.user.nombre} te mencionó en una nota de status de ${p.cliente?.nombreComercial || p.slug}`,
        actor: req.user,
        proyecto: p,
      })
    }

    emitirCambio(p.id)
    res.status(201).json(nota)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Error interno' })
  }
})

export default router
