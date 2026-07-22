import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import Layout from '../../components/Layout'
import { useAuth } from '../../context/AuthContext'
import { getProyectos, iniciarTarea, completarTarea } from '../../data/api'
import { formatFechaHora } from '../../data/storage'
import { CheckCircle2, ChevronRight, PlayCircle } from 'lucide-react'

export default function MisTareas() {
  const { user } = useAuth()
  const [proyectos, setProyectos] = useState([])
  const [cargando, setCargando] = useState(true)

  async function cargar() {
    try {
      setProyectos(await getProyectos())
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => { cargar() }, [])

  async function handleIniciar(slug, tareaId) {
    await iniciarTarea(slug, tareaId)
    cargar()
  }

  async function handleCompletar(slug, tareaId) {
    await completarTarea(slug, tareaId)
    cargar()
  }

  const tareasDisponibles = []
  const tareasEnProceso = []
  proyectos
    .filter((p) => p.status === 'activo' || p.status === 'en_pausa')
    .forEach((p) => {
      const completadasIds = new Set(p.tareas.filter((t) => t.estado === 'completada').map((t) => t.id))
      p.tareas.forEach((t) => {
        if (t.estado === 'completada' || t.estado === 'omitida' || t.esCliente) return
        if (t.soloKarlaOAdmin && !user?.esKarla) return
        if (!matchRol(t.responsable, user)) return

        if (t.estado === 'en_proceso') {
          if (t.asignadoA === user?.nombre) tareasEnProceso.push({ ...t, proyectoSlug: p.slug, proyectoNombre: p.cliente.nombreComercial })
          return
        }
        if (!t.dependencias.every((d) => completadasIds.has(d))) return
        tareasDisponibles.push({ ...t, proyectoSlug: p.slug, proyectoNombre: p.cliente.nombreComercial })
      })
    })

  const tareasRecientes = proyectos
    .filter((p) => p.status !== 'cancelado')
    .flatMap((p) =>
      p.tareas
        .filter((t) => t.estado === 'completada' && t.completadaPor === user?.nombre)
        .map((t) => ({ ...t, proyectoNombre: p.cliente.nombreComercial }))
    )
    .sort((a, b) => new Date(b.completadaEn) - new Date(a.completadaEn))
    .slice(0, 10)

  return (
    <Layout titulo={`Hola, ${user?.nombre}`}>
      <div className="max-w-2xl space-y-6">
        {tareasEnProceso.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-violet-600 uppercase tracking-wide mb-3">
              En proceso ({tareasEnProceso.length})
            </h2>
            <div className="bg-white rounded-xl border border-violet-200 divide-y divide-violet-50">
              {tareasEnProceso.map((t) => (
                <div key={`${t.proyectoSlug}-${t.id}`} className="px-5 py-4 flex items-start gap-3 bg-violet-50/50">
                  <PlayCircle size={14} className="text-violet-500 mt-1 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-slate-800 text-sm">{t.titulo}</div>
                    <div className="text-xs text-slate-400 mt-0.5">{t.proyectoNombre}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Link to={`/equipo/proyecto/${t.proyectoSlug}`} className="text-xs text-slate-400 hover:text-slate-700 flex items-center gap-0.5">
                      Ver <ChevronRight size={12} />
                    </Link>
                    <button
                      onClick={() => handleCompletar(t.proyectoSlug, t.id)}
                      className="flex items-center gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg transition-colors"
                    >
                      <CheckCircle2 size={13} /> Listo
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <section>
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
            Tareas disponibles ({cargando ? '…' : tareasDisponibles.length})
          </h2>

          {cargando ? (
            <div className="flex justify-center py-8"><div className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" /></div>
          ) : tareasDisponibles.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400">
              <div className="text-3xl mb-2">✅</div>
              <div className="font-medium">No tienes tareas disponibles ahora</div>
              <div className="text-sm mt-1">Las tareas aparecen aquí cuando están desbloqueadas</div>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
              {tareasDisponibles.map((t) => (
                <div key={`${t.proyectoSlug}-${t.id}`} className="px-5 py-4 flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-violet-500 mt-2 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-slate-800 text-sm">{t.titulo}</div>
                    <div className="text-xs text-slate-400 mt-0.5">{t.proyectoNombre}</div>
                    {t.descripcion && <div className="text-xs text-slate-500 mt-1">{t.descripcion}</div>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Link to={`/equipo/proyecto/${t.proyectoSlug}`} className="text-xs text-slate-400 hover:text-slate-700 flex items-center gap-0.5">
                      Ver <ChevronRight size={12} />
                    </Link>
                    <button
                      onClick={() => handleIniciar(t.proyectoSlug, t.id)}
                      className="flex items-center gap-1.5 text-xs border border-violet-200 text-violet-600 hover:bg-violet-50 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      <PlayCircle size={13} /> Empezar
                    </button>
                    <button
                      onClick={() => handleCompletar(t.proyectoSlug, t.id)}
                      className="flex items-center gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg transition-colors"
                    >
                      <CheckCircle2 size={13} /> Listo
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">Mis proyectos</h2>
          <div className="space-y-2">
            {proyectos
              .filter((p) => p.status === 'activo' || p.status === 'en_pausa')
              .map((p) => (
                <Link key={p.id} to={`/equipo/proyecto/${p.slug}`} className="flex items-center justify-between bg-white rounded-xl border border-slate-200 px-5 py-4 hover:border-slate-300 transition-colors">
                  <div>
                    <div className="font-medium text-slate-800 text-sm">{p.cliente.nombreComercial}</div>
                    <div className="text-xs text-slate-400 mt-0.5">{p.proyecto.paquete}</div>
                  </div>
                  <ChevronRight size={16} className="text-slate-300" />
                </Link>
              ))}
          </div>
        </section>

        {tareasRecientes.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">Completadas recientemente</h2>
            <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
              {tareasRecientes.map((t) => (
                <div key={t.id} className="px-5 py-3 flex items-start gap-3">
                  <CheckCircle2 size={15} className="text-emerald-400 mt-0.5 shrink-0" />
                  <div>
                    <div className="text-sm text-slate-600 line-through">{t.titulo}</div>
                    <div className="text-xs text-slate-400">{t.proyectoNombre} · {formatFechaHora(t.completadaEn)}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </Layout>
  )
}

function matchRol(responsable, user) {
  if (responsable === 'equipo') return true
  if (responsable === 'admin' || responsable === 'karla') return false
  return true
}
