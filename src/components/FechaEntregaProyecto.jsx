import { useState } from 'react'
import { Pencil, Check, X } from 'lucide-react'
import { formatFecha } from '../data/storage'

// Fecha estimada de entrega de un proyecto finito — editable inline, mismo
// patrón de click-to-edit que DescripcionProyecto.
export default function FechaEntregaProyecto({ fecha, onGuardar }) {
  const [editando, setEditando] = useState(false)
  const [valor, setValor] = useState(fecha || '')
  const [guardando, setGuardando] = useState(false)

  async function handleGuardar() {
    setGuardando(true)
    try {
      await onGuardar(valor)
      setEditando(false)
    } finally {
      setGuardando(false)
    }
  }

  function handleCancelar() {
    setValor(fecha || '')
    setEditando(false)
  }

  if (editando) {
    return (
      <div className="flex items-center gap-1.5 mt-0.5">
        <input
          type="date"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          className="text-sm border border-slate-200 dark:border-ink-500 dark:bg-ink-700 dark:text-ink-100 rounded-md px-1.5 py-0.5"
        />
        <button
          onClick={handleGuardar}
          disabled={guardando}
          className="text-emerald-600 hover:text-emerald-700 disabled:opacity-60"
          title="Guardar"
        >
          <Check size={14} />
        </button>
        <button onClick={handleCancelar} className="text-slate-400 hover:text-slate-600 dark:hover:text-ink-100" title="Cancelar">
          <X size={14} />
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1 group">
      <span className="font-semibold text-slate-800 dark:text-ink-100">{formatFecha(fecha)}</span>
      <button
        onClick={() => setEditando(true)}
        className="text-slate-300 dark:text-ink-400 hover:text-brand-700 dark:hover:text-brand-400 opacity-0 group-hover:opacity-100 transition-opacity"
        title="Editar fecha de entrega"
      >
        <Pencil size={11} />
      </button>
    </div>
  )
}
