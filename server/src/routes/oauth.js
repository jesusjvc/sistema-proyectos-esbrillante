import { Router } from 'express'
import { randomUUID, randomBytes } from 'crypto'
import bcrypt from 'bcryptjs'
import prisma from '../lib/prisma.js'
import { firmarToken } from '../lib/jwt.js'
import { guardarCodigo, consumirCodigo } from '../lib/oauthCodes.js'
import { verificarPkce } from '../lib/pkce.js'

const router = Router()

// Aunque el registro de clientes (DCR) es público, solo aceptamos
// redirect_uris hacia hosts de confianza — si no, alguien podría registrar
// un client_id con redirect_uri propio y usar nuestra pantalla de login
// (legítima, en nuestro dominio) para robar el código de autorización.
const HOSTS_PERMITIDOS = (process.env.MCP_OAUTH_REDIRECT_HOSTS || 'claude.ai,claude.com')
  .split(',').map((h) => h.trim().toLowerCase()).filter(Boolean)

function hostPermitido(hostname) {
  const h = hostname.toLowerCase()
  if (h === 'localhost' || h === '127.0.0.1') return true
  return HOSTS_PERMITIDOS.some((permitido) => h === permitido || h.endsWith(`.${permitido}`))
}

function escapeHtml(str = '') {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

function renderLoginPage({ clientId, redirectUri, state, codeChallenge, email, error }) {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Conectar con EsBrillante</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #0f172a, #1e293b); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 16px; }
  .card { width: 100%; max-width: 380px; background: #ffffff; border-radius: 16px; padding: 28px 24px; box-shadow: 0 25px 50px -12px rgba(0,0,0,.4); }
  .brand { font-size: 12px; letter-spacing: .05em; text-transform: uppercase; color: #d9a400; font-weight: 700; margin-bottom: 10px; }
  h1 { font-size: 15px; color: #1e293b; margin: 0 0 4px; }
  p.sub { font-size: 13px; color: #64748b; margin: 0 0 20px; }
  label { display: block; font-size: 13px; font-weight: 600; color: #334155; margin-bottom: 6px; }
  input[type=email], input[type=password] { width: 100%; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 12px; font-size: 14px; outline: none; margin-bottom: 14px; }
  input[type=email]:focus, input[type=password]:focus { border-color: #f8be00; box-shadow: 0 0 0 3px rgba(248,190,0,.25); }
  button { width: 100%; margin-top: 2px; background: #f8be00; color: #1e293b; border: none; border-radius: 8px; padding: 12px; font-size: 14px; font-weight: 700; cursor: pointer; }
  button:hover { background: #d9a400; }
  .error { margin-top: 12px; background: #fef2f2; color: #dc2626; font-size: 13px; padding: 8px 12px; border-radius: 8px; }
</style>
</head>
<body>
  <div class="card">
    <div class="brand">EsBrillante</div>
    <h1>Conectar con el Sistema de Seguimiento</h1>
    <p class="sub">Inicia sesión con tu cuenta para autorizar esta conexión — así el sistema sabe que eres tú.</p>
    <form method="POST" action="/oauth/authorize">
      <input type="hidden" name="client_id" value="${escapeHtml(clientId)}" />
      <input type="hidden" name="redirect_uri" value="${escapeHtml(redirectUri)}" />
      <input type="hidden" name="state" value="${escapeHtml(state || '')}" />
      <input type="hidden" name="code_challenge" value="${escapeHtml(codeChallenge)}" />
      <label for="email">Correo</label>
      <input type="email" id="email" name="email" value="${escapeHtml(email || '')}" autofocus required autocomplete="username" />
      <label for="password">Contraseña</label>
      <input type="password" id="password" name="password" required autocomplete="current-password" />
      ${error ? `<div class="error">${escapeHtml(error)}</div>` : ''}
      <button type="submit">Conectar</button>
    </form>
  </div>
</body>
</html>`
}

// GET /oauth/authorize — pantalla de login que ve el usuario al conectar
// el conector desde claude.ai (o cualquier cliente MCP con OAuth).
router.get('/authorize', async (req, res) => {
  const { response_type, client_id, redirect_uri, state, code_challenge, code_challenge_method } = req.query

  if (response_type !== 'code') return res.status(400).send('response_type no soportado, se requiere "code".')
  if (code_challenge_method !== 'S256' || !code_challenge) return res.status(400).send('Se requiere PKCE con code_challenge_method=S256.')
  if (!client_id || !redirect_uri) return res.status(400).send('Faltan client_id o redirect_uri.')

  const cliente = await prisma.oAuthClient.findUnique({ where: { clientId: client_id } })
  if (!cliente) return res.status(400).send('client_id desconocido. Vuelve a conectar el conector para registrarlo de nuevo.')
  if (!cliente.redirectUris.includes(redirect_uri)) return res.status(400).send('redirect_uri no autorizado para este cliente.')

  res.send(renderLoginPage({ clientId: client_id, redirectUri: redirect_uri, state, codeChallenge: code_challenge }))
})

// POST /oauth/authorize — valida email+contraseña (misma cuenta que el panel
// web) y emite el código, ligado a esa persona — así cada quien que conecte
// el conector queda identificado individualmente, aunque compartan la misma
// configuración de MCP en su workspace.
router.post('/authorize', async (req, res) => {
  const { client_id, redirect_uri, state, code_challenge, email, password } = req.body || {}

  const cliente = client_id && await prisma.oAuthClient.findUnique({ where: { clientId: client_id } })
  if (!cliente || !cliente.redirectUris.includes(redirect_uri)) {
    return res.status(400).send('Solicitud inválida.')
  }

  const user = email && await prisma.user.findUnique({ where: { email: String(email).toLowerCase().trim() } })
  const credencialesOk = user && user.activo && await bcrypt.compare(password || '', user.password)

  if (!credencialesOk) {
    return res.status(401).send(renderLoginPage({
      clientId: client_id, redirectUri: redirect_uri, state, codeChallenge: code_challenge, email,
      error: 'Correo o contraseña incorrectos.',
    }))
  }

  const code = randomBytes(32).toString('hex')
  guardarCodigo(code, { clientId: client_id, redirectUri: redirect_uri, codeChallenge: code_challenge, userId: user.id })

  const destino = new URL(redirect_uri)
  destino.searchParams.set('code', code)
  if (state) destino.searchParams.set('state', state)
  res.redirect(destino.toString())
})

// POST /oauth/register — Dynamic Client Registration (RFC 7591). Público:
// la seguridad real está en /authorize (requiere el API Key) y en PKCE.
router.post('/register', async (req, res) => {
  const { redirect_uris, client_name } = req.body || {}

  if (!Array.isArray(redirect_uris) || redirect_uris.length === 0) {
    return res.status(400).json({ error: 'invalid_client_metadata', error_description: 'redirect_uris es requerido' })
  }
  const urisValidas = redirect_uris.every((u) => {
    try {
      const parsed = new URL(u)
      const esquemaOk = parsed.protocol === 'https:' || parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1'
      return esquemaOk && hostPermitido(parsed.hostname)
    } catch {
      return false
    }
  })
  if (!urisValidas) {
    return res.status(400).json({ error: 'invalid_redirect_uri', error_description: `redirect_uris debe ser https y apuntar a un host permitido (${HOSTS_PERMITIDOS.join(', ')}) o localhost` })
  }

  const clientId = randomUUID()
  await prisma.oAuthClient.create({ data: { clientId, clientName: client_name || null, redirectUris: redirect_uris } })

  res.status(201).json({
    client_id: clientId,
    client_name: client_name || undefined,
    redirect_uris,
    token_endpoint_auth_method: 'none',
    grant_types: ['authorization_code'],
    response_types: ['code'],
    client_id_issued_at: Math.floor(Date.now() / 1000),
  })
})

// POST /oauth/token — intercambia el código (+ code_verifier) por un access token.
router.post('/token', async (req, res) => {
  const { grant_type, code, redirect_uri, client_id, code_verifier } = req.body || {}

  if (grant_type !== 'authorization_code') {
    return res.status(400).json({ error: 'unsupported_grant_type' })
  }
  if (!code || !redirect_uri || !client_id || !code_verifier) {
    return res.status(400).json({ error: 'invalid_request' })
  }

  const datos = consumirCodigo(code)
  if (!datos || datos.clientId !== client_id || datos.redirectUri !== redirect_uri) {
    return res.status(400).json({ error: 'invalid_grant' })
  }
  if (!verificarPkce(code_verifier, datos.codeChallenge)) {
    return res.status(400).json({ error: 'invalid_grant', error_description: 'code_verifier no coincide' })
  }

  const expiresIn = 90 * 24 * 60 * 60
  const accessToken = firmarToken({ tipo: 'mcp_oauth', clientId: client_id, userId: datos.userId }, { expiresIn })

  res.json({
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: expiresIn,
  })
})

export default router
