export function calcularAvance(proyecto) {
  const tareas = proyecto.tareas.filter((t) => !t.opcional && t.estado !== 'omitida')
  if (!tareas.length) return 0
  const completadas = tareas.filter((t) => t.estado === 'completada').length
  return Math.round((completadas / tareas.length) * 100)
}

export function contarPendientesCliente(proyecto) {
  return idsTareasClienteDisponibles(proyecto).size
}

// Una fase con requierePago sin pagoConfirmado detiene todo desde ella: el
// cliente no debe ver tareas de esa fase ni de las siguientes.
function primeraFaseSinPago(proyecto) {
  const bloqueadas = (proyecto.proyecto?.fases || [])
    .filter((f) => f.requierePago && !f.pagoConfirmado)
    .map((f) => f.numero)
  return bloqueadas.length ? Math.min(...bloqueadas) : null
}

// Tareas que el cliente puede hacer HOY. Las dependencias no bastan: una
// tarea de una fase futura sin dependencias (ej. "revisar el diseño") no le
// toca mientras el proyecto no llegue a esa fase, siga sin anticipo o tenga
// un pago de fase pendiente. En pausa SÍ se muestran: la pausa se usa
// justamente cuando el proyecto espera algo del cliente.
// Duplicada en src/data/storage.js — si cambia aquí, cambiarla allá igual.
export function idsTareasClienteDisponibles(proyecto) {
  const disponibles = new Set()
  if (proyecto.status !== 'activo' && proyecto.status !== 'en_pausa') return disponibles
  const tareas = proyecto.tareas || []
  const completadas = new Set(tareas.filter((t) => t.estado === 'completada').map((t) => t.id))
  const esContinuo = proyecto.tipo === 'continuo'
  const faseActual = esContinuo ? null : getFaseActual(proyecto)
  const faseSinPago = esContinuo ? null : primeraFaseSinPago(proyecto)
  for (const t of tareas) {
    if (!t.esCliente || t.estado === 'completada' || t.estado === 'omitida') continue
    if (!(t.dependencias || []).every((d) => completadas.has(d))) continue
    if (!esContinuo) {
      if (t.fase > faseActual) continue
      if (faseSinPago !== null && t.fase >= faseSinPago) continue
    }
    disponibles.add(t.id)
  }
  return disponibles
}

// true si el cliente hizo algo (completó una tarea, respondió) después de la
// última vez que el admin abrió el detalle del proyecto.
export function tieneRespuestaNueva(proyecto) {
  const log = proyecto.log || []
  if (!log.length) return false
  const vistoEn = proyecto.vistoAdminEn ? new Date(proyecto.vistoAdminEn) : null
  return log.some((l) => l.usuario === 'Cliente' && (!vistoEn || new Date(l.fecha) > vistoEn))
}

export function getFaseActual(proyecto) {
  const tareas = proyecto.tareas
  const totalFases = proyecto.proyecto?.fases?.length || 7

  for (let fase = 1; fase <= totalFases; fase++) {
    const tareasF = tareas.filter((t) => t.fase === fase && t.estado !== 'omitida')
    if (tareasF.length === 0) {
      // Una fase sin tareas todavía no cuenta como completada — evita saltar
      // de largo a la última fase en proyectos con checklist vacío (ej. los
      // que arma el MCP con actividades libres en vez de un paquete
      // predefinido). Pero si ya hay actividad registrada en una fase
      // posterior, esta fase claramente quedó atrás aunque nunca se haya
      // llevado su checklist en el sistema — no debe bloquear el avance.
      const hayActividadDespues = tareas.some((t) => t.fase > fase && t.estado !== 'omitida')
      if (hayActividadDespues) continue
      return fase
    }
    const completa = tareasF.every((t) => t.estado === 'completada')
    if (!completa) return fase
  }
  return totalFases
}
