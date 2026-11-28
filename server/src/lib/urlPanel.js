// CLIENT_URL puede traer varios orígenes separados por coma (los necesita
// CORS en app.js); para armar links en correos y avisos solo sirve el
// primero, que es el dominio principal del panel.
export function urlPanel() {
  return (process.env.CLIENT_URL || '').split(',')[0].trim().replace(/\/+$/, '')
}
