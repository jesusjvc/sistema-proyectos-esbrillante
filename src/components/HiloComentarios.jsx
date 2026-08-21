import { useState, useRef } from 'react'
import { MessageSquare, Send } from 'lucide-react'
import { formatFechaHora } from '../data/storage'

// Resalta cualquier "@NombreCompleto" que coincida con un miembro conocido — solo estético.
function resaltarMenciones(texto, nombres) {
  if (!nombres.length) return texto
  const patron = new RegExp(`@(${nombres.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g')
  const partes = texto.split(patron)
  return partes.map((parte, i) =>
    nombres.includes(parte) ? <strong key={i} className="text-brand-700">{`@${parte}`}</strong> : parte
  )
}

export default function HiloComentarios({ comentarios = [], miembrosPorId = {}, onEnviar }) {
  const [texto, setTexto] = useState('')
  const [mencionados, setMencionados] = useState([])
  const [picker, setPicker] = useState(null) // { query, inicio }
  const [enviando, setEnviando] = useState(false)
  const textareaRef = useRef(null)

  const nombresConocidos = Object.values(miembrosPorId)
  const opcionesPicker = picker
    ? Object.entries(miembrosPorId).filter(([, nombre]) => nombre.toLowerCase().includes(picker.query.toLowerCase()))
    : []

  function handleChange(e) {
    const valor = e.target.value
    const cursor = e.target.selectionStart
    setTexto(valor)

    const antesDelCursor = valor.slice(0, cursor)
    const inicioArroba = antesDelCursor.lastIndexOf('@')
    if (inicioArroba === -1) { setPicker(null); return }
    const query = antesDelCursor.slice(inicioArroba + 1)
    if (/\s/.test(query)) { setPicker(null); return }
    setPicker({ query, inicio: inicioArroba })
  }

  function elegirMencion(id, nombre) {
    if (!picker) return
    const cursor = textareaRef.current?.selectionStart ?? texto.length
    const nuevoTexto = `${texto.slice(0, picker.inicio)}@${nombre} ${texto.slice(cursor)}`
    setTexto(nuevoTexto)
    setMencionados((prev) => (prev.includes(id) ? prev : [...prev, id]))
    setPicker(null)
    const posicionFinal = picker.inicio + nombre.length + 2
    requestAnimationFrame(() => textareaRef.current?.setSelectionRange(posicionFinal, posicionFinal))
    textareaRef.current?.focus()
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const limpio = texto.trim()
    if (!limpio || enviando) return
    setEnviando(true)
    try {
      // Si borraron la mención del texto después de insertarla, no se notifica a esa persona.
      const mencionesVigentes = mencionados.filter((id) => limpio.includes(`@${miembrosPorId[id]}`))
      await onEnviar(limpio, mencionesVigentes)
      setTexto('')
      setMencionados([])
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="border-t border-slate-100 pt-3 mt-3">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
        <MessageSquare size={12} /> Comentarios {comentarios.length > 0 && `(${comentarios.length})`}
      </div>

      {comentarios.length > 0 && (
        <div className="space-y-2.5 mb-3 max-h-64 overflow-y-auto">
          {comentarios.map((c) => (
            <div key={c.id} className="text-sm bg-slate-50 rounded-lg px-3 py-2">
              <div className="flex items-baseline gap-2">
                <span className="font-medium text-slate-700">{c.autor}</span>
                <span className="text-[11px] text-slate-400">{formatFechaHora(c.creadoEn)}</span>
              </div>
              <div className="text-slate-600 whitespace-pre-wrap mt-0.5">{resaltarMenciones(c.texto, nombresConocidos)}</div>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit} className="relative">
        <textarea
          ref={textareaRef}
          value={texto}
          onChange={handleChange}
          placeholder="Escribe un comentario… usa @ para mencionar a alguien"
          rows={2}
          className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent resize-none"
        />

        {picker && opcionesPicker.length > 0 && (
          <div className="absolute z-10 bottom-full mb-1 left-0 bg-white border border-slate-200 rounded-lg shadow-lg py-1 w-56 max-h-48 overflow-y-auto">
            {opcionesPicker.map(([id, nombre]) => (
              <button
                key={id}
                type="button"
                onClick={() => elegirMencion(id, nombre)}
                className="w-full text-left px-3 py-1.5 text-sm text-slate-700 hover:bg-brand-50 hover:text-brand-800"
              >
                {nombre}
              </button>
            ))}
          </div>
        )}

        <div className="flex justify-end mt-1.5">
          <button
            type="submit"
            disabled={!texto.trim() || enviando}
            className="flex items-center gap-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-900 disabled:opacity-40 text-white px-3 py-1.5 rounded-lg transition-colors"
          >
            <Send size={12} /> {enviando ? 'Enviando…' : 'Comentar'}
          </button>
        </div>
      </form>
    </div>
  )
}
