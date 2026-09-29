import prisma from './prisma.js'
import { emitirNotificacion } from './eventos.js'

// Punto de entrada único para crear notificaciones in-app: inserta en BD y emite por SSE.
// No se fusiona con notificaciones.js (que sigue existiendo, solo-correo, usado por
// notificarMencion) — este helper es la capa de orquestación que, cuando aplica, además llama a
// las funciones de correo/Google Chat existentes desde cada call-site.
//
// Excluye automáticamente al actor de los destinatarios (nadie se auto-notifica). Usa
// `prisma.notificacion.create` uno por uno (no `createMany`) para poder regresar el `id` real de
// cada registro — útil para marcar-como-leída desde el toast sin esperar un refetch. Son pocos
// destinatarios por evento (normalmente 1-3), así que el costo extra de queries es marginal.
export async function crearNotificacion({ destinatarioIds, tipo, mensaje, actor, proyecto, tarea, comentarioId }) {
  const ids = [...new Set(destinatarioIds || [])].filter((id) => id && id !== actor?.id)
  if (!ids.length) return []

  const base = {
    tipo,
    mensaje,
    actorId: actor?.id ?? null,
    actorNombre: actor?.nombre ?? null,
    proyectoId: proyecto?.id ?? null,
    proyectoSlug: proyecto?.slug ?? null,
    tareaId: tarea?.id ?? null,
    tareaTitulo: tarea?.titulo ?? null,
    comentarioId: comentarioId ?? null,
  }

  const creadas = await Promise.all(
    ids.map((destinatarioId) => prisma.notificacion.create({ data: { ...base, destinatarioId } })),
  )

  creadas.forEach((n) => emitirNotificacion(n.destinatarioId, n))

  return creadas
}
