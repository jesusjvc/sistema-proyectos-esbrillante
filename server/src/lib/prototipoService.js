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

export async function listarPrototipos({ proyectoId } = {}) {
  const prototipos = await prisma.prototipo.findMany({
    where: proyectoId ? { proyectoId } : undefined,
    include: {
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
  if (Buffer.byteLength(html, 'utf-8') > MAX_HTML_SIZE_BYTES) {
    throw new Error('El HTML supera el límite máximo de 5 MB.')
  }
  const baseSlug = slugificarNombre(nombre)
  validarSlug(baseSlug)

  const existente = await prisma.prototipo.findUnique({ where: { slug: baseSlug } })

  if (!existente) {
    const creado = await prisma.prototipo.create({
      data: { slug: baseSlug, nombreOriginal: nombre, html, tipo, proyectoId: proyectoId || null },
    })
    return { slug: creado.slug, accionRealizada: 'publicada', mensaje: `Página publicada correctamente en /p/${creado.slug}` }
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
    // urlExterna:null por si el existente era una página externa — mantiene la
    // invariante de "exactamente uno de html/urlExterna" que exige el CHECK de la DB.
    const actualizado = await prisma.prototipo.update({ where: { slug: baseSlug }, data: { html, urlExterna: null } })
    return { slug: actualizado.slug, accionRealizada: 'reemplazada', mensaje: `Página reemplazada correctamente. El link sigue siendo: /p/${actualizado.slug}` }
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
  const baseSlug = slugificarNombre(nombre)
  validarSlug(baseSlug)
  const existe = await prisma.prototipo.findUnique({ where: { slug: baseSlug } })
  if (existe) throw new Error(`Ya existe una página con el slug "${baseSlug}". Usa un nombre distinto.`)
  const creado = await prisma.prototipo.create({
    data: { slug: baseSlug, nombreOriginal: nombre, urlExterna, tipo: 'pagina_web', proyectoId: proyectoId || null },
  })
  return mapPrototipo(creado)
}

export async function asignarProyecto(slug, proyectoId) {
  const existe = await prisma.prototipo.findUnique({ where: { slug } })
  if (!existe) throw new Error(`No existe la página con slug "${slug}".`)
  return prisma.prototipo.update({ where: { slug }, data: { proyectoId: proyectoId || null } })
}

export async function cambiarEstado(slug, estado) {
  const existe = await prisma.prototipo.findUnique({ where: { slug } })
  if (!existe) throw new Error(`No existe la página con slug "${slug}".`)
  return prisma.prototipo.update({ where: { slug }, data: { estado } })
}

// El cliente dio clic en "Terminar revisión" en el widget — null si el slug no existe.
export async function finalizarRevisionCliente(slug) {
  try {
    return await prisma.prototipo.update({ where: { slug }, data: { estado: 'pendiente_equipo' } })
  } catch {
    return null
  }
}

export async function eliminarPrototipo(slug) {
  validarSlug(slug)
  const existe = await prisma.prototipo.findUnique({ where: { slug } })
  if (!existe) throw new Error(`No existe la página con slug "${slug}".`)
  await prisma.prototipo.delete({ where: { slug } }) // cascada: borra sus anotaciones
  return `Página "${slug}" eliminada correctamente.`
}
