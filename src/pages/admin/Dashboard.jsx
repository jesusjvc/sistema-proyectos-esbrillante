import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import Layout from '../../components/Layout'
import { useAuth } from '../../context/AuthContext'
import { getProyectos, confirmarAnticipo } from '../../data/api'
import { calcularAvance, getFaseActual, formatFecha } from '../../data/storage'
import { FASES } from '../../data/paquetes'
import { PlusCircle, Clock, CheckCircle2, PauseCircle, AlertCircle, ChevronRight } from 'lucide-react'

const STATUS_CONFIG = {
  activo: { label: 'Activo', color: 'bg-emerald-100 text-emerald-700', icon: <CheckCircle2 size={13} /> },
  en_pausa: { label: 'En pausa', color: 'bg-amber-100 text-amber-700', icon: <PauseCircle size={13} /> },
  pendiente_anticipo: { label: 'Pendiente anticipo', color: 'bg-red-100 text-red-700', icon: <AlertCircle size={13} /> },
  completado: { label: 'Completado', color: 'bg-slate-100 text-slate-600', icon: <CheckCircle2 size={13} /> },
  cancelado: { label: 'Cancelado', color: 'bg-slate-100 text-slate-500', icon: null },
}

export default function AdminDashboard() {
  const { user } = useAuth()
  const [proyectos, setProyectos] = useState([])
  const [filtro, setFiltro] = useState('todos')
  const [cargando, setCargando] = useState(true)

  async function cargar() {
    try {
      const data = await getProyectos()
      setProyectos(data)
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => { cargar() }, [])

  async function handleConfirmarAnticipo(slug) {
    await confirmarAnticipo(slug)
    cargar()
  }

  const filtrados = proyectos.filter((p) => filtro === 'todos' || p.status === filtro)

  const counts = {
    activo: proyectos.filter((p) => p.status === 'activo').length,
    en_pausa: proyectos.filter((p) => p.status === 'en_pausa').length,
    pendiente_anticipo: proyectos.filter((p) => p.status === 'pendiente_anticipo').length,
    completado: proyectos.filter((p) => p.status === 'completado').length,
  }

  return (
    <Layout titulo="Proyectos">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <MetricaCard label="Activos" valor={counts.activo} color="text-emerald-600" />
        <MetricaCard label="En pausa" valor={counts.en_pausa} color="text-amber-600" />
        <MetricaCard label="Pendientes anticipo" valor={counts.pendiente_anticipo} color="text-red-600" />
        <MetricaCard label="Completados" valor={counts.completado} color="text-slate-500" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="flex gap-2">
          {['todos', 'activo', 'en_pausa', 'pendiente_anticipo', 'completado'].map((f) => (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filtro === f ? 'bg-violet-600 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300'
              }`}
            >
              {f === 'todos' ? 'Todos' : STATUS_CONFIG[f]?.label}
            </button>
          ))}
        </div>
        <Link
          to="/admin/proyecto/nuevo"
          className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
        >
          <PlusCircle size={16} />
          Nuevo proyecto
        </Link>
      </div>

      {cargando ? (
        <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : filtrados.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <div className="text-4xl mb-3">📋</div>
          <div className="font-medium">No hay proyectos</div>
          <div className="text-sm mt-1">{filtro === 'todos' ? 'Crea el primer proyecto para comenzar' : `No hay proyectos con estado "${STATUS_CONFIG[filtro]?.label}"`}</div>
        </div>
      ) : (
        <div className="space-y-3">
          {filtrados.map((p) => (
            <ProyectoCard key={p.id} proyecto={p} onConfirmarAnticipo={handleConfirmarAnticipo} />
          ))}
        </div>
      )}
    </Layout>
  )
}

function ProyectoCard({ proyecto: p, onConfirmarAnticipo }) {
  const avance = calcularAvance(p)
  const faseActual = getFaseActual(p)
  const faseNombre = FASES.find((f) => f.numero === faseActual)?.nombre || ''
  const cfg = STATUS_CONFIG[p.status] || STATUS_CONFIG.activo

  const tareasDisponibles = p.tareas.filter((t) => {
    if (t.estado === 'completada' || t.estado === 'omitida') return false
    const completadasIds = new Set(p.tareas.filter((x) => x.estado === 'completada').map((x) => x.id))
    return !t.esCliente && t.dependencias.every((d) => completadasIds.has(d))
  }).length

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 hover:border-slate-300 transition-colors">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-slate-800 truncate">{p.cliente.nombreComercial}</h3>
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${cfg.color}`}>
              {cfg.icon}{cfg.label}
            </span>
          </div>
          <div className="text-sm text-slate-500 mb-3">
            {p.proyecto.paquete}
            {p.proyecto.extras?.length > 0 && ` · ${p.proyecto.extras.length} extra${p.proyecto.extras.length > 1 ? 's' : ''}`}
          </div>
          <div className="mb-2">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
              <span>Fase {faseActual} — {faseNombre}</span>
              <span className="font-semibold text-slate-700">{avance}%</span>
            </div>
            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-violet-500 rounded-full transition-all" style={{ width: `${avance}%` }} />
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs text-slate-400">
            <span className="flex items-center gap-1">
              <Clock size={12} />
              Entrega estimada: {formatFecha(p.proyecto.fechaEstimadaEntrega)}
            </span>
            {tareasDisponibles > 0 && (
              <span className="text-violet-600 font-medium">
                {tareasDisponibles} tarea{tareasDisponibles > 1 ? 's' : ''} disponible{tareasDisponibles > 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          {p.status === 'pendiente_anticipo' && (
            <button
              onClick={() => onConfirmarAnticipo(p.slug)}
              className="text-xs bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg transition-colors"
            >
              Confirmar anticipo
            </button>
          )}
          <Link
            to={`/admin/proyecto/${p.slug}`}
            className="flex items-center gap-1 text-sm text-violet-600 hover:text-violet-800 font-medium transition-colors"
          >
            Ver proyecto <ChevronRight size={14} />
          </Link>
        </div>
      </div>
    </div>
  )
}

function MetricaCard({ label, valor, color }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 px-4 py-3">
      <div className={`text-2xl font-bold ${color}`}>{valor}</div>
      <div className="text-xs text-slate-500 mt-0.5">{label}</div>
    </div>
  )
}
