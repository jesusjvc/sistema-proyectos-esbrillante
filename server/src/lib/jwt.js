import jwt from 'jsonwebtoken'

const SECRET = process.env.JWT_SECRET

export function firmarToken(payload, opciones = {}) {
  return jwt.sign(payload, SECRET, { expiresIn: '7d', ...opciones })
}

export function verificarToken(token) {
  return jwt.verify(token, SECRET)
}

export function setCookie(res, token) {
  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  })
}

export function clearCookie(res) {
  res.clearCookie('token')
}
