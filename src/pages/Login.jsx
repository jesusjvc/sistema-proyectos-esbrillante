import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { login } from '../data/api'
import { useAuth } from '../context/AuthContext'
import logo from '../assets/logo-esbrillante.svg'

export default function Login() {
  const navigate = useNavigate()
  const { user, setUser } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)

  useEffect(() => {
    if (user?.rol === 'admin') navigate('/admin', { replace: true })
    if (user?.rol === 'equipo') navigate('/equipo', { replace: true })
  }, [user])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setCargando(true)
    try {
      const data = await login(email.trim(), password)
      setUser({ ...data, rol: data.rol.toLowerCase() })
    } catch (err) {
      setError(err.message || 'Credenciales incorrectas')
    } finally {
      setCargando(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img src={logo} alt="EsBrillante" className="h-9 w-auto mx-auto mb-4" />
          <p className="text-slate-400 text-sm mt-1">Sistema de Seguimiento de Proyectos</p>
        </div>

        <div className="bg-slate-800 rounded-2xl p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Correo electrónico</label>
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError('') }}
                placeholder="tu@esbrillante.mx"
                required
                autoFocus
                className="w-full bg-slate-700 text-white rounded-lg px-4 py-3 outline-none text-sm placeholder:text-slate-500 focus:ring-2 focus:ring-brand-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Contraseña</label>
              <input
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError('') }}
                placeholder="••••••••"
                required
                className="w-full bg-slate-700 text-white rounded-lg px-4 py-3 outline-none text-sm placeholder:text-slate-500 focus:ring-2 focus:ring-brand-400"
              />
            </div>

            {error && <p className="text-red-400 text-xs bg-red-900/30 px-3 py-2 rounded-lg">{error}</p>}

            <button
              type="submit"
              disabled={cargando}
              className="w-full bg-brand-500 hover:bg-brand-600 disabled:opacity-60 text-slate-900 rounded-lg py-3 text-sm font-semibold transition-colors flex items-center justify-center gap-2"
            >
              {cargando && <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
              Entrar
            </button>
          </form>
        </div>

        <div className="text-center mt-6">
          <a href="/cliente" className="text-slate-500 hover:text-slate-300 text-sm transition-colors underline underline-offset-2">
            ¿Eres cliente? Entra aquí
          </a>
        </div>
      </div>
    </div>
  )
}
