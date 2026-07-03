import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getProyectos, autenticarCliente } from '../../data/storage'

export default function AccesoCliente() {
  const navigate = useNavigate()
  const [proyectoId, setProyectoId] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const proyectos = getProyectos()

  function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!proyectoId) { setError('Selecciona tu proyecto'); return }
    if (autenticarCliente(proyectoId, password)) {
      navigate(`/cliente/${proyectoId}`) // proyectoId ya es el slug
    } else {
      setError('Contraseña incorrecta')
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
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Tu empresa</label>
              <select
                value={proyectoId}
                onChange={(e) => { setProyectoId(e.target.value); setError('') }}
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-violet-400"
              >
                <option value="">Selecciona tu empresa...</option>
                {proyectos
                  .filter((p) => p.status !== 'cancelado')
                  .map((p) => (
                    <option key={p.id} value={p.slug}>{p.cliente.nombreComercial}</option>
                  ))
                }
              </select>
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
              <p className="text-xs text-slate-400 mt-1">La contraseña te la compartió el equipo de EsBrillante.</p>
            </div>

            {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

            <button
              type="submit"
              className="w-full bg-violet-600 hover:bg-violet-700 text-white py-3 rounded-lg text-sm font-semibold transition-colors"
            >
              Ver mi proyecto
            </button>
          </form>
        </div>

        <div className="text-center mt-6">
          <a href="/" className="text-violet-300 hover:text-white text-sm transition-colors">
            ← Volver al inicio
          </a>
        </div>
      </div>
    </div>
  )
}
