import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getProyectoCliente, loginCliente, completarTareaCliente } from '../../data/api'
import { calcularAvance, getFaseActual, formatFecha } from '../../data/storage'
import { FASES_WEB } from '../../data/plantillas'
import { useEventosProyecto } from '../../hooks/useEventos'
import { CheckCircle2, Clock, ChevronDown, ChevronUp, AlertCircle, Calendar, Users, Info, ExternalLink, FolderOpen, Lock, Paperclip, X } from 'lucide-react'
import logo from '../../assets/logo-esbrillante.svg'

export default function VistaCliente() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [proyecto, setProyecto] = useState(null)
  const [estado, setEstado] = useState('cargando') // 'cargando' | 'login' | 'ok' | 'error'
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [loginCargando, setLoginCargando] = useState(false)
  const [seccionAbierta, setSeccionAbierta] = useState('equipo')

  async function cargar() {
    try {
      const p = await getProyectoCliente(id)
      setProyecto(p)
      setEstado('ok')
    } catch (err) {
      if (err.status === 401 || err.status === 403) setEstado('login')
      else navigate('/cliente')
    }
  }

  useEffect(() => { cargar() }, [id])
  useEventosProyecto(id, estado === 'ok', cargar)

  async function handleLogin(e) {
    e.preventDefault()
    setLoginError('')
    setLoginCargando(true)
    try {
      await loginCliente(id, password)
      await cargar()
    } catch {
      setLoginError('Contraseña incorrecta')
    } finally {
      setLoginCargando(false)
    }
  }

  async function handleCompletar(tareaId, respuesta) {
    await completarTareaCliente(id, tareaId, respuesta)
    cargar()
  }

  if (estado === 'cargando') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (estado === 'login') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 to-slate-800 flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-6">
            <img src={logo} alt="EsBrillante" className="h-8 w-auto mx-auto mb-3" />
            <p className="text-brand-300 text-sm mt-1">Seguimiento de tu proyecto</p>
          </div>
          <div className="bg-white rounded-2xl p-6 shadow-2xl">
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Contraseña de acceso</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setLoginError('') }}
                  placeholder="Tu contraseña..."
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-400 placeholder:text-slate-400"
                  autoFocus
                />
              </div>
              {loginError && <p className="text-sm text-red-600">{loginError}</p>}
              <button
                type="submit"
                disabled={loginCargando}
                className="w-full bg-brand-500 hover:bg-brand-600 disabled:opacity-60 text-slate-900 py-3 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2"
              >
                {loginCargando && <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
                Ver mi proyecto
              </button>
            </form>
          </div>
        </div>
      </div>
    )
  }

  if (!proyecto) return null

  const avance = calcularAvance(proyecto)
  const faseActual = getFaseActual(proyecto)
  const fases = proyecto.proyecto.fases || FASES_WEB
  const faseActualNombre = fases.find((f) => f.numero === faseActual)?.nombre || ''
  const tieneFechasPorFase = fases.some((f) => f.fechaEstimada)
  const completadasIds = new Set(proyecto.tareas.filter((t) => t.estado === 'completada').map((t) => t.id))

  const tareasPendientesCliente = proyecto.tareas.filter((t) => {
    if (t.estado === 'completada' || t.estado === 'omitida') return false
    if (!t.esCliente) return false
    return t.dependencias.every((d) => completadasIds.has(d))
  }).sort((a, b) => a.orden - b.orden)

  const tareasEquipoVisibles = proyecto.tareas.filter((t) => {
    if (t.esCliente || t.estado === 'omitida') return false
    return t.fase === faseActual || t.fase === faseActual - 1
  }).sort((a, b) => a.orden - b.orden)

  const equipoCompletadas = tareasEquipoVisibles.filter((t) => t.estado === 'completada')
  const equipoEnProceso = tareasEquipoVisibles.filter((t) => t.estado === 'en_proceso')
  const equipoPendientes = tareasEquipoVisibles.filter((t) => t.estado === 'pendiente')

  const tareasPorFaseCliente = fases.map((f) => ({
    ...f,
    tareasCliente: proyecto.tareas.filter((t) => t.fase === f.numero && t.esCliente).sort((a, b) => a.orden - b.orden),
  })).filter((f) => f.tareasCliente.length > 0)

  const enPausa = proyecto.status === 'en_pausa'
  const completado = proyecto.status === 'completado'

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-4 py-4">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <div className="h-10 px-2.5 bg-slate-950 rounded-lg flex items-center justify-center shrink-0">
            <img src={logo} alt="EsBrillante" className="h-6 w-auto" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-slate-800 text-lg truncate">{proyecto.cliente.nombreComercial}</div>
            <div className="text-sm text-slate-500">Seguimiento de proyecto · EsBrillante</div>
          </div>
          {enPausa && <span className="text-sm bg-amber-100 text-amber-700 px-2 py-1 rounded-full shrink-0">En pausa</span>}
          {completado && <span className="text-sm bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full shrink-0">Completado</span>}
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="font-semibold text-slate-800 text-base">{proyecto.proyecto.paquete}</div>
              <div className="text-base text-slate-500 mt-0.5">
                {completado ? 'Proyecto entregado' : `Etapa ${faseActual} de ${fases.length} — ${faseActualNombre}`}
              </div>
            </div>
            <div className="text-3xl font-bold text-brand-600">{avance}%</div>
          </div>
          <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden mb-3">
            <div className="h-full bg-gradient-to-r from-brand-400 to-brand-500 rounded-full transition-all duration-700" style={{ width: `${avance}%` }} />
          </div>
          <div className="flex gap-1 mb-3">
            {fases.map((f) => {
              const tareasF = proyecto.tareas.filter((t) => t.fase === f.numero && t.estado !== 'omitida')
              const completa = tareasF.length > 0 && tareasF.filter((t) => t.estado === 'completada').length === tareasF.length
              const enCurso = f.numero === faseActual && !completado
              return <div key={f.numero} title={f.nombre} className={`flex-1 h-1.5 rounded-full transition-colors ${completa ? 'bg-brand-500' : enCurso ? 'bg-brand-300' : 'bg-slate-100'}`} />
            })}
          </div>
          {enPausa && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 text-base text-amber-700 flex items-start gap-2 mb-3">
              <Clock size={15} className="shrink-0 mt-0.5" />
              <span>El proyecto está en espera de tu respuesta. En cuanto respondas, el equipo continúa.</span>
            </div>
          )}
          <div className="flex items-start gap-2 text-sm text-slate-400 bg-slate-50 rounded-lg px-3 py-2.5">
            <Info size={13} className="shrink-0 mt-0.5" />
            <span>El % es un estimado y puede ajustarse — si surgen nuevas actividades durante el proyecto, es normal que baje un poco antes de volver a subir. No significa que se haya retrocedido.</span>
          </div>
        </div>

        {tieneFechasPorFase ? (
          <FasesConFechas fases={fases} faseActual={faseActual} completado={completado} fechaCierre={proyecto.tiempos.cierre} />
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-brand-50 rounded-xl flex items-center justify-center shrink-0">
                <Calendar size={18} className="text-brand-600" />
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium text-slate-500 uppercase tracking-wide mb-0.5">Fecha estimada de entrega</div>
                <div className="text-xl font-bold text-slate-800">{proyecto.proyecto.fechaEstimadaEntrega ? formatFecha(proyecto.proyecto.fechaEstimadaEntrega) : 'Por definir'}</div>
                {completado && proyecto.tiempos.cierre && <div className="text-base text-emerald-600 font-medium mt-0.5">✓ Entregado el {formatFecha(proyecto.tiempos.cierre)}</div>}
              </div>
            </div>
            <div className="mt-3 flex items-start gap-2 text-sm text-slate-400 bg-slate-50 rounded-lg px-3 py-2.5">
              <Info size={13} className="shrink-0 mt-0.5" />
              <span>Esta fecha es un estimado. Te avisaremos con anticipación si hay algún cambio.</span>
            </div>
          </div>
        )}

        <RecursosProyecto links={proyecto.linksCliente || {}} />

        {tareasPendientesCliente.length > 0 && (
          <section>
            <h2 className="font-semibold text-slate-800 text-base mb-3 flex items-center gap-2">
              <AlertCircle size={18} className="text-amber-500" />
              Necesitamos tu respuesta
              <span className="text-sm bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">{tareasPendientesCliente.length}</span>
            </h2>
            <div className="space-y-3">
              {tareasPendientesCliente.map((t) => (
                <TareaClienteCard key={t.id} tarea={t} onCompletar={(respuesta) => handleCompletar(t.id, respuesta)} />
              ))}
            </div>
          </section>
        )}

        {tareasPendientesCliente.length === 0 && !completado && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-base text-emerald-700 flex items-center gap-2">
            <CheckCircle2 size={16} className="shrink-0" />
            No tienes nada pendiente por ahora. El equipo está trabajando en tu proyecto.
          </div>
        )}

        {completado && (
          <div className="bg-brand-50 border border-brand-200 rounded-xl p-4 text-base text-brand-800 flex items-center gap-2">
            <CheckCircle2 size={16} className="shrink-0" />
            ¡Tu proyecto está completado! Si necesitas algún ajuste, contáctanos directamente.
          </div>
        )}

        {tareasEquipoVisibles.length > 0 && !completado && (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <button onClick={() => setSeccionAbierta(seccionAbierta === 'equipo' ? null : 'equipo')} className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors">
              <div className="flex items-center gap-2">
                <Users size={16} className="text-slate-500" />
                <span className="font-semibold text-slate-800 text-base">¿Qué está haciendo el equipo?</span>
              </div>
              {seccionAbierta === 'equipo' ? <ChevronUp size={15} className="text-slate-400" /> : <ChevronDown size={15} className="text-slate-400" />}
            </button>
            {seccionAbierta === 'equipo' && (
              <div className="border-t border-slate-100 divide-y divide-slate-50">
                {equipoEnProceso.length > 0 && <GrupoActividad titulo="En proceso ahora" tareas={equipoEnProceso} estado="en_proceso" />}
                {equipoPendientes.length > 0 && <GrupoActividad titulo="Próximamente" tareas={equipoPendientes} estado="pendiente" />}
                {equipoCompletadas.length > 0 && <GrupoActividad titulo="Completadas" tareas={equipoCompletadas} estado="completada" />}
                <div className="px-5 py-3 bg-slate-50">
                  <p className="text-sm text-slate-500">El responsable aparece como <strong>Equipo EsBrillante</strong> para proteger la organización interna.</p>
                </div>
              </div>
            )}
          </div>
        )}

        {tareasPorFaseCliente.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <button onClick={() => setSeccionAbierta(seccionAbierta === 'participacion' ? null : 'participacion')} className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={16} className="text-slate-500" />
                <span className="font-semibold text-slate-800 text-base">Tu participación en el proyecto</span>
              </div>
              {seccionAbierta === 'participacion' ? <ChevronUp size={15} className="text-slate-400" /> : <ChevronDown size={15} className="text-slate-400" />}
            </button>
            {seccionAbierta === 'participacion' && (
              <div className="border-t border-slate-100">
                {tareasPorFaseCliente.map((fase) => (
                  <div key={fase.numero} className="border-b border-slate-50 last:border-0">
                    <div className="px-5 py-2.5 bg-slate-50"><span className="text-sm font-semibold text-slate-600">{fase.nombre}</span></div>
                    {fase.tareasCliente.map((t) => {
                      const desbloqueada = t.dependencias.every((d) => completadasIds.has(d))
                      const est = t.estado === 'completada' ? 'completada' : desbloqueada ? 'pendiente_tuya' : 'por_venir'
                      return (
                        <div key={t.id} className="px-5 py-3 flex items-center gap-3">
                          {est === 'completada' && <CheckCircle2 size={15} className="text-emerald-500 shrink-0" />}
                          {est === 'pendiente_tuya' && <AlertCircle size={15} className="text-amber-400 shrink-0" />}
                          {est === 'por_venir' && <Clock size={15} className="text-slate-300 shrink-0" />}
                          <span className={`text-base ${est === 'completada' ? 'line-through text-slate-500' : est === 'pendiente_tuya' ? 'text-amber-700 font-medium' : 'text-slate-500'}`}>{t.titulo}</span>
                          {est === 'completada' && <span className="ml-auto text-sm text-emerald-500">Listo ✓</span>}
                          {est === 'pendiente_tuya' && <span className="ml-auto text-sm text-amber-500">Te toca</span>}
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="text-center text-sm text-slate-400 pb-6 space-y-1">
          <p>¿Tienes preguntas? Contáctanos directamente por WhatsApp.</p>
          <p className="font-semibold text-slate-500">Equipo EsBrillante</p>
        </div>
      </main>
    </div>
  )
}

function FasesConFechas({ fases, faseActual, completado, fechaCierre }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="text-sm font-medium text-slate-500 uppercase tracking-wide mb-3">Fechas estimadas por fase</div>
      <div className="space-y-3">
        {fases.map((f) => {
          const bloqueadaPorPago = !!f.requierePago && !f.pagoConfirmado
          const esActual = f.numero === faseActual && !completado
          const yaPaso = f.numero < faseActual || completado
          return (
            <div key={f.numero} className="flex items-start gap-3">
              <div className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${yaPaso ? 'bg-emerald-500' : esActual ? 'bg-brand-500' : 'bg-slate-200'}`} />
              <div className="flex-1 min-w-0">
                <div className={`text-base font-medium ${esActual ? 'text-slate-800' : yaPaso ? 'text-slate-600' : 'text-slate-500'}`}>{f.nombre}</div>
                {f.fechaEstimada && <div className="text-sm text-slate-400 mt-0.5">Estimado: {formatFecha(f.fechaEstimada)}</div>}
              </div>
              {bloqueadaPorPago && (
                <span className="flex items-center gap-1 text-sm bg-amber-100 text-amber-700 px-2 py-1 rounded-full shrink-0">
                  <Lock size={10} /> Esperando confirmación de pago
                </span>
              )}
            </div>
          )
        })}
      </div>
      {completado && fechaCierre && (
        <div className="mt-3 text-base text-emerald-600 font-medium">✓ Entregado el {formatFecha(fechaCierre)}</div>
      )}
      <div className="mt-3 flex items-start gap-2 text-sm text-slate-400 bg-slate-50 rounded-lg px-3 py-2.5">
        <Info size={13} className="shrink-0 mt-0.5" />
        <span>Estas fechas son un estimado y pueden ajustarse. Te avisaremos si hay algún cambio.</span>
      </div>
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
        <FolderOpen size={16} className="text-brand-600" />
        <span className="font-semibold text-slate-800 text-base">Recursos de tu proyecto</span>
      </div>
      <div className="divide-y divide-slate-50">
        {disponibles.map((r) => (
          <div key={r.tipo} className="px-5 py-3.5 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-base font-medium text-slate-800">{r.label}</div>
              <div className="text-sm text-slate-500 mt-0.5">{r.descripcion}</div>
            </div>
            <a href={links[r.tipo]} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-sm bg-brand-500 hover:bg-brand-600 text-slate-900 px-3 py-1.5 rounded-lg transition-colors shrink-0">
              Abrir <ExternalLink size={11} />
            </a>
          </div>
        ))}
      </div>
    </div>
  )
}

function GrupoActividad({ titulo, tareas, estado }) {
  return (
    <div className="px-5 py-3">
      <div className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-2">{titulo}</div>
      <div className="space-y-2">
        {tareas.map((t) => (
          <div key={t.id} className="flex items-center gap-2.5">
            {estado === 'completada' && <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />}
            {estado === 'en_proceso' && <div className="w-3.5 h-3.5 rounded-full border-2 border-brand-500 border-t-transparent animate-spin shrink-0" />}
            {estado === 'pendiente' && <div className="w-3.5 h-3.5 rounded-full border-2 border-slate-300 shrink-0" />}
            <span className={`text-base ${estado === 'completada' ? 'text-slate-500 line-through' : estado === 'en_proceso' ? 'text-slate-800 font-medium' : 'text-slate-600'}`}>{t.titulo}</span>
            <span className="ml-auto text-sm text-slate-400 shrink-0">Equipo EsBrillante</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function TareaClienteCard({ tarea: t, onCompletar }) {
  const [expandida, setExpandida] = useState(true)
  const [texto, setTexto] = useState('')
  const [archivo, setArchivo] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')

  async function enviar() {
    setError('')
    setEnviando(true)
    try {
      await onCompletar({ texto: texto.trim() || undefined, archivo: archivo || undefined })
    } catch {
      setError('No se pudo enviar tu respuesta. Intenta de nuevo.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="bg-white border-2 border-amber-200 rounded-xl overflow-hidden shadow-sm">
      <div className="bg-amber-50 px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <AlertCircle size={15} className="text-amber-500 shrink-0" />
          <span className="font-semibold text-amber-800 text-base truncate">{t.titulo}</span>
        </div>
        <button onClick={() => setExpandida(!expandida)} className="text-amber-400 shrink-0 ml-2">
          {expandida ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </button>
      </div>
      {expandida && (
        <div className="px-5 py-4">
          <p className="text-base text-slate-700 leading-relaxed mb-4">{t.instruccionesCliente}</p>
          {t.plazoHoras && (
            <div className="flex items-center gap-1.5 text-sm text-slate-500 mb-4">
              <Clock size={12} />
              Tiempo sugerido: {t.plazoHoras} horas
            </div>
          )}

          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Escribe tu respuesta aquí (opcional si solo vas a adjuntar un archivo)..."
            rows={3}
            className="w-full text-base border border-slate-200 rounded-lg px-3 py-2.5 mb-3 outline-none focus:ring-2 focus:ring-brand-400 placeholder:text-slate-400 resize-none"
          />

          {archivo ? (
            <div className="flex items-center gap-2 text-sm bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 mb-3">
              <Paperclip size={12} className="text-slate-400 shrink-0" />
              <span className="flex-1 truncate text-slate-600">{archivo.name}</span>
              <button onClick={() => setArchivo(null)} className="text-slate-400 hover:text-red-500 shrink-0">
                <X size={13} />
              </button>
            </div>
          ) : (
            <label className="flex items-center gap-1.5 text-sm text-brand-700 hover:text-brand-800 cursor-pointer w-fit mb-3">
              <Paperclip size={12} />
              Adjuntar un archivo
              <input type="file" className="hidden" onChange={(e) => setArchivo(e.target.files?.[0] || null)} />
            </label>
          )}

          {error && <p className="text-sm text-red-600 mb-2">{error}</p>}

          <button
            onClick={enviar}
            disabled={enviando}
            className="w-full bg-brand-500 hover:bg-brand-600 disabled:opacity-60 text-slate-900 py-2.5 rounded-lg text-base font-semibold transition-colors flex items-center justify-center gap-2"
          >
            {enviando && <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
            ✓ Enviar respuesta
          </button>
          <p className="text-sm text-slate-400 text-center mt-2">Puedes escribir, adjuntar un archivo, o ambos</p>
        </div>
      )}
    </div>
  )
}
