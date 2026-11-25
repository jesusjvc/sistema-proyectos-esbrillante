// Requiere `app.set('trust proxy', ...)` en app.js para que req.protocol
// refleje https cuando el servidor corre detrás de un proxy/balanceador.
export function baseUrl(req) {
  return `${req.protocol}://${req.get('host')}`
}

// Links de prototipos que se comparten con el cliente (copiar URL, correos):
// deben salir con el dominio público aunque la request llegue por el dominio
// del backend de Foco, que también sirve /p/:slug.
export function urlPublicaPrototipos(req) {
  return (process.env.PROTOTIPOS_PUBLIC_URL || baseUrl(req)).replace(/\/$/, '')
}
