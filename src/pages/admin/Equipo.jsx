import { useState, useEffect } from 'react'
import Layout from '../../components/Layout'
import { getMiembros, crearMiembro, editarMiembro, eliminarMiembro } from '../../data/api'
import { Plus, Pencil, Trash2, Check, X, Shield, Star } from 'lucide-react'

const FORM_VACIO = { nombre: '', email: '', password: '', rol: 'EQUIPO', esKarla: false }

export default function Equipo() {
  const [miembros, setMiembros] = useState([])
  const [cargando, setCargando] = useState(true)
  const [editandoId, setEditandoId] = useState(null)
  const [borrandoId, setBorrandoId] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [nuevoForm, setNuevoForm] = useState(FORM_VACIO)
  const [mostrarNuevo, setMostrarNuevo] = useState(false)
  const [error, setError] = useState('')

  async function cargar() {
    try {
      setMiembros(await getMiembros())
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => { cargar() }, [])

  function iniciarEdicion(m) {
    setEditandoId(m.id)
    setEditForm({ nombre: m.nombre, email: m.email, rol: m.rol, esKarla: m.esKarla, password: '' })
  }

  async function guardarEdicion(id) {
    if (!editForm.nombre.trim()) return
    const data = { nombre: editForm.nombre, email: editForm.email, rol: editForm.rol, esKarla: editForm.esKarla }
    if (editForm.password) data.password = editForm.password
    await editarMiembro(id, data)
    setEditandoId(null)
    cargar()
  }

  async function handleEliminar(id) {
    await eliminarMiembro(id)
    setBorrandoId(null)
    cargar()
  }

  async function handleAgregar() {
    setError('')
    if (!nuevoForm.nombre.trim() || !nuevoForm.email.trim() || !nuevoForm.password.trim()) {
      setError('Nombre, email y contraseña son requeridos')
      return
    }
    try {
      await crearMiembro({ nombre: nuevoForm.nombre, email: nuevoForm.email, password: nuevoForm.password, rol: nuevoForm.rol, esKarla: nuevoForm.esKarla })
      setNuevoForm(FORM_VACIO)
      setMostrarNuevo(false)
      cargar()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <Layout titulo="Equipo">
      <div className="max-w-xl">
        <p className="text-sm text-slate-500 mb-6">
          Los miembros del equipo acceden al sistema con su correo y contraseña.
        </p>

        {cargando ? (
          <div className="flex justify-center py-8"><div className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" /></div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden mb-4">
            {miembros.map((m, idx) => (
              <div key={m.id} className={`px-5 py-4 flex items-center gap-3 ${idx !== 0 ? 'border-t border-slate-100' : ''}`}>
                {editandoId === m.id ? (
                  <div className="flex-1 flex flex-col gap-2">
                    <div className="flex gap-2 flex-wrap">
                      <input
                        value={editForm.nombre}
                        onChange={(e) => setEditForm({ ...editForm, nombre: e.target.value })}
                        placeholder="Nombre"
                        className="border border-violet-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-violet-400 w-36"
                        autoFocus
                      />
                      <input
                        value={editForm.email}
                        onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                        placeholder="Email"
                        className="border border-violet-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-violet-400 w-48"
                      />
                      <input
                        type="password"
                        value={editForm.password}
                        onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                        placeholder="Nueva contraseña (opcional)"
                        className="border border-violet-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-violet-400 w-48"
                      />
                    </div>
                    <div className="flex items-center gap-4">
                      <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                        <input type="checkbox" checked={editForm.rol === 'ADMIN'} onChange={(e) => setEditForm({ ...editForm, rol: e.target.checked ? 'ADMIN' : 'EQUIPO' })} className="accent-violet-600" />
                        Admin
                      </label>
                      <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                        <input type="checkbox" checked={editForm.esKarla} onChange={(e) => setEditForm({ ...editForm, esKarla: e.target.checked })} className="accent-violet-600" />
                        Rol QA (Karla)
                      </label>
                      <div className="flex gap-1 ml-auto">
                        <button onClick={() => guardarEdicion(m.id)} className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-3 py-1.5 rounded-lg transition-colors">
                          <Check size={13} /> Guardar
                        </button>
                        <button onClick={() => setEditandoId(null)} className="text-slate-400 hover:text-slate-700 px-2">
                          <X size={15} />
                        </button>
                      </div>
                    </div>
                  </div>
                ) : borrandoId === m.id ? (
                  <div className="flex-1 flex items-center gap-3">
                    <span className="text-sm text-slate-600">¿Eliminar a <strong>{m.nombre}</strong>?</span>
                    <div className="flex gap-2 ml-auto">
                      <button onClick={() => handleEliminar(m.id)} className="bg-red-600 hover:bg-red-700 text-white text-xs px-3 py-1.5 rounded-lg transition-colors">Eliminar</button>
                      <button onClick={() => setBorrandoId(null)} className="text-slate-400 hover:text-slate-700 text-xs px-2">Cancelar</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="w-8 h-8 bg-violet-100 rounded-full flex items-center justify-center text-violet-700 font-semibold text-sm shrink-0">
                      {m.nombre[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-slate-800 text-sm">{m.nombre}</div>
                      <div className="text-xs text-slate-400">{m.email}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        {m.rol === 'ADMIN' && <span className="text-xs text-violet-600 flex items-center gap-0.5"><Shield size={11} /> Admin</span>}
                        {m.esKarla && <span className="text-xs text-amber-600 flex items-center gap-0.5"><Star size={11} /> QA</span>}
                        {m.rol !== 'ADMIN' && !m.esKarla && <span className="text-xs text-slate-400">Equipo</span>}
                        {!m.activo && <span className="text-xs text-red-400">Inactivo</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => iniciarEdicion(m)} className="p-1.5 text-slate-400 hover:text-violet-600 hover:bg-violet-50 rounded-lg transition-colors"><Pencil size={14} /></button>
                      <button onClick={() => setBorrandoId(m.id)} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={14} /></button>
                    </div>
                  </>
                )}
              </div>
            ))}

            {mostrarNuevo && (
              <div className="px-5 py-4 border-t border-slate-100 bg-violet-50">
                <div className="flex flex-col gap-2">
                  <div className="flex gap-2 flex-wrap">
                    <input value={nuevoForm.nombre} onChange={(e) => setNuevoForm({ ...nuevoForm, nombre: e.target.value })} placeholder="Nombre" className="border border-violet-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-violet-400 w-36" autoFocus />
                    <input value={nuevoForm.email} onChange={(e) => setNuevoForm({ ...nuevoForm, email: e.target.value })} placeholder="Email" className="border border-violet-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-violet-400 w-48" />
                    <input type="password" value={nuevoForm.password} onChange={(e) => setNuevoForm({ ...nuevoForm, password: e.target.value })} placeholder="Contraseña" className="border border-violet-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-violet-400 w-40" />
                  </div>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                      <input type="checkbox" checked={nuevoForm.rol === 'ADMIN'} onChange={(e) => setNuevoForm({ ...nuevoForm, rol: e.target.checked ? 'ADMIN' : 'EQUIPO' })} className="accent-violet-600" />
                      Admin
                    </label>
                    <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                      <input type="checkbox" checked={nuevoForm.esKarla} onChange={(e) => setNuevoForm({ ...nuevoForm, esKarla: e.target.checked })} className="accent-violet-600" />
                      Rol QA (Karla)
                    </label>
                    <div className="flex gap-1 ml-auto">
                      <button onClick={handleAgregar} className="flex items-center gap-1 bg-violet-600 hover:bg-violet-700 text-white text-xs px-3 py-1.5 rounded-lg transition-colors">
                        <Check size={13} /> Agregar
                      </button>
                      <button onClick={() => { setMostrarNuevo(false); setNuevoForm(FORM_VACIO); setError('') }} className="text-slate-400 hover:text-slate-700 px-2"><X size={15} /></button>
                    </div>
                  </div>
                  {error && <p className="text-xs text-red-500">{error}</p>}
                </div>
              </div>
            )}
          </div>
        )}

        {!mostrarNuevo && (
          <button onClick={() => setMostrarNuevo(true)} className="flex items-center gap-2 text-sm text-violet-600 hover:text-violet-800 font-medium transition-colors">
            <Plus size={16} /> Agregar miembro
          </button>
        )}

        <div className="mt-6 bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-500 space-y-1">
          <p><strong>Admin:</strong> puede crear/editar proyectos y gestionar el equipo.</p>
          <p><strong>Rol QA (Karla):</strong> puede completar tareas de Fase 5 (Revisión Interna).</p>
          <p><strong>Equipo:</strong> ve sus tareas disponibles en todos los proyectos activos.</p>
        </div>
      </div>
    </Layout>
  )
}
