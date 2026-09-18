import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ArrowUpDown, CalendarDays, Check, ChevronLeft, ChevronRight, Flag, GripVertical, MessageCircle, Pencil, Trash2, UserX, X } from 'lucide-react'
import { KANBAN_COLUMNAS } from '../data/kanban'
import { formatFecha } from '../data/storage'
import { infoResponsable, tareaLeCorresponde } from '../lib/permisos'
import Avatar from './Avatar'
import HiloComentarios from './HiloComentarios'
import ModalDetalleTarea from './ModalDetalleTarea'
import SelectorResponsableRapido from './SelectorResponsableRapido'
import TextoEnriquecido from './TextoEnriquecido'

const ESTADO_ESTILOS = {
  pendiente: 'bg-slate-100 text-slate-600 dark:bg-ink-700 dark:text-ink-300',
  en_proceso: 'bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300',
  revision: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  completada: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
}

const PRIORIDAD = {
  urgente: { label: 'Urgente', clase: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300', icono: 'text-rose-500 fill-rose-500' },
  normal: { label: 'Normal', clase: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300', icono: 'text-blue-500 fill-blue-500' },
  cuando_se_pueda: { label: 'Cuando se pueda', clase: 'bg-slate-100 text-slate-600 dark:bg-ink-700 dark:text-ink-300', icono: 'text-slate-400 fill-slate-400' },
}

const PRIORIDAD_ORDEN = { urgente: 0, normal: 1, cuando_se_pueda: 2 }

function fechaLocal(fecha) {
  const [year, month, day] = fecha.slice(0, 10).split('-').map(Number)
  return new Date(year, month - 1, day)
}

function estaVencida(tarea) {
  if (!tarea.fechaLimite || tarea.estado === 'completada' || tarea.estado === 'done') return false
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  return fechaLocal(tarea.fechaLimite) < hoy
}

function fechaIso(fecha) {
  const year = fecha.getFullYear()
  const month = String(fecha.getMonth() + 1).padStart(2, '0')
  const day = String(fecha.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function sumarDias(base, dias) {
  const fecha = new Date(base)
  fecha.setDate(fecha.getDate() + dias)
  return fecha
}

function siguienteDia(base, diaSemana, incluirHoy = false) {
  const fecha = new Date(base)
  let diferencia = (diaSemana - fecha.getDay() + 7) % 7
  if (!incluirHoy && diferencia === 0) diferencia = 7
  fecha.setDate(fecha.getDate() + diferencia)
  return fecha
}

function inicioMes(fecha) {
  return new Date(fecha.getFullYear(), fecha.getMonth(), 1)
}

function diasDelCalendario(mes) {
  const primero = inicioMes(mes)
  const desplazamiento = (primero.getDay() + 6) % 7
  const inicio = sumarDias(primero, -desplazamiento)
  return Array.from({ length: 42 }, (_, index) => sumarDias(inicio, index))
}

function mismoDia(a, b) {
  return a && b && fechaIso(a) === fechaIso(b)
}

function nombreMes(fecha) {
  const texto = new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric' }).format(fecha)
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

function listaFlujo(tareas) {
  return KANBAN_COLUMNAS.flatMap((columna) => tareas
    .filter((tarea) => !tarea.esCliente && tarea.estado === columna.estado)
    .sort((a, b) => a.orden - b.orden))
}

function calcularPosicionPopover(boton, panel, ancho) {
  if (!boton) return { top: 0, left: 0 }
  const rect = boton.getBoundingClientRect()
  const alto = panel?.offsetHeight || 300
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - ancho - 8))
  const topAbajo = rect.bottom + 6
  const top = topAbajo + alto <= window.innerHeight - 8 ? topAbajo : Math.max(8, rect.top - alto - 6)
  return { top, left }
}

export function PopoverRapido({ label, renderButton, children, ancho = 280 }) {
  const [abierto, setAbierto] = useState(false)
  const [posicion, setPosicion] = useState({ top: 0, left: 0 })
  const botonRef = useRef(null)
  const panelRef = useRef(null)

  useLayoutEffect(() => {
    if (!abierto) return
    const posicionar = () => setPosicion(calcularPosicionPopover(botonRef.current, panelRef.current, ancho))
    posicionar()
    const frame = requestAnimationFrame(posicionar)
    return () => cancelAnimationFrame(frame)
  }, [abierto, ancho])

  useEffect(() => {
    if (!abierto) return
    const posicionar = () => setPosicion(calcularPosicionPopover(botonRef.current, panelRef.current, ancho))
    function cerrarFuera(event) {
      if (!botonRef.current?.contains(event.target) && !panelRef.current?.contains(event.target)) setAbierto(false)
    }
    function cerrarEscape(event) {
      if (event.key === 'Escape') {
        setAbierto(false)
        botonRef.current?.focus()
      }
    }
    window.addEventListener('resize', posicionar)
    window.addEventListener('scroll', posicionar, true)
    document.addEventListener('pointerdown', cerrarFuera)
    document.addEventListener('keydown', cerrarEscape)
    return () => {
      window.removeEventListener('resize', posicionar)
      window.removeEventListener('scroll', posicionar, true)
      document.removeEventListener('pointerdown', cerrarFuera)
      document.removeEventListener('keydown', cerrarEscape)
    }
  }, [abierto, ancho])

  return (
    <>
      {renderButton({ abierto, botonRef, toggle: () => setAbierto((valor) => !valor) })}
      {abierto && createPortal(
        <div
          ref={panelRef}
          role="dialog"
          aria-label={label}
          style={{ position: 'fixed', top: posicion.top, left: posicion.left, width: ancho }}
          className="z-[70] max-h-[calc(100vh-16px)] overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-xl dark:border-ink-500 dark:bg-ink-700"
        >
          {children(() => setAbierto(false))}
        </div>,
        document.body,
      )}
    </>
  )
}

export function PrioridadRapida({ tarea, onActualizar, disabled }) {
  const actual = PRIORIDAD[tarea.prioridad] || PRIORIDAD.normal
  return (
    <PopoverRapido
      label={`Cambiar prioridad de ${tarea.titulo}`}
      ancho={248}
      renderButton={({ abierto, botonRef, toggle }) => (
        <button
          ref={botonRef}
          onClick={toggle}
          disabled={disabled}
          aria-expanded={abierto}
          className={`inline-flex min-h-11 md:min-h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-medium transition-colors hover:ring-1 hover:ring-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 disabled:opacity-60 dark:hover:ring-ink-400 ${actual.clase}`}
        >
          <Flag size={13} className={actual.icono} aria-hidden="true" /> {actual.label}
        </button>
      )}
    >
      {(cerrar) => (
        <>
          <p className="px-2 pb-1.5 pt-1 text-xs font-medium text-slate-500 dark:text-ink-300">Prioridad</p>
          {Object.entries(PRIORIDAD).map(([value, opcion]) => (
            <button
              key={value}
              onClick={async () => { if (await onActualizar(tarea.id, { prioridad: value })) cerrar() }}
              className="flex min-h-10 w-full items-center gap-2 rounded-lg px-2.5 text-left text-sm text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 dark:text-ink-100 dark:hover:bg-ink-600"
            >
              <Flag size={15} className={opcion.icono} aria-hidden="true" />
              <span>{opcion.label}</span>
              {tarea.prioridad === value && <Check size={15} className="ml-auto text-brand-700 dark:text-brand-300" aria-label="Seleccionada" />}
            </button>
          ))}
        </>
      )}
    </PopoverRapido>
  )
}

export function SelectorFecha({ fechaActual, onGuardar, permitirQuitar = true }) {
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const fechaSeleccionada = fechaActual ? fechaLocal(fechaActual) : null
  const [mesVisible, setMesVisible] = useState(() => inicioMes(fechaSeleccionada || hoy))
  const opciones = [
    ['Hoy', hoy],
    ['Mañana', sumarDias(hoy, 1)],
    ['Este fin de semana', siguienteDia(hoy, 6, true)],
    ['Próxima semana', siguienteDia(hoy, 1)],
    ['En 2 semanas', sumarDias(hoy, 14)],
  ]
  const dias = diasDelCalendario(mesVisible)

  useEffect(() => {
    if (fechaActual) setMesVisible(inicioMes(fechaLocal(fechaActual)))
  }, [fechaActual])

  return (
    <div className="flex flex-col md:grid md:grid-cols-[200px_minmax(0,1fr)]">
          <div className="order-2 border-t border-slate-100 p-1 pt-2 md:order-1 md:border-r md:border-t-0 md:pr-2 md:pt-1 dark:border-ink-500">
            <p className="px-2 pb-1.5 pt-1 text-xs font-medium text-slate-500 dark:text-ink-300">Opciones rápidas</p>
            {opciones.map(([label, fecha]) => (
              <button key={label} onClick={() => onGuardar(fechaIso(fecha))} className="flex min-h-10 w-full items-center justify-between gap-2 rounded-lg px-2.5 text-left text-sm text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 dark:text-ink-100 dark:hover:bg-ink-600">
                <span>{label}</span><span className="shrink-0 text-xs text-slate-400 dark:text-ink-400">{formatFecha(fechaIso(fecha))}</span>
              </button>
            ))}
            {permitirQuitar && (
              <button onClick={() => onGuardar(null)} className="mt-1 flex min-h-10 w-full items-center gap-2 border-t border-slate-100 px-2.5 pt-2 text-left text-sm text-slate-600 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 dark:border-ink-500 dark:text-ink-300 dark:hover:text-red-400"><X size={15} /> Quitar fecha</button>
            )}
          </div>

          <div className="order-1 p-2 md:order-2 md:pl-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div>
                <p className="text-xs text-slate-400 dark:text-ink-400">Fecha límite</p>
                <p className="text-sm font-semibold text-slate-800 dark:text-ink-100">{nombreMes(mesVisible)}</p>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => setMesVisible(inicioMes(new Date()))} className="min-h-10 px-2 text-xs font-medium text-slate-500 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 dark:text-ink-300 dark:hover:text-white">Hoy</button>
                <button onClick={() => setMesVisible((mes) => new Date(mes.getFullYear(), mes.getMonth() - 1, 1))} className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 dark:text-ink-300 dark:hover:bg-ink-600" aria-label="Mes anterior"><ChevronLeft size={17} /></button>
                <button onClick={() => setMesVisible((mes) => new Date(mes.getFullYear(), mes.getMonth() + 1, 1))} className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 dark:text-ink-300 dark:hover:bg-ink-600" aria-label="Mes siguiente"><ChevronRight size={17} /></button>
              </div>
            </div>
            <div className="grid grid-cols-7 text-center text-[11px] font-medium text-slate-400 dark:text-ink-400" aria-hidden="true">
              {['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'].map((dia) => <span key={dia} className="py-1">{dia}</span>)}
            </div>
            <div className="grid grid-cols-7 gap-0.5">
              {dias.map((fecha) => {
                const seleccionada = mismoDia(fecha, fechaSeleccionada)
                const esHoy = mismoDia(fecha, hoy)
                const esDelMes = fecha.getMonth() === mesVisible.getMonth()
                const esPasado = fecha < hoy
                return (
                  <button
                    key={fechaIso(fecha)}
                    onClick={() => onGuardar(fechaIso(fecha))}
                    aria-label={new Intl.DateTimeFormat('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(fecha)}
                    aria-pressed={seleccionada}
                    className={`relative flex aspect-square min-h-9 items-center justify-center rounded-lg text-sm tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ${seleccionada ? 'bg-brand-500 font-semibold text-slate-900' : esHoy ? 'ring-1 ring-inset ring-brand-500 font-semibold text-slate-800 dark:text-ink-100' : !esDelMes ? 'text-slate-300 hover:bg-slate-50 dark:text-ink-500 dark:hover:bg-ink-600' : esPasado ? 'text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:text-ink-400 dark:hover:bg-ink-600 dark:hover:text-ink-200' : 'text-slate-700 hover:bg-slate-100 dark:text-ink-100 dark:hover:bg-ink-600'}`}
                  >
                    {fecha.getDate()}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
  )
}

export function FechaRapida({ tarea, onActualizar, disabled }) {
  return (
    <PopoverRapido
      label={`Cambiar fecha límite de ${tarea.titulo}`}
      ancho={typeof window !== 'undefined' && window.innerWidth >= 768 ? 560 : 320}
      renderButton={({ abierto, botonRef, toggle }) => (
        <button
          ref={botonRef}
          onClick={toggle}
          disabled={disabled}
          aria-expanded={abierto}
          className={`inline-flex min-h-11 md:min-h-8 items-center gap-1.5 rounded-lg px-2 text-xs tabular-nums transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 disabled:opacity-60 dark:hover:bg-ink-700 ${estaVencida(tarea) ? 'font-medium text-rose-700 dark:text-rose-300' : tarea.fechaLimite ? 'text-slate-600 dark:text-ink-300' : 'text-slate-400 dark:text-ink-400'}`}
        >
          <CalendarDays size={14} aria-hidden="true" /> {tarea.fechaLimite ? formatFecha(tarea.fechaLimite) : 'Agregar'}
        </button>
      )}
    >
      {(cerrar) => (
        <SelectorFecha
          fechaActual={tarea.fechaLimite}
          permitirQuitar={!!tarea.fechaLimite}
          onGuardar={async (fecha) => { if (await onActualizar(tarea.id, { fechaLimite: fecha || null })) cerrar() }}
        />
      )}
    </PopoverRapido>
  )
}

function Encabezado({ campo, orden, direccion, onOrdenar, children, className = '' }) {
  const activo = orden === campo
  return (
    <th className={`px-3 py-3 ${className}`} aria-sort={activo ? (direccion === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button onClick={() => onOrdenar(campo)} className={`inline-flex items-center gap-1 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ${activo ? 'text-slate-800 dark:text-ink-100' : ''}`}>
        {children}<ArrowUpDown size={12} aria-hidden="true" />
      </button>
    </th>
  )
}

function datosResponsable(tarea, equipo, miembrosPorId) {
  const info = infoResponsable(tarea, equipo, miembrosPorId)
  return { nombre: info.nombre, puedeReasignar: tarea.estado !== 'completada' && tarea.estado !== 'en_proceso' }
}

function Responsable({ tarea, equipo, miembrosPorId, miembros, avatares, onAsignar, disabled = false }) {
  const { nombre, puedeReasignar } = datosResponsable(tarea, equipo, miembrosPorId)
  const permiteReasignar = puedeReasignar && !disabled

  if (!nombre && permiteReasignar) {
    return (
      <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
        <SelectorResponsableRapido miembros={miembros} onAsignar={(personaId) => onAsignar(tarea.id, personaId)} size={44} iconSize={15} />
        <span className="text-xs">Sin asignar</span>
      </div>
    )
  }

  if (!nombre) {
    return <span className="inline-flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400"><UserX size={18} /> Sin asignar</span>
  }

  const avatar = <Avatar nombre={nombre} avatarUrl={avatares[nombre]} size={28} />
  return (
    <div className="flex items-center gap-2 min-w-0">
      {permiteReasignar ? (
        <SelectorResponsableRapido miembros={miembros} onAsignar={(personaId) => onAsignar(tarea.id, personaId)} size={44} iconSize={15}>{avatar}</SelectorResponsableRapido>
      ) : avatar}
      <span className="text-xs text-slate-600 dark:text-ink-300 truncate">{nombre}</span>
    </div>
  )
}

function EstadoSelect({ tarea, onMover, disabled }) {
  return (
    <select
      value={tarea.estado}
      onChange={(event) => onMover(tarea.id, { estado: event.target.value })}
      onClick={(event) => event.stopPropagation()}
      disabled={disabled}
      className={`h-11 md:h-8 w-full rounded-lg border-0 px-2 text-xs font-medium outline-none focus:ring-2 focus:ring-brand-400 disabled:opacity-60 ${ESTADO_ESTILOS[tarea.estado]}`}
      aria-label={`Estado de ${tarea.titulo}`}
    >
      {KANBAN_COLUMNAS.map((columna) => <option key={columna.estado} value={columna.estado}>{columna.label}</option>)}
    </select>
  )
}

function CheckboxSeleccion({ checked, indeterminate = false, onChange, label, disabled = false }) {
  const ref = useRef(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate
  }, [indeterminate])
  return (
    <label className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-md focus-within:ring-2 focus-within:ring-brand-400 md:h-8 md:w-6 ${disabled ? 'cursor-not-allowed opacity-35' : 'cursor-pointer hover:bg-slate-100 dark:hover:bg-ink-700'}`}>
      <input ref={ref} type="checkbox" checked={checked} onChange={onChange} disabled={disabled} aria-label={label} className="h-4 w-4 rounded accent-brand-500" />
    </label>
  )
}

function ContextoOrdenable({ items, disabled, onDragEnd, children }) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={disabled ? undefined : onDragEnd}>
      <SortableContext items={items} strategy={verticalListSortingStrategy}>{children}</SortableContext>
    </DndContext>
  )
}

function ElementoOrdenable({ id, disabled, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.45 : 1,
    position: 'relative',
    zIndex: isDragging ? 5 : undefined,
  }
  return children({ setNodeRef, style, isDragging, handleProps: { ...attributes, ...listeners } })
}

function AsaOrden({ tarea, disabled, handleProps }) {
  return (
    <button
      type="button"
      disabled={disabled}
      {...handleProps}
      className="flex h-11 w-11 cursor-grab items-center justify-center rounded-md text-slate-300 transition-colors hover:bg-slate-100 hover:text-slate-600 active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-35 dark:text-ink-500 dark:hover:bg-ink-700 dark:hover:text-ink-200 md:h-9 md:w-8"
      aria-label={`Reordenar ${tarea.titulo}`}
      title={disabled ? 'Vuelve al orden manual para reordenar' : 'Arrastra para reordenar'}
    >
      <GripVertical size={16} aria-hidden="true" />
    </button>
  )
}

function BarraMasiva({ tareas, miembros, procesando, onAplicar, onLimpiar, onEliminar }) {
  const todasPersonalizadas = tareas.every((tarea) => tarea.custom)
  const cantidad = tareas.length
  const claseControl = 'h-10 shrink-0 rounded-lg border border-ink-500 bg-ink-800 px-2.5 text-sm text-white outline-none focus:ring-2 focus:ring-brand-400 disabled:opacity-50'

  return createPortal(
    <div className="fixed bottom-4 left-3 right-3 z-50 mx-auto flex max-w-5xl items-center gap-2 overflow-x-auto rounded-xl bg-ink-950 px-3 py-3 text-white shadow-[0_12px_36px_rgba(15,23,42,0.3)] md:bottom-5 md:left-1/2 md:right-auto md:-translate-x-1/2" role="region" aria-label="Acciones masivas">
      <span className="shrink-0 border-r border-ink-500 pr-3 text-sm font-semibold tabular-nums">{cantidad} seleccionada{cantidad === 1 ? '' : 's'}</span>

      <select value="" onChange={(event) => event.target.value && onAplicar('estado', event.target.value)} disabled={procesando} className={claseControl} aria-label="Cambiar estado de tareas seleccionadas">
        <option value="">Estado</option>
        {KANBAN_COLUMNAS.map((columna) => <option key={columna.estado} value={columna.estado}>{columna.label}</option>)}
      </select>

      <select value="" onChange={(event) => event.target.value && onAplicar('responsable', event.target.value)} disabled={procesando} className={claseControl} aria-label="Asignar responsable a tareas seleccionadas">
        <option value="">Responsable</option>
        {miembros.map((miembro) => <option key={miembro.id} value={miembro.id}>{miembro.nombre}</option>)}
      </select>

      <select value="" onChange={(event) => event.target.value && onAplicar('prioridad', event.target.value)} disabled={procesando} className={claseControl} aria-label="Cambiar prioridad de tareas seleccionadas">
        <option value="">Prioridad</option>
        {Object.entries(PRIORIDAD).map(([value, opcion]) => <option key={value} value={value}>{opcion.label}</option>)}
      </select>

      <PopoverRapido
        label="Cambiar fecha límite de tareas seleccionadas"
        ancho={typeof window !== 'undefined' && window.innerWidth >= 768 ? 560 : 320}
        renderButton={({ abierto, botonRef, toggle }) => (
          <button ref={botonRef} onClick={toggle} disabled={procesando} aria-expanded={abierto} className={`${claseControl} inline-flex items-center gap-2`}><CalendarDays size={15} /> Fecha</button>
        )}
      >
        {(cerrar) => <SelectorFecha fechaActual={null} onGuardar={async (fecha) => { if (await onAplicar('fechaLimite', fecha)) cerrar() }} />}
      </PopoverRapido>

      <button
        onClick={onEliminar}
        disabled={procesando || !todasPersonalizadas}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-ink-300 transition-colors hover:bg-rose-500/15 hover:text-rose-300 disabled:cursor-not-allowed disabled:opacity-35"
        aria-label="Eliminar tareas seleccionadas"
        title={todasPersonalizadas ? 'Eliminar tareas seleccionadas' : 'Solo se pueden eliminar tareas personalizadas'}
      >
        <Trash2 size={16} />
      </button>
      <button onClick={onLimpiar} disabled={procesando} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-ink-300 transition-colors hover:bg-ink-800 hover:text-white disabled:opacity-50" aria-label="Cancelar selección"><X size={16} /></button>
    </div>,
    document.body,
  )
}

function Detalle({ tarea, equipo, miembrosPorId, miembros, avatares, onAsignar, onEditar, onEliminar, onComentar, onCerrar, puedeEditar }) {
  const prioridad = PRIORIDAD[tarea.prioridad] || PRIORIDAD.normal
  return (
    <ModalDetalleTarea
      titulo={tarea.titulo}
      badges={<span className={`px-2 py-0.5 rounded-full text-xs font-medium ${prioridad.clase}`}>{prioridad.label}</span>}
      accionesHeader={puedeEditar ? (
        <>
          <button onClick={() => { onCerrar(); onEditar(tarea) }} className="p-2 text-slate-400 hover:text-brand-700 dark:hover:text-brand-300 rounded-lg transition-colors" aria-label="Editar tarea"><Pencil size={16} /></button>
          {tarea.custom && <button onClick={() => { onCerrar(); onEliminar(tarea) }} className="p-2 text-slate-400 hover:text-red-600 dark:hover:text-red-400 rounded-lg transition-colors" aria-label="Eliminar tarea"><Trash2 size={16} /></button>}
        </>
      ) : null}
      onCerrar={onCerrar}
    >
      <Responsable tarea={tarea} equipo={equipo} miembrosPorId={miembrosPorId} miembros={miembros} avatares={avatares} onAsignar={onAsignar} disabled={!puedeEditar} />
      {tarea.descripcion && <TextoEnriquecido html={tarea.descripcion} className="text-sm text-slate-600 dark:text-ink-300" />}
      {tarea.fechaLimite && <p className="text-sm text-slate-500 dark:text-ink-300">Fecha límite: <span className="font-medium text-slate-700 dark:text-ink-100">{formatFecha(tarea.fechaLimite)}</span></p>}
      <HiloComentarios comentarios={tarea.comentarios} miembrosPorId={miembrosPorId} onEnviar={(texto, mencionados) => onComentar(tarea.id, texto, mencionados)} />
    </ModalDetalleTarea>
  )
}

export default function TablaTareasContinuas({ tareas, usuario, onMover, onActualizar, onAccionMasiva, onEditar, onEliminar, onComentar, onAsignar, avatares = {}, equipo, miembrosPorId = {}, miembros = [] }) {
  const [detalle, setDetalle] = useState(null)
  const [actualizando, setActualizando] = useState(null)
  const [procesandoMasivo, setProcesandoMasivo] = useState(false)
  const [error, setError] = useState('')
  const [orden, setOrden] = useState('flujo')
  const [direccion, setDireccion] = useState('asc')
  const [ordenLocal, setOrdenLocal] = useState(() => listaFlujo(tareas))
  const [seleccionadas, setSeleccionadas] = useState([])
  const baseVisibles = ordenLocal
  const estadoOrden = Object.fromEntries(KANBAN_COLUMNAS.map((columna, index) => [columna.estado, index]))
  const visibles = [...baseVisibles].sort((a, b) => {
    if (orden === 'flujo') return 0
    let resultado = 0
    if (orden === 'titulo') resultado = a.titulo.localeCompare(b.titulo, 'es')
    if (orden === 'estado') resultado = estadoOrden[a.estado] - estadoOrden[b.estado]
    if (orden === 'responsable') resultado = (datosResponsable(a, equipo, miembrosPorId).nombre || '').localeCompare(datosResponsable(b, equipo, miembrosPorId).nombre || '', 'es')
    if (orden === 'prioridad') resultado = (PRIORIDAD_ORDEN[a.prioridad] ?? 1) - (PRIORIDAD_ORDEN[b.prioridad] ?? 1)
    if (orden === 'fecha') resultado = (a.fechaLimite ? fechaLocal(a.fechaLimite).getTime() : Infinity) - (b.fechaLimite ? fechaLocal(b.fechaLimite).getTime() : Infinity)
    if (orden === 'actividad') resultado = (a.comentarios?.length || 0) - (b.comentarios?.length || 0)
    return direccion === 'asc' ? resultado : -resultado
  })
  const puedeOperar = (tarea) => tareaLeCorresponde(tarea, equipo, usuario)
  const seleccionables = visibles.filter(puedeOperar)
  const todasSeleccionadas = seleccionables.length > 0 && seleccionables.every((tarea) => seleccionadas.includes(tarea.id))
  const seleccionParcial = seleccionadas.length > 0 && !todasSeleccionadas
  const tareasSeleccionadas = tareas.filter((tarea) => seleccionadas.includes(tarea.id))
  const permiteOrdenar = orden === 'flujo' && !procesandoMasivo

  useEffect(() => {
    const nuevaLista = listaFlujo(tareas)
    setOrdenLocal(nuevaLista)
    setSeleccionadas((actuales) => actuales.filter((id) => nuevaLista.some((tarea) => tarea.id === id)))
  }, [tareas])

  function ordenarPor(campo) {
    if (orden === campo) setDireccion((actual) => actual === 'asc' ? 'desc' : 'asc')
    else {
      setOrden(campo)
      setDireccion('asc')
    }
  }

  async function mover(tareaId, datos) {
    setActualizando(tareaId)
    setError('')
    try {
      await onMover(tareaId, datos)
      return true
    } catch {
      setError('No se pudo guardar el orden o el estado. Intenta de nuevo.')
      return false
    } finally {
      setActualizando(null)
    }
  }

  async function reordenar(event) {
    const { active, over } = event
    if (!permiteOrdenar || !over || active.id === over.id) return
    const activa = ordenLocal.find((tarea) => tarea.id === active.id)
    const destino = ordenLocal.find((tarea) => tarea.id === over.id)
    if (!activa || !destino || activa.estado !== destino.estado || !puedeOperar(activa)) return

    const grupos = Object.fromEntries(KANBAN_COLUMNAS.map((columna) => [
      columna.estado,
      ordenLocal.filter((tarea) => tarea.estado === columna.estado && tarea.id !== active.id),
    ]))
    const listaOriginal = ordenLocal.filter((tarea) => tarea.estado === activa.estado)
    let listaDestino

    const indiceActivo = listaOriginal.findIndex((tarea) => tarea.id === active.id)
    const indiceDestino = listaOriginal.findIndex((tarea) => tarea.id === over.id)
    listaDestino = arrayMove(listaOriginal, indiceActivo, indiceDestino)

    grupos[destino.estado] = listaDestino
    const nuevaLista = KANBAN_COLUMNAS.flatMap((columna) => grupos[columna.estado])
    setOrdenLocal(nuevaLista)

    const posicion = listaDestino.findIndex((tarea) => tarea.id === active.id)
    const anterior = listaDestino[posicion - 1]
    const siguiente = listaDestino[posicion + 1]
    const guardado = await mover(active.id, {
      estado: destino.estado,
      antesDeTareaId: !anterior && siguiente ? siguiente.id : undefined,
      despuesDeTareaId: anterior ? anterior.id : undefined,
    })
    if (!guardado) setOrdenLocal(listaFlujo(tareas))
  }

  function alternarSeleccion(tareaId) {
    setSeleccionadas((actuales) => actuales.includes(tareaId) ? actuales.filter((id) => id !== tareaId) : [...actuales, tareaId])
  }

  function alternarTodas() {
    setSeleccionadas(todasSeleccionadas ? [] : seleccionables.map((tarea) => tarea.id))
  }

  async function aplicarMasivo(tipo, valor) {
    setProcesandoMasivo(true)
    setError('')
    try {
      await onAccionMasiva(seleccionadas, tipo, valor)
      setSeleccionadas([])
      return true
    } catch {
      setError('No se pudieron actualizar todas las tareas. Revisa los cambios e intenta de nuevo.')
      return false
    } finally {
      setProcesandoMasivo(false)
    }
  }

  async function eliminarSeleccionadas() {
    if (!tareasSeleccionadas.every((tarea) => tarea.custom)) return
    if (!window.confirm(`¿Eliminar ${tareasSeleccionadas.length} tarea${tareasSeleccionadas.length === 1 ? '' : 's'} personalizada${tareasSeleccionadas.length === 1 ? '' : 's'}?`)) return
    await aplicarMasivo('eliminar', true)
  }

  async function actualizar(tareaId, cambios) {
    setActualizando(tareaId)
    setError('')
    try {
      await onActualizar(tareaId, cambios)
      return true
    } catch {
      setError('No se pudo guardar el cambio. Intenta de nuevo.')
      return false
    } finally {
      setActualizando(null)
    }
  }

  if (!visibles.length) {
    return <div className="bg-white dark:bg-ink-800 border border-slate-200 dark:border-ink-500 rounded-xl p-10 text-center text-sm text-slate-500 dark:text-ink-300">Aún no hay tareas en este proyecto.</div>
  }

  return (
    <>
      {error && <div role="alert" className="mb-3 rounded-lg bg-rose-100 px-3 py-2 text-sm text-rose-800 dark:bg-rose-500/15 dark:text-rose-300">{error}</div>}
      <div className="flex min-h-9 items-center justify-between gap-3 text-xs text-slate-500 dark:text-ink-300">
        {orden === 'flujo' ? (
          <span className="inline-flex items-center gap-1.5"><GripVertical size={14} aria-hidden="true" /> Arrastra para ordenar; usa Estado para cambiar de columna</span>
        ) : (
          <><span>El orden manual está pausado mientras ordenas por una columna.</span><button onClick={() => { setOrden('flujo'); setDireccion('asc') }} className="shrink-0 rounded-md px-2 py-1 font-medium text-brand-800 hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 dark:text-brand-300 dark:hover:bg-brand-500/10">Volver al orden manual</button></>
        )}
      </div>

      <ContextoOrdenable items={visibles.map((tarea) => tarea.id)} disabled={!permiteOrdenar} onDragEnd={reordenar}>
        <div className="hidden max-h-[60vh] overflow-auto rounded-xl border border-slate-200 bg-white dark:border-ink-500 dark:bg-ink-800 md:block">
          <table className="w-full min-w-[800px] border-collapse text-sm">
            <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500 dark:border-ink-500 dark:bg-ink-900 dark:text-ink-300">
              <tr>
                <th className="w-20 py-3 pl-3"><CheckboxSeleccion checked={todasSeleccionadas} indeterminate={seleccionParcial} onChange={alternarTodas} disabled={!seleccionables.length} label="Seleccionar todas las tareas disponibles" /></th>
                <Encabezado campo="titulo" orden={orden} direccion={direccion} onOrdenar={ordenarPor} className="min-w-48 text-left">Tarea</Encabezado>
                <Encabezado campo="estado" orden={orden} direccion={direccion} onOrdenar={ordenarPor} className="w-28 text-left">Estado</Encabezado>
                <Encabezado campo="responsable" orden={orden} direccion={direccion} onOrdenar={ordenarPor} className="w-36 text-left">Responsable</Encabezado>
                <Encabezado campo="prioridad" orden={orden} direccion={direccion} onOrdenar={ordenarPor} className="w-28 text-left">Prioridad</Encabezado>
                <Encabezado campo="fecha" orden={orden} direccion={direccion} onOrdenar={ordenarPor} className="w-28 text-left">Fecha límite</Encabezado>
                <Encabezado campo="actividad" orden={orden} direccion={direccion} onOrdenar={ordenarPor} className="w-16 text-center">Actividad</Encabezado>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-ink-500">
              {visibles.map((tarea) => (
                <ElementoOrdenable key={tarea.id} id={tarea.id} disabled={!permiteOrdenar || !puedeOperar(tarea)}>
                  {({ setNodeRef, style, handleProps }) => (
                    <tr ref={setNodeRef} style={style} className={`transition-colors ${seleccionadas.includes(tarea.id) ? 'bg-brand-50 dark:bg-brand-500/10' : 'hover:bg-brand-50/40 dark:hover:bg-brand-500/5'}`}>
                      <td className="py-2 pl-3"><div className="flex items-center gap-1"><CheckboxSeleccion checked={seleccionadas.includes(tarea.id)} onChange={() => alternarSeleccion(tarea.id)} disabled={!puedeOperar(tarea)} label={`Seleccionar ${tarea.titulo}`} /><AsaOrden tarea={tarea} disabled={!permiteOrdenar || !puedeOperar(tarea)} handleProps={handleProps} /></div></td>
                      <td className="px-3 py-3">
                        <button onClick={() => setDetalle(tarea)} className="flex max-w-xl items-start gap-1.5 rounded-sm text-left font-medium text-slate-800 hover:text-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 dark:text-ink-100 dark:hover:text-brand-300">
                          {tarea.esRutaCritica && <Flag size={14} className="mt-0.5 shrink-0 text-rose-500" aria-label="Ruta crítica" />}
                          <span>{tarea.titulo}</span>
                        </button>
                        {tarea.custom && <span className="mt-0.5 block text-xs text-slate-400 dark:text-ink-400">Personalizada</span>}
                      </td>
                      <td className="px-3 py-3"><EstadoSelect tarea={tarea} onMover={mover} disabled={!puedeOperar(tarea) || actualizando === tarea.id || procesandoMasivo} /></td>
                      <td className="px-3 py-3"><Responsable tarea={tarea} equipo={equipo} miembrosPorId={miembrosPorId} miembros={miembros} avatares={avatares} onAsignar={onAsignar} disabled={!puedeOperar(tarea)} /></td>
                      <td className="px-3 py-3"><PrioridadRapida tarea={tarea} onActualizar={actualizar} disabled={!puedeOperar(tarea) || actualizando === tarea.id || procesandoMasivo} /></td>
                      <td className="px-3 py-3"><FechaRapida tarea={tarea} onActualizar={actualizar} disabled={!puedeOperar(tarea) || actualizando === tarea.id || procesandoMasivo} /></td>
                      <td className="px-3 py-3 text-center text-xs text-slate-500 dark:text-ink-300"><span className="inline-flex items-center gap-1"><MessageCircle size={14} /> {tarea.comentarios?.length || 0}</span></td>
                    </tr>
                  )}
                </ElementoOrdenable>
              ))}
            </tbody>
          </table>
        </div>
      </ContextoOrdenable>

      <ContextoOrdenable items={visibles.map((tarea) => tarea.id)} disabled={!permiteOrdenar} onDragEnd={reordenar}>
        <div className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white dark:divide-ink-500 dark:border-ink-500 dark:bg-ink-800 md:hidden">
          {visibles.map((tarea) => (
            <ElementoOrdenable key={tarea.id} id={tarea.id} disabled={!permiteOrdenar || !puedeOperar(tarea)}>
              {({ setNodeRef, style, handleProps }) => (
                <article ref={setNodeRef} style={style} className={`space-y-3 p-4 ${seleccionadas.includes(tarea.id) ? 'bg-brand-50 dark:bg-brand-500/10' : ''}`}>
                  <div className="flex items-start gap-2">
                    <div className="flex shrink-0 items-center gap-1 pt-0.5"><CheckboxSeleccion checked={seleccionadas.includes(tarea.id)} onChange={() => alternarSeleccion(tarea.id)} disabled={!puedeOperar(tarea)} label={`Seleccionar ${tarea.titulo}`} /><AsaOrden tarea={tarea} disabled={!permiteOrdenar || !puedeOperar(tarea)} handleProps={handleProps} /></div>
                    <button onClick={() => setDetalle(tarea)} className="flex min-h-11 flex-1 items-start gap-1.5 rounded-sm pt-2 text-left font-medium text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 dark:text-ink-100">
                      {tarea.esRutaCritica && <Flag size={15} className="mt-0.5 shrink-0 text-rose-500" aria-label="Ruta crítica" />}
                      <span>{tarea.titulo}</span>
                    </button>
                  </div>
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                    <EstadoSelect tarea={tarea} onMover={mover} disabled={!puedeOperar(tarea) || actualizando === tarea.id || procesandoMasivo} />
                    <PrioridadRapida tarea={tarea} onActualizar={actualizar} disabled={!puedeOperar(tarea) || actualizando === tarea.id || procesandoMasivo} />
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <Responsable tarea={tarea} equipo={equipo} miembrosPorId={miembrosPorId} miembros={miembros} avatares={avatares} onAsignar={onAsignar} disabled={!puedeOperar(tarea)} />
                    <span className="inline-flex items-center gap-1 text-xs text-slate-400 dark:text-ink-400"><MessageCircle size={13} /> {tarea.comentarios?.length || 0}</span>
                  </div>
                  <FechaRapida tarea={tarea} onActualizar={actualizar} disabled={!puedeOperar(tarea) || actualizando === tarea.id || procesandoMasivo} />
                </article>
              )}
            </ElementoOrdenable>
          ))}
        </div>
      </ContextoOrdenable>

      {seleccionadas.length > 0 && <BarraMasiva tareas={tareasSeleccionadas} miembros={miembros} procesando={procesandoMasivo} onAplicar={aplicarMasivo} onLimpiar={() => setSeleccionadas([])} onEliminar={eliminarSeleccionadas} />}

      {detalle && <Detalle tarea={tareas.find((tarea) => tarea.id === detalle.id) || detalle} equipo={equipo} miembrosPorId={miembrosPorId} miembros={miembros} avatares={avatares} onAsignar={onAsignar} onEditar={onEditar} onEliminar={onEliminar} onComentar={onComentar} onCerrar={() => setDetalle(null)} puedeEditar={puedeOperar(tareas.find((tarea) => tarea.id === detalle.id) || detalle)} />}
    </>
  )
}
