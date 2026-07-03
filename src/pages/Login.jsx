import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { setSession, getMiembros, agregarMiembro } from '../data/storage'
import { Shield, Users, User, Plus } from 'lucide-react'

const PIN_ADMIN = '1234'

export default function Login() {
  const navigate = useNavigate()
  const [vista, setVista] = useState(null) // 'admin' | 'equipo'
  const [pin, setPin] = useState('')
  const [pinError, setPinError] = useState(false)
  const [nuevoMiembro, setNuevoMiembro] = useState('')
  const miembros = getMiembros()

  function loginAdmin(e) {
    e.preventDefault()
    if (pin === PIN_ADMIN) {
      setSession({ rol: 'admin', nombre: 'Jesús', id: 'jesus' })
      navigate('/admin')
    } else {
      setPinError(true)
    }
  }

  function loginEquipo(miembro) {
    setSession({ rol: 'equipo', nombre: miembro.nombre, id: miembro.id, esKarla: miembro.esKarla || false })
    navigate('/equipo')
  }

  function agregarYLogin() {
    if (!nuevoMiembro.trim()) return
    const m = agregarMiembro(nuevoMiembro.trim())
    loginEquipo(m)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-violet-600 rounded-2xl mb-4">
            <span className="text-2xl font-bold text-white">E</span>
          </div>
          <h1 className="text-2xl font-bold text-white">EsBrillante</h1>
          <p className="text-slate-400 text-sm mt-1">Sistema de Seguimiento de Proyectos</p>
        </div>

        {!vista && (
          <div className="space-y-3">
            <button
              onClick={() => setVista('admin')}
              className="w-full bg-violet-600 hover:bg-violet-700 text-white rounded-xl px-5 py-4 flex items-center gap-3 transition-colors"
            >
              <Shield size={20} />
              <div className="text-left">
                <div className="font-semibold">Admin</div>
                <div className="text-violet-200 text-xs">Jesús y administradores</div>
              </div>
            </button>

            <button
              onClick={() => setVista('equipo')}
              className="w-full bg-slate-700 hover:bg-slate-600 text-white rounded-xl px-5 py-4 flex items-center gap-3 transition-colors"
            >
              <Users size={20} />
              <div className="text-left">
                <div className="font-semibold">Equipo</div>
                <div className="text-slate-400 text-xs">Copy, Diseñador, Programador, Karla</div>
              </div>
            </button>

            <div className="text-center pt-2">
              <a
                href="/cliente"
                className="text-slate-500 hover:text-slate-300 text-sm transition-colors underline underline-offset-2"
              >
                ¿Eres cliente? Entra aquí
              </a>
            </div>
          </div>
        )}

        {vista === 'admin' && (
          <div className="bg-slate-800 rounded-2xl p-6">
            <button onClick={() => setVista(null)} className="text-slate-400 hover:text-white text-sm mb-4 flex items-center gap-1">
              ← Volver
            </button>
            <h2 className="text-white font-semibold mb-4">Acceso Admin</h2>
            <form onSubmit={loginAdmin} className="space-y-3">
              <input
                type="password"
                placeholder="PIN de acceso"
                value={pin}
                onChange={(e) => { setPin(e.target.value); setPinError(false) }}
                className={`w-full bg-slate-700 text-white rounded-lg px-4 py-3 outline-none text-sm placeholder:text-slate-500 ${
                  pinError ? 'ring-2 ring-red-500' : 'focus:ring-2 focus:ring-violet-500'
                }`}
                autoFocus
              />
              {pinError && <p className="text-red-400 text-xs">PIN incorrecto</p>}
              <button
                type="submit"
                className="w-full bg-violet-600 hover:bg-violet-700 text-white rounded-lg py-3 text-sm font-semibold transition-colors"
              >
                Entrar
              </button>
            </form>
          </div>
        )}

        {vista === 'equipo' && (
          <div className="bg-slate-800 rounded-2xl p-6">
            <button onClick={() => setVista(null)} className="text-slate-400 hover:text-white text-sm mb-4 flex items-center gap-1">
              ← Volver
            </button>
            <h2 className="text-white font-semibold mb-4">¿Quién eres?</h2>
            <div className="space-y-2">
              {miembros.map((m) => (
                <button
                  key={m.id}
                  onClick={() => loginEquipo(m)}
                  className="w-full bg-slate-700 hover:bg-slate-600 text-white rounded-lg px-4 py-3 text-left text-sm flex items-center gap-2 transition-colors"
                >
                  <User size={15} className="text-slate-400" />
                  {m.nombre}
                  {m.esKarla && <span className="ml-auto text-xs text-violet-400">QA</span>}
                </button>
              ))}

              <div className="flex gap-2 pt-2">
                <input
                  type="text"
                  placeholder="Agregar miembro..."
                  value={nuevoMiembro}
                  onChange={(e) => setNuevoMiembro(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && agregarYLogin()}
                  className="flex-1 bg-slate-700 text-white rounded-lg px-3 py-2.5 text-sm placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-violet-500"
                />
                <button
                  onClick={agregarYLogin}
                  className="bg-violet-600 hover:bg-violet-700 text-white rounded-lg px-3 py-2.5 transition-colors"
                >
                  <Plus size={16} />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
