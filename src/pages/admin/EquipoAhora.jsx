import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import Layout from '../../components/Layout'
import Avatar from '../../components/Avatar'
import { getProyectos, getMiembros } from '../../data/api'
import { nombreProyecto } from '../../data/storage'
import { useEventosGlobal } from '../../hooks/useEventos'
import { bandejaDe, sinAsignarPorProyecto, proyectosDeTrabajo, porPrioridad } from '../../lib/bandejaTareas'
import { PlayCircle, ChevronRight, Lock, UserX } from 'lucide-react'

function LigaTarea({ tarea }) {
  return (
    <Link to={`/admin/proyecto/${tarea.proyectoSlug}`} className="group flex items-center justify-between gap-2 min-w-0">
      <span className="min-w-0">
        <span className="block text-sm text-slate-800 dark:text-ink-100 truncate group-hover:text-brand-600">{tarea.titulo}</span>
        <span className="block text-xs text-slate-400 dark:text-ink-400 truncate">{tarea.proyectoNombre}</span>
      </span>
      <ChevronRight size={14} className="text-slate-300 shrink-0" />
    </Link>
  )
}

export default function EquipoAhora() {
  const [proyectos, setProyectos] = useState([])
  const [miembros, setMiembros] = useState([])
  const [cargando, setCargando] = useState(true)

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

  const proyectosTrabajo = proyectosDeTrabajo(proyectos)

  // Quien tiene algo en curso va primero: es lo que el admin quiere ver de un vistazo.
  const filas = miembros
    .filter((m) => m.activo)
    .map((m) => ({ miembro: m, ...bandejaDe(m, proyectosTrabajo) }))
    .sort((a, b) => b.enProceso.length - a.enProceso.length || b.asignadas.length - a.asignadas.length)

  // "Sin asignar" aquí solo muestra lo que alguien podría tomar ya: pendiente
  // y con sus dependencias completas.
  const sinAsignarDisponibles = sinAsignarPorProyecto(proyectosTrabajo)
    .flatMap(({ proyecto: p, tareas }) => {
      const completadas = new Set(p.tareas.filter((t) => t.estado === 'completada').map((t) => t.id))
      return tareas
        .filter((t) => t.estado === 'pendiente' && t.dependencias.every((d) => completadas.has(d)))
        .map((t) => ({ ...t, proyectoSlug: p.slug, proyectoNombre: nombreProyecto(p) }))
    })
    .sort(porPrioridad)

  return (
    <Layout titulo="Equipo ahora">
      {cargando ? (
        <div className="flex justify-center py-8"><div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filas.map(({ miembro: m, enProceso, asignadas, bloqueadas }) => (
              <section key={m.id} className="bg-white dark:bg-ink-800 rounded-xl border border-slate-200 dark:border-ink-500 p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Avatar nombre={m.nombre} avatarUrl={m.avatarUrl} size={28} />
                    <span className="font-semibold text-slate-800 dark:text-ink-100 truncate">{m.nombre}</span>
                  </div>
                  {bloqueadas.length > 0 && (
                    <span className="flex items-center gap-1 text-xs text-slate-400 dark:text-ink-400 shrink-0" title="Asignadas pero esperando dependencias">
                      <Lock size={12} /> {bloqueadas.length} bloqueada{bloqueadas.length === 1 ? '' : 's'}
                    </span>
                  )}
                </div>

                {enProceso.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-brand-600 mb-1 flex items-center gap-1">
                      <PlayCircle size={12} /> En curso
                    </div>
                    <div className="space-y-2">{enProceso.map((t) => <LigaTarea key={`${t.proyectoSlug}-${t.id}`} tarea={t} />)}</div>
                  </div>
                )}

                {asignadas.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-ink-300 mb-1">
                      {enProceso.length ? 'Siguiente' : 'Puede empezar'}
                    </div>
                    <div className="space-y-2">
                      {asignadas.slice(0, 2).map((t) => <LigaTarea key={`${t.proyectoSlug}-${t.id}`} tarea={t} />)}
                      {asignadas.length > 2 && <div className="text-xs text-slate-400 dark:text-ink-400">+{asignadas.length - 2} más disponibles</div>}
                    </div>
                  </div>
                )}

                {!enProceso.length && !asignadas.length && (
                  <div className="text-sm text-slate-400 dark:text-ink-400 italic">Sin tareas disponibles por ahora</div>
                )}
              </section>
            ))}
          </div>

          <section>
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1">
              <UserX size={14} /> Sin asignar ({sinAsignarDisponibles.length})
            </h2>
            {sinAsignarDisponibles.length ? (
              <div className="bg-white dark:bg-ink-800 rounded-xl border border-amber-200 dark:border-amber-800 divide-y divide-slate-100 dark:divide-ink-500">
                {sinAsignarDisponibles.map((t) => (
                  <div key={`${t.proyectoSlug}-${t.id}`} className="px-4 py-3"><LigaTarea tarea={t} /></div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-slate-400 dark:text-ink-400 italic">No hay tareas disponibles sin responsable.</div>
            )}
          </section>
        </div>
      )}
    </Layout>
  )
}
