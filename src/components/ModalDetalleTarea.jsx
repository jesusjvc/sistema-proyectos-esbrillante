import { X } from 'lucide-react'
import useEscape from '../hooks/useEscape'

// Shell reutilizado por TareaRow (DetalleProyecto.jsx), TareaCard (KanbanBoard.jsx)
// y la bandeja MisTareas para mostrar el detalle y los comentarios de una tarea
// en un modal, estilo Trello, en lugar de expandirlos dentro de la fila/tarjeta.
//
// Con `aside` el modal se ensancha (max-w-3xl) y el cuerpo se parte en dos
// columnas con scroll independiente — contenido a la izquierda, `aside`
// (comentarios) a la derecha; en móvil se apilan con un solo scroll.
export default function ModalDetalleTarea({ titulo, badges, accionesHeader, onCerrar, children, aside }) {
  useEscape(onCerrar)
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onCerrar}>
      <div
        className={
          aside
            ? 'bg-white dark:bg-ink-700 rounded-2xl w-full max-w-3xl shadow-2xl max-h-[85vh] flex flex-col overflow-hidden'
            : 'bg-white dark:bg-ink-700 rounded-2xl w-full max-w-lg shadow-2xl max-h-[85vh] overflow-y-auto'
        }
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-200 dark:border-ink-500 shrink-0">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <h3 className="font-semibold text-slate-800 dark:text-ink-100">{titulo}</h3>
            {badges}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {accionesHeader}
            <button onClick={onCerrar} className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-ink-100 rounded-lg transition-colors">
              <X size={18} />
            </button>
          </div>
        </div>
        {aside ? (
          <div className="flex-1 min-h-0 overflow-y-auto md:grid md:grid-cols-[minmax(0,1fr)_17.5rem] md:overflow-hidden">
            <div className="p-5 space-y-4 md:overflow-y-auto min-h-0">{children}</div>
            <div className="border-t border-slate-200 dark:border-ink-500 p-4 md:border-t-0 md:border-l md:overflow-y-auto min-h-0 bg-slate-50/50 dark:bg-ink-800/40">
              {aside}
            </div>
          </div>
        ) : (
          <div className="p-5 space-y-4">
            {children}
          </div>
        )}
      </div>
    </div>
  )
}
