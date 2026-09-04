export const ESTADO_CONFIG = {
  en_revision: { label: 'En revisión', className: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300' },
  pendiente_equipo: { label: 'Requiere atención', className: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300' },
  aprobado: { label: 'Aprobado', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' },
}

export const ESTADO_OPCIONES = [
  ['en_revision', 'En revisión'],
  ['pendiente_equipo', 'Requiere atención'],
  ['aprobado', 'Aprobado'],
]
