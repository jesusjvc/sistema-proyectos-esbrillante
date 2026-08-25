const PALABRAS = ['cielo', 'verde', 'azul', 'rio', 'sol', 'luna', 'mar', 'viento']

// Contraseña fácil de leer/dictar por teléfono: una palabra + 3 dígitos (ej. "verde482").
export function generarPasswordSimple() {
  const palabra = PALABRAS[Math.floor(Math.random() * PALABRAS.length)]
  const numero = Math.floor(100 + Math.random() * 900)
  return `${palabra}${numero}`
}
