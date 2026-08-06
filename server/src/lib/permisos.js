// Reglas de "quién puede operar qué tarea" según el equipo asignado al
// proyecto (proyecto.equipo: { copy, disenador, programador, adminProyecto },
// valores userId|null). Duplicado (no importado) en src/lib/permisos.js del
// frontend porque frontend y backend se despliegan como apps separadas en Coolify.

// Sentinel para "este rol no aplica en este proyecto" — ver src/lib/permisos.js (frontend).
export const EQUIPO_NO_APLICA = 'no_aplica'
export const ROLES_EQUIPO = ['copy', 'disenador', 'programador', 'adminProyecto']

export function usuarioParticipaEnProyecto(equipo, userId) {
  if (!equipo || !userId) return false
  return [equipo.copy, equipo.disenador, equipo.programador, equipo.adminProyecto].includes(userId)
}

// user: req.user del JWT — { id, rol: 'ADMIN'|'EQUIPO', esKarla }
export function tareaLeCorresponde(tarea, equipo, user) {
  if (!user) return false
  if (user.rol === 'ADMIN') return true

  const { responsable } = tarea
  if (responsable === 'admin' || responsable === 'cliente') return false
  if (responsable === 'karla') return !!user.esKarla
  if (!usuarioParticipaEnProyecto(equipo, user.id)) return false
  if (responsable === 'equipo') return true
  return equipo?.[responsable] === user.id // copy | disenador | programador
}
