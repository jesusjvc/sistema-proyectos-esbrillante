import prisma from './prisma.js'

const MAX_HTML_SIZE_BYTES = 5 * 1024 * 1024
const MAX_INTENTOS_VERSION = 5

// Determinístico a propósito (a diferencia de generarSlug, que agrega un sufijo
// aleatorio) — publicar/reemplazar/nueva_version depende de que el mismo nombre
// derive siempre el mismo slug base, para poder detectar que "ya existe".
function slugificarNombre(nombre) {
  return nombre
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/[\s-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function validarSlug(slug) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error(`Slug inválido: "${slug}". Solo se permiten letras, números y guiones.`)
  }
}

async function siguienteVersion(baseSlug) {
  let v = 2
  while (await prisma.prototipo.findUnique({ where: { slug: `${baseSlug}-v${v}` } })) {
    v++
  }
  return { slug: `${baseSlug}-v${v}`, version: v }
}

function mapPrototipo(p) {
  return {
    id: p.id,
    slug: p.slug,
    nombreOriginal: p.nombreOriginal,
    tipo: p.tipo,
    estado: p.estado,
    html: p.html,
    urlExterna: p.urlExterna,
    version: p.version,
    proyectoId: p.proyectoId,
    proyectoSlug: p.proyecto?.slug ?? null,
    proyectoNombre: p.proyecto?.cliente?.nombreComercial ?? null,
    comentariosPendientes: p._count?.anotaciones ?? undefined,
    creadoEn: p.creadoEn,
    actualizadoEn: p.actualizadoEn,
  }
}

// Sin `html` a propósito: cada página puede pesar hasta 5 MB y el listado no
// lo necesita. Una página tiene HTML propio si y solo si no es externa.
export async function listarPrototipos({ proyectoId } = {}) {
  const prototipos = await prisma.prototipo.findMany({
    where: proyectoId ? { proyectoId } : undefined,
    select: {
      id: true, slug: true, nombreOriginal: true, tipo: true, estado: true,
      urlExterna: true, version: true, proyectoId: true, creadoEn: true, actualizadoEn: true,
      proyecto: { select: { slug: true, cliente: true } },
      _count: { select: { anotaciones: { where: { estado: 'pendiente' } } } },
    },
    orderBy: { creadoEn: 'desc' },
  })
  return prototipos.map(mapPrototipo)
}

export async function obtenerPrototipoPorSlug(slug) {
  return prisma.prototipo.findUnique({
    where: { slug },
    include: { proyecto: { select: { slug: true, cliente: true } } },
  })
}

// Mismo contrato que el servicio viejo (publicarPagina en su pageService.ts):
// sin slug existente publica; con slug existente y sin `accion` pide
// confirmación; con accion='reemplazar' sobreescribe el mismo slug;
// con accion='nueva_version' crea "<slug>-v2", "-v3", etc.
export async function publicarPrototipo({ nombre, html, accion, tipo = 'prototipo', proyectoId }) {
  if (!nombre || typeof nombre !== 'string') {
    throw new Error('El nombre es obligatorio.')
  }
  if (!html) {
    throw new Error('El contenido HTML es obligatorio.')
  }
  if (Buffer.byteLength(html, 'utf-8') > MAX_HTML_SIZE_BYTES) {
    throw new Error('El HTML supera el límite máximo de 5 MB.')
  }
  const baseSlug = slugificarNombre(nombre)
  validarSlug(baseSlug)

  const existente = await prisma.prototipo.findUnique({ where: { slug: baseSlug } })

  if (!existente) {
    try {
      const creado = await prisma.prototipo.create({
        data: { slug: baseSlug, nombreOriginal: nombre, html, tipo, proyectoId: proyectoId || null },
      })
      return { slug: creado.slug, accionRealizada: 'publicada', mensaje: `Página publicada correctamente en /p/${creado.slug}` }
    } catch (err) {
      if (err.code === 'P2002') throw new Error(`Ya existe una página con el slug "${baseSlug}" — se publicó al mismo tiempo desde otro lado. Intenta de nuevo.`)
      throw err
    }
  }

  if (!accion || accion === 'publicar') {
    return {
      requiereConfirmacion: true,
      slugExistente: baseSlug,
      opciones: {
        reemplazar: 'Sobreescribe la página actual. El cliente verá los cambios en el mismo link.',
        nueva_version: `Crea una URL nueva: /p/${baseSlug}-v2. El link anterior sigue activo.`,
      },
      instruccion: "Llama de nuevo con accion='reemplazar' o accion='nueva_version'.",
    }
  }

  if (accion === 'reemplazar') {
    const data = { html, urlExterna: null }
    // Si el existente era una página externa, ya no lo es — ahora tiene HTML
    // propio. Sin esto, tipo quedaría desincronizado con el contenido real.
    if (existente.urlExterna) data.tipo = tipo
    try {
      const actualizado = await prisma.prototipo.update({ where: { slug: baseSlug }, data })
      return { slug: actualizado.slug, accionRealizada: 'reemplazada', mensaje: `Página reemplazada correctamente. El link sigue siendo: /p/${actualizado.slug}` }
    } catch (err) {
      // TOCTOU: alguien borró la página entre el findUnique de arriba y este update.
      if (err.code === 'P2025') throw new Error(`No existe la página con slug "${baseSlug}" — se borró al mismo tiempo desde otro lado.`)
      throw err
    }
  }

  if (accion !== 'nueva_version') {
    throw new Error(`accion inválida: "${accion}". Usa 'reemplazar' o 'nueva_version'.`)
  }

  // Mismo riesgo que crearAnotacion: dos publicaciones concurrentes con el
  // mismo nombre pueden calcular la misma siguiente versión — se reintenta
  // recalculándola si el slug ya fue tomado entre el cálculo y el create.
  for (let intento = 0; intento < MAX_INTENTOS_VERSION; intento++) {
    const { slug: nuevoSlug, version } = await siguienteVersion(baseSlug)
    validarSlug(nuevoSlug)
    try {
      const creado = await prisma.prototipo.create({
        data: { slug: nuevoSlug, nombreOriginal: nombre, html, tipo, version, proyectoId: proyectoId || null },
      })
      return { slug: creado.slug, accionRealizada: 'nueva_version', version, mensaje: `Versión ${version} publicada en /p/${creado.slug}. El link anterior sigue activo.` }
    } catch (err) {
      if (err.code === 'P2002' && intento < MAX_INTENTOS_VERSION - 1) continue
      throw err
    }
  }
}

