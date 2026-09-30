import { useRef, useState } from 'react'
import { Paperclip, ExternalLink, X, Loader2 } from 'lucide-react'
import { adjuntarArchivoTarea, quitarAdjuntoTarea } from '../data/api'
import { formatFechaHora } from '../data/storage'

// Archivos que el equipo adjunta a una tarea — van a la carpeta de Drive del
// proyecto y en la tarea queda nombre + enlace + quién subió. Cualquiera que
// pueda operar la tarea puede adjuntar o quitar.
export default function AdjuntosTarea({ slug, tarea, onRefrescar, compacto = false }) {
  const inputRef = useRef(null)
  const [subiendo, setSubiendo] = useState(false)
  const [error, setError] = useState('')
  const adjuntos = Array.isArray(tarea.adjuntos) ? tarea.adjuntos : []

  async function handleFile(e) {
    const archivo = e.target.files?.[0]
    e.target.value = ''
    if (!archivo) return
    setError('')
    setSubiendo(true)
    try {
      await adjuntarArchivoTarea(slug, tarea.id, archivo)
      onRefrescar?.()
    } catch (err) {
      setError(err.message || 'No se pudo subir el archivo')
    } finally {
      setSubiendo(false)
    }
  }

  async function quitar(url) {
    setError('')
    try {
      await quitarAdjuntoTarea(slug, tarea.id, url)
      onRefrescar?.()
    } catch (err) {
      setError(err.message || 'No se pudo quitar el adjunto')
    }
  }

  return (
    <div className="space-y-1.5">
      {error && <p className="text-xs text-red-500">{error}</p>}
      {adjuntos.map((a) => (
        <div key={a.url} className="flex items-center gap-1.5 text-xs min-w-0">
          <Paperclip size={11} className="shrink-0 text-slate-400 dark:text-ink-400" />
          <a href={a.url} target="_blank" rel="noreferrer" className="truncate text-slate-600 dark:text-ink-300 hover:text-brand-700 dark:hover:text-brand-300 hover:underline underline-offset-2 font-medium">
            {a.nombre}
          </a>
          <span className="text-[10px] text-slate-400 dark:text-ink-400 shrink-0">
            {a.subidoPor} · {formatFechaHora(a.fecha)}
          </span>
          <button onClick={() => quitar(a.url)} className="text-slate-300 dark:text-ink-500 hover:text-red-500 transition-colors shrink-0" title="Quitar adjunto">
            <X size={11} />
          </button>
        </div>
      ))}
      <label className={`inline-flex items-center gap-1.5 text-xs font-medium cursor-pointer transition-colors ${compacto ? 'text-slate-400 hover:text-brand-700 dark:text-ink-400 dark:hover:text-brand-300' : 'text-slate-400 hover:text-brand-700'}`}>
        {subiendo ? <Loader2 size={12} className="animate-spin" /> : <Paperclip size={12} />}
        {subiendo ? 'Subiendo...' : 'Adjuntar archivo'}
        <input ref={inputRef} type="file" className="hidden" onChange={handleFile} />
      </label>
    </div>
  )
}
