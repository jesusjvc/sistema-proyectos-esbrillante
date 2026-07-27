// Códigos de autorización: viven segundos entre /authorize y /token, así
// que basta memoria del proceso (no necesitan sobrevivir un reinicio).
const codigos = new Map()
const TTL_MS = 5 * 60 * 1000

export function guardarCodigo(code, datos) {
  codigos.set(code, { ...datos, expiraEn: Date.now() + TTL_MS })
}

// Un solo uso: se borra al leerlo, incluso si ya expiró.
export function consumirCodigo(code) {
  const datos = codigos.get(code)
  codigos.delete(code)
  if (!datos || datos.expiraEn < Date.now()) return null
  return datos
}
