import { useState } from 'react'
import { RefreshCw, Send } from 'lucide-react'
import { generarBorradorPlan, ajustarBorradorPlan, aplicarBorradorPlan, descartarBorradorPlan } from '../data/api'

const CHIP = 'text-[11px] px-1.5 py-0.5 rounded font-medium'
const CAMPO = 'w-full text-sm rounded-lg border border-slate-200 bg-white text-slate-800 placeholder:text-slate-400 px-3 py-2 dark:border-ink-500 dark:bg-ink-900 dark:text-ink-100 dark:placeholder:text-ink-400 focus:outline-none focus:border-brand-500'

function RevisionSitio({ revision }) {
  if (!revision?.url) return null
  if (revision.estado === 'bloqueado') {
    return (
      <p className="text-xs text-slate-500 dark:text-ink-300">
        No se pudo revisar <span className="font-medium text-slate-700 dark:text-ink-100">{revision.url}</span>
        {revision.motivo ? ` (${revision.motivo})` : ''} — se agregó una tarea para que un agente local lo revise.
      </p>
    )
  }
  return (
    <p className="text-xs text-slate-500 dark:text-ink-300">
      Sitio revisado: <span className="font-medium text-slate-700 dark:text-ink-100">{revision.url}</span>
      {revision.resumenCorto ? ` — ${revision.resumenCorto}` : ''}
    </p>
  )
}

function Conversacion({ turnos }) {
  if (!turnos?.length) return null
  return (
    <div className="space-y-1.5">
      {turnos.map((t, i) => (
        <div key={i} className={`flex ${t.rol === 'ia' ? 'justify-start' : 'justify-end'}`}>
          <p className={`max-w-[85%] whitespace-pre-wrap text-sm rounded-lg px-3 py-1.5 ${t.rol === 'ia'
            ? 'bg-slate-100 text-slate-700 dark:bg-ink-700 dark:text-ink-100'
            : 'bg-brand-50 text-slate-800 dark:bg-brand-500/15 dark:text-ink-100'}`}
          >
            {t.texto}
          </p>
        </div>
      ))}
    </div>
  )
}

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
  const [notas, setNotas] = useState('')
  const [mensaje, setMensaje] = useState('')

  async function ejecutar(cual, accion) {
    setOcupado(cual)
    setError('')
    try {
      await accion()
      setExcluidas(new Set())
      await onCambio()
      return true
    } catch (err) {
      setError(err.message)
      return false
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
    return <p className="text-sm text-slate-500 dark:text-ink-300">Importa primero el alcance contratado para generar el plan.</p>
  }

  const mensajeError = error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>

  if (!borrador) {
    return (
      <div className="space-y-2">
        <textarea
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          rows={3}
          maxLength={2000}
          disabled={!!ocupado}
          className={CAMPO}
          placeholder="Notas para la IA (opcional): lo que debe saber antes de armar el plan — ej. el cliente ya tiene el contenido, no incluyas redes…"
          aria-label="Notas para la IA"
        />
        <button
          onClick={async () => { if (await ejecutar('generar', () => generarBorradorPlan(proyecto.slug, notas.trim() || undefined))) setNotas('') }}
          disabled={!!ocupado}
          className="flex items-center gap-1.5 text-sm bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-slate-900 font-medium px-3 py-1.5 rounded-lg"
        >
          {ocupado === 'generar' && <RefreshCw size={12} className="animate-spin" />}
          {ocupado === 'generar' ? 'Generando… puede tardar un par de minutos' : 'Generar borrador'}
        </button>
        {mensajeError}
      </div>
    )
  }

  const fases = proyecto.tipo === 'continuo'
    ? [{ numero: 1, nombre: '' }]
    : borrador.fases.filter((f) => borrador.tareas.some((t) => t.fase === f.numero))
  const aCrear = borrador.tareas.length - excluidas.size

  async function pedirAjuste(e) {
    e.preventDefault()
    const texto = mensaje.trim()
    if (!texto || ocupado) return
    if (await ejecutar('ajustar', () => ajustarBorradorPlan(proyecto.slug, texto))) setMensaje('')
  }

  return (
    <div className="space-y-4">
      <RevisionSitio revision={borrador.revisionSitio} />
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
                    <span className="text-slate-700 dark:text-ink-100">{t.titulo}</span>
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

      <div className="space-y-2">
        <Conversacion turnos={borrador.conversacion} />
        <form onSubmit={pedirAjuste} className="flex items-center gap-2">
          <input
            value={mensaje}
            onChange={(e) => setMensaje(e.target.value)}
            maxLength={2000}
            disabled={!!ocupado}
            className={CAMPO}
            placeholder="Pide un ajuste: quita…, agrega…, cambia…"
            aria-label="Pedir un ajuste al plan"
          />
          <button
            type="submit"
            disabled={!!ocupado || !mensaje.trim()}
            className="shrink-0 flex items-center gap-1.5 text-sm bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-slate-900 font-medium px-3 py-2 rounded-lg"
            aria-label="Enviar ajuste"
          >
            {ocupado === 'ajustar' ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
          </button>
        </form>
        {ocupado === 'ajustar' && <p className="text-xs text-slate-500 dark:text-ink-300">Ajustando el plan… puede tardar hasta 2 minutos.</p>}
      </div>

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
