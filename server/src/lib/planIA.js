import { randomUUID } from 'crypto'
import prisma from './prisma.js'
import { generarTexto } from './ia.js'
import { quitarPrecios } from './alcancePerfex.js'
import { ROLES_RESPONSABLE } from './permisos.js'
import { ordenAlFinal } from './orden.js'
import { activarTareasClienteDisponibles } from './tareaHelpers.js'
import { logEntry } from './logEntry.js'
import { emitirCambio } from './eventos.js'

// Borrador del plan de trabajo armado por la IA a partir del alcance
// contratado. Siempre es borrador: vive en proyecto.proyecto.borradorPlan
// hasta que un admin lo aplica (crea las tareas) o lo descarta.

const RESPONSABLES_PLAN = [...ROLES_RESPONSABLE, 'admin']
const MAX_TAREAS = 60
const MAX_FASES = 12

function errorConStatus(mensaje, status) {
  const error = new Error(mensaje)
  error.status = status
  return error
}

const SISTEMA = `Eres el coordinador de proyectos de EsBrillante, una agencia de desarrollo web, diseño y marketing digital en Cuernavaca, México.
Tu trabajo es convertir lo que el cliente contrató en un plan de trabajo realista y ordenado: las actividades concretas que hay que hacer, en qué orden y quién las hace.

Reglas:
- Planea exactamente lo contratado (conceptos "incluido" o "confirmado"). Los conceptos "pendientes de confirmar" NO se planean todavía: si importan, menciónalos en "preguntas".
- Nunca escribas precios, montos ni condiciones de pago.
- Si una actividad de las plantillas de la agencia encaja, reutiliza su título tal cual en vez de inventar uno nuevo.
- Marca con esCliente=true lo que le toca hacer al cliente (enviar brief, contenido, accesos, logo, revisar y aprobar). Las revisiones del cliente van después de que exista lo que tiene que revisar (usa dependencias).
- Respeta las condiciones del texto del alcance. Por ejemplo, "los tiempos corren a partir de la entrega del brief y el contenido" significa que las tareas del cliente de brief y contenido van primero y bloquean la construcción; "3 rondas de revisión por módulo" significa una tarea de revisión del cliente por ronda y módulo, cada una después de la anterior.
- Para cada tarea del equipo decide "ejecutor": "agente" si un agente de código con IA (Claude Code, OpenCode) puede ejecutarla completa una vez que una persona la inicia (migrar código, marcado SEO, schema, sitemaps, extraer o migrar contenido, configuraciones repetitivas); "humano" en cualquier otro caso (diseño, decisiones, juntas, trato con el cliente). Si es "agente", puedes sugerir cuál en "agenteSugerido".
- "duracionDias": días hábiles realistas, número entero.
- "responsable": uno de copy, disenador, programador, redes, admin, equipo; o "cliente" para las tareas del cliente.
- "dependencias": lista de "ref" de tareas que deben terminar antes. Sin ciclos.
- Si el proyecto ya tiene fases, usa esos números de fase. Si no, propón fases cortas y claras. Si el proyecto es continuo, usa solo la fase 1.
- No repitas tareas que ya existen en el proyecto.
- Lista en "supuestos" lo que diste por hecho y en "preguntas" lo que hay que confirmar con el cliente o con el admin.
- La agencia ya construye los sitios con Astro y stacks modernos, no con WordPress: no propongas tareas de WordPress (plugins, temas, instalación) salvo que el alcance lo pida.

Contexto técnico ("contextoTecnico") en proyectos web:
- Siempre incluye dar de alta Google Analytics (GA4) y Search Console, aunque el alcance no lo mencione.
- hosting "nosotros": incluye configurar el sitio en nuestro hosting con Cloudflare (DNS, SSL).
- hosting "migra": incluye migrar el hosting y el dominio del cliente a nuestros servidores (con Cloudflare).
- hosting "propio": no incluyas tareas de hosting, pero sí una tarea para coordinar con el cliente el acceso a su DNS.
- yaEsCliente=true: su sitio actual (sitioActual) es el punto de partida — es migración o rediseño: incluye extraer y reutilizar su contenido.
- tieneDominio=false: incluye proponerle opciones de dominio y registrarlo; el cliente elige (tarea del cliente para elegir).

Responde SOLO con JSON válido, sin texto adicional, con esta forma:
{"fases":[{"numero":1,"nombre":"..."}],"tareas":[{"ref":"t1","titulo":"...","fase":1,"responsable":"programador","esCliente":false,"descripcion":"...","queEntregas":"...","instruccionesCliente":"","dependencias":[],"duracionDias":2,"ejecutor":"humano","agenteSugerido":""}],"supuestos":["..."],"preguntas":["..."]}`

