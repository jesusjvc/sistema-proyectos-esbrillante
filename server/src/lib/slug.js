export function generarSlug(nombre) {
  const base = nombre
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 22)
    .replace(/-+$/, '')
  const sufijo = Math.random().toString(36).slice(2, 6)
  return `${base}-${sufijo}`
}
