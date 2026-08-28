import 'dotenv/config'
import express from 'express'
import cookieParser from 'cookie-parser'
import cors from 'cors'

import authRouter from './routes/auth.js'
import proyectosRouter from './routes/proyectos.js'
import tareasRouter from './routes/tareas.js'
import miembrosRouter from './routes/miembros.js'
import clienteRouter from './routes/cliente.js'
import mcpRouter from './routes/mcp.js'
import eventosRouter from './routes/eventos.js'
import oauthRouter from './routes/oauth.js'
import wellKnownRouter from './routes/wellKnown.js'
import prototiposRouter from './routes/prototipos.js'
import { revisarRecordatoriosVencidos } from './lib/recordatorios.js'

const app = express()
const PORT = process.env.PORT || 3001

// Necesario para que req.protocol refleje https (vía X-Forwarded-Proto) al
// correr detrás de un proxy — usado por las URLs absolutas de metadata OAuth.
app.set('trust proxy', 1)

app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
}))
app.use(express.json({ limit: '2mb' }))
app.use(express.urlencoded({ extended: true }))
app.use(cookieParser())

app.use('/api/auth', authRouter)
app.use('/api/proyectos', proyectosRouter)
app.use('/api/miembros', miembrosRouter)
app.use('/api/prototipos', prototiposRouter)
app.use('/api/cliente', clienteRouter)
app.use('/mcp', mcpRouter)
app.use('/api/eventos', eventosRouter)
app.use('/oauth', oauthRouter)
app.use('/.well-known', wellKnownRouter)

app.get('/api/health', (req, res) => res.json({ ok: true }))

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err?.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'El archivo supera el límite de 20 MB' })
  console.error(err)
  res.status(500).json({ error: 'Error interno' })
})

app.listen(PORT, () => console.log(`Server running on port ${PORT}`))

// Recordatorios de tareas de cliente vencidas: revisa cada hora y una vez al
// arrancar. No debe tumbar el server si falla (Mailjet caído, etc).
revisarRecordatoriosVencidos().catch((err) => console.error('Error revisando recordatorios:', err))
setInterval(() => {
  revisarRecordatoriosVencidos().catch((err) => console.error('Error revisando recordatorios:', err))
}, 60 * 60 * 1000)
