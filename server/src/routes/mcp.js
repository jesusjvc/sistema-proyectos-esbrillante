import { Router } from 'express'
import { randomUUID } from 'crypto'
import { z } from 'zod'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import prisma from '../lib/prisma.js'
import { requireApiKey } from '../middleware/auth.js'
import { calcularAvance, getFaseActual } from '../lib/avance.js'

const router = Router()

const USUARIO_MCP = 'Claude Code (MCP)'

function ok(text) {
  return { content: [{ type: 'text', text }] }
}

function fail(text) {
  return { content: [{ type: 'text', text }], isError: true }
}

async function getProyecto(slug) {
  return prisma.proyecto.findFirst({
    where: { OR: [{ slug }, { id: slug }] },
    include: { tareas: true },
  })
}

async function logEntry(proyectoId, usuario, accion, detalle = '') {
  return prisma.logEntry.create({ data: { proyectoId, usuario, accion, detalle } })
}

function buildServer() {
  const server = new McpServer({ name: 'esbrillante-seguimiento', version: '1.0.0' })

  server.registerTool(
    'listar_proyectos',
    {
      title: 'Listar proyectos',
      description: 'Lista los proyectos activos (excluye los que aún no confirman anticipo) con su slug, cliente, paquete, status y % de avance.',
      inputSchema: {},
    },
    async () => {
      const proyectos = await prisma.proyecto.findMany({
        where: { status: { not: 'pendiente_anticipo' } },
        include: { tareas: true },
        orderBy: { creadoEn: 'desc' },
      })
      const resumen = proyectos.map((p) => ({
        slug: p.slug,
        cliente: p.cliente?.nombreComercial || '(sin nombre)',
        paquete: p.proyecto?.paquete || '(sin paquete)',
        status: p.status,
        avance: calcularAvance(p),
      }))
      return ok(JSON.stringify(resumen, null, 2))
    },
  )

  server.registerTool(
    'ver_proyecto',
    {
      title: 'Ver estado de un proyecto',
      description: 'Devuelve fase actual, % de avance, status y las tareas pendientes (del equipo y del cliente) de un proyecto.',
      inputSchema: { slug: z.string().describe('Slug o ID del proyecto') },
    },
    async ({ slug }) => {
      const p = await getProyecto(slug)
      if (!p) return fail(`No se encontró un proyecto con slug "${slug}".`)

      const fase = getFaseActual(p)
      const fases = p.proyecto?.fases || []
      const faseNombre = fases.find((f) => f.numero === fase)?.nombre || ''

      const resumen = {
        slug: p.slug,
        cliente: p.cliente?.nombreComercial || '(sin nombre)',
        paquete: p.proyecto?.paquete || '(sin paquete)',
        status: p.status,
        avance: calcularAvance(p),
        faseActual: fase,
        faseNombre,
        tareasPendientesEquipo: p.tareas
          .filter((t) => !t.esCliente && t.estado === 'pendiente')
          .map((t) => ({ id: t.id, fase: t.fase, titulo: t.titulo })),
        tareasPendientesCliente: p.tareas
          .filter((t) => t.esCliente && t.estado === 'pendiente')
          .map((t) => ({ id: t.id, fase: t.fase, titulo: t.titulo, instrucciones: t.instruccionesCliente })),
      }
      return ok(JSON.stringify(resumen, null, 2))
    },
  )

  server.registerTool(
    'registrar_actividad',
    {
      title: 'Registrar actividad',
      description: 'Agrega una actividad no contemplada en el checklist original. Por defecto queda marcada como completada de inmediato (para reportar avance ya hecho); si está en proceso, pasar completada=false. Si es del equipo (no esCliente), aparece en el portal del cliente dentro de "¿Qué está haciendo el equipo?".',
      inputSchema: {
        slug: z.string().describe('Slug o ID del proyecto'),
        titulo: z.string().describe('Título breve de la actividad'),
        descripcion: z.string().optional().describe('Detalle interno de la actividad'),
        fase: z.number().int().optional().describe('Número de fase; si se omite, usa la fase actual del proyecto'),
        completada: z.boolean().optional().describe('Si es false, la actividad queda pendiente en vez de completada. Default: true'),
      },
    },
    async ({ slug, titulo, descripcion, fase, completada }) => {
      const p = await getProyecto(slug)
      if (!p) return fail(`No se encontró un proyecto con slug "${slug}".`)

      const faseFinal = fase ?? getFaseActual(p)
      const marcarCompletada = completada !== false

      await prisma.tarea.create({
        data: {
          id: randomUUID(),
          proyectoId: p.id,
          fase: faseFinal,
          titulo,
          descripcion: descripcion || '',
          responsable: 'equipo',
          dependencias: [],
          custom: true,
          estado: marcarCompletada ? 'completada' : 'pendiente',
          completadaPor: marcarCompletada ? USUARIO_MCP : null,
          completadaEn: marcarCompletada ? new Date() : null,
        },
      })
      await logEntry(p.id, USUARIO_MCP, marcarCompletada ? 'Tarea agregada y completada' : 'Tarea agregada', titulo)

      return ok(`Actividad "${titulo}" registrada en fase ${faseFinal}${marcarCompletada ? ' y marcada como completada' : ' (pendiente)'}.`)
    },
  )

  server.registerTool(
    'solicitar_al_cliente',
    {
      title: 'Solicitar algo al cliente',
      description: 'Crea una tarea pendiente para el cliente. Aparece de inmediato en su portal dentro de "Necesitamos tu respuesta".',
      inputSchema: {
        slug: z.string().describe('Slug o ID del proyecto'),
        titulo: z.string().describe('Título breve de lo que se necesita'),
        instrucciones: z.string().describe('Instrucciones claras para el cliente sobre qué debe hacer'),
        plazoHoras: z.number().int().optional().describe('Plazo sugerido en horas'),
        fase: z.number().int().optional().describe('Número de fase; si se omite, usa la fase actual del proyecto'),
      },
    },
    async ({ slug, titulo, instrucciones, plazoHoras, fase }) => {
      const p = await getProyecto(slug)
      if (!p) return fail(`No se encontró un proyecto con slug "${slug}".`)

      const faseFinal = fase ?? getFaseActual(p)

      await prisma.tarea.create({
        data: {
          id: randomUUID(),
          proyectoId: p.id,
          fase: faseFinal,
          titulo,
          responsable: 'cliente',
          esCliente: true,
          instruccionesCliente: instrucciones,
          plazoHoras: plazoHoras ?? null,
          dependencias: [],
          custom: true,
          estado: 'pendiente',
        },
      })
      await logEntry(p.id, USUARIO_MCP, 'Solicitud al cliente creada', titulo)

      return ok(`Se creó la solicitud "${titulo}" para el cliente en fase ${faseFinal}.`)
    },
  )

  server.registerTool(
    'completar_actividad',
    {
      title: 'Completar actividad existente',
      description: 'Marca como completada una tarea que ya existe en el checklist del proyecto (del checklist base o creada antes).',
      inputSchema: {
        slug: z.string().describe('Slug o ID del proyecto'),
        tareaId: z.string().describe('ID de la tarea a completar (ver_proyecto lista los IDs pendientes)'),
      },
    },
    async ({ slug, tareaId }) => {
      const p = await getProyecto(slug)
      if (!p) return fail(`No se encontró un proyecto con slug "${slug}".`)

      const tarea = p.tareas.find((t) => t.id === tareaId)
      if (!tarea) return fail(`No se encontró la tarea "${tareaId}" en el proyecto "${slug}".`)

      await prisma.tarea.update({
        where: { id: tareaId },
        data: { estado: 'completada', completadaPor: USUARIO_MCP, completadaEn: new Date() },
      })
      await logEntry(p.id, USUARIO_MCP, 'Tarea completada', tarea.titulo)

      return ok(`Tarea "${tarea.titulo}" marcada como completada.`)
    },
  )

  server.registerTool(
    'nota_interna',
    {
      title: 'Agregar nota interna',
      description: 'Registra una nota libre en el log de actividad del proyecto. Solo visible en el panel admin — nunca en el portal del cliente.',
      inputSchema: {
        slug: z.string().describe('Slug o ID del proyecto'),
        mensaje: z.string().describe('Contenido de la nota'),
      },
    },
    async ({ slug, mensaje }) => {
      const p = await getProyecto(slug)
      if (!p) return fail(`No se encontró un proyecto con slug "${slug}".`)

      await logEntry(p.id, USUARIO_MCP, 'Nota', mensaje)

      return ok('Nota interna registrada.')
    },
  )

  return server
}

// POST /mcp
router.post('/', requireApiKey, async (req, res) => {
  try {
    const server = buildServer()
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })

    res.on('close', () => {
      transport.close()
      server.close()
    })

    await server.connect(transport)
    await transport.handleRequest(req, res, req.body)
  } catch (err) {
    console.error(err)
    if (!res.headersSent) {
      res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Error interno' }, id: null })
    }
  }
})

export default router
