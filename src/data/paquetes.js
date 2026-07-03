export const PAQUETES = [
  'Web en Corto',
  'Web Profesional',
  'Web Corporativa',
  'Web Industrial',
  'Web Experto',
  'Ecommerce',
  'Personalizado',
]

export const EXTRAS_DISPONIBLES = [
  'Plugin de agendamiento de citas',
  'Plugin de membresías',
  'Carga de productos (Ecommerce)',
  'Pasarela de pago (Stripe / MercadoPago / PayPal)',
  'Blog con entradas iniciales',
  'Correos corporativos',
  'Capacitación extendida',
  'SEO avanzado',
]

export const MIEMBROS_EQUIPO = [
  { id: 'jesus', nombre: 'Jesús', esAdmin: true },
  { id: 'karla', nombre: 'Karla', esAdmin: false, esKarla: true },
  { id: 'copy1', nombre: 'Copy', esAdmin: false },
  { id: 'disenador1', nombre: 'Diseñador', esAdmin: false },
  { id: 'programador1', nombre: 'Programador', esAdmin: false },
]

export const ROLES_PROYECTO = ['copy', 'disenador', 'programador', 'adminProyecto']

export const FASES = [
  { numero: 1, nombre: 'Arranque' },
  { numero: 2, nombre: 'Contenido y Boceto' },
  { numero: 3, nombre: 'Diseño y Maquetación' },
  { numero: 4, nombre: 'Configuración Técnica' },
  { numero: 5, nombre: 'Revisión Interna' },
  { numero: 6, nombre: 'Revisión con Cliente' },
  { numero: 7, nombre: 'Entrega y Cierre' },
]

