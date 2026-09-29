// Plantillas de los módulos de solicitud estructurada al cliente:
// 'dominio' (datos para registrar el dominio), 'recursos' (fotos/logo/textos
// con subcarpeta de Drive) y 'vobo' (aceptación formal del proyecto).
//
// ESPEJO de src/data/modulosCliente.js (frontend) — frontend y backend se
// despliegan como apps separadas en Coolify, así que la definición vive dos
// veces a propósito. Mantener ambas sincronizadas.

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
}

export function extraerDominio(texto) {
  const m = String(texto || '').match(/\b((?!-)[a-z0-9-]{1,63}(?<!-)\.)+[a-z]{2,}\b/i)
  return m ? m[0].toLowerCase() : null
}

export function moduloDe(valor) {
  return MODULOS_CLIENTE[valor] || null
}
