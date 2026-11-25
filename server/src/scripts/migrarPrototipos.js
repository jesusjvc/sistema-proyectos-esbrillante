// Migración de datos (manual, al hacer el corte): copia las páginas y anotaciones
// de esbrillante-pages-mcp (archivos JSON en su volumen) a las tablas de Foco,
// leyéndolas por la API HTTP del propio servicio viejo — así no hace falta
// acceso al disco del servidor.
//
// Sin --aplicar solo muestra el plan (dry-run) y no escribe nada.
// Se puede correr varias veces: mientras el servicio viejo siga recibiendo
// comentarios, él es la fuente de verdad para sus slugs — cada corrida
// actualiza la página y hace upsert de sus anotaciones por id. Nunca borra lo
// que exista solo en Foco.
//
// Uso: cd server && node src/scripts/migrarPrototipos.js [--aplicar]
// Requiere PAGES_MCP_API_KEY (la API_KEY del servicio viejo); el origen se toma
// de PAGES_MCP_URL (default https://prototipos.esbrillante.mx).
import 'dotenv/config'
import prisma from '../lib/prisma.js'

const ORIGEN = (process.env.PAGES_MCP_URL || 'https://prototipos.esbrillante.mx').replace(/\/$/, '')
const API_KEY = process.env.PAGES_MCP_API_KEY || ''
const APLICAR = process.argv.includes('--aplicar')
const TIMEOUT_MS = 30_000

