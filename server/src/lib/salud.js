// Clasificación de "salud" de un proyecto: avanza normal, está atrasado
// (tareas del cliente con plazo vencido, o del equipo con fecha límite
// pasada) o estancado (sin movimiento reciente). Se calcula aquí en el
// server —fuente única— y se expone tal cual en la API y en el MCP; el
// frontend solo la muestra.

import { idsDeRol } from './permisos.js'
import { calcularAvance } from './avance.js'
import { contarPorColumna } from './kanban.js'

const HORA_MS = 3600_000
const DIA_MS = 24 * HORA_MS

// Días sin movimiento (log, completados, comentarios) para marcar un
// proyecto activo como estancado.
export const DIAS_INACTIVIDAD = 7

const ROLES_CON_PERSONA = ['copy', 'disenador', 'programador', 'redes']

// Tarea "al aire": sin responsable específico ("equipo" = cualquiera, o sea
// nadie en particular), o con un rol puntual que no tiene ninguna persona
// cubriéndolo en el equipo del proyecto (ej. responsable "copy" pero el
// proyecto no tiene copy).
function sinDueno(t, equipo) {
  if (t.responsable === 'equipo') return true
  if (ROLES_CON_PERSONA.includes(t.responsable)) return idsDeRol(equipo, t.responsable).length === 0
  return false
}

// Una tarea del cliente venció si sigue pendiente y ya pasó su plazoHoras
// desde que quedó disponible. Es la misma regla con la que el job de
// recordatorios avisa al cliente — esta es la fuente única de verdad.
export function tareaClienteVencida(t, ahora = Date.now()) {
  return t.esCliente && t.estado === 'pendiente' && t.disponibleDesde && t.plazoHoras
    && (ahora - new Date(t.disponibleDesde).getTime()) > t.plazoHoras * HORA_MS
}

const ESTADOS_ACTIVOS_EQUIPO = ['pendiente', 'en_proceso', 'revision']

