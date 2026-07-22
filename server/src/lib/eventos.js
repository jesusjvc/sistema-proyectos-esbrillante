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
