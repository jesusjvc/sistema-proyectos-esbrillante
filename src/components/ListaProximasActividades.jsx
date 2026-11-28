import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { infoResponsable } from '../lib/permisos'
import { normalizarTexto } from '../lib/texto'

const TERMINADAS = new Set(['completada', 'omitida'])

function ordenarPorEtapa(a, b) {
  return (a.fase ?? 0) - (b.fase ?? 0) || (a.orden ?? 0) - (b.orden ?? 0)
}

function Encabezado({ titulo, total }) {
  return (
    <div className="px-5 pt-4 pb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-ink-300">
      {titulo}
      <span className="text-slate-400 dark:text-ink-400 font-normal">{total}</span>
    </div>
  )
}

function MetaTarea({ tarea, equipo, miembrosPorId, esperaA }) {
  const responsable = tarea.esCliente ? null : infoResponsable(tarea, equipo, miembrosPorId)
  return (
    <div className="px-5 pt-2 -mb-1 flex items-center gap-2 flex-wrap text-[11px]">
      {tarea.esCliente ? (
        <span className="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 font-medium">Cliente</span>
      ) : (
        <span className="px-1.5 py-0.5 rounded bg-brand-100 dark:bg-brand-500/15 text-brand-800 dark:text-brand-300 font-medium">Nosotros</span>
      )}
      {!tarea.esCliente && tarea.ejecutor === 'agente' && (
        <span className="px-1.5 py-0.5 rounded bg-slate-800 text-white dark:bg-ink-600 dark:text-ink-100 font-medium">Agente</span>
      )}
      {responsable?.label && (
        <span className="text-slate-500 dark:text-ink-300">{responsable.nombre || responsable.label}</span>
      )}
      <span className="text-slate-400 dark:text-ink-400">Etapa {tarea.fase}</span>
      {esperaA?.length > 0 && (
        <span className="text-slate-400 dark:text-ink-400 truncate">· Espera a: {esperaA.join(', ')}</span>
      )}
    </div>
  )
}

// Vista "Próximas": una sola lista continua a través de todas las etapas.
// Las etapas siguen existiendo como agrupación interna, pero aquí solo se
// muestran como dato secundario para no darles peso visual.
export default function ListaProximasActividades({ tareas, estadoDe, renderTarea, equipo, miembrosPorId = {}, busqueda = '' }) {
  const [verEsperando, setVerEsperando] = useState(false)
  const [verCompletadas, setVerCompletadas] = useState(false)
  const porId = new Map(tareas.map((t) => [t.id, t]))

  const esperaA = (t) => (t.dependencias || [])
    .map((id) => porId.get(id))
    .filter((d) => d && !TERMINADAS.has(d.estado))
    .map((d) => d.titulo)

  const fila = (t, opciones = {}) => (
    <div key={t.id} className="border-b border-slate-50 dark:border-ink-500 last:border-0">
      <MetaTarea tarea={t} equipo={equipo} miembrosPorId={miembrosPorId} esperaA={opciones.conEspera ? esperaA(t) : null} />
      {renderTarea(t, opciones.resaltada)}
    </div>
  )

  const contenedor = 'bg-white dark:bg-ink-800 rounded-xl border border-slate-200 dark:border-ink-500 overflow-hidden'

  if (busqueda) {
    const coincidencias = tareas.filter((t) => normalizarTexto(t.titulo).includes(busqueda)).sort(ordenarPorEtapa)
    return (
      <div className={contenedor}>
        <Encabezado titulo="Resultados" total={coincidencias.length} />
        {coincidencias.length === 0
          ? <p className="px-5 pb-4 text-sm text-slate-400 dark:text-ink-400">Ninguna tarea coincide con la búsqueda.</p>
          : coincidencias.map((t) => fila(t, { resaltada: true }))}
      </div>
    )
  }

  const ordenadas = [...tareas].sort(ordenarPorEtapa)
  // 'revision' no tiene estado calculado propio (estadoDe lo trata como pendiente),
  // así que se mira el estado crudo para no esconder lo que ya está en revisión.
  const enCurso = ordenadas.filter((t) => t.estado === 'en_proceso' || t.estado === 'revision')
  const resto = ordenadas.filter((t) => !enCurso.includes(t) && !TERMINADAS.has(t.estado))
  // Las del cliente con dependencias resueltas salen como 'bloqueada_cliente':
  // ya le toca al cliente, así que cuentan como siguientes con su chip de lado.
  const siguen = resto.filter((t) => ['disponible', 'bloqueada_cliente'].includes(estadoDe(t)))
  const esperando = resto.filter((t) => estadoDe(t) === 'bloqueada_dependencia')
  const completadas = ordenadas.filter((t) => TERMINADAS.has(t.estado))

  return (
    <div className="space-y-3">
      <div className={contenedor}>
        {enCurso.length > 0 && (
          <>
            <Encabezado titulo="En curso" total={enCurso.length} />
            {enCurso.map((t) => fila(t))}
          </>
        )}
        <Encabezado titulo="Siguen" total={siguen.length} />
        {siguen.length === 0
          ? <p className="px-5 pb-4 text-sm text-slate-400 dark:text-ink-400">No hay actividades disponibles por ahora.</p>
          : siguen.map((t) => fila(t))}
      </div>

      {esperando.length > 0 && (
        <div className={contenedor}>
          <button
            onClick={() => setVerEsperando((v) => !v)}
            className="w-full flex items-center justify-between px-5 py-3 text-sm text-slate-500 dark:text-ink-300 hover:bg-slate-50 dark:hover:bg-ink-900 transition-colors"
          >
            <span>Esperando a otras tareas ({esperando.length})</span>
            {verEsperando ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>
          {verEsperando && <div className="border-t border-slate-100 dark:border-ink-500">{esperando.map((t) => fila(t, { conEspera: true }))}</div>}
        </div>
      )}

      {completadas.length > 0 && (
        <div className={contenedor}>
          <button
            onClick={() => setVerCompletadas((v) => !v)}
            className="w-full flex items-center justify-between px-5 py-3 text-sm text-slate-400 dark:text-ink-400 hover:bg-slate-50 dark:hover:bg-ink-900 transition-colors"
          >
            <span>Ver completadas ({completadas.length})</span>
            {verCompletadas ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>
          {verCompletadas && <div className="border-t border-slate-100 dark:border-ink-500">{completadas.map((t) => fila(t))}</div>}
        </div>
      )}
    </div>
  )
}
