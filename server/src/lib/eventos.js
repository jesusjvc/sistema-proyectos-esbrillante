import { EventEmitter } from 'events'

const bus = new EventEmitter()
bus.setMaxListeners(0)

export function emitirCambio(proyectoId) {
  bus.emit('cambio', { proyectoId, fecha: new Date().toISOString() })
}

// Devuelve una función para cancelar la suscripción.
export function suscribirse(listener) {
  bus.on('cambio', listener)
  return () => bus.off('cambio', listener)
}

// Canal separado del de arriba, a propósito: 'cambio' es broadcast sin filtrar por usuario (lo
// recibe cualquiera conectado a /api/eventos/global o /proyecto/:slug) — reutilizarlo para
// notificaciones expondría en el tráfico de red quién le notificó a quién a cualquiera conectado.
// Con este canal, el filtro por destinatario pasa en el servidor (ver routes/eventos.js) antes de
// escribir al stream.
export function emitirNotificacion(destinatarioId, notificacion) {
  bus.emit('notificacion', { destinatarioId, notificacion })
}

export function suscribirseNotificaciones(listener) {
  bus.on('notificacion', listener)
  return () => bus.off('notificacion', listener)
}