async function resumenPlantillas() {
  const plantillas = await prisma.plantilla.findMany({
    select: { nombre: true, area: true, fases: true, tareas: { select: { titulo: true, fase: true, esCliente: true }, orderBy: [{ fase: 'asc' }, { orden: 'asc' }] } },
  })
  return plantillas.map((pl) => ({
    nombre: pl.nombre,
    area: pl.area,
    fases: (Array.isArray(pl.fases) ? pl.fases : []).map((f) => f?.nombre).filter(Boolean),
    tareas: pl.tareas.slice(0, 50).map((t) => `${t.fase}. ${t.titulo}${t.esCliente ? ' (cliente)' : ''}`),
  }))
}

function contextoDelProyecto(proyecto, tareasExistentes, plantillas) {
  const conceptos = proyecto.proyecto.alcance.conceptos || []
  const texto = (c) => [c.descripcion, c.detalle].filter(Boolean).join(' — ')
  const esContinuo = proyecto.tipo === 'continuo'
  return {
    cliente: proyecto.cliente?.nombreComercial || '',
    tipo: esContinuo ? 'continuo (servicio recurrente, sin fases)' : 'finito (por fases)',
    descripcion: proyecto.proyecto?.descripcion || '',
    propuesta: proyecto.proyecto.alcance.titulo,
    contratado: conceptos.filter((c) => c.estado === 'incluido' || c.estado === 'confirmado').map(texto),
    pendientesDeConfirmar_noPlanearTodavia: conceptos.filter((c) => c.estado === 'por_confirmar').map(texto),
    fasesExistentes: esContinuo ? [] : (proyecto.proyecto?.fases || []).map(({ numero, nombre }) => ({ numero, nombre })),
    tareasQueYaExisten: tareasExistentes.slice(0, 80).map((t) => t.titulo),
    contextoTecnico: proyecto.proyecto?.contextoTecnico || null,
    plantillasDeLaAgencia: plantillas,
  }
}

