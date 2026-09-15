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
import { activarTareasClienteDisponibles, aprobarSolicitud } from '../lib/tareaHelpers.js'
import { importarClienteCrm, normBusqueda, dominioDesde, crmConfigurado } from '../lib/clientesCrm.js'
import { listarCustomers, buscarContacts, terminoSeguro } from '../lib/perfexClient.js'

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
          copy: z.union([z.string(), z.array(z.string())]).optional().describe('userId (o varios, si más de una persona cubre este rol en el proyecto) de quien hace copy/contenido'),
          disenador: z.union([z.string(), z.array(z.string())]).optional().describe('userId (o varios) de quien diseña'),
          programador: z.union([z.string(), z.array(z.string())]).optional().describe('userId (o varios) de quien programa, o "no_aplica" si el proyecto no lo requiere'),
          redes: z.union([z.string(), z.array(z.string())]).optional().describe('userId (o varios) de quien lleva redes sociales en este proyecto'),
          adminProyecto: z.union([z.string(), z.array(z.string())]).optional().describe('userId (o varios) de quien administra/coordina el proyecto'),
        }).optional().describe('Quiénes participan en el equipo de este proyecto, por rol (userId de un usuario real del sistema — un rol puede tener más de una persona, ej. dos diseñadores). Importante definirlo desde la creación: sin esto, las tareas de rol genérico (responsable=copy/disenador/programador/redes) no le aparecen a nadie en "Mis tareas" hasta que se asigne después.'),
        areas: z.array(z.enum(['web', 'diseno_grafico', 'redes_sociales'])).optional().describe('Área(s) de trabajo a las que pertenece el proyecto — determina a quién le aparece por defecto en su dashboard (cada admin ve por defecto solo los proyectos de su área). Un proyecto integral que cruza varias áreas lleva varias en el arreglo. Si se omite, el proyecto queda visible en cualquier filtro de área.'),
      },
    },
    async ({ clienteNombre, contactoNombre, correo, paquete, descripcion, tipo, fases, fechaInicio, fechaEstimadaEntrega, anticipoConfirmado, passwordCliente, plantillaId, condicionesTecnicas, extras, equipo, areas }) => {
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
            areas: areas || [],
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
      title: 'Editar descripción o fecha de entrega del proyecto',
      description: 'Actualiza la descripción libre del proyecto y/o su fecha estimada de entrega. Manda solo los campos que quieras cambiar — no toca los que omitas. La descripción se sobreescribe por completo (no se concatena). fechaEstimadaEntrega no aplica a proyectos "continuo" (no tienen fecha de cierre); para la fecha de una fase puntual usa actualizar_fase.',
      inputSchema: {
        slug: z.string().describe('Slug o ID del proyecto'),
        descripcion: z.string().optional().describe('Nueva descripción del proyecto'),
        fechaEstimadaEntrega: z.string().optional().describe('Nueva fecha estimada de entrega, formato YYYY-MM-DD. Solo aplica a proyectos "finito".'),
      },
    },
    async ({ slug, descripcion, fechaEstimadaEntrega }) => {
      if (descripcion === undefined && fechaEstimadaEntrega === undefined) {
        return fail('Manda al menos descripcion o fechaEstimadaEntrega.')
      }

      const p = await getProyecto(slug)
      if (!p) return fail(`No se encontró un proyecto con slug "${slug}".`)
      if (fechaEstimadaEntrega !== undefined && p.tipo === 'continuo') {
        return fail(`El proyecto "${slug}" es de tipo continuo y no tiene fecha de entrega.`)
      }

      const cambios = {}
      if (descripcion !== undefined) cambios.descripcion = descripcion
      if (fechaEstimadaEntrega !== undefined) cambios.fechaEstimadaEntrega = fechaEstimadaEntrega

      await prisma.proyecto.update({
        where: { id: p.id },
        data: { proyecto: { ...p.proyecto, ...cambios } },
      })

      const detalle = Object.keys(cambios).map((c) => c === 'descripcion' ? 'descripción' : `entrega → ${fechaEstimadaEntrega}`).join(', ')
      await logEntry(p.id, usuario.nombre, 'Proyecto editado', detalle)
      emitirCambio(p.id)

      return ok(`Proyecto "${slug}" actualizado (${detalle}).`)
    },
  )

  server.registerTool(
    'ver_proyecto',
    {
      title: 'Ver estado de un proyecto',
      description: 'Devuelve status, las tareas en proceso y pendientes (del equipo y del cliente), las respuestas recientes que el cliente ya envió desde su portal, y las solicitudes de cambio pendientes que el cliente levantó por su cuenta (texto y/o link de archivo en ambos casos — los archivos nunca se transfieren por MCP, solo el link para descargarlos, ej. para leer su contenido con WebFetch). También incluye el slug y urlPortalCliente (la URL completa del portal del cliente, ej. "https://proyectosweb.esbrillante.mx/cliente/{slug}") — no hace falta construirla manualmente. En proyectos "finito" incluye fase actual y % de avance; en proyectos "continuo" incluye en su lugar "columnas" con el tablero Kanban (tarjetas agrupadas en todo/doing/revision/done, ya con todas las tarjetas no omitidas — ahí las completadas ya son visibles). "tareasEnProceso" lista las tareas del equipo marcadas como en proceso (iniciar_actividad) — antes quedaban invisibles aquí, lo que podía atorar faseActual sin que se notara por qué. Cada tarea en tareasEnProceso/tareasPendientesEquipo incluye su "responsable" — si dice "equipo" es porque quedó sin un rol específico asignado (le aparece a cualquiera del equipo del proyecto en "Mis tareas"); vale la pena revisarlas y reasignarlas con editar_actividad si en realidad son de un rol puntual (copy/disenador/programador). En proyectos "finito" también incluye "resumenFases": el conteo de tareas por estado en cada fase — útil si faseActual no coincide con lo esperado. Cada tarea listada incluye "frente" cuando la tarea lo tiene (proyectos integrales que combinan varios objetivos, ver registrar_actividad/editar_actividad) — se omite el campo si la tarea no tiene frente asignado. Por default, en proyectos "finito" una tarea del equipo ya completada NO aparece en ningún listado (para enfocarse en qué falta) — pasa incluirCompletadas:true si necesitas referenciar, comentar o reabrir una tarea que ya se completó (ej. para encadenarle una dependencia, o si registrar_actividad/completar_actividad no te devolvió el id y necesitas buscarlo por título).',
      inputSchema: {
        slug: z.string().describe('Slug o ID del proyecto'),
        incluirCompletadas: z.boolean().optional().describe('Solo aplica a proyectos "finito". Si es true, agrega "tareasCompletadas" con las tareas del equipo ya completadas (id, fase, título, responsable, completadaPor, completadaEn). No cambia ningún otro listado — el propósito principal de esta tool sigue siendo mostrar qué falta.'),
      },
    },
    async ({ slug, incluirCompletadas }) => {
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
        if (incluirCompletadas) {
          resumen.tareasCompletadas = p.tareas
            .filter((t) => !t.esCliente && t.estado === 'completada')
            .sort((a, b) => new Date(b.completadaEn) - new Date(a.completadaEn))
            .map((t) => ({ id: t.id, fase: t.fase, ...(t.frente ? { frente: t.frente } : {}), titulo: t.titulo, responsable: t.responsable, completadaPor: t.completadaPor, completadaEn: t.completadaEn }))
        }
      }

      resumen.tareasEnProceso = p.tareas
        .filter((t) => !t.esCliente && t.estado === 'en_proceso')
        .sort((a, b) => a.orden - b.orden)
        .map((t) => ({ id: t.id, fase: t.fase, ...(t.frente ? { frente: t.frente } : {}), titulo: t.titulo, responsable: t.responsable }))
      resumen.tareasPendientesEquipo = p.tareas
        .filter((t) => !t.esCliente && t.estado === 'pendiente')
        .sort((a, b) => a.orden - b.orden)
        .map((t) => ({ id: t.id, fase: t.fase, ...(t.frente ? { frente: t.frente } : {}), titulo: t.titulo, responsable: t.responsable }))
      resumen.tareasPendientesCliente = p.tareas
        .filter((t) => t.esCliente && t.estado === 'pendiente')
        .sort((a, b) => a.orden - b.orden)
        .map((t) => ({ id: t.id, fase: t.fase, ...(t.frente ? { frente: t.frente } : {}), titulo: t.titulo, instrucciones: t.instruccionesCliente, plazoHoras: t.plazoHoras }))
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
      description: 'Agrega una actividad no contemplada en el checklist original. En proyectos "finito", completada es OBLIGATORIO: pasa true si ya se hizo (para reportar avance ya ocurrido) o false si es trabajo por hacer/planear — no hay default, así se evita marcar como completada una actividad que en realidad hay que planear. En proyectos "continuo" (tablero Kanban) usa el parámetro columna en vez de fase/completada para elegir en qué columna aparece (default "todo"). Si es del equipo (no esCliente), aparece en el portal del cliente dentro de "¿Qué está haciendo el equipo?" (o en el tablero, si es continuo). Importante para el orden: si esta actividad debe aparecer antes o después de otra ya existente (ver ver_proyecto), usa antesDeTareaId/despuesDeTareaId — si no se especifica ninguno, se agrega al final de la fase o columna, lo cual puede quedar fuera de orden lógico. La respuesta incluye el "id" de la tarea creada — guárdalo si otra actividad debe depender de esta (dependeDeTareaIds) o si vas a referenciarla después (antesDeTareaId/despuesDeTareaId/completar_actividad/editar_actividad); no hace falta volver a llamar ver_proyecto solo para obtenerlo.',
      inputSchema: {
        slug: z.string().describe('Slug o ID del proyecto'),
        titulo: z.string().describe('Título breve de la actividad'),
        descripcion: z.string().optional().describe('Detalle interno de la actividad. Admite HTML mínimo si ayuda a la claridad (<p>, <strong>, <em>, <ul>/<ol>/<li>) — se renderiza formateado en el portal; si se manda texto plano se preservan los saltos de línea igual.'),
        responsable: z.enum(['equipo', 'copy', 'disenador', 'programador', 'redes', 'karla', 'admin']).optional().describe('A quién le corresponde esta actividad. "copy"/"disenador"/"programador"/"redes" apuntan a quien ocupe ese rol en ESTE proyecto específico (así solo le aparece en "Mis tareas" a la persona correcta, no a todo el equipo). "karla"/"admin" son fijos. Usa "equipo" (default si se omite) solo cuando de verdad le pueda tocar a cualquiera del equipo asignado — abusar de este valor es lo que hace que a la gente le aparezcan en "Mis tareas" actividades que no son lo suyo.'),
        fase: z.number().int().optional().describe('Número de fase; si se omite, usa la fase actual del proyecto. Se ignora si se da antesDeTareaId/despuesDeTareaId, o si el proyecto es de tipo "continuo" (usa columna en su lugar).'),
        completada: z.boolean().optional().describe('Obligatorio en proyectos "finito": true si ya se hizo (reportar avance ya ocurrido), false si es trabajo pendiente por hacer/planear. Sin default — decide explícitamente en cada llamada. Se ignora en proyectos "continuo" (usa columna en su lugar).'),
        columna: z.enum(['todo', 'doing', 'revision', 'done']).optional().describe('Solo para proyectos tipo "continuo": columna del tablero Kanban donde debe caer la tarjeta. Default: "todo". Se ignora si se da antesDeTareaId/despuesDeTareaId (se usa la columna de esa tarjeta de referencia).'),
        frente: z.string().optional().describe('Solo para proyectos integrales que combinan varios objetivos sin fases compartidas (ej. video corporativo + sitio + redes, donde "Config Técnica" no significa nada para el video). Texto libre (ej. "Video", "Sitio web", "Redes") — la vista del proyecto agrupa las tareas por este valor cuando lo tienen. Omite este campo en proyectos de un solo frente de trabajo.'),
        antesDeTareaId: z.string().optional().describe('ID de otra tarea del proyecto antes de la cual debe quedar esta actividad'),
        despuesDeTareaId: z.string().optional().describe('ID de otra tarea del proyecto después de la cual debe quedar esta actividad'),
        dependeDeTareaIds: z.array(z.string()).optional().describe('IDs de tareas de este mismo proyecto que deben quedar completadas antes de que esta actividad se considere disponible.'),
      },
    },
    async ({ slug, titulo, descripcion, responsable, fase, completada, columna, frente, antesDeTareaId, despuesDeTareaId, dependeDeTareaIds }) => {
      const p = await getProyecto(slug)
      if (!p) return fail(`No se encontró un proyecto con slug "${slug}".`)

      const errorDeps = validarDependencias(p, dependeDeTareaIds)
      if (errorDeps) return fail(errorDeps)

      const esContinuo = p.tipo === 'continuo'
      if (!esContinuo && completada === undefined) {
        return fail('Falta "completada": pasa true si esta actividad ya se hizo, o false si es trabajo pendiente por hacer/planear. No tiene default para evitar marcar como completado algo que en realidad hay que planear.')
      }

      const posicion = esContinuo
        ? await resolverColumnaYOrden(p, { columna, antesDeTareaId, despuesDeTareaId })
        : await resolverFaseYOrden(p, { fase, antesDeTareaId, despuesDeTareaId })
      if (posicion.error) return fail(posicion.error)

      const marcarCompletada = esContinuo ? posicion.estadoFinal === 'completada' : completada === true
      const estadoFinal = esContinuo ? posicion.estadoFinal : (marcarCompletada ? 'completada' : 'pendiente')

      const id = randomUUID()
      await prisma.tarea.create({
        data: {
          id,
          proyectoId: p.id,
          fase: esContinuo ? 1 : posicion.faseFinal,
          orden: posicion.orden,
          titulo,
          descripcion: descripcion || '',
          responsable: responsable || 'equipo',
          frente: frente || null,
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
      return ok(`Actividad "${titulo}" registrada en ${ubicacion}${esContinuo ? '' : (marcarCompletada ? ' y marcada como completada' : ' (pendiente)')}. id: "${id}"`)
    },
  )

  server.registerTool(
    'solicitar_al_cliente',
    {
      title: 'Solicitar algo al cliente',
      description: 'Crea una tarea pendiente para el cliente. Por defecto aparece de inmediato en su portal dentro de "Necesitamos tu respuesta" (esto no cambia entre proyectos "finito" y "continuo" — las tareas del cliente no viven en el tablero Kanban). Si el orden importa (ej. debe pedirse antes de otra tarea del checklist), usa antesDeTareaId/despuesDeTareaId. Si la solicitud no debe estar disponible para el cliente hasta que el equipo termine algo primero (ej. "revisa este prototipo" solo tiene sentido una vez diseñado), usa dependeDeTareaIds — la tarea queda oculta para el cliente hasta que esas tareas se marquen completadas. Si la solicitud implica que el cliente suba archivo(s) (fotos, logo, documentos, materiales), usa pedirArchivos: true para que se genere automáticamente el link de la carpeta de Drive del proyecto y aparezca directo en su tarjeta. La respuesta incluye el "id" de la tarea creada, por si otra actividad debe depender de ella.',
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

      const id = randomUUID()
      await prisma.tarea.create({
        data: {
          id,
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
      return ok(`Se creó la solicitud "${titulo}" para el cliente${esContinuo ? '' : ` en fase ${posicion.faseFinal}`}${nota}.${avisoDrive} id: "${id}"`)
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
        responsable: z.enum(['equipo', 'copy', 'disenador', 'programador', 'redes', 'karla', 'admin']).optional().describe('Reasignar a quién le corresponde esta actividad (ver_proyecto no marca cuáles quedaron en "equipo" genérico, pero son las que más vale la pena revisar y reasignar a un rol específico — "copy"/"disenador"/"programador"/"redes" resuelven a quien ocupe ese rol en este proyecto).'),
        instrucciones: z.string().optional().describe('Nuevas instrucciones para el cliente (solo aplica a solicitudes al cliente). Admite HTML mínimo si ayuda a la claridad (<p>, <strong>, <em>, <ul>/<ol>/<li>) — se renderiza formateado; si se manda texto plano se preservan los saltos de línea igual.'),
        plazoHoras: z.number().int().optional().describe('Nuevo plazo en horas'),
        frente: z.string().optional().describe('Agrupador libre para proyectos integrales que combinan varios objetivos sin fases compartidas (ej. "Video", "Sitio web", "Redes") — la vista del proyecto agrupa por este valor. Pasa "" (string vacío) para quitarlo.'),
        prioridad: z.enum(['urgente', 'normal', 'cuando_se_pueda']).optional().describe('Prioridad de esta tarea para el equipo — distinta de plazoHoras (que solo aplica a tareas del cliente). Determina el orden en "Mis tareas".'),
        fechaLimite: z.string().optional().describe('Fecha límite del equipo para esta tarea, formato YYYY-MM-DD. Distinta del plazo del cliente.'),
        antesDeTareaId: z.string().optional().describe('Reposicionar esta tarea justo antes de otra (por ID)'),
        despuesDeTareaId: z.string().optional().describe('Reposicionar esta tarea justo después de otra (por ID)'),
        dependeDeTareaIds: z.array(z.string()).optional().describe('Reemplaza la lista de tareas de las que depende esta actividad — mientras no estén todas completadas, esta tarea queda oculta/bloqueada para quien deba trabajarla (si es del cliente, no aparece en su portal). Pasa un array vacío para quitar todas las dependencias.'),
      },
    },
    async ({ slug, tareaId, titulo, descripcion, responsable, instrucciones, plazoHoras, frente, prioridad, fechaLimite, antesDeTareaId, despuesDeTareaId, dependeDeTareaIds }) => {
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
      if (frente !== undefined) data.frente = frente || null
      if (prioridad !== undefined) data.prioridad = prioridad
      if (fechaLimite !== undefined) data.fechaLimite = new Date(fechaLimite)
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
    'crear_solicitud_interna',
    {
      title: 'Registrar un ticket de trabajo suelto',
      description: 'Registra un ticket de trabajo que llegó por fuera del portal del cliente (WhatsApp, teléfono, o detectado por el propio equipo) — típico de mantenimiento web (corregir una falla, actualizar información) o trabajo suelto de diseño. A diferencia de una solicitud del portal, este NO queda pendiente de aprobación: se crea y se convierte en tarea real de inmediato, porque ya lo capturó alguien del equipo con criterio. Úsalo sobre un proyecto "continuo" que sirva de cola de tickets (uno por sitio para mantenimiento, uno por cliente para diseño suelto) — el ticket cae directo en su tablero Kanban.',
      inputSchema: {
        slug: z.string().describe('Slug o ID del proyecto continuo que sirve de cola de tickets'),
        titulo: z.string().describe('Título breve del ticket'),
        descripcion: z.string().optional().describe('Detalle de qué hay que hacer'),
        tipo: z.enum(['falla', 'actualizacion', 'preventivo', 'consulta']).optional().describe('Naturaleza del ticket, para reportes después'),
        cobertura: z.enum(['incluido', 'adicional', 'por_valorar']).optional().describe('Si cae dentro de lo ya contratado, es trabajo adicional, o hay que revisarlo — solo se guarda como dato, no dispara ningún flujo de aprobación de cobro'),
        origen: z.enum(['whatsapp', 'telefono', 'interno']).optional().describe('De dónde vino el ticket (default "interno" — detectado por el equipo, no reportado directamente por el cliente)'),
        sitioId: z.string().optional().describe('ID del Sitio (mantenimiento web) al que pertenece este ticket, si aplica'),
        clienteId: z.string().optional().describe('ID del Cliente (diseño u otro trabajo suelto) al que pertenece este ticket, si aplica'),
        responsable: z.enum(['equipo', 'copy', 'disenador', 'programador', 'redes', 'karla', 'admin']).optional().describe('A quién le corresponde — mismo criterio que registrar_actividad'),
        columna: z.enum(['todo', 'doing', 'revision', 'done']).optional().describe('Columna del tablero Kanban donde debe caer (default "todo")'),
        prioridad: z.enum(['urgente', 'normal', 'cuando_se_pueda']).optional(),
        fechaLimite: z.string().optional().describe('Fecha límite del equipo, formato YYYY-MM-DD'),
      },
    },
    async ({ slug, titulo, descripcion, tipo, cobertura, origen, sitioId, clienteId, responsable, columna, prioridad, fechaLimite }) => {
      const p = await getProyecto(slug)
      if (!p) return fail(`No se encontró un proyecto con slug "${slug}".`)
      if (p.tipo !== 'continuo') return fail(`El proyecto "${slug}" no es de tipo continuo — los tickets sueltos deben caer en un proyecto continuo que sirva de cola (uno por sitio o por cliente).`)

      const solicitud = await prisma.solicitud.create({
        data: {
          proyectoId: p.id,
          titulo,
          descripcion: descripcion || '',
          tipo: tipo || null,
          cobertura: cobertura || null,
          origen: origen || 'interno',
          sitioId: sitioId || null,
          clienteId: clienteId || null,
        },
      })

      const { tarea } = await aprobarSolicitud(p, solicitud, { columna, responsable, prioridad, fechaLimite }, usuario.nombre)
      await logEntry(p.id, usuario.nombre, 'Ticket registrado', `${solicitud.titulo} — origen: ${solicitud.origen}`)
      emitirCambio(p.id)

      return ok(`Ticket "${titulo}" registrado y agregado al tablero (id de la tarea: ${tarea.id}).`)
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

  // ─── Mantenimiento web (tickets) ──────────────────────────────────────────
  // Mismo modelo y flujo que la interfaz /admin/mantenimiento: el CRM es la
  // fuente de verdad de clientes (se importa/vincula automáticamente si hace
  // falta) y cada ticket pertenece a un cliente y a un sitio concretos.

  const INCLUDE_TICKET = {
    cliente: { select: { id: true, crmId: true, nombreComercial: true, contactoNombre: true, correo: true, whatsapp: true } },
    sitio: true,
  }

  function ticketResumen(t) {
    return {
      folio: `WEB-${String(t.folio).padStart(4, '0')}`,
      id: t.id,
      titulo: t.titulo,
      estado: t.estado,
      prioridad: t.prioridad,
      cliente: t.cliente?.nombreComercial,
      sitio: t.sitio?.dominio,
      responsable: t.responsableId || null,
      creadoEn: t.creadoEn,
      ...(t.estado !== 'done' ? {} : { resueltoEn: t.resueltoEn }),
    }
  }

  // Resuelve un cliente desde cualquier identificador: id local, crmId,
  // nombre comercial (Foco primero, CRM después — importando si hace falta),
  // nombre de contacto, correo o teléfono.
  async function resolverClienteTicket(param) {
    const directo = await prisma.cliente.findFirst({ where: { OR: [{ id: param }, { crmId: param }] } })
    if (directo) return { cliente: directo, aviso: '' }

    const nq = normBusqueda(param)
    if (!nq) return {}

    const locales = await prisma.cliente.findMany()
    const local = locales.find((c) => normBusqueda(c.nombreComercial) === nq)
      || locales.find((c) => normBusqueda(c.nombreComercial).includes(nq) || nq.includes(normBusqueda(c.nombreComercial)))
    if (local) return { cliente: local, aviso: '' }

    if (crmConfigurado()) {
      // Empresas del CRM (listado cacheado, inmune al WAF) por nombre normalizado
      let customers = []
      try { customers = await listarCustomers() } catch { customers = [] }
      const match = customers.find((c) => normBusqueda(c.company) === nq)
        || customers.find((c) => normBusqueda(c.company).includes(nq) || nq.includes(normBusqueda(c.company)))
      if (match) {
        const { cliente } = await importarClienteCrm(String(match.userid))
        return { cliente, aviso: `Cliente importado del CRM (crmId ${match.userid}).` }
      }
      // Contactos del CRM por nombre/correo/teléfono (con truco de sufijo para teléfonos con espacios)
      const termino = terminoSeguro(param)
      let contactos = []
      try { contactos = await buscarContacts(termino) } catch { contactos = [] }
      const digitos = param.replace(/\D/g, '')
      if (digitos.length >= 7 && !contactos.length) {
        try { contactos = await buscarContacts(digitos.slice(-4)) } catch { contactos = [] }
        contactos = contactos.filter((c) => String(c.phonenumber || '').replace(/\D/g, '').includes(digitos))
      }
      const porDatos = contactos.find((c) =>
        normBusqueda(`${c.firstname} ${c.lastname}`).includes(nq)
        || normBusqueda(c.email) === nq)
        || contactos.find((c) => String(c.phonenumber || '').replace(/\D/g, '').includes(digitos))
      if (porDatos?.userid) {
        const { cliente } = await importarClienteCrm(String(porDatos.userid))
        return { cliente, aviso: `Cliente vinculado por contacto del CRM (crmId ${porDatos.userid}).` }
      }
    }
    return {}
  }

  server.registerTool(
    'listar_tickets',
    {
      title: 'Listar tickets de mantenimiento',
      description: 'Lista los tickets de la mesa de mantenimiento web (no archivados) con folio, problema, estado, prioridad, cliente, sitio y antigüedad. Filtra opcionalmente por estado (todo/doing/revision/done), prioridad (urgente/normal/cuando_se_pueda) o texto libre (folio, problema, cliente o dominio). "todo" en estado devuelve TODOS incluyendo resueltos; por defecto devuelve solo los abiertos (no done).',
      inputSchema: {
        estado: z.enum(['todo', 'doing', 'revision', 'done']).optional().describe('Filtrar por estado. OJO: "todo" significa literalmente estado Por hacer; usa incluirResueltos para ver todo.'),
        prioridad: z.enum(['urgente', 'normal', 'cuando_se_pueda']).optional(),
        texto: z.string().optional().describe('Busca en folio, problema, cliente y dominio'),
        incluirResueltos: z.boolean().optional().describe('true para incluir también los resueltos (done). Default: solo abiertos.'),
      },
    },
    async ({ estado, prioridad, texto, incluirResueltos }) => {
      const norm = (s) => String(s || '').toLowerCase()
      const nTexto = norm(texto)
      const tickets = await prisma.incidencia.findMany({
        where: { archivada: false, ...(estado ? { estado } : incluirResueltos ? {} : { estado: { not: 'done' } }), ...(prioridad ? { prioridad } : {}) },
        include: INCLUDE_TICKET,
        orderBy: { creadoEn: 'asc' },
      })
      const filtrados = nTexto ? tickets.filter((t) =>
        [t.titulo, `WEB-${String(t.folio).padStart(4, '0')}`, t.cliente?.nombreComercial, t.sitio?.dominio]
          .some((v) => norm(v).includes(nTexto))) : tickets
      const ORDEN = { urgente: 0, normal: 1, cuando_se_pueda: 2 }
      filtrados.sort((a, b) => (ORDEN[a.prioridad] ?? 9) - (ORDEN[b.prioridad] ?? 9))
      return ok(JSON.stringify(filtrados.map(ticketResumen), null, 2))
    },
  )

  server.registerTool(
    'crear_ticket',
    {
      title: 'Crear ticket de mantenimiento',
      description: 'Registra un ticket en la mesa de mantenimiento web. El cliente se resuelve automáticamente desde lo que mandes — id de Foco, crmId del CRM, nombre de la empresa, nombre de contacto, correo o teléfono (si no está en Foco, se importa del CRM y queda vinculado; el CRM es la fuente obligatoria de clientes). El sitio también se resuelve solo: si el cliente tiene un único sitio se usa; si mandas un dominio que no existe, se registra como sitio nuevo. Título del problema es el único dato realmente obligatorio.',
      inputSchema: {
        titulo: z.string().describe('Problema reportado, breve y claro (ej. "El sitio muestra un error crítico al entrar")'),
        cliente: z.string().describe('Cliente: id de Foco, crmId del CRM, empresa, contacto, correo o teléfono'),
        sitio: z.string().optional().describe('Dominio del sitio afectado (ej. "banhomerealestate.com") o id del sitio en Foco. Si se omite y el cliente tiene un solo sitio, se usa ese.'),
        descripcion: z.string().optional().describe('Qué reportaron, desde cuándo ocurre, contexto útil'),
        prioridad: z.enum(['urgente', 'normal', 'cuando_se_pueda']).optional().describe('Default: normal'),
        origen: z.enum(['whatsapp', 'telefono', 'interno', 'monitoreo']).optional().describe('Canal por donde llegó. Default: interno'),
        tipo: z.enum(['falla', 'actualizacion', 'preventivo', 'consulta']).optional().describe('Default: falla'),
        cobertura: z.enum(['incluido', 'cortesia', 'adicional', 'por_valorar']).optional().describe('Default: la del sitio o por_valorar'),
        responsable: z.string().optional().describe('userId o nombre de la persona del equipo responsable'),
        telefonoOrigen: z.string().optional().describe('Teléfono de donde llegó el reporte (típico de WhatsApp)'),
        fechaLimite: z.string().optional().describe('Fecha límite YYYY-MM-DD'),
      },
    },
    async ({ titulo, cliente: clienteParam, sitio: sitioParam, descripcion, prioridad, origen, tipo, cobertura, responsable, telefonoOrigen, fechaLimite }) => {
      if (!titulo?.trim()) return fail('El título del problema es obligatorio.')

      const { cliente, aviso } = await resolverClienteTicket(String(clienteParam).trim())
      if (!cliente) {
        return fail(`No encontré ese cliente en Foco ni en el CRM ("${clienteParam}"). Si es un cliente nuevo, hay que registrarlo primero en el CRM (en Foco: Nuevo ticket → buscar → registrar en el CRM) y volver a intentar.`)
      }

      // Sitio: por id/dominio dentro del cliente; único sitio; o registro nuevo.
      let sitio
      if (sitioParam) {
        const dom = dominioDesde(sitioParam) || sitioParam.trim().toLowerCase()
        sitio = await prisma.sitio.findFirst({ where: { clienteId: cliente.id, OR: [{ id: sitioParam }, { dominio: dom }] } })
        if (!sitio) {
          if (!dom.includes('.')) return fail(`No encontré el sitio "${sitioParam}" del cliente "${cliente.nombreComercial}" y no parece un dominio válido para registrarlo.`)
          sitio = await prisma.sitio.create({ data: { clienteId: cliente.id, nombre: 'Sitio principal', dominio: dom, url: `https://${dom}`, coberturaMantenimiento: cobertura || null } })
        }
      } else {
        const sitios = await prisma.sitio.findMany({ where: { clienteId: cliente.id } })
        if (sitios.length === 1) {
          sitio = sitios[0]
        } else if (sitios.length > 1) {
          return fail(`El cliente "${cliente.nombreComercial}" tiene ${sitios.length} sitios — dime cuál está afectado: ${sitios.map((s) => s.dominio || s.nombre).join(', ')}.`)
        } else {
          return fail(`El cliente "${cliente.nombreComercial}" no tiene sitios registrados. Manda el dominio del sitio afectado en "sitio" y lo registro con el ticket.`)
        }
      }

      let responsableId = null
      if (responsable) {
        const usuario = await prisma.user.findFirst({ where: { OR: [{ id: responsable }, { nombre: { contains: responsable } }], activo: true } })
        if (!usuario) return fail(`No encontré a nadie activo que coincida con "${responsable}".`)
        responsableId = usuario.id
      }

      const ticket = await prisma.incidencia.create({
        data: {
          clienteId: cliente.id,
          sitioId: sitio.id,
          titulo: titulo.trim(),
          descripcion: descripcion?.trim() || '',
          estado: 'todo',
          prioridad: prioridad || 'normal',
          cobertura: cobertura || sitio.coberturaMantenimiento || 'por_valorar',
          infraestructura: sitio.infraestructura || 'sin_localizar',
          origen: origen || 'interno',
          tipo: tipo || 'falla',
          responsableId,
          reportadoPor: usuario.nombre,
          telefonoOrigen: telefonoOrigen || null,
          fechaLimite: fechaLimite ? new Date(fechaLimite) : null,
        },
        include: INCLUDE_TICKET,
      })
      emitirCambio('incidencias')

      return ok(`Ticket WEB-${String(ticket.folio).padStart(4, '0')} creado para "${cliente.nombreComercial}" (${sitio.dominio || sitio.nombre}).${aviso ? ' ' + aviso : ''}${responsableId ? ` Responsable asignado.` : ''} Estado: Por hacer.`)
    },
  )

  server.registerTool(
    'actualizar_ticket',
    {
      title: 'Actualizar ticket de mantenimiento',
      description: 'Actualiza un ticket de la mesa de mantenimiento: estado, prioridad, cobertura, responsable, diagnóstico, causa raíz, resolución, fecha límite o archivado. Se identifica por folio (ej. "WEB-0001" o "1") o por id. Al marcar estado "doing" se registra cuándo se empezó; al marcar "done", cuándo se resolvió.',
      inputSchema: {
        ticket: z.string().describe('Folio (WEB-0001 o 1) o id del ticket'),
        estado: z.enum(['todo', 'doing', 'revision', 'done']).optional(),
        prioridad: z.enum(['urgente', 'normal', 'cuando_se_pueda']).optional(),
        cobertura: z.enum(['incluido', 'cortesia', 'adicional', 'por_valorar']).optional(),
        infraestructura: z.enum(['esbrillante', 'externa', 'sin_localizar']).optional(),
        responsable: z.string().optional().describe('userId o nombre de la persona del equipo'),
        diagnostico: z.string().optional().describe('Qué se encontró durante la revisión'),
        causaRaiz: z.string().optional().describe('Qué originó el problema'),
        resolucion: z.string().optional().describe('Qué se hizo y cómo se verificó'),
        fechaLimite: z.string().optional().describe('Fecha límite YYYY-MM-DD (vacío para quitarla)'),
        archivada: z.boolean().optional().describe('true para archivar el ticket'),
      },
    },
    async ({ ticket: ticketParam, estado, prioridad, cobertura, infraestructura, responsable, diagnostico, causaRaiz, resolucion, fechaLimite, archivada }) => {
      const folio = /^WEB-?(\d+)$/i.exec(String(ticketParam).trim())
      const where = folio ? { folio: Number(folio[1]) } : { id: ticketParam }
      const actual = await prisma.incidencia.findUnique({ where })
      if (!actual) return fail(`No encontré el ticket "${ticketParam}".`)

      const data = {}
      if (estado) data.estado = estado
      if (prioridad) data.prioridad = prioridad
      if (cobertura) data.cobertura = cobertura
      if (infraestructura) data.infraestructura = infraestructura
      if (diagnostico !== undefined) data.diagnostico = diagnostico
      if (causaRaiz !== undefined) data.causaRaiz = causaRaiz
      if (resolucion !== undefined) data.resolucion = resolucion
      if (archivada !== undefined) data.archivada = archivada
      if (fechaLimite !== undefined) data.fechaLimite = fechaLimite ? new Date(fechaLimite) : null
      if (responsable !== undefined) {
        if (!responsable) data.responsableId = null
        else {
          const usuario = await prisma.user.findFirst({ where: { OR: [{ id: responsable }, { nombre: { contains: responsable } }], activo: true } })
          if (!usuario) return fail(`No encontré a nadie activo que coincida con "${responsable}".`)
          data.responsableId = usuario.id
        }
      }
      if (estado === 'doing' && !actual.iniciadoEn) data.iniciadoEn = new Date()
      if (estado === 'done') data.resueltoEn = actual.resueltoEn || new Date()
      if (estado && estado !== 'done') data.resueltoEn = null

      if (!Object.keys(data).length) return fail('No mandaste ningún cambio.')

      const actualizado = await prisma.incidencia.update({ where: { id: actual.id }, data, include: INCLUDE_TICKET })
      emitirCambio('incidencias')
      return ok(`Ticket WEB-${String(actualizado.folio).padStart(4, '0')} actualizado: ${JSON.stringify(ticketResumen(actualizado))}`)
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
