import { Router } from 'express'
import { randomUUID } from 'crypto'
import { z } from 'zod'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import prisma from '../lib/prisma.js'
import { requireMcpAuth } from '../middleware/auth.js'
import { tareaLeCorresponde } from '../lib/permisos.js'
import { calcularAvance, getFaseActual, contarPendientesCliente, tieneRespuestaNueva } from '../lib/avance.js'
import { contarPorColumna, estadoDeColumna } from '../lib/kanban.js'
import { generarSlug } from '../lib/slug.js'
import { ordenAlFinal, ordenAntesDe, ordenDespuesDe } from '../lib/orden.js'
import { emitirCambio } from '../lib/eventos.js'
import { obtenerOCrearCarpetaProyecto, driveConfigurado } from '../lib/drive.js'

const router = Router()

const PORTAL_CLIENTE_BASE_URL = 'https://proyectosweb.esbrillante.mx/cliente'

function urlPortalCliente(slug) {
  return `${PORTAL_CLIENTE_BASE_URL}/${slug}`
}

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

// Valida que los IDs de dependencias existan en el proyecto y no se autorreferencien.
// tareaId se pasa al editar una tarea existente, para que no pueda depender de sí misma.
function validarDependencias(p, dependeDeTareaIds, tareaId = null) {
  if (!dependeDeTareaIds || dependeDeTareaIds.length === 0) return null
  if (tareaId && dependeDeTareaIds.includes(tareaId)) {
    return 'Una tarea no puede depender de sí misma.'
  }
  const idsProyecto = new Set(p.tareas.map((t) => t.id))
  const invalidos = dependeDeTareaIds.filter((id) => !idsProyecto.has(id))
  if (invalidos.length > 0) {
    return `No se encontraron estas tareas en el proyecto "${p.slug}": ${invalidos.join(', ')}.`
  }
  return null
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

// Equivalente a resolverFaseYOrden pero para proyectos "continuo": el
// agrupador no es `fase` (siempre 1, sin significado) sino `estado`, que es
// lo que define la columna del tablero Kanban (ver server/src/lib/kanban.js).
async function resolverColumnaYOrden(p, { columna, antesDeTareaId, despuesDeTareaId }, excluirId = null) {
  const refId = antesDeTareaId || despuesDeTareaId
  if (refId) {
    if (refId === excluirId) return { error: 'Una tarjeta no puede posicionarse antes/después de sí misma.' }
    const refOriginal = p.tareas.find((t) => t.id === refId)
    if (!refOriginal) return { error: `No se encontró la tarjeta de referencia "${refId}".` }

    const tareasColumna = p.tareas.filter((t) => t.estado === refOriginal.estado && t.id !== excluirId).sort((a, b) => a.orden - b.orden)
    const ref = tareasColumna.find((t) => t.id === refId)
    const orden = antesDeTareaId ? ordenAntesDe(tareasColumna, ref) : ordenDespuesDe(tareasColumna, ref)
    return { estadoFinal: refOriginal.estado, orden }
  }
  const estadoFinal = estadoDeColumna(columna) || 'pendiente'
  const tareasColumna = p.tareas.filter((t) => t.estado === estadoFinal && t.id !== excluirId)
  return { estadoFinal, orden: ordenAlFinal(tareasColumna) }
}

function buildServer(usuario) {
  const server = new McpServer({ name: 'esbrillante-seguimiento', version: '1.0.0' })

  server.registerTool(
    'listar_proyectos',
    {
      title: 'Listar proyectos',
      description: 'Lista los proyectos activos (excluye los que aún no confirman anticipo) con su slug, cliente, paquete, status, tipo, cuántas tareas tiene pendientes el cliente y si respondió algo que el admin todavía no ha visto — útil para priorizar en qué proyecto hace falta dar seguimiento. Proyectos "finito" incluyen % de avance; proyectos "continuo" incluyen en su lugar el conteo de tarjetas por columna del tablero Kanban (columnas).',
      inputSchema: {},
    },
    async () => {
      const proyectos = await prisma.proyecto.findMany({
        where: { status: { not: 'pendiente_anticipo' } },
        include: { tareas: true, log: { orderBy: { fecha: 'desc' }, take: 20 } },
        orderBy: { creadoEn: 'desc' },
      })
      const resumen = proyectos.map((p) => ({
        slug: p.slug,
        cliente: p.cliente?.nombreComercial || '(sin nombre)',
        paquete: p.proyecto?.paquete || '(sin paquete)',
        status: p.status,
        tipo: p.tipo,
        ...(p.tipo === 'continuo' ? { columnas: contarPorColumna(p) } : { avance: calcularAvance(p) }),
        pendientesCliente: contarPendientesCliente(p),
        respuestaNuevaSinRevisar: tieneRespuestaNueva(p),
      }))
      return ok(JSON.stringify(resumen, null, 2))
    },
  )

  server.registerTool(
    'crear_proyecto',
    {
      title: 'Crear proyecto',
      description: 'Da de alta un proyecto nuevo en el Sistema de Seguimiento para poder empezar a reportarle avance. No confirma pagos ni cierra proyectos: anticipoConfirmado es solo informativo (si es false, el proyecto queda en status "pendiente_anticipo" hasta que se confirme desde el panel admin). La respuesta incluye el slug, la contraseña del portal del cliente y urlPortalCliente (la URL completa y lista para compartir, ej. "https://proyectosweb.esbrillante.mx/cliente/{slug}") — no hace falta construirla manualmente. Soporta dos tipos de proyecto (parámetro tipo): "finito" (default, con fases y fecha de entrega) o "continuo" (servicio recurrente sin fecha de cierre, gestionado con un tablero Kanban de columnas Todo/Doing/Revisión/Done — en ese caso se ignoran fases y fechaEstimadaEntrega; usa registrar_actividad/solicitar_al_cliente con el parámetro columna, y mover_a_revision, para trabajar sobre el tablero).',
      inputSchema: {
        clienteNombre: z.string().describe('Nombre comercial del cliente'),
        contactoNombre: z.string().optional().describe('Nombre del contacto principal del cliente'),
        correo: z.string().optional().describe('Correo del contacto principal'),
        paquete: z.string().optional().describe('Nombre del paquete/tipo de proyecto. Default: "Personalizado"'),
        tipo: z.enum(['finito', 'continuo']).optional().describe('Tipo de proyecto. "finito" (default): tiene fases y converge a una entrega. "continuo": servicio recurrente sin fecha de cierre, se gestiona con un tablero Kanban (Todo/Doing/Revisión/Done) en vez de fases — en este modo se ignoran fases y fechaEstimadaEntrega.'),
        fases: z.array(z.object({
          numero: z.number().int(),
          nombre: z.string(),
          fechaEstimada: z.string().optional().describe('Fecha estimada de esa fase, YYYY-MM-DD'),
          requierePago: z.boolean().optional().describe('true si esta fase no arranca hasta confirmar un pago adicional (ej. Parte A de Fase 2)'),
          pagoConfirmado: z.boolean().optional().describe('true si ese pago ya se confirmó'),
        })).optional()
          .describe('Fases del proyecto en orden, ej. [{"numero":1,"nombre":"Fase 1 — Auth","fechaEstimada":"2026-08-15"}]. Si se omite, usa un default genérico de 3 fases (Planeación/Desarrollo/Entrega). Solo aplica a tipo "finito"; se ignora en proyectos "continuo".'),
        fechaInicio: z.string().optional().describe('Fecha de inicio en formato YYYY-MM-DD. Default: hoy'),
        fechaEstimadaEntrega: z.string().optional().describe('Fecha estimada de entrega en formato YYYY-MM-DD. Solo aplica a tipo "finito".'),
        anticipoConfirmado: z.boolean().describe('true SOLO si consta que el anticipo/pago inicial ya fue confirmado y recibido. Si no estás seguro, usa false.'),
        passwordCliente: z.string().optional().describe('Contraseña de acceso al portal del cliente. Si se omite, se genera una automáticamente.'),
      },
    },
    async ({ clienteNombre, contactoNombre, correo, paquete, tipo, fases, fechaInicio, fechaEstimadaEntrega, anticipoConfirmado, passwordCliente }) => {
      const slug = generarSlug(clienteNombre)
      const tipoFinal = tipo === 'continuo' ? 'continuo' : 'finito'
      const fasesFinal = tipoFinal === 'continuo' ? [] : (fases?.length ? fases : [
        { numero: 1, nombre: 'Planeación' },
        { numero: 2, nombre: 'Desarrollo' },
        { numero: 3, nombre: 'Entrega' },
      ])
      const password = passwordCliente || randomUUID().slice(0, 8)
      const paqueteFinal = paquete || 'Personalizado'

      const p = await prisma.proyecto.create({
        data: {
          slug,
          tipo: tipoFinal,
          status: anticipoConfirmado ? 'activo' : 'pendiente_anticipo',
          cliente: { nombreComercial: clienteNombre, contactoNombre: contactoNombre || '', correo: correo || '', whatsapp: '', participantes: [] },
          proyecto: {
            paquete: paqueteFinal,
            fases: fasesFinal,
            extras: [],
            fechaInicio: fechaInicio || new Date().toISOString().slice(0, 10),
            fechaEstimadaEntrega: tipoFinal === 'continuo' ? null : (fechaEstimadaEntrega || null),
            anticipoConfirmado,
          },
          condicionesTecnicas: {},
          equipo: {},
          passwordCliente: password,
          linksCliente: { drive: '', brief: '', boceto: '', diseno: '' },
          tiempos: { inicio: anticipoConfirmado ? new Date().toISOString() : null, cierre: null, pausas: [] },
        },
      })
      await logEntry(p.id, usuario.nombre, 'Proyecto creado', `Paquete: ${paqueteFinal}`)
      emitirCambio(p.id)

      const avisoAnticipo = anticipoConfirmado ? '' : ' Status: "pendiente_anticipo" — confirma el anticipo desde el panel admin cuando corresponda.'
      return ok(`Proyecto "${clienteNombre}" creado (tipo: ${tipoFinal}). slug: "${p.slug}". Contraseña del portal del cliente: "${password}". urlPortalCliente: "${urlPortalCliente(p.slug)}".${avisoAnticipo}`)
    },
  )

  server.registerTool(
    'cambiar_tipo_proyecto',
    {
      title: 'Cambiar tipo de proyecto',
      description: 'Convierte un proyecto ya existente entre "finito" (fases) y "continuo" (tablero Kanban Todo/Doing/Revisión/Done) — útil cuando un proyecto se dio de alta con el tipo equivocado. Al pasar a "continuo" las tareas conservan su estado actual (que es justo lo que define su columna en el tablero: pendiente→Todo, en_proceso→Doing, completada→Done) y solo se resetea su fase. Al volver a "finito" todas las tareas quedan en Fase 1 (hay que reorganizarlas a mano con editar_actividad) y cualquier tarjeta en Revisión pasa a "en proceso". No pierde tareas ni las borra.',
      inputSchema: {
        slug: z.string().describe('Slug o ID del proyecto'),
        tipo: z.enum(['finito', 'continuo']).describe('Nuevo tipo del proyecto'),
      },
    },
    async ({ slug, tipo }) => {
      const p = await getProyecto(slug)
      if (!p) return fail(`No se encontró un proyecto con slug "${slug}".`)
      if (p.tipo === tipo) return ok(`El proyecto "${slug}" ya es de tipo "${tipo}".`)

      if (tipo === 'continuo') {
        await prisma.proyecto.update({ where: { id: p.id }, data: { tipo, proyecto: { ...p.proyecto, fases: [] } } })
        await prisma.tarea.updateMany({ where: { proyectoId: p.id }, data: { fase: 1 } })
      } else {
        const fasesFinal = p.proyecto?.fases?.length ? p.proyecto.fases : [
          { numero: 1, nombre: 'Planeación' },
          { numero: 2, nombre: 'Desarrollo' },
          { numero: 3, nombre: 'Entrega' },
        ]
        await prisma.proyecto.update({ where: { id: p.id }, data: { tipo, proyecto: { ...p.proyecto, fases: fasesFinal } } })
        await prisma.tarea.updateMany({ where: { proyectoId: p.id }, data: { fase: 1 } })
        await prisma.tarea.updateMany({ where: { proyectoId: p.id, estado: 'revision' }, data: { estado: 'en_proceso' } })
      }

      await logEntry(p.id, usuario.nombre, 'Tipo de proyecto cambiado', `${p.tipo} → ${tipo}`)
      emitirCambio(p.id)

      return ok(`Proyecto "${slug}" convertido a tipo "${tipo}".`)
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
      if (p.tipo === 'continuo') return fail(`El proyecto "${slug}" es de tipo continuo y no usa fases. Usa registrar_actividad/solicitar_al_cliente con columna, o mover_a_revision, para trabajar sobre su tablero Kanban.`)

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
      await logEntry(p.id, usuario.nombre, 'Fase actualizada', `Fase ${numero} — ${faseActualizada.nombre}`)
      emitirCambio(p.id)

      return ok(`Fase ${numero} ("${faseActualizada.nombre}") actualizada.`)
    },
  )

  server.registerTool(
    'ver_proyecto',
    {
      title: 'Ver estado de un proyecto',
      description: 'Devuelve status, las tareas pendientes (del equipo y del cliente) y las respuestas recientes que el cliente ya envió desde su portal (texto y/o link de archivo — los archivos nunca se transfieren por MCP, solo el link para descargarlos). También incluye el slug y urlPortalCliente (la URL completa del portal del cliente, ej. "https://proyectosweb.esbrillante.mx/cliente/{slug}") — no hace falta construirla manualmente. En proyectos "finito" incluye fase actual y % de avance; en proyectos "continuo" incluye en su lugar "columnas" con el tablero Kanban (tarjetas agrupadas en todo/doing/revision/done).',
      inputSchema: { slug: z.string().describe('Slug o ID del proyecto') },
    },
    async ({ slug }) => {
      const p = await getProyecto(slug)
      if (!p) return fail(`No se encontró un proyecto con slug "${slug}".`)

      const resumen = {
        slug: p.slug,
        urlPortalCliente: urlPortalCliente(p.slug),
        tipo: p.tipo,
        cliente: p.cliente?.nombreComercial || '(sin nombre)',
        paquete: p.proyecto?.paquete || '(sin paquete)',
        status: p.status,
      }

      if (p.tipo === 'continuo') {
        resumen.columnas = Object.fromEntries(
          Object.entries(contarPorColumna(p)).map(([columna, total]) => [columna, total]),
        )
        resumen.tarjetas = p.tareas
          .filter((t) => !t.esCliente && t.estado !== 'omitida')
          .sort((a, b) => a.orden - b.orden)
          .map((t) => ({ id: t.id, estado: t.estado, titulo: t.titulo }))
      } else {
        const fase = getFaseActual(p)
        const fases = p.proyecto?.fases || []
        resumen.avance = calcularAvance(p)
        resumen.faseActual = fase
        resumen.faseNombre = fases.find((f) => f.numero === fase)?.nombre || ''
      }

      resumen.tareasPendientesEquipo = p.tareas
        .filter((t) => !t.esCliente && t.estado === 'pendiente')
        .sort((a, b) => a.orden - b.orden)
        .map((t) => ({ id: t.id, fase: t.fase, titulo: t.titulo }))
      resumen.tareasPendientesCliente = p.tareas
        .filter((t) => t.esCliente && t.estado === 'pendiente')
        .sort((a, b) => a.orden - b.orden)
        .map((t) => ({ id: t.id, fase: t.fase, titulo: t.titulo, instrucciones: t.instruccionesCliente, plazoHoras: t.plazoHoras }))
      resumen.respuestasClienteRecientes = p.tareas
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
        }))

      return ok(JSON.stringify(resumen, null, 2))
    },
  )

  server.registerTool(
    'registrar_actividad',
    {
      title: 'Registrar actividad',
      description: 'Agrega una actividad no contemplada en el checklist original. En proyectos "finito": por defecto queda marcada como completada de inmediato (para reportar avance ya hecho); si está en proceso, pasar completada=false. En proyectos "continuo" (tablero Kanban) usa el parámetro columna en vez de fase/completada para elegir en qué columna aparece (default "todo"). Si es del equipo (no esCliente), aparece en el portal del cliente dentro de "¿Qué está haciendo el equipo?" (o en el tablero, si es continuo). Importante para el orden: si esta actividad debe aparecer antes o después de otra ya existente (ver ver_proyecto), usa antesDeTareaId/despuesDeTareaId — si no se especifica ninguno, se agrega al final de la fase o columna, lo cual puede quedar fuera de orden lógico.',
      inputSchema: {
        slug: z.string().describe('Slug o ID del proyecto'),
        titulo: z.string().describe('Título breve de la actividad'),
        descripcion: z.string().optional().describe('Detalle interno de la actividad'),
        fase: z.number().int().optional().describe('Número de fase; si se omite, usa la fase actual del proyecto. Se ignora si se da antesDeTareaId/despuesDeTareaId, o si el proyecto es de tipo "continuo" (usa columna en su lugar).'),
        completada: z.boolean().optional().describe('Si es false, la actividad queda pendiente en vez de completada. Default: true. Se ignora en proyectos "continuo" (usa columna en su lugar).'),
        columna: z.enum(['todo', 'doing', 'revision', 'done']).optional().describe('Solo para proyectos tipo "continuo": columna del tablero Kanban donde debe caer la tarjeta. Default: "todo". Se ignora si se da antesDeTareaId/despuesDeTareaId (se usa la columna de esa tarjeta de referencia).'),
        antesDeTareaId: z.string().optional().describe('ID de otra tarea del proyecto antes de la cual debe quedar esta actividad'),
        despuesDeTareaId: z.string().optional().describe('ID de otra tarea del proyecto después de la cual debe quedar esta actividad'),
        dependeDeTareaIds: z.array(z.string()).optional().describe('IDs de tareas de este mismo proyecto que deben quedar completadas antes de que esta actividad se considere disponible.'),
      },
    },
    async ({ slug, titulo, descripcion, fase, completada, columna, antesDeTareaId, despuesDeTareaId, dependeDeTareaIds }) => {
      const p = await getProyecto(slug)
      if (!p) return fail(`No se encontró un proyecto con slug "${slug}".`)

      const errorDeps = validarDependencias(p, dependeDeTareaIds)
      if (errorDeps) return fail(errorDeps)

      const esContinuo = p.tipo === 'continuo'
      const posicion = esContinuo
        ? await resolverColumnaYOrden(p, { columna, antesDeTareaId, despuesDeTareaId })
        : await resolverFaseYOrden(p, { fase, antesDeTareaId, despuesDeTareaId })
      if (posicion.error) return fail(posicion.error)

      const marcarCompletada = esContinuo ? posicion.estadoFinal === 'completada' : completada !== false
      const estadoFinal = esContinuo ? posicion.estadoFinal : (marcarCompletada ? 'completada' : 'pendiente')

      await prisma.tarea.create({
        data: {
          id: randomUUID(),
          proyectoId: p.id,
          fase: esContinuo ? 1 : posicion.faseFinal,
          orden: posicion.orden,
          titulo,
          descripcion: descripcion || '',
          responsable: 'equipo',
          dependencias: dependeDeTareaIds || [],
          custom: true,
          estado: estadoFinal,
          completadaPor: marcarCompletada ? usuario.nombre : null,
          completadaEn: marcarCompletada ? new Date() : null,
        },
      })
      await logEntry(p.id, usuario.nombre, marcarCompletada ? 'Tarea agregada y completada' : 'Tarea agregada', titulo)
      emitirCambio(p.id)

      const ubicacion = esContinuo ? `columna "${posicion.estadoFinal}"` : `fase ${posicion.faseFinal}`
      return ok(`Actividad "${titulo}" registrada en ${ubicacion}${esContinuo ? '' : (marcarCompletada ? ' y marcada como completada' : ' (pendiente)')}.`)
    },
  )

  server.registerTool(
    'solicitar_al_cliente',
    {
      title: 'Solicitar algo al cliente',
      description: 'Crea una tarea pendiente para el cliente. Por defecto aparece de inmediato en su portal dentro de "Necesitamos tu respuesta" (esto no cambia entre proyectos "finito" y "continuo" — las tareas del cliente no viven en el tablero Kanban). Si el orden importa (ej. debe pedirse antes de otra tarea del checklist), usa antesDeTareaId/despuesDeTareaId. Si la solicitud no debe estar disponible para el cliente hasta que el equipo termine algo primero (ej. "revisa este prototipo" solo tiene sentido una vez diseñado), usa dependeDeTareaIds — la tarea queda oculta para el cliente hasta que esas tareas se marquen completadas. Si la solicitud implica que el cliente suba archivo(s) (fotos, logo, documentos, materiales), usa pedirArchivos: true para que se genere automáticamente el link de la carpeta de Drive del proyecto y aparezca directo en su tarjeta.',
      inputSchema: {
        slug: z.string().describe('Slug o ID del proyecto'),
        titulo: z.string().describe('Título breve de lo que se necesita'),
        instrucciones: z.string().describe('Instrucciones claras para el cliente sobre qué debe hacer'),
        plazoHoras: z.number().int().optional().describe('Plazo sugerido en horas'),
        fase: z.number().int().optional().describe('Número de fase; si se omite, usa la fase actual del proyecto. Se ignora si se da antesDeTareaId/despuesDeTareaId, o si el proyecto es de tipo "continuo".'),
        antesDeTareaId: z.string().optional().describe('ID de otra tarea del proyecto antes de la cual debe quedar esta solicitud'),
        despuesDeTareaId: z.string().optional().describe('ID de otra tarea del proyecto después de la cual debe quedar esta solicitud'),
        dependeDeTareaIds: z.array(z.string()).optional().describe('IDs de tareas de este mismo proyecto (típicamente del equipo) que deben quedar completadas antes de que esta solicitud aparezca disponible para el cliente.'),
        pedirArchivos: z.boolean().optional().describe('True si se le va a pedir al cliente subir archivo(s) (fotos, logo, documentos, materiales). Crea o reutiliza la carpeta de Drive del proyecto y adjunta el link directo en la tarjeta de la solicitud.'),
      },
    },
    async ({ slug, titulo, instrucciones, plazoHoras, fase, antesDeTareaId, despuesDeTareaId, dependeDeTareaIds, pedirArchivos }) => {
      const p = await getProyecto(slug)
      if (!p) return fail(`No se encontró un proyecto con slug "${slug}".`)

      const errorDeps = validarDependencias(p, dependeDeTareaIds)
      if (errorDeps) return fail(errorDeps)

      const esContinuo = p.tipo === 'continuo'
      const posicion = esContinuo
        ? await resolverColumnaYOrden(p, { columna: 'todo', antesDeTareaId, despuesDeTareaId })
        : await resolverFaseYOrden(p, { fase, antesDeTareaId, despuesDeTareaId })
      if (posicion.error) return fail(posicion.error)

      let driveFolderUrl = null
      let avisoDrive = ''
      if (pedirArchivos) {
        if (driveConfigurado()) {
          const carpetaId = await obtenerOCrearCarpetaProyecto(p)
          if (!p.driveRespuestasId) await prisma.proyecto.update({ where: { id: p.id }, data: { driveRespuestasId: carpetaId } })
          driveFolderUrl = `https://drive.google.com/drive/folders/${carpetaId}`
        } else {
          avisoDrive = ' (Drive no está configurado en el servidor — la solicitud se creó sin el link de la carpeta.)'
        }
      }

      await prisma.tarea.create({
        data: {
          id: randomUUID(),
          proyectoId: p.id,
          fase: esContinuo ? 1 : posicion.faseFinal,
          orden: posicion.orden,
          titulo,
          responsable: 'cliente',
          esCliente: true,
          instruccionesCliente: instrucciones,
          plazoHoras: plazoHoras ?? null,
          dependencias: dependeDeTareaIds || [],
          custom: true,
          estado: 'pendiente',
          driveFolderUrl,
        },
      })
      await logEntry(p.id, usuario.nombre, 'Solicitud al cliente creada', titulo)
      emitirCambio(p.id)

      const nota = dependeDeTareaIds?.length ? ' (queda oculta para el cliente hasta completar sus dependencias)' : ''
      return ok(`Se creó la solicitud "${titulo}" para el cliente${esContinuo ? '' : ` en fase ${posicion.faseFinal}`}${nota}.${avisoDrive}`)
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
      if (!tareaLeCorresponde(tarea, p.equipo, usuario)) {
        return fail(`"${tarea.titulo}" no te corresponde en este proyecto — no estás asignado a él o a ese rol.`)
      }

      await prisma.tarea.update({
        where: { id: tareaId },
        data: { estado: 'en_proceso', asignadoA: usuario.nombre },
      })
      await logEntry(p.id, usuario.nombre, 'Tarea en proceso', tarea.titulo)
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
      // Cerrar una solicitud al cliente (ej. respondió por WhatsApp) es un
      // relay, no una tarea de especialidad — cualquiera del equipo puede
      // hacerlo, no solo quien tenga el rol asignado en proyecto.equipo.
      if (!tarea.esCliente && !tareaLeCorresponde(tarea, p.equipo, usuario)) {
        return fail(`"${tarea.titulo}" no te corresponde en este proyecto — no estás asignado a él o a ese rol.`)
      }

      await prisma.tarea.update({
        where: { id: tareaId },
        data: { estado: 'completada', completadaPor: usuario.nombre, completadaEn: new Date() },
      })
      await logEntry(p.id, usuario.nombre, 'Tarea completada', respuesta ? `${tarea.titulo} — Respuesta: ${respuesta}` : tarea.titulo)
      emitirCambio(p.id)

      return ok(`Tarea "${tarea.titulo}" marcada como completada.${respuesta ? ' Respuesta registrada en el log.' : ''}`)
    },
  )

  server.registerTool(
    'mover_a_revision',
    {
      title: 'Mover tarjeta a Revisión',
      description: 'Solo para proyectos de tipo "continuo": mueve una tarjeta del tablero Kanban a la columna "Revisión" (ej. cuando el trabajo ya está hecho pero falta que alguien lo revise antes de darlo por Done). Para las demás transiciones usa iniciar_actividad (→ Doing), completar_actividad (→ Done) o cancelar_actividad (→ archivada).',
      inputSchema: {
        slug: z.string().describe('Slug o ID del proyecto'),
        tareaId: z.string().describe('ID de la tarjeta a mover a Revisión'),
      },
    },
    async ({ slug, tareaId }) => {
      const p = await getProyecto(slug)
      if (!p) return fail(`No se encontró un proyecto con slug "${slug}".`)
      if (p.tipo !== 'continuo') return fail(`El proyecto "${slug}" no es de tipo continuo — no tiene columna de Revisión.`)

      const tarea = p.tareas.find((t) => t.id === tareaId)
      if (!tarea) return fail(`No se encontró la tarjeta "${tareaId}" en el proyecto "${slug}".`)
      if (!tareaLeCorresponde(tarea, p.equipo, usuario)) {
        return fail(`"${tarea.titulo}" no te corresponde en este proyecto — no estás asignado a él o a ese rol.`)
      }

      await prisma.tarea.update({
        where: { id: tareaId },
        data: { estado: 'revision', completadaPor: null, completadaEn: null },
      })
      await logEntry(p.id, usuario.nombre, 'Tarjeta movida', `${tarea.titulo} → Revisión`)
      emitirCambio(p.id)

      return ok(`"${tarea.titulo}" movida a Revisión.`)
    },
  )

  server.registerTool(
    'editar_actividad',
    {
      title: 'Editar actividad o solicitud',
      description: 'Corrige el título, descripción, instrucciones, plazo, dependencias o posición de una tarea ya creada (del equipo o del cliente). Solo actualiza los campos que se manden. Para reordenarla, pasa antesDeTareaId o despuesDeTareaId — mueve la tarea a esa posición. En proyectos "finito" puede cambiar de fase si la tarea de referencia está en otra fase. En proyectos "continuo" puede cambiar de columna del tablero Kanban si la tarea de referencia está en otra columna (equivalente a arrastrarla).',
      inputSchema: {
        slug: z.string().describe('Slug o ID del proyecto'),
        tareaId: z.string().describe('ID de la tarea a editar'),
        titulo: z.string().optional().describe('Nuevo título'),
        descripcion: z.string().optional().describe('Nueva descripción interna'),
        instrucciones: z.string().optional().describe('Nuevas instrucciones para el cliente (solo aplica a solicitudes al cliente)'),
        plazoHoras: z.number().int().optional().describe('Nuevo plazo en horas'),
        antesDeTareaId: z.string().optional().describe('Reposicionar esta tarea justo antes de otra (por ID)'),
        despuesDeTareaId: z.string().optional().describe('Reposicionar esta tarea justo después de otra (por ID)'),
        dependeDeTareaIds: z.array(z.string()).optional().describe('Reemplaza la lista de tareas de las que depende esta actividad — mientras no estén todas completadas, esta tarea queda oculta/bloqueada para quien deba trabajarla (si es del cliente, no aparece en su portal). Pasa un array vacío para quitar todas las dependencias.'),
      },
    },
    async ({ slug, tareaId, titulo, descripcion, instrucciones, plazoHoras, antesDeTareaId, despuesDeTareaId, dependeDeTareaIds }) => {
      const p = await getProyecto(slug)
      if (!p) return fail(`No se encontró un proyecto con slug "${slug}".`)

      const tarea = p.tareas.find((t) => t.id === tareaId)
      if (!tarea) return fail(`No se encontró la tarea "${tareaId}" en el proyecto "${slug}".`)

      const errorDeps = validarDependencias(p, dependeDeTareaIds, tareaId)
      if (errorDeps) return fail(errorDeps)

      const data = {}
      if (titulo !== undefined) data.titulo = titulo
      if (descripcion !== undefined) data.descripcion = descripcion
      if (instrucciones !== undefined) data.instruccionesCliente = instrucciones
      if (plazoHoras !== undefined) data.plazoHoras = plazoHoras
      if (dependeDeTareaIds !== undefined) data.dependencias = dependeDeTareaIds

      if (antesDeTareaId || despuesDeTareaId) {
        const posicion = p.tipo === 'continuo'
          ? await resolverColumnaYOrden(p, { antesDeTareaId, despuesDeTareaId }, tareaId)
          : await resolverFaseYOrden(p, { antesDeTareaId, despuesDeTareaId }, tareaId)
        if (posicion.error) return fail(posicion.error)
        if (p.tipo === 'continuo') {
          data.estado = posicion.estadoFinal
          if (posicion.estadoFinal === 'completada' && tarea.estado !== 'completada') {
            data.completadaPor = usuario.nombre
            data.completadaEn = new Date()
          } else if (posicion.estadoFinal !== 'completada' && tarea.estado === 'completada') {
            data.completadaPor = null
            data.completadaEn = null
          }
        } else {
          data.fase = posicion.faseFinal
        }
        data.orden = posicion.orden
      }

      if (!Object.keys(data).length) return fail('No se especificó ningún campo para editar.')

      await prisma.tarea.update({ where: { id: tareaId }, data })
      await logEntry(p.id, usuario.nombre, 'Tarea editada', tarea.titulo)
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
      await logEntry(p.id, usuario.nombre, 'Tarea cancelada', motivo ? `${tarea.titulo} — ${motivo}` : tarea.titulo)
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

      await logEntry(p.id, usuario.nombre, 'Nota', mensaje)
      emitirCambio(p.id)

      return ok('Nota interna registrada.')
    },
  )

  return server
}

// POST /mcp
router.post('/', requireMcpAuth, async (req, res) => {
  try {
    const server = buildServer(req.user)
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