export function extraerJson(texto) {
  const sinCercas = String(texto || '').replace(/```(?:json)?/gi, '')
  const inicio = sinCercas.indexOf('{')
  const fin = sinCercas.lastIndexOf('}')
  if (inicio === -1 || fin <= inicio) return null
  try {
    return JSON.parse(sinCercas.slice(inicio, fin + 1))
  } catch {
    return null
  }
}

function textoLimpio(valor, max) {
  return quitarPrecios(typeof valor === 'string' ? valor : '').slice(0, max)
}

function enteroEntre(valor, min, max, porDefecto) {
  const n = Math.round(Number(valor))
  if (!Number.isFinite(n)) return porDefecto
  return Math.min(max, Math.max(min, n))
}

function creaCiclo(aristas, desde, hacia) {
  // ¿Se llega de `hacia` a `desde` siguiendo dependencias ya aceptadas?
  const pendientes = [hacia]
  const vistos = new Set()
  while (pendientes.length) {
    const actual = pendientes.pop()
    if (actual === desde) return true
    if (vistos.has(actual)) continue
    vistos.add(actual)
    pendientes.push(...(aristas.get(actual) || []))
  }
  return false
}

// Nunca se confía en la respuesta del modelo: todo se valida y se recorta.
export function sanitizarPlan(crudo, { esContinuo = false, fasesExistentes = [] } = {}) {
  const plan = crudo && typeof crudo === 'object' ? crudo : {}

  let fases = []
  if (!esContinuo) {
    const vistas = new Set()
    for (const f of Array.isArray(plan.fases) ? plan.fases : []) {
      const numero = enteroEntre(f?.numero, 1, MAX_FASES, null)
      const nombre = textoLimpio(f?.nombre, 80)
      if (!numero || !nombre || vistas.has(numero)) continue
      vistas.add(numero)
      fases.push({ numero, nombre })
    }
    for (const f of fasesExistentes) {
      if (!vistas.has(f.numero)) { vistas.add(f.numero); fases.push({ numero: f.numero, nombre: f.nombre }) }
    }
    fases.sort((a, b) => a.numero - b.numero)
    if (!fases.length) fases = [{ numero: 1, nombre: 'Plan de trabajo' }]
  }
  const numerosFase = new Set(fases.map((f) => f.numero))

  const tareas = []
  const refs = new Set()
  for (const t of (Array.isArray(plan.tareas) ? plan.tareas : []).slice(0, MAX_TAREAS)) {
    const titulo = textoLimpio(t?.titulo, 200)
    if (!titulo) continue
    let ref = typeof t.ref === 'string' || typeof t.ref === 'number' ? String(t.ref).trim().slice(0, 40) : ''
    if (!ref || refs.has(ref)) ref = `t${tareas.length + 1}-${refs.size}`
    refs.add(ref)
    const esCliente = t.esCliente === true
    const responsable = esCliente ? 'cliente' : (RESPONSABLES_PLAN.includes(t.responsable) ? t.responsable : 'equipo')
    const fase = esContinuo ? 1 : (numerosFase.has(Number(t.fase)) ? Number(t.fase) : fases[0].numero)
    const ejecutor = esCliente ? null : (t.ejecutor === 'agente' ? 'agente' : 'humano')
    const agenteSugerido = ejecutor === 'agente' ? textoLimpio(t.agenteSugerido, 40) : ''
    tareas.push({
      ref,
      titulo,
      fase,
      responsable,
      esCliente,
      descripcion: textoLimpio(t.descripcion, 2000),
      queEntregas: textoLimpio(t.queEntregas, 1000),
      instruccionesCliente: esCliente ? textoLimpio(t.instruccionesCliente, 2000) : '',
      dependencias: Array.isArray(t.dependencias) ? t.dependencias.map((d) => String(d).trim()) : [],
      duracionDias: enteroEntre(t.duracionDias, 1, 60, 1),
      ejecutor,
      ...(agenteSugerido ? { agenteSugerido } : {}),
    })
  }

  const aristas = new Map()
  for (const t of tareas) {
    const aceptadas = []
    for (const d of new Set(t.dependencias)) {
      if (d === t.ref || !refs.has(d) || creaCiclo(aristas, t.ref, d)) continue
      aceptadas.push(d)
      aristas.set(t.ref, aceptadas)
    }
    t.dependencias = aceptadas
  }

  const lista = (valor) => (Array.isArray(valor) ? valor : []).map((s) => textoLimpio(s, 500)).filter(Boolean).slice(0, 20)
  return { fases, tareas, supuestos: lista(plan.supuestos), preguntas: lista(plan.preguntas) }
}

export async function generarBorradorPlan(proyecto, usuario) {
  const alcance = proyecto.proyecto?.alcance
  if (!alcance) throw errorConStatus('Primero importa el alcance de la propuesta', 400)
  if (!(alcance.conceptos || []).some((c) => c.estado === 'incluido' || c.estado === 'confirmado')) {
    throw errorConStatus('El alcance no tiene conceptos incluidos o confirmados que planear', 400)
  }

  const [tareasExistentes, plantillas] = await Promise.all([
    prisma.tarea.findMany({ where: { proyectoId: proyecto.id }, select: { titulo: true }, orderBy: [{ fase: 'asc' }, { orden: 'asc' }] }),
    resumenPlantillas(),
  ])
  const contexto = contextoDelProyecto(proyecto, tareasExistentes, plantillas)
  const { texto, modelo } = await generarTexto({
    sistema: SISTEMA,
    mensajes: [{ role: 'user', content: `Arma el plan de trabajo de este proyecto:\n${JSON.stringify(contexto, null, 2)}` }],
    maxTokens: 12000,
  })

  const crudo = extraerJson(texto)
  if (!crudo) throw errorConStatus('La IA respondió algo que no es un plan válido — intenta de nuevo', 502)
  const plan = sanitizarPlan(crudo, { esContinuo: proyecto.tipo === 'continuo', fasesExistentes: contexto.fasesExistentes })
  if (!plan.tareas.length) throw errorConStatus('La IA no propuso ninguna tarea — intenta de nuevo', 502)

  const borradorPlan = { generadoEn: new Date().toISOString(), generadoPor: usuario, modelo, ...plan }
  // La IA puede tardar minutos: se relee el proyecto para no pisar lo que
  // cambió mientras tanto (pagos, alcance, info clave).
  const vigente = await prisma.proyecto.findUnique({ where: { id: proyecto.id }, select: { proyecto: true } })
  proyecto.proyecto = { ...(vigente?.proyecto || proyecto.proyecto), borradorPlan }
  await prisma.proyecto.update({ where: { id: proyecto.id }, data: { proyecto: proyecto.proyecto } })
  await logEntry(proyecto.id, usuario, 'Borrador de plan generado con IA', `${plan.tareas.length} tareas propuestas (${modelo})`)
  emitirCambio(proyecto.id)
  return borradorPlan
}

function esDiaHabil(fecha) {
  const dia = fecha.getUTCDay()
  return dia !== 0 && dia !== 6
}

function hoyEnMexico() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(new Date())
}

// Fecha del n-ésimo día hábil contando `inicio` como el día 1 (si cae en fin
// de semana, el día 1 es el lunes siguiente).
function diaHabil(inicio, n) {
  const fecha = new Date(`${inicio}T00:00:00Z`)
  while (!esDiaHabil(fecha)) fecha.setUTCDate(fecha.getUTCDate() + 1)
  for (let restantes = n - 1; restantes > 0;) {
    fecha.setUTCDate(fecha.getUTCDate() + 1)
    if (esDiaHabil(fecha)) restantes--
  }
  return fecha.toISOString().slice(0, 10)
}

// Camino crítico: cada tarea termina `duracionDias` hábiles después de que
// termina la última de sus dependencias. Acepta tareas con `id` o `ref`.
export function calcularFechasPlan(tareas, inicio) {
  const base = /^\d{4}-\d{2}-\d{2}$/.test(inicio || '') ? inicio : hoyEnMexico()
  const porId = new Map((tareas || []).map((t) => [String(t.id ?? t.ref), t]))
  const dias = new Map()
  const enCurso = new Set()
  function diasHasta(id) {
    if (dias.has(id)) return dias.get(id)
    if (enCurso.has(id)) return 0
    enCurso.add(id)
    const t = porId.get(id)
    const previas = (t.dependencias || []).map(String).filter((d) => porId.has(d)).map(diasHasta)
    const total = Math.max(0, ...previas) + Math.max(1, Math.round(Number(t.duracionDias) || 1))
    enCurso.delete(id)
    dias.set(id, total)
    return total
  }
  const porTarea = {}
  let maximo = 0
  for (const id of porId.keys()) {
    const total = diasHasta(id)
    porTarea[id] = diaHabil(base, total)
    maximo = Math.max(maximo, total)
  }
  return { inicio: base, porTarea, fin: maximo ? diaHabil(base, maximo) : null }
}

// Solo se llenan fechas vacías o que siguen siendo las que se calcularon la
// vez anterior (`fechasCalculadas`); una fecha que puso una persona no se toca.
function fechasEstimadasDelPlan(datos, filas) {
  const { porTarea, fin } = calcularFechasPlan(filas, datos.fechaInicio)
  if (!fin) return datos
  const previas = datos.fechasCalculadas && typeof datos.fechasCalculadas === 'object' ? datos.fechasCalculadas : {}
  const libre = (actual, calculadaAntes) => !actual || actual === calculadaAntes
  const calculadas = { entrega: previas.entrega || null, fases: { ...(previas.fases || {}) } }
  const resultado = { ...datos }

  if (libre(datos.fechaEstimadaEntrega, previas.entrega)) {
    resultado.fechaEstimadaEntrega = fin
    calculadas.entrega = fin
  }
  const finPorFase = new Map()
  for (const f of filas) {
    const fecha = porTarea[String(f.id)]
    if (fecha && (!finPorFase.has(f.fase) || fecha > finPorFase.get(f.fase))) finPorFase.set(f.fase, fecha)
  }
  resultado.fases = (datos.fases || []).map((fase) => {
    const fecha = finPorFase.get(fase.numero)
    if (!fecha || !libre(fase.fechaEstimada, calculadas.fases[fase.numero])) return fase
    calculadas.fases[fase.numero] = fecha
    return { ...fase, fechaEstimada: fecha }
  })
  resultado.fechasCalculadas = calculadas
  return resultado
}

export async function aplicarBorradorPlan(proyecto, { excluirRefs = [] } = {}, usuario) {
  // Todo dentro de una transacción con la fila bloqueada: dos "aplicar" al
  // mismo tiempo (panel y MCP) no deben crear las tareas dos veces.
  const { filas, datosProyecto } = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT 1 FROM "proyectos" WHERE id = ${proyecto.id} FOR UPDATE`
    const actual = await tx.proyecto.findUnique({ where: { id: proyecto.id }, include: { tareas: true } })
    const borrador = actual?.proyecto?.borradorPlan
    if (!borrador) throw errorConStatus('No hay un borrador de plan para aplicar', 400)

    const excluidas = new Set((Array.isArray(excluirRefs) ? excluirRefs : []).map(String))
    const elegidas = borrador.tareas.filter((t) => !excluidas.has(t.ref))
    if (!elegidas.length) throw errorConStatus('No quedan tareas por crear — quitaste todas del borrador', 400)

    const esContinuo = actual.tipo === 'continuo'
    const idPorRef = new Map(elegidas.map((t) => [t.ref, randomUUID()]))

    let fases = actual.proyecto?.fases || []
    if (!esContinuo) {
      const existentes = new Set(fases.map((f) => f.numero))
      const nuevas = borrador.fases.filter((f) => !existentes.has(f.numero))
      if (nuevas.length) fases = [...fases, ...nuevas].sort((a, b) => a.numero - b.numero)
    }

    const siguienteOrden = new Map()
    const filas = elegidas.map((t) => {
      const fase = esContinuo ? 1 : t.fase
      const orden = siguienteOrden.has(fase)
        ? siguienteOrden.get(fase)
        : ordenAlFinal(actual.tareas.filter((x) => x.fase === fase))
      siguienteOrden.set(fase, orden + 1)
      return {
        id: idPorRef.get(t.ref),
        proyectoId: actual.id,
        fase,
        orden,
        titulo: t.titulo,
        responsable: t.esCliente ? 'cliente' : t.responsable,
        esCliente: t.esCliente,
        descripcion: t.descripcion || '',
        queEntregas: t.queEntregas || '',
        queHacer: t.agenteSugerido ? `Agente sugerido: ${t.agenteSugerido}` : '',
        instruccionesCliente: t.instruccionesCliente || '',
        dependencias: t.dependencias.filter((d) => idPorRef.has(d)).map((d) => idPorRef.get(d)),
        ejecutor: t.ejecutor,
        duracionDias: t.duracionDias,
        // Sin plantilla detrás: se pueden borrar a mano si sobran.
        custom: true,
        estado: 'pendiente',
      }
    })

    const { borradorPlan: _descartado, ...resto } = actual.proyecto
    const datosProyecto = esContinuo ? resto : fechasEstimadasDelPlan({ ...resto, fases }, filas)
    await tx.tarea.createMany({ data: filas })
    await tx.proyecto.update({ where: { id: actual.id }, data: { proyecto: datosProyecto } })
    return { filas, datosProyecto }
  })
  proyecto.proyecto = datosProyecto
  await activarTareasClienteDisponibles(proyecto.id)
  await logEntry(proyecto.id, usuario, 'Plan aplicado desde borrador IA', `${filas.length} tareas`)
  emitirCambio(proyecto.id)
  return { creadas: filas.length }
}

export async function descartarBorradorPlan(proyecto, usuario) {
  if (!proyecto.proyecto?.borradorPlan) throw errorConStatus('No hay un borrador de plan', 404)
  const { borradorPlan: _descartado, ...resto } = proyecto.proyecto
  proyecto.proyecto = resto
  await prisma.proyecto.update({ where: { id: proyecto.id }, data: { proyecto: resto } })
  await logEntry(proyecto.id, usuario, 'Borrador de plan descartado')
  emitirCambio(proyecto.id)
}
