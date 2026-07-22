// Calcula la posición (campo `orden`, float) de una tarea nueva dentro de su fase,
// sin necesidad de renumerar las demás — insertar es siempre el punto medio entre
// sus dos vecinas.

export function ordenAlFinal(tareasDeLaFase) {
  if (!tareasDeLaFase.length) return 0
  return Math.max(...tareasDeLaFase.map((t) => t.orden)) + 1
}

export function ordenAntesDe(tareasDeLaFaseOrdenadas, tareaObjetivo) {
  const idx = tareasDeLaFaseOrdenadas.findIndex((t) => t.id === tareaObjetivo.id)
  const anterior = tareasDeLaFaseOrdenadas[idx - 1]
  return anterior ? (anterior.orden + tareaObjetivo.orden) / 2 : tareaObjetivo.orden - 1
}

export function ordenDespuesDe(tareasDeLaFaseOrdenadas, tareaObjetivo) {
  const idx = tareasDeLaFaseOrdenadas.findIndex((t) => t.id === tareaObjetivo.id)
  const siguiente = tareasDeLaFaseOrdenadas[idx + 1]
  return siguiente ? (tareaObjetivo.orden + siguiente.orden) / 2 : tareaObjetivo.orden + 1
}
