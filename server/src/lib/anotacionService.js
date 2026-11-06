import prisma from './prisma.js'

const MAX_INTENTOS_NUMERO = 5

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

export async function actualizarAnotacion(prototipoId, id, patch) {
  const anotacion = await prisma.anotacion.findFirst({ where: { id, prototipoId } })
  if (!anotacion) return null
  const data = {}
  if (patch.estado) data.estado = patch.estado
  if (patch.contenido) data.contenido = { ...anotacion.contenido, ...patch.contenido }
  return prisma.anotacion.update({ where: { id }, data })
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
