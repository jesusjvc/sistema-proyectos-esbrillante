// Lógica de coincidencia compartida entre proponerAgrupacionClientes.js
// (solo lectura) y aplicarAgrupacionClientes.js (escribe) — ver plan-foco.md
// 4.1. Agrupa proyectos que probablemente son el mismo cliente real por
// nombre/correo/whatsapp normalizados.

const SUFIJOS_LEGALES = [
  's\\.?a\\.?\\s*de\\s*c\\.?v\\.?',
  's\\.?\\s*de\\s*r\\.?l\\.?\\s*de\\s*c\\.?v\\.?',
  's\\.?a\\.?',
  's\\.?r\\.?l\\.?',
]

export function normalizarNombre(texto) {
  let t = (texto || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quita acentos
    .toLowerCase()
    .trim()
  for (const sufijo of SUFIJOS_LEGALES) {
    t = t.replace(new RegExp(`[,.\\s]*${sufijo}\\s*$`, 'i'), '')
  }
  return t.replace(/[^a-z0-9]+/g, ' ').trim()
}

export function normalizarTelefono(tel) {
  const digitos = (tel || '').replace(/\D/g, '')
  return digitos.length >= 10 ? digitos.slice(-10) : null
}

export function normalizarCorreo(correo) {
  return (correo || '').trim().toLowerCase() || null
}

// Distancia de Levenshtein simple — el dataset es chico (decenas de
// proyectos), no hace falta optimizar.
export function distancia(a, b) {
  const m = a.length, n = b.length
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)])
  for (let j = 0; j <= n; j++) d[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      d[i][j] = a[i - 1] === b[j - 1]
        ? d[i - 1][j - 1]
        : 1 + Math.min(d[i - 1][j], d[i][j - 1], d[i - 1][j - 1])
    }
  }
  return d[m][n]
}

function crearUnionFind(n) {
  const padre = Array.from({ length: n }, (_, i) => i)
  function raiz(x) { return padre[x] === x ? x : (padre[x] = raiz(padre[x])) }
  function unir(x, y) { padre[raiz(x)] = raiz(y) }
  return { raiz, unir }
}

// proyectos: [{ id, slug, cliente, clienteId, creadoEn }] (shape de Proyecto).
// Devuelve grupos ordenados por creadoEn asc dentro de cada uno (para que el
// primero de cada grupo sea el "canónico" al crear el Cliente).
export function agruparProyectosPorCliente(proyectos) {
  const items = proyectos.map((p) => ({
    proyecto: p,
    nombreOriginal: p.cliente?.nombreComercial || '(sin nombre)',
    nombreNorm: normalizarNombre(p.cliente?.nombreComercial),
    correo: normalizarCorreo(p.cliente?.correo),
    telefono: normalizarTelefono(p.cliente?.whatsapp),
  }))

  const uf = crearUnionFind(items.length)
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i], b = items[j]
      const mismoNombre = a.nombreNorm && a.nombreNorm === b.nombreNorm
      const mismoCorreo = a.correo && a.correo === b.correo
      const mismoTelefono = a.telefono && a.telefono === b.telefono
      if (mismoNombre || mismoCorreo || mismoTelefono) uf.unir(i, j)
    }
  }

  const grupos = new Map()
  items.forEach((item, i) => {
    const r = uf.raiz(i)
    if (!grupos.has(r)) grupos.set(r, [])
    grupos.get(r).push(item)
  })

  return [...grupos.values()].map((g) =>
    g.sort((a, b) => new Date(a.proyecto.creadoEn) - new Date(b.proyecto.creadoEn)),
  )
}
