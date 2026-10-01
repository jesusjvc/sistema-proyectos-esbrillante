import { useState, useEffect } from 'react'
import { Check, Copy, Flag, Link2, ListPlus, Pencil, PlayCircle, Plus, Settings2, User, X } from 'lucide-react'
import ModalDetalleTarea from './ModalDetalleTarea'
import HiloComentarios from './HiloComentarios'
import AdjuntosTarea from './AdjuntosTarea'
import EditorEnriquecido from './EditorEnriquecido'
import TextoEnriquecido from './TextoEnriquecido'
import SelectorResponsableRapido from './SelectorResponsableRapido'
import SelectorDependencias from './SelectorDependencias'
import Avatar from './Avatar'
import { PopoverRapido, PrioridadRapida, FechaRapida } from './TablaTareasContinuas'
import { KANBAN_COLUMNAS } from '../data/kanban'
import { MODULOS_CLIENTE } from '../data/modulosCliente'
import { infoResponsable } from '../lib/permisos'

const ESTADO_LABEL = {
  pendiente: 'Por hacer',
  disponible: 'Disponible',
  en_proceso: 'En proceso',
  completada: 'Completada',
  omitida: 'Omitida',
  bloqueada_dependencia: 'Bloqueada',
  bloqueada_cliente: 'Esperando al cliente',
}