// Genera el checklist completo según configuración del proyecto
export function generarTareas(condicionesTecnicas, extras) {
  const tienePlugin =
    extras.includes('Plugin de agendamiento de citas') ||
    extras.includes('Plugin de membresías')
  const tieneEcommerce =
    extras.includes('Carga de productos (Ecommerce)') ||
    extras.includes('Pasarela de pago (Stripe / MercadoPago / PayPal)')
  const tieneBlog = extras.includes('Blog con entradas iniciales')
  const tieneSeoAvanzado = extras.includes('SEO avanzado')

  const { requiereCorreos, requiereCloudflare, requiereAnalytics, requiereSearchConsole, requiereCapacitacion, requierePluginAdicional, pluginAdicionalNombre } = condicionesTecnicas

  const t = []

  // ──────────────────────────────────────────
  // FASE 1 — Arranque
  // ──────────────────────────────────────────
  t.push(
    tarea('f1-01', 1, 'Crear ficha del cliente en el sistema', 'admin', [], {
      descripcion: 'Registrar los datos del cliente y del proyecto en el sistema.',
    }),
    tarea('f1-02', 1, 'Crear carpeta en Google Drive', 'equipo', [], {
      descripcion: 'Crear carpeta del proyecto con estructura estándar: Brief, Boceto, Diseño, Entregables.',
    }),
    tarea('f1-03', 1, 'Abrir grupo de WhatsApp del proyecto', 'admin', [], {
      descripcion: 'Crear el grupo interno del equipo y agregar a los miembros asignados.',
    }),
    tarea('f1-04', 1, 'Confirmar equipo asignado', 'admin', ['f1-03'], {
      descripcion: 'Verificar disponibilidad y confirmar a Copy, Diseñador y Programador para este proyecto.',
      soloAdmin: true,
    }),
    tarea('f1-05', 1, 'Enviar mensaje de bienvenida al cliente', 'admin', ['f1-04'], {
      descripcion: 'Enviar el mensaje de inicio al grupo de WhatsApp con el cliente. Incluir link al sistema.',
    }),
  )

  // ──────────────────────────────────────────
  // FASE 2 — Contenido y Boceto
  // ──────────────────────────────────────────
  t.push(
    tarea('f2-01', 2, 'Revisión del brief del cliente', 'copy', ['f1-01'], {
      descripcion: 'Leer y analizar el brief. Resolver dudas con el cliente antes de empezar a redactar.',
    }),
    tarea('f2-02', 2, 'Redacción del boceto por secciones', 'copy', ['f2-01'], {
      descripcion: 'Redactar el contenido de cada sección del sitio según el paquete contratado.',
    }),
    tarea('f2-03', 2, 'Verificación de disponibilidad de dominio', 'admin', ['f1-01'], {
      descripcion: 'Revisar en Namecheap o GoDaddy las opciones de dominio para el cliente.',
    }),
    tarea('f2-04', 2, 'Presentar boceto al cliente', 'admin', ['f2-02'], {
      descripcion: 'Compartir el boceto con el cliente por WhatsApp o Google Docs. Dar instrucciones claras de revisión.',
    }),
    // Tareas del cliente
    tareaCliente('f2-c01', 2, 'Confirmar dominio elegido', ['f2-03'], {
      instrucciones: 'Revisamos las opciones de dominio disponibles para tu negocio. Por favor indícanos cuál prefieres de las opciones que te presentamos, o si quieres explorar alguna otra alternativa. Este paso es necesario para continuar con la configuración técnica de tu sitio.',
      plazoHoras: 48,
    }),
    tieneSeoAvanzado &&
      tarea('f2-05', 2, 'Investigación de palabras clave (SEO avanzado)', 'copy', ['f2-01'], {
        descripcion: 'Identificar keywords principales y secundarias para el sitio.',
      }),
  )

  if (tienePlugin) {
    t.push(
      tareaCliente('f2-c02', 2, 'Confirmar qué servicios serán agendables', ['f2-01'], {
        instrucciones: 'Para configurar el plugin de citas en tu sitio, necesitamos que nos indiques: ¿Qué servicios quieres que tus clientes puedan agendar en línea? ¿Cuáles son los horarios de atención? ¿Cuánto dura cada cita? Esta información es necesaria para configurar el sistema correctamente.',
        plazoHoras: 48,
      }),
    )
  }

  t.push(
    tareaCliente('f2-c03', 2, 'Enviar testimonios o reseñas', ['f2-04'], {
      instrucciones: 'Para darle más credibilidad a tu sitio, necesitamos 2 o 3 testimonios de clientes satisfechos. Pueden ser: textos escritos por ti, capturas de reseñas de Google, Facebook u otras plataformas. Envíalos al grupo de WhatsApp del proyecto.',
      plazoHoras: 72,
    }),
    tareaCliente('f2-c04', 2, 'Revisar boceto y dar comentarios', ['f2-04'], {
      instrucciones: 'Te compartimos el borrador de contenido de tu sitio. Por favor léelo con calma y haznos saber qué cambios o ajustes deseas. Tienes 48 horas para enviarnos tus comentarios por WhatsApp. Si no recibimos respuesta, asumiremos que todo está aprobado.',
      plazoHoras: 48,
      esRutaCritica: true,
    }),
  )

  // ──────────────────────────────────────────
  // FASE 3 — Diseño y Maquetación
  // ──────────────────────────────────────────
  t.push(
    tarea('f3-01', 3, 'Selección de opciones de plantilla', 'disenador', ['f2-c04'], {
      descripcion: 'Buscar y seleccionar 3 opciones de plantilla que se adapten al rubro y estilo del cliente.',
    }),
    tarea('f3-02', 3, 'Presentar opciones de plantilla al cliente', 'admin', ['f3-01'], {
      descripcion: 'Enviar las 3 opciones al cliente con una breve descripción de cada una.',
    }),
    tareaCliente('f3-c01', 3, 'Elegir plantilla de las opciones presentadas', ['f3-02'], {
      instrucciones: 'Te presentamos 3 opciones de diseño para tu sitio. Por favor revísalas y dinos cuál te gusta más, o si hay algún elemento de una que quieras combinar con otra. Tu elección nos ayuda a definir el estilo visual de tu proyecto.',
      plazoHoras: 48,
      esRutaCritica: true,
    }),
    tareaCliente('f3-c02', 3, 'Confirmar correo para formulario de contacto', ['f3-02'], {
      instrucciones: '¿A qué dirección de correo quieres que lleguen los mensajes que te envíen a través del formulario de contacto de tu sitio? Puede ser tu correo actual o uno nuevo que configuremos para ti.',
      plazoHoras: 48,
    }),
    tarea('f3-03', 3, 'Definir paleta de colores y tipografía', 'disenador', ['f3-c01'], {
      descripcion: 'Definir colores primarios, secundarios y tipografías basados en el logo y la plantilla elegida.',
    }),
    tarea('f3-04', 3, 'Armar sitio completo con contenido del boceto aprobado', 'disenador', ['f3-03', 'f2-c04'], {
      descripcion: 'Construir todas las secciones del sitio con el contenido aprobado. Usar Elementor o IA según disponibilidad.',
    }),
  )

  if (tieneBlog) {
    t.push(
      tarea('f3-05', 3, 'Configurar blog y redactar entradas iniciales', 'copy', ['f3-03'], {
        descripcion: 'Crear la sección de blog y redactar las entradas iniciales acordadas.',
      }),
    )
  }

  if (tieneSeoAvanzado) {
    t.push(
      tarea('f3-06', 3, 'Optimización SEO on-page', 'copy', ['f3-04'], {
        descripcion: 'Optimizar meta títulos, descripciones, headings y alt text de imágenes con las keywords definidas.',
      }),
    )
  }

  // ──────────────────────────────────────────
  // FASE 4 — Configuración Técnica
  // ──────────────────────────────────────────
  t.push(
    tarea('f4-01', 4, 'Abrir cuenta de hosting en Enhanced Control Panel', 'programador', [], {
      descripcion: 'Crear cuenta en ECP y configurar el plan de hosting para el proyecto.',
    }),
    tarea('f4-02', 4, 'Instalar WordPress en staging/subdominio temporal', 'programador', ['f4-01'], {
      descripcion: 'Instalar WordPress en un subdominio temporal para comenzar el desarrollo sin esperar el dominio final.',
    }),
    tarea('f4-03', 4, 'Instalar y configurar plugins base', 'programador', ['f4-02'], {
      descripcion: 'Instalar plugins esenciales: Elementor, Contact Form 7, Yoast SEO, WPForms, etc.',
    }),
    tarea('f4-04', 4, 'Preparar estructura base de la plantilla', 'programador', ['f4-02'], {
      descripcion: 'Instalar la plantilla elegida y hacer la configuración inicial básica.',
    }),
  )

  if (requiereAnalytics) {
    t.push(
      tarea('f4-05', 4, 'Configurar Google Analytics', 'programador', ['f4-02'], {
        descripcion: 'Crear propiedad GA4, instalar el código de seguimiento en el sitio.',
      }),
    )
  }

  if (tienePlugin) {
    t.push(
      tarea('f4-06', 4, 'Instalar y configurar plugin de agendamiento', 'programador', ['f4-03', 'f2-c02'], {
        descripcion: 'Instalar el plugin de citas, configurar servicios, horarios y disponibilidad según lo confirmado por el cliente.',
      }),
    )
  }

  if (tieneEcommerce) {
    t.push(
      tarea('f4-07', 4, 'Instalar y configurar WooCommerce', 'programador', ['f4-03'], {
        descripcion: 'Instalar WooCommerce, configurar moneda, impuestos y métodos de pago básicos.',
      }),
    )
    if (extras.includes('Carga de productos (Ecommerce)')) {
      t.push(
        tarea('f4-08', 4, 'Cargar productos al catálogo', 'programador', ['f4-07'], {
          descripcion: 'Cargar los productos con fotos, descripciones y precios proporcionados por el cliente.',
        }),
      )
    }
    if (extras.includes('Pasarela de pago (Stripe / MercadoPago / PayPal)')) {
      t.push(
        tarea('f4-09', 4, 'Configurar pasarela de pago', 'programador', ['f4-07'], {
          descripcion: 'Integrar y configurar la pasarela de pago seleccionada. Hacer prueba de transacción.',
        }),
      )
    }
  }

  if (requierePluginAdicional) {
    t.push(
      tarea('f4-10', 4, `Instalar plugin adicional: ${pluginAdicionalNombre}`, 'programador', ['f4-03'], {
        descripcion: `Instalar y configurar ${pluginAdicionalNombre} según los requerimientos del proyecto.`,
      }),
    )
  }

  // Tareas que dependen de que el cliente confirme dominio (bloqueadas)
  t.push(
    tarea('f4-11', 4, 'Registrar dominio', 'admin', ['f2-c01'], {
      descripcion: 'Registrar el dominio confirmado por el cliente en Namecheap.',
    }),
  )

  if (requiereCloudflare) {
    t.push(
      tarea('f4-12', 4, 'Conectar dominio a Cloudflare', 'programador', ['f4-11'], {
        descripcion: 'Agregar el dominio a Cloudflare y actualizar los nameservers en Namecheap.',
      }),
      tarea('f4-13', 4, 'Apuntar DNS al hosting (ECP)', 'programador', ['f4-12', 'f4-01'], {
        descripcion: 'Configurar los registros DNS en Cloudflare para apuntar al hosting.',
      }),
    )
  } else {
    t.push(
      tarea('f4-13', 4, 'Apuntar DNS al hosting (ECP)', 'programador', ['f4-11', 'f4-01'], {
        descripcion: 'Configurar los registros DNS para apuntar al hosting.',
      }),
    )
  }

  t.push(
    tarea('f4-14', 4, 'Instalar WordPress en dominio final', 'programador', ['f4-13'], {
      descripcion: 'Migrar o instalar WordPress directamente en el dominio final confirmado.',
    }),
    tarea('f4-15', 4, 'Migrar plantilla y plugins al dominio final', 'programador', ['f4-14'], {
      descripcion: 'Migrar todo el trabajo de staging al dominio final. Verificar que todo funcione correctamente.',
    }),
  )

  if (requiereCorreos) {
    t.push(
      tarea('f4-16', 4, 'Configurar correos corporativos', 'programador', requiereCloudflare ? ['f4-12', 'f4-01'] : ['f4-11', 'f4-01'], {
        descripcion: 'Crear las cuentas de correo corporativo y configurar los registros MX.',
      }),
    )
  }

  if (requiereSearchConsole) {
    t.push(
      tarea('f4-17', 4, 'Conectar Google Search Console', 'programador', ['f4-14'], {
        descripcion: 'Verificar el dominio en Search Console y enviar el sitemap XML.',
      }),
    )
  }

  // ──────────────────────────────────────────
  // FASE 5 — Revisión Interna
  // ──────────────────────────────────────────
  const depsFase5 = ['f3-04', 'f4-15']
  t.push(
    tarea('f5-01', 5, 'Revisar secciones completas vs boceto aprobado', 'karla', depsFase5, {
      descripcion: 'Comparar el sitio terminado contra el boceto aprobado. Verificar que todo el contenido esté correcto.',
      soloKarlaOAdmin: true,
    }),
    tarea('f5-02', 5, 'Verificar responsive móvil y desktop', 'karla', ['f5-01'], {
      descripcion: 'Revisar el sitio en móvil (iOS y Android) y en desktop. Documentar cualquier problema.',
      soloKarlaOAdmin: true,
    }),
    tarea('f5-03', 5, 'Probar formulario de contacto', 'karla', ['f5-01'], {
      descripcion: 'Enviar un mensaje de prueba y verificar que llegue al correo confirmado por el cliente.',
      soloKarlaOAdmin: true,
    }),
    tarea('f5-04', 5, 'Probar botón de WhatsApp', 'karla', ['f5-01'], {
      descripcion: 'Verificar que el botón de WhatsApp abra el chat correctamente en móvil y desktop.',
      soloKarlaOAdmin: true,
    }),
  )

  if (tienePlugin) {
    t.push(
      tarea('f5-05', 5, 'Probar plugin de agendamiento', 'karla', ['f5-01'], {
        descripcion: 'Hacer una cita de prueba completa: seleccionar servicio, fecha, hora y verificar la confirmación.',
        soloKarlaOAdmin: true,
      }),
    )
  }

  if (tieneEcommerce) {
    t.push(
      tarea('f5-06', 5, 'Probar flujo de compra', 'karla', ['f5-01'], {
        descripcion: 'Realizar una compra de prueba completa: agregar al carrito, proceder al pago, verificar confirmación.',
        soloKarlaOAdmin: true,
      }),
    )
  }

  t.push(
    tarea('f5-07', 5, 'Revisar avisos legales (privacidad y términos)', 'karla', ['f5-01'], {
      descripcion: 'Verificar que la política de privacidad y aviso legal estén presentes y actualizados.',
      soloKarlaOAdmin: true,
    }),
    tarea('f5-08', 5, 'Dar visto bueno interno para presentar al cliente', 'karla', ['f5-02', 'f5-03', 'f5-04', 'f5-07'], {
      descripcion: 'Confirmar que el sitio está listo para ser presentado al cliente. Solo Karla o el Admin pueden marcar esta tarea.',
      soloKarlaOAdmin: true,
    }),
  )

  // ──────────────────────────────────────────
  // FASE 6 — Revisión con Cliente
  // ──────────────────────────────────────────
  t.push(
    tarea('f6-01', 6, 'Compartir link del sitio con instrucciones de revisión', 'admin', ['f5-08'], {
      descripcion: 'Enviar el link al cliente con instrucciones claras de cómo revisar y cómo enviar comentarios.',
    }),
    tareaCliente('f6-c01', 6, 'Revisar el sitio y enviar comentarios (ronda 1)', ['f6-01'], {
      instrucciones: 'Tu sitio ya está listo para que lo revises. Entra al link que te compartimos y revísalo con calma: navega todas las secciones, prueba los formularios y botones. Envíanos tus comentarios por WhatsApp en un máximo de 48 horas. Si no recibimos respuesta, entendemos que todo está aprobado.',
      plazoHoras: 48,
      esRutaCritica: true,
    }),
    tarea('f6-02', 6, 'Aplicar correcciones ronda 1', 'equipo', ['f6-c01'], {
      descripcion: 'Aplicar todos los cambios solicitados por el cliente en la primera ronda de revisión.',
    }),
    tarea('f6-03', 6, 'Compartir sitio corregido (ronda 2)', 'admin', ['f6-02'], {
      descripcion: 'Notificar al cliente que las correcciones están aplicadas y compartir el link actualizado.',
    }),
    tareaCliente('f6-c02', 6, 'Revisar correcciones y dar aprobación o segunda vuelta', ['f6-03'], {
      instrucciones: 'Aplicamos los cambios que nos solicitaste. Por favor revisa de nuevo el sitio y haznos saber: ¿está todo como lo esperabas? Si hay algún ajuste adicional, este es el momento de indicarlo. Recuerda que el paquete incluye hasta 2 rondas de correcciones.',
      plazoHoras: 48,
      esRutaCritica: true,
    }),
    tarea('f6-04', 6, 'Aplicar correcciones ronda 2 (si aplica)', 'equipo', ['f6-c02'], {
      descripcion: 'Aplicar la segunda y última ronda de correcciones incluida en el paquete.',
      opcional: true,
    }),
    tareaCliente('f6-c03', 6, 'Dar aprobación final por escrito', ['f6-c02'], {
      instrucciones: '¡Ya casi terminamos! Para proceder con la entrega oficial, necesitamos tu aprobación por escrito. Un mensaje en WhatsApp confirmando "Apruebo el sitio" es suficiente. Esto nos indica que el sitio está listo para ser publicado.',
      plazoHoras: 48,
      esRutaCritica: true,
    }),
    tarea('f6-05', 6, 'Registrar aprobación final del cliente', 'admin', ['f6-c03'], {
      descripcion: 'Documentar en el sistema la aprobación final del cliente con fecha y mensaje.',
      soloAdmin: true,
    }),
  )

  // ──────────────────────────────────────────
  // FASE 7 — Entrega y Cierre
  // ──────────────────────────────────────────
  t.push(
    tarea('f7-01', 7, 'Migración final a dominio oficial', 'programador', ['f6-05', 'f4-15'], {
      descripcion: 'Migrar el sitio aprobado al dominio final del cliente. Verificar que todo funcione correctamente.',
    }),
    tarea('f7-02', 7, 'Configurar SSL (HTTPS)', 'programador', ['f7-01'], {
      descripcion: 'Instalar y verificar el certificado SSL. Configurar redirecciones HTTP → HTTPS.',
    }),
    tarea('f7-03', 7, 'Prueba final en dominio oficial', 'karla', ['f7-02'], {
      descripcion: 'Verificar que el sitio funcione correctamente en el dominio final. Probar formularios, botones y velocidad.',
      soloKarlaOAdmin: true,
    }),
    tarea('f7-04', 7, 'Confirmar pago final liquidado', 'admin', ['f6-05'], {
      descripcion: 'Verificar que el pago final esté recibido antes de proceder con la entrega de accesos.',
      soloAdmin: true,
    }),
    tarea('f7-05', 7, 'Entregar accesos al cliente (WordPress)', 'admin', ['f7-03', 'f7-04'], {
      descripcion: 'Enviar al cliente las credenciales de acceso a WordPress. REGLA: no se entregan sin liquidación confirmada.',
      soloAdmin: true,
    }),
  )

  if (requiereCapacitacion) {
    t.push(
      tarea('f7-06', 7, 'Capacitación básica de WordPress al cliente', 'admin', ['f7-05'], {
        descripcion: 'Dar la capacitación acordada: cómo editar textos, agregar imágenes, crear páginas básicas.',
      }),
    )
  }

  if (extras.includes('Capacitación extendida')) {
    t.push(
      tarea('f7-07', 7, 'Capacitación extendida de WordPress', 'admin', ['f7-05'], {
        descripcion: 'Sesión extendida de capacitación: WooCommerce, plugins avanzados, SEO básico.',
      }),
    )
  }

  if (requiereCorreos) {
    t.push(
      tarea('f7-08', 7, 'Entregar accesos a correos corporativos', 'admin', ['f7-04'], {
        descripcion: 'Enviar al cliente las credenciales de los correos corporativos configurados.',
        soloAdmin: true,
      }),
    )
  }

  t.push(
    tarea('f7-09', 7, 'Cerrar proyecto en el sistema', 'admin', ['f7-05'], {
      descripcion: 'Marcar el proyecto como completado, registrar la fecha de cierre y exportar métricas.',
      soloAdmin: true,
    }),
  )

  return t.filter(Boolean)
}

