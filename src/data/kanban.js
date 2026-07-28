// Espejo de server/src/lib/kanban.js — mapeo entre el `estado` de una Tarea
// y la columna del tablero Kanban que usan los proyectos de tipo "continuo".
export const KANBAN_COLUMNAS = [
  { estado: 'pendiente', columna: 'todo', label: 'Todo' },
  { estado: 'en_proceso', columna: 'doing', label: 'Doing' },
  { estado: 'revision', columna: 'revision', label: 'Revisión' },
  { estado: 'completada', columna: 'done', label: 'Done' },
]

export function columnaDeEstado(estado) {
  return KANBAN_COLUMNAS.find((c) => c.estado === estado)?.columna || null
}

export function estadoDeColumna(columna) {
  return KANBAN_COLUMNAS.find((c) => c.columna === columna)?.estado || null
}

export function agruparPorColumna(proyecto) {
  const tareas = proyecto.tareas.filter((t) => !t.esCliente && t.estado !== 'omitida')
  return Object.fromEntries(
    KANBAN_COLUMNAS.map((c) => [
      c.columna,
      tareas.filter((t) => t.estado === c.estado).sort((a, b) => a.orden - b.orden),
    ]),
  )
}

export function contarPorColumna(proyecto) {
  const agrupado = agruparPorColumna(proyecto)
  return Object.fromEntries(KANBAN_COLUMNAS.map((c) => [c.columna, agrupado[c.columna].length]))
}
