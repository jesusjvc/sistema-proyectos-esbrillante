export function calcularAvance(proyecto) {
  const tareas = proyecto.tareas.filter((t) => !t.opcional && t.estado !== 'omitida')
  if (!tareas.length) return 0
  const completadas = tareas.filter((t) => t.estado === 'completada').length
  return Math.round((completadas / tareas.length) * 100)
}

export function contarPendientesCliente(proyecto) {
  return proyecto.tareas.filter((t) => t.esCliente && t.estado === 'pendiente').length
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
    // Una fase sin tareas todavía no cuenta como completada — evita saltar
    // de largo a la última fase en proyectos con checklist vacío (ej. los
    // que arma el MCP con actividades libres en vez de un paquete predefinido).
    const completa = tareasF.length > 0 && tareasF.every((t) => t.estado === 'completada')
    if (!completa) return fase
  }
  return totalFases
}
