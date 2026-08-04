import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { getPrototipos, actualizarPrototipo, eliminarPrototipo } from '../data/api'
import { ESTADO_CONFIG, ESTADO_OPCIONES } from '../data/prototipos'
import ModalNuevoPrototipo from './ModalNuevoPrototipo'
import { ExternalLink, Download, Trash2, Plus, MessageCircle } from 'lucide-react'

/**
 * Lista de prototipos de un proyecto (esbrillante-pages-mcp es la fuente de verdad).
 * Se usa tanto en DetalleProyecto (admin) como en ProyectoEquipo.
 */
export default function PrototiposPanel({ proyectoSlug, proyectoNombre }) {
  const { user } = useAuth()
  const esAdmin = user?.rol === 'admin'
  const [prototipos, setPrototipos] = useState(null)
  const [error, setError] = useState('')
  const [modalNuevo, setModalNuevo] = useState(false)

  const cargar = useCallback(() => {
    getPrototipos()
      .then((todos) => setPrototipos(todos.filter((p) => p.proyectoSlug === proyectoSlug)))
      .catch((err) => setError(err.message))
  }, [proyectoSlug])

  useEffect(() => { cargar() }, [cargar])

  async function cambiarEstado(p, estado) {
    await actualizarPrototipo(p.slug, { estado })
    cargar()
  }

  async function handleEliminar(p) {
    if (!confirm(`¿Eliminar "${p.nombre_original}"? Esta acción no se puede deshacer.`)) return
    await eliminarPrototipo(p.slug)
    cargar()
  }

  if (error) return <div className="text-sm text-red-600">{error}</div>
  if (!prototipos) return <div className="flex justify-center py-8"><div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" /></div>

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          onClick={() => setModalNuevo(true)}
          className="flex items-center gap-1.5 text-xs text-brand-700 hover:text-brand-800 transition-colors"
        >
          <Plus size={13} /> Nuevo prototipo
        </button>
      </div>

      {prototipos.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-6 text-center text-sm text-slate-400">
          Aún no hay prototipos para este proyecto.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-50">
          {prototipos.map((p) => {
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
                <div className="flex items-center gap-2 shrink-0">
                  <a href={p.url} target="_blank" rel="noreferrer" className="text-slate-400 hover:text-brand-700" title="Ver"><ExternalLink size={15} /></a>
                  {p.archivo && (
                    <a href={`${p.url}/download`} className="text-slate-400 hover:text-brand-700" title="Descargar HTML"><Download size={15} /></a>
                  )}
                  {esAdmin && (
                    <button onClick={() => handleEliminar(p)} className="text-slate-400 hover:text-red-600" title="Eliminar"><Trash2 size={15} /></button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {modalNuevo && (
        <ModalNuevoPrototipo
          proyectoSlug={proyectoSlug}
          proyectoNombre={proyectoNombre}
          onCreado={() => { setModalNuevo(false); cargar() }}
          onCerrar={() => setModalNuevo(false)}
        />
      )}
    </div>
  )
}
