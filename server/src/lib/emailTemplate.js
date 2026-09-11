// Plantilla visual compartida por todos los correos transaccionales
// (recordatorios, menciones, avisos al admin). El contenido de cada
// llamador sigue siendo HTML simple (<p>, <a>, <ul>) — esta función solo
// lo envuelve en el layout de marca, así que nadie más tiene que tocar su
// HTML para que se vea con branding.
//
// Basado en tablas a propósito (no flexbox/grid): es lo único que Outlook
// desktop (motor de Word) renderiza de forma confiable.
const LOGO_URL = 'https://foco.esbrillante.mx/logo-email.png'

export function envolverHtmlDeCorreo(contenidoHtml) {
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Foco</title>
    <style>
      a { color: #b08200; font-weight: 600; text-decoration: none; }
      a:hover { text-decoration: underline; }
      p { margin: 0 0 14px; }
      p:last-child { margin-bottom: 0; }
    </style>
  </head>
  <body style="margin:0; padding:0; background:#f4f4f5; font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5; padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px; background:#ffffff; border-radius:12px; overflow:hidden; border:1px solid #e5e7eb;">
            <tr>
              <td style="background:#111318; padding:22px 32px;">
                <img src="${LOGO_URL}" alt="Foco" width="120" height="37" style="display:block; border:0; outline:none;" />
              </td>
            </tr>
            <tr>
              <td style="padding:32px; color:#1b1e25; font-size:15px; line-height:1.6;">
                ${contenidoHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:18px 32px; background:#fafafa; border-top:1px solid #e5e7eb;">
                <p style="margin:0; font-size:12px; color:#6b7280;">Foco — Sistema de Seguimiento de Proyectos · by EsBrillante</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}
