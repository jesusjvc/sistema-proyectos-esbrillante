import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import { useAuth } from '../context/AuthContext'
import {
  getProyecto, completarTarea, reabrirTarea, omitirTarea, moverTarea,
  iniciarPausa, terminarPausa, cerrarProyecto, confirmarAnticipo,
  editarTarea, agregarTarea, eliminarTarea, actualizarLinks, marcarVisto,
  cambiarTipoProyecto, eliminarProyecto, getMiembros, actualizarEquipoProyecto,
  aprobarSolicitud, rechazarSolicitud, actualizarDescripcion, crearCarpetaDriveProyecto,
} from '../data/api'
import { calcularAvance, getFaseActual, calcularTiempos, formatFecha, formatFechaHora } from '../data/storage'
import { FASES_WEB } from '../data/plantillas'
import { KANBAN_COLUMNAS, contarPorColumna } from '../data/kanban'
import { generarMensajeInicio } from '../data/mensajes'
import { useEventosProyecto } from '../hooks/useEventos'
import { EQUIPO_NO_APLICA, infoResponsable, miembrosDelEquipo } from '../lib/permisos'
import KanbanBoard from '../components/KanbanBoard'
import Avatar from '../components/Avatar'
import PrototiposPanel from '../components/PrototiposPanel'
import PanelSolicitudes from '../components/PanelSolicitudes'
import DescripcionProyecto from '../components/DescripcionProyecto'
import {
  CheckCircle2, Circle, Lock, AlertCircle, Copy, Check, Play, Pause, PlayCircle,
  ChevronDown, ChevronUp, XCircle, Info, Pencil, Plus, Trash2, X, ExternalLink, Link2,
  FolderOpen, Loader2, Users, Settings2, Sparkles, UserCircle2, Clock3, MessageCircle,
  AlertTriangle,
} from 'lucide-react'

