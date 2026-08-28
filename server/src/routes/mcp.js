import { Router } from 'express'
import { randomUUID } from 'crypto'
import { z } from 'zod'
import { generarPasswordSimple } from '../lib/passwords.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import prisma from '../lib/prisma.js'
import { requireMcpAuth } from '../middleware/auth.js'
import { tareaLeCorresponde, validarYNormalizarEquipo } from '../lib/permisos.js'
import { materializarTareasDesdePlantilla } from '../lib/plantillaHelpers.js'
import { calcularAvance, getFaseActual, contarPendientesCliente, tieneRespuestaNueva } from '../lib/avance.js'
import { contarPorColumna, estadoDeColumna } from '../lib/kanban.js'
import { generarSlug } from '../lib/slug.js'
import { ordenAlFinal, ordenAntesDe, ordenDespuesDe } from '../lib/orden.js'
import { emitirCambio } from '../lib/eventos.js'
import { obtenerOCrearCarpetaProyecto, driveConfigurado } from '../lib/drive.js'
import { listarPrototipos as listarPrototiposPages, listarAnotacionesPrototipo, resolverAnotacionPrototipo } from '../lib/pagesMcpClient.js'
import { notificarMencion } from '../lib/notificaciones.js'
import { activarTareasClienteDisponibles } from '../lib/tareaHelpers.js'

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
    include: { tareas: true, solicitudes: { orderBy: { creadaEn: 'desc' } } },
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
      description: 'Da de alta un proyecto nuevo en el Sistema de Seguimiento para poder empezar a reportarle avance. No confirma pagos ni cierra proyectos: anticipoConfirmado es solo informativo (si es false, el proyecto queda en status "pendiente_anticipo" hasta que se confirme desde el panel admin). La respuesta incluye el slug, la contraseña del portal del cliente y urlPortalCliente (la URL completa y lista para compartir, ej. "https://proyectosweb.esbrillante.mx/cliente/{slug}") — no hace falta construirla manualmente. Soporta dos tipos de proyecto (parámetro tipo): "finito" (default, con fases y fecha de entrega) o "continuo" (servicio recurrente sin fecha de cierre, gestionado con un tablero Kanban de columnas Todo/Doing/Revisión/Done — en ese caso se ignoran fases y fechaEstimadaEntrega; usa registrar_actividad/solicitar_al_cliente con el parámetro columna, y mover_a_revision, para trabajar sobre el tablero). Para un proyecto que corresponda a un paquete conocido (no un caso muy a medida), usa listar_plantillas primero y pasa plantillaId aquí — así el proyecto arranca con el checklist real de actividades core y sus dependencias correctas, en vez de tener que inventarlas una por una con registrar_actividad/solicitar_al_cliente después.',
      inputSchema: {
        clienteNombre: z.string().describe('Nombre comercial del cliente'),
        contactoNombre: z.string().optional().describe('Nombre del contacto principal del cliente'),
        correo: z.string().optional().describe('Correo del contacto principal'),
        paquete: z.string().optional().describe('Nombre del paquete/tipo de proyecto. Default: "Personalizado"'),
        descripcion: z.string().optional().describe('Descripción libre de qué trata el proyecto y qué se busca lograr — le da contexto al equipo. Se puede editar después con editar_proyecto.'),
        tipo: z.enum(['finito', 'continuo']).optional().describe('Tipo de proyecto. "finito" (default): tiene fases y converge a una entrega. "continuo": servicio recurrente sin fecha de cierre, se gestiona con un tablero Kanban (Todo/Doing/Revisión/Done) en vez de fases — en este modo se ignoran fases y fechaEstimadaEntrega.'),
        fases: z.array(z.object({
          numero: z.number().int(),
          nombre: z.string(),
          fechaEstimada: z.string().optional().describe('Fecha estimada de esa fase, YYYY-MM-DD'),
          requierePago: z.boolean().optional().describe('true si esta fase no arranca hasta confirmar un pago adicional (ej. Parte A de Fase 2)'),
          pagoConfirmado: z.boolean().optional().describe('true si ese pago ya se confirmó'),
        })).optional()
          .describe('Fases del proyecto en orden, ej. [{"numero":1,"nombre":"Fase 1 — Auth","fechaEstimada":"2026-08-15"}]. Si se omite, usa un default genérico de 3 fases (Planeación/Desarrollo/Entrega) — o las fases de la plantilla si se pasó plantillaId. Solo aplica a tipo "finito"; se ignora en proyectos "continuo".'),
        fechaInicio: z.string().optional().describe('Fecha de inicio en formato YYYY-MM-DD. Default: hoy'),
        fechaEstimadaEntrega: z.string().optional().describe('Fecha estimada de entrega en formato YYYY-MM-DD. Solo aplica a tipo "finito".'),
        anticipoConfirmado: z.boolean().describe('true SOLO si consta que el anticipo/pago inicial ya fue confirmado y recibido. Si no estás seguro, usa false.'),
        passwordCliente: z.string().optional().describe('Contraseña de acceso al portal del cliente. Si se omite, se genera una automáticamente.'),
        plantillaId: z.string().optional().describe('ID de una plantilla (ver listar_plantillas) para arrancar el proyecto con su checklist real de actividades y dependencias, en vez de vacío. Las tareas se filtran por condicionesTecnicas/extras igual que en el asistente de "Nuevo proyecto" del panel admin.'),
        condicionesTecnicas: z.record(z.boolean()).optional().describe('Flags técnicos del proyecto (ej. requiereCloudflare, requiereCorreos, requiereAnalytics, requiereSearchConsole, requierePluginAdicional, requiereCapacitacion) — determinan qué tareas condicionales de la plantilla se incluyen. Solo aplica si se pasa plantillaId.'),
        extras: z.array(z.string()).optional().describe('Nombres exactos de los extras contratados (ej. "Carga de productos (Ecommerce)", "Pasarela de pago (Stripe / MercadoPago / PayPal)", "Blog con entradas iniciales", "SEO avanzado") — también determinan qué tareas condicionales de la plantilla se incluyen. Solo aplica si se pasa plantillaId.'),
        equipo: z.object({
          copy: z.string().optional().describe('userId de quien hace copy/contenido en este proyecto'),
          disenador: z.string().optional().describe('userId de quien diseña'),
          programador: z.string().optional().describe('userId de quien programa, o "no_aplica" si el proyecto no lo requiere'),
          adminProyecto: z.string().optional().describe('userId de quien administra el proyecto'),
        }).optional().describe('Quiénes participan en el equipo de este proyecto, por rol (userId de un usuario real del sistema). Importante definirlo desde la creación: sin esto, las tareas de rol genérico (responsable=copy/disenador/programador) no le aparecen a nadie en "Mis tareas" hasta que se asigne después.'),
      },
    },
    async ({ clienteNombre, contactoNombre, correo, paquete, descripcion, tipo, fases, fechaInicio, fechaEstimadaEntrega, anticipoConfirmado, passwordCliente, plantillaId, condicionesTecnicas, extras, equipo }) => {
      const slug = generarSlug(clienteNombre)
      const tipoFinal = tipo === 'continuo' ? 'continuo' : 'finito'
      const password = passwordCliente || generarPasswordSimple()
      const paqueteFinal = paquete || 'Personalizado'

      let equipoFinal = {}
      try {
        equipoFinal = await validarYNormalizarEquipo(prisma, equipo)
      } catch (err) {
        if (err.status) return fail(err.message)
        throw err
      }

      let tareasFinal = []
      if (tipoFinal === 'finito' && plantillaId) {
        try {
          tareasFinal = await materializarTareasDesdePlantilla(plantillaId, condicionesTecnicas, extras)
        } catch (err) {
          if (err.status) return fail(err.message)
          throw err
        }
      }

      const plantillaUsada = plantillaId ? await prisma.plantilla.findUnique({ where: { id: plantillaId }, select: { fases: true } }) : null
      const fasesFinal = tipoFinal === 'continuo' ? [] : (fases?.length ? fases : plantillaUsada?.fases?.length ? plantillaUsada.fases : [
        { numero: 1, nombre: 'Planeación' },
        { numero: 2, nombre: 'Desarrollo' },
        { numero: 3, nombre: 'Entrega' },
      ])

      const p = await prisma.$transaction(async (tx) => {
        const proyecto = await tx.proyecto.create({
          data: {
            slug,
            tipo: tipoFinal,
            status: anticipoConfirmado ? 'activo' : 'pendiente_anticipo',
            cliente: { nombreComercial: clienteNombre, contactoNombre: contactoNombre || '', correo: correo || '', whatsapp: '', participantes: [] },
            proyecto: {
              paquete: paqueteFinal,
              descripcion: descripcion || '',
              fases: fasesFinal,
              extras: extras || [],
              fechaInicio: fechaInicio || new Date().toISOString().slice(0, 10),
              fechaEstimadaEntrega: tipoFinal === 'continuo' ? null : (fechaEstimadaEntrega || null),
              anticipoConfirmado,
            },
            condicionesTecnicas: condicionesTecnicas || {},
            equipo: equipoFinal,
            passwordCliente: password,
            linksCliente: { drive: '', brief: '', boceto: '', diseno: '' },
            tiempos: { inicio: anticipoConfirmado ? new Date().toISOString() : null, cierre: null, pausas: [] },
          },
        })

        if (tareasFinal.length) {
          await tx.tarea.createMany({ data: tareasFinal.map((t) => ({ ...t, proyectoId: proyecto.id })) })
        }

        return proyecto
      })
      await logEntry(p.id, usuario.nombre, 'Proyecto creado', `Paquete: ${paqueteFinal}${plantillaId ? ` — desde plantilla (${tareasFinal.length} tareas)` : ''}`)

      let avisoDrive = ''
      if (driveConfigurado()) {
        try {
          const carpetaId = await obtenerOCrearCarpetaProyecto(p)
          await prisma.proyecto.update({ where: { id: p.id }, data: { driveRespuestasId: carpetaId } })
        } catch (err) {
          console.error('Error creando carpeta de Drive al crear proyecto:', err)
          avisoDrive = ' (No se pudo crear la carpeta de Drive automáticamente — revisa los logs del servidor.)'
        }
      }

      emitirCambio(p.id)

      const avisoAnticipo = anticipoConfirmado ? '' : ' Status: "pendiente_anticipo" — confirma el anticipo desde el panel admin cuando corresponda.'
      const resumenTareas = tareasFinal.length
        ? `\nTareas creadas desde la plantilla (${tareasFinal.length}): ${JSON.stringify(tareasFinal.map((t) => ({ id: t.id, titulo: t.titulo, fase: t.fase, responsable: t.responsable })))}\nUsa editar_actividad con estos IDs si necesitas reasignar alguna a una persona específica.`
        : ''
      return ok(`Proyecto "${clienteNombre}" creado (tipo: ${tipoFinal}). slug: "${p.slug}". Contraseña del portal del cliente: "${password}". urlPortalCliente: "${urlPortalCliente(p.slug)}".${avisoAnticipo}${avisoDrive}${resumenTareas}`)
    },
  )

  server.registerTool(
    'listar_plantillas',
    {
      title: 'Listar plantillas de proyecto',
      description: 'Lista las plantillas (checklists de actividades por tipo de paquete web) disponibles, con sus fases y tareas — incluyendo dependencias entre tareas, condicion (para qué se filtran con condicionesTecnicas/extras al crear el proyecto) y responsable. Úsala ANTES de crear_proyecto para elegir la plantilla que mejor corresponda al paquete contratado, en vez de inventar el checklist de actividades desde cero — así el proyecto arranca con las actividades core correctas y en el orden correcto.',
      inputSchema: {},
    },
    async () => {
      const plantillas = await prisma.plantilla.findMany({
        include: { tareas: { orderBy: [{ fase: 'asc' }, { orden: 'asc' }] } },
        orderBy: { creadoEn: 'asc' },
      })
      const resumen = plantillas.map((pl) => ({
        id: pl.id,
        nombre: pl.nombre,
        area: pl.area,
        descripcion: pl.descripcion || null,
        fases: pl.fases,
        tareas: pl.tareas.map((t) => ({
          id: t.id,
          fase: t.fase,
          titulo: t.titulo,
          responsable: t.responsable,
          dependencias: t.dependencias,
          condicion: t.condicion,
          esCliente: t.esCliente,
        })),
      }))
      return ok(JSON.stringify(resumen, null, 2))
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
    'editar_proyecto',
    {
      title: 'Editar descripción del proyecto',
      description: 'Actualiza la descripción libre de qué trata el proyecto y qué se busca lograr — le da contexto al equipo. Sobreescribe la descripción existente por completo (no la concatena).',
      inputSchema: {
        slug: z.string().describe('Slug o ID del proyecto'),
        descripcion: z.string().describe('Nueva descripción del proyecto'),
      },
    },
    async ({ slug, descripcion }) => {
      const p = await getProyecto(slug)
      if (!p) return fail(`No se encontró un proyecto con slug "${slug}".`)

      await prisma.proyecto.update({
        where: { id: p.id },
        data: { proyecto: { ...p.proyecto, descripcion } },
      })
      await logEntry(p.id, usuario.nombre, 'Descripción del proyecto actualizada')
      emitirCambio(p.id)

      return ok(`Descripción del proyecto "${slug}" actualizada.`)
    },
  )

  server.registerTool(
    'ver_proyecto',
    {
      title: 'Ver estado de un proyecto',
      description: 'Devuelve status, las tareas en proceso y pendientes (del equipo y del cliente), las respuestas recientes que el cliente ya envió desde su portal, y las solicitudes de cambio pendientes que el cliente levantó por su cuenta (texto y/o link de archivo en ambos casos — los archivos nunca se transfieren por MCP, solo el link para descargarlos, ej. para leer su contenido con WebFetch). También incluye el slug y urlPortalCliente (la URL completa del portal del cliente, ej. "https://proyectosweb.esbrillante.mx/cliente/{slug}") — no hace falta construirla manualmente. En proyectos "finito" incluye fase actual y % de avance; en proyectos "continuo" incluye en su lugar "columnas" con el tablero Kanban (tarjetas agrupadas en todo/doing/revision/done). "tareasEnProceso" lista las tareas del equipo marcadas como en proceso (iniciar_actividad) — antes quedaban invisibles aquí, lo que podía atorar faseActual sin que se notara por qué. Cada tarea en tareasEnProceso/tareasPendientesEquipo incluye su "responsable" — si dice "equipo" es porque quedó sin un rol específico asignado (le aparece a cualquiera del equipo del proyecto en "Mis tareas"); vale la pena revisarlas y reasignarlas con editar_actividad si en realidad son de un rol puntual (copy/disenador/programador). En proyectos "finito" también incluye "resumenFases": el conteo de tareas por estado en cada fase — útil si faseActual no coincide con lo esperado.',
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
        descripcion: p.proyecto?.descripcion || null,
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
        // Resumen por fase — útil para diagnosticar cuando el avance no
        // coincide con lo esperado (ej. una tarea con un estado atípico
        // atorando el cálculo de faseActual).
        resumen.resumenFases = fases.map((f) => {
          const tareasF = p.tareas.filter((t) => t.fase === f.numero)
          const porEstado = {}
          for (const t of tareasF) porEstado[t.estado] = (porEstado[t.estado] || 0) + 1
          return { numero: f.numero, nombre: f.nombre, totalTareas: tareasF.length, porEstado }
        })
      }

      resumen.tareasEnProceso = p.tareas
        .filter((t) => !t.esCliente && t.estado === 'en_proceso')
        .sort((a, b) => a.orden - b.orden)
        .map((t) => ({ id: t.id, fase: t.fase, titulo: t.titulo, responsable: t.responsable }))
      resumen.tareasPendientesEquipo = p.tareas
        .filter((t) => !t.esCliente && t.estado === 'pendiente')
        .sort((a, b) => a.orden - b.orden)
        .map((t) => ({ id: t.id, fase: t.fase, titulo: t.titulo, responsable: t.responsable }))
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
      resumen.solicitudesPendientes = p.solicitudes
        .filter((s) => s.estado === 'pendiente')
        .map((s) => ({
          id: s.id,
          titulo: s.titulo,
          descripcion: s.descripcion || null,
          archivoUrl: s.archivoUrl || null,
          archivoNombre: s.archivoNombre || null,
          creadaEn: s.creadaEn,
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
        descripcion: z.string().optional().describe('Detalle interno de la actividad. Admite HTML mínimo si ayuda a la claridad (<p>, <strong>, <em>, <ul>/<ol>/<li>) — se renderiza formateado en el portal; si se manda texto plano se preservan los saltos de línea igual.'),
        responsable: z.enum(['equipo', 'copy', 'disenador', 'programador', 'karla', 'admin']).optional().describe('A quién le corresponde esta actividad. "copy"/"disenador"/"programador" apuntan a quien ocupe ese rol en ESTE proyecto específico (así solo le aparece en "Mis tareas" a la persona correcta, no a todo el equipo). "karla"/"admin" son fijos. Usa "equipo" (default si se omite) solo cuando de verdad le pueda tocar a cualquiera del equipo asignado — abusar de este valor es lo que hace que a la gente le aparezcan en "Mis tareas" actividades que no son lo suyo.'),
        fase: z.number().int().optional().describe('Número de fase; si se omite, usa la fase actual del proyecto. Se ignora si se da antesDeTareaId/despuesDeTareaId, o si el proyecto es de tipo "continuo" (usa columna en su lugar).'),
        completada: z.boolean().optional().describe('Si es false, la actividad queda pendiente en vez de completada. Default: true. Se ignora en proyectos "continuo" (usa columna en su lugar).'),
        columna: z.enum(['todo', 'doing', 'revision', 'done']).optional().describe('Solo para proyectos tipo "continuo": columna del tablero Kanban donde debe caer la tarjeta. Default: "todo". Se ignora si se da antesDeTareaId/despuesDeTareaId (se usa la columna de esa tarjeta de referencia).'),
        antesDeTareaId: z.string().optional().describe('ID de otra tarea del proyecto antes de la cual debe quedar esta actividad'),
        despuesDeTareaId: z.string().optional().describe('ID de otra tarea del proyecto después de la cual debe quedar esta actividad'),
        dependeDeTareaIds: z.array(z.string()).optional().describe('IDs de tareas de este mismo proyecto que deben quedar completadas antes de que esta actividad se considere disponible.'),
      },
    },
    async ({ slug, titulo, descripcion, responsable, fase, completada, columna, antesDeTareaId, despuesDeTareaId, dependeDeTareaIds }) => {
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
          responsable: responsable || 'equipo',
          dependencias: dependeDeTareaIds || [],
          custom: true,
          estado: estadoFinal,
          completadaPor: marcarCompletada ? usuario.nombre : null,
          completadaEn: marcarCompletada ? new Date() : null,
        },
      })
      await logEntry(p.id, usuario.nombre, marcarCompletada ? 'Tarea agregada y completada' : 'Tarea agregada', titulo)
      if (marcarCompletada) await activarTareasClienteDisponibles(p.id)
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
        instrucciones: z.string().describe('Instrucciones claras para el cliente sobre qué debe hacer. Admite HTML mínimo si ayuda a la claridad (<p>, <strong>, <em>, <ul>/<ol>/<li>) — se renderiza formateado en su portal; si se manda texto plano se preservan los saltos de línea igual.'),
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

      const completadasIds = new Set(p.tareas.filter((t) => t.estado === 'completada').map((t) => t.id))
      const disponibleDeInicio = (dependeDeTareaIds || []).every((d) => completadasIds.has(d))

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
          disponibleDesde: disponibleDeInicio ? new Date() : null,
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
      await activarTareasClienteDisponibles(p.id)
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
      description: 'Corrige el título, descripción, instrucciones, responsable, plazo, dependencias o posición de una tarea ya creada (del equipo o del cliente). Solo actualiza los campos que se manden. Para reordenarla, pasa antesDeTareaId o despuesDeTareaId — mueve la tarea a esa posición. En proyectos "finito" puede cambiar de fase si la tarea de referencia está en otra fase. En proyectos "continuo" puede cambiar de columna del tablero Kanban si la tarea de referencia está en otra columna (equivalente a arrastrarla).',
      inputSchema: {
        slug: z.string().describe('Slug o ID del proyecto'),
        tareaId: z.string().describe('ID de la tarea a editar'),
        titulo: z.string().optional().describe('Nuevo título'),
        descripcion: z.string().optional().describe('Nueva descripción interna. Admite HTML mínimo si ayuda a la claridad (<p>, <strong>, <em>, <ul>/<ol>/<li>) — se renderiza formateado; si se manda texto plano se preservan los saltos de línea igual.'),
        responsable: z.enum(['equipo', 'copy', 'disenador', 'programador', 'karla', 'admin']).optional().describe('Reasignar a quién le corresponde esta actividad (ver_proyecto no marca cuáles quedaron en "equipo" genérico, pero son las que más vale la pena revisar y reasignar a un rol específico — "copy"/"disenador"/"programador" resuelven a quien ocupe ese rol en este proyecto).'),
        instrucciones: z.string().optional().describe('Nuevas instrucciones para el cliente (solo aplica a solicitudes al cliente). Admite HTML mínimo si ayuda a la claridad (<p>, <strong>, <em>, <ul>/<ol>/<li>) — se renderiza formateado; si se manda texto plano se preservan los saltos de línea igual.'),
        plazoHoras: z.number().int().optional().describe('Nuevo plazo en horas'),
        antesDeTareaId: z.string().optional().describe('Reposicionar esta tarea justo antes de otra (por ID)'),
        despuesDeTareaId: z.string().optional().describe('Reposicionar esta tarea justo después de otra (por ID)'),
        dependeDeTareaIds: z.array(z.string()).optional().describe('Reemplaza la lista de tareas de las que depende esta actividad — mientras no estén todas completadas, esta tarea queda oculta/bloqueada para quien deba trabajarla (si es del cliente, no aparece en su portal). Pasa un array vacío para quitar todas las dependencias.'),
      },
    },
    async ({ slug, tareaId, titulo, descripcion, responsable, instrucciones, plazoHoras, antesDeTareaId, despuesDeTareaId, dependeDeTareaIds }) => {
      const p = await getProyecto(slug)
      if (!p) return fail(`No se encontró un proyecto con slug "${slug}".`)

      const tarea = p.tareas.find((t) => t.id === tareaId)
      if (!tarea) return fail(`No se encontró la tarea "${tareaId}" en el proyecto "${slug}".`)

      const errorDeps = validarDependencias(p, dependeDeTareaIds, tareaId)
      if (errorDeps) return fail(errorDeps)

      const data = {}
      if (titulo !== undefined) data.titulo = titulo
      if (descripcion !== undefined) data.descripcion = descripcion
      if (responsable !== undefined) data.responsable = responsable
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
      await activarTareasClienteDisponibles(p.id)
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

  server.registerTool(
    'listar_prototipos',
    {
      title: 'Listar prototipos y páginas web',
      description: 'Lista los prototipos/páginas web publicados en prototipos.esbrillante.mx (con su slug, tipo, estado y cuántos comentarios pendientes tiene cada uno) — úsala para encontrar el slug de un prototipo antes de leer o resolver sus comentarios con ver_comentarios_prototipo/resolver_comentario_prototipo. Nota: el slug de un prototipo es independiente del slug del proyecto en este sistema de seguimiento.',
      inputSchema: {
        proyectoSlug: z.string().optional().describe('Si se da, solo devuelve los prototipos ligados a este proyecto. Si se omite, devuelve todos.'),
      },
    },
    async ({ proyectoSlug }) => {
      let paginas;
      try {
        paginas = await listarPrototiposPages()
      } catch (err) {
        return fail(`No se pudo consultar prototipos.esbrillante.mx: ${err instanceof Error ? err.message : String(err)}`)
      }
      const filtradas = proyectoSlug ? paginas.filter((p) => p.proyectoSlug === proyectoSlug) : paginas
      const resumen = filtradas.map((p) => ({
        slug: p.slug,
        nombre: p.nombre_original,
        tipo: p.tipo,
        estado: p.estado,
        comentariosPendientes: p.comentariosPendientes ?? 0,
        url: p.url,
        proyectoSlug: p.proyectoSlug || null,
      }))
      return ok(JSON.stringify(resumen, null, 2))
    },
  )

  server.registerTool(
    'ver_comentarios_prototipo',
    {
      title: 'Ver comentarios de un prototipo',
      description: 'Lista los comentarios/anotaciones que el cliente o el equipo dejaron en el widget de revisión de un prototipo (ver_proyecto no los incluye — son de otro sistema). Cada uno trae quién lo dejó, su rol, el texto, y si es una sugerencia de cambio de texto trae texto_original/texto_sugerido, o si es una acción rápida trae "accion" (me_gusta/eliminar). Usa listar_prototipos primero para encontrar el slug del prototipo. Después de implementar un comentario, márcalo con resolver_comentario_prototipo.',
      inputSchema: {
        prototipoSlug: z.string().describe('Slug del prototipo (no el del proyecto) — ver listar_prototipos'),
        estado: z.enum(['pendiente', 'resuelto']).optional().describe('Filtra por estado; si se omite, trae todos'),
      },
    },
    async ({ prototipoSlug, estado }) => {
      let anotaciones;
      try {
        anotaciones = await listarAnotacionesPrototipo(prototipoSlug, estado)
      } catch (err) {
        return fail(`No se pudo consultar los comentarios de "${prototipoSlug}": ${err instanceof Error ? err.message : String(err)}`)
      }
      const resumen = anotaciones.map((a) => ({
        id: a.id,
        numero: a.numero,
        autor: a.autor,
        rol: a.rol,
        tipo: a.tipo,
        estado: a.estado,
        fecha: a.fecha,
        texto: a.contenido?.texto || null,
        texto_original: a.contenido?.texto_original || null,
        texto_sugerido: a.contenido?.texto_sugerido || null,
        texto_citado: a.contenido?.texto_citado || null,
        accion: a.contenido?.accion || null,
      }))
      return ok(JSON.stringify(resumen, null, 2))
    },
  )

  server.registerTool(
    'resolver_comentario_prototipo',
    {
      title: 'Marcar comentario de prototipo como resuelto',
      description: 'Marca como resuelto un comentario/anotación de un prototipo (ver_comentarios_prototipo) una vez que ya se implementó lo que pedía. Desaparece de la lista de pendientes en el widget de revisión.',
      inputSchema: {
        prototipoSlug: z.string().describe('Slug del prototipo (no el del proyecto)'),
        anotacionId: z.string().describe('ID del comentario a resolver (ver_comentarios_prototipo lista los IDs)'),
      },
    },
    async ({ prototipoSlug, anotacionId }) => {
      try {
        await resolverAnotacionPrototipo(prototipoSlug, anotacionId)
      } catch (err) {
        return fail(`No se pudo resolver el comentario "${anotacionId}" en "${prototipoSlug}": ${err instanceof Error ? err.message : String(err)}`)
      }
      return ok(`Comentario "${anotacionId}" marcado como resuelto.`)
    },
  )

  server.registerTool(
    'comentar_actividad',
    {
      title: 'Comentar una actividad',
      description: 'Deja un comentario interno sobre una tarea de este proyecto (nunca visible para el cliente, ni siquiera en tareas que él sí ve en su portal) — para dar contexto de qué se está haciendo, dejar una nota para el equipo, o avisar de un problema. Úsala mientras trabajas una actividad para que quede transparencia de tu avance sin que dependa de que alguien te pregunte. Si el comentario es para alguien en particular, usa "mencionar" con su nombre — le llega un correo.',
      inputSchema: {
        slug: z.string().describe('Slug o ID del proyecto'),
        tareaId: z.string().describe('ID de la tarea a comentar'),
        mensaje: z.string().describe('Contenido del comentario'),
        mencionar: z.array(z.string()).optional().describe('Nombres de compañeros a notificar por correo (no IDs) — se busca coincidencia contra los usuarios activos del sistema.'),
      },
    },
    async ({ slug, tareaId, mensaje, mencionar }) => {
      const p = await getProyecto(slug)
      if (!p) return fail(`No se encontró un proyecto con slug "${slug}".`)

      const tarea = p.tareas.find((t) => t.id === tareaId)
      if (!tarea) return fail(`No se encontró la tarea "${tareaId}" en el proyecto "${slug}".`)

      const activos = await prisma.user.findMany({ where: { activo: true }, select: { id: true, nombre: true, email: true, rol: true } })
      let usuariosMencionados = []
      if (mencionar?.length) {
        usuariosMencionados = activos.filter((u) =>
          mencionar.some((nombre) => u.nombre.toLowerCase().includes(nombre.toLowerCase()))
        )
      }

      const comentario = await prisma.comentario.create({
        data: {
          tareaId,
          autor: usuario.nombre,
          autorId: usuario.id,
          texto: mensaje,
          mencionados: usuariosMencionados.map((u) => u.id),
        },
      })

      if (usuariosMencionados.length) {
        notificarMencion(p, tarea, usuario.nombre, mensaje, usuariosMencionados).catch((err) => {
          process.stderr.write(`[mcp] Error notificando mención: ${String(err)}\n`)
        })
      }
      emitirCambio(p.id)

      const aviso = mencionar?.length && !usuariosMencionados.length
        ? ` (no se encontró a nadie activo que coincida con: ${mencionar.join(', ')})`
        : usuariosMencionados.length
          ? ` — se avisó por correo a ${usuariosMencionados.map((u) => u.nombre).join(', ')}`
          : ''
      return ok(`Comentario agregado a "${tarea.titulo}"${aviso}.`)
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
