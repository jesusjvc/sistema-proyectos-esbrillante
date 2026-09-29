import { useState, useRef, useEffect } from 'react'
import { X, Plus } from 'lucide-react'
import { actualizarEtiquetasProyecto } from '../data/api'

// Sugerencias de etiquetas de tipo de servicio — se pueden escribir otras
// libres; las que ya están puestas en el proyecto no se repiten.
const SUGERENCIAS = ['Tienda online', 'Landing page', 'Sitio web', 'SEO', 'Google Ads', 'Meta Ads', 'Redes sociales', 'Mantenimiento']

/**
 * Etiquetas libres de tipo de servicio del proyecto (Tienda online, SEO,
 * Google Ads...). Editable solo por admin (la ruta exige admin); el equipo
 * las ve como chips de solo lectura.
 */
export default function EtiquetasProyecto({ slug, etiquetas, editable, onGuardado }) {
  const [editando, setEditando] = useState(false)
  const [lista, setLista] = useState(etiquetas || [])
  const [valor, setValor] = useState('')
  const [guardando, setGuardando] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => { setLista(etiquetas || []) }, [etiquetas])
  useEffect(() => { if (editando) inputRef.current?.focus() }, [editando])

  if (!editando) {
    if (!lista.length && !editable) return null
    return (
      <div className="flex items-center gap-1.5 flex-wrap mt-1">
        {lista.map((e) => (
          <span key={e} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 dark:bg-ink-700 text-slate-600 dark:text-ink-300">
            {e}
            {editable && (
              <button
                onClick={() => guardar(lista.filter((x) => x !== e))}
                className="text-slate-400 dark:text-ink-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                title={`Quitar "${e}"`}
              >
                <X size={10} />
              </button>
            )}
          </span>
        ))}
        {editable && (
          <button
            onClick={() => setEditando(true)}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium text-slate-400 dark:text-ink-400 border border-dashed border-slate-300 dark:border-ink-500 hover:border-brand-500 dark:hover:border-brand-500 hover:text-brand-700 dark:hover:text-brand-400 transition-colors"
          >
            <Plus size={10} /> {lista.length ? 'Editar' : 'Agregar etiqueta'}
          </button>
        )}
      </div>
    )
  }

  const sugerencias = SUGERENCIAS.filter((s) => !lista.some((e) => e.toLowerCase() === s.toLowerCase()))

  function agregar(valorNuevo) {
    const limpio = valorNuevo.trim().slice(0, 40)
    if (limpio && !lista.some((e) => e.toLowerCase() === limpio.toLowerCase())) setLista([...lista, limpio])
    setValor('')
  }

  async function guardar(final) {
    setGuardando(true)
    try {
      await actualizarEtiquetasProyecto(slug, final)
      setLista(final)
      setEditando(false)
      onGuardado?.()
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="mt-1 flex flex-col gap-2">
      <div className="flex items-center gap-1.5 flex-wrap">
        {lista.map((e, i) => (
          <span key={e} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 dark:bg-ink-700 text-slate-600 dark:text-ink-300">
            {e}
            <button onClick={() => setLista(lista.filter((_, idx) => idx !== i))} className="text-slate-400 dark:text-ink-400 hover:text-red-600 dark:hover:text-red-400 transition-colors" title={`Quitar "${e}"`}>
              <X size={10} />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); agregar(valor) }
            if (e.key === ',') { e.preventDefault(); agregar(valor) }
            if (e.key === 'Backspace' && !valor && lista.length) setLista(lista.slice(0, -1))
          }}
          placeholder="Escribe una etiqueta..."
          className="text-xs bg-transparent border-none outline-none text-slate-700 dark:text-ink-200 placeholder:text-slate-400 dark:placeholder:text-ink-400 min-w-36 flex-1"
        />
      </div>
      {sugerencias.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] uppercase tracking-wide text-slate-400 dark:text-ink-400">Sugerencias:</span>
          {sugerencias.map((s) => (
            <button
              key={s}
              onClick={() => agregar(s)}
              className="px-1.5 py-0.5 rounded-full text-[10px] font-medium text-slate-500 dark:text-ink-300 border border-slate-200 dark:border-ink-500 hover:border-brand-500 dark:hover:border-brand-500 hover:text-brand-700 dark:hover:text-brand-400 transition-colors"
            >
              + {s}
            </button>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <button
          onClick={() => guardar(lista)}
          disabled={guardando}
          className="text-xs font-medium bg-brand-500 hover:bg-brand-600 disabled:opacity-60 text-slate-900 px-2.5 py-1.5 rounded-md transition-colors"
        >
          Guardar
        </button>
        <button
          onClick={() => { setLista(etiquetas || []); setValor(''); setEditando(false) }}
          className="text-xs text-slate-500 dark:text-ink-300 hover:text-slate-700 dark:hover:text-ink-100 px-2.5 py-1.5 rounded-md transition-colors"
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}
