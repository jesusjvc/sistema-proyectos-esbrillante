// Reglas de "quién puede operar qué tarea" según el equipo asignado al
// proyecto (proyecto.equipo: { copy, disenador, programador, adminProyecto },
// valores userId|null). Duplicado (no importado) en src/lib/permisos.js del
// frontend porque frontend y backend se despliegan como apps separadas en Coolify.

// Sentinel para "este rol no aplica en este proyecto" — ver src/lib/permisos.js (frontend).
export const EQUIPO_NO_APLICA = 'no_aplica'
export const ROLES_EQUIPO = ['copy', 'disenador', 'programador', 'adminProyecto']

// Valores de `responsable` que son roles (se resuelven contra proyecto.equipo
// o son especiales). Cualquier otro valor se trata como el userId de una
// persona específica del equipo, asignada directamente a la tarea.
const ROLES_RESPONSABLE = ['equipo', 'copy', 'disenador', 'programador']

// Valida que los userIds pasados en `equipo` (para cualquiera de ROLES_EQUIPO)
// existan como User reales, y devuelve el objeto normalizado con las 4 claves
// completas (null para las que no se pasaron). Lanza con err.status=400 si
// algún id no es válido. Usado por PUT /api/proyectos/:slug/equipo y por el
// tool MCP crear_proyecto.
export async function validarYNormalizarEquipo(prisma, equipo) {
  const idsAValidar = ROLES_EQUIPO
    .map((rol) => equipo?.[rol])
    .filter((v) => v && v !== EQUIPO_NO_APLICA)

  if (idsAValidar.length) {
    const encontrados = await prisma.user.findMany({ where: { id: { in: idsAValidar } }, select: { id: true } })
    if (encontrados.length !== new Set(idsAValidar).size) {
      const err = new Error('Uno o más miembros de equipo no son válidos')
      err.status = 400
      throw err
    }
  }

  return Object.fromEntries(ROLES_EQUIPO.map((rol) => [rol, equipo?.[rol] ?? null]))
}

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
  if (!ROLES_RESPONSABLE.includes(responsable)) return responsable === user.id // asignación directa a una persona
  if (!usuarioParticipaEnProyecto(equipo, user.id)) return false
  if (responsable === 'equipo') return true
  return equipo?.[responsable] === user.id // copy | disenador | programador
}
