// Normaliza texto para comparar/buscar sin importar acentos ni mayúsculas —
// "cafe" y "café" deben encontrarse mutuamente. Único punto de verdad para
// esto: antes cada buscador reimplementaba su propia versión (o no
// normalizaba en absoluto).
export function normalizarTexto(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}
