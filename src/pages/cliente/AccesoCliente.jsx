import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { loginCliente } from '../../data/api'

export default function AccesoCliente() {
  const navigate = useNavigate()
  const [slug, setSlug] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!slug.trim()) { setError('Ingresa el identificador de tu proyecto'); return }
    setCargando(true)
    try {
      const proyecto = await loginCliente(slug.trim(), password)
      navigate(`/cliente/${proyecto.slug}`)
    } catch (err) {
      setError(err.status === 401 ? 'Proyecto no encontrado o contraseña incorrecta' : err.message)
    } finally {
      setCargando(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-900 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-white/10 backdrop-blur rounded-2xl mb-4">
            <span className="text-2xl font-bold text-white">E</span>
          </div>
          <h1 className="text-2xl font-bold text-white">EsBrillante</h1>
          <p className="text-violet-300 text-sm mt-1">Portal de seguimiento para clientes</p>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-2xl">
          <h2 className="font-semibold text-slate-800 mb-5">Accede a tu proyecto</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Identificador del proyecto</label>
              <input
                type="text"
                value={slug}
                onChange={(e) => { setSlug(e.target.value); setError('') }}
                placeholder="Ej: mi-empresa-k7x2"
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-violet-400 placeholder:text-slate-400"
                autoFocus
              />
              <p className="text-xs text-slate-400 mt-1">El equipo de EsBrillante te compartió este identificador.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Contraseña</label>
              <input
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError('') }}
                placeholder="Tu contraseña de acceso"
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-violet-400 placeholder:text-slate-400"
              />
            </div>

            {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

            <button
              type="submit"
              disabled={cargando}
              className="w-full bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white py-3 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2"
            >
              {cargando && <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
              Ver mi proyecto
            </button>
          </form>
        </div>

        <div className="text-center mt-6">
          <a href="/" className="text-violet-300 hover:text-white text-sm transition-colors">← Volver al inicio</a>
        </div>
      </div>
    </div>
  )
}
