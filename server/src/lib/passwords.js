import { randomBytes } from 'crypto'

const PALABRAS = ['cielo', 'verde', 'azul', 'rio', 'sol', 'luna', 'mar', 'viento']

// Contraseña fácil de leer/dictar por teléfono: una palabra + 3 dígitos (ej. "verde482").
export function generarPasswordSimple() {
  const palabra = PALABRAS[Math.floor(Math.random() * PALABRAS.length)]
  const numero = Math.floor(100 + Math.random() * 900)
  return `${palabra}${numero}`
}

// Token largo para el enlace de acceso directo del cliente (no se teclea, va en la URL).
export function generarAccessToken() {
  return randomBytes(24).toString('hex')
}
