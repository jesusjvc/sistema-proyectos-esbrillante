import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Layout from '../../components/Layout'
import Avatar from '../../components/Avatar'
import { useAuth } from '../../context/AuthContext'
import { getProyectos, getMiembros, confirmarAnticipo } from '../../data/api'
import { calcularAvance, getFaseActual, contarPendientesCliente, tieneRespuestaNueva, contarTareasVencidasCliente } from '../../data/storage'
import { FASES } from '../../data/paquetes'
import { KANBAN_COLUMNAS, contarPorColumna } from '../../data/kanban'
import { miembrosDelEquipo } from '../../lib/permisos'
import { AREAS, AREA_LABEL, AREA_COLOR } from '../../lib/areas'
import { useEventosGlobal } from '../../hooks/useEventos'
import { PlusCircle, Clock, CheckCircle2, PauseCircle, AlertCircle, ChevronRight, Bell, MessageCircle, Search, X } from 'lucide-react'

const STATUS_CONFIG = {
  activo: { label: 'Activo', color: 'bg-emerald-100 text-emerald-700', icon: <CheckCircle2 size={13} /> },
  en_pausa: { label: 'En pausa', color: 'bg-amber-100 text-amber-700', icon: <PauseCircle size={13} /> },
  pendiente_anticipo: { label: 'Pendiente anticipo', color: 'bg-red-100 text-red-700', icon: <AlertCircle size={13} /> },
  completado: { label: 'Completado', color: 'bg-slate-100 text-slate-600', icon: <CheckCircle2 size={13} /> },
  cancelado: { label: 'Cancelado', color: 'bg-slate-100 text-slate-500', icon: null },
}

const KANBAN_SEGMENT_COLOR = { todo: 'bg-slate-300', doing: 'bg-brand-500', revision: 'bg-violet-500', done: 'bg-emerald-500' }

