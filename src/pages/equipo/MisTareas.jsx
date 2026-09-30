import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import Layout from '../../components/Layout'
import Avatar from '../../components/Avatar'
import SelectorResponsableRapido from '../../components/SelectorResponsableRapido'
import ModalDetalleTarea from '../../components/ModalDetalleTarea'
import gifFalta from '../../assets/gif-falta.gif'
import AdjuntosTarea from '../../components/AdjuntosTarea'
import { PrioridadRapida, FechaRapida } from '../../components/TablaTareasContinuas'
import { useAuth } from '../../context/AuthContext'
import { getProyectos, getMiembros, iniciarTarea, completarTarea, editarTarea } from '../../data/api'
import { formatFechaHora } from '../../data/storage'
import { useEventosGlobal } from '../../hooks/useEventos'
import { tareaLeCorresponde, tareaAsignadaDirectamente, miembrosDelEquipo, idsDeRol, RESPONSABLE_LABEL } from '../../lib/permisos'
import TextoEnriquecido from '../../components/TextoEnriquecido'
import { CheckCircle2, ChevronRight, PlayCircle, Lock, ChevronDown, ChevronUp, UserX, Paperclip, FolderOpen } from 'lucide-react'

// Roles que se resuelven contra el equipo del proyecto — una tarea con uno de
// estos roles y NADIE cubriéndolo en el proyecto está igual "al aire" que una
// con responsable "equipo".
const ROLES_CON_PERSONA = ['copy', 'disenador', 'programador', 'redes']

// Urgente primero, luego por fecha límite más próxima (sin fecha al final).
const ORDEN_PRIORIDAD = { urgente: 0, normal: 1, cuando_se_pueda: 2 }
function porPrioridad(a, b) {
  const pa = ORDEN_PRIORIDAD[a.prioridad] ?? 1
  const pb = ORDEN_PRIORIDAD[b.prioridad] ?? 1
  if (pa !== pb) return pa - pb
  if (a.fechaLimite && b.fechaLimite) return new Date(a.fechaLimite) - new Date(b.fechaLimite)
  if (a.fechaLimite) return -1
  if (b.fechaLimite) return 1
  return 0
}

