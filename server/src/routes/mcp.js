import { Router } from 'express'
import { randomUUID } from 'crypto'
import { z } from 'zod'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import prisma from '../lib/prisma.js'
import { requireApiKey } from '../middleware/auth.js'
import { calcularAvance, getFaseActual } from '../lib/avance.js'
import { generarSlug } from '../lib/slug.js'
import { ordenAlFinal, ordenAntesDe, ordenDespuesDe } from '../lib/orden.js'
import { emitirCambio } from '../lib/eventos.js'

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

// Decide en qué fase y en qué posición (orden) cae una tarea nueva (o una
// existente que se está reposicionando, vía excluirId para no interferir
// con su propia posición anterior).
// Si se da antesDeTareaId/despuesDeTareaId, la fase se toma de esa tarea de
// referencia (ignora el parámetro fase) y se inserta justo junto a ella.
// Si no, se agrega al final de la fase indicada (o la fase actual del proyecto).
//
// Tareas creadas antes de que existiera este campo quedaron todas con
// orden=0 (empatadas) — si detecta empates en la fase, primero renumera
// esas tareas de forma estable antes de calcular el punto medio, si no
// insertar "antes/después" de algo empatado no mueve nada de verdad.
async function resolverFaseYOrden(p, { fase, antesDeTareaId, despuesDeTareaId }, excluirId = null) {
  const refId = antesDeTareaId || despuesDeTareaId
  if (refId) {
    if (refId === excluirId) return { error: 'Una tarea no puede posicionarse antes/después de sí misma.' }
    const refOriginal = p.tareas.find((t) => t.id === refId)
    if (!refOriginal) return { error: `No se encontró la tarea de referencia "${refId}".` }

    let tareasFase = p.tareas.filter((t) => t.fase === refOriginal.fase && t.id !== excluirId).sort((a, b) => a.orden - b.orden)

    const hayEmpates = new Set(tareasFase.map((t) => t.orden)).size !== tareasFase.length
    if (hayEmpates) {
      tareasFase = tareasFase.map((t, idx) => ({ ...t, orden: idx }))
      await Promise.all(tareasFase.map((t) => prisma.tarea.update({ where: { id: t.id }, data: { orden: t.orden } })))
    }

    const ref = tareasFase.find((t) => t.id === refId)
    const orden = antesDeTareaId ? ordenAntesDe(tareasFase, ref) : ordenDespuesDe(tareasFase, ref)
    return { faseFinal: refOriginal.fase, orden }
  }
  const faseFinal = fase ?? getFaseActual(p)
  const tareasFase = p.tareas.filter((t) => t.fase === faseFinal)
  return { faseFinal, orden: ordenAlFinal(tareasFase) }
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
        fases: z.array(z.object({
          numero: z.number().int(),
          nombre: z.string(),
          fechaEstimada: z.string().optional().describe('Fecha estimada de esa fase, YYYY-MM-DD'),
          requierePago: z.boolean().optional().describe('true si esta fase no arranca hasta confirmar un pago adicional (ej. Parte A de Fase 2)'),
          pagoConfirmado: z.boolean().optional().describe('true si ese pago ya se confirmó'),
        })).optional()
          .describe('Fases del proyecto en orden, ej. [{"numero":1,"nombre":"Fase 1 — Auth","fechaEstimada":"2026-08-15"}]. Si se omite, usa un default genérico de 3 fases (Planeación/Desarrollo/Entrega). Úsalo para proyectos con pagos parciales por fase en vez de una sola fechaEstimadaEntrega — así el cliente ve el estimado real de cada etapa y cuál está esperando pago.'),
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
      emitirCambio(p.id)

      const avisoAnticipo = anticipoConfirmado ? '' : ' Status: "pendiente_anticipo" — confirma el anticipo desde el panel admin cuando corresponda.'
      return ok(`Proyecto "${clienteNombre}" creado. slug: "${p.slug}". Contraseña del portal del cliente: "${password}".${avisoAnticipo}`)
    },
  )

  server.registerTool(
    'actualizar_fase',
    {
      title: 'Actualizar fecha o estado de pago de una fase',
      description: 'Actualiza la fecha estimada y/o el estado de pago de una fase ya existente en un proyecto (ej. marcar que se confirmó el pago que desbloquea la Fase 2, o ajustar su fecha estimada). Solo actualiza los campos que se manden. Visible de inmediato en el portal del cliente.',
      inputSchema: {
        slug: z.string().describe('Slug o ID del proyecto'),
        numero: z.number().int().describe('Número de la fase a actualizar'),
        fechaEstimada: z.string().optional().describe('Nueva fecha estimada, YYYY-MM-DD'),
        requierePago: z.boolean().optional().describe('true si esta fase requiere confirmar un pago para arrancar'),
        pagoConfirmado: z.boolean().optional().describe('true si ese pago ya se confirmó (desbloquea la fase en el portal del cliente)'),
      },
    },
    async ({ slug, numero, fechaEstimada, requierePago, pagoConfirmado }) => {
      const p = await getProyecto(slug)
      if (!p) return fail(`No se encontró un proyecto con slug "${slug}".`)

      const fases = p.proyecto?.fases || []
      const idx = fases.findIndex((f) => f.numero === numero)
      if (idx === -1) return fail(`El proyecto "${slug}" no tiene una fase número ${numero}.`)

      const faseActualizada = { ...fases[idx] }
      if (fechaEstimada !== undefined) faseActualizada.fechaEstimada = fechaEstimada
      if (requierePago !== undefined) faseActualizada.requierePago = requierePago
      if (pagoConfirmado !== undefined) faseActualizada.pagoConfirmado = pagoConfirmado

      const fasesFinal = [...fases]
      fasesFinal[idx] = faseActualizada

      await prisma.proyecto.update({
        where: { id: p.id },
        data: { proyecto: { ...p.proyecto, fases: fasesFinal } },
      })
      await logEntry(p.id, USUARIO_MCP, 'Fase actualizada', `Fase ${numero} — ${faseActualizada.nombre}`)
      emitirCambio(p.id)

      return ok(`Fase ${numero} ("${faseActualizada.nombre}") actualizada.`)
    },
  )

  server.registerTool(
    'ver_proyecto',
    {
      title: 'Ver estado de un proyecto',
      description: 'Devuelve fase actual, % de avance, status, las tareas pendientes (del equipo y del cliente) y las respuestas recientes que el cliente ya envió desde su portal (texto y/o link de archivo — los archivos nunca se transfieren por MCP, solo el link para descargarlos).',
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
          .sort((a, b) => a.orden - b.orden)
          .map((t) => ({ id: t.id, fase: t.fase, titulo: t.titulo })),
        tareasPendientesCliente: p.tareas
          .filter((t) => t.esCliente && t.estado === 'pendiente')
          .sort((a, b) => a.orden - b.orden)
          .map((t) => ({ id: t.id, fase: t.fase, titulo: t.titulo, instrucciones: t.instruccionesCliente, plazoHoras: t.plazoHoras })),
        respuestasClienteRecientes: p.tareas
          .filter((t) => t.esCliente && t.estado === 'completada' && (t.respuestaTexto || t.respuestaArchivoUrl))
          .sort((a, b) => new Date(b.completadaEn) - new Date(a.completadaEn))
          .slice(0, 10)
          .map((t) => ({
            id: t.id,
            titulo: t.titulo,
            respuestaTexto: t.respuestaTexto || null,
            archivoUrl: t.respuestaArchivoUrl || null,
            archivoNombre: t.respuestaArchivoNombre || null,
            respondidoEn: t.completadaEn,
          })),
      }
      return ok(JSON.stringify(resumen, null, 2))
    },
  )

  server.registerTool(
    'registrar_actividad',
    {
      title: 'Registrar actividad',
      description: 'Agrega una actividad no contemplada en el checklist original. Por defecto queda marcada como completada de inmediato (para reportar avance ya hecho); si está en proceso, pasar completada=false. Si es del equipo (no esCliente), aparece en el portal del cliente dentro de "¿Qué está haciendo el equipo?". Importante para el orden: si esta actividad debe aparecer antes o después de otra ya existente (ver ver_proyecto), usa antesDeTareaId/despuesDeTareaId — si no se especifica ninguno, se agrega al final de la fase, lo cual puede quedar fuera de orden lógico (ej. después de una tarea de "revisión" cuando en realidad debía ir antes).',
      inputSchema: {
        slug: z.string().describe('Slug o ID del proyecto'),
        titulo: z.string().describe('Título breve de la actividad'),
        descripcion: z.string().optional().describe('Detalle interno de la actividad'),
        fase: z.number().int().optional().describe('Número de fase; si se omite, usa la fase actual del proyecto. Se ignora si se da antesDeTareaId/despuesDeTareaId.'),
        completada: z.boolean().optional().describe('Si es false, la actividad queda pendiente en vez de completada. Default: true'),
        antesDeTareaId: z.string().optional().describe('ID de otra tarea del proyecto antes de la cual debe quedar esta actividad'),
        despuesDeTareaId: z.string().optional().describe('ID de otra tarea del proyecto después de la cual debe quedar esta actividad'),
      },
    },
    async ({ slug, titulo, descripcion, fase, completada, antesDeTareaId, despuesDeTareaId }) => {
      const p = await getProyecto(slug)
      if (!p) return fail(`No se encontró un proyecto con slug "${slug}".`)

      const posicion = await resolverFaseYOrden(p, { fase, antesDeTareaId, despuesDeTareaId })
      if (posicion.error) return fail(posicion.error)
      const { faseFinal, orden } = posicion
      const marcarCompletada = completada !== false

      await prisma.tarea.create({
        data: {
          id: randomUUID(),
          proyectoId: p.id,
          fase: faseFinal,
          orden,
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
      emitirCambio(p.id)

      return ok(`Actividad "${titulo}" registrada en fase ${faseFinal}${marcarCompletada ? ' y marcada como completada' : ' (pendiente)'}.`)
    },
  )

  server.registerTool(
    'solicitar_al_cliente',
    {
      title: 'Solicitar algo al cliente',
      description: 'Crea una tarea pendiente para el cliente. Aparece de inmediato en su portal dentro de "Necesitamos tu respuesta". Si el orden importa (ej. debe pedirse antes de otra tarea del checklist), usa antesDeTareaId/despuesDeTareaId.',
      inputSchema: {
        slug: z.string().describe('Slug o ID del proyecto'),
        titulo: z.string().describe('Título breve de lo que se necesita'),
        instrucciones: z.string().describe('Instrucciones claras para el cliente sobre qué debe hacer'),
        plazoHoras: z.number().int().optional().describe('Plazo sugerido en horas'),
        fase: z.number().int().optional().describe('Número de fase; si se omite, usa la fase actual del proyecto. Se ignora si se da antesDeTareaId/despuesDeTareaId.'),
        antesDeTareaId: z.string().optional().describe('ID de otra tarea del proyecto antes de la cual debe quedar esta solicitud'),
        despuesDeTareaId: z.string().optional().describe('ID de otra tarea del proyecto después de la cual debe quedar esta solicitud'),
      },
    },
    async ({ slug, titulo, instrucciones, plazoHoras, fase, antesDeTareaId, despuesDeTareaId }) => {
      const p = await getProyecto(slug)
      if (!p) return fail(`No se encontró un proyecto con slug "${slug}".`)

      const posicion = await resolverFaseYOrden(p, { fase, antesDeTareaId, despuesDeTareaId })
      if (posicion.error) return fail(posicion.error)
      const { faseFinal, orden } = posicion

      await prisma.tarea.create({
        data: {
          id: randomUUID(),
          proyectoId: p.id,
          fase: faseFinal,
          orden,
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
      emitirCambio(p.id)

      return ok(`Se creó la solicitud "${titulo}" para el cliente en fase ${faseFinal}.`)
    },
  )

  server.registerTool(
    'iniciar_actividad',
    {
      title: 'Marcar actividad en proceso',
      description: 'Marca una tarea del checklist del equipo como "en proceso" — es decir, que alguien está trabajando en ella activamente ahora mismo, no solo que está disponible. Úsala cuando de verdad empieces a trabajar en algo, no para todo lo que esté disponible en paralelo: el objetivo es que el cliente y el equipo vean qué se está haciendo de verdad, no una lista de todo lo que técnicamente se podría hacer.',
      inputSchema: {
        slug: z.string().describe('Slug o ID del proyecto'),
        tareaId: z.string().describe('ID de la tarea a marcar en proceso'),
      },
    },
    async ({ slug, tareaId }) => {
      const p = await getProyecto(slug)
      if (!p) return fail(`No se encontró un proyecto con slug "${slug}".`)

      const tarea = p.tareas.find((t) => t.id === tareaId)
      if (!tarea) return fail(`No se encontró la tarea "${tareaId}" en el proyecto "${slug}".`)

      await prisma.tarea.update({
        where: { id: tareaId },
        data: { estado: 'en_proceso', asignadoA: USUARIO_MCP },
      })
      await logEntry(p.id, USUARIO_MCP, 'Tarea en proceso', tarea.titulo)
      emitirCambio(p.id)

      return ok(`"${tarea.titulo}" marcada en proceso.`)
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
      emitirCambio(p.id)

      return ok(`Tarea "${tarea.titulo}" marcada como completada.${respuesta ? ' Respuesta registrada en el log.' : ''}`)
    },
  )

  server.registerTool(
    'editar_actividad',
    {
      title: 'Editar actividad o solicitud',
      description: 'Corrige el título, descripción, instrucciones, plazo o posición de una tarea ya creada (del equipo o del cliente). Solo actualiza los campos que se manden. Para reordenarla (ej. corregir una actividad que quedó después de "revisión" cuando debía ir antes), pasa antesDeTareaId o despuesDeTareaId — mueve la tarea a esa posición, incluso a otra fase si la tarea de referencia está en otra fase.',
      inputSchema: {
        slug: z.string().describe('Slug o ID del proyecto'),
        tareaId: z.string().describe('ID de la tarea a editar'),
        titulo: z.string().optional().describe('Nuevo título'),
        descripcion: z.string().optional().describe('Nueva descripción interna'),
        instrucciones: z.string().optional().describe('Nuevas instrucciones para el cliente (solo aplica a solicitudes al cliente)'),
        plazoHoras: z.number().int().optional().describe('Nuevo plazo en horas'),
        antesDeTareaId: z.string().optional().describe('Reposicionar esta tarea justo antes de otra (por ID)'),
        despuesDeTareaId: z.string().optional().describe('Reposicionar esta tarea justo después de otra (por ID)'),
      },
    },
    async ({ slug, tareaId, titulo, descripcion, instrucciones, plazoHoras, antesDeTareaId, despuesDeTareaId }) => {
      const p = await getProyecto(slug)
      if (!p) return fail(`No se encontró un proyecto con slug "${slug}".`)

      const tarea = p.tareas.find((t) => t.id === tareaId)
      if (!tarea) return fail(`No se encontró la tarea "${tareaId}" en el proyecto "${slug}".`)

      const data = {}
      if (titulo !== undefined) data.titulo = titulo
      if (descripcion !== undefined) data.descripcion = descripcion
      if (instrucciones !== undefined) data.instruccionesCliente = instrucciones
      if (plazoHoras !== undefined) data.plazoHoras = plazoHoras

      if (antesDeTareaId || despuesDeTareaId) {
        const posicion = await resolverFaseYOrden(p, { antesDeTareaId, despuesDeTareaId }, tareaId)
        if (posicion.error) return fail(posicion.error)
        data.fase = posicion.faseFinal
        data.orden = posicion.orden
      }

      if (!Object.keys(data).length) return fail('No se especificó ningún campo para editar.')

      await prisma.tarea.update({ where: { id: tareaId }, data })
      await logEntry(p.id, USUARIO_MCP, 'Tarea editada', tarea.titulo)
      emitirCambio(p.id)

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
      emitirCambio(p.id)

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
      emitirCambio(p.id)

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
