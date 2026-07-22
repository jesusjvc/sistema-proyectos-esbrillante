import { Router } from 'express'
import { randomUUID } from 'crypto'
import { z } from 'zod'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import prisma from '../lib/prisma.js'
import { requireApiKey } from '../middleware/auth.js'
import { calcularAvance, getFaseActual } from '../lib/avance.js'
import { generarSlug } from '../lib/slug.js'

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
    'crear_proyecto',
    {
      title: 'Crear proyecto',
      description: 'Da de alta un proyecto nuevo en el Sistema de Seguimiento para poder empezar a reportarle avance. No confirma pagos ni cierra proyectos: anticipoConfirmado es solo informativo (si es false, el proyecto queda en status "pendiente_anticipo" hasta que se confirme desde el panel admin).',
      inputSchema: {
        clienteNombre: z.string().describe('Nombre comercial del cliente'),
        contactoNombre: z.string().optional().describe('Nombre del contacto principal del cliente'),
        correo: z.string().optional().describe('Correo del contacto principal'),
        paquete: z.string().optional().describe('Nombre del paquete/tipo de proyecto. Default: "Personalizado"'),
        fases: z.array(z.object({ numero: z.number().int(), nombre: z.string() })).optional()
          .describe('Fases del proyecto en orden, ej. [{"numero":1,"nombre":"Fase 1 — Auth"}]. Si se omite, usa un default genérico de 3 fases (Planeación/Desarrollo/Entrega).'),
        fechaInicio: z.string().optional().describe('Fecha de inicio en formato YYYY-MM-DD. Default: hoy'),
        fechaEstimadaEntrega: z.string().optional().describe('Fecha estimada de entrega en formato YYYY-MM-DD'),
        anticipoConfirmado: z.boolean().describe('true SOLO si consta que el anticipo/pago inicial ya fue confirmado y recibido. Si no estás seguro, usa false.'),
        passwordCliente: z.string().optional().describe('Contraseña de acceso al portal del cliente. Si se omite, se genera una automáticamente.'),
      },
    },
    async ({ clienteNombre, contactoNombre, correo, paquete, fases, fechaInicio, fechaEstimadaEntrega, anticipoConfirmado, passwordCliente }) => {
      const slug = generarSlug(clienteNombre)
      const fasesFinal = fases?.length ? fases : [
        { numero: 1, nombre: 'Planeación' },
        { numero: 2, nombre: 'Desarrollo' },
        { numero: 3, nombre: 'Entrega' },
      ]
      const password = passwordCliente || randomUUID().slice(0, 8)
      const paqueteFinal = paquete || 'Personalizado'

      const p = await prisma.proyecto.create({
        data: {
          slug,
          status: anticipoConfirmado ? 'activo' : 'pendiente_anticipo',
          cliente: { nombreComercial: clienteNombre, contactoNombre: contactoNombre || '', correo: correo || '', whatsapp: '', participantes: [] },
          proyecto: {
            paquete: paqueteFinal,
            fases: fasesFinal,
            extras: [],
            fechaInicio: fechaInicio || new Date().toISOString().slice(0, 10),
            fechaEstimadaEntrega: fechaEstimadaEntrega || null,
            anticipoConfirmado,
          },
          condicionesTecnicas: {},
          equipo: {},
          passwordCliente: password,
          linksCliente: { drive: '', brief: '', boceto: '', diseno: '' },
          tiempos: { inicio: anticipoConfirmado ? new Date().toISOString() : null, cierre: null, pausas: [] },
        },
      })
      await logEntry(p.id, USUARIO_MCP, 'Proyecto creado', `Paquete: ${paqueteFinal}`)

      const avisoAnticipo = anticipoConfirmado ? '' : ' Status: "pendiente_anticipo" — confirma el anticipo desde el panel admin cuando corresponda.'
      return ok(`Proyecto "${clienteNombre}" creado. slug: "${p.slug}". Contraseña del portal del cliente: "${password}".${avisoAnticipo}`)
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
          .map((t) => ({ id: t.id, fase: t.fase, titulo: t.titulo, instrucciones: t.instruccionesCliente, plazoHoras: t.plazoHoras })),
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
      description: 'Marca como completada una tarea que ya existe — tanto del checklist del equipo como una solicitud al cliente (tareasPendientesEquipo o tareasPendientesCliente de ver_proyecto). Úsala también para cerrar una solicitud al cliente cuando responda por otro canal (WhatsApp, correo): pasa "respuesta" para dejar registrado qué contestó.',
      inputSchema: {
        slug: z.string().describe('Slug o ID del proyecto'),
        tareaId: z.string().describe('ID de la tarea a completar (ver_proyecto lista los IDs pendientes)'),
        respuesta: z.string().optional().describe('Si se está cerrando una solicitud al cliente, qué fue lo que respondió'),
      },
    },
    async ({ slug, tareaId, respuesta }) => {
      const p = await getProyecto(slug)
      if (!p) return fail(`No se encontró un proyecto con slug "${slug}".`)

      const tarea = p.tareas.find((t) => t.id === tareaId)
      if (!tarea) return fail(`No se encontró la tarea "${tareaId}" en el proyecto "${slug}".`)

      await prisma.tarea.update({
        where: { id: tareaId },
        data: { estado: 'completada', completadaPor: USUARIO_MCP, completadaEn: new Date() },
      })
      await logEntry(p.id, USUARIO_MCP, 'Tarea completada', respuesta ? `${tarea.titulo} — Respuesta: ${respuesta}` : tarea.titulo)

      return ok(`Tarea "${tarea.titulo}" marcada como completada.${respuesta ? ' Respuesta registrada en el log.' : ''}`)
    },
  )

  server.registerTool(
    'editar_actividad',
    {
      title: 'Editar actividad o solicitud',
      description: 'Corrige el título, descripción, instrucciones al cliente o plazo de una tarea ya creada (del equipo o del cliente). Solo actualiza los campos que se manden.',
      inputSchema: {
        slug: z.string().describe('Slug o ID del proyecto'),
        tareaId: z.string().describe('ID de la tarea a editar'),
        titulo: z.string().optional().describe('Nuevo título'),
        descripcion: z.string().optional().describe('Nueva descripción interna'),
        instrucciones: z.string().optional().describe('Nuevas instrucciones para el cliente (solo aplica a solicitudes al cliente)'),
        plazoHoras: z.number().int().optional().describe('Nuevo plazo en horas'),
      },
    },
    async ({ slug, tareaId, titulo, descripcion, instrucciones, plazoHoras }) => {
      const p = await getProyecto(slug)
      if (!p) return fail(`No se encontró un proyecto con slug "${slug}".`)

      const tarea = p.tareas.find((t) => t.id === tareaId)
      if (!tarea) return fail(`No se encontró la tarea "${tareaId}" en el proyecto "${slug}".`)

      const data = {}
      if (titulo !== undefined) data.titulo = titulo
      if (descripcion !== undefined) data.descripcion = descripcion
      if (instrucciones !== undefined) data.instruccionesCliente = instrucciones
      if (plazoHoras !== undefined) data.plazoHoras = plazoHoras

      if (!Object.keys(data).length) return fail('No se especificó ningún campo para editar.')

      await prisma.tarea.update({ where: { id: tareaId }, data })
      await logEntry(p.id, USUARIO_MCP, 'Tarea editada', tarea.titulo)

      return ok(`"${tarea.titulo}" actualizada.`)
    },
  )

  server.registerTool(
    'cancelar_actividad',
    {
      title: 'Cancelar actividad o solicitud',
      description: 'Cancela una tarea del equipo o una solicitud al cliente que ya no aplica. No la borra: queda marcada como omitida y desaparece de las listas de pendientes de ver_proyecto.',
      inputSchema: {
        slug: z.string().describe('Slug o ID del proyecto'),
        tareaId: z.string().describe('ID de la tarea a cancelar'),
        motivo: z.string().optional().describe('Por qué se cancela'),
      },
    },
    async ({ slug, tareaId, motivo }) => {
      const p = await getProyecto(slug)
      if (!p) return fail(`No se encontró un proyecto con slug "${slug}".`)

      const tarea = p.tareas.find((t) => t.id === tareaId)
      if (!tarea) return fail(`No se encontró la tarea "${tareaId}" en el proyecto "${slug}".`)

      await prisma.tarea.update({ where: { id: tareaId }, data: { estado: 'omitida' } })
      await logEntry(p.id, USUARIO_MCP, 'Tarea cancelada', motivo ? `${tarea.titulo} — ${motivo}` : tarea.titulo)

      return ok(`"${tarea.titulo}" cancelada.`)
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
