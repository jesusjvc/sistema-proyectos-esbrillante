import { randomBytes, createHash } from 'crypto'

const PREFIJO_TOKEN = 'esb_'

// El token en claro solo existe en este instante y en la respuesta al
// crearlo — de ahí en adelante solo se guarda su hash, nunca el valor real.
export function generarApiKey() {
  const token = PREFIJO_TOKEN + randomBytes(24).toString('hex')
  return { token, hash: hashearApiKey(token), prefijo: token.slice(0, 12) }
}

export function esTokenApiKey(token) {
  return typeof token === 'string' && token.startsWith(PREFIJO_TOKEN)
}

export function hashearApiKey(token) {
  return createHash('sha256').update(token).digest('hex')
}
