// Plantillas de los módulos de solicitud estructurada al cliente:
// 'dominio' (datos para registrar el dominio), 'recursos' (fotos/logo/textos
// con subcarpeta de Drive) y 'vobo' (aceptación formal del proyecto).
//
// ESPEJO de server/src/lib/modulosCliente.js — frontend y backend se
// despliegan como apps separadas en Coolify, así que la definición vive dos
// veces a propósito. Mantener ambas sincronizadas.

export const MODULOS_CLIENTE = {
  dominio: {
    label: 'Registro de dominio',
    generica: 'Registrar el dominio del sitio',
    ayuda: 'Pide nombre del dominio, registrador y datos del titular. Al responder el cliente, el dominio queda en la Info clave del proyecto.',
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
    ayuda: 'Crea la subcarpeta "Recursos" en el Drive del proyecto y adjunta el enlace para que el cliente suba ahí sus archivos.',
    plantilla: ({ conDrive = false, urlDrive = null } = {}) => `
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
    ayuda: 'Aceptación formal del proyecto — la respuesta del cliente queda registrada como VoBo en el historial.',
    plantilla: () => `
      <p><strong>¡Tu proyecto está terminado!</strong> 🎉</p>
      <p>Revisa el resultado y, si todo está como lo acordamos, danos tu <strong>VoBo</strong> para cerrar esta etapa. Puedes escribir "VoBo" o tus comentarios si algo falta.</p>
      <p>Tu respuesta queda registrada como la <strong>aceptación formal del proyecto</strong>.</p>
    `,
  },
}
