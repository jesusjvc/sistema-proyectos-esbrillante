import { useState } from 'react'
import { RefreshCw, X, CheckCircle2 } from 'lucide-react'
import { vincularFactura, desvincularFactura, sincronizarPagos, marcarPagadoDesdeInicio } from '../data/api'

const ETIQUETA_ESTADO = {
  pendiente: 'Pendiente',
  parcial: 'Pago parcial',
  pagada: 'Pagada',
  vencida: 'Vencida',
  cancelada: 'Cancelada',
  borrador: 'Borrador',
}

function nombreDestino(destino, fases) {
  if (destino === 'anticipo') return 'Anticipo'
  const n = Number(destino.split(':')[1])
  const fase = fases.find((f) => f.numero === n)
  return `Etapa ${n}${fase ? ` — ${fase.nombre}` : ''}`
}

// Foco no muestra montos: solo qué factura cubre qué y cuánto va pagado.
export default function PanelPagos({ proyecto, esAdmin, onCambio }) {
  const fases = proyecto.proyecto?.fases || []
  const pagos = proyecto.proyecto?.pagos || []
  const pagadoDesdeInicio = !!proyecto.proyecto?.pagadoDesdeInicio
  const [numero, setNumero] = useState('')
  const [destino, setDestino] = useState('anticipo')
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

  async function agregar(e) {
    e.preventDefault()
    if (!numero.trim()) return
    await ejecutar(async () => {
      await vincularFactura(proyecto.slug, numero.trim(), destino)
      setNumero('')
    })
  }

  return (
    <div className="space-y-3">
      {pagadoDesdeInicio && (
        <p className="flex items-center gap-1.5 text-sm text-brand-700 dark:text-brand-300">
          <CheckCircle2 size={14} /> Pagado desde el inicio
        </p>
      )}

      {pagos.length > 0 && (
        <ul className="divide-y divide-slate-100 dark:divide-ink-600">
          {pagos.map((pg) => (
            <li key={pg.facturaId} className="flex items-center gap-3 py-2 text-sm">
              <span className="font-medium text-slate-800 dark:text-ink-100">{pg.numero}</span>
              <span className="text-slate-500 dark:text-ink-300 truncate">{nombreDestino(pg.destino, fases)}</span>
              <span className={`ml-auto text-xs px-2 py-0.5 rounded-full shrink-0 ${pg.estado === 'pagada' ? 'bg-brand-100 text-brand-800 dark:bg-brand-500/15 dark:text-brand-300' : 'bg-slate-100 text-slate-600 dark:bg-ink-700 dark:text-ink-300'}`}>
                {ETIQUETA_ESTADO[pg.estado] || pg.estado}{pg.estado === 'parcial' ? ` · ${pg.porcentaje}%` : ''}
              </span>
              {esAdmin && (
                <button
                  onClick={() => ejecutar(() => desvincularFactura(proyecto.slug, pg.facturaId))}
                  disabled={ocupado}
                  title="Quitar factura"
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-ink-200 shrink-0"
                >
                  <X size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {!pagos.length && !pagadoDesdeInicio && (
        <p className="text-sm text-slate-400 dark:text-ink-400">
          Liga la factura de Perfex del anticipo (y de las etapas que requieren pago) y Foco confirmará cada pago solo.
        </p>
      )}

      {esAdmin && (
        <>
          <form onSubmit={agregar} className="flex flex-wrap items-center gap-2">
            <input
              value={numero}
              onChange={(e) => setNumero(e.target.value)}
              placeholder="Factura, ej. EB-002481"
              className="flex-1 min-w-[10rem] text-sm border border-slate-200 dark:border-ink-500 dark:bg-ink-900 rounded-lg px-3 py-1.5"
            />
            <select
              value={destino}
              onChange={(e) => setDestino(e.target.value)}
              className="text-sm border border-slate-200 dark:border-ink-500 dark:bg-ink-900 rounded-lg px-2 py-1.5"
            >
              <option value="anticipo">Anticipo</option>
              {fases.map((f) => <option key={f.numero} value={`fase:${f.numero}`}>Etapa {f.numero} — {f.nombre}</option>)}
            </select>
            <button
              type="submit"
              disabled={ocupado || !numero.trim()}
              className="text-sm bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-slate-900 font-medium px-3 py-1.5 rounded-lg"
            >
              Ligar factura
            </button>
          </form>

          <div className="flex flex-wrap items-center gap-3 text-xs">
            {pagos.length > 0 && (
              <button onClick={() => ejecutar(() => sincronizarPagos(proyecto.slug))} disabled={ocupado} className="flex items-center gap-1 text-slate-500 hover:text-slate-700 dark:text-ink-300">
                <RefreshCw size={12} className={ocupado ? 'animate-spin' : ''} /> Revisar ahora en Perfex
              </button>
            )}
            {!pagadoDesdeInicio && (
              <button onClick={() => ejecutar(() => marcarPagadoDesdeInicio(proyecto.slug))} disabled={ocupado} className="text-slate-500 hover:text-slate-700 dark:text-ink-300">
                Marcar como pagado desde el inicio
              </button>
            )}
          </div>
        </>
      )}

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}
