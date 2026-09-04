import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Sun, Moon } from 'lucide-react'
import { login } from '../data/api'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import icono from '../assets/icon-foco.svg'

export default function Login() {
  const navigate = useNavigate()
  const { user, setUser } = useAuth()
  const { tema, toggleTema } = useTheme()
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
    <div className="min-h-screen flex relative">
      <button
        onClick={toggleTema}
        title={tema === 'dark' ? 'Cambiar a claro' : 'Cambiar a oscuro'}
        className="absolute top-5 right-5 lg:top-6 lg:right-8 z-10 p-2 rounded-lg text-slate-400 dark:text-ink-400 hover:text-brand-600 dark:hover:text-brand-400 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
      >
        {tema === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
      </button>

      {/* Panel de marca */}
      <div className="hidden lg:flex w-[480px] shrink-0 flex-col justify-between p-12 bg-[#111318]">
        <div className="flex items-center gap-2.5">
          <img src={icono} alt="" className="h-8 w-8" />
          <span className="text-2xl font-extrabold text-white">foco</span>
        </div>

        <div className="space-y-7">
          <div className="space-y-3">
            <h2 className="text-3xl font-bold text-white leading-tight">Enfócate en lo que importa.</h2>
            <p className="text-sm text-slate-400 leading-relaxed">
              Coordina proyectos, responsables y fechas de EsBrillante en un solo lugar.
            </p>
          </div>

          <div className="space-y-2.5">
            <TareaEjemplo titulo="Revisar diseño del logo" meta="En revisión" metaClass="text-purple-300" />
            <TareaEjemplo titulo="Actualizar copy del sitio" meta="Completada" completada />
            <TareaEjemplo titulo="Confirmar dominio con cliente" meta="Vence hoy" metaClass="text-amber-300" />
          </div>
        </div>

        <p className="text-sm text-slate-400">by EsBrillante</p>
      </div>

      {/* Panel de formulario */}
      <div className="flex-1 flex items-center justify-center p-4 bg-white dark:bg-[#1B1E25] lg:border-l lg:border-transparent dark:lg:border-[#3D4554] transition-colors">
        <div className="w-full max-w-sm">
          <div className="mb-7">
            <h1 className="text-[28px] font-bold text-slate-900 dark:text-white">Inicia sesión</h1>
            <p className="text-sm text-slate-500 dark:text-[#B5BDCA] mt-1">Ingresa tus datos para continuar</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-800 dark:text-[#F5F6F8] mb-1.5">Correo electrónico</label>
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError('') }}
                placeholder="tu@esbrillante.mx"
                required
                autoFocus
                className="w-full h-10 border border-[#788291] dark:border-[#8793A5] dark:bg-[#242832] rounded-lg px-3 outline-none text-sm text-slate-800 dark:text-white placeholder:text-slate-400 dark:placeholder:text-ink-400 focus:ring-2 focus:ring-[#1D4ED8] dark:focus:ring-[#93C5FD] focus:border-transparent transition-shadow"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-800 dark:text-[#F5F6F8] mb-1.5">Contraseña</label>
              <input
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError('') }}
                placeholder="••••••••"
                required
                className="w-full h-10 border border-[#788291] dark:border-[#8793A5] dark:bg-[#242832] rounded-lg px-3 outline-none text-sm text-slate-800 dark:text-white placeholder:text-slate-400 dark:placeholder:text-ink-400 focus:ring-2 focus:ring-[#1D4ED8] dark:focus:ring-[#93C5FD] focus:border-transparent transition-shadow"
              />
            </div>

            {error && <p className="text-red-600 dark:text-red-300 text-xs bg-red-50 dark:bg-red-500/10 px-3 py-2 rounded-lg">{error}</p>}

            <button
              type="submit"
              disabled={cargando}
              className="w-full h-11 bg-[#F9ED48] hover:bg-[#F1DF2E] dark:hover:bg-[#FFF36A] active:bg-[#E2CE19] disabled:opacity-60 text-slate-900 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2"
            >
              {cargando && <span className="w-4 h-4 border-2 border-slate-900/30 border-t-slate-900 rounded-full animate-spin" />}
              Entrar
            </button>
          </form>

          <div className="text-center mt-6">
            <a href="/cliente" className="text-[#1D4ED8] dark:text-[#93C5FD] hover:text-[#1a43b8] dark:hover:text-[#bfdbfe] text-sm font-medium transition-colors">
              ¿Eres cliente? Entra aquí
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}

function TareaEjemplo({ titulo, meta, metaClass = 'text-slate-400', completada }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/5 border border-white/10">
      <div className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 ${completada ? 'bg-[#F9ED48]' : 'border border-slate-500'}`}>
        {completada && <Check size={13} className="text-slate-900" />}
      </div>
      <span className={`flex-1 text-sm font-medium truncate ${completada ? 'text-slate-400 line-through' : 'text-white'}`}>{titulo}</span>
      <span className={`text-xs font-medium shrink-0 ${metaClass}`}>{meta}</span>
    </div>
  )
}
