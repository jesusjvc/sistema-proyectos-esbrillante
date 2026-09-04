import { X } from 'lucide-react'

// Shell reutilizado por TareaRow (DetalleProyecto.jsx) y TareaCard (KanbanBoard.jsx)
// para mostrar el detalle y los comentarios de una tarea en un modal, estilo Trello,
// en lugar de expandirlos dentro de la fila/tarjeta.
export default function ModalDetalleTarea({ titulo, badges, accionesHeader, onCerrar, children }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onCerrar}>
      <div
        className="bg-white dark:bg-ink-700 rounded-2xl w-full max-w-lg shadow-2xl max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-200 dark:border-ink-500">
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
        <div className="p-5 space-y-4">
          {children}
        </div>
      </div>
    </div>
  )
}
