import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import Layout from '../components/Layout'
import { useAuth } from '../context/AuthContext'
import { getPrototipos, getProyectos, actualizarPrototipo, eliminarPrototipo } from '../data/api'
import { ESTADO_CONFIG, ESTADO_OPCIONES } from '../data/prototipos'
import ModalNuevoPrototipo from '../components/ModalNuevoPrototipo'
import { ExternalLink, Download, Trash2, Plus, MessageCircle } from 'lucide-react'

export default function Prototipos() {
  const { user } = useAuth()
  const base = user?.rol === 'admin' ? '/admin' : '/equipo'
  const [prototipos, setPrototipos] = useState(null)
  const [proyectos, setProyectos] = useState([])
  const [error, setError] = useState('')
  const [modalNuevo, setModalNuevo] = useState(false)

  const cargar = useCallback(async () => {
    try {
      const [protos, proys] = await Promise.all([getPrototipos(), getProyectos()])
      setPrototipos(protos)
      setProyectos(proys)
    } catch (err) {
      setError(err.message)
    }
  }, [])

  useEffect(() => { cargar() }, [cargar])

  async function cambiarEstado(p, estado) {
    await actualizarPrototipo(p.slug, { estado })
    cargar()
  }

  async function reasignar(p, proyectoSlug) {
    const proyecto = proyectos.find((pr) => pr.slug === proyectoSlug)
    await actualizarPrototipo(p.slug, {
      proyectoSlug: proyectoSlug || null,
      proyectoNombre: proyecto ? proyecto.cliente.nombreComercial : null,
    })
    cargar()
  }

  async function handleEliminar(p) {
    if (!confirm(`¿Eliminar "${p.nombre_original}"? Esta acción no se puede deshacer.`)) return
    await eliminarPrototipo(p.slug)
    cargar()
  }

  if (error) return <Layout titulo="Prototipos"><div className="text-sm text-red-600">{error}</div></Layout>
  if (!prototipos) {
    return (
      <Layout titulo="Prototipos">
        <div className="flex justify-center py-12">
          <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </Layout>
    )
  }

  const grupos = new Map()
  for (const p of prototipos) {
    const key = p.proyectoSlug || '__sin_proyecto__'
    if (!grupos.has(key)) grupos.set(key, [])
    grupos.get(key).push(p)
  }
  const gruposOrdenados = [...grupos.entries()].sort(([a], [b]) =>
    a === '__sin_proyecto__' ? 1 : b === '__sin_proyecto__' ? -1 : 0
  )

  return (
    <Layout titulo="Prototipos">
      <div className="flex justify-end mb-4">
        <button
          onClick={() => setModalNuevo(true)}
          className="flex items-center gap-1.5 text-sm bg-brand-500 hover:bg-brand-600 text-slate-900 font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <Plus size={15} /> Nuevo prototipo
        </button>
      </div>

      {prototipos.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-sm text-slate-400">
          No hay prototipos publicados todavía.
        </div>
      ) : (
        <div className="space-y-6">
          {gruposOrdenados.map(([key, items]) => {
            const proyecto = proyectos.find((pr) => pr.slug === key)
            const titulo = key === '__sin_proyecto__' ? 'Sin proyecto asignado' : (proyecto?.cliente?.nombreComercial || key)
            return (
              <div key={key}>
                <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800 mb-2">
                  {proyecto ? (
                    <Link to={`${base}/proyecto/${proyecto.slug}`} className="hover:text-brand-700">{titulo}</Link>
                  ) : titulo}
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                    {items.length} prototipo{items.length === 1 ? '' : 's'}
                  </span>
                </h2>
                <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-50">
                  {items.map((p) => {
                    const cfg = ESTADO_CONFIG[p.estado] || ESTADO_CONFIG.en_revision
                    return (
                      <div key={p.slug} className="px-5 py-3.5 flex items-center gap-3 flex-wrap">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-slate-800 truncate">
                            {p.nombre_original}
                            {p.tipo === 'pagina_web' && <span className="ml-1.5 text-[10px] font-bold uppercase text-slate-400">· página web</span>}
                          </div>
                          <div className="text-xs text-slate-400">v{p.version} · {p.fecha_actualizacion.slice(0, 10)}</div>
                        </div>
                        {p.comentariosPendientes > 0 && (
                          <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                            <MessageCircle size={11} /> {p.comentariosPendientes}
                          </span>
                        )}
                        <select
                          value={p.estado}
                          onChange={(e) => cambiarEstado(p, e.target.value)}
                          className={`text-[11px] font-bold uppercase border-none rounded-full px-2.5 py-1 outline-none cursor-pointer ${cfg.className}`}
                        >
                          {ESTADO_OPCIONES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                        <select
                          value={p.proyectoSlug || ''}
                          onChange={(e) => reasignar(p, e.target.value)}
                          className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 text-slate-600 outline-none focus:ring-2 focus:ring-brand-400"
                        >
                          <option value="">Sin proyecto</option>
                          {proyectos.map((pr) => (
                            <option key={pr.slug} value={pr.slug}>{pr.cliente.nombreComercial}</option>
                          ))}
                        </select>
                        <div className="flex items-center gap-2 shrink-0">
                          <a href={p.url} target="_blank" rel="noreferrer" className="text-slate-400 hover:text-brand-700" title="Ver"><ExternalLink size={15} /></a>
                          {p.archivo && (
                            <a href={`${p.url}/download`} className="text-slate-400 hover:text-brand-700" title="Descargar HTML"><Download size={15} /></a>
                          )}
                          <button onClick={() => handleEliminar(p)} className="text-slate-400 hover:text-red-600" title="Eliminar"><Trash2 size={15} /></button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {modalNuevo && (
        <ModalNuevoPrototipo
          proyectos={proyectos}
          onCreado={() => { setModalNuevo(false); cargar() }}
          onCerrar={() => setModalNuevo(false)}
        />
      )}
    </Layout>
  )
}
