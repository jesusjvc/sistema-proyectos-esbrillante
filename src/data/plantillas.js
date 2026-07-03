const KEY_PLANTILLAS = 'esbrillante_plantillas'
const KEY_SEED_V = 'esbrillante_seed_v'
const SEED_VERSION = '4'

const BUILTIN_IDS = ['web-en-corto', 'web-profesional', 'web-corporativa', 'web-industrial', 'web-experto', 'ecommerce', 'personalizado']

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export const CONDICION_LABELS = {
  requiereCloudflare: 'Requiere Cloudflare',
  requiereCorreos: 'Requiere correos corporativos',
  requiereAnalytics: 'Requiere Google Analytics',
  requiereSearchConsole: 'Requiere Search Console',
  requiereCapacitacion: 'Requiere capacitación al cliente',
  requierePluginAdicional: 'Requiere plugin adicional',
  sinCloudflare: 'Solo si NO usa Cloudflare',
  tienePlugin: 'Extra: Plugin de agendamiento / membresías',
  tieneEcommerce: 'Extra: Ecommerce (WooCommerce)',
  tienePasarela: 'Extra: Pasarela de pago',
  tieneBlog: 'Extra: Blog con entradas',
  tieneSeoAvanzado: 'Extra: SEO avanzado',
  tieneCapacitacionExtendida: 'Extra: Capacitación extendida',
}

// ─── CRUD ──────────────────────────────────────────────────────────────────

export function getPlantillas() {
  try {
    const guardadas = JSON.parse(localStorage.getItem(KEY_PLANTILLAS))
    const version = localStorage.getItem(KEY_SEED_V)
    if (guardadas && guardadas.length) {
      if (version === SEED_VERSION) return guardadas
      // Re-seed built-ins, conservar plantillas custom del usuario
      const custom = guardadas.filter((p) => !BUILTIN_IDS.includes(p.id))
      const nuevas = [...seedPlantillas(), ...custom]
      localStorage.setItem(KEY_PLANTILLAS, JSON.stringify(nuevas))
      localStorage.setItem(KEY_SEED_V, SEED_VERSION)
      return nuevas
    }
  } catch {}
  const seed = seedPlantillas()
  localStorage.setItem(KEY_PLANTILLAS, JSON.stringify(seed))
  localStorage.setItem(KEY_SEED_V, SEED_VERSION)
  return seed
}

export function getPlantilla(id) {
  return getPlantillas().find((p) => p.id === id) || null
}

export function crearPlantilla(datos) {
  const plantillas = getPlantillas()
  const nueva = {
    id: uid(),
    nombre: datos.nombre,
    area: datos.area || 'General',
    descripcion: datos.descripcion || '',
    creadoEn: new Date().toISOString(),
    fases: datos.fases || FASES_WEB,
    tareas: [],
  }
  plantillas.push(nueva)
  localStorage.setItem(KEY_PLANTILLAS, JSON.stringify(plantillas))
  return nueva
}

export function actualizarPlantilla(id, cambios) {
  const plantillas = getPlantillas()
  const idx = plantillas.findIndex((p) => p.id === id)
  if (idx === -1) return null
  plantillas[idx] = { ...plantillas[idx], ...cambios }
  localStorage.setItem(KEY_PLANTILLAS, JSON.stringify(plantillas))
  return plantillas[idx]
}

export function eliminarPlantilla(id) {
  const plantillas = getPlantillas().filter((p) => p.id !== id)
  localStorage.setItem(KEY_PLANTILLAS, JSON.stringify(plantillas))
}

// ─── Tareas dentro de una plantilla ────────────────────────────────────────

export function agregarTareaPlantilla(plantillaId, tarea) {
  const plantillas = getPlantillas()
  const p = plantillas.find((p) => p.id === plantillaId)
  if (!p) return null
  const nueva = { ...tarea, id: uid() }
  p.tareas.push(nueva)
  localStorage.setItem(KEY_PLANTILLAS, JSON.stringify(plantillas))
  return nueva
}

export function editarTareaPlantilla(plantillaId, tareaId, cambios) {
  const plantillas = getPlantillas()
  const p = plantillas.find((p) => p.id === plantillaId)
  if (!p) return null
  const t = p.tareas.find((t) => t.id === tareaId)
  if (!t) return null
  Object.assign(t, cambios)
  localStorage.setItem(KEY_PLANTILLAS, JSON.stringify(plantillas))
  return p
}

export function eliminarTareaPlantilla(plantillaId, tareaId) {
  const plantillas = getPlantillas()
  const p = plantillas.find((p) => p.id === plantillaId)
  if (!p) return null
  p.tareas = p.tareas.filter((t) => t.id !== tareaId)
  localStorage.setItem(KEY_PLANTILLAS, JSON.stringify(plantillas))
  return p
}

export function reordenarTareasPlantilla(plantillaId, tareaId, direccion) {
  const plantillas = getPlantillas()
  const p = plantillas.find((p) => p.id === plantillaId)
  if (!p) return null
  const idx = p.tareas.findIndex((t) => t.id === tareaId)
  const tarea = p.tareas[idx]
  const mismaFase = p.tareas.filter((t) => t.fase === tarea.fase)
  const idxFase = mismaFase.findIndex((t) => t.id === tareaId)
  if (direccion === 'arriba' && idxFase === 0) return p
  if (direccion === 'abajo' && idxFase === mismaFase.length - 1) return p
  const targetFase = mismaFase[direccion === 'arriba' ? idxFase - 1 : idxFase + 1]
  const idxTarget = p.tareas.findIndex((t) => t.id === targetFase.id)
  ;[p.tareas[idx], p.tareas[idxTarget]] = [p.tareas[idxTarget], p.tareas[idx]]
  localStorage.setItem(KEY_PLANTILLAS, JSON.stringify(plantillas))
  return p
}

// ─── Fases de una plantilla ────────────────────────────────────────────────

export function agregarFasePlantilla(plantillaId, fase) {
  const plantillas = getPlantillas()
  const p = plantillas.find((p) => p.id === plantillaId)
  if (!p) return null
  const maxNum = p.fases.reduce((m, f) => Math.max(m, f.numero), 0)
  p.fases.push({ numero: maxNum + 1, nombre: fase.nombre })
  p.fases.sort((a, b) => a.numero - b.numero)
  localStorage.setItem(KEY_PLANTILLAS, JSON.stringify(plantillas))
  return p
}

export function editarFasePlantilla(plantillaId, faseNumero, cambios) {
  const plantillas = getPlantillas()
  const p = plantillas.find((p) => p.id === plantillaId)
  if (!p) return null
  const f = p.fases.find((f) => f.numero === faseNumero)
  if (f) Object.assign(f, cambios)
  localStorage.setItem(KEY_PLANTILLAS, JSON.stringify(plantillas))
  return p
}

// ─── Copiar tareas de plantilla a proyecto ─────────────────────────────────

export function copiarTareasDesde(plantillaId, condiciones, extras) {
  const plantilla = getPlantilla(plantillaId)
  if (!plantilla) return []

  const ctx = buildCondicionesCtx(condiciones, extras)
  const tareasBase = plantilla.tareas.filter((t) => matchCondicion(t.condicion, ctx))

  const idMap = {}
  tareasBase.forEach((t) => { idMap[t.id] = uid() })

  return tareasBase.map((t) => ({
    ...t,
    id: idMap[t.id],
    dependencias: (t.dependencias || []).filter((d) => idMap[d]).map((d) => idMap[d]),
    estado: 'pendiente',
    completadaPor: null,
    completadaEn: null,
    asignadoA: null,
    custom: false,
  }))
}

function buildCondicionesCtx(condiciones, extras) {
  return {
    ...condiciones,
    tienePlugin: extras.includes('Plugin de agendamiento de citas') || extras.includes('Plugin de membresías'),
    tieneEcommerce: extras.includes('Carga de productos (Ecommerce)') || extras.includes('Pasarela de pago (Stripe / MercadoPago / PayPal)'),
    tienePasarela: extras.includes('Pasarela de pago (Stripe / MercadoPago / PayPal)'),
    tieneBlog: extras.includes('Blog con entradas iniciales'),
    tieneSeoAvanzado: extras.includes('SEO avanzado'),
    tieneCapacitacionExtendida: extras.includes('Capacitación extendida'),
    sinCloudflare: !condiciones.requiereCloudflare,
  }
}

function matchCondicion(condicion, ctx) {
  if (!condicion) return true
  return ctx[condicion] === true
}

// ─── Fases base para Web ───────────────────────────────────────────────────

export const FASES_WEB = [
  { numero: 1, nombre: 'Arranque' },
  { numero: 2, nombre: 'Contenido y Boceto' },
  { numero: 3, nombre: 'Diseño y Maquetación' },
  { numero: 4, nombre: 'Configuración Técnica' },
  { numero: 5, nombre: 'Revisión Interna' },
  { numero: 6, nombre: 'Revisión con Cliente' },
  { numero: 7, nombre: 'Entrega y Cierre' },
]

// ─── Seed inicial ──────────────────────────────────────────────────────────

