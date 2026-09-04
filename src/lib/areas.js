// Áreas de trabajo de EsBrillante — lista fija por ahora. Un usuario tiene
// una sola área (a la que pertenece); un proyecto puede tener varias (los
// proyectos integrales cruzan las 3). Duplicado (no importado) en
// server/src/lib/areas.js porque frontend y backend se despliegan como apps
// separadas en Coolify.
export const AREAS = [
  { valor: 'web', label: 'Web', color: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300' },
  { valor: 'diseno_grafico', label: 'Diseño Gráfico', color: 'bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300' },
  { valor: 'redes_sociales', label: 'Redes Sociales', color: 'bg-pink-100 text-pink-700 dark:bg-pink-500/15 dark:text-pink-300' },
]

export const AREA_LABEL = Object.fromEntries(AREAS.map((a) => [a.valor, a.label]))
export const AREA_COLOR = Object.fromEntries(AREAS.map((a) => [a.valor, a.color]))
