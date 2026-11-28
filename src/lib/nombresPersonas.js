// Nombres para los botones de selección de personas: hay varios usuarios con
// el mismo primer nombre (cuatro "Jesús"), así que a esos se les agrega la
// inicial del apellido, o la parte local del correo si no tienen apellido.

export function normalizarNombre(texto = '') {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()
}

function primerNombre(nombre = '') {
  return nombre.trim().split(/\s+/)[0] || ''
}

// { [userId]: etiqueta } para todas las personas de `miembros`.
export function etiquetasPersonas(miembros = []) {
  const conteo = {}
  miembros.forEach((m) => {
    const clave = normalizarNombre(primerNombre(m.nombre))
    conteo[clave] = (conteo[clave] || 0) + 1
  })
  return Object.fromEntries(miembros.map((m) => {
    const nombre = (m.nombre || '').trim()
    const pila = primerNombre(nombre)
    if (conteo[normalizarNombre(pila)] < 2) return [m.id, nombre || m.email || m.id]
    const apellido = nombre.split(/\s+/)[1]
    if (apellido) return [m.id, `${pila} ${apellido[0].toUpperCase()}.`]
    const local = (m.email || '').split('@')[0]
    return [m.id, local ? `${pila} (${local})` : pila]
  }))
}

// El único miembro activo cuyo primer nombre coincide (sin importar mayúsculas
// ni acentos); null si no hay ninguno o hay más de uno.
export function miembroActivoPorNombre(miembros = [], nombre) {
  const buscado = normalizarNombre(nombre)
  const coincidencias = miembros.filter((m) => m.activo !== false && normalizarNombre(primerNombre(m.nombre)) === buscado)
  return coincidencias.length === 1 ? coincidencias[0] : null
}