function seedPlantillas() {
  const tareas = tareasWebBase()

  function plantillaWeb(id, nombre, descripcion) {
    return {
      id,
      nombre,
      area: 'Web',
      descripcion,
      creadoEn: new Date().toISOString(),
      fases: FASES_WEB,
      tareas: tareas.map((t) => ({ ...t, id: uid() })),
    }
  }

  return [
    plantillaWeb('web-en-corto', 'Web en Corto', 'Sitio web básico, pocas secciones, entrega rápida.'),
    plantillaWeb('web-profesional', 'Web Profesional', 'Sitio web completo con diseño personalizado y SEO básico.'),
    plantillaWeb('web-corporativa', 'Web Corporativa', 'Sitio web para empresa mediana con múltiples páginas y secciones.'),
    plantillaWeb('web-industrial', 'Web Industrial', 'Sitio web para empresa industrial con catálogo de productos o servicios.'),
    plantillaWeb('web-experto', 'Web Experto', 'Sitio web avanzado con SEO profundo, blog y estrategia de contenido.'),
    {
      id: 'ecommerce',
      nombre: 'Ecommerce',
      area: 'Web',
      descripcion: 'Tienda en línea con catálogo de productos y pasarela de pago.',
      creadoEn: new Date().toISOString(),
      fases: FASES_WEB,
      tareas: tareas.map((t) => ({ ...t, id: uid() })),
    },
    {
      id: 'personalizado',
      nombre: 'Personalizado',
      area: 'General',
      descripcion: 'Plantilla vacía. El Admin construye el checklist manualmente.',
      creadoEn: new Date().toISOString(),
      fases: FASES_WEB,
      tareas: [],
    },
  ]
}

// ─── Helpers constructores de tarea ───────────────────────────────────────

function t(id, fase, titulo, responsable, dependencias, opts = {}) {
  return {
    id,
    fase,
    titulo,
    responsable,
    dependencias,
    condicion: opts.condicion || null,
    descripcion: opts.descripcion || '',
    queHacer: opts.queHacer || '',
    necesitasAntes: opts.necesitasAntes || '',
    plantillaMensaje: opts.plantillaMensaje || '',
    queEntregas: opts.queEntregas || '',
    linkTipo: opts.linkTipo || null,
    esCliente: false,
    instruccionesCliente: '',
    plazoHoras: null,
    esRutaCritica: opts.esRutaCritica || false,
    soloAdmin: opts.soloAdmin || false,
    soloKarlaOAdmin: opts.soloKarlaOAdmin || false,
    opcional: opts.opcional || false,
  }
}

function tc(id, fase, titulo, dependencias, opts = {}) {
  return {
    id,
    fase,
    titulo,
    responsable: 'cliente',
    dependencias,
    condicion: opts.condicion || null,
    descripcion: '',
    queHacer: '',
    necesitasAntes: '',
    plantillaMensaje: '',
    queEntregas: '',
    esCliente: true,
    instruccionesCliente: opts.instrucciones || '',
    plazoHoras: opts.plazoHoras || 48,
    esRutaCritica: opts.esRutaCritica || false,
    soloAdmin: false,
    soloKarlaOAdmin: false,
    opcional: false,
  }
}

// ─── Tareas base para todos los paquetes Web ──────────────────────────────