function inicioDelDia(ts) {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

// Última señal de vida del proyecto: la entrada de log más reciente (el log
// llega ordenado desc, basta ver la primera), la última tarea completada y
// el último comentario de tarea. Si nunca hubo nada, se cae a creadoEn.
function ultimaActividad(proyecto) {
  let ultima = null
  const considerar = (fecha) => {
    if (!fecha) return
    const ts = new Date(fecha).getTime()
    if (!Number.isNaN(ts) && (!ultima || ts > ultima)) ultima = ts
  }
  considerar(proyecto.log?.[0]?.fecha)
  for (const t of proyecto.tareas || []) {
    considerar(t.completadaEn)
    for (const c of t.comentarios || []) considerar(c.creadoEn)
  }
  return ultima ?? (proyecto.creadoEn ? new Date(proyecto.creadoEn).getTime() : null)
}

function plural(n, singular, pluralizado) {
  return n === 1 ? singular : pluralizado
}

function listarTitulos(tareas, max = 3) {
  const visibles = tareas.slice(0, max).map((t) => `"${t.titulo}"`).join(', ')
  return tareas.length > max ? `${visibles} y ${tareas.length - max} más` : visibles
}

function formatoAtraso(ms) {
  const horas = Math.floor(ms / HORA_MS)
  if (horas < 24) return `${Math.max(horas, 1)} h`
  const dias = Math.floor(horas / 24)
  return `${dias} ${plural(dias, 'día', 'días')}`
}

function armar({ nivel, motivos, ultimaActividad, diasSinActividad, tareasEquipoSinFecha, tareasEquipoSinResponsable, resumen }) {
  return { nivel, motivos, ultimaActividad, diasSinActividad, tareasEquipoSinFecha, tareasEquipoSinResponsable, resumen }
}

export function calcularSalud(proyecto, { ahora = Date.now() } = {}) {
  if (proyecto.status !== 'activo') {
    return { nivel: null, motivos: [], ultimaActividad: null, diasSinActividad: null, tareasEquipoSinFecha: 0, tareasEquipoSinResponsable: 0, resumen: '' }
  }

  const tareas = proyecto.tareas || []

  // Proyecto "completo": terminó sus actividades y sigue abierto esperando
  // cierre (VoBo del cliente, pago final, trámite de dominio...). Va antes
  // que atraso/estancado porque no queda nada pendiente que pudiera atrasar:
  // finitos al 100% de avance; continuos con TODO en Done (y al menos una
  // tarjeta, para no marcar servicios recién abiertos y vacíos).
  if (proyecto.tipo === 'continuo') {
    const c = contarPorColumna(proyecto)
    if ((c.todo + c.doing + c.revision) === 0 && c.done > 0) {
      const ultima = ultimaActividad(proyecto)
      return armar({
        nivel: 'completo',
        motivos: [],
        ultimaActividad: ultima === null ? null : new Date(ultima).toISOString(),
        diasSinActividad: ultima === null ? null : Math.floor((ahora - ultima) / DIA_MS),
        tareasEquipoSinFecha: 0,
        tareasEquipoSinResponsable: 0,
        resumen: 'Completo — todas las tarjetas están en Done, esperando cierre',
      })
    }
  } else if (calcularAvance(proyecto) === 100) {
    const ultima = ultimaActividad(proyecto)
    return armar({
      nivel: 'completo',
      motivos: [],
      ultimaActividad: ultima === null ? null : new Date(ultima).toISOString(),
      diasSinActividad: ultima === null ? null : Math.floor((ahora - ultima) / DIA_MS),
      tareasEquipoSinFecha: 0,
      tareasEquipoSinResponsable: 0,
      resumen: 'Completo — 100% de actividades, esperando cierre',
    })
  }

  const vencidasCliente = tareas.filter((t) => tareaClienteVencida(t, ahora))
  const idsVencidas = new Set(vencidasCliente.map((t) => t.id))
  // Esperando al cliente: la pelota está en la cancha del cliente (la tarea
  // ya quedó disponible, sin dependencias por completar) y todavía no
  // responde — cuenta aunque no tenga plazo o esté dentro de él.
  const esperandoCliente = tareas.filter((t) =>
    t.esCliente && t.estado === 'pendiente' && t.disponibleDesde && !idsVencidas.has(t.id))
  const vencidasEquipo = tareas.filter((t) =>
    !t.esCliente && ESTADOS_ACTIVOS_EQUIPO.includes(t.estado) && t.fechaLimite
    && new Date(t.fechaLimite).getTime() < inicioDelDia(ahora))
  const tareasEquipoSinFecha = tareas.filter((t) =>
    !t.esCliente && ESTADOS_ACTIVOS_EQUIPO.includes(t.estado) && !t.fechaLimite).length
  const sinResponsable = tareas.filter((t) =>
    !t.esCliente && ESTADOS_ACTIVOS_EQUIPO.includes(t.estado) && sinDueno(t, proyecto.equipo))

  const ultima = ultimaActividad(proyecto)
  const diasSinActividad = ultima === null ? null : Math.floor((ahora - ultima) / DIA_MS)

  const motivos = []
  if (vencidasCliente.length) {
    const atrasoMax = Math.max(...vencidasCliente.map((t) =>
      ahora - (new Date(t.disponibleDesde).getTime() + t.plazoHoras * HORA_MS)))
    motivos.push({
      tipo: 'cliente_vencido',
      detalle: `${vencidasCliente.length} ${plural(vencidasCliente.length, 'tarea', 'tareas')} de cliente vencida${vencidasCliente.length === 1 ? '' : 's'}: ${listarTitulos(vencidasCliente)} (${formatoAtraso(atrasoMax)} de atraso)`,
      dias: Math.floor(atrasoMax / DIA_MS),
      tareaIds: vencidasCliente.map((t) => t.id),
    })
  }
  if (vencidasEquipo.length) {
    const diasMax = Math.max(...vencidasEquipo.map((t) =>
      Math.round((inicioDelDia(ahora) - inicioDelDia(new Date(t.fechaLimite).getTime())) / DIA_MS)))
    motivos.push({
      tipo: 'equipo_vencido',
      detalle: `${vencidasEquipo.length} ${plural(vencidasEquipo.length, 'tarea', 'tareas')} del equipo con fecha vencida: ${listarTitulos(vencidasEquipo)} (la más antigua hace ${diasMax} ${plural(diasMax, 'día', 'días')})`,
      dias: diasMax,
      tareaIds: vencidasEquipo.map((t) => t.id),
    })
  }
  if (diasSinActividad !== null && diasSinActividad >= DIAS_INACTIVIDAD) {
    motivos.push({
      tipo: 'inactividad',
      detalle: `Sin actividad hace ${diasSinActividad} ${plural(diasSinActividad, 'día', 'días')}`,
      dias: diasSinActividad,
      tareaIds: [],
    })
  }
  if (esperandoCliente.length) {
    motivos.push({
      tipo: 'cliente_esperando',
      detalle: `Esperando respuesta del cliente: ${listarTitulos(esperandoCliente)}`,
      dias: null,
      tareaIds: esperandoCliente.map((t) => t.id),
    })
  }
  if (tareasEquipoSinFecha > 0) {
    motivos.push({
      tipo: 'equipo_sin_fechas',
      detalle: `${tareasEquipoSinFecha} ${plural(tareasEquipoSinFecha, 'tarea', 'tareas')} del equipo sin fecha límite — definir cuándo quedarían`,
      dias: null,
      tareaIds: [],
    })
  }
  if (sinResponsable.length) {
    motivos.push({
      tipo: 'equipo_sin_responsable',
      detalle: `${sinResponsable.length} ${plural(sinResponsable.length, 'tarea', 'tareas')} sin responsable asignado: ${listarTitulos(sinResponsable)} — nadie las tiene en su bandeja`,
      dias: null,
      tareaIds: sinResponsable.map((t) => t.id),
    })
  }

  const hayAtraso = vencidasCliente.length > 0 || vencidasEquipo.length > 0
  const nivel = hayAtraso ? 'atrasado' : (diasSinActividad !== null && diasSinActividad >= DIAS_INACTIVIDAD) ? 'estancado' : 'avanza'

  const criticos = motivos.filter((m) => ['cliente_vencido', 'equipo_vencido', 'inactividad'].includes(m.tipo))
  let resumen
  if (nivel === 'atrasado') resumen = `Atrasado: ${criticos.map((m) => m.detalle).join(' · ')}`
  else if (nivel === 'estancado') resumen = `Estancado: ${criticos.map((m) => m.detalle).join(' · ')}`
  else if (esperandoCliente.length) resumen = `En curso — esperando al cliente: ${listarTitulos(esperandoCliente)}`
  else resumen = 'En curso, sin obstáculos'

  return armar({
    nivel,
    motivos,
    ultimaActividad: ultima === null ? null : new Date(ultima).toISOString(),
    diasSinActividad,
    tareasEquipoSinFecha,
    tareasEquipoSinResponsable: sinResponsable.length,
    resumen,
  })
}
