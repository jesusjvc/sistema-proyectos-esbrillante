import { useState, useEffect } from 'react'
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragOverlay, useDroppable,
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { KANBAN_COLUMNAS } from '../data/kanban'
import Avatar from './Avatar'
import {
  CheckCircle2, PlayCircle, Eye, Circle, Info, Pencil, Trash2, GripVertical,
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
export default function KanbanBoard({ tareas, onMover, onEditar, onEliminar, readOnly = false, avatares = {} }) {
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {KANBAN_COLUMNAS.map((c) => (
          <Columna
            key={c.columna}
            columna={c}
            tareas={columnas[c.columna] || []}
            readOnly={readOnly}
            onEditar={onEditar}
            onEliminar={onEliminar}
            avatares={avatares}
          />
        ))}
      </div>
      <DragOverlay>
        {tareaActiva && <TareaCard tarea={tareaActiva} readOnly overlay avatares={avatares} />}
      </DragOverlay>
    </DndContext>
  )
}

function Columna({ columna, tareas, readOnly, onEditar, onEliminar, avatares }) {
  const iconMap = { todo: <Circle size={13} />, doing: <PlayCircle size={13} />, revision: <Eye size={13} />, done: <CheckCircle2 size={13} /> }
  const colorMap = {
    todo: 'text-slate-500 dark:text-slate-400',
    doing: 'text-brand-600 dark:text-brand-400',
    revision: 'text-amber-600 dark:text-amber-400',
    done: 'text-emerald-600 dark:text-emerald-400',
  }

  return (
    <div className="bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl flex flex-col min-h-[120px]">
      <div className={`flex items-center gap-1.5 px-3.5 py-3 text-sm font-semibold ${colorMap[columna.columna]}`}>
        {iconMap[columna.columna]}
        {columna.label}
        <span className="ml-auto text-xs font-normal text-slate-400 dark:text-slate-500">{tareas.length}</span>
      </div>
      <SortableContext items={tareas.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <DroppableArea id={columna.columna}>
          {tareas.map((t) => (
            <TareaCard key={t.id} tarea={t} readOnly={readOnly} onEditar={onEditar} onEliminar={onEliminar} avatares={avatares} />
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

function TareaCard({ tarea: t, readOnly, onEditar, onEliminar, overlay, avatares = {} }) {
  const [expandida, setExpandida] = useState(false)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: t.id, disabled: readOnly })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 ${overlay ? 'shadow-xl rotate-1' : 'shadow-sm'}`}
    >
      <div className="flex items-start gap-2">
        {!readOnly && (
          <button {...attributes} {...listeners} className="mt-0.5 text-slate-300 dark:text-slate-600 hover:text-slate-500 cursor-grab active:cursor-grabbing shrink-0" title="Arrastrar">
            <GripVertical size={14} />
          </button>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-medium text-slate-800 dark:text-slate-100">{t.titulo}</span>
            {t.esRutaCritica && <span className="text-[10px] bg-brand-100 dark:bg-brand-500/15 text-brand-800 dark:text-brand-300 px-1.5 py-0.5 rounded-full">Ruta crítica</span>}
            {t.custom && <span className="text-[10px] bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 px-1.5 py-0.5 rounded-full">Personalizada</span>}
          </div>

          {t.estado === 'en_proceso' && t.asignadoA && (
            <div className="flex items-center gap-1.5 text-sm text-brand-700 dark:text-brand-400 mt-1">
              <Avatar nombre={t.asignadoA} avatarUrl={avatares[t.asignadoA]} size={17} />
              {t.asignadoA}
            </div>
          )}
          {t.estado === 'completada' && t.completadaPor && (
            <div className="flex items-center gap-1.5 text-sm text-slate-400 dark:text-slate-500 mt-1">
              <Avatar nombre={t.completadaPor} avatarUrl={avatares[t.completadaPor]} size={17} />
              Por {t.completadaPor}
            </div>
          )}

          {t.descripcion && (
            <button onClick={() => setExpandida(!expandida)} className="text-sm text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 mt-1.5 flex items-center gap-1">
              <Info size={13} /> {expandida ? 'Ocultar' : 'Ver detalle'}
            </button>
          )}
          {expandida && (
            <div className="mt-1.5 text-sm text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700/60 rounded-lg p-2">{t.descripcion}</div>
          )}
        </div>

        {!readOnly && (onEditar || onEliminar) && (
          <div className="flex items-center gap-0.5 shrink-0">
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
  )
}
