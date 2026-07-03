import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  getProyectoPorSlug, autenticarCliente, completarTarea,
  calcularAvance, getFaseActual, formatFecha,
} from '../../data/storage'
import { FASES_WEB } from '../../data/plantillas'
import { CheckCircle2, Clock, ChevronDown, ChevronUp, AlertCircle, Calendar, Users, Info, ExternalLink, FolderOpen } from 'lucide-react'

export default function VistaCliente() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [proyecto, setProyecto] = useState(null)
  const [autenticado, setAutenticado] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [seccionAbierta, setSeccionAbierta] = useState('equipo') // 'equipo' | 'participacion' | null

  useEffect(() => {
    const p = getProyectoPorSlug(id)
    if (!p) { navigate('/cliente'); return }
    setProyecto(p)
  }, [id])

  function handleLogin(e) {
    e.preventDefault()
    if (autenticarCliente(id, password)) {
      setAutenticado(true)
    } else {
      setError('Contraseña incorrecta')
    }
  }

  function handleCompletar(tareaId) {
    completarTarea(proyecto.id, tareaId, 'Cliente')
    setProyecto(getProyectoPorSlug(id))
  }

  if (!proyecto) return null

  // Pantalla de login
  if (!autenticado) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-violet-900 to-slate-900 flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-6">
            <div className="inline-flex w-12 h-12 bg-white/10 rounded-xl items-center justify-center mb-3">
              <span className="text-xl font-bold text-white">E</span>
            </div>
            <h1 className="text-xl font-bold text-white">{proyecto.cliente.nombreComercial}</h1>
            <p className="text-violet-300 text-sm mt-1">Seguimiento de tu proyecto</p>
          </div>
          <div className="bg-white rounded-2xl p-6 shadow-2xl">
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Contraseña de acceso</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError('') }}
                  placeholder="Tu contraseña..."
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-violet-400 placeholder:text-slate-400"
                  autoFocus
                />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button type="submit" className="w-full bg-violet-600 hover:bg-violet-700 text-white py-3 rounded-lg text-sm font-semibold transition-colors">
                Ver mi proyecto
              </button>
            </form>
          </div>
        </div>
      </div>
    )
  }

  // Datos calculados
  const avance = calcularAvance(proyecto)
  const faseActual = getFaseActual(proyecto)
  const fases = proyecto.proyecto.fases || FASES_WEB
  const faseActualNombre = fases.find((f) => f.numero === faseActual)?.nombre || ''
  const completadasIds = new Set(proyecto.tareas.filter((t) => t.estado === 'completada').map((t) => t.id))

  // Tareas del cliente desbloqueadas y pendientes
  const tareasPendientesCliente = proyecto.tareas.filter((t) => {
    if (t.estado === 'completada' || t.estado === 'omitida') return false
    if (!t.esCliente) return false
    return t.dependencias.every((d) => completadasIds.has(d))
  })

  // Actividades del equipo visibles para el cliente (fase actual)
  // Se muestran las internas (no cliente) de la fase actual y la anterior
  const tareasEquipoVisibles = proyecto.tareas.filter((t) => {
    if (t.esCliente || t.estado === 'omitida') return false
    return t.fase === faseActual || t.fase === faseActual - 1
  })

  // Clasificar actividades del equipo
  const equipoCompletadas = tareasEquipoVisibles.filter((t) => t.estado === 'completada')
  const equipoEnProceso = tareasEquipoVisibles.filter((t) => {
    if (t.estado === 'completada') return false
    return t.dependencias.every((d) => completadasIds.has(d))
  })
  const equipoPendientes = tareasEquipoVisibles.filter((t) => {
    if (t.estado === 'completada') return false
    return !t.dependencias.every((d) => completadasIds.has(d))
  })

  // Historial de participación del cliente
  const tareasPorFaseCliente = fases.map((f) => ({
    ...f,
    tareasCliente: proyecto.tareas.filter((t) => t.fase === f.numero && t.esCliente),
  })).filter((f) => f.tareasCliente.length > 0)

  const enPausa = proyecto.status === 'en_pausa'
  const completado = proyecto.status === 'completado'

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-4 py-4">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <div className="w-8 h-8 bg-violet-600 rounded-lg flex items-center justify-center text-white text-sm font-bold shrink-0">E</div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-slate-800 truncate">{proyecto.cliente.nombreComercial}</div>
            <div className="text-xs text-slate-400">Seguimiento de proyecto · EsBrillante</div>
          </div>
          {enPausa && (
            <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-full shrink-0">En pausa</span>
          )}
          {completado && (
            <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full shrink-0">Completado</span>
          )}
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-4">

        {/* ── Progreso general ── */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="font-semibold text-slate-800">{proyecto.proyecto.paquete}</div>
              <div className="text-sm text-slate-500 mt-0.5">
                {completado ? 'Proyecto entregado' : `Etapa ${faseActual} de ${fases.length} — ${faseActualNombre}`}
              </div>
            </div>
            <div className="text-3xl font-bold text-violet-600">{avance}%</div>
          </div>

          <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden mb-3">
            <div
              className="h-full bg-gradient-to-r from-violet-500 to-violet-600 rounded-full transition-all duration-700"
              style={{ width: `${avance}%` }}
            />
          </div>

          {/* Indicadores de fase */}
          <div className="flex gap-1 mb-3">
            {fases.map((f) => {
              const tareasF = proyecto.tareas.filter((t) => t.fase === f.numero && t.estado !== 'omitida')
              const compF = tareasF.filter((t) => t.estado === 'completada').length
              const totalF = tareasF.length
              const completa = totalF > 0 && compF === totalF
              const enCurso = f.numero === faseActual && !completado

              return (
                <div
                  key={f.numero}
                  title={`${f.nombre}`}
                  className={`flex-1 h-1.5 rounded-full transition-colors ${
                    completa ? 'bg-violet-500' : enCurso ? 'bg-violet-300' : 'bg-slate-100'
                  }`}
                />
              )
            })}
          </div>

          {/* Estado de pausa */}
          {enPausa && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 text-sm text-amber-700 flex items-start gap-2">
              <Clock size={15} className="shrink-0 mt-0.5" />
              <span>El proyecto está en espera de tu respuesta en una de las etapas activas. En cuanto respondas, el equipo continúa.</span>
            </div>
          )}
        </div>

        {/* ── Fecha estimada de entrega ── */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-violet-50 rounded-xl flex items-center justify-center shrink-0">
              <Calendar size={18} className="text-violet-600" />
            </div>
            <div className="flex-1">
              <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-0.5">Fecha estimada de entrega</div>
              <div className="text-xl font-bold text-slate-800">
                {proyecto.proyecto.fechaEstimadaEntrega
                  ? formatFecha(proyecto.proyecto.fechaEstimadaEntrega)
                  : 'Por definir'}
              </div>
              {completado && proyecto.tiempos.cierre && (
                <div className="text-sm text-emerald-600 font-medium mt-0.5">
                  ✓ Entregado el {formatFecha(proyecto.tiempos.cierre)}
                </div>
              )}
            </div>
          </div>

          <div className="mt-3 flex items-start gap-2 text-xs text-slate-400 bg-slate-50 rounded-lg px-3 py-2.5">
            <Info size={12} className="shrink-0 mt-0.5" />
            <span>
              Esta fecha es un estimado. Puede ajustarse si hay demoras en la revisión de contenidos,
              aprobaciones o en la activación de servicios de terceros como dominio, hosting o correos corporativos.
              Te avisaremos con anticipación si hay algún cambio.
            </span>
          </div>
        </div>

        {/* ── Recursos del proyecto ── */}
        <RecursosProyecto links={proyecto.linksCliente || {}} />

        {/* ── Tareas pendientes del cliente ── */}
        {tareasPendientesCliente.length > 0 && (
          <section>
            <h2 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
              <AlertCircle size={18} className="text-amber-500" />
              Necesitamos tu respuesta
              <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">{tareasPendientesCliente.length}</span>
            </h2>
            <div className="space-y-3">
              {tareasPendientesCliente.map((t) => (
                <TareaClienteCard key={t.id} tarea={t} onCompletar={() => handleCompletar(t.id)} />
              ))}
            </div>
          </section>
        )}

        {tareasPendientesCliente.length === 0 && !completado && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-sm text-emerald-700 flex items-center gap-2">
            <CheckCircle2 size={16} className="shrink-0" />
            No tienes nada pendiente por ahora. El equipo de EsBrillante está trabajando en tu proyecto.
          </div>
        )}

        {completado && (
          <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 text-sm text-violet-700 flex items-center gap-2">
            <CheckCircle2 size={16} className="shrink-0" />
            ¡Tu proyecto está completado! Si necesitas algún ajuste, contáctanos directamente.
          </div>
        )}

        {/* ── Qué está haciendo el equipo ── */}
        {tareasEquipoVisibles.length > 0 && !completado && (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <button
              onClick={() => setSeccionAbierta(seccionAbierta === 'equipo' ? null : 'equipo')}
              className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Users size={16} className="text-slate-500" />
                <span className="font-semibold text-slate-800 text-sm">¿Qué está haciendo el equipo?</span>
              </div>
              {seccionAbierta === 'equipo'
                ? <ChevronUp size={15} className="text-slate-400" />
                : <ChevronDown size={15} className="text-slate-400" />
              }
            </button>

            {seccionAbierta === 'equipo' && (
              <div className="border-t border-slate-100 divide-y divide-slate-50">
                {equipoEnProceso.length > 0 && (
                  <div className="px-5 py-3">
                    <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">En proceso ahora</div>
                    <div className="space-y-2">
                      {equipoEnProceso.map((t) => (
                        <ActividadEquipo key={t.id} tarea={t} estado="en_proceso" />
                      ))}
                    </div>
                  </div>
                )}

                {equipoPendientes.length > 0 && (
                  <div className="px-5 py-3">
                    <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Próximamente</div>
                    <div className="space-y-2">
                      {equipoPendientes.map((t) => (
                        <ActividadEquipo key={t.id} tarea={t} estado="pendiente" />
                      ))}
                    </div>
                  </div>
                )}

                {equipoCompletadas.length > 0 && (
                  <div className="px-5 py-3">
                    <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Completadas</div>
                    <div className="space-y-2">
                      {equipoCompletadas.map((t) => (
                        <ActividadEquipo key={t.id} tarea={t} estado="completada" />
                      ))}
                    </div>
                  </div>
                )}

                <div className="px-5 py-3 bg-slate-50">
                  <p className="text-xs text-slate-400">
                    El responsable de cada actividad aparece como <strong>Equipo EsBrillante</strong> para proteger la organización interna del equipo.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Tu historial de participación ── */}
        {tareasPorFaseCliente.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <button
              onClick={() => setSeccionAbierta(seccionAbierta === 'participacion' ? null : 'participacion')}
              className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <CheckCircle2 size={16} className="text-slate-500" />
                <span className="font-semibold text-slate-800 text-sm">Tu participación en el proyecto</span>
              </div>
              {seccionAbierta === 'participacion'
                ? <ChevronUp size={15} className="text-slate-400" />
                : <ChevronDown size={15} className="text-slate-400" />
              }
            </button>

            {seccionAbierta === 'participacion' && (
              <div className="border-t border-slate-100">
                {tareasPorFaseCliente.map((fase) => (
                  <div key={fase.numero} className="border-b border-slate-50 last:border-0">
                    <div className="px-5 py-2.5 bg-slate-50">
                      <span className="text-xs font-semibold text-slate-500">{fase.nombre}</span>
                    </div>
                    {fase.tareasCliente.map((t) => {
                      const desbloqueada = t.dependencias.every((d) => completadasIds.has(d))
                      const estado = t.estado === 'completada' ? 'completada'
                        : desbloqueada ? 'pendiente_tuya'
                        : 'por_venir'

                      return (
                        <div key={t.id} className="px-5 py-3 flex items-center gap-3">
                          {estado === 'completada' && <CheckCircle2 size={15} className="text-emerald-500 shrink-0" />}
                          {estado === 'pendiente_tuya' && <AlertCircle size={15} className="text-amber-400 shrink-0" />}
                          {estado === 'por_venir' && <Clock size={15} className="text-slate-200 shrink-0" />}
                          <span className={`text-sm ${
                            estado === 'completada' ? 'line-through text-slate-400'
                            : estado === 'pendiente_tuya' ? 'text-amber-700 font-medium'
                            : 'text-slate-400'
                          }`}>
                            {t.titulo}
                          </span>
                          {estado === 'completada' && <span className="ml-auto text-xs text-emerald-500">Listo ✓</span>}
                          {estado === 'pendiente_tuya' && <span className="ml-auto text-xs text-amber-500">Te toca</span>}
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Pie */}
        <div className="text-center text-xs text-slate-400 pb-6 space-y-1">
          <p>¿Tienes preguntas? Contáctanos directamente por WhatsApp.</p>
          <p className="font-semibold text-slate-500">Equipo EsBrillante</p>
        </div>
      </main>
    </div>
  )
}

const RECURSOS_CONFIG = [
  { tipo: 'drive', label: 'Carpeta de archivos', descripcion: 'Sube aquí tus fotos, logo y materiales' },
  { tipo: 'brief', label: 'Cuestionario del proyecto', descripcion: 'Llena este documento con la información de tu negocio' },
  { tipo: 'boceto', label: 'Propuesta de contenido', descripcion: 'Revisa y comenta los textos propuestos para tu sitio' },
  { tipo: 'diseno', label: 'Sitio para revisión', descripcion: 'Revisa el diseño de tu sitio y envíanos tus comentarios' },
]

function RecursosProyecto({ links }) {
  const disponibles = RECURSOS_CONFIG.filter((r) => links[r.tipo])
  if (disponibles.length === 0) return null

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
        <FolderOpen size={16} className="text-violet-500" />
        <span className="font-semibold text-slate-800 text-sm">Recursos de tu proyecto</span>
      </div>
      <div className="divide-y divide-slate-50">
        {disponibles.map((r) => (
          <div key={r.tipo} className="px-5 py-3.5 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-slate-800">{r.label}</div>
              <div className="text-xs text-slate-400 mt-0.5">{r.descripcion}</div>
            </div>
            <a
              href={links[r.tipo]}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs bg-violet-600 hover:bg-violet-700 text-white px-3 py-1.5 rounded-lg transition-colors shrink-0"
            >
              Abrir <ExternalLink size={11} />
            </a>
          </div>
        ))}
      </div>
    </div>
  )
}

function ActividadEquipo({ tarea: t, estado }) {
  const iconos = {
    completada: <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />,
    en_proceso: <div className="w-3.5 h-3.5 rounded-full border-2 border-violet-500 border-t-transparent animate-spin shrink-0" />,
    pendiente: <div className="w-3.5 h-3.5 rounded-full border-2 border-slate-200 shrink-0" />,
  }

  return (
    <div className="flex items-center gap-2.5">
      {iconos[estado]}
      <span className={`text-sm ${estado === 'completada' ? 'text-slate-400 line-through' : estado === 'en_proceso' ? 'text-slate-700 font-medium' : 'text-slate-400'}`}>
        {t.titulo}
      </span>
      <span className="ml-auto text-xs text-slate-300 shrink-0">Equipo EsBrillante</span>
    </div>
  )
}

function TareaClienteCard({ tarea: t, onCompletar }) {
  const [expandida, setExpandida] = useState(true)

  return (
    <div className="bg-white border-2 border-amber-200 rounded-xl overflow-hidden shadow-sm">
      <div className="bg-amber-50 px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <AlertCircle size={15} className="text-amber-500 shrink-0" />
          <span className="font-semibold text-amber-800 text-sm truncate">{t.titulo}</span>
        </div>
        <button onClick={() => setExpandida(!expandida)} className="text-amber-400 shrink-0 ml-2">
          {expandida ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </button>
      </div>

      {expandida && (
        <div className="px-5 py-4">
          <p className="text-sm text-slate-700 leading-relaxed mb-4">{t.instruccionesCliente}</p>

          {t.plazoHoras && (
            <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-4">
              <Clock size={12} />
              Tiempo sugerido para responder: {t.plazoHoras} horas
            </div>
          )}

          <button
            onClick={onCompletar}
            className="w-full bg-violet-600 hover:bg-violet-700 text-white py-2.5 rounded-lg text-sm font-semibold transition-colors"
          >
            ✓ Ya lo hice / Ya respondí
          </button>
          <p className="text-xs text-slate-400 text-center mt-2">
            Presiona cuando hayas enviado tu respuesta por WhatsApp o correo
          </p>
        </div>
      )}
    </div>
  )
}