function tarea(id, fase, titulo, responsable, dependencias, opts = {}) {
  return {
    id,
    fase,
    titulo,
    responsable, // admin | equipo | copy | disenador | programador | karla | cliente
    dependencias,
    esCliente: false,
    instruccionesCliente: null,
    plazoHoras: opts.plazoHoras || null,
    esRutaCritica: opts.esRutaCritica || false,
    soloAdmin: opts.soloAdmin || false,
    soloKarlaOAdmin: opts.soloKarlaOAdmin || false,
    opcional: opts.opcional || false,
    descripcion: opts.descripcion || '',
    // Estado dinámico (se calcula en runtime)
    estado: 'pendiente', // pendiente | disponible | bloqueada_dependencia | bloqueada_cliente | completada | omitida
    completadaPor: null,
    completadaEn: null,
    asignadoA: null,
  }
}

function tareaCliente(id, fase, titulo, dependencias, opts = {}) {
  return {
    id,
    fase,
    titulo,
    responsable: 'cliente',
    dependencias,
    esCliente: true,
    instruccionesCliente: opts.instrucciones || '',
    plazoHoras: opts.plazoHoras || 48,
    esRutaCritica: opts.esRutaCritica || false,
    soloAdmin: false,
    soloKarlaOAdmin: false,
    opcional: false,
    descripcion: '',
    estado: 'pendiente',
    completadaPor: null,
    completadaEn: null,
    asignadoA: null,
  }
}