function tareasWebBase() {
  return [
    // ── Fase 1: Arranque ──────────────────────────────────────────────────
    t('w-f1-01', 1, 'Crear ficha del cliente en el sistema', 'admin', [], {
      soloAdmin: true,
      descripcion: 'Registrar los datos del cliente y del proyecto en el sistema.',
      queHacer: 'Registrar el proyecto en el sistema completando todos los campos:\n• Nombre del cliente y empresa\n• Paquete contratado y extras\n• Condiciones técnicas (dominio, hosting, Cloudflare, correos, etc.)\n• Equipo asignado\n• Fechas estimadas de inicio y entrega\n\nEsta tarea desbloquea todo lo demás — no avanzar sin completarla.',
      necesitasAntes: 'Brief del cliente entregado por el vendedor',
      queEntregas: 'Proyecto creado en el sistema con todos los campos completos',
    }),

    t('w-f1-02', 1, 'Crear carpeta en Google Drive', 'equipo', [], {
      linkTipo: 'drive',
      descripcion: 'Crear carpeta del proyecto con estructura estándar.',
      queHacer: 'Crear la carpeta del proyecto en Google Drive bajo la sección Clientes.\nUsar el nombre del cliente como nombre de carpeta.\n\nEstructura de subcarpetas:\n• Brief\n• Boceto\n• Diseño\n• Entregables\n• Recursos del cliente (logo, fotos, etc.)',
      necesitasAntes: 'Nombre del cliente confirmado',
      queEntregas: 'Carpeta creada y compartida con el equipo asignado al proyecto',
    }),

    t('w-f1-03', 1, 'Abrir grupo de WhatsApp del proyecto', 'admin', [], {
      descripcion: 'Crear el grupo con el cliente y el equipo asignado.',
      queHacer: 'Crear el grupo de WhatsApp del proyecto.\nAgregar al grupo:\n• Todos los miembros del equipo asignados\n• El cliente y cualquier intermediario si aplica\n• Jesús siempre\n\nNombre sugerido del grupo: [NOMBRE CLIENTE] — EsBrillante',
      necesitasAntes: 'Número de teléfono del cliente, equipo asignado',
      queEntregas: 'Grupo de WhatsApp activo con todos los participantes',
    }),

    t('w-f1-04', 1, 'Confirmar equipo asignado', 'admin', ['w-f1-03'], {
      soloAdmin: true,
      descripcion: 'Verificar disponibilidad y confirmar roles del equipo para este proyecto.',
      queHacer: 'Verificar disponibilidad y confirmar a cada miembro:\n• Copy — redacción del boceto y contenido\n• Diseñador — diseño visual y construcción del sitio\n• Programador/Técnico — configuración técnica y hosting\n\nSi alguno no está disponible, buscar sustituto o ajustar carga antes de continuar.',
      necesitasAntes: 'Grupo de WhatsApp creado',
      queEntregas: 'Equipo definido. Cada miembro confirmado para el proyecto.',
    }),

    t('w-f1-05', 1, 'Enviar mensaje de bienvenida al cliente', 'admin', ['w-f1-04'], {
      descripcion: 'Enviar el mensaje de inicio al grupo con el link al portal de seguimiento.',
      queHacer: 'Enviar el mensaje de bienvenida al grupo de WhatsApp donde está el cliente.\nPersonalizar la plantilla con:\n• Nombre del cliente\n• Nombre y rol de cada miembro del equipo\n• Próximos pasos específicos de este proyecto\n• Link y contraseña del portal de seguimiento\n\nNo enviar sin personalizar — el cliente debe sentir que fue preparado para él.',
      necesitasAntes: 'Equipo confirmado, proyecto creado en el sistema con link y contraseña del cliente',
      queEntregas: 'Mensaje enviado. El cliente sabe quién es su equipo y cuáles son los próximos pasos.',
      plantillaMensaje: `¡Hola [NOMBRE CLIENTE]! 👋 Bienvenida al grupo de seguimiento de tu proyecto web. 🎉

Por aquí estaremos en contacto durante todo el proceso para que estés al tanto de cada avance y puedas compartir lo que necesitemos de tu parte.

*Te presento al equipo que trabajará contigo:*

👤 *[NOMBRE]* — [ROL]
👤 *[NOMBRE]* — [ROL]
👤 *[NOMBRE]* — [ROL]

*¿Cómo funciona el proceso?*

Trabajamos por etapas. En cada una te avisaremos exactamente qué está pasando y cuándo necesitemos algo de tu parte. Nada quedará en el aire.

*Próximos pasos:*
✦ [NOMBRE COPYWRITER] estará en contacto contigo para conocer mejor tu negocio y arrancar con el contenido del sitio
✦ [NOMBRE TÉCNICO] estará revisando contigo el tema del dominio

*🔎 Seguimiento de tu proyecto:*
Puedes consultar el avance en cualquier momento aquí:
👉 [URL DEL PROYECTO]
Contraseña: [CONTRASEÑA DEL PROYECTO]

¡Estamos muy contentos de trabajar en este proyecto! 💛`,
    }),

    // ── Fase 2: Contenido y Boceto ─────────────────────────────────────────
    t('w-f2-01', 2, 'Solicitar materiales del cliente', 'copy', ['w-f1-05'], {
      descripcion: 'Recopilar materiales existentes del cliente para pre-llenar el brief.',
      queHacer: 'Contactar al cliente para solicitar materiales disponibles antes de armar el brief.\n\nPreguntar:\n• ¿A qué se dedica exactamente el negocio?\n• ¿Cuáles son los servicios o productos principales?\n• ¿Tiene presentaciones, trípticos, catálogos o folletos?\n• ¿Tiene redes sociales activas?\n• ¿Ya tiene textos escritos sobre sus servicios?\n\nCon más material, menos trabajo le queda al cliente y más rápido avanza el proyecto.',
      necesitasAntes: 'Mensaje de bienvenida enviado al cliente',
      queEntregas: 'Materiales del cliente recibidos y subidos a la carpeta en Google Drive',
      plantillaMensaje: `Hola [NOMBRE CLIENTE] 😊 para arrancar con el contenido de tu sitio web necesitamos conocer bien tu negocio.

¿Podrías compartirnos lo siguiente si lo tienes disponible?

📎 Presentaciones, trípticos o folletos de tu negocio
🖼️ Logo en buena calidad
📸 Fotos de tu negocio, equipo o servicios
📱 Links a tus redes sociales
📝 Cualquier texto que ya tengas escrito sobre lo que ofreces

Con esto podemos avanzar mucho más rápido y en muchos casos ya podemos pre-llenar gran parte del documento que necesitamos de tu parte. 🚀

No te preocupes si no tienes todo — con lo que tengas arrancamos.`,
    }),

    t('w-f2-02', 2, 'Armar y enviar brief al cliente', 'copy', ['w-f2-01'], {
      linkTipo: 'brief',
      descripcion: 'Generar el brief personalizado y compartirlo con el cliente.',
      queHacer: 'Generar el brief personalizado usando los materiales del cliente y IA.\n\nSegún el nivel de información disponible:\n• Escenario A (poca info): enviar con preguntas abiertas para que el cliente llene desde cero\n• Escenario B (info parcial): pre-llenar lo que se puede, el cliente completa los huecos\n• Escenario C (info completa): pre-llenar casi todo con IA, el cliente solo valida\n\nCampos prioritarios 🔴 (desbloquean otras tareas):\n• Nombre del negocio y datos de contacto\n• Descripción del negocio\n• Opciones de dominio deseadas\n• Servicios o productos principales\n\nCompartir el brief desde Google Drive, carpeta del cliente.',
      necesitasAntes: 'Materiales del cliente en Drive, brief base de EsBrillante como plantilla',
      queEntregas: 'Brief enviado al cliente con link a Google Docs. Proyecto en espera de campos prioritarios.',
      plantillaMensaje: `Hola [NOMBRE CLIENTE] 😊 te comparto el documento que necesitamos que revises para avanzar con tu sitio web.

👉 [LINK AL BRIEF EN GOOGLE DOCS]

Es un cuestionario sobre tu negocio. Puedes llenarlo poco a poco — Google Docs guarda los cambios automáticamente.

Los campos marcados con 🔴 son los más importantes y los que necesitamos primero para poder avanzar con varias cosas en paralelo.

Si tienes alguna duda mientras lo revisas escríbenos aquí en el grupo. 🙌`,
    }),

    t('w-f2-03', 2, 'Seguimiento al brief del cliente', 'admin', ['w-f2-02'], {
      descripcion: 'Recordatorio si el cliente no completó los campos prioritarios en 48 horas.',
      queHacer: 'Si el cliente no ha completado los campos prioritarios del brief en 48 horas, enviar recordatorio amable.\n\nRevisar el brief antes de enviar para ver qué campos faltan.\nSi después de 4 días sigue sin respuesta, escalar directamente con Jesús.',
      necesitasAntes: 'Brief enviado hace al menos 48 horas sin respuesta en los campos prioritarios',
      queEntregas: 'Cliente retomó el brief y completó campos prioritarios',
      plantillaMensaje: `Hola [NOMBRE CLIENTE] 😊 ¿cómo vas con el documento que te compartimos?

Recuerda que no es necesario llenarlo todo de una vez. Con que nos completes primero los campos marcados con 🔴 ya podemos ir avanzando con varias cosas en paralelo. 🚀

Cualquier duda aquí estamos.`,
    }),

    t('w-f2-04', 2, 'Redacción del boceto por secciones', 'copy', ['w-f2-02'], {
      descripcion: 'Redactar el contenido de cada sección del sitio.',
      queHacer: 'Con los campos prioritarios del brief disponibles, redactar el boceto de contenido:\n• Estructura de secciones del sitio en orden\n• Copy de cada sección: hero, sobre nosotros, servicios, testimonios, contacto\n• CTA sugerido por sección\n• Notas para el Diseñador: indicaciones visuales, énfasis, imágenes sugeridas\n• Aviso legal si el proyecto lo requiere\n\nGuardar en la carpeta Boceto de Google Drive.',
      necesitasAntes: 'Brief con campos prioritarios completos, materiales del cliente en Drive',
      queEntregas: 'Documento de boceto en Google Drive listo para revisión interna antes de presentar al cliente',
    }),

    t('w-f2-05', 2, 'Verificar disponibilidad de dominio', 'admin', ['w-f2-02'], {
      descripcion: 'Revisar opciones de dominio en Porkbun y preparar recomendación.',
      queHacer: 'Verificar en Porkbun cuáles de las opciones del cliente están disponibles.\n\nCriterios para recomendar un dominio:\n• Que incluya el nombre oficial del negocio\n• Fácil de recordar y buscar directamente\n• Preferir .com sobre otras extensiones\n• Si hay varias disponibles, recomendar la que transmita más confianza según el giro\n\nNota sobre extensiones:\n• .com → Porkbun (incluido en el paquete)\n• .mx / .com.mx → Jetthost (costo adicional — requiere autorización del Líder)\n• Otras extensiones → Porkbun (costo adicional — requiere autorización)',
      necesitasAntes: 'Brief con opciones de dominio del cliente (campo prioritario 🔴)',
      queEntregas: 'Lista de dominios disponibles/no disponibles con recomendación justificada, enviada al cliente',
      plantillaMensaje: `Hola [NOMBRE CLIENTE] 😊 te comparto la información sobre el dominio de tu sitio web.

Revisamos las opciones que nos diste y encontramos lo siguiente:

❌ *[DOMINIO NO DISPONIBLE]* — no disponible, ya está registrado
✅ *[DOMINIO DISPONIBLE 1]* — disponible
✅ *[DOMINIO DISPONIBLE 2]* — disponible

*Mi recomendación es [DOMINIO RECOMENDADO]* ya que [RAZÓN DE LA RECOMENDACIÓN].

¿Te parece bien esa opción o prefieres [OTRA OPCIÓN]? 😊`,
    }),

    t('w-f2-06', 2, 'Presentar boceto al cliente', 'admin', ['w-f2-04'], {
      linkTipo: 'boceto',
      descripcion: 'Compartir el boceto con el cliente con instrucciones claras de revisión.',
      queHacer: 'Compartir el link del boceto al cliente por el grupo de WhatsApp.\nEl proyecto entra en pausa en la ruta crítica hasta recibir los comentarios del cliente.\n\nDar instrucciones claras de qué tipo de retroalimentación se espera.',
      necesitasAntes: 'Boceto redactado y revisado internamente por el Líder de Proyecto',
      queEntregas: 'Boceto compartido con el cliente. Proyecto en espera de comentarios.',
      plantillaMensaje: `Hola [NOMBRE CLIENTE] 😊 ya tenemos lista la propuesta de contenido para tu sitio web.

👉 [LINK AL BOCETO EN GOOGLE DOCS]

*¿Qué encontrarás ahí?*
La estructura de tu sitio con los textos propuestos para cada sección — desde el inicio hasta el formulario de contacto.

*¿Qué necesitamos de tu parte?*
Que lo revises y nos digas:
✦ ¿Hay algo que no represente bien tu negocio?
✦ ¿Falta algún servicio o información importante?
✦ ¿Hay algo que quieras cambiar en el tono o la forma en que se describe lo que haces?

Puedes escribir tus comentarios directamente en el documento o mandárnoslos aquí por el grupo. 😊

Tienes 48 horas para revisarlo — con tus comentarios arrancamos con el diseño. 🚀`,
    }),

    t('w-f2-07', 2, 'Investigación de palabras clave (SEO avanzado)', 'copy', ['w-f2-04'], {
      condicion: 'tieneSeoAvanzado',
      descripcion: 'Identificar keywords principales y secundarias para el sitio.',
      queHacer: 'Identificar palabras clave principales y secundarias para el sitio.\nUsar herramientas como Google Keyword Planner, Ubersuggest o Semrush.\n\nDocumentar en Drive:\n• Keyword principal por página\n• Keywords secundarias\n• Volumen de búsqueda estimado\n• Dificultad\n• Intención de búsqueda',
      necesitasAntes: 'Brief completo con descripción del negocio y servicios',
      queEntregas: 'Documento de keywords en Drive con prioridades por sección del sitio',
    }),

    tc('w-f2-c01', 2, 'Confirmar dominio elegido', ['w-f2-05'], {
      instrucciones: 'Revisamos las opciones de dominio disponibles para tu negocio. Por favor indícanos cuál prefieres de las que te presentamos, o si quieres explorar otra alternativa. Este paso es necesario para continuar con la configuración técnica.',
      plazoHoras: 48,
    }),

    tc('w-f2-c02', 2, 'Confirmar qué servicios serán agendables', ['w-f2-04'], {
      condicion: 'tienePlugin',
      instrucciones: 'Para configurar el plugin de citas necesitamos que nos indiques: ¿Qué servicios quieres que tus clientes agenden en línea? ¿Cuáles son los horarios de atención? ¿Cuánto dura cada cita?',
      plazoHoras: 48,
    }),

    tc('w-f2-c03', 2, 'Enviar testimonios o reseñas', ['w-f2-06'], {
      instrucciones: 'Para darle credibilidad a tu sitio necesitamos 2 o 3 testimonios de clientes. Pueden ser textos escritos o capturas de reseñas de Google/Facebook. Envíalos al grupo de WhatsApp.',
      plazoHoras: 72,
    }),

    tc('w-f2-c04', 2, 'Revisar boceto y dar comentarios', ['w-f2-06'], {
      instrucciones: 'Te compartimos el borrador de contenido de tu sitio. Por favor léelo con calma y haznos saber qué cambios deseas. Tienes 48 horas para enviarnos tus comentarios por WhatsApp.',
      plazoHoras: 48,
      esRutaCritica: true,
    }),

    // ── Fase 3: Diseño y Maquetación ──────────────────────────────────────
    t('w-f3-01', 3, 'Definir ruta de construcción del sitio', 'admin', ['w-f2-c04'], {
      soloAdmin: true,
      descripcion: 'Decidir qué herramientas se usarán para construir el sitio.',
      queHacer: 'Definir qué ruta de construcción se usará para este proyecto:\n\n• Ruta A — Elementor + WordPress: cuando el cliente quiere poder editar su sitio después de la entrega\n• Ruta B1 — Theme child GeneratePress con IA: cuando necesita funciones WordPress pero no Elementor\n• Ruta B2 — HTML puro: cuando es un sitio simple, sin funciones WordPress y el cliente no necesita editar\n\nRegistrar la decisión en el brief en Drive.',
      necesitasAntes: 'Brief completo con necesidades del cliente, boceto aprobado',
      queEntregas: 'Ruta definida y registrada. El Diseñador y Programador saben con qué herramientas trabajar.',
    }),

    t('w-f3-02', 3, 'Selección de opciones de plantilla', 'disenador', ['w-f3-01'], {
      descripcion: 'Buscar y seleccionar 3 opciones de plantilla acordes al rubro del cliente.',
      queHacer: 'Buscar en Envato u otras fuentes plantillas que se adapten al giro del cliente.\n\nCriterios de selección:\n• Que se adapte al sector y estilo del cliente\n• Colores y tipografías compatibles con la imagen del cliente\n• Layout que permita las secciones del boceto\n• Buen responsive en móvil\n\nSeleccionar 3 a 5 opciones.\nRegistrar las probadas en el Excel de plantillas de EsBrillante.',
      necesitasAntes: 'Ruta de construcción definida, sitios de referencia del brief, WordPress instalado en staging',
      queEntregas: '3 a 5 opciones seleccionadas y registradas en el Excel',
    }),

    t('w-f3-03', 3, 'Presentar opciones de plantilla al cliente', 'admin', ['w-f3-02'], {
      descripcion: 'Compartir las opciones al cliente con descripción de cada una.',
      queHacer: 'Compartir las opciones de plantilla al cliente en el grupo de WhatsApp.\nIncluir imagen preview o link de demo de cada opción.\nEsperar elección del cliente antes de continuar.',
      necesitasAntes: 'Opciones seleccionadas por el Diseñador y registradas en Excel',
      queEntregas: 'Opciones compartidas con el cliente. Esperar elección.',
      plantillaMensaje: `Hola [NOMBRE CLIENTE] 😊 ya tenemos algunas opciones de diseño para tu sitio web.

Te comparto las propuestas para que elijas la que más te guste como base:

1️⃣ [NOMBRE O DESCRIPCIÓN PLANTILLA 1] — [LINK O IMAGEN]
2️⃣ [NOMBRE O DESCRIPCIÓN PLANTILLA 2] — [LINK O IMAGEN]
3️⃣ [NOMBRE O DESCRIPCIÓN PLANTILLA 3] — [LINK O IMAGEN]

Recuerda que estos son puntos de partida — los colores, tipografías e imágenes se adaptan completamente a tu marca. 😊

¿Cuál te llama más la atención?`,
    }),

    t('w-f3-04', 3, 'Definir paleta de colores y tipografía', 'disenador', ['w-f3-c01'], {
      descripcion: 'Definir colores primarios, secundarios y tipografías del proyecto.',
      queHacer: 'Definir colores primarios y secundarios basados en el logo del cliente y la plantilla elegida.\nDefinir tipografías para títulos y cuerpo de texto.\n\nAnotar todos los códigos hex en el brief en Google Drive:\n• Color primario: #xxxxxx\n• Color secundario: #xxxxxx\n• Color de fondo: #xxxxxx\n• Tipografía títulos: [nombre]\n• Tipografía cuerpo: [nombre]',
      necesitasAntes: 'Plantilla elegida por el cliente, logo del cliente en alta resolución en Drive',
      queEntregas: 'Paleta de colores y tipografías definidas y documentadas en el brief',
    }),

    t('w-f3-05', 3, 'Armar sitio completo con contenido del boceto aprobado', 'disenador', ['w-f3-04', 'w-f2-c04'], {
      descripcion: 'Construir todas las secciones del sitio con el contenido aprobado.',
      queHacer: 'Construir el sitio completo usando el boceto aprobado como base de contenido.\n\nElementos obligatorios:\n• Todas las secciones del boceto aprobado\n• Logo del cliente en buena calidad\n• Fotos del cliente o banco de imágenes (optimizadas)\n• Botón de WhatsApp con widget para móvil\n• Formulario de contacto con Fluent Forms\n• Sección de testimonios\n• Aviso legal si el proyecto lo requiere\n• Logos de aliados o certificaciones si aplica\n\nVerificar responsive durante la construcción — no esperar a la revisión interna.',
      necesitasAntes: 'Boceto aprobado por el cliente, paleta definida, recursos gráficos del cliente en Drive',
      queEntregas: 'Sitio construido en staging listo para avisar al equipo de revisión interna',
    }),

    t('w-f3-06', 3, 'Configurar blog y redactar entradas iniciales', 'copy', ['w-f3-04'], {
      condicion: 'tieneBlog',
      descripcion: 'Crear la sección de blog y redactar las entradas iniciales.',
      queHacer: 'Crear la sección de blog en el sitio y redactar las entradas iniciales acordadas.\nOptimizar cada entrada con las keywords identificadas si el proyecto incluye SEO avanzado.',
      necesitasAntes: 'Sitio en construcción, keywords identificadas si aplica',
      queEntregas: 'Blog configurado con entradas iniciales publicadas o listas',
    }),

    t('w-f3-07', 3, 'Optimización SEO on-page', 'copy', ['w-f3-05'], {
      condicion: 'tieneSeoAvanzado',
      descripcion: 'Optimizar meta títulos, descripciones, headings y alt text.',
      queHacer: 'Con el sitio construido, optimizar cada página usando Yoast SEO:\n• Meta título: keyword principal, máximo 60 caracteres\n• Meta descripción: keyword + CTA, máximo 155 caracteres\n• H1 único por página con keyword principal\n• H2/H3 con keywords secundarias\n• Alt text descriptivo en todas las imágenes\n\nObjetivo: Yoast en verde en las páginas principales.',
      necesitasAntes: 'Sitio construido, documento de keywords en Drive',
      queEntregas: 'Sitio optimizado para SEO. Yoast en verde en páginas principales.',
    }),

    tc('w-f3-c01', 3, 'Elegir plantilla de las opciones presentadas', ['w-f3-03'], {
      instrucciones: 'Te presentamos opciones de diseño para tu sitio. Por favor dinos cuál te gusta más o si hay elementos que quieras combinar. Tu elección define el estilo visual del proyecto.',
      plazoHoras: 48,
      esRutaCritica: true,
    }),

    tc('w-f3-c02', 3, 'Confirmar correo para formulario de contacto', ['w-f3-03'], {
      instrucciones: '¿A qué correo quieres que lleguen los mensajes del formulario de contacto de tu sitio? Puede ser tu correo actual o uno nuevo que configuremos para ti.',
      plazoHoras: 48,
    }),

    // ── Fase 4: Configuración Técnica ──────────────────────────────────────
    t('w-f4-01', 4, 'Crear cuenta del cliente en Enhanced Control Panel', 'programador', [], {
      descripcion: 'Crear cuenta en ECP y configurar el plan de hosting.',
      queHacer: 'Crear cuenta nueva en Enhanced Control Panel a nombre del cliente.\nConfigurar el plan de hosting.\nObtener la IP asignada al sitio — se necesita para los registros DNS.\n\nGuardar las credenciales del cliente en la carpeta del proyecto en Drive.',
      necesitasAntes: 'Datos del cliente para crear la cuenta',
      queEntregas: 'Cuenta creada en ECP con hosting activo. IP del servidor anotada.',
    }),

    t('w-f4-02', 4, 'Instalar WordPress en staging', 'programador', ['w-f4-01'], {
      descripcion: 'Instalar WordPress en subdominio temporal para comenzar desarrollo.',
      queHacer: 'Instalar WordPress en subdominio temporal usando la instalación automática de Enhanced Control Panel.\n\nGuardar credenciales de WordPress admin en Drive:\n• URL del panel: [subdominio]/wp-admin\n• Usuario: [usuario]\n• Contraseña: [contraseña]',
      necesitasAntes: 'Cuenta en ECP activa',
      queEntregas: 'WordPress instalado en staging. Credenciales guardadas en Drive.',
    }),

    t('w-f4-03', 4, 'Instalar y configurar plugins base', 'programador', ['w-f4-02'], {
      descripcion: 'Instalar plugins esenciales del proyecto.',
      queHacer: 'Instalar los plugins esenciales según el tipo de proyecto:\n• Elementor (Ruta A) o GeneratePress (Ruta B)\n• Fluent Forms — formulario de contacto\n• Fluent SMTP — para que los formularios envíen correos\n• Yoast SEO\n• WP Rocket o similar para caché\n• Wordfence o similar para seguridad básica\n\nActivar y hacer configuración básica de cada uno.',
      necesitasAntes: 'WordPress instalado en staging',
      queEntregas: 'Plugins instalados, activados y con configuración básica',
    }),

    t('w-f4-04', 4, 'Configurar SMTP con Mailjet', 'programador', ['w-f4-03'], {
      descripcion: 'Conectar WordPress a Mailjet para que los formularios envíen correos.',
      queHacer: 'El servidor de Enhanced Control Panel no incluye SMTP por defecto — sin esto los formularios no envían correos.\n\nProceso:\n1. Seleccionar la cuenta de Mailjet de EsBrillante con capacidad disponible (EsBrillante maneja varias cuentas)\n2. Agregar el dominio del cliente en Mailjet para obtener API Key y Secret Key\n3. En WordPress ir a Fluent SMTP → Settings → seleccionar Mailjet como proveedor\n4. Ingresar API Key y Secret Key\n5. Configurar el correo remitente (correo del cliente o uno genérico del dominio)\n6. Enviar correo de prueba y verificar que llegue y no caiga en spam\n\nGuardar las credenciales de Mailjet usadas en Drive.',
      necesitasAntes: 'Fluent SMTP instalado, dominio del cliente (puede ser staging por ahora)',
      queEntregas: 'SMTP configurado y probado. Formularios enviando correos correctamente desde Mailjet.',
    }),

    t('w-f4-05', 4, 'Instalar plantilla y preparar estructura base', 'programador', ['w-f4-02', 'w-f3-c01'], {
      descripcion: 'Instalar la plantilla elegida por el cliente y configurar estructura inicial.',
      queHacer: 'Instalar la plantilla elegida por el cliente:\n• Importar demo si aplica para acelerar el desarrollo\n• Eliminar páginas de demo que no se usarán\n• Crear estructura de páginas del sitio según el boceto\n• Configurar menú de navegación básico',
      necesitasAntes: 'WordPress instalado, plantilla elegida por el cliente',
      queEntregas: 'Plantilla instalada y estructura base de páginas creada',
    }),

    t('w-f4-06', 4, 'Configurar Google Analytics', 'programador', ['w-f4-02'], {
      condicion: 'requiereAnalytics',
      descripcion: 'Crear propiedad GA4 e instalar el código de seguimiento.',
      queHacer: 'Crear propiedad GA4 en la cuenta de Analytics del cliente o de EsBrillante según lo acordado.\n\nMétodos de instalación:\n• Google Site Kit (plugin WordPress) — recomendado\n• Código manual en header via functions.php\n• Google Tag Manager si el proyecto es más complejo\n\nVerificar que el seguimiento funcione antes de marcar como completa (ver en tiempo real).',
      necesitasAntes: 'WordPress instalado, acceso a la cuenta de Google del cliente',
      queEntregas: 'GA4 activo y registrando visitas en tiempo real',
    }),

    t('w-f4-07', 4, 'Instalar y configurar plugin de agendamiento', 'programador', ['w-f4-03', 'w-f2-c02'], {
      condicion: 'tienePlugin',
      descripcion: 'Configurar servicios, horarios y disponibilidad del plugin de citas.',
      queHacer: 'Instalar el plugin de agendamiento (Bookly, Amelia, CalendarWP o similar).\n\nConfigurar según los datos confirmados por el cliente:\n• Servicios disponibles para agendar\n• Horarios de atención por día\n• Duración de cada cita\n• Buffer entre citas si aplica\n• Correo de notificación al cliente y al negocio\n\nHacer prueba de agendamiento completa antes de cerrar la tarea.',
      necesitasAntes: 'Plugins base instalados, confirmación del cliente de servicios y horarios',
      queEntregas: 'Plugin configurado, prueba de agendamiento completa exitosa',
    }),

    t('w-f4-08', 4, 'Instalar y configurar WooCommerce', 'programador', ['w-f4-03'], {
      condicion: 'tieneEcommerce',
      descripcion: 'Instalar WooCommerce y configurar moneda, impuestos y métodos de pago.',
      queHacer: 'Instalar WooCommerce y hacer la configuración básica:\n• Moneda: MXN (o la que aplique al cliente)\n• Impuestos según el régimen del cliente\n• Páginas de tienda, carrito y checkout configuradas\n• Métodos de pago básicos habilitados',
      necesitasAntes: 'WordPress con plugins base instalados',
      queEntregas: 'WooCommerce instalado y configurado con ajustes básicos',
    }),

    t('w-f4-09', 4, 'Cargar productos al catálogo', 'programador', ['w-f4-08'], {
      condicion: 'tieneEcommerce',
      descripcion: 'Cargar los productos con fotos, descripciones y precios.',
      queHacer: 'Cargar los productos en WooCommerce con:\n• Nombre del producto\n• Descripción corta y larga\n• Precio\n• Imágenes (optimizadas para web — máximo 500kb)\n• Categorías\n• SKU si aplica\n\nVerificar que cada producto se vea correctamente en el catálogo.',
      necesitasAntes: 'WooCommerce configurado, listado de productos con fotos y precios del cliente',
      queEntregas: 'Productos cargados y visibles en el catálogo',
    }),

    t('w-f4-10', 4, 'Configurar pasarela de pago', 'programador', ['w-f4-08'], {
      condicion: 'tienePasarela',
      descripcion: 'Integrar y configurar la pasarela de pago seleccionada.',
      queHacer: 'Integrar la pasarela de pago seleccionada (Stripe, MercadoPago o PayPal).\n\nProceso:\n1. Configurar credenciales de API en WooCommerce\n2. Activar modo sandbox para pruebas\n3. Realizar transacción de prueba completa\n4. Confirmar que el correo de confirmación llega\n5. Cambiar a modo producción solo cuando el cliente lo autorice\n\nGuardar credenciales API en Drive.',
      necesitasAntes: 'WooCommerce configurado, credenciales API de la pasarela del cliente',
      queEntregas: 'Pasarela integrada y prueba de pago exitosa en sandbox',
    }),

    t('w-f4-11', 4, 'Registrar dominio', 'admin', ['w-f2-c01'], {
      descripcion: 'Registrar el dominio confirmado por el cliente a su nombre.',
      queHacer: 'Registrar el dominio a nombre del cliente. El dominio SIEMPRE se registra a nombre del cliente — nunca a nombre de EsBrillante.\n\nPlataforma según extensión:\n• .com → Porkbun (cuenta EsBrillante) — incluido en el paquete\n• .mx / .com.mx → Jetthost — costo adicional, requiere autorización del Líder primero\n• Otras extensiones → Porkbun — costo adicional, requiere autorización\n\nProceso en Porkbun (.com):\n1. Buscar el dominio confirmado\n2. Registrar el dominio\n3. Llenar los datos Whois con información exacta del cliente\n4. Confirmar que quedó registrado a nombre del cliente',
      necesitasAntes: 'Dominio confirmado por el cliente (tarea del cliente completada)',
      queEntregas: 'Dominio registrado a nombre del cliente. Confirmación enviada en el grupo de WhatsApp.',
      plantillaMensaje: `¡Listo [NOMBRE CLIENTE]! 🎉 Tu dominio [DOMINIO] quedó registrado a tu nombre.

Este dominio es tuyo — EsBrillante solo lo administra durante el proyecto para conectarlo a tu sitio web.

Seguimos avanzando. 🚀`,
    }),

    t('w-f4-12', 4, 'Conectar dominio a Cloudflare', 'programador', ['w-f4-11'], {
      condicion: 'requiereCloudflare',
      descripcion: 'Agregar el dominio a Cloudflare y actualizar los nameservers.',
      queHacer: 'Agregar el dominio del cliente a la cuenta de Cloudflare de EsBrillante.\n\nProceso:\n1. Cloudflare → Agregar sitio → ingresar el dominio del cliente\n2. Cloudflare asigna 2 nameservers — copiarlos\n3. Entrar a Porkbun o Jetthost donde está registrado el dominio\n4. Reemplazar los nameservers actuales con los 2 de Cloudflare\n5. Guardar cambios\n6. Esperar propagación: 15 minutos a 24 horas\n\n⚠️ NO marcar como completa hasta que Cloudflare confirme los nameservers activos.',
      necesitasAntes: 'Dominio registrado, acceso a Cloudflare y a Porkbun/Jetthost',
      queEntregas: 'Dominio activo en Cloudflare con DNS propagados',
    }),

    t('w-f4-12b', 4, 'Apuntar DNS al hosting (sin Cloudflare)', 'programador', ['w-f4-11', 'w-f4-01'], {
      condicion: 'sinCloudflare',
      descripcion: 'Configurar registros DNS directamente en el registrador de dominio.',
      queHacer: 'Configurar registros DNS directamente en Porkbun o Jetthost:\n• Registro A: @ → IP del servidor de Enhanced Control Panel\n• Registro CNAME: www → dominio.com\n\nEsperar propagación (puede tomar hasta 24 horas).',
      necesitasAntes: 'Dominio registrado, IP del servidor de ECP',
      queEntregas: 'DNS configurados apuntando al hosting',
    }),

    t('w-f4-13', 4, 'Apuntar DNS al hosting en Cloudflare', 'programador', ['w-f4-12', 'w-f4-01'], {
      condicion: 'requiereCloudflare',
      descripcion: 'Crear registros A y CNAME en Cloudflare apuntando al hosting.',
      queHacer: 'En Cloudflare, crear los registros DNS para apuntar al hosting:\n• Registro A: nombre @ → IP del servidor de Enhanced Control Panel\n• Registro CNAME: nombre www → dominio.com\n\nSolo crear estos 2 registros — no agregar otros a menos que el proyecto lo requiera específicamente.',
      necesitasAntes: 'Dominio activo en Cloudflare, IP del servidor de ECP',
      queEntregas: 'Registros DNS configurados en Cloudflare. Sitio accesible desde el dominio.',
    }),

    t('w-f4-14', 4, 'Instalar WordPress en dominio final', 'programador', ['w-f4-13', 'w-f4-12b'], {
      descripcion: 'Instalar WordPress en el dominio final una vez que los DNS están propagados.',
      queHacer: 'Con el dominio apuntando al hosting, instalar WordPress en el dominio final.\nPuede ser migración del staging o instalación nueva según lo más eficiente.\n\nVerificar:\n• El sitio carga en el dominio del cliente\n• El panel de WordPress es accesible en /wp-admin\n• Las credenciales son correctas\n\nGuardar credenciales finales en Drive.',
      necesitasAntes: 'DNS configurados y propagados, dominio accesible',
      queEntregas: 'WordPress funcionando en el dominio final. Credenciales en Drive.',
    }),

    t('w-f4-15', 4, 'Migrar diseño y plugins al dominio final', 'programador', ['w-f4-14'], {
      descripcion: 'Migrar todo el trabajo de staging al dominio final del cliente.',
      queHacer: 'Migrar el sitio completo de staging al dominio final:\n• Contenido y páginas\n• Diseño y tema\n• Plugins y configuraciones\n• Imágenes y medios\n\nHerramientas recomendadas: Duplicator, All-in-One WP Migration o copia manual.\n\nVerificar que todo funcione correctamente en el dominio final antes de cerrar.',
      necesitasAntes: 'WordPress en dominio final, sitio completo construido en staging',
      queEntregas: 'Sitio completo en dominio final funcionando igual que en staging',
    }),

    t('w-f4-16', 4, 'Configurar correos corporativos', 'programador', ['w-f4-12', 'w-f4-11', 'w-f4-01'], {
      condicion: 'requiereCorreos',
      descripcion: 'Crear cuentas de correo corporativo y configurar registros MX.',
      queHacer: 'Crear las cuentas de correo corporativo según lo acordado con el cliente.\nConfigurar los registros MX en Cloudflare (o en el registrador si no hay Cloudflare).\n\nVerificar que los correos se envíen y reciban correctamente.\nGuardar todas las credenciales en Drive.',
      necesitasAntes: 'Dominio activo (en Cloudflare si aplica)',
      queEntregas: 'Correos corporativos activos y funcionando. Credenciales en Drive.',
    }),

    t('w-f4-17', 4, 'Conectar Google Search Console', 'programador', ['w-f4-14'], {
      condicion: 'requiereSearchConsole',
      descripcion: 'Verificar dominio en Search Console y enviar el sitemap XML.',
      queHacer: 'Verificar el dominio del cliente en Google Search Console.\n\nMétodo de verificación recomendado:\n• Registro DNS TXT en Cloudflare (el más confiable)\n\nUna vez verificado:\n• Enviar el sitemap XML generado por Yoast SEO\n• Verificar que Search Console comience a indexar el sitio',
      necesitasAntes: 'Dominio final activo, Yoast SEO configurado con sitemap',
      queEntregas: 'Dominio verificado en Search Console. Sitemap enviado y siendo procesado.',
    }),

    // ── Fase 5: Revisión Interna ───────────────────────────────────────────
    t('w-f5-01', 5, 'Avisar al equipo que el sitio está listo para revisión', 'disenador', ['w-f3-05', 'w-f4-15'], {
      descripcion: 'Notificar en el grupo interno que el sitio está listo para revisión interna.',
      queHacer: 'Avisar en el grupo interno de WhatsApp "Diseño Web" que el sitio está listo para revisión interna.\nIncluir el link del sitio en staging para que el revisor acceda directamente.',
      necesitasAntes: 'Sitio completamente construido y migrado',
      queEntregas: 'Aviso enviado en el grupo interno',
      plantillaMensaje: `✅ Sitio listo para revisión interna

Proyecto: [NOMBRE CLIENTE]
Link: [URL DEL STAGING O DOMINIO]
Paquete: [PAQUETE]
Extras: [PLUGIN DE AGENDAMIENTO / SMTP / OTROS SI APLICA]

Queda pendiente revisión antes de compartir al cliente.`,
    }),

    t('w-f5-02', 5, 'Revisión interna completa del sitio', 'karla', ['w-f5-01'], {
      soloKarlaOAdmin: true,
      descripcion: 'Revisar el sitio contra el boceto aprobado usando checklist completo.',
      queHacer: `Revisar el sitio completo antes de presentar al cliente. Checklist:

🎨 DISEÑO GENERAL
□ Consistente con la identidad visual del cliente (colores, tipografías, logo)
□ Logo correcto en todas las secciones donde aparece
□ Imágenes de buena calidad y bien posicionadas
□ Sin textos de relleno (Lorem Ipsum)
□ Sin secciones vacías o incompletas
□ Espaciado uniforme entre secciones
□ Botones CTA visibles con buen contraste

📱 RESPONSIVO
□ Móvil 375px — se ve bien
□ Tablet 768px — se ve bien
□ Desktop 1280px+ — se ve bien
□ Menú de navegación funciona en móvil
□ Imágenes no se cortan ni distorsionan en móvil
□ Textos legibles sin hacer zoom en móvil
□ Botones táctiles mínimo 44px

🔗 FUNCIONALIDAD
□ Todos los botones del menú llevan a la sección correcta
□ Botón WhatsApp abre con el número correcto del cliente
□ Botón WhatsApp funciona en móvil
□ Links a redes sociales funcionan y abren en pestaña nueva

📋 FORMULARIO
□ Formulario envía correctamente (hacer prueba real)
□ El correo de prueba llega al destino configurado
□ El correo no cae en spam
□ El formulario muestra mensaje de confirmación al enviar
□ Los campos obligatorios están marcados

⚡ VELOCIDAD
□ Carga en menos de 3 segundos en desktop
□ Carga en menos de 4 segundos en móvil
□ Imágenes optimizadas (máximo 500kb sin comprimir)

📝 CONTENIDO
□ Todos los textos del boceto aprobado incluidos
□ Sin errores ortográficos evidentes
□ Datos de contacto del cliente correctos
□ Número de WhatsApp correcto (con +52)

🔒 SSL
□ El sitio carga con HTTPS — candado visible
□ Sin advertencias de contenido mixto`,
      necesitasAntes: 'Aviso del Diseñador de que el sitio está listo',
      queEntregas: 'Sitio aprobado internamente, o lista de correcciones enviada al Diseñador',
      plantillaMensaje: `Revisión interna — [NOMBRE CLIENTE]

Puntos a corregir antes de enviar al cliente:

🔴 [PUNTO 1 — descripción específica de qué corregir y dónde]
🔴 [PUNTO 2 — descripción específica]
🔴 [PUNTO 3 — descripción específica]

Favor de corregir y avisar cuando esté listo para segunda revisión.`,
    }),

    t('w-f5-03', 5, 'Verificar responsive móvil y desktop', 'karla', ['w-f5-02'], {
      soloKarlaOAdmin: true,
      descripcion: 'Revisar el sitio en diferentes dispositivos y resoluciones.',
      queHacer: 'Revisar el sitio en Chrome DevTools con estos tamaños:\n• 375px (iPhone SE)\n• 390px (iPhone 14)\n• 768px (iPad)\n• 1280px+ (desktop)\n\nVerificar especialmente:\n• Imágenes no se cortan ni distorsionan\n• Textos legibles sin hacer zoom\n• Botones con mínimo 44px táctil\n• Menú hamburguesa funciona correctamente',
      necesitasAntes: 'Revisión de contenido y diseño completada',
      queEntregas: 'Responsive verificado en todos los breakpoints principales',
    }),

    t('w-f5-04', 5, 'Probar formulario de contacto', 'karla', ['w-f5-02'], {
      soloKarlaOAdmin: true,
      descripcion: 'Enviar mensaje de prueba real y verificar que llegue.',
      queHacer: 'Enviar un mensaje de prueba real desde el formulario de contacto del sitio.\n\nVerificar:\n• El formulario muestra mensaje de confirmación al enviar\n• El correo llega al destino configurado (correo del cliente)\n• No cae en carpeta de spam\n• El mensaje tiene formato correcto\n\nSi no llega, revisar la configuración de SMTP en Fluent SMTP.',
      necesitasAntes: 'SMTP configurado con Mailjet',
      queEntregas: 'Formulario probado y funcionando. Correo recibido correctamente.',
    }),

    t('w-f5-05', 5, 'Probar botón de WhatsApp', 'karla', ['w-f5-02'], {
      soloKarlaOAdmin: true,
      descripcion: 'Verificar que el botón de WhatsApp funcione en móvil y desktop.',
      queHacer: 'Probar el botón de WhatsApp en:\n• Desktop (Chrome, Firefox)\n• Móvil real — iOS y Android si es posible\n\nVerificar:\n• Abre WhatsApp con el número correcto del cliente\n• El número incluye código de país (+52 para México)\n• Si tiene mensaje pre-escrito, que sea correcto',
      necesitasAntes: 'Sitio con botón de WhatsApp configurado',
      queEntregas: 'Botón de WhatsApp verificado en móvil y desktop',
    }),

    t('w-f5-06', 5, 'Probar plugin de agendamiento', 'karla', ['w-f5-02'], {
      condicion: 'tienePlugin',
      soloKarlaOAdmin: true,
      descripcion: 'Hacer una cita de prueba completa: servicio, fecha, hora y confirmación.',
      queHacer: 'Hacer una cita de prueba completa:\n1. Seleccionar servicio en el sitio\n2. Elegir fecha y hora disponible\n3. Llenar datos de contacto\n4. Confirmar la cita\n5. Verificar correo de confirmación (llega al cliente y al negocio)\n6. Verificar que la cita aparezca en el panel del plugin\n7. Cancelar/eliminar la cita de prueba',
      necesitasAntes: 'Plugin configurado con servicios y horarios reales',
      queEntregas: 'Flujo de agendamiento completo verificado y funcionando',
    }),

    t('w-f5-07', 5, 'Probar flujo de compra (Ecommerce)', 'karla', ['w-f5-02'], {
      condicion: 'tieneEcommerce',
      soloKarlaOAdmin: true,
      descripcion: 'Realizar compra de prueba completa en modo sandbox.',
      queHacer: 'Realizar compra de prueba en modo sandbox:\n1. Seleccionar producto del catálogo\n2. Agregar al carrito\n3. Proceder al checkout\n4. Completar con datos de prueba\n5. Usar tarjeta de prueba de la pasarela\n6. Verificar confirmación de compra\n7. Verificar correo de confirmación',
      necesitasAntes: 'WooCommerce y pasarela configurados en modo sandbox',
      queEntregas: 'Flujo de compra completo verificado en sandbox',
    }),

    t('w-f5-08', 5, 'Revisar avisos legales', 'karla', ['w-f5-02'], {
      soloKarlaOAdmin: true,
      descripcion: 'Verificar que política de privacidad y aviso legal estén presentes.',
      queHacer: 'Verificar que el sitio incluya:\n• Política de privacidad (obligatoria si se recopilan datos por formularios)\n• Aviso legal si el proyecto lo requiere\n• Aviso de cookies si aplica\n\nVerificar que sean accesibles desde el footer y estén actualizados con los datos del cliente.',
      necesitasAntes: 'Sitio construido',
      queEntregas: 'Avisos legales presentes, correctos y accesibles',
    }),

    t('w-f5-09', 5, 'Dar visto bueno interno para presentar al cliente', 'karla', ['w-f5-03', 'w-f5-04', 'w-f5-05', 'w-f5-08'], {
      soloKarlaOAdmin: true,
      descripcion: 'Confirmar internamente que el sitio está listo para presentar al cliente.',
      queHacer: 'Confirmar que todos los puntos del checklist de revisión interna están en verde.\n\n⛔ No avanzar a la Fase 6 sin esta confirmación.\n\nSi hay puntos pendientes, regresar al Diseñador con lista específica de correcciones antes de dar el visto bueno.',
      necesitasAntes: 'Todas las revisiones internas completadas',
      queEntregas: 'Visto bueno dado. El proyecto puede avanzar a Revisión con el Cliente.',
    }),

    // ── Fase 6: Revisión con Cliente ──────────────────────────────────────
    t('w-f6-01', 6, 'Compartir link del sitio con instrucciones de revisión', 'admin', ['w-f5-09'], {
      linkTipo: 'diseno',
      descripcion: 'Enviar el link al cliente con instrucciones claras de cómo revisar.',
      queHacer: 'Compartir el link del sitio al cliente por el grupo de WhatsApp.\nEl proyecto entra en pausa en la ruta crítica hasta recibir comentarios.\n\nCanales para recibir observaciones:\n• Canal A (recomendado): herramienta de anotaciones en prototipos.esbrillante.mx\n• Canal B: documento de observaciones en Google Docs\n• Canal C: mensajes en el grupo de WhatsApp (el Líder debe consolidarlos antes de pasarlos al Diseñador)',
      necesitasAntes: 'Visto bueno interno dado, link del sitio listo',
      queEntregas: 'Link compartido con el cliente. Proyecto en espera de observaciones.',
      plantillaMensaje: `Hola [NOMBRE CLIENTE] 😊 ¡ya está lista la primera versión de tu sitio web!

👉 [LINK DEL SITIO]

Te pedimos que lo revises con calma — en computadora y en tu celular — y nos compartas tus observaciones.

Te recomendamos revisar:
✦ Que los textos de cada sección estén correctos
✦ Que tu información de contacto esté bien (teléfono, correo, dirección)
✦ Que los colores y el diseño representen bien tu marca
✦ Que todo funcione bien desde tu celular

Puedes mandarnos tus comentarios aquí en el grupo, sección por sección.

⏰ Tienes 48 horas para revisarlo. Con tus comentarios hacemos los ajustes finales. 🚀`,
    }),

    t('w-f6-02', 6, 'Aplicar correcciones ronda 1', 'equipo', ['w-f6-c01'], {
      descripcion: 'Aplicar todos los cambios solicitados por el cliente en la primera ronda.',
      queHacer: 'Aplicar los ajustes solicitados por el cliente en la primera ronda.\n\nSi las observaciones llegaron por WhatsApp, el Líder debe haberlas consolidado en un documento antes de pasarlas.\n\nEl paquete incluye máximo 2 rondas de correcciones. Si el cliente solicita cambios mayores que impliquen rediseño completo de secciones, el Líder debe evaluarlo antes de proceder.\n\nSi el sitio fue construido con IA, las observaciones pueden pasarse directamente a Claude Code u herramienta similar.',
      necesitasAntes: 'Observaciones del cliente recibidas y consolidadas por el Líder',
      queEntregas: 'Correcciones aplicadas. Avisar al Líder para revisión rápida antes de compartir de nuevo.',
    }),

    t('w-f6-03', 6, 'Compartir sitio corregido y solicitar aprobación', 'admin', ['w-f6-02'], {
      descripcion: 'Notificar al cliente que las correcciones están aplicadas.',
      queHacer: 'Informar al cliente que los ajustes están aplicados y solicitar aprobación o segunda ronda.\nLa aprobación del cliente por escrito en WhatsApp es suficiente para proceder con la entrega.',
      necesitasAntes: 'Correcciones aplicadas y revisadas internamente',
      queEntregas: 'Cliente notificado. Esperar aprobación o segunda ronda de correcciones.',
      plantillaMensaje: `Hola [NOMBRE CLIENTE] 😊 ya aplicamos todos los ajustes que nos indicaste.

👉 [LINK DEL SITIO ACTUALIZADO]

Por favor dale un último vistazo y confírmanos que todo está a tu gusto.

Con tu aprobación procedemos con la entrega final. 🚀`,
    }),

    t('w-f6-04', 6, 'Aplicar correcciones ronda 2', 'equipo', ['w-f6-c02'], {
      opcional: true,
      descripcion: 'Aplicar la segunda y última ronda de correcciones del paquete.',
      queHacer: 'Aplicar la segunda y última ronda de correcciones incluida en el paquete.\n\nSi el cliente solicita una tercera ronda, el Líder debe evaluar si tiene costo adicional antes de proceder.',
      necesitasAntes: 'Segunda ronda de observaciones del cliente recibidas',
      queEntregas: 'Segunda ronda de correcciones aplicadas',
    }),

    t('w-f6-05', 6, 'Registrar aprobación final del cliente', 'admin', ['w-f6-c03'], {
      soloAdmin: true,
      descripcion: 'Documentar la aprobación final del cliente en el sistema.',
      queHacer: 'Documentar la aprobación final del cliente.\nLa aprobación por escrito en WhatsApp es suficiente — no se necesita documento firmado.\nSi el cliente aprobó verbalmente en llamada, solicitar confirmación escrita en el grupo.',
      necesitasAntes: 'Aprobación escrita del cliente recibida en el grupo de WhatsApp',
      queEntregas: 'Aprobación registrada. El proyecto puede avanzar a Fase 7.',
    }),

    tc('w-f6-c01', 6, 'Revisar el sitio y enviar comentarios (ronda 1)', ['w-f6-01'], {
      instrucciones: 'Tu sitio está listo para que lo revises. Navega todas las secciones, prueba los formularios y botones. Envíanos tus comentarios por WhatsApp en un máximo de 48 horas.',
      plazoHoras: 48,
      esRutaCritica: true,
    }),

    tc('w-f6-c02', 6, 'Revisar correcciones y dar aprobación o segunda vuelta', ['w-f6-03'], {
      instrucciones: 'Aplicamos los cambios que solicitaste. Por favor revisa de nuevo y haznos saber si hay algo más. Recuerda que el paquete incluye hasta 2 rondas de correcciones.',
      plazoHoras: 48,
      esRutaCritica: true,
    }),

    tc('w-f6-c03', 6, 'Dar aprobación final por escrito', ['w-f6-c02'], {
      instrucciones: '¡Ya casi terminamos! Para proceder con la entrega oficial necesitamos tu aprobación por escrito. Un mensaje en WhatsApp confirmando "Apruebo el sitio" es suficiente.',
      plazoHoras: 48,
      esRutaCritica: true,
    }),

    // ── Fase 7: Entrega y Cierre ───────────────────────────────────────────
    t('w-f7-01', 7, 'Confirmar pago final liquidado', 'admin', ['w-f6-05'], {
      soloAdmin: true,
      descripcion: 'Verificar que el pago final esté recibido antes de entregar accesos.',
      queHacer: 'Verificar que el cliente liquidó el saldo pendiente antes de proceder con cualquier acción de entrega.\n\n⛔ REGLA ABSOLUTA: No se entregan accesos ni se migra el sitio al dominio final sin liquidación confirmada.',
      necesitasAntes: 'Aprobación final del cliente registrada',
      queEntregas: 'Pago confirmado. Autorización para proceder con la entrega.',
    }),

    t('w-f7-02', 7, 'Migrar sitio al dominio final y verificar SSL', 'programador', ['w-f7-01', 'w-f4-15'], {
      descripcion: 'Migrar el sitio aprobado al dominio final y verificar que todo funcione.',
      queHacer: 'Migrar el sitio al dominio final y verificar:\n1. El sitio carga correctamente en el dominio del cliente\n2. SSL activo — candado HTTPS visible en el navegador\n3. Prueba del formulario de contacto\n4. Prueba del botón de WhatsApp en móvil\n5. Prueba del plugin de agendamiento si aplica',
      necesitasAntes: 'Pago final confirmado, aprobación escrita del cliente, dominio apuntado al hosting',
      queEntregas: 'Sitio en vivo en el dominio final con SSL activo y todo verificado',
    }),

    t('w-f7-03', 7, 'Prueba final en dominio oficial', 'karla', ['w-f7-02'], {
      soloKarlaOAdmin: true,
      descripcion: 'Verificar rápidamente que todo funcione en el dominio final.',
      queHacer: 'Verificación rápida en el dominio final:\n• El sitio carga con HTTPS\n• Formulario funciona y el correo llega\n• Botón de WhatsApp funciona en móvil\n• Plugin de agendamiento funciona si aplica\n• Velocidad de carga aceptable\n\nEs una verificación de confirmación — la revisión profunda ya se hizo en la Fase 5.',
      necesitasAntes: 'Sitio migrado al dominio final',
      queEntregas: 'Sitio verificado en producción. Listo para entregar accesos al cliente.',
    }),

    t('w-f7-04', 7, 'Entregar accesos al cliente por correo', 'admin', ['w-f7-03', 'w-f7-01'], {
      soloAdmin: true,
      descripcion: 'Enviar todas las credenciales del proyecto al cliente de forma organizada.',
      queHacer: 'Enviar al cliente por correo electrónico todos los accesos de su proyecto.\n\nAccesos a incluir según el proyecto:\n• Dominio — panel de Porkbun o Jetthost\n• Hosting — Enhanced Control Panel\n• WordPress — URL wp-admin, usuario y contraseña\n• Correo corporativo si aplica\n• Plugin de agendamiento si aplica\n\nEl correo también incluye recomendaciones de seguridad.\nConfirmar en el grupo de WhatsApp que el correo fue enviado.',
      necesitasAntes: 'Sitio verificado en producción, pago final confirmado',
      queEntregas: 'Correo con accesos enviado. Confirmación en el grupo de WhatsApp.',
      plantillaMensaje: `Asunto: 🎉 Tu sitio web está listo — aquí están tus accesos

Hola [NOMBRE CLIENTE],

¡Tu sitio web ya está en vivo! 🚀 Aquí te compartimos todos los accesos de tu proyecto.

---

🌐 DOMINIO
Sitio web: [URL]
Panel del dominio: [LINK]
Usuario: [USUARIO]
Contraseña: [CONTRASEÑA]

🖥️ HOSTING
Panel: [LINK]
Usuario: [USUARIO]
Contraseña: [CONTRASEÑA]

⚙️ WORDPRESS
Panel de administración: [URL/wp-admin]
Usuario: [USUARIO]
Contraseña: [CONTRASEÑA]

[AGREGAR SEGÚN EL PROYECTO:]
📅 Plugin de agendamiento: [LINK / CREDENCIALES]
📧 Correo corporativo: [CREDENCIALES]

---

🔐 RECOMENDACIÓN DE SEGURIDAD
Te recomendamos guardar estas credenciales en un gestor de contraseñas seguro como Bitwarden (gratuito). Nunca compartas estas contraseñas por WhatsApp.

🛟 SOPORTE
Si necesitas ayuda o tienes alguna duda técnica, escríbenos y con gusto te ayudamos.

📅 RENOVACIONES
Te avisaremos con anticipación cuando se acerque la fecha de renovación de tu dominio y hosting.

Fue un placer trabajar en este proyecto. ¡Mucho éxito! 💛

Equipo EsBrillante
📩 web@esbrillante.mx`,
    }),

    t('w-f7-05', 7, 'Capacitación básica de WordPress al cliente', 'admin', ['w-f7-04'], {
      condicion: 'requiereCapacitacion',
      descripcion: 'Dar capacitación de 20-30 minutos para que el cliente edite su sitio.',
      queHacer: 'Dar al cliente capacitación básica de WordPress.\nFormato recomendado: videollamada de 20 a 30 minutos.\n\nTemas a cubrir:\n• Cómo acceder al panel de WordPress\n• Cómo editar textos e imágenes con Elementor\n• Cómo revisar los mensajes del formulario de contacto\n• Cómo gestionar citas desde el plugin si aplica\n• Qué NO tocar para no afectar el funcionamiento\n• Cómo contactar a EsBrillante si necesita ayuda\n\nSi el cliente prefiere video grabado, preparar grabación.',
      necesitasAntes: 'Accesos entregados al cliente',
      queEntregas: 'Cliente capacitado. Video compartido por correo si se grabó la sesión.',
      plantillaMensaje: `Hola [NOMBRE CLIENTE] 😊 ya tienes todos tus accesos listos.

El último paso es una pequeña capacitación de 20-30 minutos para que sepas cómo actualizar tu sitio cuando lo necesites.

¿Cuándo tienes disponibilidad esta semana para una videollamada rápida? 📅`,
    }),

    t('w-f7-06', 7, 'Capacitación extendida de WordPress', 'admin', ['w-f7-04'], {
      condicion: 'tieneCapacitacionExtendida',
      descripcion: 'Sesión extendida: WooCommerce, plugins avanzados, SEO básico.',
      queHacer: 'Dar la sesión extendida cubriendo:\n• WooCommerce: agregar/editar productos, ver pedidos, configurar envíos\n• Plugins avanzados del proyecto\n• SEO básico con Yoast\n• Cómo gestionar el blog si aplica',
      necesitasAntes: 'Capacitación básica completada, accesos entregados',
      queEntregas: 'Capacitación extendida completada. Video compartido si se grabó.',
    }),

    t('w-f7-07', 7, 'Entregar accesos a correos corporativos', 'admin', ['w-f7-01'], {
      condicion: 'requiereCorreos',
      soloAdmin: true,
      descripcion: 'Enviar al cliente las credenciales de los correos corporativos.',
      queHacer: 'Enviar al cliente por correo las credenciales de sus correos corporativos.\nIncluir instrucciones básicas de cómo configurarlos en su celular o computadora.',
      necesitasAntes: 'Correos corporativos funcionando, pago final confirmado',
      queEntregas: 'Credenciales de correos corporativos entregadas al cliente',
    }),

    t('w-f7-08', 7, 'Aviso de entrega en el grupo de WhatsApp', 'admin', ['w-f7-04'], {
      descripcion: 'Enviar mensaje de cierre del proyecto al cliente en el grupo.',
      queHacer: 'Enviar el mensaje de cierre del proyecto en el grupo de WhatsApp.\nEs el cierre formal del proyecto y la invitación a seguir en contacto.',
      necesitasAntes: 'Accesos entregados, capacitación dada si aplica',
      queEntregas: 'Mensaje de cierre enviado en el grupo del cliente',
      plantillaMensaje: `Hola [NOMBRE CLIENTE] 😊 ¡tu sitio web ya está 100% entregado! 🎉

🌐 [URL DEL SITIO]

Fue un placer trabajar en este proyecto contigo. Te deseamos mucho éxito con tu presencia digital. 💛

Recuerda que cualquier duda o ajuste futuro puedes escribirnos. Y si en algún momento necesitas crecer tu sitio o agregar nuevas funcionalidades aquí estaremos. 🚀

¡Gracias por confiar en EsBrillante! ⭐`,
    }),

    t('w-f7-09', 7, 'Cerrar proyecto en el sistema', 'admin', ['w-f7-08'], {
      soloAdmin: true,
      descripcion: 'Marcar el proyecto como completado y archivar.',
      queHacer: 'Cerrar el proyecto internamente:\n□ Marcar el proyecto como completado en el sistema\n□ Archivar la carpeta del cliente en Google Drive (sección Proyectos Terminados)\n□ Guardar capturas del sitio terminado como referencia de portafolio\n□ Registrar el tiempo total del proyecto (activo y en pausas)\n□ Anotar aprendizajes o mejoras identificadas durante el proyecto',
      necesitasAntes: 'Mensaje de cierre enviado al cliente',
      queEntregas: 'Proyecto cerrado en el sistema. Carpeta archivada en Drive.',
    }),
  ]
}
