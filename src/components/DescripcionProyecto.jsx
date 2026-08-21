import { useState } from 'react'
import { Pencil, Check, X } from 'lucide-react'
import EditorEnriquecido from './EditorEnriquecido'
import TextoEnriquecido from './TextoEnriquecido'

/**
 * Descripción libre del proyecto — contexto de qué trata y qué se busca
 * lograr, visible en el header tanto para admin como para equipo. Editable
 * por cualquiera de los dos (la ruta solo requiere sesión autenticada).
 */
export default function DescripcionProyecto({ descripcion, onGuardar }) {
  const [editando, setEditando] = useState(false)
  const [valor, setValor] = useState(descripcion || '')
  const [guardando, setGuardando] = useState(false)

  async function handleGuardar() {
    setGuardando(true)
    try {
      await onGuardar(valor.trim())
      setEditando(false)
    } finally {
      setGuardando(false)
    }
  }

  function handleCancelar() {
    setValor(descripcion || '')
    setEditando(false)
  }

  if (editando) {
    return (
      <div className="mt-2">
        <EditorEnriquecido
          value={valor}
          onChange={setValor}
          placeholder="De qué trata el proyecto y qué se busca lograr..."
        />
        <div className="flex gap-2 mt-1.5">
          <button
            onClick={handleGuardar}
            disabled={guardando}
            className="flex items-center gap-1 text-xs font-medium bg-brand-500 hover:bg-brand-600 disabled:opacity-60 text-slate-900 px-2.5 py-1.5 rounded-md transition-colors"
          >
            <Check size={12} /> Guardar
          </button>
          <button
            onClick={handleCancelar}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 px-2.5 py-1.5 rounded-md transition-colors"
          >
            <X size={12} /> Cancelar
          </button>
        </div>
      </div>
    )
  }

  if (!descripcion) {
    return (
      <button
        onClick={() => setEditando(true)}
        className="flex items-center gap-1 text-sm text-slate-400 hover:text-brand-700 mt-1.5 transition-colors"
      >
        <Pencil size={12} /> Agregar descripción del proyecto
      </button>
    )
  }

  return (
    <div className="mt-1.5 flex items-start gap-1.5 group">
      <TextoEnriquecido html={descripcion} className="text-sm text-slate-600 leading-relaxed flex-1" />
      <button
        onClick={() => setEditando(true)}
        className="text-slate-300 hover:text-brand-700 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5"
        title="Editar descripción"
      >
        <Pencil size={12} />
      </button>
    </div>
  )
}
