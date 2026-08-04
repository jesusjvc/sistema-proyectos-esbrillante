import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { getPrototipos, crearPrototipo, actualizarPrototipo, eliminarPrototipo } from '../data/api'
import { ExternalLink, Download, Trash2, Plus, X, CheckCircle2, Circle } from 'lucide-react'

const inputCls = 'w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent placeholder:text-slate-400'

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

  async function toggleAprobado(p) {
    await actualizarPrototipo(p.slug, { aprobado: !p.aprobado })
    cargar()
  }

  async function handleEliminar(p) {
    if (!confirm(`¿Eliminar el prototipo "${p.nombre_original}"? Esta acción no se puede deshacer.`)) return
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
          {prototipos.map((p) => (
            <div key={p.slug} className="px-5 py-3.5 flex items-center gap-3 flex-wrap">
              <button onClick={() => toggleAprobado(p)} title={p.aprobado ? 'Marcar pendiente' : 'Marcar aprobado'} className="shrink-0">
                {p.aprobado
                  ? <CheckCircle2 size={18} className="text-emerald-500" />
                  : <Circle size={18} className="text-slate-300" />}
              </button>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-slate-800 truncate">{p.nombre_original}</div>
                <div className="text-xs text-slate-400">v{p.version} · {p.fecha_actualizacion.slice(0, 10)}</div>
              </div>
              <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${p.aprobado ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                {p.aprobado ? 'Aprobado' : 'Pendiente'}
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <a href={p.url} target="_blank" rel="noreferrer" className="text-slate-400 hover:text-brand-700" title="Ver prototipo"><ExternalLink size={15} /></a>
                <a href={`${p.url}/download`} className="text-slate-400 hover:text-brand-700" title="Descargar HTML"><Download size={15} /></a>
                {esAdmin && (
                  <button onClick={() => handleEliminar(p)} className="text-slate-400 hover:text-red-600" title="Eliminar"><Trash2 size={15} /></button>
                )}
              </div>
            </div>
          ))}
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

function ModalNuevoPrototipo({ proyectoSlug, proyectoNombre, onCreado, onCerrar }) {
  const [nombre, setNombre] = useState('')
  const [html, setHtml] = useState('')
  const [nombreArchivo, setNombreArchivo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')

  function cargarArchivo(file) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = (e) => { setHtml(e.target.result); setNombreArchivo(`${file.name} · ${(file.size / 1024).toFixed(1)} KB`) }
    reader.readAsText(file)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!nombre.trim() || !html) return
    setEnviando(true)
    setError('')
    try {
      await crearPrototipo({ nombre: nombre.trim(), html, proyectoSlug, proyectoNombre })
      onCreado()
    } catch (err) {
      setError(err.message)
      setEnviando(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onCerrar}>
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h3 className="font-semibold text-slate-800">Nuevo prototipo</h3>
          <button onClick={onCerrar} className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Nombre</label>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} className={inputCls} placeholder="Ej: Home — v2" autoFocus />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Archivo HTML</label>
            <label className="flex flex-col items-center justify-center gap-1 border-2 border-dashed border-slate-200 hover:border-brand-300 rounded-xl py-6 cursor-pointer transition-colors">
              <input type="file" accept=".html,text/html" className="hidden" onChange={(e) => cargarArchivo(e.target.files[0])} />
              <span className="text-sm text-slate-500">{nombreArchivo || 'Haz clic para seleccionar un archivo'}</span>
            </label>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={!nombre.trim() || !html || enviando} className="flex-1 bg-brand-500 hover:bg-brand-600 disabled:opacity-40 text-slate-900 py-2.5 rounded-lg text-sm font-semibold transition-colors">
              {enviando ? 'Publicando…' : 'Publicar prototipo'}
            </button>
            <button type="button" onClick={onCerrar} className="px-5 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg text-sm transition-colors">
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
