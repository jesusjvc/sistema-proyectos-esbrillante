import { useState, useRef, useEffect } from 'react'
import { UserX } from 'lucide-react'

// Popover que se abre al hacer clic en el ícono de "sin responsable" (el
// círculo punteado ámbar) o en el avatar de quien ya está asignado, para
// asignar o reasignar a una persona sin tener que abrir el modal completo
// de "Editar tarea". Si se pasa `children` (p. ej. un <Avatar>), ese es el
// disparador; si no, se usa el círculo punteado por defecto.
export default function SelectorResponsableRapido({ miembros = [], onAsignar, size = 30, iconSize = 14, children }) {
  const [abierto, setAbierto] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!abierto) return
    function alHacerClicFuera(e) {
      if (ref.current && !ref.current.contains(e.target)) setAbierto(false)
    }
    document.addEventListener('mousedown', alHacerClicFuera)
    return () => document.removeEventListener('mousedown', alHacerClicFuera)
  }, [abierto])

  return (
    <div
      ref={ref}
      className="relative shrink-0"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        style={children ? undefined : { width: size, height: size }}
        className={
          children
            ? 'rounded-full ring-offset-2 dark:ring-offset-ink-800 hover:ring-2 hover:ring-brand-300 transition-all'
            : 'rounded-full border-2 border-dashed border-amber-400 flex items-center justify-center hover:border-amber-500 hover:bg-amber-50 dark:hover:bg-amber-500/10 transition-colors'
        }
        title={children ? 'Cambiar responsable' : 'Sin responsable — clic para asignar a alguien'}
      >
        {children || <UserX size={iconSize} className="text-amber-500" />}
      </button>

      {abierto && (
        <div className="absolute z-20 top-full left-0 mt-1 w-48 bg-white dark:bg-ink-700 border border-slate-200 dark:border-ink-500 rounded-lg shadow-lg py-1 max-h-64 overflow-y-auto">
          {miembros.length === 0 && (
            <div className="px-3 py-2 text-sm text-slate-400">No hay usuarios</div>
          )}
          {miembros.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => { onAsignar(m.id); setAbierto(false) }}
              className="w-full text-left px-3 py-1.5 text-sm text-slate-700 dark:text-ink-100 hover:bg-brand-50 dark:hover:bg-brand-500/10 transition-colors"
            >
              {m.nombre}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
