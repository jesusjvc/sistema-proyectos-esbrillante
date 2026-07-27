import { Router } from 'express'
import { baseUrl } from '../lib/baseUrl.js'

const router = Router()

// RFC 9728 — le dice al cliente MCP dónde está el authorization server
// cuando /mcp responde 401.
router.get('/oauth-protected-resource', (req, res) => {
  const origin = baseUrl(req)
  res.json({
    resource: `${origin}/mcp`,
    authorization_servers: [origin],
  })
})

// RFC 8414 — metadata del authorization server (nosotros mismos).
router.get('/oauth-authorization-server', (req, res) => {
  const origin = baseUrl(req)
  res.json({
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/oauth/token`,
    registration_endpoint: `${origin}/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
  })
})

export default router
