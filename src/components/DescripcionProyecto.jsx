import { useState, useLayoutEffect, useRef } from 'react'
import { Pencil, Check, X } from 'lucide-react'
import EditorEnriquecido from './EditorEnriquecido'
import TextoEnriquecido from './TextoEnriquecido'
import ModalDetalleTarea from './ModalDetalleTarea'

/**
 * Descripción libre del proyecto — contexto de qué trata y qué se busca
 * lograr, visible en el header tanto para admin como para equipo. Editable
 * por cualquiera de los dos (la ruta solo requiere sesión autenticada).
 */
export default function DescripcionProyecto({ descripcion, onGuardar }) {
  const [editando, setEditando] = useState(false)
  const [valor, setValor] = useState(descripcion || '')
  const [guardando, setGuardando] = useState(false)
  const [truncado, setTruncado] = useState(false)
  const [modalAbierto, setModalAbierto] = useState(false)
  const contenidoRef = useRef(null)

  // `contenidoRef` solo existe montado cuando !editando && hay descripción —
  // `editando` debe estar en las dependencias para remedir justo al volver
  // de editar (si no, con el ref recién montado en ese mismo render, el
  // efecto no se dispara de nuevo y `truncado` se queda con el valor de la
  // medición anterior).
  useLayoutEffect(() => {
    if (!contenidoRef.current) return
    setTruncado(contenidoRef.current.scrollHeight > contenidoRef.current.clientHeight + 2)
  }, [descripcion, editando])

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
      <div className="flex-1 min-w-0">
        <div ref={contenidoRef} className="line-clamp-3">
          <TextoEnriquecido html={descripcion} className="text-sm text-slate-600 leading-relaxed" />
        </div>
        {truncado && (
          <button
            onClick={() => setModalAbierto(true)}
            className="text-xs font-medium text-brand-700 hover:text-brand-800 mt-1"
          >
            Ver más
          </button>
        )}
      </div>
      <button
        onClick={() => setEditando(true)}
        className="text-slate-300 hover:text-brand-700 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5"
        title="Editar descripción"
      >
        <Pencil size={12} />
      </button>

      {modalAbierto && (
        <ModalDetalleTarea titulo="Descripción del proyecto" onCerrar={() => setModalAbierto(false)}>
          <TextoEnriquecido html={descripcion} className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed" />
        </ModalDetalleTarea>
      )}
    </div>
  )
}
