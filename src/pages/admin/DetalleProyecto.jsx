import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Layout from '../../components/Layout'
import {
  getProyectoPorSlug, completarTarea, reabrirTarea, omitirTarea, calcularAvance,
  getFaseActual, calcularTiempos, iniciarPausa, terminarPausa, cerrarProyecto,
  confirmarAnticipo, getSession, formatFecha, formatFechaHora,
  editarTarea, agregarTareaCustom, eliminarTareaCustom, actualizarLinksCliente,
} from '../../data/storage'
import { FASES_WEB } from '../../data/plantillas'
import { generarMensajeInicio } from '../../data/mensajes'
import { crearCarpetasCliente, driveConfigurado } from '../../data/googleDrive'
import {
  CheckCircle2, Circle, Lock, AlertCircle, Copy, Check, Play, Pause,
  ChevronDown, ChevronUp, Clock, XCircle, Info, Pencil, Plus, Trash2, X, ExternalLink, Link2,
  FolderOpen, Loader2,
} from 'lucide-react'

export default function DetalleProyecto() {
  const { id } = useParams()
  const navigate = useNavigate()
  const session = getSession()
  const [proyecto, setProyecto] = useState(() => getProyectoPorSlug(id))
  const [faseAbierta, setFaseAbierta] = useState(null)
  const [tab, setTab] = useState('tareas') // tareas | info | log
  const [copiado, setCopiado] = useState(false)
  const [modalEditar, setModalEditar] = useState(null) // tarea a editar
  const [modalNueva, setModalNueva] = useState(null)   // número de fase donde agregar
  const [modalLink, setModalLink] = useState(null)     // { tareaId, linkTipo }
  const [driveEstado, setDriveEstado] = useState(null) // null | 'cargando' | 'ok' | 'error'
  const [driveError, setDriveError] = useState('')

  useEffect(() => {
    if (!proyecto) navigate('/admin')
  }, [proyecto])

  if (!proyecto) return null

  const faseActual = getFaseActual(proyecto)
  const avance = calcularAvance(proyecto)
  const tiempos = calcularTiempos(proyecto)
  const pausaActiva = proyecto.tiempos.pausas.find((p) => !p.fin)
  const completadasIds = new Set(proyecto.tareas.filter((t) => t.estado === 'completada').map((t) => t.id))

  function refresh() { setProyecto(getProyectoPorSlug(id)) }

  async function handleCrearDrive() {
    setDriveEstado('cargando')
    setDriveError('')
    try {
      const links = await crearCarpetasCliente(proyecto.cliente.nombreComercial)
      actualizarLinksCliente(proyecto.id, { drive: links.drive })
      const tareaDrive = proyecto.tareas.find((t) => t.linkTipo === 'drive' && t.estado !== 'completada')
      if (tareaDrive) completarTarea(proyecto.id, tareaDrive.id, 'Sistema (Drive API)')
      setDriveEstado('ok')
      refresh()
    } catch (err) {
      setDriveEstado('error')
      setDriveError(err.message || 'Error desconocido')
    }
  }

  function marcarCompleta(tareaId) {
    const tarea = proyecto.tareas.find((t) => t.id === tareaId)
    if (tarea?.linkTipo) {
      setModalLink({ tareaId, linkTipo: tarea.linkTipo, titulo: tarea.titulo })
      return
    }
    completarTarea(proyecto.id, tareaId, session.nombre)
    refresh()
  }

  function handleCompletarConLink(tareaId, linkTipo, url) {
    actualizarLinksCliente(proyecto.id, { [linkTipo]: url })
    completarTarea(proyecto.id, tareaId, session.nombre)
    setModalLink(null)
    refresh()
  }

  function reabrir(tareaId) {
    reabrirTarea(proyecto.id, tareaId, session.nombre)
    refresh()
  }

  function omitir(tareaId) {
    omitirTarea(proyecto.id, tareaId, session.nombre)
    refresh()
  }

  function handleGuardarEdicion(tareaId, cambios) {
    editarTarea(proyecto.id, tareaId, cambios, session.nombre)
    setModalEditar(null)
    refresh()
  }

  function handleAgregarTarea(datos) {
    agregarTareaCustom(proyecto.id, datos, session.nombre)
    setModalNueva(null)
    refresh()
  }

  function handleEliminarTarea(tareaId) {
    eliminarTareaCustom(proyecto.id, tareaId, session.nombre)
    refresh()
  }

  function togglePausa() {
    if (pausaActiva) {
      terminarPausa(proyecto.id, session.nombre)
    } else {
      iniciarPausa(proyecto.id, faseActual, session.nombre)
    }
    refresh()
  }

  function handleCerrar() {
    if (confirm('¿Cerrar el proyecto como completado?')) {
      cerrarProyecto(proyecto.id, session.nombre)
      refresh()
    }
  }

  function copiarMensaje() {
    navigator.clipboard.writeText(generarMensajeInicio(proyecto))
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  function estadoCalculado(t) {
    if (t.estado === 'completada') return 'completada'
    if (t.estado === 'omitida') return 'omitida'
    const deps = t.dependencias.every((d) => completadasIds.has(d))
    if (!deps) return 'bloqueada_dependencia'
    if (t.esCliente) return 'bloqueada_cliente'
    return 'disponible'
  }

  const fases = proyecto.proyecto?.fases || FASES_WEB
  const tareasPorFase = fases.map((f) => ({
    ...f,
    tareas: proyecto.tareas.filter((t) => t.fase === f.numero),
  }))

  return (
    <Layout titulo={proyecto.cliente.nombreComercial} volver="/admin">
      {/* Header del proyecto */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 mb-5">
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusBadge(proyecto.status)}`}>
                {statusLabel(proyecto.status)}
              </span>
              <span className="text-xs text-slate-400">{proyecto.proyecto.paquete}</span>
            </div>
            <h2 className="text-xl font-bold text-slate-800">{proyecto.cliente.nombreComercial}</h2>
            <p className="text-sm text-slate-500 mt-0.5">{proyecto.cliente.contactoPrincipal} · {proyecto.cliente.correo}</p>
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {proyecto.status === 'pendiente_anticipo' && (
              <button
                onClick={() => { confirmarAnticipo(proyecto.id, session.nombre); refresh() }}
                className="text-sm bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-lg transition-colors"
              >
                Confirmar anticipo
              </button>
            )}
            {proyecto.status === 'activo' && (
              <button onClick={togglePausa} className="flex items-center gap-1.5 text-sm border border-slate-200 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg transition-colors">
                <Pause size={14} /> Marcar pausa
              </button>
            )}
            {proyecto.status === 'en_pausa' && (
              <button onClick={togglePausa} className="flex items-center gap-1.5 text-sm bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg transition-colors">
                <Play size={14} /> Reanudar
              </button>
            )}
            {proyecto.status !== 'completado' && (
              <button onClick={handleCerrar} className="text-sm text-slate-400 hover:text-red-600 px-2 py-2 rounded-lg transition-colors">
                <XCircle size={16} />
              </button>
            )}
          </div>
        </div>

        {/* Barra de progreso */}
        <div className="mt-4">
          <div className="flex items-center justify-between text-sm mb-1.5">
            <span className="text-slate-600 font-medium">Fase {faseActual} — {fases.find(f => f.numero === faseActual)?.nombre}</span>
            <span className="font-bold text-slate-800">{avance}%</span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-violet-500 rounded-full transition-all duration-500" style={{ width: `${avance}%` }} />
          </div>
        </div>

        {/* Métricas de tiempo */}
        <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-slate-100">
          <div>
            <div className="text-xs text-slate-400">Tiempo activo</div>
            <div className="font-semibold text-slate-800">{tiempos.activoHoras}h</div>
          </div>
          <div>
            <div className="text-xs text-slate-400">En pausa</div>
            <div className="font-semibold text-amber-600">{tiempos.pausaHoras}h</div>
          </div>
          <div>
            <div className="text-xs text-slate-400">Entrega estimada</div>
            <div className="font-semibold text-slate-800">{formatFecha(proyecto.proyecto.fechaEstimadaEntrega)}</div>
          </div>
        </div>

        {/* Acceso cliente */}
        <div className="mt-4 pt-4 border-t border-slate-100 flex items-center gap-3 text-xs text-slate-500 flex-wrap">
          <span>Link cliente:</span>
          <button
            onClick={() => {
              navigator.clipboard.writeText(`${window.location.origin}/cliente/${proyecto.slug}`)
              setCopiado('link')
              setTimeout(() => setCopiado(false), 2000)
            }}
            className="flex items-center gap-1 bg-slate-100 hover:bg-violet-50 hover:text-violet-700 px-2 py-0.5 rounded transition-colors"
            title="Copiar link"
          >
            <code className="text-slate-700">/cliente/{proyecto.slug}</code>
            {copiado === 'link' ? <Check size={11} className="text-emerald-600" /> : <Copy size={11} className="text-slate-400" />}
          </button>
          <span>·</span>
          <span>Contraseña:</span>
          <button
            onClick={() => {
              navigator.clipboard.writeText(proyecto.passwordCliente)
              setCopiado('pass')
              setTimeout(() => setCopiado(false), 2000)
            }}
            className="flex items-center gap-1 bg-slate-100 hover:bg-violet-50 hover:text-violet-700 px-2 py-0.5 rounded transition-colors"
            title="Copiar contraseña"
          >
            <code className="text-slate-700">{proyecto.passwordCliente}</code>
            {copiado === 'pass' ? <Check size={11} className="text-emerald-600" /> : <Copy size={11} className="text-slate-400" />}
          </button>
          <button onClick={copiarMensaje} className="ml-auto flex items-center gap-1 text-slate-500 hover:text-slate-800">
            {copiado === true ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
            {copiado === true ? 'Copiado' : 'Copiar mensaje WA'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 mb-5">
        {[['tareas', 'Tareas'], ['info', 'Info del proyecto'], ['log', 'Historial']].map(([t, l]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t ? 'border-violet-600 text-violet-700' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {l}
          </button>
        ))}
      </div>

      {/* ─── Tab: Tareas ─── */}
      {tab === 'tareas' && (
        <div className="space-y-3">
          {tareasPorFase.map((fase) => {
            const completadas = fase.tareas.filter((t) => t.estado === 'completada' || t.estado === 'omitida').length
            const total = fase.tareas.length
            const abierta = faseAbierta === fase.numero || fase.numero === faseActual

            return (
              <div key={fase.numero} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <button
                  onClick={() => setFaseAbierta(abierta ? null : fase.numero)}
                  className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                      completadas === total && total > 0 ? 'bg-emerald-100 text-emerald-700' :
                      fase.numero === faseActual ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {fase.numero}
                    </div>
                    <span className="font-medium text-slate-800">Fase {fase.numero} — {fase.nombre}</span>
                    <span className="text-xs text-slate-400">{completadas}/{total}</span>
                  </div>
                  {abierta ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                </button>

                {abierta && (
                  <div className="border-t border-slate-100">
                    {fase.tareas.map((t) => {
                      const est = estadoCalculado(t)
                      return (
                        <TareaRow
                          key={t.id}
                          tarea={t}
                          estado={est}
                          onCompletar={() => marcarCompleta(t.id)}
                          onReabrir={() => reabrir(t.id)}
                          onOmitir={() => omitir(t.id)}
                          onEditar={() => setModalEditar(t)}
                          onEliminar={t.custom ? () => handleEliminarTarea(t.id) : null}
                          esAdmin={true}
                        />
                      )
                    })}
                    {/* Agregar tarea a esta fase */}
                    <div className="px-5 py-2.5 border-t border-slate-50">
                      <button
                        onClick={() => setModalNueva(fase.numero)}
                        className="flex items-center gap-1.5 text-xs text-violet-600 hover:text-violet-800 transition-colors"
                      >
                        <Plus size={13} /> Agregar tarea a Fase {fase.numero}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ─── Modal: Editar tarea ─── */}
      {modalEditar && (
        <ModalEditarTarea
          tarea={modalEditar}
          onGuardar={(cambios) => handleGuardarEdicion(modalEditar.id, cambios)}
          onCerrar={() => setModalEditar(null)}
        />
      )}

      {/* ─── Modal: Nueva tarea ─── */}
      {modalNueva !== null && (
        <ModalNuevaTarea
          fase={modalNueva}
          onGuardar={handleAgregarTarea}
          onCerrar={() => setModalNueva(null)}
        />
      )}

      {/* ─── Modal: Link requerido ─── */}
      {modalLink && (
        <ModalLink
          tareaId={modalLink.tareaId}
          linkTipo={modalLink.linkTipo}
          titulo={modalLink.titulo}
          valorActual={(proyecto.linksCliente || {})[modalLink.linkTipo] || ''}
          onCompletar={(url) => handleCompletarConLink(modalLink.tareaId, modalLink.linkTipo, url)}
          onCerrar={() => setModalLink(null)}
        />
      )}

      {/* ─── Tab: Info ─── */}
      {tab === 'info' && (
        <div className="grid grid-cols-2 gap-5">
          <InfoCard titulo="Links del cliente" fullWidth>
            <LinksClienteEditor
              links={proyecto.linksCliente || {}}
              onGuardar={(cambios) => { actualizarLinksCliente(proyecto.id, cambios); refresh() }}
              onCrearDrive={driveConfigurado() ? handleCrearDrive : null}
              driveEstado={driveEstado}
              driveError={driveError}
            />
          </InfoCard>

          <InfoCard titulo="Equipo asignado">
            <InfoRow label="Copy" valor={proyecto.equipo.copy} />
            <InfoRow label="Diseñador" valor={proyecto.equipo.disenador} />
            <InfoRow label="Programador" valor={proyecto.equipo.programador} />
            <InfoRow label="Coordinador" valor={proyecto.equipo.adminProyecto} />
          </InfoCard>

          <InfoCard titulo="Configuración técnica">
            <InfoBool label="Ya tiene dominio" valor={proyecto.condicionesTecnicas.tieneDominio} />
            <InfoBool label="Ya tiene hosting" valor={proyecto.condicionesTecnicas.tieneHosting} />
            <InfoBool label="Correos corporativos" valor={proyecto.condicionesTecnicas.requiereCorreos} />
            <InfoBool label="Cloudflare" valor={proyecto.condicionesTecnicas.requiereCloudflare} />
            <InfoBool label="Google Analytics" valor={proyecto.condicionesTecnicas.requiereAnalytics} />
            <InfoBool label="Search Console" valor={proyecto.condicionesTecnicas.requiereSearchConsole} />
            <InfoBool label="Capacitación" valor={proyecto.condicionesTecnicas.requiereCapacitacion} />
            {proyecto.condicionesTecnicas.requierePluginAdicional && (
              <InfoRow label="Plugin adicional" valor={proyecto.condicionesTecnicas.pluginAdicionalNombre} />
            )}
          </InfoCard>

          <InfoCard titulo="Extras contratados">
            {proyecto.proyecto.extras.length === 0
              ? <p className="text-sm text-slate-400">Sin extras</p>
              : proyecto.proyecto.extras.map((e) => (
                <div key={e} className="text-sm text-slate-700 flex items-center gap-2">
                  <Check size={13} className="text-violet-500 shrink-0" /> {e}
                </div>
              ))
            }
          </InfoCard>

          <InfoCard titulo="Participantes del cliente">
            {proyecto.cliente.participantes?.length === 0
              ? <p className="text-sm text-slate-400">Solo el contacto principal</p>
              : proyecto.cliente.participantes?.map((p, i) => (
                <div key={i} className="text-sm">
                  <span className="font-medium text-slate-700">{p.nombre}</span>
                  <span className="text-slate-400"> · {p.rol}</span>
                </div>
              ))
            }
          </InfoCard>
        </div>
      )}

      {/* ─── Tab: Log ─── */}
      {tab === 'log' && (
        <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
          {[...proyecto.log].reverse().map((entry) => (
            <div key={entry.id} className="px-5 py-3 flex items-start gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-violet-400 mt-2 shrink-0" />
              <div>
                <div className="text-sm text-slate-800">
                  <span className="font-medium">{entry.usuario}</span> — {entry.accion}
                  {entry.detalle && <span className="text-slate-500"> · {entry.detalle}</span>}
                </div>
                <div className="text-xs text-slate-400 mt-0.5">{formatFechaHora(entry.fecha)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Layout>
  )
}

function TareaRow({ tarea: t, estado, onCompletar, onReabrir, onOmitir, onEditar, onEliminar, esAdmin }) {
  const [expandida, setExpandida] = useState(false)
  const [confirmarEliminar, setConfirmarEliminar] = useState(false)

  const iconMap = {
    completada: <CheckCircle2 size={18} className="text-emerald-500 shrink-0" />,
    disponible: <Circle size={18} className="text-slate-300 shrink-0" />,
    bloqueada_dependencia: <Lock size={18} className="text-slate-300 shrink-0" />,
    bloqueada_cliente: <AlertCircle size={18} className="text-amber-400 shrink-0" />,
    omitida: <XCircle size={18} className="text-slate-300 shrink-0" />,
  }

  const bgMap = {
    completada: 'bg-emerald-50',
    disponible: 'bg-white',
    bloqueada_dependencia: 'bg-slate-50',
    bloqueada_cliente: 'bg-amber-50',
    omitida: 'bg-slate-50 opacity-50',
  }

  return (
    <div className={`px-5 py-3.5 border-b border-slate-50 last:border-0 ${bgMap[estado]}`}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5">{iconMap[estado]}</div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-sm font-medium ${estado === 'completada' ? 'line-through text-slate-400' : estado === 'omitida' ? 'text-slate-400' : 'text-slate-800'}`}>
              {t.titulo}
            </span>
            {t.esCliente && (
              <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Cliente</span>
            )}
            {t.esRutaCritica && (
              <span className="text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full">Ruta crítica</span>
            )}
            {t.soloKarlaOAdmin && (
              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Solo Karla/Admin</span>
            )}
            {t.custom && (
              <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">Personalizada</span>
            )}
          </div>

          {estado === 'completada' && t.completadaPor && (
            <div className="text-xs text-slate-400 mt-0.5">
              Completada por {t.completadaPor} · {formatFechaHora(t.completadaEn)}
            </div>
          )}

          {(t.descripcion || t.instruccionesCliente) && (
            <button
              onClick={() => setExpandida(!expandida)}
              className="text-xs text-slate-400 hover:text-slate-600 mt-1 flex items-center gap-1"
            >
              <Info size={11} />
              {expandida ? 'Ocultar' : 'Ver detalles'}
            </button>
          )}

          {expandida && (
            <div className="mt-2 text-xs text-slate-600 bg-slate-100 rounded-lg p-3">
              {t.esCliente ? t.instruccionesCliente : t.descripcion}
            </div>
          )}
        </div>

        {/* Acciones */}
        {esAdmin && (
          <div className="flex items-center gap-1 shrink-0">
            {estado === 'disponible' && (
              <button onClick={onCompletar} className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg transition-colors">
                Completar
              </button>
            )}
            {estado === 'bloqueada_cliente' && (
              <button onClick={onCompletar} className="text-xs bg-amber-600 hover:bg-amber-700 text-white px-3 py-1.5 rounded-lg transition-colors">
                Marcar recibido
              </button>
            )}
            {estado === 'completada' && (
              <button onClick={onReabrir} className="text-xs text-slate-400 hover:text-slate-700 px-2 py-1">
                Reabrir
              </button>
            )}

            {/* Editar siempre disponible para admin */}
            {estado !== 'omitida' && (
              <button
                onClick={onEditar}
                className="p-1.5 text-slate-300 hover:text-violet-600 hover:bg-violet-50 rounded-lg transition-colors"
                title="Editar tarea"
              >
                <Pencil size={13} />
              </button>
            )}

            {/* Omitir o eliminar */}
            {estado !== 'completada' && estado !== 'omitida' && !confirmarEliminar && (
              onEliminar ? (
                <button
                  onClick={() => setConfirmarEliminar(true)}
                  className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                  title="Eliminar tarea"
                >
                  <Trash2 size={13} />
                </button>
              ) : (
                <button onClick={onOmitir} className="p-1.5 text-slate-300 hover:text-slate-500 hover:bg-slate-100 rounded-lg transition-colors" title="Omitir tarea">
                  <X size={13} />
                </button>
              )
            )}

            {confirmarEliminar && (
              <div className="flex items-center gap-1">
                <button onClick={onEliminar} className="text-xs bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded-lg">Eliminar</button>
                <button onClick={() => setConfirmarEliminar(false)} className="text-xs text-slate-400 px-1">No</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

const RESPONSABLES = [
  { valor: 'admin', label: 'Admin' },
  { valor: 'equipo', label: 'Equipo (cualquiera)' },
  { valor: 'copy', label: 'Copy' },
  { valor: 'disenador', label: 'Diseñador' },
  { valor: 'programador', label: 'Programador' },
  { valor: 'karla', label: 'Karla' },
  { valor: 'cliente', label: 'Cliente' },
]

function ModalEditarTarea({ tarea, onGuardar, onCerrar }) {
  const [form, setForm] = useState({
    titulo: tarea.titulo,
    descripcion: tarea.esCliente ? '' : (tarea.descripcion || ''),
    instruccionesCliente: tarea.esCliente ? (tarea.instruccionesCliente || '') : '',
    responsable: tarea.responsable,
    esCliente: tarea.esCliente,
    esRutaCritica: tarea.esRutaCritica,
    soloKarlaOAdmin: tarea.soloKarlaOAdmin,
    plazoHoras: tarea.plazoHoras || '',
  })

  function handleSubmit(e) {
    e.preventDefault()
    if (!form.titulo.trim()) return
    onGuardar({
      ...form,
      plazoHoras: form.plazoHoras ? Number(form.plazoHoras) : null,
    })
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onCerrar}>
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h3 className="font-semibold text-slate-800">Editar tarea</h3>
          <button onClick={onCerrar} className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Título *</label>
            <input
              value={form.titulo}
              onChange={(e) => setForm({ ...form, titulo: e.target.value })}
              className={inputCls}
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Responsable</label>
            <select value={form.responsable} onChange={(e) => setForm({ ...form, responsable: e.target.value })} className={inputCls}>
              {RESPONSABLES.map((r) => <option key={r.valor} value={r.valor}>{r.label}</option>)}
            </select>
          </div>

          {!form.esCliente && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Descripción interna</label>
              <textarea
                value={form.descripcion}
                onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                className={inputCls + ' resize-none'}
                rows={3}
                placeholder="Instrucciones para el equipo..."
              />
            </div>
          )}

          {form.esCliente && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Instrucciones para el cliente</label>
              <textarea
                value={form.instruccionesCliente}
                onChange={(e) => setForm({ ...form, instruccionesCliente: e.target.value })}
                className={inputCls + ' resize-none'}
                rows={4}
                placeholder="Texto que verá el cliente..."
              />
            </div>
          )}

          <div className="flex gap-4 flex-wrap">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.esCliente} onChange={(e) => setForm({ ...form, esCliente: e.target.checked })} className="accent-violet-600" />
              Tarea del cliente
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.esRutaCritica} onChange={(e) => setForm({ ...form, esRutaCritica: e.target.checked })} className="accent-violet-600" />
              Ruta crítica
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.soloKarlaOAdmin} onChange={(e) => setForm({ ...form, soloKarlaOAdmin: e.target.checked })} className="accent-violet-600" />
              Solo Karla/Admin
            </label>
          </div>

          {form.esCliente && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Plazo sugerido (horas)</label>
              <input type="number" value={form.plazoHoras} onChange={(e) => setForm({ ...form, plazoHoras: e.target.value })} className={inputCls} placeholder="48" min="1" />
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button type="submit" className="flex-1 bg-violet-600 hover:bg-violet-700 text-white py-2.5 rounded-lg text-sm font-semibold transition-colors">
              Guardar cambios
            </button>
            <button type="button" onClick={onCerrar} className="px-5 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg text-sm transition-colors">
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function ModalNuevaTarea({ fase, onGuardar, onCerrar }) {
  const [form, setForm] = useState({
    titulo: '',
    descripcion: '',
    instruccionesCliente: '',
    responsable: 'equipo',
    esCliente: false,
    plazoHoras: '',
  })

  function handleSubmit(e) {
    e.preventDefault()
    if (!form.titulo.trim()) return
    onGuardar({
      fase,
      titulo: form.titulo.trim(),
      descripcion: form.descripcion,
      instruccionesCliente: form.instruccionesCliente,
      responsable: form.esCliente ? 'cliente' : form.responsable,
      esCliente: form.esCliente,
      plazoHoras: form.plazoHoras ? Number(form.plazoHoras) : null,
    })
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onCerrar}>
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h3 className="font-semibold text-slate-800">Nueva tarea — Fase {fase}</h3>
          <button onClick={onCerrar} className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Título *</label>
            <input
              value={form.titulo}
              onChange={(e) => setForm({ ...form, titulo: e.target.value })}
              className={inputCls}
              placeholder="Nombre de la tarea..."
              autoFocus
            />
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={form.esCliente} onChange={(e) => setForm({ ...form, esCliente: e.target.checked })} className="accent-violet-600" />
            Es una tarea del cliente
          </label>

          {!form.esCliente && (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Responsable</label>
                <select value={form.responsable} onChange={(e) => setForm({ ...form, responsable: e.target.value })} className={inputCls}>
                  {RESPONSABLES.filter(r => r.valor !== 'cliente').map((r) => <option key={r.valor} value={r.valor}>{r.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Descripción interna</label>
                <textarea
                  value={form.descripcion}
                  onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                  className={inputCls + ' resize-none'}
                  rows={3}
                  placeholder="¿Qué hay que hacer exactamente?"
                />
              </div>
            </>
          )}

          {form.esCliente && (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Instrucciones para el cliente</label>
                <textarea
                  value={form.instruccionesCliente}
                  onChange={(e) => setForm({ ...form, instruccionesCliente: e.target.value })}
                  className={inputCls + ' resize-none'}
                  rows={4}
                  placeholder="Texto que verá el cliente en su portal..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Plazo sugerido (horas)</label>
                <input type="number" value={form.plazoHoras} onChange={(e) => setForm({ ...form, plazoHoras: e.target.value })} className={inputCls} placeholder="48" min="1" />
              </div>
            </>
          )}

          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={!form.titulo.trim()} className="flex-1 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white py-2.5 rounded-lg text-sm font-semibold transition-colors">
              Agregar tarea
            </button>
            <button type="button" onClick={onCerrar} className="px-5 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg text-sm transition-colors">
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

const inputCls = 'w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent placeholder:text-slate-400'

function InfoCard({ titulo, children, fullWidth }) {
  return (
    <div className={`bg-white rounded-xl border border-slate-200 p-5 ${fullWidth ? 'col-span-2' : ''}`}>
      <h3 className="font-semibold text-slate-800 mb-3 text-sm">{titulo}</h3>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

const LINK_LABELS = {
  drive: { label: 'Carpeta Drive', placeholder: 'https://drive.google.com/...' },
  brief: { label: 'Brief (Google Docs)', placeholder: 'https://docs.google.com/...' },
  boceto: { label: 'Boceto', placeholder: 'https://docs.google.com/... o link del boceto' },
  diseno: { label: 'Sitio para revisión', placeholder: 'https://staging.ejemplo.com' },
}

function LinksClienteEditor({ links, onGuardar, onCrearDrive, driveEstado, driveError }) {
  const [form, setForm] = useState({ drive: links.drive || '', brief: links.brief || '', boceto: links.boceto || '', diseno: links.diseno || '' })
  const [guardado, setGuardado] = useState(false)

  // Sync cuando cambian los links externos (ej. después de crear Drive)
  useState(() => {
    setForm({ drive: links.drive || '', brief: links.brief || '', boceto: links.boceto || '', diseno: links.diseno || '' })
  }, [links])

  function handleGuardar(e) {
    e.preventDefault()
    onGuardar(form)
    setGuardado(true)
    setTimeout(() => setGuardado(false), 2000)
  }

  return (
    <form onSubmit={handleGuardar} className="space-y-3">
      {Object.entries(LINK_LABELS).map(([tipo, { label, placeholder }]) => (
        <div key={tipo} className="flex items-center gap-2">
          <label className="text-xs text-slate-500 w-36 shrink-0">{label}</label>
          <input
            value={form[tipo]}
            onChange={(e) => setForm({ ...form, [tipo]: e.target.value })}
            placeholder={placeholder}
            className="flex-1 border border-slate-200 rounded-lg px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-violet-400 placeholder:text-slate-300"
          />
          {form[tipo] && (
            <a href={form[tipo]} target="_blank" rel="noopener noreferrer" className="text-slate-300 hover:text-violet-600 shrink-0">
              <ExternalLink size={13} />
            </a>
          )}
        </div>
      ))}

      <div className="flex items-center gap-2 pt-1 flex-wrap">
        <button type="submit" className="text-xs bg-violet-600 hover:bg-violet-700 text-white px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5">
          {guardado ? <><Check size={12} /> Guardado</> : <><Link2 size={12} /> Guardar links</>}
        </button>

        {onCrearDrive && (
          <button
            type="button"
            onClick={onCrearDrive}
            disabled={driveEstado === 'cargando'}
            className="text-xs border border-slate-200 hover:bg-slate-50 text-slate-600 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50"
          >
            {driveEstado === 'cargando'
              ? <><Loader2 size={12} className="animate-spin" /> Creando carpetas...</>
              : <><FolderOpen size={12} /> {!links.drive ? 'Crear carpetas en Drive' : 'Recrear carpetas en Drive'}</>
            }
          </button>
        )}
      </div>

      {driveEstado === 'ok' && (
        <div className="text-xs text-emerald-600 flex items-center gap-1.5">
          <Check size={12} /> Carpetas creadas y link de Drive guardado
        </div>
      )}
      {driveEstado === 'error' && (
        <div className="text-xs text-red-500">
          Error al crear carpetas: {driveError}
        </div>
      )}
    </form>
  )
}

function ModalLink({ tareaId, linkTipo, titulo, valorActual, onCompletar, onCerrar }) {
  const [url, setUrl] = useState(valorActual)
  const info = LINK_LABELS[linkTipo] || { label: 'Link', placeholder: 'https://' }

  function handleSubmit(e) {
    e.preventDefault()
    if (!url.trim()) return
    onCompletar(url.trim())
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onCerrar}>
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h3 className="font-semibold text-slate-800">Completar tarea</h3>
          <button onClick={onCerrar} className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <div className="text-sm text-slate-600 mb-1">Tarea: <span className="font-medium text-slate-800">{titulo}</span></div>
            <p className="text-xs text-slate-400">Para completar esta tarea es necesario pegar el link generado. Este link quedará visible en el panel del cliente.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">{info.label} *</label>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={info.placeholder}
              className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-violet-400 placeholder:text-slate-400"
              autoFocus
            />
          </div>
          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={!url.trim()}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white py-2.5 rounded-lg text-sm font-semibold transition-colors"
            >
              Completar y guardar link
            </button>
            <button type="button" onClick={onCerrar} className="px-5 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg text-sm transition-colors">
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function InfoRow({ label, valor }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="text-slate-800 font-medium">{valor || '—'}</span>
    </div>
  )
}

function InfoBool({ label, valor }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-500">{label}</span>
      <span className={valor ? 'text-emerald-600' : 'text-slate-300'}>{valor ? '✓ Sí' : '✗ No'}</span>
    </div>
  )
}

function statusBadge(status) {
  const m = {
    activo: 'bg-emerald-100 text-emerald-700',
    en_pausa: 'bg-amber-100 text-amber-700',
    pendiente_anticipo: 'bg-red-100 text-red-700',
    completado: 'bg-slate-100 text-slate-600',
    cancelado: 'bg-slate-100 text-slate-500',
  }
  return m[status] || m.activo
}

function statusLabel(status) {
  const m = { activo: 'Activo', en_pausa: 'En pausa', pendiente_anticipo: 'Pendiente anticipo', completado: 'Completado', cancelado: 'Cancelado' }
  return m[status] || status
}