// Tarjeta de tarea estilo Trello: UNA sola tarjeta para crear, ver y editar.
//
// modo="tarea" (default): todo editable en sitio con guardado inmediato por
// campo (cada cambio dispara onActualizar → PUT parcial) — no existe un
// "modo edición" con formulario. El padre resuelve la tarea fresca en cada
// render (patrón de identidad de MisTareas) y se auto-cierra si desaparece.
//
// modo="nueva": la misma tarjeta como borrador — título, responsable,
// prioridad, fecha, dependencias, flags, cliente y descripción disponibles
// desde el inicio (locales, sin PUT); "Crear tarea" hace el POST con todo y
// el padre abre la tarjeta viva de la tarea recién nacida.
//
// puedeEditar=false (equipo sin admin) la muestra de solo lectura con
// comentarios; el server valida permisos en cada PUT de todas formas.
export default function TarjetaTarea({
  tarea,
  modo = 'tarea',
  contexto,        // modo nueva: número de fase (finito) o columna (continuo)
  contextoLabel,   // modo nueva: "Fase 2 — Desarrollo" | "En Doing"
  estado,
  slug,
  puedeEditar,
  esAdmin,
  equipo,
  miembros = [],
  miembrosPorId = {},
  avatares = {},
  todasLasTareas = [],
  onCerrar,
  onActualizar, // async (tareaId, cambios) => bool
  onComentar,   // async (tareaId, texto, mencionados)
  onAsignar,    // async (tareaId, personaId)
  onCompletar,
  onReabrir,
  onRefrescar,
  onCrear,       // modo nueva: async (datos) => void
}) {
  const esNueva = modo === 'nueva'
  const editable = esNueva || puedeEditar

  // Borrador del modo nueva (en modo tarea no se usa, pero el hook debe ser
  // incondicional — Rules of Hooks).
  const [borrador, setBorrador] = useState(() => ({
    titulo: '',
    descripcion: '',
    instruccionesCliente: '',
    responsable: 'equipo',
    esCliente: false,
    esRutaCritica: false,
    soloKarlaOAdmin: false,
    plazoHoras: '',
    dependencias: [],
    prioridad: null,
    fechaLimite: null,
    modulo: null,
    columna: typeof contexto === 'string' ? contexto : 'todo',
  }))

  const [titulo, setTitulo] = useState(esNueva ? '' : tarea.titulo)
  const [editandoDescripcion, setEditandoDescripcion] = useState(esNueva)
  const [descripcionBorrador, setDescripcionBorrador] = useState('')
  const [plazoBorrador, setPlazoBorrador] = useState(esNueva ? '' : (tarea.plazoHoras ?? ''))
  const [copiadoPlantilla, setCopiadoPlantilla] = useState(false)
  const [guardado, setGuardado] = useState(null) // 'guardando' | 'ok'
  const [creando, setCreando] = useState(false)

  const t = esNueva
    ? { ...borrador, titulo, plazoHoras: plazoBorrador === '' ? null : Number(plazoBorrador), comentarios: [] }
    : tarea

  // En modo nueva no llega `tarea` — las deps van con ?. para no leer undefined.
  useEffect(() => { if (!esNueva && tarea) setTitulo(tarea.titulo) }, [tarea?.titulo, esNueva])
  useEffect(() => { if (!esNueva && tarea) setPlazoBorrador(tarea.plazoHoras ?? '') }, [tarea?.plazoHoras, esNueva])

  useEffect(() => {
    if (!guardado || guardado === 'guardando') return
    const timer = setTimeout(() => setGuardado(null), 1500)
    return () => clearTimeout(timer)
  }, [guardado])

  // En modo nueva los cambios quedan en el borrador (sin PUT); en modo tarea
  // se guardan al instante. Los controles rápidos (PrioridadRapida/FechaRapida)
  // llaman onActualizar con (tareaId, cambios) — la tarea ya es la abierta.
  async function actualizar(cambios) {
    if (esNueva) {
      setBorrador((prev) => ({ ...prev, ...cambios }))
      return true
    }
    setGuardado('guardando')
    try {
      const ok = await onActualizar(t.id, cambios)
      if (ok === false) { setGuardado(null); return false }
      setGuardado('ok')
      return true
    } catch {
      setGuardado(null)
      return false
    }
  }
  const actualizarRapido = (id, cambios) => actualizar(cambios)

  function guardarTitulo() {
    if (esNueva) return
    const limpio = titulo.trim()
    if (!limpio || limpio === t.titulo) { setTitulo(t.titulo); return }
    actualizar({ titulo: limpio })
  }

  function abrirEditorDescripcion() {
    setDescripcionBorrador(t.esCliente ? (t.instruccionesCliente || '') : (t.descripcion || ''))
    setEditandoDescripcion(true)
  }

  async function guardarDescripcion() {
    const campo = t.esCliente ? 'instruccionesCliente' : 'descripcion'
    if (esNueva) {
      setBorrador((prev) => ({ ...prev, [campo]: descripcionBorrador }))
    } else if (descripcionBorrador !== t[campo]) {
      await actualizar({ [campo]: descripcionBorrador })
    }
    setEditandoDescripcion(false)
  }

  function elegirModulo(valor) {
    const modulo = valor ? MODULOS_CLIENTE[valor] : null
    // Elegir módulo prellena las instrucciones con su plantilla (solo si están
    // vacías) y el título genérico si aún no se escribió uno.
    const cambios = { modulo: valor || null }
    if (modulo) {
      if (!borrador.instruccionesCliente?.trim() && !tarea?.instruccionesCliente?.trim()) {
        cambios.instruccionesCliente = modulo.plantilla()
      }
      if (!titulo.trim()) setTitulo(modulo.generica)
    }
    actualizar(cambios)
  }

  async function crearTarea(e) {
    e?.preventDefault?.()
    if (!titulo.trim() || creando) return
    setCreando(true)
    try {
      await onCrear({
        fase: typeof contexto === 'string' ? undefined : contexto,
        columna: typeof contexto === 'string' ? borrador.columna : undefined,
        titulo: titulo.trim(),
        descripcion: borrador.descripcion,
        instruccionesCliente: borrador.instruccionesCliente,
        responsable: borrador.esCliente ? 'cliente' : borrador.responsable,
        esCliente: borrador.esCliente,
        modulo: borrador.esCliente ? (borrador.modulo || null) : null,
        plazoHoras: borrador.plazoHoras === '' ? null : Number(borrador.plazoHoras),
        dependencias: borrador.dependencias,
        prioridad: borrador.prioridad || null,
        fechaLimite: borrador.fechaLimite || null,
        esRutaCritica: borrador.esRutaCritica || undefined,
        soloKarlaOAdmin: borrador.soloKarlaOAdmin || undefined,
      })
    } finally {
      setCreando(false)
    }
  }

  function copiarPlantilla() {
    navigator.clipboard.writeText(t.plantillaMensaje)
    setCopiadoPlantilla(true)
    setTimeout(() => setCopiadoPlantilla(false), 2000)
  }

  const responsableInfo = infoResponsable(t, equipo, miembrosPorId)
  const quienLaTiene = esNueva ? null : (estado === 'completada' ? t.completadaPor : estado === 'en_proceso' ? t.asignadoA : responsableInfo.nombre)
  const puedeReasignar = editable && !esNueva && estado !== 'completada' && estado !== 'en_proceso' && estado !== 'omitida'
  const referenciasCliente = esNueva ? [] : (t.dependencias || [])
    .map((id) => todasLasTareas.find((x) => x.id === id))
    .filter((x) => x && x.esCliente && (x.respuestaTexto || x.respuestaArchivoUrl || x.driveFolderUrl))
  const hayDetallePlantilla = !esNueva && (t.queHacer || t.necesitasAntes || t.plantillaMensaje || t.queEntregas)
  const descripcionActual = t.esCliente ? t.instruccionesCliente : t.descripcion

  const chipsCls = 'inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors hover:bg-slate-100 dark:hover:bg-ink-700 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400'

  const badges = esNueva ? (
    <span className="text-[11px] uppercase tracking-wide font-semibold text-brand-700 dark:text-brand-400">{contextoLabel || 'Nueva tarea'}</span>
  ) : (
    <>
      <span className="text-[11px] uppercase tracking-wide font-semibold text-slate-400 dark:text-ink-400">{ESTADO_LABEL[estado] || estado}</span>
      {t.esCliente && <span className="text-xs bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded-full">Cliente</span>}
      {t.esRutaCritica && <span className="text-xs bg-rose-100 dark:bg-rose-500/15 text-rose-700 dark:text-rose-300 px-2 py-0.5 rounded-full">Ruta crítica</span>}
      {t.soloKarlaOAdmin && <span className="text-xs bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full">Solo Karla/Admin</span>}
      {t.custom && <span className="text-xs bg-slate-100 dark:bg-ink-700 text-slate-500 dark:text-ink-300 px-2 py-0.5 rounded-full">Personalizada</span>}
    </>
  )

  const accionesHeader = esNueva ? null : (
    <div className="flex items-center gap-2">
      {guardado && (
        <span className={`text-[11px] font-medium flex items-center gap-1 ${guardado === 'ok' ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 dark:text-ink-400'}`}>
          {guardado === 'ok' ? <><Check size={11} /> Guardado</> : 'Guardando…'}
        </span>
      )}
      {esAdmin && (estado === 'disponible' || estado === 'en_proceso') && (
        <button
          onClick={() => { onCompletar(); onCerrar() }}
          className="flex items-center gap-1 bg-brand-500 hover:bg-brand-600 text-slate-900 text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors"
        >
          <Check size={13} /> {estado === 'en_proceso' ? 'Listo' : 'Completar'}
        </button>
      )}
      {esAdmin && estado === 'bloqueada_cliente' && (
        <button
          onClick={() => { onCompletar(); onCerrar() }}
          className="flex items-center gap-1 bg-brand-500 hover:bg-brand-600 text-slate-900 text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors"
        >
          <Check size={13} /> Marcar recibido
        </button>
      )}
      {esAdmin && estado === 'completada' && (
        <button onClick={() => { onReabrir(); onCerrar() }} className="text-xs text-slate-400 dark:text-ink-400 hover:text-slate-700 dark:hover:text-ink-300 px-2 py-1">
          Reabrir
        </button>
      )}
    </div>
  )

  const tituloInput = (
    <input
      value={titulo}
      onChange={(e) => setTitulo(e.target.value)}
      onBlur={guardarTitulo}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          if (esNueva) crearTarea()
          else e.target.blur()
        }
        if (e.key === 'Escape' && !esNueva) { setTitulo(t.titulo); e.target.blur() }
      }}
      aria-label="Título de la tarea"
      placeholder={esNueva ? 'Título de la tarea…' : undefined}
      autoFocus={esNueva}
      className="w-full bg-transparent hover:bg-slate-100 dark:hover:bg-ink-600 focus:bg-white dark:focus:bg-ink-900 focus:ring-2 focus:ring-brand-400 text-lg font-semibold text-slate-800 dark:text-ink-100 rounded-lg px-2 py-1 -ml-2 outline-none transition-colors placeholder:text-slate-300 dark:placeholder:text-ink-500"
    />
  )

  return (
    <ModalDetalleTarea
      titulo={editable ? tituloInput : t.titulo}
      badges={badges}
      accionesHeader={accionesHeader}
      onCerrar={onCerrar}
      aside={!esNueva && onComentar ? (
        <HiloComentarios comentarios={t.comentarios} miembrosPorId={miembrosPorId} onEnviar={(texto, menciones) => onComentar(t.id, texto, menciones)} variante="panel" />
      ) : null}
    >
      {/* Barra de acciones: responsable + prioridad + fecha + opciones, como Trello */}
      <div className="flex items-center gap-1 flex-wrap -mx-1">
        {!t.esCliente && (
          esNueva ? (
            <SelectorResponsableRapido miembros={miembros} onAsignar={(personaId) => actualizar({ responsable: personaId })} size={32} iconSize={14}>
              {(miembros.find((m) => m.id === (t.responsable)))?.activo !== false && miembros.find((m) => m.id === t.responsable) ? (
                <Avatar nombre={miembros.find((m) => m.id === t.responsable).nombre} avatarUrl={miembros.find((m) => m.id === t.responsable).avatarUrl} size={32} />
              ) : null}
            </SelectorResponsableRapido>
          ) : quienLaTiene || puedeReasignar ? (
            puedeReasignar ? (
              <SelectorResponsableRapido miembros={miembros} onAsignar={(personaId) => actualizar({ responsable: personaId })} size={32} iconSize={14}>
                {quienLaTiene ? <Avatar nombre={quienLaTiene} avatarUrl={avatares[quienLaTiene]} size={32} /> : null}
              </SelectorResponsableRapido>
            ) : (
              <span className="flex items-center gap-1.5" title={estado === 'completada' ? `Completada por ${quienLaTiene}` : responsableInfo.label}>
                <Avatar nombre={quienLaTiene || '?'} avatarUrl={avatares[quienLaTiene]} size={32} />
              </span>
            )
          ) : null
        )}
        {!esNueva && estado === 'en_proceso' && (
          <span className="flex items-center gap-1 text-xs text-brand-700 dark:text-brand-300 bg-brand-50 dark:bg-brand-500/10 rounded-lg px-2 py-1.5">
            <PlayCircle size={13} /> La tiene {quienLaTiene}
          </span>
        )}
        {editable ? (
          <>
            <PrioridadRapida tarea={t} onActualizar={actualizarRapido} />
            <FechaRapida tarea={t} onActualizar={actualizarRapido} />
            {esNueva && typeof contexto === 'string' && (
              <select value={borrador.columna} onChange={(e) => setBorrador((prev) => ({ ...prev, columna: e.target.value }))} className="text-xs border border-slate-200 dark:border-ink-500 rounded-lg px-2 py-1.5 bg-white dark:bg-ink-900 text-slate-600 dark:text-ink-300 outline-none focus:ring-2 focus:ring-brand-400">
                {KANBAN_COLUMNAS.map((c) => <option key={c.estado} value={c.estado}>{c.label}</option>)}
              </select>
            )}
            <PopoverRapido
              label="Opciones de la tarea"
              ancho={320}
              renderButton={({ abierto, botonRef, toggle }) => (
                <button ref={botonRef} onClick={toggle} aria-expanded={abierto} className={chipsCls + ' text-slate-600 dark:text-ink-300'}>
                  <Settings2 size={14} /> Opciones
                </button>
              )}
            >
              {() => (
                <div className="space-y-3 p-1">
                  <div>
                    <p className="px-1 pb-1.5 text-xs font-medium text-slate-500 dark:text-ink-300">Ajustes</p>
                    <label className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-sm text-slate-700 dark:text-ink-100 hover:bg-slate-50 dark:hover:bg-ink-600 cursor-pointer">
                      Ruta crítica
                      <input type="checkbox" checked={!!t.esRutaCritica} onChange={(e) => actualizar({ esRutaCritica: e.target.checked })} className="accent-brand-500" />
                    </label>
                    <label className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-sm text-slate-700 dark:text-ink-100 hover:bg-slate-50 dark:hover:bg-ink-600 cursor-pointer">
                      Solo Karla/Admin
                      <input type="checkbox" checked={!!t.soloKarlaOAdmin} onChange={(e) => actualizar({ soloKarlaOAdmin: e.target.checked })} className="accent-brand-500" />
                    </label>
                    <label className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-sm text-slate-700 dark:text-ink-100 hover:bg-slate-50 dark:hover:bg-ink-600 cursor-pointer">
                      Tarea del cliente
                      <input type="checkbox" checked={!!t.esCliente} onChange={(e) => actualizar({ esCliente: e.target.checked })} className="accent-brand-500" />
                    </label>
                    {t.esCliente && (
                      <label className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-sm text-slate-700 dark:text-ink-100 hover:bg-slate-50 dark:hover:bg-ink-600 cursor-pointer">
                        Enviar recordatorios al cliente
                        <input type="checkbox" checked={!t.avisosDesactivados} onChange={(e) => actualizar({ avisosDesactivados: !e.target.checked })} className="accent-brand-500" />
                      </label>
                    )}
                  </div>
                  {todasLasTareas.length > (esNueva ? 0 : 1) && (
                    <div className="border-t border-slate-100 dark:border-ink-500 pt-2">
                      <SelectorDependencias
                        opciones={todasLasTareas.filter((x) => x.id !== t.id)}
                        seleccionadas={t.dependencias || []}
                        onChange={(dependencias) => actualizar({ dependencias })}
                      />
                    </div>
                  )}
                </div>
              )}
            </PopoverRapido>
          </>
        ) : (
          <>
            <PrioridadRapida tarea={t} onActualizar={actualizarRapido} disabled />
            <FechaRapida tarea={t} onActualizar={actualizarRapido} disabled />
          </>
        )}
      </div>

      {/* Detalle de la plantilla (lectura) */}
      {hayDetallePlantilla && (
        <div className="rounded-xl border border-brand-100 dark:border-brand-500/20 bg-brand-50 dark:bg-brand-500/10 overflow-hidden">
          {t.queHacer && (
            <SeccionPlantilla titulo="¿Qué hay que hacer?">
              <TextoLineas texto={t.queHacer} />
            </SeccionPlantilla>
          )}
          {t.necesitasAntes && (
            <SeccionPlantilla titulo="Antes de empezar">
              <TextoLineas texto={t.necesitasAntes} />
            </SeccionPlantilla>
          )}
          {t.plantillaMensaje && (
            <SeccionPlantilla titulo="Plantilla de mensaje">
              <div className="relative">
                <pre className="text-xs text-slate-700 dark:text-ink-300 whitespace-pre-wrap font-sans bg-white dark:bg-ink-800 border border-slate-200 dark:border-ink-500 rounded-lg p-3 pr-10">{t.plantillaMensaje}</pre>
                <button
                  onClick={copiarPlantilla}
                  className="absolute top-2 right-2 p-1.5 rounded-md bg-slate-100 dark:bg-ink-700 hover:bg-brand-100 dark:hover:bg-brand-500/20 text-slate-500 dark:text-ink-300 hover:text-brand-700 dark:hover:text-brand-400 transition-colors"
                  title="Copiar plantilla"
                >
                  {copiadoPlantilla ? <Check size={13} className="text-emerald-500 dark:text-emerald-400" /> : <Copy size={13} />}
                </button>
              </div>
            </SeccionPlantilla>
          )}
          {t.queEntregas && (
            <SeccionPlantilla titulo="Al completar esta tarea entrego">
              <TextoLineas texto={t.queEntregas} />
            </SeccionPlantilla>
          )}
        </div>
      )}

      {/* Descripción / Instrucciones — editar en sitio, guardar por bloque */}
      <div>
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <div className="text-xs font-semibold text-slate-500 dark:text-ink-300 uppercase tracking-wide">
            {t.esCliente ? 'Instrucciones para el cliente' : 'Descripción'}
          </div>
          {t.esCliente && editable && (
            <select
              value={t.modulo || ''}
              onChange={(e) => elegirModulo(e.target.value)}
              className="text-[11px] border border-slate-200 dark:border-ink-500 rounded-lg px-1.5 py-0.5 bg-white dark:bg-ink-900 text-slate-500 dark:text-ink-300 outline-none focus:ring-2 focus:ring-brand-400"
              aria-label="Módulo de la solicitud"
            >
              <option value="">Sin módulo</option>
              {Object.entries(MODULOS_CLIENTE).map(([valor, m]) => <option key={valor} value={valor}>{m.label}</option>)}
            </select>
          )}
          {!t.esCliente && t.modulo && MODULOS_CLIENTE[t.modulo] && (
            <span className="text-[11px] bg-slate-100 dark:bg-ink-700 text-slate-500 dark:text-ink-300 px-2 py-0.5 rounded-full">{MODULOS_CLIENTE[t.modulo].label}</span>
          )}
          {editable && !editandoDescripcion && (
            <button onClick={abrirEditorDescripcion} className="ml-auto flex items-center gap-1 text-xs text-slate-500 dark:text-ink-300 hover:text-brand-700 dark:hover:text-brand-400 transition-colors">
              <Pencil size={12} /> Editar
            </button>
          )}
        </div>
        {editandoDescripcion ? (
          <div className="space-y-2">
            <EditorEnriquecido
              key={`${t.id || 'nueva'}-desc-${t.modulo || ''}`}
              value={descripcionBorrador}
              onChange={setDescripcionBorrador}
              placeholder={t.esCliente ? 'Texto que verá el cliente...' : 'Instrucciones para el equipo...'}
            />
            <div className="flex gap-2">
              <button onClick={guardarDescripcion} className="flex items-center gap-1 bg-brand-500 hover:bg-brand-600 text-slate-900 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors">
                <Check size={13} /> {esNueva ? 'Listo' : 'Guardar'}
              </button>
              <button onClick={() => setEditandoDescripcion(false)} className="px-3 border border-slate-200 dark:border-ink-500 text-slate-600 dark:text-ink-300 hover:bg-slate-50 dark:hover:bg-ink-600 rounded-lg text-xs transition-colors">
                Cancelar
              </button>
            </div>
          </div>
        ) : descripcionActual ? (
          <TextoEnriquecido html={descripcionActual} className="text-sm text-slate-600 dark:text-ink-300" />
        ) : editable ? (
          <button onClick={abrirEditorDescripcion} className="w-full text-left text-sm text-slate-400 dark:text-ink-400 hover:text-brand-700 dark:hover:text-brand-400 rounded-lg border border-dashed border-slate-200 dark:border-ink-500 px-3 py-2.5 transition-colors">
            + Agregar {t.esCliente ? 'instrucciones' : 'una descripción'}
          </button>
        ) : (
          <p className="text-sm text-slate-400 dark:text-ink-400">Sin descripción.</p>
        )}
      </div>

      {/* Datos de la tarea del cliente */}
      {t.esCliente && (
        <div>
          <label className="block text-xs font-semibold text-slate-500 dark:text-ink-300 uppercase tracking-wide mb-1.5">Plazo sugerido</label>
          {editable ? (
            <>
              <input
                type="number"
                min="1"
                value={plazoBorrador}
                onChange={(e) => setPlazoBorrador(e.target.value)}
                onBlur={() => {
                  if (esNueva) return
                  const valor = plazoBorrador ? Number(plazoBorrador) : null
                  if (valor !== (t.plazoHoras ?? null)) actualizar({ plazoHoras: valor })
                }}
                placeholder="48"
                className="w-24 border border-slate-200 dark:border-ink-500 rounded-lg px-2.5 py-1.5 text-sm bg-white dark:bg-ink-900 text-slate-800 dark:text-ink-100 outline-none focus:ring-2 focus:ring-brand-400 tabular-nums"
              />
              <span className="text-xs text-slate-400 dark:text-ink-400 ml-1.5">horas</span>
            </>
          ) : (
            <span className="text-sm text-slate-600 dark:text-ink-300">{t.plazoHoras ? `${t.plazoHoras} h` : '—'}</span>
          )}
        </div>
      )}

      {/* Lo que ya mandó el cliente (dependencias respondidas) */}
      {referenciasCliente.length > 0 && (
        <div className="text-sm bg-slate-50 dark:bg-ink-900 border border-slate-200 dark:border-ink-500 rounded-lg px-3 py-2.5 space-y-1.5">
          <p className="text-xs font-semibold text-slate-500 dark:text-ink-300 uppercase tracking-wide">Lo que ya mandó el cliente</p>
          {referenciasCliente.map((ref) => (
            <div key={ref.id} className="space-y-0.5">
              <p className="text-xs font-medium text-slate-600 dark:text-ink-200">{ref.titulo}</p>
              {ref.respuestaTexto && <p className="text-xs text-slate-500 dark:text-ink-300">{ref.respuestaTexto.slice(0, 200)}{ref.respuestaTexto.length > 200 ? '…' : ''}</p>}
              {ref.respuestaArchivoUrl && (
                <a href={ref.respuestaArchivoUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-brand-700 dark:text-brand-300 hover:underline">
                  <Link2 size={11} /> {ref.respuestaArchivoNombre || 'Archivo del cliente'}
                </a>
              )}
              {ref.driveFolderUrl && (
                <a href={ref.driveFolderUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-brand-700 dark:text-brand-300 hover:underline">
                  <ListPlus size={11} /> Carpeta donde subió sus archivos
                </a>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Adjuntos (equipo) */}
      {!esNueva && !t.esCliente && <AdjuntosTarea slug={slug} tarea={t} onRefrescar={onRefrescar} compacto />}

      {/* Pie del modo creación */}
      {esNueva && (
        <form onSubmit={crearTarea} className="flex items-center gap-3 pt-1">
          <button
            type="submit"
            disabled={!titulo.trim() || creando}
            className="flex items-center gap-1.5 bg-brand-500 hover:bg-brand-600 disabled:opacity-40 text-slate-900 text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            <Plus size={15} /> {creando ? 'Creando…' : 'Crear tarea'}
          </button>
          <button type="button" onClick={onCerrar} className="px-4 border border-slate-200 dark:border-ink-500 text-slate-600 dark:text-ink-300 hover:bg-slate-50 dark:hover:bg-ink-600 rounded-lg text-sm transition-colors">
            Cancelar
          </button>
          <span className="text-xs text-slate-400 dark:text-ink-400 ml-auto hidden sm:block">Enter en el título también crea</span>
        </form>
      )}
    </ModalDetalleTarea>
  )
}

// Secciones de solo lectura que vienen de la plantilla del paquete.
function SeccionPlantilla({ titulo, children }) {
  return (
    <div className="px-4 pt-3 pb-1 first:pt-2">
      <div className="text-xs font-semibold text-brand-800 dark:text-brand-400 uppercase tracking-wide mb-1.5">{titulo}</div>
      {children}
    </div>
  )
}

function TextoLineas({ texto }) {
  return (
    <div className="text-xs text-slate-700 dark:text-ink-300 space-y-0.5">
      {texto.split('\n').map((linea, i) => (
        <div key={i} className={linea === '' ? 'h-1' : ''}>
          {linea}
        </div>
      ))}
    </div>
  )
}
