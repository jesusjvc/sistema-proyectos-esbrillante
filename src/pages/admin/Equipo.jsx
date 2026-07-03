import { useState } from 'react'
import Layout from '../../components/Layout'
import { getMiembros, agregarMiembro, editarMiembro, eliminarMiembro } from '../../data/storage'
import { Plus, Pencil, Trash2, Check, X, Shield, Star } from 'lucide-react'

export default function Equipo() {
  const [miembros, setMiembros] = useState(getMiembros)
  const [editandoId, setEditandoId] = useState(null)
  const [borrandoId, setBorrandoId] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [nuevoForm, setNuevoForm] = useState({ nombre: '', esAdmin: false, esKarla: false })
  const [mostrarNuevo, setMostrarNuevo] = useState(false)

  function refresh() { setMiembros(getMiembros()) }

  function iniciarEdicion(m) {
    setEditandoId(m.id)
    setEditForm({ nombre: m.nombre, esAdmin: m.esAdmin, esKarla: m.esKarla })
  }

  function guardarEdicion(id) {
    if (!editForm.nombre.trim()) return
    editarMiembro(id, editForm)
    setEditandoId(null)
    refresh()
  }

  function handleEliminar(id) {
    eliminarMiembro(id)
    setBorrandoId(null)
    refresh()
  }

  function handleAgregar() {
    if (!nuevoForm.nombre.trim()) return
    agregarMiembro(nuevoForm.nombre, { esAdmin: nuevoForm.esAdmin, esKarla: nuevoForm.esKarla })
    setNuevoForm({ nombre: '', esAdmin: false, esKarla: false })
    setMostrarNuevo(false)
    refresh()
  }

  return (
    <Layout titulo="Equipo">
      <div className="max-w-xl">
        <p className="text-sm text-slate-500 mb-6">
          Los miembros del equipo aparecen en los formularios de asignación al crear proyectos y en el selector de acceso al sistema.
        </p>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden mb-4">
          {miembros.map((m, idx) => (
            <div
              key={m.id}
              className={`px-5 py-4 flex items-center gap-3 ${idx !== 0 ? 'border-t border-slate-100' : ''}`}
            >
              {editandoId === m.id ? (
                /* ─ Fila en edición ─ */
                <div className="flex-1 flex items-center gap-3 flex-wrap">
                  <input
                    value={editForm.nombre}
                    onChange={(e) => setEditForm({ ...editForm, nombre: e.target.value })}
                    onKeyDown={(e) => e.key === 'Enter' && guardarEdicion(m.id)}
                    className="border border-violet-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-violet-400 w-48"
                    autoFocus
                  />
                  <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editForm.esAdmin}
                      onChange={(e) => setEditForm({ ...editForm, esAdmin: e.target.checked })}
                      className="accent-violet-600"
                    />
                    Admin
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editForm.esKarla}
                      onChange={(e) => setEditForm({ ...editForm, esKarla: e.target.checked })}
                      className="accent-violet-600"
                    />
                    Rol QA (Karla)
                  </label>
                  <div className="flex gap-1 ml-auto">
                    <button
                      onClick={() => guardarEdicion(m.id)}
                      className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-3 py-1.5 rounded-lg transition-colors"
                    >
                      <Check size={13} /> Guardar
                    </button>
                    <button
                      onClick={() => setEditandoId(null)}
                      className="text-slate-400 hover:text-slate-700 px-2"
                    >
                      <X size={15} />
                    </button>
                  </div>
                </div>
              ) : borrandoId === m.id ? (
                /* ─ Confirmación de borrado ─ */
                <div className="flex-1 flex items-center gap-3">
                  <span className="text-sm text-slate-600">¿Eliminar a <strong>{m.nombre}</strong>?</span>
                  <div className="flex gap-2 ml-auto">
                    <button
                      onClick={() => handleEliminar(m.id)}
                      className="bg-red-600 hover:bg-red-700 text-white text-xs px-3 py-1.5 rounded-lg transition-colors"
                    >
                      Eliminar
                    </button>
                    <button
                      onClick={() => setBorrandoId(null)}
                      className="text-slate-400 hover:text-slate-700 text-xs px-2"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                /* ─ Fila normal ─ */
                <>
                  <div className="w-8 h-8 bg-violet-100 rounded-full flex items-center justify-center text-violet-700 font-semibold text-sm shrink-0">
                    {m.nombre[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-slate-800 text-sm">{m.nombre}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {m.esAdmin && (
                        <span className="text-xs text-violet-600 flex items-center gap-0.5">
                          <Shield size={11} /> Admin
                        </span>
                      )}
                      {m.esKarla && (
                        <span className="text-xs text-amber-600 flex items-center gap-0.5">
                          <Star size={11} /> QA
                        </span>
                      )}
                      {!m.esAdmin && !m.esKarla && (
                        <span className="text-xs text-slate-400">Equipo</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => iniciarEdicion(m)}
                      className="p-1.5 text-slate-400 hover:text-violet-600 hover:bg-violet-50 rounded-lg transition-colors"
                      title="Editar"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => setBorrandoId(m.id)}
                      className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      title="Eliminar"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}

          {/* Formulario nuevo miembro */}
          {mostrarNuevo && (
            <div className="px-5 py-4 border-t border-slate-100 bg-violet-50">
              <div className="flex items-center gap-3 flex-wrap">
                <input
                  value={nuevoForm.nombre}
                  onChange={(e) => setNuevoForm({ ...nuevoForm, nombre: e.target.value })}
                  onKeyDown={(e) => e.key === 'Enter' && handleAgregar()}
                  placeholder="Nombre del miembro..."
                  className="border border-violet-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-violet-400 w-48"
                  autoFocus
                />
                <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={nuevoForm.esAdmin}
                    onChange={(e) => setNuevoForm({ ...nuevoForm, esAdmin: e.target.checked })}
                    className="accent-violet-600"
                  />
                  Admin
                </label>
                <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={nuevoForm.esKarla}
                    onChange={(e) => setNuevoForm({ ...nuevoForm, esKarla: e.target.checked })}
                    className="accent-violet-600"
                  />
                  Rol QA (Karla)
                </label>
                <div className="flex gap-1 ml-auto">
                  <button
                    onClick={handleAgregar}
                    disabled={!nuevoForm.nombre.trim()}
                    className="flex items-center gap-1 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white text-xs px-3 py-1.5 rounded-lg transition-colors"
                  >
                    <Check size={13} /> Agregar
                  </button>
                  <button
                    onClick={() => { setMostrarNuevo(false); setNuevoForm({ nombre: '', esAdmin: false, esKarla: false }) }}
                    className="text-slate-400 hover:text-slate-700 px-2"
                  >
                    <X size={15} />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {!mostrarNuevo && (
          <button
            onClick={() => setMostrarNuevo(true)}
            className="flex items-center gap-2 text-sm text-violet-600 hover:text-violet-800 font-medium transition-colors"
          >
            <Plus size={16} /> Agregar miembro
          </button>
        )}

        <div className="mt-6 bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-500 space-y-1">
          <p><strong>Admin:</strong> puede acceder con el PIN y crear/editar proyectos.</p>
          <p><strong>Rol QA (Karla):</strong> puede completar tareas de la Fase 5 (Revisión Interna), que están restringidas.</p>
          <p><strong>Equipo:</strong> accede al sistema con su nombre y ve sus tareas disponibles.</p>
        </div>
      </div>
    </Layout>
  )
}
