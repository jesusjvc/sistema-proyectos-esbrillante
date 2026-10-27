// Plantillas de los módulos de solicitud estructurada al cliente:
// 'dominio' (datos para registrar el dominio), 'recursos' (fotos/logo/textos
// con subcarpeta de Drive), 'vobo' (aceptación formal del proyecto) y
// 'registrante_dominio' (datos de registrante WHOIS, como formulario real).
//
// ESPEJO de src/data/modulosCliente.js (frontend) — frontend y backend se
// despliegan como apps separadas en Coolify, así que la definición vive dos
// veces a propósito. Mantener ambas sincronizadas.

// Campos del formulario de registrante (módulo 'registrante_dominio'). Lo usa
// el frontend para renderizar los inputs y el backend para validar que las
// respuestas requeridas vengan completas antes de guardar respuestaDatos.
export const CAMPOS_REGISTRANTE_DOMINIO = [
  { key: 'nombre', label: 'Nombre(s)', required: true },
  { key: 'apellido', label: 'Apellido(s)', required: true },
  { key: 'empresa', label: 'Empresa (opcional)', required: false },
  { key: 'direccion', label: 'Dirección', required: true },
  { key: 'pais', label: 'País', required: true, default: 'México' },
  { key: 'ciudad', label: 'Ciudad', required: true },
  { key: 'estado', label: 'Estado', required: true },
  { key: 'codigoPostal', label: 'Código postal', required: true },
  { key: 'correo', label: 'Correo', required: true },
  { key: 'codigoTelefono', label: 'Código de país del teléfono', required: true, default: '+52' },
  { key: 'telefono', label: 'Teléfono', required: true },
]

export const MODULOS_CLIENTE = {
  dominio: {
    label: 'Registro de dominio',
    generica: 'Registrar el dominio del sitio',
    // La plantilla recibe { titulo } y devuelve el HTML de instrucciones.
    // Al completarla, el server extrae el dominio de la respuesta y lo
    // registra en la Info clave del proyecto.
    plantilla: () => `
      <p>Para <strong>registrar el dominio</strong> de tu sitio necesitamos estos datos:</p>
      <ul>
        <li><strong>Nombre exacto del dominio</strong> que quieres (ej. miempresa.com). Si tienes duda entre varias opciones, escríbelas todas.</li>
        <li>¿Lo registramos <strong>a nombre de quién</strong>? (nombre legal de la empresa o persona, y correo de contacto para el registrador)</li>
        <li>Si ya cuentas con el dominio, <strong>escríbenos dónde está registrado</strong> (GoDaddy, Namecheap, Hostinger...) y con qué correo.</li>
      </ul>
      <p>Con tu respuesta registramos o conectamos el dominio y queda guardado en la información del proyecto.</p>
    `,
  },
  recursos: {
    label: 'Solicitud de recursos',
    generica: 'Enviar recursos del proyecto',
    // La subcarpeta de Drive se crea al crear la tarea (server) y su enlace
    // va en tarea.driveFolderUrl — el portal del cliente ya muestra el botón
    // "Sube tus archivos aquí" cuando existe.
    plantilla: ({ conDrive, urlDrive }) => `
      <p>Necesitamos que nos compartas <strong>los recursos del proyecto</strong> (fotos, logotipo, textos o lo que aplique):</p>
      <ul>
        <li>Sube todo a la ${conDrive ? `<strong>carpeta de Drive</strong> que preparamos para ti: <a href="${urlDrive}">carpeta de Recursos →</a>` : 'carpeta de Drive del proyecto (te compartiremos el enlace)'}</li>
        <li>Si un archivo pesa mucho o prefieres otra vía, responde aquí y lo coordinamos.</li>
      </ul>
      <p>Cuéntanos en tu respuesta qué archivos subiste o si te falta algo de la lista.</p>
    `,
  },
  vobo: {
    label: 'VoBo del proyecto',
    generica: 'VoBo del proyecto',
    // Al completarla el server lo registra como aceptación formal en el log.
    plantilla: () => `
      <p><strong>¡Tu proyecto está terminado!</strong> 🎉</p>
      <p>Revisa el resultado y, si todo está como lo acordamos, danos tu <strong>VoBo</strong> para cerrar esta etapa. Puedes escribir "VoBo" o tus comentarios si algo falta.</p>
      <p>Tu respuesta queda registrada como la <strong>aceptación formal del proyecto</strong>.</p>
    `,
  },
  registrante_dominio: {
    label: 'Datos de registrante del dominio',
    generica: 'Pedir los datos de registrante (WHOIS) para registrar el dominio',
    // Formulario real (ver CAMPOS_REGISTRANTE_DOMINIO), no texto libre. Al
    // completarla el server guarda respuestaDatos estructurado y lo agrega
    // también a infoClave.extras del proyecto.
    plantilla: () => `
      <p>Para <strong>registrar el dominio</strong> necesitamos los datos del registrante (quedan asociados al dominio, como en cualquier registro WHOIS).</p>
      <p>Llena el formulario con los datos exactos — si pones el nombre de una empresa, algunos registradores hacen pública esa información vía WHOIS/RDAP.</p>
    `,
  },
}

export function extraerDominio(texto) {
  const m = String(texto || '').match(/\b((?!-)[a-z0-9-]{1,63}(?<!-)\.)+[a-z]{2,}\b/i)
  return m ? m[0].toLowerCase() : null
}

export function moduloDe(valor) {
  return MODULOS_CLIENTE[valor] || null
}

// Campos faltantes de un módulo con formulario (hoy solo registrante_dominio).
// Devuelve [] si no falta nada o si el módulo no tiene formulario definido.
export function camposFaltantes(modulo, datos) {
  const campos = modulo === 'registrante_dominio' ? CAMPOS_REGISTRANTE_DOMINIO : null
  if (!campos) return []
  return campos.filter((c) => c.required && !String(datos?.[c.key] || '').trim()).map((c) => c.label)
}

// Texto corto legible para respuestaTexto / notificaciones, a partir del
// objeto estructurado — así las vistas que solo muestran texto no quedan vacías.
export function resumenRegistranteDominio(datos) {
  const d = datos || {}
  const nombre = [d.nombre, d.apellido].filter(Boolean).join(' ')
  const partes = [nombre, d.empresa, d.direccion, [d.ciudad, d.estado, d.codigoPostal].filter(Boolean).join(', '), d.pais, d.correo, [d.codigoTelefono, d.telefono].filter(Boolean).join(' ')]
  return partes.filter(Boolean).join(' — ')
}
