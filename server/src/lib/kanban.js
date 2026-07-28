// Mapeo entre el `estado` de una Tarea y la columna del tablero Kanban que
// usan los proyectos de tipo "continuo" (servicios recurrentes sin fases).
// `fase` no se usa para nada en estos proyectos — todas sus tareas quedan
// con fase=1, y la columna real vive en `estado`.
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

// Tarjetas del tablero: excluye tareas del cliente (esas siguen su propio
// flujo de "Necesitamos tu respuesta") y las omitidas/canceladas.
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
