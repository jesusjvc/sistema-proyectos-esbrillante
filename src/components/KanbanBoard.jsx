import { useState, useEffect } from 'react'
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragOverlay, useDroppable,
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { KANBAN_COLUMNAS } from '../data/kanban'
import { infoResponsable } from '../lib/permisos'
import Avatar from './Avatar'
import TextoEnriquecido from './TextoEnriquecido'
import HiloComentarios from './HiloComentarios'
import ModalDetalleTarea from './ModalDetalleTarea'
import SelectorResponsableRapido from './SelectorResponsableRapido'
import {
  CheckCircle2, PlayCircle, Eye, Circle, Pencil, Trash2,
  Flag, UserX, MessageCircle,
} from 'lucide-react'

function agrupar(tareas) {
  return Object.fromEntries(
    KANBAN_COLUMNAS.map((c) => [
      c.columna,
      tareas.filter((t) => !t.esCliente && t.estado === c.estado).sort((a, b) => a.orden - b.orden),
    ]),
  )
}

// Tablero Kanban compartido entre admin, equipo y (en modo readOnly) el
// portal del cliente, para proyectos de tipo "continuo". El estado local
// `columnas` se mantiene optimista durante el drag (patrón multi-container
// de dnd-kit) y se resincroniza desde `tareas` cuando no hay drag activo.
export default function KanbanBoard({ tareas, onMover, onEditar, onEliminar, onComentar, onAsignar, readOnly = false, avatares = {}, equipo, miembrosPorId = {}, miembros = [] }) {
  const [columnas, setColumnas] = useState(() => agrupar(tareas))
  const [activeId, setActiveId] = useState(null)

  useEffect(() => {
    if (activeId) return
    setColumnas(agrupar(tareas))
  }, [tareas, activeId])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  function contenedorDe(id) {
    return Object.keys(columnas).find((c) => columnas[c].some((t) => t.id === id))
  }

  function handleDragStart(event) {
    setActiveId(event.active.id)
  }

  function handleDragOver(event) {
    const { active, over } = event
    if (!over) return
    const origenCol = contenedorDe(active.id)
    const destinoCol = columnas[over.id] ? over.id : contenedorDe(over.id)
    if (!origenCol || !destinoCol || origenCol === destinoCol) return

    setColumnas((prev) => {
      const origen = [...prev[origenCol]]
      const idx = origen.findIndex((t) => t.id === active.id)
      if (idx === -1) return prev
      const [tarea] = origen.splice(idx, 1)
      const destino = [...prev[destinoCol]]
      const overIdx = destino.findIndex((t) => t.id === over.id)
      destino.splice(overIdx === -1 ? destino.length : overIdx, 0, tarea)
      return { ...prev, [origenCol]: origen, [destinoCol]: destino }
    })
  }

  async function handleDragEnd(event) {
    const { active, over } = event
    setActiveId(null)
    if (!over) return

    const destinoCol = columnas[over.id] ? over.id : contenedorDe(over.id)
    if (!destinoCol) return

    let listaFinal = columnas[destinoCol]
    const idxActivo = listaFinal.findIndex((t) => t.id === active.id)
    const idxOver = listaFinal.findIndex((t) => t.id === over.id)
    if (idxActivo !== -1 && idxOver !== -1 && idxActivo !== idxOver) {
      listaFinal = arrayMove(listaFinal, idxActivo, idxOver)
      setColumnas((prev) => ({ ...prev, [destinoCol]: listaFinal }))
    }

    const posicion = listaFinal.findIndex((t) => t.id === active.id)
    const anterior = listaFinal[posicion - 1]
    const siguiente = listaFinal[posicion + 1]
    const estadoDestino = KANBAN_COLUMNAS.find((c) => c.columna === destinoCol).estado

    await onMover(active.id, {
      estado: estadoDestino,
      antesDeTareaId: !anterior && siguiente ? siguiente.id : undefined,
      despuesDeTareaId: anterior ? anterior.id : undefined,
    })
  }

  const tareaActiva = activeId ? Object.values(columnas).flat().find((t) => t.id === activeId) : null

  return (
    <DndContext
      sensors={readOnly ? [] : sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 overflow-x-auto pb-2">
        {KANBAN_COLUMNAS.map((c) => (
          <Columna
            key={c.columna}
            columna={c}
            tareas={columnas[c.columna] || []}
            readOnly={readOnly}
            onEditar={onEditar}
            onEliminar={onEliminar}
            onComentar={onComentar}
            onAsignar={onAsignar}
            avatares={avatares}
            equipo={equipo}
            miembrosPorId={miembrosPorId}
            miembros={miembros}
          />
        ))}
      </div>
      <DragOverlay>
        {tareaActiva && <TareaCard tarea={tareaActiva} readOnly overlay avatares={avatares} equipo={equipo} miembrosPorId={miembrosPorId} />}
      </DragOverlay>
    </DndContext>
  )
}

function Columna({ columna, tareas, readOnly, onEditar, onEliminar, onComentar, onAsignar, avatares, equipo, miembrosPorId, miembros }) {
  const iconMap = { todo: <Circle size={13} />, doing: <PlayCircle size={13} />, revision: <Eye size={13} />, done: <CheckCircle2 size={13} /> }
  const colorMap = {
    todo: 'text-slate-500 dark:text-slate-400',
    doing: 'text-brand-600 dark:text-brand-400',
    revision: 'text-amber-600 dark:text-amber-400',
    done: 'text-emerald-600 dark:text-emerald-400',
  }

  return (
    <div className="bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl flex flex-col min-h-[120px] w-72 shrink-0">
      <div className={`flex items-center gap-1.5 px-3.5 py-3 text-sm font-semibold ${colorMap[columna.columna]}`}>
        {iconMap[columna.columna]}
        {columna.label}
        <span className="ml-auto text-xs font-normal text-slate-400 dark:text-slate-500">{tareas.length}</span>
      </div>
      <SortableContext items={tareas.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <DroppableArea id={columna.columna}>
          {tareas.map((t) => (
            <TareaCard key={t.id} tarea={t} readOnly={readOnly} onEditar={onEditar} onEliminar={onEliminar} onComentar={onComentar} onAsignar={onAsignar} avatares={avatares} equipo={equipo} miembrosPorId={miembrosPorId} miembros={miembros} />
          ))}
        </DroppableArea>
      </SortableContext>
    </div>
  )
}

// Registra la columna misma como blanco de drop — necesario para poder
// soltar una tarjeta sobre una columna vacía (sin tarjetas sobre las que
// hacer "over"). El ref va sobre un div con layout real: uno con
// `display: contents` no genera caja propia y su getBoundingClientRect()
// colapsa, por lo que dnd-kit nunca lo detecta como blanco de colisión.
function DroppableArea({ id, children }) {
  const { setNodeRef } = useDroppable({ id })
  return <div ref={setNodeRef} className="flex-1 px-2.5 pb-2.5 space-y-2 min-h-[60px]">{children}</div>
}

function TareaCard({ tarea: t, readOnly, onEditar, onEliminar, onComentar, onAsignar, overlay, avatares = {}, equipo, miembrosPorId = {}, miembros = [] }) {
  const [modalAbierto, setModalAbierto] = useState(false)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: t.id, disabled: readOnly })
  const responsableInfo = infoResponsable(t, equipo, miembrosPorId)

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  const personaAsignada = t.estado === 'completada' ? t.completadaPor : t.estado === 'en_proceso' ? t.asignadoA : responsableInfo.nombre
  const sinPersonaClara = !personaAsignada
  const numComentarios = t.comentarios?.length || 0

  const badges = (
    <>
      {t.esRutaCritica && <Flag size={13} className="text-rose-500 shrink-0" title="Ruta crítica" />}
      {t.custom && <span className="text-[10px] bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 px-1.5 py-0.5 rounded-full">Personalizada</span>}
    </>
  )

  const lineaSecundaria = t.estado === 'completada'
    ? `Completada por ${t.completadaPor}`
    : t.estado === 'en_proceso'
    ? (t.asignadoA ? `En proceso — ${t.asignadoA}` : 'En proceso')
    : sinPersonaClara
    ? 'Sin responsable'
    : (responsableInfo.nombre || responsableInfo.label)

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        {...(!readOnly ? { ...attributes, ...listeners } : {})}
        onClick={() => !isDragging && setModalAbierto(true)}
        className={`bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 select-none ${readOnly ? '' : 'cursor-pointer active:cursor-grabbing'} ${overlay ? 'shadow-xl rotate-1' : 'shadow-sm hover:border-brand-300 dark:hover:border-brand-500/50 transition-colors'}`}
      >
        <div className="flex items-start gap-2">
          {sinPersonaClara ? (
            onAsignar ? (
              <div className="mt-0.5">
                <SelectorResponsableRapido miembros={miembros} onAsignar={(personaId) => onAsignar(t.id, personaId)} size={28} iconSize={13} />
              </div>
            ) : (
              <div className="w-[28px] h-[28px] mt-0.5 rounded-full border-2 border-dashed border-amber-400 flex items-center justify-center shrink-0" title="No tiene un rol o persona específica asignada">
                <UserX size={13} className="text-amber-500" />
              </div>
            )
          ) : (
            <div className="mt-0.5"><Avatar nombre={personaAsignada} avatarUrl={avatares[personaAsignada]} size={28} /></div>
          )}

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-sm font-medium text-slate-800 dark:text-slate-100">{t.titulo}</span>
              {badges}
            </div>

            <div className={`text-sm mt-0.5 ${t.estado === 'en_proceso' ? 'text-brand-700 dark:text-brand-400' : sinPersonaClara ? 'text-amber-600 dark:text-amber-500' : 'text-slate-500 dark:text-slate-400'}`}>
              {lineaSecundaria}
            </div>

            {numComentarios > 0 && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded-full mt-1.5">
                <MessageCircle size={12} /> {numComentarios}
              </span>
            )}
          </div>

          {!readOnly && (onEditar || onEliminar) && (
            <div
              className="flex items-center gap-0.5 shrink-0"
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              {onEditar && (
                <button onClick={() => onEditar(t)} className="p-1 text-slate-300 hover:text-brand-700 hover:bg-brand-50 dark:hover:bg-brand-500/10 rounded transition-colors" title="Editar">
                  <Pencil size={12} />
                </button>
              )}
              {onEliminar && t.custom && (
                <button onClick={() => onEliminar(t)} className="p-1 text-slate-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded transition-colors" title="Eliminar">
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {modalAbierto && (
        <ModalDetalleTarea titulo={t.titulo} badges={badges} onCerrar={() => setModalAbierto(false)}>
          <div className="flex items-center gap-2.5">
            {sinPersonaClara ? (
              onAsignar ? (
                <SelectorResponsableRapido miembros={miembros} onAsignar={(personaId) => onAsignar(t.id, personaId)} size={30} iconSize={14} />
              ) : (
                <div className="w-[30px] h-[30px] rounded-full border-2 border-dashed border-amber-400 flex items-center justify-center shrink-0">
                  <UserX size={14} className="text-amber-500" />
                </div>
              )
            ) : (
              <Avatar nombre={personaAsignada} avatarUrl={avatares[personaAsignada]} size={30} />
            )}
            <div className={`text-sm ${t.estado === 'en_proceso' ? 'text-brand-700 dark:text-brand-400' : sinPersonaClara ? 'text-amber-600 dark:text-amber-500' : 'text-slate-500 dark:text-slate-400'}`}>
              {lineaSecundaria}
            </div>
          </div>

          {t.descripcion && <TextoEnriquecido html={t.descripcion} className="text-sm text-slate-600 dark:text-slate-300" />}

          {onComentar && (
            <HiloComentarios
              comentarios={t.comentarios}
              miembrosPorId={miembrosPorId}
              onEnviar={(texto, mencionados) => onComentar(t.id, texto, mencionados)}
            />
          )}
        </ModalDetalleTarea>
      )}
    </>
  )
}
