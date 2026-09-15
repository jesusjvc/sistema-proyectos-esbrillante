// Reglas de "quién puede operar qué tarea" según el equipo asignado al
// proyecto (proyecto.equipo: { copy, disenador, programador, redes, adminProyecto },
// cada valor un array de userId — o el sentinel EQUIPO_NO_APLICA). Duplicado
// (no importado) en src/lib/permisos.js del frontend porque frontend y
// backend se despliegan como apps separadas en Coolify.

// Sentinel para "este rol no aplica en este proyecto" — ver src/lib/permisos.js (frontend).
export const EQUIPO_NO_APLICA = 'no_aplica'
export const ROLES_EQUIPO = ['copy', 'disenador', 'programador', 'redes', 'adminProyecto']

// Valores de `responsable` que son roles (se resuelven contra proyecto.equipo
// o son especiales). Cualquier otro valor se trata como el userId de una
// persona específica del equipo, asignada directamente a la tarea.
const ROLES_RESPONSABLE = ['equipo', 'copy', 'disenador', 'programador', 'redes']

// Normaliza el valor de un rol de equipo a un array de userIds — acepta el
// shape legado (un solo userId como string, de antes de permitir varias
// personas por rol) y el shape actual (array). EQUIPO_NO_APLICA se trata
// como "sin nadie" para efectos de pertenencia/permisos.
export function idsDeRol(equipo, rol) {
  const v = equipo?.[rol]
  if (Array.isArray(v)) return v.filter((id) => id && id !== EQUIPO_NO_APLICA)
  return v && v !== EQUIPO_NO_APLICA ? [v] : []
}

// Valida que los userIds pasados en `equipo` (para cualquiera de ROLES_EQUIPO)
// existan como User reales, y devuelve el objeto normalizado (array por rol,
// o EQUIPO_NO_APLICA si así se pasó). Lanza con err.status=400 si algún id no
// es válido. Usado por PUT /api/proyectos/:slug/equipo y por el tool MCP
// crear_proyecto.
export async function validarYNormalizarEquipo(prisma, equipo) {
  const normalizado = {}
  const idsAValidar = []

  for (const rol of ROLES_EQUIPO) {
    const v = equipo?.[rol]
    if (v === EQUIPO_NO_APLICA) {
      normalizado[rol] = EQUIPO_NO_APLICA
      continue
    }
    const ids = idsDeRol({ [rol]: v }, rol)
    normalizado[rol] = ids
    idsAValidar.push(...ids)
  }

  if (idsAValidar.length) {
    const unicos = [...new Set(idsAValidar)]
    const encontrados = await prisma.user.findMany({ where: { id: { in: unicos } }, select: { id: true } })
    if (encontrados.length !== unicos.length) {
      const err = new Error('Uno o más miembros de equipo no son válidos')
      err.status = 400
      throw err
    }
  }

  return normalizado
}

export function usuarioParticipaEnProyecto(equipo, userId) {
  if (!equipo || !userId) return false
  return ROLES_EQUIPO.some((rol) => idsDeRol(equipo, rol).includes(userId))
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
  return idsDeRol(equipo, responsable).includes(user.id) // copy | disenador | programador | redes
}
