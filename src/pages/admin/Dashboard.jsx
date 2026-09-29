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
import { normalizarTexto } from '../../lib/texto'
import { AREAS, AREA_LABEL, AREA_COLOR } from '../../lib/areas'
import { useEventosGlobal } from '../../hooks/useEventos'
import { PlusCircle, Clock, CheckCircle2, PauseCircle, AlertCircle, ChevronRight, ChevronDown, Bell, MessageCircle, Search, X, LayoutList, LayoutGrid, CalendarDays, UserX } from 'lucide-react'

const STATUS_CONFIG = {
  activo: { label: 'Activo', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300', icon: <CheckCircle2 size={13} /> },
  en_pausa: { label: 'En pausa', color: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300', icon: <PauseCircle size={13} /> },
  pendiente_anticipo: { label: 'Pendiente anticipo', color: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300', icon: <AlertCircle size={13} /> },
  completado: { label: 'Completado', color: 'bg-slate-100 text-slate-600 dark:bg-ink-700 dark:text-ink-300', icon: <CheckCircle2 size={13} /> },
  cancelado: { label: 'Cancelado', color: 'bg-slate-100 text-slate-500 dark:bg-ink-700 dark:text-ink-300', icon: null },
}

const KANBAN_COUNT_COLOR = {
  todo: 'text-slate-700 dark:text-ink-100',
  doing: 'text-blue-700 dark:text-blue-400',
  revision: 'text-amber-700 dark:text-amber-400',
  done: 'text-emerald-700 dark:text-emerald-400',
}

// Salud del proyecto — la clasifica el server (calcularSalud) y aquí solo se
// muestra. "Atrasado" = tareas del cliente con plazo vencido o del equipo con
// fecha límite pasada; "Estancado" = sin movimiento hace 7+ días.
const SALUD_CONFIG = {
  atrasado: { label: 'Atrasado', icon: AlertCircle, chip: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300', borde: 'border-red-300 dark:border-red-800 ring-1 ring-red-200 dark:ring-red-900/40' },
  estancado: { label: 'Estancado', icon: Clock, chip: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300', borde: 'border-amber-300 dark:border-amber-700' },
  avanza: { label: 'En curso', icon: CheckCircle2, chip: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300', borde: null },
}

const MOTIVO_ESTILO = {
  cliente_vencido: { Icono: AlertCircle, color: 'text-red-600 dark:text-red-400' },
  equipo_vencido: { Icono: AlertCircle, color: 'text-red-600 dark:text-red-400' },
  inactividad: { Icono: Clock, color: 'text-amber-600 dark:text-amber-400' },
  cliente_esperando: { Icono: MessageCircle, color: 'text-brand-700 dark:text-brand-400' },
  equipo_sin_fechas: { Icono: CalendarDays, color: 'text-slate-400 dark:text-ink-400' },
  equipo_sin_responsable: { Icono: UserX, color: 'text-amber-600 dark:text-amber-400' },
}

// Atrasados primero, luego estancados, luego el resto por nombre de cliente.
const PRIORIDAD_SALUD = { atrasado: 0, estancado: 1, avanza: 2 }
function ordenSalud(a, b) {
  const pa = PRIORIDAD_SALUD[a.salud?.nivel] ?? 3
  const pb = PRIORIDAD_SALUD[b.salud?.nivel] ?? 3
  if (pa !== pb) return pa - pb
  return (a.cliente?.nombreComercial || '').localeCompare(b.cliente?.nombreComercial || '')
}

export default function AdminDashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [proyectos, setProyectos] = useState([])
  const [miembros, setMiembros] = useState([])
  const [avatares, setAvatares] = useState({})
  const [filtro, setFiltro] = useState('activo')
  const [filtroArea, setFiltroArea] = useState('mia')
  const [filtroSalud, setFiltroSalud] = useState('todos')
  const [busqueda, setBusqueda] = useState('')
  const [cargando, setCargando] = useState(true)
  const [vista, setVista] = useState(() => localStorage.getItem('foco-vista-proyectos') || 'lista')
  const [saludAbierto, setSaludAbierto] = useState(null)

  function cambiarVista(nueva) {
    setVista(nueva)
    localStorage.setItem('foco-vista-proyectos', nueva)
  }

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

  const q = normalizarTexto(busqueda)
  const objetivoArea = filtroArea === 'todas' ? null : filtroArea === 'mia' ? user?.area : filtroArea
  const filtrados = proyectos
    .filter((p) => filtro === 'todos' || p.status === filtro)
    .filter((p) => !objetivoArea || !p.areas?.length || p.areas.includes(objetivoArea))
    .filter((p) => !q || normalizarTexto(p.cliente.nombreComercial).includes(q) || normalizarTexto(p.proyecto.paquete).includes(q))

  const counts = {
    activo: proyectos.filter((p) => p.status === 'activo').length,
    en_pausa: proyectos.filter((p) => p.status === 'en_pausa').length,
    pendiente_anticipo: proyectos.filter((p) => p.status === 'pendiente_anticipo').length,
    completado: proyectos.filter((p) => p.status === 'completado').length,
  }
  const saludCounts = {
    atrasado: proyectos.filter((p) => p.salud?.nivel === 'atrasado').length,
    estancado: proyectos.filter((p) => p.salud?.nivel === 'estancado').length,
  }

  // Vista de lista: finitos primero, continuos después; atrasados arriba.
  const visibles = filtroSalud === 'todos' ? filtrados : filtrados.filter((p) => p.salud?.nivel === filtroSalud)
  const finitos = visibles.filter((p) => p.tipo === 'finito').sort(ordenSalud)
  const continuos = visibles.filter((p) => p.tipo === 'continuo').sort(ordenSalud)

  return (
    <Layout titulo="Proyectos">
      <div className="flex flex-col gap-5 mb-6">
        <AttencionBanner proyectos={proyectos} onIr={(slug) => navigate(`/admin/proyecto/${slug}`)} />

        <div className="flex items-center gap-6 flex-wrap">
          <StatDot color="bg-emerald-500" label={`${counts.activo} activo${counts.activo === 1 ? '' : 's'}`} />
          <StatDot color="bg-red-500" label={`${saludCounts.atrasado} atrasado${saludCounts.atrasado === 1 ? '' : 's'}`} />
          <StatDot color="bg-amber-500" label={`${saludCounts.estancado} estancado${saludCounts.estancado === 1 ? '' : 's'}`} />
          <StatDot color="bg-slate-400 dark:bg-ink-400" label={`${counts.en_pausa} en pausa`} />
          <StatDot color="bg-slate-400 dark:bg-ink-400" label={`${counts.completado} completado${counts.completado === 1 ? '' : 's'}`} />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="relative w-full sm:w-72">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-ink-400" />
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar proyecto..."
            className="w-full pl-9 pr-8 py-2 text-sm bg-white dark:bg-ink-800 text-slate-800 dark:text-ink-100 placeholder:text-slate-400 dark:placeholder:text-ink-400 border border-slate-200 dark:border-ink-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300 dark:focus:ring-brand-500/40 focus:border-brand-300 dark:focus:border-brand-500"
          />
          {busqueda && (
            <button
              onClick={() => setBusqueda('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-ink-400 hover:text-slate-600 dark:hover:text-ink-300"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="inline-flex p-1 bg-slate-100 dark:bg-ink-900 rounded-lg" aria-label="Vista de proyectos">
            <button
              onClick={() => cambiarVista('lista')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors ${vista === 'lista' ? 'bg-white dark:bg-ink-700 text-slate-800 dark:text-ink-100 shadow-sm' : 'text-slate-500 dark:text-ink-400'}`}
              aria-pressed={vista === 'lista'}
            >
              <LayoutList size={15} /> Lista
            </button>
            <button
              onClick={() => cambiarVista('tarjetas')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors ${vista === 'tarjetas' ? 'bg-white dark:bg-ink-700 text-slate-800 dark:text-ink-100 shadow-sm' : 'text-slate-500 dark:text-ink-400'}`}
              aria-pressed={vista === 'tarjetas'}
            >
              <LayoutGrid size={15} /> Tarjetas
            </button>
          </div>
          <Link
            to="/admin/proyecto/nuevo"
            className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-slate-900 text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            <PlusCircle size={16} />
            Nuevo proyecto
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        {['todos', 'activo', 'en_pausa', 'pendiente_anticipo', 'completado'].map((f) => (
          <button
            key={f}
            onClick={() => setFiltro(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filtro === f
                ? 'bg-brand-500 text-slate-900'
                : 'bg-white dark:bg-ink-800 text-slate-600 dark:text-ink-300 border border-slate-200 dark:border-ink-500 hover:border-slate-300 dark:hover:border-ink-400'
            }`}
          >
            {f === 'todos' ? 'Todos' : STATUS_CONFIG[f]?.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-5">
        <span className="text-xs text-slate-400 dark:text-ink-400">Área:</span>
        {user?.area && (
          <button
            onClick={() => setFiltroArea('mia')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filtroArea === 'mia'
                ? 'bg-slate-800 dark:bg-ink-600 text-white'
                : 'bg-white dark:bg-ink-800 text-slate-600 dark:text-ink-300 border border-slate-200 dark:border-ink-500 hover:border-slate-300 dark:hover:border-ink-400'
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
              filtroArea === a.valor
                ? 'bg-slate-800 dark:bg-ink-600 text-white'
                : 'bg-white dark:bg-ink-800 text-slate-600 dark:text-ink-300 border border-slate-200 dark:border-ink-500 hover:border-slate-300 dark:hover:border-ink-400'
            }`}
          >
            {a.label}
          </button>
        ))}
        <button
          onClick={() => setFiltroArea('todas')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            filtroArea === 'todas'
              ? 'bg-slate-800 dark:bg-ink-600 text-white'
              : 'bg-white dark:bg-ink-800 text-slate-600 dark:text-ink-300 border border-slate-200 dark:border-ink-500 hover:border-slate-300 dark:hover:border-ink-400'
          }`}
        >
          Todas las áreas
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-5">
        <span className="text-xs text-slate-400 dark:text-ink-400">Salud:</span>
        {[
          ['todos', 'Todos'],
          ['atrasado', `Atrasados (${saludCounts.atrasado})`],
          ['estancado', `Estancados (${saludCounts.estancado})`],
          ['avanza', 'En curso'],
        ].map(([valor, label]) => (
          <button
            key={valor}
            onClick={() => setFiltroSalud(valor)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filtroSalud === valor
                ? 'bg-slate-800 dark:bg-ink-600 text-white'
                : 'bg-white dark:bg-ink-800 text-slate-600 dark:text-ink-300 border border-slate-200 dark:border-ink-500 hover:border-slate-300 dark:hover:border-ink-400'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {cargando ? (
        <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : visibles.length === 0 ? (
        <div className="text-center py-16 text-slate-400 dark:text-ink-400">
          <div className="text-4xl mb-3">📋</div>
          <div className="font-medium">No hay proyectos</div>
          <div className="text-sm mt-1">
            {q
              ? `No hay proyectos que coincidan con "${busqueda}"`
              : filtroSalud !== 'todos'
              ? `No hay proyectos con salud "${filtroSalud === 'avanza' ? 'En curso' : SALUD_CONFIG[filtroSalud]?.label}"`
              : filtro === 'todos'
              ? 'Crea el primer proyecto para comenzar'
              : `No hay proyectos con estado "${STATUS_CONFIG[filtro]?.label}"`}
          </div>
        </div>
      ) : vista === 'lista' ? (
        <div className="flex flex-col gap-6">
          {[
            ['Finitos', finitos],
            ['Continuos', continuos],
          ].map(([titulo, lista]) => lista.length > 0 && (
            <section key={titulo}>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-ink-400 mb-2 px-1">
                {titulo} <span className="font-normal normal-case">({lista.length})</span>
              </h3>
              <div className="flex flex-col gap-2">
                {lista.map((p) => (
                  <ProyectoRow
                    key={p.id}
                    proyecto={p}
                    expandido={saludAbierto === p.id}
                    onToggleMotivos={() => setSaludAbierto(saludAbierto === p.id ? null : p.id)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
          {visibles.map((p) => (
            <ProyectoCard key={p.id} proyecto={p} miembros={miembros} avatares={avatares} onConfirmarAnticipo={handleConfirmarAnticipo} />
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
      color: p.status === 'pendiente_anticipo' ? 'text-red-600 dark:text-red-400' : 'text-brand-700 dark:text-brand-400',
    }))

  if (!items.length) return null

  return (
    <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-xl p-4 flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <AlertCircle size={16} className="text-red-600 dark:text-red-400" />
        <span className="text-sm font-semibold text-slate-800 dark:text-ink-100">
          {items.length} proyecto{items.length > 1 ? 's' : ''} necesita{items.length > 1 ? 'n' : ''} tu atención
        </span>
      </div>
      {items.map(({ proyecto: p, motivo, Icono, color }) => (
        <button
          key={p.id}
          onClick={() => onIr(p.slug)}
          className="flex items-center justify-between gap-2 bg-white dark:bg-ink-800 rounded-lg px-3 py-2 text-left hover:shadow-sm transition-shadow"
        >
          <span className="flex items-center gap-2 min-w-0">
            <Icono size={13} className={`shrink-0 ${color}`} />
            <span className="text-sm font-semibold text-slate-800 dark:text-ink-100 truncate">{p.cliente.nombreComercial}</span>
            <span className="text-xs text-slate-500 dark:text-ink-300 truncate">— {motivo}</span>
          </span>
          <ChevronRight size={14} className="text-slate-400 dark:text-ink-400 shrink-0" />
        </button>
      ))}
    </div>
  )
}

function StatDot({ color, label }) {
  return (
    <span className="flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-ink-300">
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
  if (p.tipo === 'continuo') return <Chip className="bg-slate-100 dark:bg-ink-700 text-slate-500 dark:text-ink-300">Servicio continuo</Chip>
  if (p.status !== 'activo' && p.status !== 'en_pausa') return null
  const dias = diasRestantes(p.proyecto.fechaEstimadaEntrega)
  if (dias === null) return null
  if (dias < 0) return <Chip className="bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-300">Vencido hace {Math.abs(dias)} día{Math.abs(dias) === 1 ? '' : 's'}</Chip>
  if (dias <= 3) return <Chip className="bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300">{dias === 0 ? 'Vence hoy' : `Vence en ${dias} día${dias === 1 ? '' : 's'}`}</Chip>
  return <Chip className="bg-slate-100 dark:bg-ink-700 text-slate-500 dark:text-ink-300">Entrega en {dias} día{dias === 1 ? '' : 's'}</Chip>
}

function Chip({ children, className }) {
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${className}`}>{children}</span>
}

// Fila de la vista de lista: todo el panorama de un vistazo — nombre,
// paquete/etiquetas, avance (finito) o conteos Kanban (continuo), última
// actividad y badge de salud expandible con los motivos concretos.
function ProyectoRow({ proyecto: p, expandido, onToggleMotivos }) {
  const navigate = useNavigate()
  const esContinuo = p.tipo === 'continuo'
  const avance = calcularAvance(p)
  const faseActual = getFaseActual(p)
  const faseNombre = FASES.find((f) => f.numero === faseActual)?.nombre || ''
  const columnasCount = esContinuo ? contarPorColumna(p) : null
  const cfg = STATUS_CONFIG[p.status] || STATUS_CONFIG.activo
  const salud = p.salud
  const saludCfg = SALUD_CONFIG[salud?.nivel]
  const tieneMotivos = (salud?.motivos?.length || 0) > 0

  return (
    <div
      onClick={() => navigate(`/admin/proyecto/${p.slug}`)}
      className={`bg-white dark:bg-ink-800 rounded-xl border cursor-pointer transition-all hover:shadow-md ${
        saludCfg?.borde || 'border-slate-200 dark:border-ink-500 hover:border-slate-300 dark:hover:border-ink-400'
      }`}
    >
      <div className="flex items-center gap-3 px-4 py-3 flex-wrap lg:flex-nowrap">
        <div className="min-w-0 flex-1 basis-52">
          <div className="flex items-center gap-2 min-w-0">
            <h3 className="font-semibold text-slate-800 dark:text-ink-100 text-[15px] truncate">{p.cliente.nombreComercial}</h3>
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold shrink-0 ${cfg.color}`}>
              {cfg.icon}{cfg.label}
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5 min-w-0 flex-wrap">
            <span className="text-xs text-slate-500 dark:text-ink-300 truncate">{p.proyecto.paquete}</span>
            {(p.etiquetas || []).map((e) => (
              <span key={e} className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 dark:bg-ink-700 text-slate-500 dark:text-ink-300">{e}</span>
            ))}
          </div>
        </div>

        <div className="w-44 shrink-0 hidden sm:block">
          {esContinuo ? (
            <div className="flex items-center gap-2.5">
              {KANBAN_COLUMNAS.map((c) => (
                <span key={c.columna} className="text-xs whitespace-nowrap">
                  <span className={`font-bold ${KANBAN_COUNT_COLOR[c.columna]}`}>{columnasCount[c.columna]}</span>
                  <span className="text-[10px] text-slate-400 dark:text-ink-400 ml-0.5">{c.columna === 'revision' ? 'Rev' : c.label}</span>
                </span>
              ))}
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-ink-300 mb-1">
                <span className="truncate">Fase {faseActual} — {faseNombre}</span>
                <span className="font-semibold text-slate-700 dark:text-ink-100 ml-1.5 shrink-0">{avance}%</span>
              </div>
              <div className="h-1.5 bg-slate-100 dark:bg-ink-700 rounded-full overflow-hidden">
                <div className="h-full bg-brand-500 rounded-full transition-all" style={{ width: `${avance}%` }} />
              </div>
            </div>
          )}
        </div>

        {salud?.diasSinActividad != null && (
          <span
            className={`text-xs whitespace-nowrap shrink-0 ${salud.diasSinActividad >= 7 ? 'text-red-600 dark:text-red-400 font-medium' : 'text-slate-400 dark:text-ink-400'}`}
            title={salud.ultimaActividad ? `Última actividad: ${new Date(salud.ultimaActividad).toLocaleString()}` : undefined}
          >
            {salud.diasSinActividad === 0 ? 'actividad hoy' : `hace ${salud.diasSinActividad} día${salud.diasSinActividad === 1 ? '' : 's'}`}
          </span>
        )}

        {p.salud?.tareasEquipoSinResponsable > 0 && (
          <Chip className="bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300">
            <UserX size={11} /> {p.salud.tareasEquipoSinResponsable} sin responsable
          </Chip>
        )}

        <BadgeEntrega proyecto={p} />

        {saludCfg && (
          <button
            onClick={(e) => {
              if (!tieneMotivos) return
              e.stopPropagation()
              onToggleMotivos()
            }}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium shrink-0 ${saludCfg.chip} ${tieneMotivos ? 'cursor-pointer' : 'cursor-default'}`}
            title={tieneMotivos ? 'Ver motivos' : undefined}
          >
            <saludCfg.icon size={11} />
            {saludCfg.label}
            {tieneMotivos && <ChevronDown size={12} className={`transition-transform ${expandido ? 'rotate-180' : ''}`} />}
          </button>
        )}
      </div>

      {expandido && tieneMotivos && (
        <div className="border-t border-slate-100 dark:border-ink-500 px-4 py-2.5 flex flex-col gap-1.5" onClick={(e) => e.stopPropagation()}>
          {salud.motivos.map((m) => {
            const estilo = MOTIVO_ESTILO[m.tipo] || MOTIVO_ESTILO.equipo_sin_fechas
            const Icono = estilo.Icono
            return (
              <div key={m.tipo} className="flex items-start gap-1.5 text-xs text-slate-600 dark:text-ink-300">
                <Icono size={12} className={`shrink-0 mt-0.5 ${estilo.color}`} />
                <span>{m.detalle}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
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
        <div className="w-6 h-6 rounded-full bg-slate-100 dark:bg-ink-700 text-slate-500 dark:text-ink-300 text-[10px] font-semibold flex items-center justify-center shrink-0">
          +{restantes}
        </div>
      )}
    </div>
  )
}

function ProgressBar({ avance, faseActual, faseNombre }) {
  return (
    <div className="w-full">
      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-ink-300 mb-1.5">
        <span className="truncate">Fase {faseActual} — {faseNombre}</span>
        <span className="font-semibold text-slate-700 dark:text-ink-100 shrink-0 ml-2">{avance}%</span>
      </div>
      <div className="h-1.5 bg-slate-100 dark:bg-ink-700 rounded-full overflow-hidden">
        <div className="h-full bg-brand-500 rounded-full transition-all" style={{ width: `${avance}%` }} />
      </div>
    </div>
  )
}

function KanbanMini({ counts }) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {KANBAN_COLUMNAS.map((c) => (
        <div key={c.columna} className="bg-slate-50 dark:bg-ink-900 rounded-lg py-2 flex flex-col items-center gap-0.5">
          <span className={`text-base font-bold ${KANBAN_COUNT_COLOR[c.columna]}`}>{counts[c.columna]}</span>
          <span className="text-[10px] font-medium text-slate-400 dark:text-ink-400">{c.label}</span>
        </div>
      ))}
    </div>
  )
}

function ProyectoCard({ proyecto: p, miembros, avatares, onConfirmarAnticipo }) {
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
  const nivelSalud = p.salud?.nivel
  const SaludIcono = nivelSalud ? SALUD_CONFIG[nivelSalud].icon : null

  const tareasDisponibles = p.tareas.filter((t) => {
    if (t.estado === 'completada' || t.estado === 'omitida') return false
    const completadasIds = new Set(p.tareas.filter((x) => x.estado === 'completada').map((x) => x.id))
    return !t.esCliente && t.dependencias.every((d) => completadasIds.has(d))
  }).length

  const etiquetas = [
    respuestaNueva && (
      <Chip key="respuesta" className="bg-brand-100 dark:bg-brand-500/15 text-brand-800 dark:text-brand-300">
        <Bell size={11} /> Respuesta nueva
      </Chip>
    ),
    pendientesCliente > 0 && (
      <Chip key="pendientes" className="bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300">
        <MessageCircle size={11} /> {pendientesCliente} pendiente{pendientesCliente > 1 ? 's' : ''}
      </Chip>
    ),
    tareasVencidas > 0 && (
      <Chip key="vencidas" className="bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-300">
        <AlertCircle size={11} /> {tareasVencidas} atrasada{tareasVencidas > 1 ? 's' : ''}
      </Chip>
    ),
    (nivelSalud === 'atrasado' || nivelSalud === 'estancado') && (
      <Chip key="salud" className={SALUD_CONFIG[nivelSalud].chip}>
        <SaludIcono size={11} /> {SALUD_CONFIG[nivelSalud].label}
      </Chip>
    ),
    p.salud?.tareasEquipoSinResponsable > 0 && (
      <Chip key="sinresp" className="bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300">
        <UserX size={11} /> {p.salud.tareasEquipoSinResponsable} sin responsable
      </Chip>
    ),
    ...(p.areas?.map((a) => (
      <Chip key={a} className={AREA_COLOR[a] || 'bg-slate-100 dark:bg-ink-700 text-slate-500 dark:text-ink-300'}>{AREA_LABEL[a] || a}</Chip>
    )) || []),
  ].filter(Boolean)

  return (
    <div
      onClick={() => navigate(`/admin/proyecto/${p.slug}`)}
      className={`bg-white dark:bg-ink-800 rounded-xl border p-5 cursor-pointer transition-all hover:shadow-md hover:-translate-y-0.5 flex flex-col gap-3.5 ${
        nivelSalud === 'atrasado'
          ? 'border-red-300 dark:border-red-800 ring-1 ring-red-200 dark:ring-red-900/40'
          : nivelSalud === 'estancado'
          ? 'border-amber-300 dark:border-amber-700'
          : respuestaNueva
          ? 'border-brand-300 dark:border-brand-700 ring-1 ring-brand-200 dark:ring-brand-900/30'
          : 'border-slate-200 dark:border-ink-500 hover:border-slate-300 dark:hover:border-ink-400'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold shrink-0 ${cfg.color}`}>
          {cfg.icon}{cfg.label}
        </span>
        <BadgeEntrega proyecto={p} />
      </div>

      <div className="min-w-0">
        <h3 className="font-semibold text-slate-800 dark:text-ink-100 text-[17px] truncate">{p.cliente.nombreComercial}</h3>
        <p className="text-sm text-slate-500 dark:text-ink-300 truncate">
          {p.proyecto.paquete}
          {p.proyecto.extras?.length > 0 && ` · ${p.proyecto.extras.length} extra${p.proyecto.extras.length > 1 ? 's' : ''}`}
        </p>
      </div>

      {etiquetas.length > 0 && <div className="flex flex-wrap gap-1.5">{etiquetas}</div>}

      {p.status === 'pendiente_anticipo' ? (
        <div className="mt-auto pt-3.5 border-t border-slate-100 dark:border-ink-500 flex items-center justify-between gap-2">
          <span className="text-xs text-slate-400 dark:text-ink-400 flex items-center gap-1.5 min-w-0 truncate">
            <Clock size={12} className="shrink-0" />
            {equipoProyecto.length > 0 ? `Equipo: ${equipoProyecto.map((m) => m.nombre).join(', ')}` : 'Sin equipo asignado'}
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
        </div>
      ) : (
        <>
          {esContinuo ? <KanbanMini counts={columnasCount} /> : <ProgressBar avance={avance} faseActual={faseActual} faseNombre={faseNombre} />}

          <div className="mt-auto pt-3.5 border-t border-slate-100 dark:border-ink-500 flex items-center justify-between gap-2">
            <span className="flex items-center gap-1 text-sm font-semibold text-slate-800 dark:text-ink-100 shrink-0">
              Ver proyecto
              <ChevronRight size={14} />
            </span>
            <div className="flex items-center gap-2 min-w-0">
              {tareasDisponibles > 0 && (
                <span className="text-xs font-semibold bg-brand-100 dark:bg-brand-500/15 text-brand-800 dark:text-brand-300 px-2 py-0.5 rounded-full shrink-0">
                  {tareasDisponibles} disp.
                </span>
              )}
              <AvatarStack miembros={equipoProyecto} avatares={avatares} />
            </div>
          </div>
        </>
      )}
    </div>
  )
}