export default function AdminDashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [proyectos, setProyectos] = useState([])
  const [miembros, setMiembros] = useState([])
  const [avatares, setAvatares] = useState({})
  const [filtro, setFiltro] = useState('activo')
  const [filtroArea, setFiltroArea] = useState('mia')
  const [busqueda, setBusqueda] = useState('')
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
  useEffect(() => { setFiltroArea(user?.area ? 'mia' : 'todas') }, [user?.area])
  useEffect(() => {
    getMiembros().then((ms) => {
      setMiembros(ms)
      setAvatares(Object.fromEntries(ms.map((m) => [m.nombre, m.avatarUrl])))
    })
  }, [])
  useEventosGlobal(true, cargar)

  async function handleConfirmarAnticipo(slug) {
    await confirmarAnticipo(slug)
    cargar()
  }

  const q = busqueda.trim().toLowerCase()
  const objetivoArea = filtroArea === 'todas' ? null : filtroArea === 'mia' ? user?.area : filtroArea
  const filtrados = proyectos
    .filter((p) => filtro === 'todos' || p.status === filtro)
    .filter((p) => !objetivoArea || !p.areas?.length || p.areas.includes(objetivoArea))
    .filter((p) => !q || p.cliente.nombreComercial.toLowerCase().includes(q) || p.proyecto.paquete.toLowerCase().includes(q))

  const counts = {
    activo: proyectos.filter((p) => p.status === 'activo').length,
    en_pausa: proyectos.filter((p) => p.status === 'en_pausa').length,
    pendiente_anticipo: proyectos.filter((p) => p.status === 'pendiente_anticipo').length,
    completado: proyectos.filter((p) => p.status === 'completado').length,
  }

  return (
    <Layout titulo="Proyectos">
      <div className="flex flex-col gap-5 mb-6">
        <AttencionBanner proyectos={proyectos} onIr={(slug) => navigate(`/admin/proyecto/${slug}`)} />

        <div className="flex items-center gap-6 flex-wrap">
          <StatDot color="bg-emerald-500" label={`${counts.activo} activo${counts.activo === 1 ? '' : 's'}`} />
          <StatDot color="bg-amber-500" label={`${counts.en_pausa} en pausa`} />
          <StatDot color="bg-slate-400" label={`${counts.completado} completado${counts.completado === 1 ? '' : 's'}`} />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="relative w-full sm:w-72">
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
        <Link
          to="/admin/proyecto/nuevo"
          className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-slate-900 text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
        >
          <PlusCircle size={16} />
          Nuevo proyecto
        </Link>
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        {['todos', 'activo', 'en_pausa', 'pendiente_anticipo', 'completado'].map((f) => (
          <button
            key={f}
            onClick={() => setFiltro(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filtro === f ? 'bg-brand-500 text-slate-900' : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300'
            }`}
          >
            {f === 'todos' ? 'Todos' : STATUS_CONFIG[f]?.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-5">
        <span className="text-xs text-slate-400">Área:</span>
        {user?.area && (
          <button
            onClick={() => setFiltroArea('mia')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filtroArea === 'mia' ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300'
            }`}
          >
            Mi área ({AREA_LABEL[user.area]})
          </button>
        )}
        {AREAS.map((a) => (
          <button
            key={a.valor}
            onClick={() => setFiltroArea(a.valor)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filtroArea === a.valor ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300'
            }`}
          >
            {a.label}
          </button>
        ))}
        <button
          onClick={() => setFiltroArea('todas')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            filtroArea === 'todas' ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300'
          }`}
        >
          Todas las áreas
        </button>
      </div>

      {cargando ? (
        <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : filtrados.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <div className="text-4xl mb-3">📋</div>
          <div className="font-medium">No hay proyectos</div>
          <div className="text-sm mt-1">
            {q
              ? `No hay proyectos que coincidan con "${busqueda}"`
              : filtro === 'todos'
              ? 'Crea el primer proyecto para comenzar'
              : `No hay proyectos con estado "${STATUS_CONFIG[filtro]?.label}"`}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {filtrados.map((p) => (
            <ProyectoRow key={p.id} proyecto={p} miembros={miembros} avatares={avatares} onConfirmarAnticipo={handleConfirmarAnticipo} />
          ))}
        </div>
      )}
    </Layout>
  )
}

function AttencionBanner({ proyectos, onIr }) {
  const items = proyectos
    .filter((p) => p.status !== 'completado' && p.status !== 'cancelado')
    .filter((p) => p.status === 'pendiente_anticipo' || tieneRespuestaNueva(p))
    .map((p) => ({
      proyecto: p,
      motivo: p.status === 'pendiente_anticipo' ? 'Anticipo pendiente de confirmar' : 'Respuesta nueva del cliente',
      Icono: p.status === 'pendiente_anticipo' ? AlertCircle : MessageCircle,
      color: p.status === 'pendiente_anticipo' ? 'text-red-600' : 'text-brand-700',
    }))

  if (!items.length) return null

  return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <AlertCircle size={16} className="text-red-600" />
        <span className="text-sm font-semibold text-slate-800">
          {items.length} proyecto{items.length > 1 ? 's' : ''} necesita{items.length > 1 ? 'n' : ''} tu atención
        </span>
      </div>
      {items.map(({ proyecto: p, motivo, Icono, color }) => (
        <button
          key={p.id}
          onClick={() => onIr(p.slug)}
          className="flex items-center justify-between gap-2 bg-white rounded-lg px-3 py-2 text-left hover:shadow-sm transition-shadow"
        >
          <span className="flex items-center gap-2 min-w-0">
            <Icono size={13} className={`shrink-0 ${color}`} />
            <span className="text-sm font-semibold text-slate-800 truncate">{p.cliente.nombreComercial}</span>
            <span className="text-xs text-slate-500 truncate">— {motivo}</span>
          </span>
          <ChevronRight size={14} className="text-slate-400 shrink-0" />
        </button>
      ))}
    </div>
  )
}

function StatDot({ color, label }) {
  return (
    <span className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
      <span className={`w-1.5 h-1.5 rounded-full ${color}`} />
      {label}
    </span>
  )
}

function diasRestantes(fechaISO) {
  if (!fechaISO) return null
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const fecha = new Date(fechaISO)
  fecha.setHours(0, 0, 0, 0)
  return Math.round((fecha - hoy) / 86400000)
}

function BadgeEntrega({ proyecto: p }) {
  if (p.tipo === 'continuo') return <Chip className="bg-slate-100 text-slate-500">Servicio continuo</Chip>
  if (p.status !== 'activo' && p.status !== 'en_pausa') return null
  const dias = diasRestantes(p.proyecto.fechaEstimadaEntrega)
  if (dias === null) return null
  if (dias < 0) return <Chip className="bg-red-100 text-red-700">Vencido hace {Math.abs(dias)} día{Math.abs(dias) === 1 ? '' : 's'}</Chip>
  if (dias <= 3) return <Chip className="bg-amber-100 text-amber-700">{dias === 0 ? 'Vence hoy' : `Vence en ${dias} día${dias === 1 ? '' : 's'}`}</Chip>
  return <Chip className="bg-slate-100 text-slate-500">Entrega en {dias} día{dias === 1 ? '' : 's'}</Chip>
}

function Chip({ children, className }) {
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${className}`}>{children}</span>
}

function AvatarStack({ miembros, avatares }) {
  if (!miembros.length) return null
  const visibles = miembros.slice(0, 3)
  const restantes = miembros.length - visibles.length
  return (
    <div className="flex items-center gap-1.5 shrink-0">
      {visibles.map((m) => (
        <Avatar key={m.id} nombre={m.nombre} avatarUrl={avatares[m.nombre]} size={24} />
      ))}
      {restantes > 0 && (
        <div className="w-6 h-6 rounded-full bg-slate-100 text-slate-500 text-[10px] font-semibold flex items-center justify-center shrink-0">
          +{restantes}
        </div>
      )}
    </div>
  )
}

function ProgressBar({ avance, faseActual, faseNombre }) {
  return (
    <div className="w-56 shrink-0">
      <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
        <span>Fase {faseActual} — {faseNombre}</span>
        <span className="font-semibold text-slate-700">{avance}%</span>
      </div>
      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className="h-full bg-brand-500 rounded-full transition-all" style={{ width: `${avance}%` }} />
      </div>
    </div>
  )
}

function KanbanBar({ counts }) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1
  return (
    <div className="w-56 shrink-0">
      <div className="h-1.5 rounded-full overflow-hidden flex gap-0.5 bg-slate-100">
        {KANBAN_COLUMNAS.map((c) => counts[c.columna] > 0 && (
          <div key={c.columna} className={`h-full ${KANBAN_SEGMENT_COLOR[c.columna]}`} style={{ width: `${(counts[c.columna] / total) * 100}%` }} />
        ))}
      </div>
      <div className="flex items-center gap-2.5 mt-1 text-[11px] text-slate-500">
        {KANBAN_COLUMNAS.map((c) => (
          <span key={c.columna}><span className="font-semibold text-slate-600">{counts[c.columna]}</span> {c.label}</span>
        ))}
      </div>
    </div>
  )
}

function ProyectoRow({ proyecto: p, miembros, avatares, onConfirmarAnticipo }) {
  const navigate = useNavigate()
  const esContinuo = p.tipo === 'continuo'
  const avance = calcularAvance(p)
  const faseActual = getFaseActual(p)
  const faseNombre = FASES.find((f) => f.numero === faseActual)?.nombre || ''
  const columnasCount = esContinuo ? contarPorColumna(p) : null
  const cfg = STATUS_CONFIG[p.status] || STATUS_CONFIG.activo
  const pendientesCliente = contarPendientesCliente(p)
  const respuestaNueva = tieneRespuestaNueva(p)
  const equipoProyecto = miembrosDelEquipo(p.equipo, miembros)
  const tareasVencidas = contarTareasVencidasCliente(p)

  const tareasDisponibles = p.tareas.filter((t) => {
    if (t.estado === 'completada' || t.estado === 'omitida') return false
    const completadasIds = new Set(p.tareas.filter((x) => x.estado === 'completada').map((x) => x.id))
    return !t.esCliente && t.dependencias.every((d) => completadasIds.has(d))
  }).length

  return (
    <div
      onClick={() => navigate(`/admin/proyecto/${p.slug}`)}
      className={`bg-white rounded-xl border p-4 cursor-pointer transition-all hover:shadow-md hover:-translate-y-0.5 flex flex-col gap-2.5 ${
        tareasVencidas > 0 ? 'border-red-300 ring-1 ring-red-200' : respuestaNueva ? 'border-brand-300 ring-1 ring-brand-200' : 'border-slate-200 hover:border-slate-300'
      }`}
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <h3 className="font-semibold text-slate-800 truncate">{p.cliente.nombreComercial}</h3>
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${cfg.color}`}>
            {cfg.icon}{cfg.label}
          </span>
          {respuestaNueva && (
            <Chip className="bg-brand-100 text-brand-800">
              <Bell size={11} /> Respuesta nueva
            </Chip>
          )}
          {pendientesCliente > 0 && (
            <Chip className="bg-amber-100 text-amber-700">
              <MessageCircle size={11} /> {pendientesCliente} pendiente{pendientesCliente > 1 ? 's' : ''} del cliente
            </Chip>
          )}
          {tareasVencidas > 0 && (
            <Chip className="bg-red-100 text-red-700">
              <AlertCircle size={11} /> {tareasVencidas} atrasada{tareasVencidas > 1 ? 's' : ''}
            </Chip>
          )}
          {p.areas?.map((a) => (
            <Chip key={a} className={AREA_COLOR[a] || 'bg-slate-100 text-slate-500'}>{AREA_LABEL[a] || a}</Chip>
          ))}
        </div>
        <BadgeEntrega proyecto={p} />
      </div>

      <div className="text-sm text-slate-500">
        {p.proyecto.paquete}
        {p.proyecto.extras?.length > 0 && ` · ${p.proyecto.extras.length} extra${p.proyecto.extras.length > 1 ? 's' : ''}`}
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        {p.status === 'pendiente_anticipo' ? (
          <>
            <span className="text-sm text-slate-400 flex items-center gap-2">
              <Clock size={12} />
              {equipoProyecto.length > 0 ? `Equipo: ${equipoProyecto.map((m) => m.nombre).join(', ')}` : 'Sin equipo asignado aún'}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onConfirmarAnticipo(p.slug)
              }}
              className="text-xs bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg transition-colors shrink-0"
            >
              Confirmar anticipo
            </button>
          </>
        ) : (
          <>
            <div className="flex items-center gap-4 min-w-0 flex-wrap">
              {esContinuo ? <KanbanBar counts={columnasCount} /> : <ProgressBar avance={avance} faseActual={faseActual} faseNombre={faseNombre} />}
              <AvatarStack miembros={equipoProyecto} avatares={avatares} />
            </div>
            {tareasDisponibles > 0 && (
              <span className="flex items-center gap-1 text-xs font-semibold bg-brand-100 text-brand-800 px-2.5 py-1 rounded-full shrink-0">
                {tareasDisponibles} disponible{tareasDisponibles > 1 ? 's' : ''}
                <ChevronRight size={12} />
              </span>
            )}
          </>
        )}
      </div>
    </div>
  )
}
