// Reglas de "quién puede ver/operar qué tarea" según el equipo asignado al
// proyecto (proyecto.equipo: { copy, disenador, programador, adminProyecto },
// valores userId|null). Duplicado (no importado) en server/src/lib/permisos.js
// porque frontend y backend se despliegan como apps separadas en Coolify.

// Sentinel para "este rol no aplica en este proyecto" (ej. sin programador
// porque es un sitio estático) — se distingue de null ("por asignar, falta
// decidir"), pero para efectos de permisos ambos son "nadie".
export const EQUIPO_NO_APLICA = 'no_aplica'

export function usuarioParticipaEnProyecto(equipo, userId) {
  if (!equipo || !userId) return false
  return [equipo.copy, equipo.disenador, equipo.programador, equipo.adminProyecto].includes(userId)
}

// user: { id, rol ('admin'|'ADMIN'|'equipo'|'EQUIPO'), esKarla }
export function tareaLeCorresponde(tarea, equipo, user) {
  if (!user) return false
  if (user.rol === 'admin' || user.rol === 'ADMIN') return true

  const { responsable } = tarea
  if (responsable === 'admin' || responsable === 'cliente') return false
  if (responsable === 'karla') return !!user.esKarla
  if (!usuarioParticipaEnProyecto(equipo, user.id)) return false
  if (responsable === 'equipo') return true
  return equipo?.[responsable] === user.id // copy | disenador | programador
}

export const RESPONSABLE_LABEL = {
  copy: 'Copy',
  disenador: 'Diseño',
  programador: 'Programación',
  equipo: 'Equipo',
  karla: 'QA',
  admin: 'Admin',
}
