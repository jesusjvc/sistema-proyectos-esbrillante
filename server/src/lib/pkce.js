import { createHash } from 'crypto'

// RFC 7636 — code_challenge = BASE64URL(SHA256(code_verifier))
export function verificarPkce(codeVerifier, codeChallenge) {
  if (!codeVerifier || !codeChallenge) return false
  const hash = createHash('sha256').update(codeVerifier).digest('base64url')
  return hash === codeChallenge
}
