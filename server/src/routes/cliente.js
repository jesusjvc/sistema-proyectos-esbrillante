import { Router } from 'express'
import multer from 'multer'
import prisma from '../lib/prisma.js'
import { firmarToken, verificarToken } from '../lib/jwt.js'
import { requireClienteToken } from '../middleware/auth.js'
import { obtenerOCrearCarpetaProyecto, subirArchivo, driveConfigurado } from '../lib/drive.js'
import { emitirCambio } from '../lib/eventos.js'
import { enviarEmail } from '../lib/email.js'

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } })

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
// Acepta multipart/form-data opcional: campo "respuestaTexto" y/o archivo "archivo"
router.post('/:slug/tareas/:tareaId/completar', requireClienteToken, upload.single('archivo'), async (req, res) => {
  const { slug, tareaId } = req.params
  const respuestaTexto = req.body?.respuestaTexto?.trim() || null

  try {
    const p = await getProyecto(slug)
    if (!p || p.id !== req.clienteProyectoId) return res.status(403).json({ error: 'Sin acceso' })

    const data = { estado: 'completada', completadaPor: 'Cliente', completadaEn: new Date() }
    if (respuestaTexto) data.respuestaTexto = respuestaTexto

    if (req.file) {
      if (!driveConfigurado()) return res.status(503).json({ error: 'La subida de archivos todavía no está configurada. Por ahora, comparte el archivo por otro medio.' })
      const carpetaId = await obtenerOCrearCarpetaProyecto(p)
      if (!p.driveRespuestasId) await prisma.proyecto.update({ where: { id: p.id }, data: { driveRespuestasId: carpetaId } })
      const subido = await subirArchivo({ carpetaId, nombre: req.file.originalname, mimeType: req.file.mimetype, buffer: req.file.buffer })
      data.respuestaArchivoUrl = subido.url
      data.respuestaArchivoNombre = subido.nombre
    }

    const tarea = await prisma.tarea.update({ where: { id: tareaId }, data })

    const partesDetalle = [tarea.titulo]
    if (respuestaTexto) partesDetalle.push(`Respuesta: ${respuestaTexto}`)
    if (data.respuestaArchivoNombre) partesDetalle.push(`Archivo: ${data.respuestaArchivoNombre}`)

    await prisma.logEntry.create({
      data: { proyectoId: p.id, usuario: 'Cliente', accion: 'Tarea completada por cliente', detalle: partesDetalle.join(' — ') },
    })

    emitirCambio(p.id)
    notificarAdminsRespuestaCliente(p, tarea, { respuestaTexto, archivoNombre: data.respuestaArchivoNombre, archivoUrl: data.respuestaArchivoUrl }).catch((err) => console.error('Error notificando a admins:', err))
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

async function notificarAdminsRespuestaCliente(proyecto, tarea, { respuestaTexto, archivoNombre, archivoUrl }) {
  const admins = await prisma.user.findMany({ where: { rol: 'ADMIN', activo: true }, select: { email: true, nombre: true } })
  if (!admins.length) return

  const nombreCliente = proyecto.cliente?.nombreComercial || proyecto.slug
  const linkProyecto = `${process.env.CLIENT_URL || ''}/admin/proyecto/${proyecto.slug}`

  const partes = [`${nombreCliente} respondió "${tarea.titulo}".`]
  if (respuestaTexto) partes.push(`\nRespuesta: ${respuestaTexto}`)
  if (archivoNombre) partes.push(`\nArchivo adjunto: ${archivoNombre}${archivoUrl ? ` (${archivoUrl})` : ''}`)
  partes.push(`\nVer proyecto: ${linkProyecto}`)
  const texto = partes.join('\n')

  const html = `
    <p><strong>${nombreCliente}</strong> respondió "<strong>${tarea.titulo}</strong>".</p>
    ${respuestaTexto ? `<p>${respuestaTexto}</p>` : ''}
    ${archivoUrl ? `<p>📎 <a href="${archivoUrl}">${archivoNombre}</a></p>` : ''}
    <p><a href="${linkProyecto}">Ver proyecto en el sistema →</a></p>
  `

  await Promise.all(admins.map((a) => enviarEmail({
    to: a.email,
    nombreDestino: a.nombre,
    asunto: `💬 ${nombreCliente} respondió — ${tarea.titulo}`,
    texto,
    html,
  })))
}

function proyectoPublico(p) {
  const { passwordCliente, ...rest } = p
  return rest
}

export default router
