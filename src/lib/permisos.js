// Reglas de "quién puede ver/operar qué tarea" según el equipo asignado al
// proyecto (proyecto.equipo: { copy, disenador, programador, redes, adminProyecto },
// cada valor un array de userId — o el sentinel EQUIPO_NO_APLICA). Duplicado
// (no importado) en server/src/lib/permisos.js porque frontend y backend se
// despliegan como apps separadas en Coolify.

// Sentinel para "este rol no aplica en este proyecto" (ej. sin programador
// porque es un sitio estático) — se distingue de array vacío ("por asignar,
// falta decidir"), pero para efectos de permisos ambos son "nadie".
export const EQUIPO_NO_APLICA = 'no_aplica'

export const ROLES_EQUIPO = ['copy', 'disenador', 'programador', 'redes', 'adminProyecto']

// Normaliza el valor de un rol de equipo a un array de userIds — acepta el
// shape legado (un solo userId como string, de antes de permitir varias
// personas por rol) y el shape actual (array).
export function idsDeRol(equipo, rol) {
  const v = equipo?.[rol]
  if (Array.isArray(v)) return v.filter((id) => id && id !== EQUIPO_NO_APLICA)
  return v && v !== EQUIPO_NO_APLICA ? [v] : []
}

export function usuarioParticipaEnProyecto(equipo, userId) {
  if (!equipo || !userId) return false
  return ROLES_EQUIPO.some((rol) => idsDeRol(equipo, rol).includes(userId))
}

// Valores de `responsable` que son roles (se resuelven contra proyecto.equipo
// o son especiales). Cualquier otro valor se trata como el userId de una
// persona específica del equipo, asignada directamente a la tarea.
const ROLES_RESPONSABLE = ['equipo', 'copy', 'disenador', 'programador', 'redes']

// user: { id, rol ('admin'|'ADMIN'|'equipo'|'EQUIPO'), esKarla }
export function tareaLeCorresponde(tarea, equipo, user) {
  if (!user) return false
  if (user.rol === 'admin' || user.rol === 'ADMIN') return true

  const { responsable } = tarea
  if (responsable === 'admin' || responsable === 'cliente') return false
  if (responsable === 'karla') return !!user.esKarla
  if (!ROLES_RESPONSABLE.includes(responsable)) return responsable === user.id // asignación directa a una persona
  if (!usuarioParticipaEnProyecto(equipo, user.id)) return false
  if (responsable === 'equipo') return true
  return idsDeRol(equipo, responsable).includes(user.id) // copy | disenador | programador | redes
}

// Para bandejas personales tipo "Mis tareas": a diferencia de tareaLeCorresponde
// (que da acceso total a cualquier admin, porque sirve para AUTORIZAR operaciones),
// esta solo dice si la tarea está asignada directamente a esa persona — útil para
// que un admin vea en su bandeja solo lo suyo, no todas las tareas del sistema.
export function tareaAsignadaDirectamente(tarea, userId) {
  return tarea.responsable === userId
}

export const RESPONSABLE_LABEL = {
  copy: 'Copy',
  disenador: 'Diseño',
  programador: 'Programación',
  redes: 'Redes',
  equipo: 'Equipo',
  karla: 'QA',
  admin: 'Admin',
}

// Resuelve cómo mostrar el responsable de una tarea: si es un rol (copy,
// equipo...) usa su label + el nombre de quien ocupa ese rol en el proyecto
// (solo si es una sola persona — con varias, "nombre" queda null porque no
// hay una persona clara todavía, igual que un rol sin nadie asignado); si
// `responsable` no es un rol reconocido, se asume que es el userId de una
// persona asignada directamente (ver tareaLeCorresponde).
export function infoResponsable(tarea, equipo, miembrosPorId = {}) {
  const { responsable } = tarea
  if (responsable === 'copy' || responsable === 'disenador' || responsable === 'programador' || responsable === 'redes') {
    const ids = idsDeRol(equipo, responsable)
    return { label: RESPONSABLE_LABEL[responsable], nombre: ids.length === 1 ? miembrosPorId[ids[0]] : null }
  }
  if (RESPONSABLE_LABEL[responsable]) return { label: RESPONSABLE_LABEL[responsable], nombre: null }
  // responsable es un userId (asignación directa): si no podemos resolver el
  // nombre (p. ej. en el portal del cliente, que no recibe miembrosPorId) no
  // mostramos el id crudo — degradamos a la etiqueta genérica de "Equipo".
  const nombre = miembrosPorId[responsable]
  return { label: nombre || 'Equipo', nombre: nombre || null }
}

// Miembros del sistema que están asignados al equipo de este proyecto
// (copy/diseñador/programador/redes/adminProyecto) — usado para poblar
// selectores de "Responsable" limitados a quien ya participa en el proyecto.
export function miembrosDelEquipo(equipo, miembros) {
  const ids = new Set(ROLES_EQUIPO.flatMap((rol) => idsDeRol(equipo, rol)))
  return miembros.filter((m) => ids.has(m.id))
}
