import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, Search, Check } from 'lucide-react'
import { getProyectos } from '../data/api'
import { statusBadge, statusLabel } from '../data/storage'

// Selector rápido de proyecto en el header de DetalleProyecto — evita tener
// que volver al listado para cambiar de proyecto (inspirado en el selector
// de zona de Cloudflare). Se porta a document.body porque el título vive
// dentro de un contenedor con `truncate` (overflow:hidden) que recortaría
// el menú si se quedara anidado ahí.
export default function SelectorProyecto({ proyectoActual, base }) {
  const navigate = useNavigate()
  const [abierto, setAbierto] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [proyectos, setProyectos] = useState(null)
  const [pos, setPos] = useState(null)
  const triggerRef = useRef(null)
  const panelRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    if (!abierto) return
    if (proyectos === null) getProyectos().then(setProyectos).catch(() => setProyectos([]))

    const rect = triggerRef.current.getBoundingClientRect()
    setPos({
      top: rect.bottom + 6,
      left: Math.min(rect.left, window.innerWidth - 340),
    })

    function handleClickFuera(e) {
      if (panelRef.current?.contains(e.target) || triggerRef.current?.contains(e.target)) return
      cerrar()
    }
    function handleEscape(e) {
      if (e.key === 'Escape') cerrar()
    }
    document.addEventListener('mousedown', handleClickFuera)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickFuera)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [abierto])

  // El input del buscador solo existe en el DOM una vez que `pos` ya se
  // calculó (el panel se monta condicionado a `abierto && pos`) — enfocarlo
  // en el mismo efecto que abre el menú sería enfocar un ref todavía null.
  useEffect(() => {
    if (abierto && pos) inputRef.current?.focus()
  }, [abierto, pos])

  function cerrar() {
    setAbierto(false)
    setBusqueda('')
  }

  function irA(slug) {
    cerrar()
    if (slug !== proyectoActual.slug) navigate(`${base}/proyecto/${slug}`)
  }

  const q = busqueda.trim().toLowerCase()
  const lista = (proyectos || [])
    .filter((p) => p.status !== 'cancelado')
    .filter((p) => !q || p.cliente.nombreComercial.toLowerCase().includes(q))
    .sort((a, b) => a.cliente.nombreComercial.localeCompare(b.cliente.nombreComercial))

  return (
    <>
      <button
        ref={triggerRef}
        onClick={() => setAbierto((v) => !v)}
        className="flex items-center gap-1 min-w-0 hover:opacity-80 transition-opacity"
      >
        <span className="truncate">{proyectoActual.cliente.nombreComercial}</span>
        <ChevronDown size={16} className="shrink-0 text-slate-400 dark:text-ink-400" />
      </button>

      {abierto && pos && createPortal(
        <div
          ref={panelRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left }}
          className="z-50 w-80 bg-white dark:bg-ink-800 border border-slate-200 dark:border-ink-500 rounded-xl shadow-xl overflow-hidden"
        >
          <div className="p-2 border-b border-slate-100 dark:border-ink-600">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                ref={inputRef}
                type="text"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar proyecto..."
                className="w-full pl-8 pr-2 py-1.5 text-sm bg-slate-50 dark:bg-ink-700 dark:text-ink-100 border border-slate-200 dark:border-ink-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300"
              />
            </div>
          </div>

          <div className="max-h-72 overflow-y-auto py-1">
            {proyectos === null ? (
              <div className="flex justify-center py-6">
                <div className="w-4 h-4 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : lista.length === 0 ? (
              <div className="text-center text-sm text-slate-400 dark:text-ink-400 py-6">Sin resultados</div>
            ) : (
              lista.map((p) => {
                const esActual = p.slug === proyectoActual.slug
                return (
                  <button
                    key={p.id}
                    onClick={() => irA(p.slug)}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                      esActual ? 'bg-brand-50 dark:bg-brand-500/10' : 'hover:bg-slate-50 dark:hover:bg-ink-700'
                    }`}
                  >
                    {esActual ? <Check size={14} className="text-brand-700 dark:text-brand-400 shrink-0" /> : <span className="w-3.5 shrink-0" />}
                    <span className="flex-1 min-w-0 truncate text-slate-700 dark:text-ink-100">{p.cliente.nombreComercial}</span>
                    <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ${statusBadge(p.status)}`}>
                      {statusLabel(p.status)}
                    </span>
                  </button>
                )
              })
            )}
          </div>

          <div className="flex items-center justify-between px-3 py-2 border-t border-slate-100 dark:border-ink-600 text-xs text-slate-400 dark:text-ink-400">
            <span>{proyectos ? `${lista.length} proyecto${lista.length === 1 ? '' : 's'}` : ''}</span>
            <button onClick={() => { cerrar(); navigate(base) }} className="font-medium text-brand-700 dark:text-brand-400 hover:text-brand-800 dark:hover:text-brand-300">
              Ver todos →
            </button>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