export default function DetalleProyecto() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [proyecto, setProyecto] = useState(null)
  const [faseAbierta, setFaseAbierta] = useState(null)
  const [tab, setTab] = useState('tareas')
  const [copiado, setCopiado] = useState(false)
  const [modalEditar, setModalEditar] = useState(null)
  const [modalNueva, setModalNueva] = useState(null)
  const [modalLink, setModalLink] = useState(null)
  const [modalEliminar, setModalEliminar] = useState(false)
  const [driveEstado, setDriveEstado] = useState(null)
  const [driveError, setDriveError] = useState('')
  const [avatares, setAvatares] = useState({})
  const [miembros, setMiembros] = useState([])
  const [editandoEquipo, setEditandoEquipo] = useState(false)
  const esAdminRol = user?.rol === 'admin'
  const base = esAdminRol ? '/admin' : '/equipo'

  useEffect(() => {
    getProyecto(id).then(setProyecto).catch(() => navigate(base))
    if (esAdminRol) marcarVisto(id).catch(() => {})
    getMiembros().then((ms) => {
      setMiembros(ms)
      setAvatares(Object.fromEntries(ms.map((m) => [m.nombre, m.avatarUrl])))
    }).catch(() => {})
  }, [id])

  const miembrosPorId = Object.fromEntries(miembros.map((m) => [m.id, m.nombre]))

  async function handleGuardarEquipo(equipo) {
    await actualizarEquipoProyecto(proyecto.slug, equipo)
    setEditandoEquipo(false)
    await refresh()
  }

  async function refresh() {
    const p = await getProyecto(id)
    setProyecto(p)
  }

  useEventosProyecto(id, true, refresh)

  if (!proyecto) {
    return (
      <Layout titulo="Proyecto" volver={base}>
        <div className="flex justify-center py-12">
          <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </Layout>
    )
  }

  const faseActual = getFaseActual(proyecto)
  const avance = calcularAvance(proyecto)
  const tiempos = calcularTiempos(proyecto)
  const pausaActiva = proyecto.tiempos?.pausas?.find((p) => !p.fin)
  const completadasIds = new Set(proyecto.tareas.filter((t) => t.estado === 'completada').map((t) => t.id))

  async function handleCrearDrive() {
    setDriveEstado('cargando')
    setDriveError('')
    try {
      await crearCarpetaDriveProyecto(proyecto.slug)
      setDriveEstado('ok')
      await refresh()
    } catch (err) {
      setDriveEstado('error')
      setDriveError(err.message || 'Error desconocido')
    }
  }

  async function marcarCompleta(tareaId) {
    const tarea = proyecto.tareas.find((t) => t.id === tareaId)
    if (tarea?.linkTipo) {
      setModalLink({ tareaId, linkTipo: tarea.linkTipo, titulo: tarea.titulo })
      return
    }
    await completarTarea(proyecto.slug, tareaId)
    await refresh()
  }

  async function handleCompletarConLink(tareaId, linkTipo, url) {
    await actualizarLinks(proyecto.slug, { [linkTipo]: url })
    await completarTarea(proyecto.slug, tareaId)
    setModalLink(null)
    await refresh()
  }

  async function reabrir(tareaId) {
    await reabrirTarea(proyecto.slug, tareaId)
    await refresh()
  }

  async function omitir(tareaId) {
    await omitirTarea(proyecto.slug, tareaId)
    await refresh()
  }

  async function handleGuardarEdicion(tareaId, cambios) {
    await editarTarea(proyecto.slug, tareaId, cambios)
    setModalEditar(null)
    await refresh()
  }

  async function handleAgregarTarea(datos) {
    await agregarTarea(proyecto.slug, datos)
    setModalNueva(null)
    await refresh()
  }

  async function handleAprobarSolicitud(id, datos) {
    await aprobarSolicitud(proyecto.slug, id, datos)
    await refresh()
  }

  async function handleRechazarSolicitud(id, motivo) {
    await rechazarSolicitud(proyecto.slug, id, motivo)
    await refresh()
  }

  async function handleMoverTarea(tareaId, datos) {
    await moverTarea(proyecto.slug, tareaId, datos)
    await refresh()
  }

  async function handleEliminarTarea(tareaId) {
    await eliminarTarea(proyecto.slug, tareaId)
    await refresh()
  }

  async function togglePausa() {
    if (pausaActiva) {
      await terminarPausa(proyecto.slug)
    } else {
      await iniciarPausa(proyecto.slug, faseActual)
    }
    await refresh()
  }

  async function handleCerrar() {
    if (confirm('¿Cerrar el proyecto como completado?')) {
      await cerrarProyecto(proyecto.slug)
      await refresh()
    }
  }

  async function handleEliminarProyecto() {
    await eliminarProyecto(proyecto.slug)
    navigate(base)
  }

  async function handleCambiarTipo() {
    const nuevoTipo = proyecto.tipo === 'continuo' ? 'finito' : 'continuo'
    const aviso = nuevoTipo === 'continuo'
      ? 'Las tareas actuales se reparten en el tablero Kanban según su estado (pendiente→Todo, en proceso→Doing, completada→Done). ¿Convertir a continuo?'
      : 'Las tareas quedarán todas en Fase 1 y tendrás que reorganizarlas manualmente. ¿Convertir a finito?'
    if (confirm(aviso)) {
      await cambiarTipoProyecto(proyecto.slug, nuevoTipo)
      await refresh()
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
    if (t.estado === 'en_proceso') return 'en_proceso'
    const deps = t.dependencias.every((d) => completadasIds.has(d))
    if (!deps) return 'bloqueada_dependencia'
    if (t.esCliente) return 'bloqueada_cliente'
    return 'disponible'
  }

  const esContinuo = proyecto.tipo === 'continuo'
  const fases = proyecto.proyecto?.fases || FASES_WEB
  const tareasPorFase = fases.map((f) => ({
    ...f,
    tareas: proyecto.tareas.filter((t) => t.fase === f.numero).sort((a, b) => a.orden - b.orden),
  }))
  const columnasCount = esContinuo ? contarPorColumna(proyecto) : null
  const miembrosProyecto = miembrosDelEquipo(proyecto.equipo, miembros)
  const solicitudesPendientes = (proyecto.solicitudes || []).filter((s) => s.estado === 'pendiente').length

  return (
    <Layout titulo={proyecto.cliente.nombreComercial} volver={base}>
      {/* Header del proyecto */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 mb-5">
        <div className="flex flex-col lg:flex-row items-start gap-6">
          {/* Columna izquierda: identidad + progreso + métricas */}
          <div className="flex-1 min-w-0 w-full">
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusBadge(proyecto.status)}`}>
                {statusLabel(proyecto.status)}
              </span>
              <span className="text-xs text-slate-400">{proyecto.proyecto.paquete}</span>
              <button
                onClick={handleCambiarTipo}
                className="text-xs text-slate-400 hover:text-brand-700 underline decoration-dotted transition-colors"
                title={esContinuo ? 'Convertir a proyecto finito (con fases)' : 'Convertir a proyecto continuo (tablero Kanban)'}
              >
                Cambiar a {esContinuo ? 'finito' : 'continuo'}
              </button>
            </div>
            <h2 className="text-xl font-bold text-slate-800">{proyecto.cliente.nombreComercial}</h2>
            <p className="text-sm text-slate-500 mt-0.5">{proyecto.cliente.contactoPrincipal} · {proyecto.cliente.correo}</p>
            <DescripcionProyecto
              descripcion={proyecto.proyecto?.descripcion}
              onGuardar={async (descripcion) => { await actualizarDescripcion(proyecto.slug, descripcion); await refresh() }}
            />

            {esContinuo ? (
              <div className="mt-4 flex items-center gap-3 flex-wrap">
                {KANBAN_COLUMNAS.map((c) => (
                  <div key={c.columna} className="text-sm text-slate-500">
                    <span className="font-bold text-slate-800">{columnasCount[c.columna]}</span> {c.label}
                  </div>
                ))}
              </div>
            ) : (
              /* Barra de progreso */
              <div className="mt-4">
                <div className="flex items-center justify-between text-sm mb-1.5">
                  <span className="text-slate-600 font-medium">Fase {faseActual} — {fases.find(f => f.numero === faseActual)?.nombre}</span>
                  <span className="font-bold text-slate-800">{avance}%</span>
                </div>
                <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-brand-500 rounded-full transition-all duration-500" style={{ width: `${avance}%` }} />
                </div>
              </div>
            )}

            {/* Métricas de tiempo */}
            <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-slate-100">
              <div>
                <div className="text-[11px] uppercase tracking-wide text-slate-400 font-medium">Tiempo activo</div>
                <div className="font-semibold text-slate-800 mt-0.5">{tiempos.activoHoras}h</div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wide text-slate-400 font-medium">En pausa</div>
                <div className="font-semibold text-amber-600 mt-0.5">{tiempos.pausaHoras}h</div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wide text-slate-400 font-medium">{esContinuo ? 'Servicio' : 'Entrega estimada'}</div>
                <div className="font-semibold text-slate-800 mt-0.5">{esContinuo ? 'Continuo' : formatFecha(proyecto.proyecto.fechaEstimadaEntrega)}</div>
              </div>
            </div>
          </div>

          {/* Columna derecha: acciones + acceso del cliente */}
          <div className="w-full lg:w-72 shrink-0 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              {proyecto.status === 'pendiente_anticipo' && esAdminRol && (
                <button
                  onClick={async () => { await confirmarAnticipo(proyecto.slug); await refresh() }}
                  className="flex-1 text-sm bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-lg transition-colors"
                >
                  Confirmar anticipo
                </button>
              )}
              {proyecto.status === 'activo' && (
                <button onClick={togglePausa} className="flex-1 flex items-center justify-center gap-1.5 text-sm border border-slate-200 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg transition-colors">
                  <Pause size={14} /> Marcar pausa
                </button>
              )}
              {proyecto.status === 'en_pausa' && (
                <button onClick={togglePausa} className="flex-1 flex items-center justify-center gap-1.5 text-sm bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg transition-colors">
                  <Play size={14} /> Reanudar
                </button>
              )}
              {proyecto.status !== 'completado' && (
                <button onClick={handleCerrar} className="text-sm text-slate-400 hover:text-red-600 p-2 rounded-lg transition-colors" title="Cerrar proyecto">
                  <XCircle size={16} />
                </button>
              )}
              {esAdminRol && (
                <button onClick={() => setModalEliminar(true)} className="text-sm text-slate-400 hover:text-red-600 p-2 rounded-lg transition-colors" title="Eliminar proyecto">
                  <Trash2 size={16} />
                </button>
              )}
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 space-y-2.5">
              <div className="text-[11px] uppercase tracking-wide text-slate-400 font-medium">Acceso del cliente</div>
              <div className="flex items-stretch gap-1.5">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/cliente/${proyecto.slug}`)
                    setCopiado('link')
                    setTimeout(() => setCopiado(false), 2000)
                  }}
                  className="flex-1 flex items-center justify-between gap-2 bg-white border border-slate-200 hover:border-brand-300 px-2.5 py-1.5 rounded-md transition-colors text-left min-w-0"
                  title="Copiar link"
                >
                  <code className="text-xs text-slate-700 truncate">/cliente/{proyecto.slug}</code>
                  {copiado === 'link' ? <Check size={13} className="text-emerald-600 shrink-0" /> : <Copy size={13} className="text-slate-400 shrink-0" />}
                </button>
                <a
                  href={`/cliente/${proyecto.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center bg-white border border-slate-200 hover:border-brand-300 px-2.5 py-1.5 rounded-md transition-colors shrink-0"
                  title="Ver como cliente (sin contraseña, con tu sesión)"
                >
                  <ExternalLink size={13} className="text-slate-400" />
                </a>
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(proyecto.passwordCliente)
                  setCopiado('pass')
                  setTimeout(() => setCopiado(false), 2000)
                }}
                className="w-full flex items-center justify-between gap-2 bg-white border border-slate-200 hover:border-brand-300 px-2.5 py-1.5 rounded-md transition-colors text-left"
                title="Copiar contraseña"
              >
                <code className="text-xs text-slate-700 truncate">{proyecto.passwordCliente}</code>
                {copiado === 'pass' ? <Check size={13} className="text-emerald-600 shrink-0" /> : <Copy size={13} className="text-slate-400 shrink-0" />}
              </button>
              <button
                onClick={copiarMensaje}
                className="w-full flex items-center justify-center gap-1.5 text-xs font-medium bg-brand-500 hover:bg-brand-600 text-slate-900 px-3 py-1.5 rounded-md transition-colors"
              >
                {copiado === true ? <Check size={13} /> : <MessageCircle size={13} />}
                {copiado === true ? 'Copiado' : 'Copiar mensaje WhatsApp'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 mb-5">
        {[['tareas', 'Tareas'], ['solicitudes', 'Solicitudes'], ['prototipos', 'Prototipos'], ['info', 'Info del proyecto'], ['log', 'Historial']].map(([t, l]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t ? 'border-brand-600 text-brand-800' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {l}
            {t === 'solicitudes' && solicitudesPendientes > 0 && (
              <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">{solicitudesPendientes}</span>
            )}
          </button>
        ))}
      </div>

      {/* ─── Tab: Solicitudes ─── */}
      {tab === 'solicitudes' && (
        <PanelSolicitudes
          solicitudes={proyecto.solicitudes || []}
          esContinuo={esContinuo}
          fases={fases}
          miembrosProyecto={miembrosProyecto}
          onAprobar={handleAprobarSolicitud}
          onRechazar={handleRechazarSolicitud}
        />
      )}

      {/* ─── Tab: Tareas ─── */}
      {tab === 'tareas' && esContinuo && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button
              onClick={() => setModalNueva('todo')}
              className="flex items-center gap-1.5 bg-brand-500 hover:bg-brand-600 text-slate-900 text-sm font-semibold px-3.5 py-2 rounded-lg transition-colors"
            >
              <Plus size={16} /> Nueva tarjeta
            </button>
          </div>
          <KanbanBoard
            tareas={proyecto.tareas}
            avatares={avatares}
            equipo={proyecto.equipo}
            miembrosPorId={miembrosPorId}
            onMover={handleMoverTarea}
            onEditar={(t) => setModalEditar(t)}
            onEliminar={(t) => handleEliminarTarea(t.id)}
          />
        </div>
      )}

      {tab === 'tareas' && !esContinuo && (
        <div className="space-y-3">
          {tareasPorFase.map((fase) => {
            const completadas = fase.tareas.filter((t) => t.estado === 'completada' || t.estado === 'omitida').length
            const total = fase.tareas.length
            const abierta = faseAbierta === fase.numero || fase.numero === faseActual

            return (
              <div key={fase.numero} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <button
                  onClick={() => setFaseAbierta(abierta ? null : fase.numero)}
                  className={`w-full flex items-center justify-between px-5 py-4 transition-colors ${abierta ? 'bg-slate-50' : 'hover:bg-slate-50'}`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                      completadas === total && total > 0 ? 'bg-emerald-100 text-emerald-700' :
                      fase.numero === faseActual ? 'bg-brand-100 text-brand-800' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {completadas === total && total > 0 ? <Check size={14} /> : fase.numero}
                    </div>
                    <span className="font-medium text-slate-800">Fase {fase.numero} — {fase.nombre}</span>
                    <span className="text-xs text-slate-400">{completadas}/{total}</span>
                    {fase.fechaEstimada && <span className="text-xs text-slate-400">· est. {formatFecha(fase.fechaEstimada)}</span>}
                    {fase.requierePago && !fase.pagoConfirmado && (
                      <span className="flex items-center gap-1 text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                        <Lock size={10} /> Esperando pago
                      </span>
                    )}
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
                          avatares={avatares}
                          equipo={proyecto.equipo}
                          miembrosPorId={miembrosPorId}
                          onCompletar={() => marcarCompleta(t.id)}
                          onReabrir={() => reabrir(t.id)}
                          onOmitir={() => omitir(t.id)}
                          onEditar={() => setModalEditar(t)}
                          onEliminar={t.custom ? () => handleEliminarTarea(t.id) : null}
                          esAdmin={true}
                        />
                      )
                    })}
                    <div className="px-5 py-2.5 border-t border-slate-50">
                      <button
                        onClick={() => setModalNueva(fase.numero)}
                        className="flex items-center gap-1.5 bg-brand-500 hover:bg-brand-600 text-slate-900 text-sm font-semibold px-3.5 py-2 rounded-lg transition-colors"
                      >
                        <Plus size={16} /> Agregar tarea a Fase {fase.numero}
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
          miembrosProyecto={miembrosProyecto}
          todasLasTareas={proyecto.tareas}
          onGuardar={(cambios) => handleGuardarEdicion(modalEditar.id, cambios)}
          onCerrar={() => setModalEditar(null)}
        />
      )}

      {/* ─── Modal: Nueva tarea ─── */}
      {modalNueva !== null && (
        <ModalNuevaTarea
          contexto={modalNueva}
          miembrosProyecto={miembrosProyecto}
          todasLasTareas={proyecto.tareas}
          onGuardar={handleAgregarTarea}
          onCerrar={() => setModalNueva(null)}
        />
      )}

      {/* ─── Modal: Eliminar proyecto ─── */}
      {modalEliminar && (
        <ModalEliminarProyecto
          nombre={proyecto.cliente.nombreComercial}
          onConfirmar={handleEliminarProyecto}
          onCerrar={() => setModalEliminar(false)}
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
          <InfoCard titulo="Links del cliente" icono={<Link2 size={14} />} fullWidth>
            <LinksClienteEditor
              links={proyecto.linksCliente || {}}
              onGuardar={async (cambios) => { await actualizarLinks(proyecto.slug, cambios); await refresh() }}
            />
          </InfoCard>

          <InfoCard titulo="Carpeta de Drive" icono={<FolderOpen size={14} />}>
            {proyecto.driveRespuestasId ? (
              <>
                <div className="text-sm text-emerald-700 flex items-center gap-1.5 mb-2">
                  <Check size={13} /> Carpeta creada
                </div>
                <a
                  href={`https://drive.google.com/drive/folders/${proyecto.driveRespuestasId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-brand-700 hover:text-brand-800 underline decoration-dotted flex items-center gap-1 w-fit"
                >
                  Abrir en Drive <ExternalLink size={11} />
                </a>
              </>
            ) : (
              <>
                <p className="text-sm text-slate-400 mb-2">Este proyecto todavía no tiene carpeta de Drive.</p>
                <button
                  onClick={handleCrearDrive}
                  disabled={driveEstado === 'cargando'}
                  className="text-xs bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-slate-900 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
                >
                  {driveEstado === 'cargando'
                    ? <><Loader2 size={12} className="animate-spin" /> Generando...</>
                    : <><FolderOpen size={12} /> Generar carpeta de Drive</>
                  }
                </button>
                {driveEstado === 'error' && (
                  <div className="text-xs text-red-500 mt-1.5">{driveError}</div>
                )}
              </>
            )}
          </InfoCard>

          <InfoCard titulo="Equipo asignado" icono={<Users size={14} />}>
            {editandoEquipo ? (
              <EquipoEditor
                equipo={proyecto.equipo}
                miembros={miembros}
                onGuardar={handleGuardarEquipo}
                onCancelar={() => setEditandoEquipo(false)}
              />
            ) : (
              <>
                <InfoRow label="Copy" valor={nombreEquipo(proyecto.equipo.copy, miembrosPorId)} />
                <InfoRow label="Diseñador" valor={nombreEquipo(proyecto.equipo.disenador, miembrosPorId)} />
                <InfoRow label="Programador" valor={nombreEquipo(proyecto.equipo.programador, miembrosPorId)} />
                <InfoRow label="Coordinador" valor={nombreEquipo(proyecto.equipo.adminProyecto, miembrosPorId)} />
                <button onClick={() => setEditandoEquipo(true)} className="text-xs text-brand-700 hover:text-brand-800 font-medium mt-1">
                  Editar equipo
                </button>
              </>
            )}
          </InfoCard>

          <InfoCard titulo="Configuración técnica" icono={<Settings2 size={14} />}>
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

          <InfoCard titulo="Extras contratados" icono={<Sparkles size={14} />}>
            {proyecto.proyecto.extras.length === 0
              ? <p className="text-sm text-slate-400">Sin extras</p>
              : proyecto.proyecto.extras.map((e) => (
                <div key={e} className="text-sm text-slate-700 flex items-center gap-2">
                  <Check size={13} className="text-brand-600 shrink-0" /> {e}
                </div>
              ))
            }
          </InfoCard>

          <InfoCard titulo="Participantes del cliente" icono={<UserCircle2 size={14} />}>
            {!proyecto.cliente.participantes?.length
              ? <p className="text-sm text-slate-400">Solo el contacto principal</p>
              : proyecto.cliente.participantes.map((p, i) => (
                <div key={i} className="text-sm">
                  <span className="font-medium text-slate-700">{p.nombre}</span>
                  <span className="text-slate-400"> · {p.rol}</span>
                </div>
              ))
            }
          </InfoCard>
        </div>
      )}

      {/* ─── Tab: Prototipos ─── */}
      {tab === 'prototipos' && (
        <PrototiposPanel proyectoSlug={proyecto.slug} proyectoNombre={proyecto.cliente.nombreComercial} />
      )}

      {/* ─── Tab: Log ─── */}
      {tab === 'log' && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800 mb-4">
            <Clock3 size={14} className="text-slate-400" /> Registro de actividad
          </h3>
          <div className="relative">
            <div className="absolute left-[5px] top-1.5 bottom-1.5 w-px bg-slate-200" />
            <div className="space-y-5">
              {[...proyecto.log].reverse().map((entry) => (
                <div key={entry.id} className="relative pl-6">
                  <div className="absolute left-0 top-1 w-2.5 h-2.5 rounded-full bg-brand-400 ring-4 ring-white" />
                  <div className="flex items-baseline justify-between gap-3 flex-wrap">
                    <div className="text-sm text-slate-800">
                      <span className="font-semibold">{entry.usuario}</span> — {entry.accion}
                    </div>
                    <div className="text-xs text-slate-400 shrink-0">{formatFechaHora(entry.fecha)}</div>
                  </div>
                  {entry.detalle && <div className="text-xs text-slate-500 mt-0.5">{entry.detalle}</div>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}

function TareaRow({ tarea: t, estado, avatares = {}, equipo, miembrosPorId = {}, onCompletar, onReabrir, onOmitir, onEditar, onEliminar, esAdmin }) {
  const [expandida, setExpandida] = useState(false)
  const [confirmarEliminar, setConfirmarEliminar] = useState(false)
  const [copiadoPlantilla, setCopiadoPlantilla] = useState(false)
  const responsableInfo = infoResponsable(t, equipo, miembrosPorId)
  const hayDetalle = t.queHacer || t.necesitasAntes || t.plantillaMensaje || t.queEntregas || t.descripcion || t.instruccionesCliente
  const sinResponsableClaro = !t.esCliente && responsableInfo.label === 'Equipo'

  function copiarPlantilla() {
    navigator.clipboard.writeText(t.plantillaMensaje)
    setCopiadoPlantilla(true)
    setTimeout(() => setCopiadoPlantilla(false), 2000)
  }

  const iconMap = {
    completada: <CheckCircle2 size={18} className="text-emerald-500 shrink-0" />,
    en_proceso: <PlayCircle size={18} className="text-brand-600 shrink-0" />,
    disponible: <Circle size={18} className="text-slate-300 shrink-0" />,
    bloqueada_dependencia: <Lock size={18} className="text-slate-300 shrink-0" />,
    bloqueada_cliente: <AlertCircle size={18} className="text-amber-400 shrink-0" />,
    omitida: <XCircle size={18} className="text-slate-300 shrink-0" />,
  }

  const bgMap = {
    completada: 'bg-emerald-50',
    en_proceso: 'bg-brand-50',
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
            {estado !== 'completada' && estado !== 'omitida' && !t.esCliente && (
              sinResponsableClaro ? (
                <span className="flex items-center gap-1 text-[10px] font-medium uppercase px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700" title="No tiene un rol o persona específica asignada — le aparece a todo el equipo del proyecto en Mis tareas">
                  <AlertTriangle size={10} /> Sin responsable
                </span>
              ) : (
                <span className="text-[10px] font-medium uppercase px-1.5 py-0.5 rounded-full bg-brand-100 text-brand-800">
                  {responsableInfo.label}{responsableInfo.nombre ? ` — ${responsableInfo.nombre}` : ''}
                </span>
              )
            )}
            {t.esCliente && (
              <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Cliente</span>
            )}
            {t.esRutaCritica && (
              <span className="text-xs bg-brand-100 text-brand-800 px-2 py-0.5 rounded-full">Ruta crítica</span>
            )}
            {t.soloKarlaOAdmin && (
              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Solo Karla/Admin</span>
            )}
            {t.custom && (
              <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">Personalizada</span>
            )}
          </div>

          {estado === 'completada' && t.completadaPor && (
            <div className="flex items-center gap-1.5 text-sm text-slate-400 mt-1">
              <Avatar nombre={t.completadaPor} avatarUrl={avatares[t.completadaPor]} size={17} />
              Completada por {t.completadaPor} · {formatFechaHora(t.completadaEn)}
            </div>
          )}
          {estado === 'completada' && (t.respuestaTexto || t.respuestaArchivoUrl) && (
            <div className="mt-1.5 text-sm bg-brand-50 border border-brand-100 rounded-lg px-2.5 py-2 space-y-1">
              {t.respuestaTexto && <p className="text-slate-700">{t.respuestaTexto}</p>}
              {t.respuestaArchivoUrl && (
                <a href={t.respuestaArchivoUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-brand-700 hover:text-brand-800 font-medium">
                  <ExternalLink size={13} /> {t.respuestaArchivoNombre || 'Archivo adjunto'}
                </a>
              )}
            </div>
          )}
          {estado === 'en_proceso' && (
            <div className="flex items-center gap-1.5 text-sm text-brand-700 mt-1">
              {t.asignadoA && <Avatar nombre={t.asignadoA} avatarUrl={avatares[t.asignadoA]} size={17} />}
              {t.asignadoA ? `En proceso — ${t.asignadoA}` : 'En proceso'}
            </div>
          )}

          {hayDetalle && (
            <button
              onClick={() => setExpandida(!expandida)}
              className="text-sm text-slate-400 hover:text-slate-600 mt-1.5 flex items-center gap-1"
            >
              <Info size={13} />
              {expandida ? 'Ocultar' : 'Ver detalles'}
            </button>
          )}

          {expandida && hayDetalle && (
            <div className="mt-2 rounded-xl border border-brand-100 bg-brand-50 overflow-hidden">
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
                      onClick={copiarPlantilla}
                      className="absolute top-2 right-2 p-1.5 rounded-md bg-slate-100 hover:bg-brand-100 text-slate-500 hover:text-brand-700 transition-colors"
                      title="Copiar plantilla"
                    >
                      {copiadoPlantilla ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
                    </button>
                  </div>
                </DetalleSeccion>
              )}
              {t.queEntregas && (
                <DetalleSeccion titulo="Al completar esta tarea entrego">
                  <TextoFormateado texto={t.queEntregas} />
                </DetalleSeccion>
              )}
              {!t.queHacer && !t.necesitasAntes && !t.plantillaMensaje && !t.queEntregas && (
                <div className="px-4 py-3 text-sm text-slate-600">
                  {t.esCliente ? t.instruccionesCliente : t.descripcion}
                </div>
              )}
            </div>
          )}
        </div>

        {esAdmin && (
          <div className="flex items-center gap-1 shrink-0">
            {(estado === 'disponible' || estado === 'en_proceso') && (
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

            {estado !== 'omitida' && (
              <button
                onClick={onEditar}
                className="p-1.5 text-slate-300 hover:text-brand-700 hover:bg-brand-50 rounded-lg transition-colors"
                title="Editar tarea"
              >
                <Pencil size={13} />
              </button>
            )}

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

function ModalEditarTarea({ tarea, miembrosProyecto = [], todasLasTareas = [], onGuardar, onCerrar }) {
  const [form, setForm] = useState({
    titulo: tarea.titulo,
    descripcion: tarea.esCliente ? '' : (tarea.descripcion || ''),
    instruccionesCliente: tarea.esCliente ? (tarea.instruccionesCliente || '') : '',
    responsable: tarea.responsable,
    esCliente: tarea.esCliente,
    esRutaCritica: tarea.esRutaCritica,
    soloKarlaOAdmin: tarea.soloKarlaOAdmin,
    plazoHoras: tarea.plazoHoras || '',
    dependencias: tarea.dependencias || [],
  })
  const opcionesDependencia = todasLasTareas.filter((t) => t.id !== tarea.id)

  function handleSubmit(e) {
    e.preventDefault()
    if (!form.titulo.trim()) return
    onGuardar({ ...form, plazoHoras: form.plazoHoras ? Number(form.plazoHoras) : null })
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
            <input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} className={inputCls} autoFocus />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Responsable</label>
            <select value={form.responsable} onChange={(e) => setForm({ ...form, responsable: e.target.value })} className={inputCls}>
              <optgroup label="Rol">
                {RESPONSABLES.map((r) => <option key={r.valor} value={r.valor}>{r.label}</option>)}
              </optgroup>
              {miembrosProyecto.length > 0 && (
                <optgroup label="Persona específica">
                  {miembrosProyecto.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                </optgroup>
              )}
            </select>
          </div>

          {!form.esCliente && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Descripción interna</label>
              <textarea value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} className={inputCls + ' resize-none'} rows={3} placeholder="Instrucciones para el equipo..." />
            </div>
          )}

          {form.esCliente && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Instrucciones para el cliente</label>
              <textarea value={form.instruccionesCliente} onChange={(e) => setForm({ ...form, instruccionesCliente: e.target.value })} className={inputCls + ' resize-none'} rows={4} placeholder="Texto que verá el cliente..." />
            </div>
          )}

          <div className="flex gap-4 flex-wrap">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.esCliente} onChange={(e) => setForm({ ...form, esCliente: e.target.checked })} className="accent-brand-500" />
              Tarea del cliente
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.esRutaCritica} onChange={(e) => setForm({ ...form, esRutaCritica: e.target.checked })} className="accent-brand-500" />
              Ruta crítica
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.soloKarlaOAdmin} onChange={(e) => setForm({ ...form, soloKarlaOAdmin: e.target.checked })} className="accent-brand-500" />
              Solo Karla/Admin
            </label>
          </div>

          {form.esCliente && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Plazo sugerido (horas)</label>
              <input type="number" value={form.plazoHoras} onChange={(e) => setForm({ ...form, plazoHoras: e.target.value })} className={inputCls} placeholder="48" min="1" />
            </div>
          )}

          <SelectorDependencias
            opciones={opcionesDependencia}
            seleccionadas={form.dependencias}
            onChange={(dependencias) => setForm({ ...form, dependencias })}
          />

          <div className="flex gap-3 pt-2">
            <button type="submit" className="flex-1 bg-brand-500 hover:bg-brand-600 text-slate-900 py-2.5 rounded-lg text-sm font-semibold transition-colors">
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

// Checklist para elegir de qué tareas depende otra: mientras no estén todas
// completadas, la tarea queda bloqueada (oculta al cliente si es tarea suya).
function SelectorDependencias({ opciones, seleccionadas, onChange }) {
  if (opciones.length === 0) return null

  function toggle(id) {
    onChange(seleccionadas.includes(id) ? seleccionadas.filter((d) => d !== id) : [...seleccionadas, id])
  }

  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1.5">
        Depende de <span className="font-normal text-slate-400">(no queda disponible hasta que se completen)</span>
      </label>
      <div className="border border-slate-200 rounded-lg max-h-40 overflow-y-auto divide-y divide-slate-50">
        {opciones.map((t) => (
          <label key={t.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-slate-50">
            <input type="checkbox" checked={seleccionadas.includes(t.id)} onChange={() => toggle(t.id)} className="accent-brand-500 shrink-0" />
            <span className="truncate text-slate-700">{t.titulo}</span>
            {t.esCliente && <span className="ml-auto text-[10px] shrink-0 bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">Cliente</span>}
          </label>
        ))}
      </div>
    </div>
  )
}

function ModalNuevaTarea({ contexto, miembrosProyecto = [], todasLasTareas = [], onGuardar, onCerrar }) {
  const esContinuo = typeof contexto === 'string'
  const [form, setForm] = useState({
    titulo: '',
    descripcion: '',
    instruccionesCliente: '',
    responsable: 'equipo',
    esCliente: false,
    plazoHoras: '',
    columna: esContinuo ? contexto : 'todo',
    dependencias: [],
  })

  function handleSubmit(e) {
    e.preventDefault()
    if (!form.titulo.trim()) return
    onGuardar({
      fase: esContinuo ? undefined : contexto,
      columna: esContinuo ? form.columna : undefined,
      titulo: form.titulo.trim(),
      descripcion: form.descripcion,
      instruccionesCliente: form.instruccionesCliente,
      responsable: form.esCliente ? 'cliente' : form.responsable,
      esCliente: form.esCliente,
      plazoHoras: form.plazoHoras ? Number(form.plazoHoras) : null,
      dependencias: form.dependencias,
    })
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onCerrar}>
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h3 className="font-semibold text-slate-800">{esContinuo ? 'Nueva tarjeta' : `Nueva tarea — Fase ${contexto}`}</h3>
          <button onClick={onCerrar} className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Título *</label>
            <input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} className={inputCls} placeholder="Nombre de la tarea..." autoFocus />
          </div>

          {esContinuo && !form.esCliente && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Columna</label>
              <select value={form.columna} onChange={(e) => setForm({ ...form, columna: e.target.value })} className={inputCls}>
                {KANBAN_COLUMNAS.map((c) => <option key={c.columna} value={c.columna}>{c.label}</option>)}
              </select>
            </div>
          )}

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={form.esCliente} onChange={(e) => setForm({ ...form, esCliente: e.target.checked })} className="accent-brand-500" />
            Es una tarea del cliente
          </label>

          {!form.esCliente && (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Responsable</label>
                <select value={form.responsable} onChange={(e) => setForm({ ...form, responsable: e.target.value })} className={inputCls}>
                  <optgroup label="Rol">
                    {RESPONSABLES.filter(r => r.valor !== 'cliente').map((r) => <option key={r.valor} value={r.valor}>{r.label}</option>)}
                  </optgroup>
                  {miembrosProyecto.length > 0 && (
                    <optgroup label="Persona específica">
                      {miembrosProyecto.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                    </optgroup>
                  )}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Descripción interna</label>
                <textarea value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} className={inputCls + ' resize-none'} rows={3} placeholder="¿Qué hay que hacer exactamente?" />
              </div>
            </>
          )}

          {form.esCliente && (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Instrucciones para el cliente</label>
                <textarea value={form.instruccionesCliente} onChange={(e) => setForm({ ...form, instruccionesCliente: e.target.value })} className={inputCls + ' resize-none'} rows={4} placeholder="Texto que verá el cliente en su portal..." />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Plazo sugerido (horas)</label>
                <input type="number" value={form.plazoHoras} onChange={(e) => setForm({ ...form, plazoHoras: e.target.value })} className={inputCls} placeholder="48" min="1" />
              </div>
            </>
          )}

          <SelectorDependencias
            opciones={todasLasTareas}
            seleccionadas={form.dependencias}
            onChange={(dependencias) => setForm({ ...form, dependencias })}
          />

          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={!form.titulo.trim()} className="flex-1 bg-brand-500 hover:bg-brand-600 disabled:opacity-40 text-slate-900 py-2.5 rounded-lg text-sm font-semibold transition-colors">
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

const inputCls = 'w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent placeholder:text-slate-400'

function InfoCard({ titulo, icono, children, fullWidth }) {
  return (
    <div className={`bg-white rounded-xl border border-slate-200 p-5 ${fullWidth ? 'col-span-2' : ''}`}>
      <h3 className="flex items-center gap-2 font-semibold text-slate-800 mb-3 text-sm">
        {icono && <span className="text-slate-400">{icono}</span>}
        {titulo}
      </h3>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function nombreEquipo(valor, miembrosPorId) {
  if (!valor) return null
  if (valor === EQUIPO_NO_APLICA) return 'No aplica'
  return miembrosPorId[valor] || '—'
}

// Personas ya asignadas al proyecto (Copy/Diseñador/Programador/Coordinador),
// para poder asignarles una tarea directamente sin depender de su rol.
const ROLES_EQUIPO_FORM = [
  ['copy', 'Copy'],
  ['disenador', 'Diseñador'],
  ['programador', 'Programador'],
  ['adminProyecto', 'Coordinador'],
]

function EquipoEditor({ equipo, miembros, onGuardar, onCancelar }) {
  const [form, setForm] = useState({
    copy: equipo.copy || '',
    disenador: equipo.disenador || '',
    programador: equipo.programador || '',
    adminProyecto: equipo.adminProyecto || '',
  })
  const [guardando, setGuardando] = useState(false)

  async function handleGuardar(e) {
    e.preventDefault()
    setGuardando(true)
    try {
      await onGuardar({
        copy: form.copy || null,
        disenador: form.disenador || null,
        programador: form.programador || null,
        adminProyecto: form.adminProyecto || null,
      })
    } finally {
      setGuardando(false)
    }
  }

  return (
    <form onSubmit={handleGuardar} className="space-y-2">
      {ROLES_EQUIPO_FORM.map(([key, label]) => (
        <div key={key} className="flex items-center gap-2">
          <label className="text-xs text-slate-500 w-24 shrink-0">{label}</label>
          <select
            value={form[key]}
            onChange={(e) => setForm({ ...form, [key]: e.target.value })}
            className="flex-1 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-brand-400"
          >
            <option value="">Por asignar</option>
            {key === 'programador' && <option value={EQUIPO_NO_APLICA}>No aplica</option>}
            {miembros.map((m) => (
              <option key={m.id} value={m.id}>{m.nombre}</option>
            ))}
          </select>
        </div>
      ))}
      <div className="flex items-center gap-2 pt-1">
        <button type="submit" disabled={guardando} className="text-xs bg-brand-500 hover:bg-brand-600 disabled:opacity-60 text-slate-900 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5">
          {guardando ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Guardar
        </button>
        <button type="button" onClick={onCancelar} className="text-xs text-slate-500 hover:text-slate-700 px-2">Cancelar</button>
      </div>
    </form>
  )
}

const LINK_LABELS = {
  drive: { label: 'Carpeta Drive', placeholder: 'https://drive.google.com/...' },
  brief: { label: 'Brief (Google Docs)', placeholder: 'https://docs.google.com/...' },
  boceto: { label: 'Boceto', placeholder: 'https://docs.google.com/... o link del boceto' },
  diseno: { label: 'Sitio para revisión', placeholder: 'https://staging.ejemplo.com' },
}

function LinksClienteEditor({ links, onGuardar }) {
  const [form, setForm] = useState({ drive: links.drive || '', brief: links.brief || '', boceto: links.boceto || '', diseno: links.diseno || '' })
  const [guardado, setGuardado] = useState(false)

  useEffect(() => {
    setForm({ drive: links.drive || '', brief: links.brief || '', boceto: links.boceto || '', diseno: links.diseno || '' })
  }, [links])

  async function handleGuardar(e) {
    e.preventDefault()
    await onGuardar(form)
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
            className="flex-1 border border-slate-200 rounded-lg px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-brand-400 placeholder:text-slate-300"
          />
          {form[tipo] && (
            <a href={form[tipo]} target="_blank" rel="noopener noreferrer" className="text-slate-300 hover:text-brand-700 shrink-0">
              <ExternalLink size={13} />
            </a>
          )}
        </div>
      ))}

      <div className="flex items-center gap-2 pt-1 flex-wrap">
        <button type="submit" className="text-xs bg-brand-500 hover:bg-brand-600 text-slate-900 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5">
          {guardado ? <><Check size={12} /> Guardado</> : <><Link2 size={12} /> Guardar links</>}
        </button>
      </div>
    </form>
  )
}

function ModalEliminarProyecto({ nombre, onConfirmar, onCerrar }) {
  const [texto, setTexto] = useState('')
  const [eliminando, setEliminando] = useState(false)
  const confirmado = texto.trim() === nombre

  async function handleSubmit(e) {
    e.preventDefault()
    if (!confirmado) return
    setEliminando(true)
    try {
      await onConfirmar()
    } catch {
      setEliminando(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onCerrar}>
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h3 className="flex items-center gap-2 font-semibold text-red-600"><AlertTriangle size={17} /> Eliminar proyecto</h3>
          <button onClick={onCerrar} className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <p className="text-sm text-slate-600">
            Esta acción es <span className="font-semibold text-red-600">permanente</span> y elimina el proyecto, sus tareas y su historial. No se puede deshacer.
          </p>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Escribe <span className="font-semibold">{nombre}</span> para confirmar
            </label>
            <input
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-red-300 focus:border-transparent"
              autoFocus
            />
          </div>
          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={!confirmado || eliminando}
              className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white py-2.5 rounded-lg text-sm font-semibold transition-colors"
            >
              {eliminando ? 'Eliminando...' : 'Eliminar proyecto'}
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
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder={info.placeholder} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-400 placeholder:text-slate-400" autoFocus />
          </div>
          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={!url.trim()} className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white py-2.5 rounded-lg text-sm font-semibold transition-colors">
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

function DetalleSeccion({ titulo, children }) {
  return (
    <div className="px-4 pt-3 pb-1">
      <div className="text-xs font-semibold text-brand-800 uppercase tracking-wide mb-1.5">{titulo}</div>
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
