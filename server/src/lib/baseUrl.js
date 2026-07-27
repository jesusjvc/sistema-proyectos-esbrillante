// Requiere `app.set('trust proxy', ...)` en app.js para que req.protocol
// refleje https cuando el servidor corre detrás de un proxy/balanceador.
export function baseUrl(req) {
  return `${req.protocol}://${req.get('host')}`
}
