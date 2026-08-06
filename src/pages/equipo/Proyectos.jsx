import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../../components/Layout'
import { useAuth } from '../../context/AuthContext'
import { getProyectos } from '../../data/api'
import { useEventosGlobal } from '../../hooks/useEventos'
import { usuarioParticipaEnProyecto } from '../../lib/permisos'
import { Search, X, ChevronRight } from 'lucide-react'

export default function Proyectos() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [proyectos, setProyectos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [busqueda, setBusqueda] = useState('')

  async function cargar() {
    try {
      setProyectos(await getProyectos())
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => { cargar() }, [])
  useEventosGlobal(true, cargar)

  const q = busqueda.trim().toLowerCase()
  const misProyectos = proyectos
    .filter((p) => p.status !== 'cancelado')
    .filter((p) => usuarioParticipaEnProyecto(p.equipo, user?.id))
    .filter((p) => !q || p.cliente.nombreComercial.toLowerCase().includes(q) || p.proyecto.paquete.toLowerCase().includes(q))

  return (
    <Layout titulo="Proyectos">
      <div className="max-w-2xl">
        <div className="relative w-full sm:w-72 mb-5">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar proyecto..."
            className="w-full pl-9 pr-8 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-300"
          />
          {busqueda && (
            <button
              onClick={() => setBusqueda('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {cargando ? (
          <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" /></div>
        ) : misProyectos.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <div className="text-4xl mb-3">📋</div>
            <div className="font-medium">
              {q ? `No hay proyectos que coincidan con "${busqueda}"` : 'No participas en ningún proyecto activo'}
            </div>
            {!q && <div className="text-sm mt-1">Cuando un admin te asigne a un proyecto, aparecerá aquí.</div>}
          </div>
        ) : (
          <div className="space-y-2">
            {misProyectos.map((p) => (
              <div
                key={p.id}
                onClick={() => navigate(`/equipo/proyecto/${p.slug}`)}
                className="flex items-center justify-between bg-white rounded-xl border border-slate-200 px-5 py-4 cursor-pointer hover:border-slate-300 hover:shadow-md hover:-translate-y-0.5 transition-all"
              >
                <div className="min-w-0">
                  <div className="font-medium text-slate-800 text-sm truncate">{p.cliente.nombreComercial}</div>
                  <div className="text-sm text-slate-400 mt-0.5">
                    {p.proyecto.paquete}{p.status === 'en_pausa' ? ' · En pausa' : ''}
                  </div>
                </div>
                <ChevronRight size={16} className="text-slate-300 shrink-0" />
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  )
}
