import prisma from './prisma.js'

const MAX_INTENTOS_NUMERO = 5
const ESTADOS_ANOTACION = new Set(['pendiente', 'resuelto'])

export async function listarAnotaciones(prototipoId, estado) {
  return prisma.anotacion.findMany({
    where: { prototipoId, ...(estado && estado !== 'todos' ? { estado } : {}) },
    orderBy: { numero: 'asc' },
  })
}

// El número de orden se asigna dentro de una transacción (max+1) y se reintenta
// ante choque de unicidad — dos escritores concurrentes (widget, SSE, tool MCP)
// pueden leer el mismo máximo antes de que ninguno confirme (hallazgo de review
// de la tarea 1: @@unique([prototipoId, numero]) rechaza al segundo, este retry
// lo reubica en vez de hacer fallar la anotación.
export async function crearAnotacion(prototipoId, data) {
  for (let intento = 0; intento < MAX_INTENTOS_NUMERO; intento++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const { _max } = await tx.anotacion.aggregate({ where: { prototipoId }, _max: { numero: true } })
        return tx.anotacion.create({
          data: {
            prototipoId,
            numero: (_max.numero ?? 0) + 1,
            tipo: data.tipo,
            rol: data.rol,
            autor: data.autor,
            selector: data.selector,
            pagina: data.pagina || '/',
            posicion: data.posicion ?? {},
            contenido: data.contenido ?? {},
          },
        })
      })
    } catch (err) {
      if (err.code === 'P2002' && intento < MAX_INTENTOS_NUMERO - 1) continue
      throw err
    }
  }
}

// El merge de `contenido` se hace dentro del propio UPDATE (operador jsonb ||
// de Postgres) en vez de leer-mezclar-escribir en JS — un read-then-write
// normal pierde cambios si dos escritores (widget, SSE, tool MCP) actualizan
// la misma anotación casi al mismo tiempo, igual que el riesgo que ya se
// resolvió para `numero` en crearAnotacion.
export async function actualizarAnotacion(prototipoId, id, patch) {
  // !== undefined (no truthy): un '' no debe colarse silenciosamente y
  // terminar sobreescribiendo el estado real vía el COALESCE del UPDATE.
  if (patch.estado !== undefined && !ESTADOS_ANOTACION.has(patch.estado)) {
    throw new Error(`Estado inválido: "${patch.estado}". Usa uno de: ${[...ESTADOS_ANOTACION].join(', ')}.`)
  }
  // Debe ser un objeto plano: el operador jsonb || de Postgres concatena en
  // vez de mezclar si el valor es un array, y guardaría basura silenciosa
  // si fuera un string/número.
  if (patch.contenido !== undefined && (typeof patch.contenido !== 'object' || patch.contenido === null || Array.isArray(patch.contenido))) {
    throw new Error('contenido debe ser un objeto plano (ej. { texto: "..." }).')
  }
  const contenidoPatch = patch.contenido ? JSON.stringify(patch.contenido) : null
  const filas = await prisma.$queryRaw`
    UPDATE anotaciones
    SET contenido = CASE WHEN ${contenidoPatch}::jsonb IS NOT NULL THEN contenido || ${contenidoPatch}::jsonb ELSE contenido END,
        estado = COALESCE(${patch.estado ?? null}, estado)
    WHERE id = ${id} AND "prototipoId" = ${prototipoId}
    RETURNING *
  `
  return filas[0] ?? null
}

export async function eliminarAnotacion(prototipoId, id) {
  const { count } = await prisma.anotacion.deleteMany({ where: { id, prototipoId } })
  return count > 0
}

export async function resolverMultiplesAnotaciones(prototipoId, ids) {
  const { count } = await prisma.anotacion.updateMany({
    where: { id: { in: ids }, prototipoId, estado: 'pendiente' },
    data: { estado: 'resuelto' },
  })
  return count
}
