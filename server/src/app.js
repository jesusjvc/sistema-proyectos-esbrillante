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

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
}))
app.use(express.json())
app.use(cookieParser())

app.use('/api/auth', authRouter)
app.use('/api/proyectos', proyectosRouter)
app.use('/api/miembros', miembrosRouter)
app.use('/api/cliente', clienteRouter)
app.use('/mcp', mcpRouter)

app.get('/api/health', (req, res) => res.json({ ok: true }))

app.listen(PORT, () => console.log(`Server running on port ${PORT}`))
