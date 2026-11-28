import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { generarBorradorPlan, aplicarBorradorPlan, descartarBorradorPlan } from '../data/api'

const CHIP = 'text-[11px] px-1.5 py-0.5 rounded font-medium'

function Lista({ titulo, elementos }) {
  if (!elementos?.length) return null
  return (
    <div>
      <p className="text-xs font-semibold text-slate-600 dark:text-ink-300 mb-1">{titulo}</p>
      <ul className="list-disc pl-5 space-y-0.5 text-sm text-slate-600 dark:text-ink-300">
        {elementos.map((e, i) => <li key={i}>{e}</li>)}
      </ul>
    </div>
  )
}

// Borrador del plan de trabajo que propone la IA desde el alcance contratado.
// Nada se crea hasta que un admin lo aplica.
export default function PanelPlanIA({ proyecto, onCambio }) {
  const alcance = proyecto.proyecto?.alcance
  const borrador = proyecto.proyecto?.borradorPlan
  const [excluidas, setExcluidas] = useState(() => new Set())
  const [ocupado, setOcupado] = useState('')
  const [error, setError] = useState('')

  async function ejecutar(cual, accion) {
    setOcupado(cual)
    setError('')
    try {
      await accion()
      setExcluidas(new Set())
      await onCambio()
    } catch (err) {
      setError(err.message)
    } finally {
      setOcupado('')
    }
  }

  function alternar(ref) {
    setExcluidas((prev) => {
      const siguiente = new Set(prev)
      if (siguiente.has(ref)) siguiente.delete(ref)
      else siguiente.add(ref)
      return siguiente
    })
  }

  if (!alcance) {
    return <p className="text-sm text-slate-400 dark:text-ink-400">Importa primero el alcance contratado para generar el plan.</p>
  }

  const mensajeError = error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>

  if (!borrador) {
    return (
      <div className="space-y-2">
        <button
          onClick={() => ejecutar('generar', () => generarBorradorPlan(proyecto.slug))}
          disabled={!!ocupado}
          className="flex items-center gap-1.5 text-sm bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-slate-900 font-medium px-3 py-1.5 rounded-lg"
        >
          {ocupado === 'generar' && <RefreshCw size={12} className="animate-spin" />}
          {ocupado === 'generar' ? 'Generando… puede tardar un minuto' : 'Generar borrador'}
        </button>
        {mensajeError}
      </div>
    )
  }

  const fases = proyecto.tipo === 'continuo'
    ? [{ numero: 1, nombre: '' }]
    : borrador.fases.filter((f) => borrador.tareas.some((t) => t.fase === f.numero))
  const aCrear = borrador.tareas.length - excluidas.size

  return (
    <div className="space-y-4">
      {fases.map((f) => (
        <div key={f.numero}>
          {f.nombre && <p className="text-xs font-semibold text-slate-600 dark:text-ink-300 mb-1">{f.numero}. {f.nombre}</p>}
          <ul className="space-y-1">
            {borrador.tareas.filter((t) => proyecto.tipo === 'continuo' || t.fase === f.numero).map((t) => {
              const fuera = excluidas.has(t.ref)
              return (
                <li key={t.ref} className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={!fuera}
                    onChange={() => alternar(t.ref)}
                    className="mt-1 accent-brand-500"
                    aria-label={`Incluir "${t.titulo}"`}
                  />
                  <div className={`flex-1 ${fuera ? 'opacity-50 line-through' : ''}`}>
                    <span className="text-slate-700 dark:text-ink-200">{t.titulo}</span>
                    <span className="inline-flex flex-wrap gap-1 ml-2 align-middle">
                      {t.esCliente
                        ? <span className={`${CHIP} bg-slate-100 text-slate-600 dark:bg-ink-700 dark:text-ink-300`}>Cliente</span>
                        : <span className={`${CHIP} bg-brand-100 text-brand-800 dark:bg-brand-500/15 dark:text-brand-300`}>Nosotros</span>}
                      {t.ejecutor === 'agente' && <span className={`${CHIP} bg-slate-800 text-white dark:bg-ink-600 dark:text-ink-100`}>Agente</span>}
                      <span className="text-[11px] text-slate-400 dark:text-ink-400">{t.duracionDias} {t.duracionDias === 1 ? 'día' : 'días'}</span>
                    </span>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      ))}

      <Lista titulo="Supuestos" elementos={borrador.supuestos} />
      <Lista titulo="Preguntas" elementos={borrador.preguntas} />

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => ejecutar('aplicar', () => aplicarBorradorPlan(proyecto.slug, [...excluidas]))}
          disabled={!!ocupado || aCrear === 0}
          className="flex items-center gap-1.5 text-sm bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-slate-900 font-medium px-3 py-1.5 rounded-lg"
        >
          {ocupado === 'aplicar' && <RefreshCw size={12} className="animate-spin" />}
          Crear {aCrear} {aCrear === 1 ? 'tarea' : 'tareas'}
        </button>
        <button
          onClick={() => ejecutar('descartar', () => descartarBorradorPlan(proyecto.slug))}
          disabled={!!ocupado}
          className="text-sm text-slate-500 hover:underline dark:text-ink-300 px-2 py-1.5"
        >
          Descartar
        </button>
      </div>
      {mensajeError}
    </div>
  )
}