async function pedir(ruta, { json = true, conKey = false } = {}) {
  const resp = await fetch(`${ORIGEN}${ruta}`, {
    headers: conKey ? { Authorization: `Bearer ${API_KEY}` } : {},
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!resp.ok) throw new Error(`${ruta} respondió ${resp.status}`)
  return json ? resp.json() : resp.text()
}

// El servicio viejo guardaba el body tal cual lo mandaba el widget, que calcula
// id y numero en el navegador (numero = cuántas veía + 1). Dos revisores a la
// vez pueden haber dejado números repetidos, y la tabla nueva exige
// @@unique([prototipoId, numero]): el primero conserva su número y los demás
// (o los que no traen) toman el siguiente libre. Sin id, se usa uno estable por
// posición para que re-correr la migración no duplique.
// `numerosSoloEnFoco`: números de anotaciones creadas directo en Foco entre una
// corrida y otra — también cuentan como ocupados.
function normalizarAnotaciones(slug, crudas, numerosSoloEnFoco = []) {
  const usados = new Set(numerosSoloEnFoco)
  let renumeradas = 0
  const resultado = crudas.map((a, i) => {
    const ann = aAnotacion(a)
    if (!ann.id) ann.id = `migrada-${slug}-${i + 1}`
    if (!Number.isInteger(ann.numero) || usados.has(ann.numero)) {
      ann.numero = null
      renumeradas++
    } else {
      usados.add(ann.numero)
    }
    return ann
  })
  let siguiente = 1
  for (const ann of resultado) {
    if (ann.numero !== null) continue
    while (usados.has(siguiente)) siguiente++
    ann.numero = siguiente
    usados.add(siguiente)
  }
  return { anotaciones: resultado, renumeradas }
}

function aAnotacion(a) {
  return {
    id: a.id,
    numero: a.numero,
    tipo: a.tipo || 'comentario',
    rol: a.rol === 'equipo' ? 'equipo' : 'cliente',
    autor: a.autor || 'Sin nombre',
    estado: a.estado === 'resuelto' ? 'resuelto' : 'pendiente',
    selector: a.selector || 'body',
    pagina: a.pagina || '/',
    posicion: a.posicion ?? {},
    contenido: a.contenido ?? {},
    creadaEn: a.fecha ? new Date(a.fecha) : new Date(),
  }
}

async function prepararPagina(meta, proyectoIdPorSlug) {
  const esExterna = !meta.archivo && !!meta.urlExterna
  const html = esExterna ? null : await pedir(`/p/${encodeURIComponent(meta.slug)}/download`, { json: false })
  const crudas = await pedir(`/api/anotaciones/${encodeURIComponent(meta.slug)}`)
  const idsQueVienen = crudas.map((a, i) => a.id || `migrada-${meta.slug}-${i + 1}`)
  const soloEnFoco = await prisma.anotacion.findMany({
    where: { prototipo: { slug: meta.slug }, id: { notIn: idsQueVienen } },
    select: { numero: true },
  })
  const { anotaciones, renumeradas } = normalizarAnotaciones(meta.slug, crudas, soloEnFoco.map((a) => a.numero))

  const proyectoId = meta.proyectoSlug ? proyectoIdPorSlug.get(meta.proyectoSlug) ?? null : null
  return {
    datos: {
      slug: meta.slug,
      nombreOriginal: meta.nombre_original || meta.slug,
      tipo: meta.tipo === 'pagina_web' ? 'pagina_web' : 'prototipo',
      estado: ['en_revision', 'pendiente_equipo', 'aprobado'].includes(meta.estado) ? meta.estado : 'en_revision',
      html,
      urlExterna: esExterna ? meta.urlExterna : null,
      version: meta.version || 1,
      proyectoId,
      creadoEn: meta.fecha_creacion ? new Date(meta.fecha_creacion) : new Date(),
      actualizadoEn: meta.fecha_actualizacion ? new Date(meta.fecha_actualizacion) : new Date(),
    },
    anotaciones,
    proyectoFaltante: meta.proyectoSlug && !proyectoId ? meta.proyectoSlug : null,
    audios: anotaciones.filter((a) => a.contenido?.audio_url).length,
    renumeradas,
  }
}

async function aplicarPagina({ datos, anotaciones }) {
  await prisma.$transaction(async (tx) => {
    const { slug, ...resto } = datos
    const prototipo = await tx.prototipo.upsert({ where: { slug }, create: datos, update: resto })
    for (const a of anotaciones) {
      const { id, ...campos } = a
      await tx.anotacion.upsert({
        where: { id },
        create: { ...a, prototipoId: prototipo.id },
        update: { ...campos, prototipoId: prototipo.id },
      })
    }
  })
}

async function main() {
  if (!API_KEY) throw new Error('Falta PAGES_MCP_API_KEY (la API_KEY del servicio viejo).')
  console.log(`${APLICAR ? 'APLICANDO' : 'DRY-RUN (no escribe nada)'} — origen: ${ORIGEN}\n`)

  const paginas = await pedir('/api/prototipos', { conKey: true })
  const proyectos = await prisma.proyecto.findMany({ select: { id: true, slug: true } })
  const proyectoIdPorSlug = new Map(proyectos.map((p) => [p.slug, p.id]))
  const existentes = new Set((await prisma.prototipo.findMany({ select: { slug: true } })).map((p) => p.slug))

  const totales = { paginas: 0, crear: 0, actualizar: 0, anotaciones: 0, errores: 0 }
  const avisos = []

  for (const meta of paginas) {
    totales.paginas++
    const accion = existentes.has(meta.slug) ? 'actualizar' : 'crear'
    try {
      const plan = await prepararPagina(meta, proyectoIdPorSlug)
      if (APLICAR) await aplicarPagina(plan)
      totales[accion]++
      totales.anotaciones += plan.anotaciones.length
      const contenido = plan.datos.urlExterna ? `externa ${plan.datos.urlExterna}` : `html ${Math.round(Buffer.byteLength(plan.datos.html) / 1024)} KB`
      console.log(`${accion.padEnd(10)} ${meta.slug.padEnd(40)} ${contenido.padEnd(30)} ${plan.anotaciones.length} anotaciones`)
      if (plan.proyectoFaltante) avisos.push(`${meta.slug}: el proyecto "${plan.proyectoFaltante}" no existe en Foco — queda sin proyecto`)
      if (plan.renumeradas) avisos.push(`${meta.slug}: ${plan.renumeradas} anotación(es) sin número o con número repetido — se les asignó el siguiente libre`)
      if (plan.audios) avisos.push(`${meta.slug}: ${plan.audios} anotación(es) con audio_url — se copia el link tal cual`)
    } catch (err) {
      totales.errores++
      console.log(`ERROR      ${String(meta.slug ?? '(sin slug)').padEnd(40)} ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  console.log(`\nPáginas: ${totales.paginas} (crear ${totales.crear}, actualizar ${totales.actualizar}, errores ${totales.errores}) · anotaciones: ${totales.anotaciones}`)
  if (avisos.length) console.log(`\nAvisos:\n- ${avisos.join('\n- ')}`)
  if (!APLICAR) console.log('\nNada se escribió. Para aplicar: node src/scripts/migrarPrototipos.js --aplicar')
  if (totales.errores) process.exitCode = 1
}

main()
  .catch((err) => { console.error(err instanceof Error ? err.message : err); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