// Página que vive fuera de Foco (Elementor, Vercel, etc.) — /p/:slug le hace
// proxy con el widget de revisión inyectado en vez de servir `html` directo.
export async function registrarPaginaExterna({ nombre, urlExterna, proyectoId }) {
  if (!nombre || typeof nombre !== 'string') {
    throw new Error('El nombre es obligatorio.')
  }
  if (!urlExterna) {
    throw new Error('urlExterna es obligatoria.')
  }
  let parsed
  try { parsed = new URL(urlExterna) } catch { parsed = null }
  if (!parsed || (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')) {
    throw new Error(`URL inválida: "${urlExterna}". Debe empezar con http:// o https://.`)
  }
  const baseSlug = slugificarNombre(nombre)
  validarSlug(baseSlug)
  const existe = await prisma.prototipo.findUnique({ where: { slug: baseSlug } })
  if (existe) throw new Error(`Ya existe una página con el slug "${baseSlug}". Usa un nombre distinto.`)
  try {
    const creado = await prisma.prototipo.create({
      data: { slug: baseSlug, nombreOriginal: nombre, urlExterna, tipo: 'pagina_web', proyectoId: proyectoId || null },
    })
    return mapPrototipo(creado)
  } catch (err) {
    if (err.code === 'P2002') throw new Error(`Ya existe una página con el slug "${baseSlug}" — se registró al mismo tiempo desde otro lado. Intenta de nuevo.`)
    throw err
  }
}

export async function asignarProyecto(slug, proyectoId) {
  const existe = await prisma.prototipo.findUnique({ where: { slug } })
  if (!existe) throw new Error(`No existe la página con slug "${slug}".`)
  return prisma.prototipo.update({ where: { slug }, data: { proyectoId: proyectoId || null } })
}

const ESTADOS_PROTOTIPO = new Set(['en_revision', 'pendiente_equipo', 'aprobado'])

export async function cambiarEstado(slug, estado) {
  if (!ESTADOS_PROTOTIPO.has(estado)) {
    throw new Error(`Estado inválido: "${estado}". Usa uno de: ${[...ESTADOS_PROTOTIPO].join(', ')}.`)
  }
  const existe = await prisma.prototipo.findUnique({ where: { slug } })
  if (!existe) throw new Error(`No existe la página con slug "${slug}".`)
  return prisma.prototipo.update({ where: { slug }, data: { estado } })
}

// El cliente dio clic en "Terminar revisión" en el widget — null si el slug no
// existe (P2025); cualquier otro error (DB caída, timeout) se relanza en vez
// de confundirse con "no existe" y aparentar que la página desapareció.
export async function finalizarRevisionCliente(slug) {
  try {
    return await prisma.prototipo.update({
      where: { slug },
      data: { estado: 'pendiente_equipo' },
      include: { proyecto: { select: { slug: true } } },
    })
  } catch (err) {
    if (err.code === 'P2025') return null
    throw err
  }
}

export async function eliminarPrototipo(slug) {
  // Sin validarSlug a propósito: a diferencia de publicar/registrar (que
  // derivan el slug de un nombre nuevo), acá el slug ya es el de una fila
  // existente — igual que asignarProyecto/cambiarEstado, que tampoco la usan.
  const existe = await prisma.prototipo.findUnique({ where: { slug } })
  if (!existe) throw new Error(`No existe la página con slug "${slug}".`)
  try {
    await prisma.prototipo.delete({ where: { slug } }) // cascada: borra sus anotaciones
    return `Página "${slug}" eliminada correctamente.`
  } catch (err) {
    // TOCTOU: alguien más la borró entre el findUnique de arriba y este delete.
    if (err.code === 'P2025') throw new Error(`No existe la página con slug "${slug}" — se borró al mismo tiempo desde otro lado.`)
    throw err
  }
}
