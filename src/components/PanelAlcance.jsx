import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { importarAlcance, actualizarConceptoAlcance } from '../data/api'

const ETIQUETA_ESTADO = {
  incluido: 'Incluido',
  por_confirmar: 'Por confirmar',
  confirmado: 'Confirmado',
  descartado: 'Descartado',
}

// Lo que el cliente contrató según su propuesta de Perfex, sin precios.
export default function PanelAlcance({ proyecto, esAdmin, onCambio }) {
  const alcance = proyecto.proyecto?.alcance
  const [propuesta, setPropuesta] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')

  async function ejecutar(accion) {
    setOcupado(true)
    setError('')
    try {
      await accion()
      await onCambio()
    } catch (err) {
      setError(err.message)
    } finally {
      setOcupado(false)
    }
  }

  return (
    <div className="space-y-3">
      {alcance ? (
        <>
          <p className="text-sm font-medium text-slate-800 dark:text-ink-100">{alcance.titulo}</p>
          <ul className="space-y-2">
            {alcance.conceptos.map((c) => (
              <li key={c.id} className={`text-sm ${c.estado === 'descartado' ? 'opacity-50' : ''}`}>
                <div className="flex items-start gap-2">
                  <span className={`flex-1 text-slate-700 dark:text-ink-200 ${c.estado === 'descartado' ? 'line-through' : ''}`}>{c.descripcion}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${c.estado === 'por_confirmar' ? 'bg-brand-100 text-brand-800 dark:bg-brand-500/15 dark:text-brand-300' : 'bg-slate-100 text-slate-600 dark:bg-ink-700 dark:text-ink-300'}`}>
                    {ETIQUETA_ESTADO[c.estado]}
                  </span>
                </div>
                {c.detalle && <p className="text-xs text-slate-500 dark:text-ink-400 mt-0.5">{c.detalle}</p>}
                {esAdmin && c.opcional && (
                  <div className="flex gap-3 mt-1 text-xs">
                    {c.estado !== 'confirmado' && (
                      <button onClick={() => ejecutar(() => actualizarConceptoAlcance(proyecto.slug, c.id, 'confirmado'))} disabled={ocupado} className="text-brand-700 hover:underline dark:text-brand-300">
                        Sí lo contrató
                      </button>
                    )}
                    {c.estado !== 'descartado' && (
                      <button onClick={() => ejecutar(() => actualizarConceptoAlcance(proyecto.slug, c.id, 'descartado'))} disabled={ocupado} className="text-slate-500 hover:underline dark:text-ink-300">
                        No lo contrató
                      </button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="text-sm text-slate-400 dark:text-ink-400">
          Importa la propuesta de Perfex para tener a la vista lo que el cliente contrató (sin precios).
        </p>
      )}

      {esAdmin && (
        <form
          onSubmit={(e) => { e.preventDefault(); if (propuesta.trim()) ejecutar(async () => { await importarAlcance(proyecto.slug, propuesta.trim()); setPropuesta('') }) }}
          className="flex flex-wrap items-center gap-2"
        >
          <input
            value={propuesta}
            onChange={(e) => setPropuesta(e.target.value)}
            placeholder={alcance ? 'Reimportar: número, id o link de la propuesta' : 'Propuesta: PROEB-000467, 467 o su link'}
            className="flex-1 min-w-[12rem] text-sm border border-slate-200 dark:border-ink-500 dark:bg-ink-900 rounded-lg px-3 py-1.5"
          />
          <button type="submit" disabled={ocupado || !propuesta.trim()} className="flex items-center gap-1.5 text-sm bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-slate-900 font-medium px-3 py-1.5 rounded-lg">
            {ocupado && <RefreshCw size={12} className="animate-spin" />} {alcance ? 'Reimportar' : 'Importar'}
          </button>
        </form>
      )}

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}
