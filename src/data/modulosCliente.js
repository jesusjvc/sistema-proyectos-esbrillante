// Plantillas de los módulos de solicitud estructurada al cliente:
// 'dominio' (datos para registrar el dominio), 'recursos' (fotos/logo/textos
// con subcarpeta de Drive), 'vobo' (aceptación formal del proyecto) y
// 'registrante_dominio' (datos de registrante WHOIS, como formulario real).
//
// ESPEJO de server/src/lib/modulosCliente.js — frontend y backend se
// despliegan como apps separadas en Coolify, así que la definición vive dos
// veces a propósito. Mantener ambas sincronizadas.

// Campos del formulario de registrante (módulo 'registrante_dominio'). Los
// renderiza TareaClienteCard en VistaCliente.jsx.
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
  registrante_dominio: {
    label: 'Datos de registrante del dominio',
    generica: 'Pedir los datos de registrante (WHOIS) para registrar el dominio',
    ayuda: 'Formulario real (no texto libre) con los datos de registrante para el WHOIS del dominio. Al responder, quedan en respuestaDatos de la tarea y se agregan a Info clave del proyecto.',
    plantilla: () => `
      <p>Para <strong>registrar el dominio</strong> necesitamos los datos del registrante (quedan asociados al dominio, como en cualquier registro WHOIS).</p>
      <p>Llena el formulario con los datos exactos — si pones el nombre de una empresa, algunos registradores hacen pública esa información vía WHOIS/RDAP.</p>
    `,
  },
}
