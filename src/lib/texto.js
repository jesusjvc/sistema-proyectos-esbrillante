// Normaliza texto para comparar/buscar sin importar acentos ni mayúsculas —
// "cafe" y "café" deben encontrarse mutuamente. Único punto de verdad para
// esto: antes cada buscador reimplementaba su propia versión (o no
// normalizaba en absoluto).
export function normalizarTexto(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

// Detecta si un valor de Info clave es un enlace (para renderizarlo como
// <a> clickeable en vez de texto plano).
export function esUrl(valor) {
  return /^https?:\/\/\S+$/i.test(String(valor || '').trim())
}
