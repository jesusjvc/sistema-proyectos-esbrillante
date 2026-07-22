import { useState } from 'react'
import { Link } from 'react-router-dom'
import Layout from '../../components/Layout'
import { getPlantillas, crearPlantilla, eliminarPlantilla, FASES_WEB } from '../../data/plantillas'
import { Plus, Pencil, Trash2, ChevronRight, ListChecks, X, Check } from 'lucide-react'

const AREAS_SUGERIDAS = ['Web', 'Marketing', 'Branding', 'SEO', 'Redes Sociales', 'General']

export default function Paquetes() {
  const [plantillas, setPlantillas] = useState(getPlantillas)
  const [mostrarNuevo, setMostrarNuevo] = useState(false)
  const [borrandoId, setBorrandoId] = useState(null)
  const [nuevoForm, setNuevoForm] = useState({ nombre: '', area: 'Web', descripcion: '', copiarDe: '' })

  function refresh() { setPlantillas(getPlantillas()) }

  function handleCrear(e) {
    e.preventDefault()
    if (!nuevoForm.nombre.trim()) return

    let fases = FASES_WEB
    let tareasBase = []

    // Clonar desde otra plantilla si se eligió
    if (nuevoForm.copiarDe) {
      const origen = plantillas.find((p) => p.id === nuevoForm.copiarDe)
      if (origen) {
        fases = origen.fases
        tareasBase = origen.tareas.map((t) => ({
          ...t,
          id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2),
        }))
      }
    }

    crearPlantilla({ nombre: nuevoForm.nombre.trim(), area: nuevoForm.area, descripcion: nuevoForm.descripcion, fases })
    // Si clonamos, agregar tareas manualmente
    if (tareasBase.length) {
      const nuevas = getPlantillas()
      const nueva = nuevas[nuevas.length - 1]
      nueva.tareas = tareasBase
      localStorage.setItem('esbrillante_plantillas', JSON.stringify(nuevas))
    }

    setNuevoForm({ nombre: '', area: 'Web', descripcion: '', copiarDe: '' })
    setMostrarNuevo(false)
    refresh()
  }

  function handleEliminar(id) {
    eliminarPlantilla(id)
    setBorrandoId(null)
    refresh()
  }

  const porArea = plantillas.reduce((acc, p) => {
    if (!acc[p.area]) acc[p.area] = []
    acc[p.area].push(p)
    return acc
  }, {})

  return (
    <Layout titulo="Paquetes y plantillas">
      <div className="max-w-3xl">
        <p className="text-sm text-slate-500 mb-6">
          Cada paquete define las actividades que se generan al crear un proyecto. Puedes editar las actividades, agregar nuevos paquetes o crear áreas de trabajo completamente nuevas.
        </p>

        {/* Lista por área */}
        {Object.entries(porArea).map(([area, paquetes]) => (
          <div key={area} className="mb-8">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">{area}</h2>
            <div className="space-y-2">
              {paquetes.map((p) => (
                <div key={p.id} className="bg-white border border-slate-200 rounded-xl px-5 py-4 flex items-center gap-4">
                  {borrandoId === p.id ? (
                    <div className="flex-1 flex items-center gap-3">
                      <span className="text-sm text-slate-600">¿Eliminar <strong>{p.nombre}</strong>? Se perderán todas sus actividades.</span>
                      <button onClick={() => handleEliminar(p.id)} className="text-xs bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg transition-colors">Eliminar</button>
                      <button onClick={() => setBorrandoId(null)} className="text-xs text-slate-400 hover:text-slate-700">Cancelar</button>
                    </div>
                  ) : (
                    <>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-slate-800">{p.nombre}</div>
                        {p.descripcion && <div className="text-xs text-slate-400 mt-0.5 truncate">{p.descripcion}</div>}
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-xs text-slate-400 flex items-center gap-1">
                            <ListChecks size={11} /> {p.tareas.length} actividad{p.tareas.length !== 1 ? 'es' : ''}
                          </span>
                          <span className="text-xs text-slate-300">·</span>
                          <span className="text-xs text-slate-400">{p.fases.length} fases</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => setBorrandoId(p.id)} className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                          <Trash2 size={14} />
                        </button>
                        <Link
                          to={`/admin/paquetes/${p.id}`}
                          className="flex items-center gap-1.5 text-sm text-brand-700 hover:text-brand-800 font-medium px-3 py-1.5 rounded-lg hover:bg-brand-50 transition-colors"
                        >
                          <Pencil size={13} /> Editar
                        </Link>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Nuevo paquete */}
        {mostrarNuevo ? (
          <form onSubmit={handleCrear} className="bg-white border-2 border-brand-200 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-semibold text-slate-800">Nuevo paquete</h3>
              <button type="button" onClick={() => setMostrarNuevo(false)} className="text-slate-400 hover:text-slate-700"><X size={16} /></button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Nombre *</label>
                <input
                  value={nuevoForm.nombre}
                  onChange={(e) => setNuevoForm({ ...nuevoForm, nombre: e.target.value })}
                  className={inputCls}
                  placeholder="ej. Landing Page, Branding Básico..."
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Área</label>
                <div className="flex gap-2">
                  <input
                    value={nuevoForm.area}
                    onChange={(e) => setNuevoForm({ ...nuevoForm, area: e.target.value })}
                    list="areas-sugeridas"
                    className={inputCls + ' flex-1'}
                    placeholder="Web, Marketing..."
                  />
                  <datalist id="areas-sugeridas">
                    {AREAS_SUGERIDAS.map((a) => <option key={a} value={a} />)}
                  </datalist>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Descripción (opcional)</label>
              <input
                value={nuevoForm.descripcion}
                onChange={(e) => setNuevoForm({ ...nuevoForm, descripcion: e.target.value })}
                className={inputCls}
                placeholder="Breve descripción de qué incluye este paquete..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Copiar actividades desde (opcional)</label>
              <select
                value={nuevoForm.copiarDe}
                onChange={(e) => setNuevoForm({ ...nuevoForm, copiarDe: e.target.value })}
                className={inputCls}
              >
                <option value="">Empezar desde cero</option>
                {plantillas.map((p) => (
                  <option key={p.id} value={p.id}>{p.nombre} ({p.tareas.length} actividades)</option>
                ))}
              </select>
              {nuevoForm.copiarDe && (
                <p className="text-xs text-brand-700 mt-1">Se copiarán todas las actividades del paquete seleccionado. Podrás editarlas después.</p>
              )}
            </div>

            <div className="flex gap-3 pt-1">
              <button type="submit" disabled={!nuevoForm.nombre.trim()} className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-40 text-slate-900 px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors">
                <Check size={15} /> Crear paquete
              </button>
              <button type="button" onClick={() => setMostrarNuevo(false)} className="text-slate-500 hover:text-slate-700 text-sm px-4 py-2.5">
                Cancelar
              </button>
            </div>
          </form>
        ) : (
          <button
            onClick={() => setMostrarNuevo(true)}
            className="flex items-center gap-2 text-sm text-brand-700 hover:text-brand-800 font-medium transition-colors"
          >
            <Plus size={16} /> Nuevo paquete
          </button>
        )}
      </div>
    </Layout>
  )
}

const inputCls = 'w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent placeholder:text-slate-400'
