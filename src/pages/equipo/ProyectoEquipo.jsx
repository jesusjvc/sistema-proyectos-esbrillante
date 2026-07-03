import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Layout from '../../components/Layout'
import { getProyectoPorSlug, completarTarea, calcularAvance, getFaseActual, getSession, formatFechaHora } from '../../data/storage'
import { FASES_WEB } from '../../data/plantillas'
import {
  CheckCircle2, Circle, Lock, AlertCircle, XCircle,
  ChevronDown, ChevronUp, ClipboardList, Copy, Check,
} from 'lucide-react'

export default function ProyectoEquipo() {
  const { id } = useParams()
  const navigate = useNavigate()
  const session = getSession()
  const [proyecto, setProyecto] = useState(() => getProyectoPorSlug(id))
  const [faseAbierta, setFaseAbierta] = useState(null)
  const [tareaExpandida, setTareaExpandida] = useState(null)
  const [copiado, setCopiado] = useState(null)

  if (!proyecto) { navigate('/equipo'); return null }

  const fases = proyecto.proyecto?.fases || FASES_WEB
  const faseActual = getFaseActual(proyecto)
  const avance = calcularAvance(proyecto)
  const completadasIds = new Set(proyecto.tareas.filter((t) => t.estado === 'completada').map((t) => t.id))

  function refresh() { setProyecto(getProyectoPorSlug(id)) }

  function marcarCompleta(tareaId) {
    completarTarea(proyecto.id, tareaId, session.nombre)
    setTareaExpandida(null)
    refresh()
  }

  function toggleExpandida(tareaId) {
    setTareaExpandida((prev) => (prev === tareaId ? null : tareaId))
  }

  function copiarPlantilla(texto, tareaId) {
    navigator.clipboard.writeText(texto).catch(() => {
      const el = document.createElement('textarea')
      el.value = texto
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
    })
    setCopiado(tareaId)
    setTimeout(() => setCopiado(null), 2000)
  }

  function estadoCalculado(t) {
    if (t.estado === 'completada') return 'completada'
    if (t.estado === 'omitida') return 'omitida'
    const deps = t.dependencias.every((d) => completadasIds.has(d))
    if (!deps) return 'bloqueada_dependencia'
    if (t.esCliente) return 'bloqueada_cliente'
    return 'disponible'
  }

  const tareasPorFase = fases.map((f) => ({
    ...f,
    tareas: proyecto.tareas.filter((t) => t.fase === f.numero),
  }))

  const tieneDetalle = (t) => t.queHacer || t.necesitasAntes || t.plantillaMensaje || t.queEntregas

  return (
    <Layout titulo={proyecto.cliente.nombreComercial} volver="/equipo">
      {/* Progreso */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 mb-5">
        <div className="flex items-center justify-between text-sm mb-2">
          <span className="font-medium text-slate-700">
            Fase {faseActual} — {fases.find((f) => f.numero === faseActual)?.nombre}
          </span>
          <span className="font-bold text-slate-800">{avance}%</span>
        </div>
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full bg-violet-500 rounded-full transition-all" style={{ width: `${avance}%` }} />
        </div>
        <div className="text-xs text-slate-400 mt-2">{proyecto.proyecto.paquete}</div>
      </div>

      {/* Tareas por fase */}
      <div className="space-y-3">
        {tareasPorFase.map((fase) => {
          if (fase.tareas.length === 0) return null
          const completadas = fase.tareas.filter((t) => t.estado === 'completada' || t.estado === 'omitida').length
          const total = fase.tareas.length
          const abierta = faseAbierta === fase.numero || fase.numero === faseActual

          return (
            <div key={fase.numero} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <button
                onClick={() => setFaseAbierta(abierta ? null : fase.numero)}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50"
              >
                <div className="flex items-center gap-3">
                  <span className="font-medium text-slate-800 text-sm">Fase {fase.numero} — {fase.nombre}</span>
                  <span className="text-xs text-slate-400">{completadas}/{total}</span>
                </div>
                {abierta ? <ChevronUp size={15} className="text-slate-400" /> : <ChevronDown size={15} className="text-slate-400" />}
              </button>

              {abierta && (
                <div className="border-t border-slate-100">
                  {fase.tareas.map((t) => {
                    const est = estadoCalculado(t)
                    const puedoCompletar = est === 'disponible' && !t.soloAdmin && (!t.soloKarlaOAdmin || session.esKarla)
                    const expandida = tareaExpandida === t.id
                    const hayDetalle = tieneDetalle(t)

                    return (
                      <div key={t.id} className={`border-b border-slate-50 last:border-0 ${
                        est === 'completada' ? 'bg-emerald-50' : est === 'bloqueada_cliente' ? 'bg-amber-50' : ''
                      }`}>
                        {/* Fila principal */}
                        <div className="px-5 py-3.5 flex items-start gap-3">
                          <div className="mt-0.5 shrink-0">
                            {est === 'completada' && <CheckCircle2 size={16} className="text-emerald-500" />}
                            {est === 'disponible' && <Circle size={16} className="text-slate-300" />}
                            {est === 'bloqueada_dependencia' && <Lock size={16} className="text-slate-200" />}
                            {est === 'bloqueada_cliente' && <AlertCircle size={16} className="text-amber-400" />}
                            {est === 'omitida' && <XCircle size={16} className="text-slate-200" />}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`text-sm ${est === 'completada' ? 'line-through text-slate-400' : est === 'omitida' ? 'text-slate-400' : 'text-slate-800'}`}>
                                {t.titulo}
                              </span>
                              {t.esCliente && (
                                <span className="text-xs text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded">Cliente</span>
                              )}
                              {t.esRutaCritica && (
                                <span className="text-xs text-violet-600 bg-violet-100 px-1.5 py-0.5 rounded">Ruta crítica</span>
                              )}
                            </div>

                            {est === 'completada' && t.completadaPor && (
                              <div className="text-xs text-slate-400 mt-0.5">{t.completadaPor} · {formatFechaHora(t.completadaEn)}</div>
                            )}
                            {est === 'bloqueada_cliente' && (
                              <div className="text-xs text-amber-600 mt-0.5">Esperando respuesta del cliente</div>
                            )}
                            {est === 'bloqueada_dependencia' && (
                              <div className="text-xs text-slate-400 mt-0.5">Bloqueada — esperando tareas anteriores</div>
                            )}
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {hayDetalle && est !== 'omitida' && (
                              <button
                                onClick={() => toggleExpandida(t.id)}
                                className="text-xs text-slate-400 hover:text-violet-600 transition-colors flex items-center gap-1"
                                title="Ver instrucciones"
                              >
                                <ClipboardList size={14} />
                                {expandida ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                              </button>
                            )}
                            {puedoCompletar && !expandida && (
                              <button
                                onClick={() => marcarCompleta(t.id)}
                                className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg transition-colors"
                              >
                                Listo
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Panel de detalle expandido */}
                        {expandida && hayDetalle && (
                          <div className="mx-5 mb-4 rounded-xl border border-violet-100 bg-violet-50 overflow-hidden">
                            {t.queHacer && (
                              <DetalleSeccion titulo="¿Qué hay que hacer?">
                                <TextoFormateado texto={t.queHacer} />
                              </DetalleSeccion>
                            )}

                            {t.necesitasAntes && (
                              <DetalleSeccion titulo="Antes de empezar">
                                <TextoFormateado texto={t.necesitasAntes} />
                              </DetalleSeccion>
                            )}

                            {t.plantillaMensaje && (
                              <DetalleSeccion titulo="Plantilla de mensaje">
                                <div className="relative">
                                  <pre className="text-xs text-slate-700 whitespace-pre-wrap font-sans bg-white border border-slate-200 rounded-lg p-3 pr-10">{t.plantillaMensaje}</pre>
                                  <button
                                    onClick={() => copiarPlantilla(t.plantillaMensaje, t.id)}
                                    className="absolute top-2 right-2 p-1.5 rounded-md bg-slate-100 hover:bg-violet-100 text-slate-500 hover:text-violet-600 transition-colors"
                                    title="Copiar plantilla"
                                  >
                                    {copiado === t.id ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
                                  </button>
                                </div>
                              </DetalleSeccion>
                            )}

                            {t.queEntregas && (
                              <DetalleSeccion titulo="Al completar esta tarea entrego">
                                <TextoFormateado texto={t.queEntregas} />
                              </DetalleSeccion>
                            )}

                            {puedoCompletar && (
                              <div className="px-4 pb-4">
                                <button
                                  onClick={() => marcarCompleta(t.id)}
                                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
                                >
                                  Marcar como completada
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </Layout>
  )
}

function DetalleSeccion({ titulo, children }) {
  return (
    <div className="px-4 pt-3 pb-1">
      <div className="text-xs font-semibold text-violet-700 uppercase tracking-wide mb-1.5">{titulo}</div>
      {children}
    </div>
  )
}

function TextoFormateado({ texto }) {
  return (
    <div className="text-xs text-slate-700 space-y-0.5">
      {texto.split('\n').map((linea, i) => (
        <div key={i} className={linea === '' ? 'h-1' : ''}>
          {linea}
        </div>
      ))}
    </div>
  )
}
