import { useState } from 'react'
import { crearPrototipo } from '../data/api'
import { X } from 'lucide-react'

const inputCls = 'w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent placeholder:text-slate-400'

/**
 * Modal para publicar un prototipo o página web.
 * - proyectos (opcional): si se pasa, muestra un selector de proyecto (vista global /admin/prototipos).
 * - proyectoSlug/proyectoNombre (opcional): si no hay `proyectos`, el proyecto queda fijo (pestaña dentro de un proyecto).
 */
export default function ModalNuevoPrototipo({ proyectos, proyectoSlug: proyectoFijo, proyectoNombre: proyectoFijoNombre, onCreado, onCerrar }) {
  const [nombre, setNombre] = useState('')
  const [tipo, setTipo] = useState('prototipo')
  const [modo, setModo] = useState('html')
  const [html, setHtml] = useState('')
  const [nombreArchivo, setNombreArchivo] = useState('')
  const [url, setUrl] = useState('')
  const [proyectoSlug, setProyectoSlug] = useState(proyectoFijo || '')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')

  function cargarArchivo(file) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = (e) => { setHtml(e.target.result); setNombreArchivo(`${file.name} · ${(file.size / 1024).toFixed(1)} KB`) }
    reader.readAsText(file)
  }

  const listo = nombre.trim() && (modo === 'html' ? html : url.trim())

  async function handleSubmit(e) {
    e.preventDefault()
    if (!listo) return
    setEnviando(true)
    setError('')
    try {
      const proyecto = proyectos?.find((p) => p.slug === proyectoSlug)
      const proyectoNombreFinal = proyectos ? (proyecto?.cliente?.nombreComercial ?? undefined) : proyectoFijoNombre
      await crearPrototipo({
        nombre: nombre.trim(),
        tipo,
        modo,
        html: modo === 'html' ? html : undefined,
        url: modo === 'url' ? url.trim() : undefined,
        proyectoSlug: proyectoSlug || undefined,
        proyectoNombre: proyectoNombreFinal,
      })
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

          {proyectos && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Proyecto</label>
              <select value={proyectoSlug} onChange={(e) => setProyectoSlug(e.target.value)} className={inputCls}>
                <option value="">Sin proyecto</option>
                {proyectos.map((p) => <option key={p.slug} value={p.slug}>{p.cliente.nombreComercial}</option>)}
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Tipo</label>
            <div className="flex gap-2">
              {[['prototipo', 'Prototipo'], ['pagina_web', 'Página web']].map(([v, l]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setTipo(v)}
                  className={`flex-1 text-sm font-medium py-2 rounded-lg border transition-colors ${
                    tipo === v ? 'border-brand-500 bg-brand-50 text-brand-800' : 'border-slate-200 text-slate-500 hover:border-slate-300'
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>

          {tipo === 'pagina_web' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">¿Cómo la vas a compartir?</label>
              <div className="flex gap-2">
                {[['html', 'Subir HTML'], ['url', 'URL externa (Elementor, Vercel...)']].map(([v, l]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setModo(v)}
                    className={`flex-1 text-xs font-medium py-2 rounded-lg border transition-colors ${
                      modo === v ? 'border-brand-500 bg-brand-50 text-brand-800' : 'border-slate-200 text-slate-500 hover:border-slate-300'
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
          )}

          {modo === 'html' ? (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Archivo HTML</label>
              <label className="flex flex-col items-center justify-center gap-1 border-2 border-dashed border-slate-200 hover:border-brand-300 rounded-xl py-6 cursor-pointer transition-colors">
                <input type="file" accept=".html,text/html" className="hidden" onChange={(e) => cargarArchivo(e.target.files[0])} />
                <span className="text-sm text-slate-500">{nombreArchivo || 'Haz clic para seleccionar un archivo'}</span>
              </label>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">URL</label>
              <input value={url} onChange={(e) => setUrl(e.target.value)} className={inputCls} placeholder="https://mi-demo.vercel.app" />
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={!listo || enviando} className="flex-1 bg-brand-500 hover:bg-brand-600 disabled:opacity-40 text-slate-900 py-2.5 rounded-lg text-sm font-semibold transition-colors">
              {enviando ? 'Publicando…' : 'Publicar'}
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