export default function MisTareas() {
  const { user } = useAuth()
  const [proyectos, setProyectos] = useState([])
  const [miembros, setMiembros] = useState([])
  const [cargando, setCargando] = useState(true)
  const [mostrarBloqueadas, setMostrarBloqueadas] = useState(false)
  const [mostrarRecientes, setMostrarRecientes] = useState(false)
  // 'mias' (default) | 'sinasignar' | userId de un miembro — el selector de
  // miembro solo lo ve el admin, que así puede revisar la bandeja de cada
  // persona del equipo.
  const [objetivo, setObjetivo] = useState('mias')
  // Tarea abierta en el modal-detalle: se guarda solo su identidad
  // (proyectoSlug + id) y el contenido se resuelve contra las bandejas en
  // cada render, así el modal siempre muestra la versión fresca (y se cierra
  // solo si la tarea desaparece, p. ej. al completarla).
  const [tareaAbierta, setTareaAbierta] = useState(null)

  async function cargar() {
    try {
      const [ps, ms] = await Promise.all([getProyectos(), getMiembros()])
      setProyectos(ps)
      setMiembros(ms)
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => { cargar() }, [])
  useEventosGlobal(true, cargar)

  async function handleIniciar(slug, tareaId) {
    await iniciarTarea(slug, tareaId)
    cargar()
  }

  async function handleCompletar(slug, tareaId) {
    await completarTarea(slug, tareaId)
    cargar()
  }

  // Asignación rápida desde la bandeja "Sin responsable" — pasa por la misma
  // ruta de editar tarea, así que también dispara el correo de aviso.
  async function handleAsignar(slug, tareaId, userId) {
    await editarTarea(slug, tareaId, { responsable: userId })
    cargar()
  }

  // Ajustes en línea (prioridad, fecha límite) — el server valida que la
  // tarea le corresponda a quien la edita: cada usuario ajusta lo suyo, el
  // admin lo de cualquiera. Devuelve true/false para que el popover se cierre
  // solo cuando el cambio realmente se guardó.
  async function actualizarTareaRapida(slug, tareaId, cambios) {
    try {
      await editarTarea(slug, tareaId, cambios)
      cargar()
      return true
    } catch {
      return false
    }
  }

  const esAdmin = user?.rol === 'admin' || user?.rol === 'ADMIN'
  const base = esAdmin ? '/admin' : '/equipo'

  const miembroActivo = miembros.find((m) => m.id === objetivo) || null
  const viendoOtro = objetivo !== 'mias'
  const usuarioObjetivo = objetivo === 'mias' ? user : miembroActivo
  const nombreObjetivo = objetivo === 'mias' ? user?.nombre : miembroActivo?.nombre

  const proyectosTrabajo = proyectos.filter((p) => p.status === 'activo' || p.status === 'en_pausa')

  // Bandeja de un usuario cualquiera (yo, o el miembro que el admin esté
  // revisando): en proceso, asignadas y bloqueadas por dependencias. Las
  // tareas con responsable "equipo" NO aparecen — son "al aire" hasta que
  // alguien las reciba; el admin las ve y asigna desde "Sin asignar".
  function bandejaDe(usuarioObjetivo) {
    const asignadas = []
    const bloqueadas = []
    const enProceso = []
    if (!usuarioObjetivo) return { asignadas, bloqueadas, enProceso }

    const esAdminObjetivo = usuarioObjetivo.rol === 'admin' || usuarioObjetivo.rol === 'ADMIN'
    proyectosTrabajo.forEach((p) => {
      const completadasIds = new Set(p.tareas.filter((t) => t.estado === 'completada').map((t) => t.id))
      const titulosPorId = new Map(p.tareas.map((t) => [t.id, t.titulo]))
      p.tareas.forEach((t) => {
        if (t.estado === 'completada' || t.estado === 'omitida' || t.esCliente) return
        if (t.soloKarlaOAdmin && !usuarioObjetivo.esKarla && !esAdminObjetivo) return
        // Un admin ve solo lo que tiene asignado a su persona directamente — no
        // "todo" (tareaLeCorresponde da acceso total a cualquier admin porque esa
        // función sirve para autorizar operaciones, no para armar esta bandeja).
        if (esAdminObjetivo ? !tareaAsignadaDirectamente(t, usuarioObjetivo.id) : !tareaLeCorresponde(t, p.equipo, usuarioObjetivo)) return

        if (t.estado === 'en_proceso') {
          if (t.asignadoA === usuarioObjetivo.nombre) enProceso.push({ ...t, proyectoSlug: p.slug, proyectoNombre: p.cliente.nombreComercial })
          return
        }
        const pendientes = t.dependencias.filter((d) => !completadasIds.has(d))
        if (pendientes.length) {
          bloqueadas.push({
            ...t,
            proyectoSlug: p.slug,
            proyectoNombre: p.cliente.nombreComercial,
            faltaPor: pendientes.map((d) => titulosPorId.get(d) || d),
          })
          return
        }
        // Cualquier responsable que no sea "equipo" (un rol puntual como
        // copy/disenador, o una persona asignada directamente) ya es tuyo
        // específicamente, aunque todavía no le hayas dado clic a "Empezar".
        if (t.responsable !== 'equipo') {
          // Referencias del cliente: tareas del cliente de las que esta
          // depende y que ya tienen respuesta o carpeta de Drive.
          const infoCliente = t.dependencias
            .map((id) => p.tareas.find((x) => x.id === id))
            .filter((x) => x && x.esCliente && (x.respuestaTexto || x.respuestaArchivoUrl || x.driveFolderUrl))
            .map((x) => ({ titulo: x.titulo, respuestaTexto: x.respuestaTexto, respuestaArchivoUrl: x.respuestaArchivoUrl, driveFolderUrl: x.driveFolderUrl }))
          asignadas.push({ ...t, proyectoSlug: p.slug, proyectoNombre: p.cliente.nombreComercial, infoCliente })
        }
      })
    })
    asignadas.sort(porPrioridad)
    return { asignadas, bloqueadas, enProceso }
  }

  const { asignadas: tareasAsignadas, bloqueadas: tareasBloqueadas, enProceso: tareasEnProceso } = bandejaDe(usuarioObjetivo)

  // Tareas "al aire" agrupadas por proyecto: sin responsable específico, o con
  // un rol que nadie cubre en ese proyecto. El admin las puede asignar directo
  // desde aquí con el selector rápido.
  const sinAsignarPorProyecto = proyectosTrabajo
    .map((p) => ({
      proyecto: p,
      tareas: p.tareas.filter((t) =>
        !t.esCliente && ['pendiente', 'en_proceso', 'revision'].includes(t.estado)
        && (t.responsable === 'equipo' || (ROLES_CON_PERSONA.includes(t.responsable) && idsDeRol(p.equipo, t.responsable).length === 0))),
    }))
    .filter(({ tareas }) => tareas.length > 0)
  const totalSinAsignar = sinAsignarPorProyecto.reduce((n, { tareas }) => n + tareas.length, 0)

  // Conteo de tareas por miembro para el selector del admin — cuántas hay en
  // la bandeja de cada persona (asignadas + bloqueadas + en proceso). El
  // propio admin NO aparece como chip: su bandeja ya está en "Mías", y lo
  // listáramos aparte su usuario aparecería dos veces.
  const conteoPorMiembro = new Map(
    miembros
      .filter((m) => m.activo && m.id !== user?.id)
      .map((m) => {
        const b = bandejaDe(m)
        return [m.id, b.asignadas.length + b.bloqueadas.length + b.enProceso.length]
      }),
  )
  const miembrosVisibles = miembros
    .filter((m) => m.activo && (conteoPorMiembro.get(m.id) || 0) > 0)
    .sort((a, b) => (conteoPorMiembro.get(b.id) || 0) - (conteoPorMiembro.get(a.id) || 0))

  const tareasRecientes = usuarioObjetivo
    ? proyectos
        .filter((p) => p.status !== 'cancelado')
        .flatMap((p) =>
          p.tareas
            .filter((t) => t.estado === 'completada' && t.completadaPor === usuarioObjetivo.nombre)
            .map((t) => ({ ...t, proyectoNombre: p.cliente.nombreComercial }))
        )
        .sort((a, b) => new Date(b.completadaEn) - new Date(a.completadaEn))
        .slice(0, 10)
    : []

  const titulo = objetivo === 'mias'
    ? `Hola, ${user?.nombre}`
    : objetivo === 'sinasignar'
    ? 'Tareas sin responsable'
    : `Tareas de ${miembroActivo?.nombre || ''}`

  const tareaModal = tareaAbierta
    ? [...tareasEnProceso, ...tareasAsignadas, ...tareasBloqueadas]
        .find((t) => t.proyectoSlug === tareaAbierta.proyectoSlug && t.id === tareaAbierta.id) || null
    : null
  useEffect(() => {
    if (tareaAbierta && !tareaModal) setTareaAbierta(null)
  }, [tareaAbierta, tareaModal])

  return (
    <Layout titulo={titulo}>
      <div className="max-w-2xl space-y-6">
        {esAdmin && (
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <ChipObjetivo activo={objetivo === 'mias'} onClick={() => setObjetivo('mias')}>
              Mías
            </ChipObjetivo>
            {totalSinAsignar > 0 && (
              <ChipObjetivo activo={objetivo === 'sinasignar'} onClick={() => setObjetivo('sinasignar')} tono="amber">
                <UserX size={12} /> Sin asignar ({totalSinAsignar})
              </ChipObjetivo>
            )}
            {miembrosVisibles.map((m) => (
              <ChipObjetivo key={m.id} activo={objetivo === m.id} onClick={() => setObjetivo(m.id)}>
                <Avatar nombre={m.nombre} avatarUrl={m.avatarUrl} size={18} />
                {m.nombre.split(' ')[0]} ({conteoPorMiembro.get(m.id)})
              </ChipObjetivo>
            ))}
          </div>
        )}

        {objetivo === 'sinasignar' ? (
          cargando ? (
            <div className="flex justify-center py-8"><div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" /></div>
          ) : (
            <>
              <div className="text-sm text-slate-400 dark:text-ink-400 -mt-2">
                Tareas que nadie tiene en su bandeja: quedaron con responsable "equipo" o con un rol que nadie cubre en su proyecto. Asígnalas con el círculo punteado — la persona recibe un correo de aviso.
              </div>
              {sinAsignarPorProyecto.map(({ proyecto: p, tareas }) => (
                <section key={p.id}>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide truncate">
                      {p.cliente.nombreComercial} <span className="font-normal">({tareas.length})</span>
                    </h2>
                    <Link to={`${base}/proyecto/${p.slug}`} className="text-xs text-slate-400 hover:text-slate-700 dark:hover:text-ink-100 flex items-center gap-0.5 shrink-0">
                      Ver proyecto <ChevronRight size={12} />
                    </Link>
                  </div>
                  <div className="bg-white dark:bg-ink-800 rounded-xl border border-amber-200 dark:border-amber-800 divide-y divide-slate-100 dark:divide-ink-500">
                    {tareas.map((t) => (
                      <div key={t.id} className="px-5 py-4 flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0">
                          <img src={gifFalta} alt="" className="h-7 w-7 rounded-full object-cover mt-0.5 shrink-0" />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-slate-800 dark:text-ink-100 text-sm">{t.titulo}</span>
                              {ROLES_CON_PERSONA.includes(t.responsable) && (
                                <span className="text-[10px] font-medium uppercase px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300">
                                  {RESPONSABLE_LABEL[t.responsable]} sin persona
                                </span>
                              )}
                            </div>
                            {t.descripcion && <TextoEnriquecido html={t.descripcion} className="text-sm text-slate-500 dark:text-ink-300 mt-1" />}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1.5 shrink-0">
                          <ControlesTarea t={t} slug={p.slug} onActualizar={actualizarTareaRapida} />
                          <SelectorResponsableRapido
                            miembros={miembrosDelEquipo(p.equipo, miembros)}
                            onAsignar={(userId) => handleAsignar(p.slug, t.id, userId)}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </>
          )
        ) : (
          <>
            {tareasEnProceso.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-blue-700 dark:text-blue-300 uppercase tracking-wide mb-3">
                  En proceso ({tareasEnProceso.length})
                </h2>
                <div className="bg-white dark:bg-ink-800 rounded-xl border-2 border-blue-300 dark:border-blue-700 divide-y divide-blue-100 dark:divide-blue-900/40">
                  {tareasEnProceso.map((t) => (
                    <div key={`${t.proyectoSlug}-${t.id}`} className="px-5 py-4 flex items-start justify-between gap-3 bg-blue-50/80 dark:bg-blue-500/10">
                      <div className="flex items-start gap-3 min-w-0">
                        <PlayCircle size={16} className="text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <button
                              onClick={() => setTareaAbierta({ proyectoSlug: t.proyectoSlug, id: t.id })}
                              className="font-medium text-slate-800 dark:text-ink-100 text-sm text-left hover:underline underline-offset-2 decoration-brand-400"
                            >
                              {t.titulo}
                            </button>
                            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-brand-100 text-brand-800 dark:bg-brand-500/15 dark:text-brand-300 shrink-0">{t.proyectoNombre}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        <ControlesTarea t={t} slug={t.proyectoSlug} onActualizar={actualizarTareaRapida} />
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setTareaAbierta({ proyectoSlug: t.proyectoSlug, id: t.id })}
                            className="text-sm text-slate-400 hover:text-slate-700 dark:hover:text-ink-100 flex items-center gap-0.5"
                          >
                            Ver <ChevronRight size={13} />
                          </button>
                          {!viendoOtro && (
                            <button
                              onClick={() => handleCompletar(t.proyectoSlug, t.id)}
                              className="flex items-center gap-1.5 text-sm bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg transition-colors"
                            >
                              <CheckCircle2 size={14} /> Listo
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section>
              <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
                {objetivo === 'mias' ? 'Asignadas a ti' : `Asignadas a ${nombreObjetivo}`} ({cargando ? '…' : tareasAsignadas.length})
              </h2>
              {!cargando && tareasAsignadas.length === 0 ? (
                <div className="bg-white dark:bg-ink-800 rounded-xl border border-slate-200 dark:border-ink-500 p-6 text-center text-slate-400 text-sm">
                  {objetivo === 'mias'
                    ? 'No tienes tareas asignadas por tu rol o directamente a ti ahora mismo.'
                    : `${nombreObjetivo} no tiene tareas asignadas por su rol o directamente ahora mismo.`}
                </div>
              ) : !cargando && (
                <div className="bg-white dark:bg-ink-800 rounded-xl border border-slate-200 dark:border-ink-500 divide-y divide-slate-100 dark:divide-ink-500">
                  {tareasAsignadas.map((t) => (
                    <FilaTarea key={`${t.proyectoSlug}-${t.id}`} t={t} base={base} soloVer={viendoOtro} onAbrir={(x) => setTareaAbierta({ proyectoSlug: x.proyectoSlug, id: x.id })} onActualizar={actualizarTareaRapida} onIniciar={handleIniciar} onCompletar={handleCompletar} />
                  ))}
                </div>
              )}
            </section>

            {!cargando && tareasBloqueadas.length > 0 && (
              <section>
                <button
                  onClick={() => setMostrarBloqueadas((v) => !v)}
                  className="flex items-center gap-2 text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3"
                >
                  Próximamente ({tareasBloqueadas.length})
                  {mostrarBloqueadas ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>

                {mostrarBloqueadas && (
                  <div className="bg-white dark:bg-ink-800 rounded-xl border border-slate-200 dark:border-ink-500 divide-y divide-slate-100 dark:divide-ink-500">
                    {tareasBloqueadas.map((t) => (
                      <div key={`${t.proyectoSlug}-${t.id}`} className="px-5 py-4 flex items-start justify-between gap-3 bg-slate-50/60 dark:bg-ink-900/30">
                        <div className="flex items-start gap-3 min-w-0">
                          <Lock size={13} className="text-slate-400 mt-1 shrink-0" />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <button
                                onClick={() => setTareaAbierta({ proyectoSlug: t.proyectoSlug, id: t.id })}
                                className="font-medium text-slate-600 dark:text-ink-200 text-sm text-left hover:underline underline-offset-2 decoration-brand-400"
                              >
                                {t.titulo}
                              </button>
                              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-ink-700 text-slate-600 dark:text-ink-200 shrink-0">{t.proyectoNombre}</span>
                            </div>
                            <div className="text-xs text-slate-400 dark:text-ink-400 mt-1">Falta: {t.faltaPor.join(', ')}</div>
                          </div>
                        </div>
                        <div className="shrink-0">
                          <ControlesTarea t={t} slug={t.proyectoSlug} onActualizar={actualizarTareaRapida} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            {tareasRecientes.length > 0 && (
              <section>
                <button
                  onClick={() => setMostrarRecientes((v) => !v)}
                  className="flex items-center gap-2 text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3"
                >
                  Completadas recientemente ({tareasRecientes.length})
                  {mostrarRecientes ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>

                {mostrarRecientes && (
                  <div className="bg-white dark:bg-ink-800 rounded-xl border border-slate-200 dark:border-ink-500 divide-y divide-slate-100 dark:divide-ink-500">
                    {tareasRecientes.map((t) => (
                      <div key={t.id} className="px-5 py-3 flex items-start gap-3">
                        <CheckCircle2 size={15} className="text-emerald-400 mt-0.5 shrink-0" />
                        <div>
                          <div className="text-sm text-slate-600 dark:text-ink-300 line-through">{t.titulo}</div>
                          <div className="text-xs text-slate-400 dark:text-ink-400">{t.proyectoNombre} · {formatFechaHora(t.completadaEn)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}
          </>
        )}

        {tareaModal && (
          <ModalTarea
            t={tareaModal}
            base={base}
            soloVer={viendoOtro}
            proyectos={proyectos}
            onCerrar={() => setTareaAbierta(null)}
            onActualizar={actualizarTareaRapida}
            onIniciar={handleIniciar}
            onCompletar={handleCompletar}
          />
        )}
      </div>
    </Layout>
  )
}

function ChipObjetivo({ activo, onClick, tono, children }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap shrink-0 transition-colors border ${
        activo
          ? tono === 'amber'
            ? 'bg-amber-500 text-white border-amber-500'
            : 'bg-slate-800 dark:bg-ink-600 text-white border-slate-800 dark:border-ink-600'
          : 'bg-white dark:bg-ink-800 text-slate-600 dark:text-ink-300 border-slate-200 dark:border-ink-500 hover:border-slate-300 dark:hover:border-ink-400'
      }`}
    >
      {children}
    </button>
  )
}

// Prioridad y fecha límite visibles Y ajustables en línea: cada usuario
// ordena lo suyo, el admin lo de cualquiera (el server valida permisos).
function ControlesTarea({ t, slug, onActualizar }) {
  const actualizar = (tareaId, cambios) => onActualizar(slug, tareaId, cambios)
  return (
    <div className="flex items-center gap-0.5">
      <PrioridadRapida tarea={t} onActualizar={actualizar} />
      <FechaRapida tarea={t} onActualizar={actualizar} />
    </div>
  )
}

const ESTADOS_MODAL = {
  en_proceso: { label: 'En proceso', clase: 'bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300' },
  revision: { label: 'En revisión', clase: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' },
  pendiente: { label: 'Pendiente', clase: 'bg-slate-100 text-slate-600 dark:bg-ink-700 dark:text-ink-300' },
}

// Tarjeta de la tarea estilo Trello (mismo shell que el detalle del proyecto):
// detalle completo + acciones sin salir de la bandeja.
function ModalTarea({ t, base, soloVer, proyectos = [], onCerrar, onActualizar, onIniciar, onCompletar }) {
  const est = ESTADOS_MODAL[t.estado] || ESTADOS_MODAL.pendiente
  const bloqueada = (t.faltaPor || []).length > 0

  return (
    <ModalDetalleTarea
      titulo={t.titulo}
      badges={
        <>
          <span className={`text-[10px] font-medium uppercase px-1.5 py-0.5 rounded-full shrink-0 ${est.clase}`}>{est.label}</span>
          {bloqueada && <span className="text-[10px] font-medium uppercase px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 dark:bg-ink-700 dark:text-ink-300 shrink-0">Bloqueada</span>}
        </>
      }
      onCerrar={onCerrar}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-brand-100 text-brand-800 dark:bg-brand-500/15 dark:text-brand-300">{t.proyectoNombre}</span>
        <span className="text-xs text-slate-400 dark:text-ink-400">{RESPONSABLE_LABEL[t.responsable] || 'Asignación directa'}</span>
      </div>

      {t.descripcion && (
        <div>
          <p className="text-[11px] uppercase font-medium text-slate-400 dark:text-ink-400 mb-1">Descripción</p>
          <TextoEnriquecido html={t.descripcion} className="text-sm text-slate-600 dark:text-ink-300" />
        </div>
      )}
      {t.queHacer && (
        <div>
          <p className="text-[11px] uppercase font-medium text-slate-400 dark:text-ink-400 mb-1">Qué hacer</p>
          <p className="text-sm text-slate-600 dark:text-ink-300 whitespace-pre-line">{t.queHacer}</p>
        </div>
      )}
      {t.necesitasAntes && (
        <div>
          <p className="text-[11px] uppercase font-medium text-slate-400 dark:text-ink-400 mb-1">Necesitas antes</p>
          <p className="text-sm text-slate-600 dark:text-ink-300 whitespace-pre-line">{t.necesitasAntes}</p>
        </div>
      )}
      {(t.infoCliente || []).length > 0 && (
        <div className="text-sm bg-slate-50 dark:bg-ink-900 border border-slate-200 dark:border-ink-500 rounded-lg px-3 py-2.5 space-y-1.5">
          <p className="text-xs font-semibold text-slate-500 dark:text-ink-300 uppercase tracking-wide">Lo que ya mandó el cliente</p>
          {t.infoCliente.map((ref) => (
            <div key={ref.titulo} className="space-y-0.5">
              <p className="text-xs font-medium text-slate-600 dark:text-ink-200">{ref.titulo}</p>
              {ref.respuestaTexto && <p className="text-xs text-slate-500 dark:text-ink-300">{ref.respuestaTexto.slice(0, 220)}{ref.respuestaTexto.length > 220 ? '…' : ''}</p>}
              {ref.respuestaArchivoUrl && (
                <a href={ref.respuestaArchivoUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-brand-700 dark:text-brand-300 hover:underline">
                  <Paperclip size={11} /> {ref.respuestaArchivoUrl.split('/').pop().split('?')[0] || 'Archivo del cliente'}
                </a>
              )}
              {ref.driveFolderUrl && (
                <a href={ref.driveFolderUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-brand-700 dark:text-brand-300 hover:underline">
                  <FolderOpen size={11} /> Carpeta de Drive del cliente
                </a>
              )}
            </div>
          ))}
        </div>
      )}
      {bloqueada && (
        <div className="text-sm text-slate-500 dark:text-ink-300 bg-slate-50 dark:bg-ink-900/50 rounded-lg px-3 py-2">
          Espera a que se completen: {t.faltaPor.join(', ')}
        </div>
      )}

      <AdjuntosTarea slug={t.proyectoSlug} tarea={t} compacto />

      <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-100 dark:border-ink-500 flex-wrap">
        <ControlesTarea t={t} slug={t.proyectoSlug} onActualizar={onActualizar} />
        <div className="flex items-center gap-2">
          <Link to={`${base}/proyecto/${t.proyectoSlug}`} className="text-sm text-slate-400 hover:text-slate-700 dark:hover:text-ink-100 flex items-center gap-0.5">
            Abrir proyecto <ChevronRight size={13} />
          </Link>
          {!soloVer && !bloqueada && t.estado !== 'en_proceso' && (
            <button
              onClick={() => onIniciar(t.proyectoSlug, t.id)}
              className="flex items-center gap-1.5 text-sm border border-brand-300 text-brand-700 hover:bg-brand-50 dark:hover:bg-brand-500/10 px-3 py-1.5 rounded-lg transition-colors"
            >
              <PlayCircle size={14} /> Empezar
            </button>
          )}
          {!soloVer && t.estado === 'en_proceso' && (
            <button
              onClick={() => onCompletar(t.proyectoSlug, t.id)}
              className="flex items-center gap-1.5 text-sm bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg transition-colors"
            >
              <CheckCircle2 size={14} /> Listo
            </button>
          )}
        </div>
      </div>
    </ModalDetalleTarea>
  )
}

function FilaTarea({ t, base, soloVer, onAbrir, onActualizar, onIniciar, onCompletar }) {
  return (
    <div className="px-5 py-4 flex items-start justify-between gap-3">
      <div className="flex items-start gap-3 min-w-0">
        <div className="w-2 h-2 rounded-full bg-brand-500 mt-2 shrink-0" />
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => onAbrir(t)}
              className="font-medium text-slate-800 dark:text-ink-100 text-sm text-left hover:underline underline-offset-2 decoration-brand-400"
            >
              {t.titulo}
            </button>
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-brand-100 text-brand-800 dark:bg-brand-500/15 dark:text-brand-300 shrink-0">{t.proyectoNombre}</span>
            {(t.infoCliente || []).length > 0 && (
              <button
                onClick={() => onAbrir(t)}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300 hover:bg-emerald-200 dark:hover:bg-emerald-500/25 transition-colors"
                title="El cliente ya envió la información — clic para verla"
              >
                <Paperclip size={9} /> info del cliente lista
              </button>
            )}
          </div>
          {t.descripcion && <TextoEnriquecido html={t.descripcion} className="text-sm text-slate-500 dark:text-ink-300 mt-1" />}
        </div>
      </div>
      <div className="flex flex-col items-end gap-2 shrink-0">
        <ControlesTarea t={t} slug={t.proyectoSlug} onActualizar={onActualizar} />
        <div className="flex items-center gap-2">
          <button
            onClick={() => onAbrir(t)}
            className="text-sm text-slate-400 hover:text-slate-700 dark:hover:text-ink-100 flex items-center gap-0.5"
          >
            Ver <ChevronRight size={13} />
          </button>
          {!soloVer && (
            <>
              <button
                onClick={() => onIniciar(t.proyectoSlug, t.id)}
                className="flex items-center gap-1.5 text-sm border border-brand-300 text-brand-700 hover:bg-brand-50 dark:hover:bg-brand-500/10 px-3 py-1.5 rounded-lg transition-colors"
              >
                <PlayCircle size={14} /> Empezar
              </button>
              <button
                onClick={() => onCompletar(t.proyectoSlug, t.id)}
                className="flex items-center gap-1.5 text-sm bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg transition-colors"
              >
                <CheckCircle2 size={14} /> Listo
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
