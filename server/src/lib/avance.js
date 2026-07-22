export function calcularAvance(proyecto) {
  const tareas = proyecto.tareas.filter((t) => !t.opcional && t.estado !== 'omitida')
  if (!tareas.length) return 0
  const completadas = tareas.filter((t) => t.estado === 'completada').length
  return Math.round((completadas / tareas.length) * 100)
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
