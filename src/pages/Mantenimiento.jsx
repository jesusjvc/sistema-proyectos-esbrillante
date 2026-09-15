import { useEffect, useRef, useState } from 'react'
import Layout from '../components/Layout'
import { useAuth } from '../context/AuthContext'
import { useEventosGlobal } from '../hooks/useEventos'
import {
  actualizarIncidencia, buscarClientesCrm, crearIncidencia, crearSitio,
  getCliente, getClientes, getIncidencias, getMiembros,
  registrarClienteCrm, vincularClienteCrm,
} from '../data/api'
import {
  AlertCircle, ArrowUpDown,
  Building2, ChevronDown, Columns3, ExternalLink, Filter, LayoutList, Plus, Search, SlidersHorizontal,
  UserRound, UserPlus, Wrench, X,
} from 'lucide-react'

const ESTADOS = [
  { value: 'todo', label: 'Por hacer', dot: 'bg-slate-400', badge: 'bg-slate-100 text-slate-700 dark:bg-ink-700 dark:text-ink-300' },
  { value: 'doing', label: 'En curso', dot: 'bg-blue-500', badge: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300' },
  { value: 'revision', label: 'En revisión', dot: 'bg-amber-500', badge: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' },
  { value: 'done', label: 'Resuelto', dot: 'bg-emerald-500', badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' },
]

const PRIORIDADES = [
  { value: 'urgente', label: 'Urgente', className: 'text-red-700 bg-red-50 dark:text-red-300 dark:bg-red-500/10' },
  { value: 'normal', label: 'Normal', className: 'text-slate-600 bg-slate-100 dark:text-ink-300 dark:bg-ink-700' },
  { value: 'cuando_se_pueda', label: 'Cuando se pueda', className: 'text-slate-500 bg-slate-50 dark:text-ink-400 dark:bg-ink-900' },
]

const COBERTURAS = [
  ['por_valorar', 'Por valorar'],
  ['incluido', 'Incluido'],
  ['cortesia', 'Cortesía'],
  ['adicional', 'Adicional'],
]

const INFRAESTRUCTURAS = [
  ['sin_localizar', 'Sin localizar'],
  ['esbrillante', 'EsBrillante'],
  ['externa', 'Externa'],
]

const TIPOS = [
  ['falla', 'Falla'],
  ['actualizacion', 'Actualización'],
  ['preventivo', 'Preventivo'],
  ['consulta', 'Consulta'],
]

const ORIGENES = [
  ['interno', 'Interno'],
  ['whatsapp', 'WhatsApp'],
  ['telefono', 'Teléfono'],
  ['monitoreo', 'Monitoreo'],
]

const PRIORIDAD_ORDEN = { urgente: 0, normal: 1, cuando_se_pueda: 2 }
const inputCls = 'w-full h-11 md:h-10 border border-slate-200 dark:border-ink-500 rounded-lg px-3 text-sm text-slate-800 dark:text-ink-100 bg-white dark:bg-ink-900 outline-none focus:ring-2 focus:ring-brand-400/60 focus:border-brand-400'
const textareaCls = `${inputCls} h-auto min-h-24 py-2.5 resize-y`

function opcionLabel(opciones, valor) {
  return opciones.find(([value]) => value === valor)?.[1] || valor
}

function estadoInfo(valor) {
  return ESTADOS.find((estado) => estado.value === valor) || ESTADOS[0]
}

function prioridadInfo(valor) {
  return PRIORIDADES.find((prioridad) => prioridad.value === valor) || PRIORIDADES[1]
}

function folio(numero) {
  return `WEB-${String(numero).padStart(4, '0')}`
}

function antiguedad(fecha) {
  const minutos = Math.max(0, Math.floor((Date.now() - new Date(fecha).getTime()) / 60000))
  if (minutos < 2) return 'Ahora'
  if (minutos < 60) return `Hace ${minutos} min`
  const horas = Math.floor(minutos / 60)
  if (horas < 24) return `Hace ${horas} h`
  const dias = Math.floor(horas / 24)
  return `Hace ${dias} día${dias === 1 ? '' : 's'}`
}

function dominioSitio(sitio) {
  if (sitio?.dominio) return sitio.dominio
  try {
    return new URL(sitio?.url).hostname.replace(/^www\./, '')
  } catch {
    return sitio?.url || 'Sitio sin dominio'
  }
}

export default function Mantenimiento() {
  const { user } = useAuth()
  const [incidencias, setIncidencias] = useState([])
  const [clientes, setClientes] = useState([])
  const [miembros, setMiembros] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [estado, setEstado] = useState('abiertos')
  const [prioridad, setPrioridad] = useState('todas')
  const [responsable, setResponsable] = useState('todos')
  const [mostrarFiltros, setMostrarFiltros] = useState(false)
  const [orden, setOrden] = useState('prioridad')
  const [seleccionados, setSeleccionados] = useState([])
  const [vista, setVista] = useState(() => localStorage.getItem('mantenimientoVista') || 'lista')
  const [panel, setPanel] = useState(null)

  async function cargar() {
    try {
      const [tickets, clientesData, miembrosData] = await Promise.all([getIncidencias(), getClientes(), getMiembros()])
      setIncidencias(tickets)
      setClientes(clientesData)
      setMiembros(miembrosData.filter((miembro) => miembro.activo !== false))
      setError('')
    } catch (err) {
      setError(err.message || 'No pudimos cargar mantenimiento')
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => { cargar() }, [])
  useEventosGlobal(true, cargar)

  function cambiarVista(nuevaVista) {
    setVista(nuevaVista)
    localStorage.setItem('mantenimientoVista', nuevaVista)
  }

  async function actualizar(id, cambios) {
    const actualizado = await actualizarIncidencia(id, cambios)
    setIncidencias((actuales) => actuales.map((ticket) => ticket.id === id ? actualizado : ticket))
    setPanel((actual) => actual?.id === id ? actualizado : actual)
  }

  const q = busqueda.trim().toLowerCase()
  const filtradas = incidencias
    .filter((ticket) => estado === 'todos' || (estado === 'abiertos' ? ticket.estado !== 'done' : ticket.estado === estado))
    .filter((ticket) => prioridad === 'todas' || ticket.prioridad === prioridad)
    .filter((ticket) => responsable === 'todos' || (responsable === 'sin_asignar' ? !ticket.responsableId : ticket.responsableId === responsable))
    .filter((ticket) => !q || [ticket.titulo, ticket.descripcion, ticket.cliente.nombreComercial, dominioSitio(ticket.sitio), folio(ticket.folio)].some((valor) => valor?.toLowerCase().includes(q)))
    .sort((a, b) => {
      if (orden === 'antiguos') return new Date(a.creadoEn) - new Date(b.creadoEn)
      if (orden === 'limite') return (a.fechaLimite ? new Date(a.fechaLimite) : Infinity) - (b.fechaLimite ? new Date(b.fechaLimite) : Infinity)
      return PRIORIDAD_ORDEN[a.prioridad] - PRIORIDAD_ORDEN[b.prioridad] || new Date(a.creadoEn) - new Date(b.creadoEn)
    })

  const stats = {
    abiertos: incidencias.filter((ticket) => ticket.estado !== 'done').length,
    urgentes: incidencias.filter((ticket) => ticket.estado !== 'done' && ticket.prioridad === 'urgente').length,
    sinAsignar: incidencias.filter((ticket) => ticket.estado !== 'done' && !ticket.responsableId).length,
    revision: incidencias.filter((ticket) => ticket.estado === 'revision').length,
  }

  const miembrosPorId = Object.fromEntries(miembros.map((miembro) => [miembro.id, miembro]))
  const filtrosActivos = Number(prioridad !== 'todas') + Number(responsable !== 'todos')

  async function aplicarMasivo(cambios) {
    await Promise.all(seleccionados.map((id) => actualizar(id, cambios)))
    setSeleccionados([])
  }

  return (
    <Layout
      titulo="Mantenimiento Web"
      acciones={
        <button onClick={() => setPanel('nuevo')} aria-label="Nuevo ticket" className="h-11 md:h-10 inline-flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-slate-900 px-4 rounded-lg text-sm font-semibold transition-colors">
          <Plus size={17} /> <span className="hidden sm:inline">Nuevo ticket</span>
        </button>
      }
    >
      <div className="h-full flex flex-col min-h-0 -m-6">
        <div className="px-6 pt-5 pb-4 bg-white dark:bg-ink-800 border-b border-slate-200 dark:border-ink-500 shrink-0">
          <div className="flex items-center gap-x-6 gap-y-2 flex-wrap mb-4">
            <Resumen label="Abiertos" valor={stats.abiertos} color="bg-slate-500" />
            <Resumen label="Urgentes" valor={stats.urgentes} color="bg-red-500" />
            <Resumen label="Sin asignar" valor={stats.sinAsignar} color="bg-amber-500" />
            <Resumen label="En revisión" valor={stats.revision} color="bg-blue-500" />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-56 max-w-xl">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-ink-400" />
              <label htmlFor="buscar-ticket" className="sr-only">Buscar ticket, cliente o dominio</label>
              <input id="buscar-ticket" value={busqueda} onChange={(event) => setBusqueda(event.target.value)} className={`${inputCls} pl-9 pr-9`} placeholder="Buscar ticket, cliente o dominio..." />
              {busqueda && <button onClick={() => setBusqueda('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 dark:hover:text-ink-100" aria-label="Limpiar busqueda"><X size={14} /></button>}
            </div>

            <div className="inline-flex h-11 md:h-10 p-1 bg-slate-100 dark:bg-ink-900 rounded-lg" aria-label="Vista">
              <button onClick={() => cambiarVista('lista')} className={`inline-flex items-center gap-1.5 px-3 rounded-md text-sm transition-colors ${vista === 'lista' ? 'bg-white dark:bg-ink-700 text-slate-800 dark:text-ink-100 shadow-sm' : 'text-slate-500 dark:text-ink-400'}`} aria-pressed={vista === 'lista'}><LayoutList size={15} /> Lista</button>
              <button onClick={() => cambiarVista('kanban')} className={`inline-flex items-center gap-1.5 px-3 rounded-md text-sm transition-colors ${vista === 'kanban' ? 'bg-white dark:bg-ink-700 text-slate-800 dark:text-ink-100 shadow-sm' : 'text-slate-500 dark:text-ink-400'}`} aria-pressed={vista === 'kanban'}><Columns3 size={15} /> Kanban</button>
            </div>

            <button onClick={() => setMostrarFiltros((valor) => !valor)} className={`h-11 md:h-10 inline-flex items-center gap-2 px-3 border rounded-lg text-sm transition-colors ${mostrarFiltros || filtrosActivos ? 'border-brand-400 bg-brand-50 text-brand-800 dark:bg-brand-500/10 dark:text-brand-300' : 'border-slate-200 dark:border-ink-500 text-slate-600 dark:text-ink-300 bg-white dark:bg-ink-800'}`}>
              <SlidersHorizontal size={15} /> Filtros {filtrosActivos > 0 && <span className="min-w-5 h-5 px-1 rounded-full bg-brand-500 text-slate-900 text-xs font-bold inline-flex items-center justify-center">{filtrosActivos}</span>}
            </button>
          </div>

          <div className="flex items-center gap-2 mt-3 overflow-x-auto pb-0.5">
            {[['abiertos', 'Todos abiertos'], ['todo', 'Por hacer'], ['doing', 'En curso'], ['revision', 'Revisión'], ['done', 'Resueltos'], ['todos', 'Todos']].map(([value, label]) => (
              <button key={value} onClick={() => setEstado(value)} className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${estado === value ? 'bg-ink-950 text-white dark:bg-brand-500 dark:text-slate-900' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-ink-700 dark:text-ink-300 dark:hover:bg-ink-600'}`}>{label}</button>
            ))}
          </div>

          {mostrarFiltros && (
            <div className="mt-3 pt-3 border-t border-slate-100 dark:border-ink-500 flex items-end gap-3 flex-wrap">
              <Filtro label="Prioridad" value={prioridad} onChange={setPrioridad} opciones={[['todas', 'Todas'], ...PRIORIDADES.map((item) => [item.value, item.label])]} />
              <Filtro label="Responsable" value={responsable} onChange={setResponsable} opciones={[['todos', 'Todos'], ['sin_asignar', 'Sin asignar'], ...miembros.map((miembro) => [miembro.id, miembro.nombre])]} />
              <Filtro label="Orden" value={orden} onChange={setOrden} opciones={[['prioridad', 'Prioridad'], ['antiguos', 'Más antiguos'], ['limite', 'Fecha límite']]} />
              {filtrosActivos > 0 && <button onClick={() => { setPrioridad('todas'); setResponsable('todos') }} className="h-9 text-xs text-slate-500 dark:text-ink-300 hover:text-slate-900 dark:hover:text-white px-2">Limpiar filtros</button>}
            </div>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-auto bg-slate-50 dark:bg-ink-950">
          {error ? (
            <EstadoMensaje icon={<AlertCircle size={22} />} titulo="No pudimos cargar los tickets" detalle={error} accion="Reintentar" onAccion={cargar} />
          ) : cargando ? (
            <TablaSkeleton />
          ) : filtradas.length === 0 ? (
            <EstadoMensaje icon={<Filter size={22} />} titulo={incidencias.length ? 'No hay tickets con estos filtros' : 'La mesa de mantenimiento esta vacia'} detalle={incidencias.length ? 'Prueba otra busqueda o limpia los filtros.' : 'Crea el primer reporte para empezar a operar esta bandeja.'} accion={incidencias.length ? 'Limpiar filtros' : 'Crear ticket'} onAccion={() => incidencias.length ? (setBusqueda(''), setEstado('abiertos'), setPrioridad('todas'), setResponsable('todos')) : setPanel('nuevo')} />
          ) : vista === 'lista' ? (
            <VistaLista tickets={filtradas} miembrosPorId={miembrosPorId} onAbrir={setPanel} onActualizar={actualizar} seleccionados={seleccionados} onSeleccionar={setSeleccionados} />
          ) : (
            <VistaKanban tickets={filtradas} miembrosPorId={miembrosPorId} onAbrir={setPanel} onActualizar={actualizar} />
          )}
        </div>
        {seleccionados.length > 0 && (
          <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-30 bg-ink-950 text-white rounded-xl shadow-lg px-4 py-3 flex items-center gap-3">
            <span className="text-sm font-medium whitespace-nowrap">{seleccionados.length} seleccionado{seleccionados.length === 1 ? '' : 's'}</span>
            <select defaultValue="" onChange={(event) => { if (event.target.value) aplicarMasivo({ estado: event.target.value }); event.target.value = '' }} className="h-9 bg-ink-800 border border-ink-500 rounded-lg px-2 text-sm" aria-label="Cambiar estado de seleccionados"><option value="">Mover a...</option>{ESTADOS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
            <button onClick={() => setSeleccionados([])} className="w-9 h-9 rounded-lg flex items-center justify-center text-ink-300 hover:text-white hover:bg-ink-800" aria-label="Cancelar selección"><X size={15} /></button>
          </div>
        )}
      </div>

      {panel === 'nuevo' && <PanelNuevo clientes={clientes} miembros={miembros} user={user} onCerrar={() => setPanel(null)} onClienteNuevo={(cliente) => setClientes((actuales) => [...actuales, cliente])} onCreado={(ticket) => { setIncidencias((actuales) => [ticket, ...actuales]); setPanel(ticket) }} />}
      {panel && panel !== 'nuevo' && <PanelDetalle ticket={panel} miembros={miembros} onCerrar={() => setPanel(null)} onGuardar={actualizar} />}
    </Layout>
  )
}

function Resumen({ label, valor, color }) {
  return <div className="flex items-center gap-2 text-sm"><span className={`w-2 h-2 rounded-full ${color}`} /><span className="font-semibold tabular-nums text-slate-900 dark:text-ink-100">{valor}</span><span className="text-slate-500 dark:text-ink-300">{label}</span></div>
}

function Filtro({ label, value, onChange, opciones }) {
  return (
    <label className="text-xs text-slate-500 dark:text-ink-300">
      <span className="block mb-1">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="h-9 min-w-40 border border-slate-200 dark:border-ink-500 rounded-lg px-2.5 bg-white dark:bg-ink-900 text-sm text-slate-700 dark:text-ink-100 outline-none focus:ring-2 focus:ring-brand-400/60">
        {opciones.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}
      </select>
    </label>
  )
}

function VistaLista({ tickets, miembrosPorId, onAbrir, onActualizar, seleccionados, onSeleccionar }) {
  const todosSeleccionados = tickets.length > 0 && tickets.every((ticket) => seleccionados.includes(ticket.id))

  function toggle(id) {
    onSeleccionar(seleccionados.includes(id) ? seleccionados.filter((item) => item !== id) : [...seleccionados, id])
  }

  return (
    <>
      <div className="hidden md:block min-w-[1080px]">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-slate-100/95 dark:bg-ink-900/95 backdrop-blur-sm text-left text-xs font-semibold text-slate-500 dark:text-ink-300 border-b border-slate-200 dark:border-ink-500">
            <tr>
              <th className="w-10 pl-4 py-3"><input type="checkbox" checked={todosSeleccionados} onChange={() => onSeleccionar(todosSeleccionados ? [] : tickets.map((ticket) => ticket.id))} aria-label="Seleccionar todos los tickets visibles" className="accent-brand-500" /></th>
              <th className="w-24 px-3 py-3 font-semibold">Ticket</th>
              <th className="min-w-72 px-3 py-3 font-semibold">Problema</th>
              <th className="min-w-44 px-3 py-3 font-semibold">Cliente / sitio</th>
              <th className="w-36 px-3 py-3 font-semibold">Estado</th>
              <th className="w-32 px-3 py-3 font-semibold">Prioridad</th>
              <th className="w-32 px-3 py-3 font-semibold">Cobertura</th>
              <th className="w-40 px-3 py-3 font-semibold">Responsable</th>
              <th className="w-28 px-3 py-3 font-semibold"><span className="inline-flex items-center gap-1">Plazo <ArrowUpDown size={12} /></span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-ink-500 bg-white dark:bg-ink-800">
            {tickets.map((ticket) => {
              const estado = estadoInfo(ticket.estado)
              const prioridad = prioridadInfo(ticket.prioridad)
              return (
                <tr key={ticket.id} className="group hover:bg-brand-50/45 dark:hover:bg-brand-500/5 transition-colors">
                  <td className="pl-4 py-3"><input type="checkbox" checked={seleccionados.includes(ticket.id)} onChange={() => toggle(ticket.id)} aria-label={`Seleccionar ${folio(ticket.folio)}`} className="accent-brand-500" /></td>
                  <td className="px-3 py-3 font-mono text-xs tabular-nums text-slate-500 dark:text-ink-400">{folio(ticket.folio)}</td>
                  <td className="px-3 py-3">
                    <button onClick={() => onAbrir(ticket)} className="text-left font-medium text-slate-900 dark:text-ink-100 hover:text-brand-800 dark:hover:text-brand-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 rounded-sm line-clamp-2">{ticket.titulo}</button>
                    <span className="block text-xs text-slate-400 dark:text-ink-400 mt-0.5">{opcionLabel(ORIGENES, ticket.origen)} · {opcionLabel(TIPOS, ticket.tipo)}</span>
                  </td>
                  <td className="px-3 py-3">
                    <span className="block text-slate-700 dark:text-ink-200 truncate max-w-56">{ticket.cliente.nombreComercial}</span>
                    <a href={ticket.sitio.url || `https://${dominioSitio(ticket.sitio)}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-slate-400 dark:text-ink-400 hover:text-brand-700 dark:hover:text-brand-300" onClick={(event) => event.stopPropagation()}>{dominioSitio(ticket.sitio)} <ExternalLink size={10} /></a>
                  </td>
                  <td className="px-3 py-3">
                    <select value={ticket.estado} onChange={(event) => onActualizar(ticket.id, { estado: event.target.value })} className={`h-8 w-full rounded-lg px-2 text-xs font-medium border-0 outline-none focus:ring-2 focus:ring-brand-400 ${estado.badge}`} aria-label={`Estado de ${folio(ticket.folio)}`}>
                      {ESTADOS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-3"><span className={`inline-flex px-2 py-1 rounded-md text-xs font-medium ${prioridad.className}`}>{prioridad.label}</span></td>
                  <td className="px-3 py-3 text-xs text-slate-600 dark:text-ink-300">{opcionLabel(COBERTURAS, ticket.cobertura)}</td>
                  <td className="px-3 py-3 text-slate-600 dark:text-ink-300"><span className="inline-flex items-center gap-2"><span className="w-6 h-6 rounded-full bg-slate-100 dark:bg-ink-700 flex items-center justify-center"><UserRound size={12} /></span>{miembrosPorId[ticket.responsableId]?.nombre || 'Sin asignar'}</span></td>
                  <td className="px-3 py-3 text-xs tabular-nums text-slate-500 dark:text-ink-400">{ticket.fechaLimite ? new Date(ticket.fechaLimite).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }) : antiguedad(ticket.creadoEn)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="md:hidden divide-y divide-slate-200 dark:divide-ink-500 bg-white dark:bg-ink-800">
        {tickets.map((ticket) => (
          <button key={ticket.id} onClick={() => onAbrir(ticket)} className="w-full text-left px-4 py-4 hover:bg-slate-50 dark:hover:bg-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-400">
            <div className="flex items-start gap-3">
              <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${estadoInfo(ticket.estado).dot}`} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2"><span className="font-mono text-[11px] text-slate-400 dark:text-ink-400">{folio(ticket.folio)}</span><span className="text-xs text-slate-400 dark:text-ink-400">{antiguedad(ticket.creadoEn)}</span></div>
                <p className="font-medium text-sm text-slate-900 dark:text-ink-100 mt-1">{ticket.titulo}</p>
                <p className="text-xs text-slate-500 dark:text-ink-300 mt-1 truncate">{ticket.cliente.nombreComercial} · {dominioSitio(ticket.sitio)}</p>
                <p className="text-xs text-slate-400 dark:text-ink-400 mt-1 truncate">{miembrosPorId[ticket.responsableId]?.nombre || 'Sin asignar'} · {opcionLabel(COBERTURAS, ticket.cobertura)}{ticket.fechaLimite ? ` · vence ${new Date(ticket.fechaLimite).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}` : ''}</p>
                <div className="flex gap-1.5 mt-2"><span className={`px-2 py-1 rounded-md text-[11px] font-medium ${estadoInfo(ticket.estado).badge}`}>{estadoInfo(ticket.estado).label}</span><span className={`px-2 py-1 rounded-md text-[11px] font-medium ${prioridadInfo(ticket.prioridad).className}`}>{prioridadInfo(ticket.prioridad).label}</span></div>
              </div>
            </div>
          </button>
        ))}
      </div>
    </>
  )
}

function VistaKanban({ tickets, miembrosPorId, onAbrir, onActualizar }) {
  const [arrastrando, setArrastrando] = useState(null)
  return (
    <div className="h-full flex gap-4 p-5 overflow-x-auto">
      {ESTADOS.map((estado) => {
        const columna = tickets.filter((ticket) => ticket.estado === estado.value)
        return (
          <section key={estado.value} onDragOver={(event) => event.preventDefault()} onDrop={() => { if (arrastrando) onActualizar(arrastrando, { estado: estado.value }); setArrastrando(null) }} className="w-80 shrink-0 bg-slate-100 dark:bg-ink-900 border border-slate-200 dark:border-ink-500 rounded-xl flex flex-col">
            <header className="h-12 px-3.5 flex items-center gap-2 border-b border-slate-200 dark:border-ink-500"><span className={`w-2 h-2 rounded-full ${estado.dot}`} /><h2 className="text-sm font-semibold text-slate-700 dark:text-ink-100">{estado.label}</h2><span className="ml-auto text-xs tabular-nums text-slate-400 dark:text-ink-400">{columna.length}</span></header>
            <div className="p-2.5 space-y-2.5 overflow-y-auto min-h-24">
              {columna.map((ticket) => (
                <article key={ticket.id} draggable onDragStart={() => setArrastrando(ticket.id)} onDragEnd={() => setArrastrando(null)} className={`bg-white dark:bg-ink-800 rounded-lg border border-slate-200 dark:border-ink-500 p-3 shadow-sm ${arrastrando === ticket.id ? 'opacity-50' : ''}`}>
                  <div className="flex items-center justify-between gap-2"><span className="font-mono text-[11px] text-slate-400 dark:text-ink-400">{folio(ticket.folio)}</span><span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${prioridadInfo(ticket.prioridad).className}`}>{prioridadInfo(ticket.prioridad).label}</span></div>
                  <button onClick={() => onAbrir(ticket)} className="block w-full text-left text-sm font-medium text-slate-900 dark:text-ink-100 hover:text-brand-800 dark:hover:text-brand-300 mt-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 rounded-sm">{ticket.titulo}</button>
                  <p className="text-xs text-slate-500 dark:text-ink-300 mt-2 truncate">{ticket.cliente.nombreComercial}</p>
                  <p className="text-xs text-slate-400 dark:text-ink-400 truncate">{dominioSitio(ticket.sitio)}</p>
                  <label className="block mt-2 text-[11px] text-slate-400 dark:text-ink-400">Mover a
                    <select value={ticket.estado} onChange={(event) => onActualizar(ticket.id, { estado: event.target.value })} className="mt-1 w-full h-9 rounded-lg border border-slate-200 dark:border-ink-500 bg-white dark:bg-ink-900 px-2 text-xs text-slate-700 dark:text-ink-100">
                      {ESTADOS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                    </select>
                  </label>
                  <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-ink-500 flex items-center justify-between gap-2 text-xs text-slate-400 dark:text-ink-400"><span>{miembrosPorId[ticket.responsableId]?.nombre || 'Sin asignar'}</span><span>{antiguedad(ticket.creadoEn)}</span></div>
                </article>
              ))}
              {!columna.length && <div className="h-20 border border-dashed border-slate-300 dark:border-ink-500 rounded-lg flex items-center justify-center text-xs text-slate-400 dark:text-ink-400">Suelta un ticket aquí</div>}
            </div>
          </section>
        )
      })}
    </div>
  )
}

function Panel({ titulo, subtitulo, onCerrar, children, footer, cambiosPendientes = false }) {
  const panelRef = useRef(null)
  const cerrarRef = useRef(onCerrar)
  const cambiosRef = useRef(cambiosPendientes)
  cerrarRef.current = onCerrar
  cambiosRef.current = cambiosPendientes

  function intentarCerrar() {
    if (!cambiosPendientes || window.confirm('Hay cambios sin guardar. ¿Quieres cerrar el panel?')) onCerrar()
  }

  useEffect(() => {
    const focoAnterior = document.activeElement
    const panel = panelRef.current
    ;(panel?.querySelector('[data-autofocus]') || panel?.querySelector('input, select, textarea, button'))?.focus()

    function cerrarConEscape(event) {
      if (event.key === 'Escape') {
        if (!cambiosRef.current || window.confirm('Hay cambios sin guardar. ¿Quieres cerrar el panel?')) cerrarRef.current()
        return
      }
      if (event.key !== 'Tab' || !panel) return
      const elementos = [...panel.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]')]
      if (!elementos.length) return
      const primero = elementos[0]
      const ultimo = elementos[elementos.length - 1]
      if (event.shiftKey && document.activeElement === primero) { event.preventDefault(); ultimo.focus() }
      if (!event.shiftKey && document.activeElement === ultimo) { event.preventDefault(); primero.focus() }
    }
    window.addEventListener('keydown', cerrarConEscape)
    return () => {
      window.removeEventListener('keydown', cerrarConEscape)
      focoAnterior?.focus?.()
    }
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="presentation">
      <button className="absolute inset-0 bg-black/35" onClick={intentarCerrar} aria-label="Cerrar panel" />
      <aside ref={panelRef} className="relative w-full sm:max-w-xl h-full bg-white dark:bg-ink-800 shadow-[-12px_0_36px_rgba(15,23,42,0.16)] flex flex-col" role="dialog" aria-modal="true" aria-label={titulo}>
        <header className="px-5 py-4 border-b border-slate-200 dark:border-ink-500 flex items-start gap-3 shrink-0">
          <div className="min-w-0 flex-1"><h2 className="font-semibold text-slate-900 dark:text-ink-100">{titulo}</h2>{subtitulo && <p className="text-xs text-slate-500 dark:text-ink-300 mt-0.5">{subtitulo}</p>}</div>
          <button onClick={intentarCerrar} className="w-11 h-11 md:w-10 md:h-10 -mr-2 -mt-2 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-800 hover:bg-slate-100 dark:hover:text-white dark:hover:bg-ink-700" aria-label="Cerrar"><X size={18} /></button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer && <footer className="px-5 py-4 border-t border-slate-200 dark:border-ink-500 bg-slate-50 dark:bg-ink-900 shrink-0">{footer}</footer>}
      </aside>
    </div>
  )
}

// Buscador unificado de clientes: mientras escribes filtra los de Foco y,
// en paralelo (debounce 350 ms), consulta el CRM. En un solo dropdown:
// clientes locales, sugerencias del CRM listas para importar y — si no hay
// nada — el registro directo en el CRM. El CRM es la fuente obligatoria.
function BuscadorCliente({ clientes, value, onSelect, onImportado }) {
  const [abierto, setAbierto] = useState(false)
  const [query, setQuery] = useState('')
  const [activo, setActivo] = useState(0)
  const [resultadosCrm, setResultadosCrm] = useState([])
  const [buscandoCrm, setBuscandoCrm] = useState(false)
  const [importandoId, setImportandoId] = useState(null)
  const [error, setError] = useState('')
  const [registroAbierto, setRegistroAbierto] = useState(false)
  const [registro, setRegistro] = useState({ company: '', contactoNombre: '', phonenumber: '', correo: '' })
  const [registrando, setRegistrando] = useState(false)
  const raizRef = useRef(null)
  const inputRef = useRef(null)
  const listaRef = useRef(null)
  const ultimaBusquedaRef = useRef('')

  const seleccionado = clientes.find((cliente) => cliente.id === value) || null
  const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const q = query.trim()
  const nq = norm(q)
  const digitos = q.replace(/\D/g, '')

  const locales = !nq ? clientes : clientes.filter((cliente) =>
    norm(cliente.nombreComercial).includes(nq)
    || norm(cliente.correo).includes(nq)
    || norm(cliente.whatsapp).includes(nq)
    || (digitos.length >= 4 && String(cliente.whatsapp || '').replace(/\D/g, '').includes(digitos)),
  )
  // Del CRM solo se muestran los que aún no están en Foco (los ya vinculados
  // aparecen arriba como locales).
  const importables = resultadosCrm.filter((r) => r.estadoLocal !== 'ya_vinculado')
  const opciones = [...locales, ...importables]

  // Consulta al CRM mientras se escribe (≥2 caracteres, con debounce).
  useEffect(() => {
    if (q.length < 2 || q === ultimaBusquedaRef.current) return
    const t = setTimeout(async () => {
      ultimaBusquedaRef.current = q
      setBuscandoCrm(true)
      try {
        setResultadosCrm(await buscarClientesCrm(q))
      } catch {
        setResultadosCrm([])
      } finally {
        setBuscandoCrm(false)
      }
    }, 350)
    return () => clearTimeout(t)
  }, [q])

  useEffect(() => {
    function fuera(evento) { if (!raizRef.current?.contains(evento.target)) setAbierto(false) }
    document.addEventListener('mousedown', fuera)
    return () => document.removeEventListener('mousedown', fuera)
  }, [])

  useEffect(() => {
    setActivo(0)
  }, [nq])

  useEffect(() => {
    listaRef.current?.querySelector(`[data-indice="${activo}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [activo])

  function cerrar() {
    setAbierto(false)
    setRegistroAbierto(false)
    setQuery('')
    inputRef.current?.blur()
  }

  function elegirOpcion(indice) {
    const opcion = opciones[indice]
    if (!opcion) return
    if ('id' in opcion) {
      onSelect(opcion.id)
      cerrar()
    } else {
      importar(opcion)
    }
  }

  async function importar(resultado) {
    setImportandoId(resultado.crmId)
    setError('')
    try {
      const { cliente, sitioSugerido } = await vincularClienteCrm(resultado.crmId, resultado.contactoId)
      onImportado(cliente, sitioSugerido)
      onSelect(cliente.id)
      cerrar()
    } catch (err) {
      setError(err.message)
    } finally {
      setImportandoId(null)
    }
  }

  function abrirRegistro() {
    setRegistroAbierto(true)
    setRegistro((actual) => ({ ...actual, company: actual.company || query }))
    setAbierto(true)
    requestAnimationFrame(() => listaRef.current?.querySelector('input')?.focus())
  }

  async function registrar() {
    if (!registro.company.trim()) return setError('Escribe el nombre de la empresa para registrarla en el CRM')
    if (registro.contactoNombre.trim() && !registro.correo.trim()) return setError('El correo del contacto es obligatorio — el CRM lo requiere para dar de alta contactos')
    setRegistrando(true)
    setError('')
    try {
      const { cliente, sitioSugerido } = await registrarClienteCrm({ ...registro, company: registro.company.trim() })
      onImportado(cliente, sitioSugerido)
      onSelect(cliente.id)
      cerrar()
    } catch (err) {
      setError(err.message)
    } finally {
      setRegistrando(false)
    }
  }

  function teclas(evento) {
    if (evento.key === 'ArrowDown') {
      evento.preventDefault()
      if (!abierto) return setAbierto(true)
      setActivo((a) => Math.min(a + 1, opciones.length - 1))
    } else if (evento.key === 'ArrowUp') {
      evento.preventDefault()
      setActivo((a) => Math.max(a - 1, 0))
    } else if (evento.key === 'Enter') {
      if (abierto && opciones[activo]) { evento.preventDefault(); elegirOpcion(activo) }
    } else if (evento.key === 'Escape' && abierto) {
      evento.preventDefault()
      evento.stopPropagation()
      setAbierto(false)
    } else if (evento.key === 'Tab') {
      setAbierto(false)
    }
  }

  const sinResultados = q.length >= 2 && !buscandoCrm && !locales.length && !importables.length

  return (
    <div ref={raizRef} className="relative">
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-ink-400 pointer-events-none" />
        <input
          ref={inputRef}
          data-autofocus
          role="combobox"
          aria-expanded={abierto}
          aria-controls="lista-clientes"
          aria-autocomplete="list"
          aria-activedescendant={abierto && opciones[activo] ? `opcion-cliente-${activo}` : undefined}
          value={abierto ? query : seleccionado?.nombreComercial || query}
          onFocus={() => { setAbierto(true); requestAnimationFrame(() => inputRef.current?.select()) }}
          onChange={(evento) => { setQuery(evento.target.value); setAbierto(true); setRegistroAbierto(false) }}
          onKeyDown={teclas}
          placeholder="Buscar cliente — Foco y CRM..."
          className={`${inputCls} pl-9 ${seleccionado && !abierto ? 'pr-16' : 'pr-9'}`}
          autoComplete="off"
        />
        {seleccionado && !abierto ? (
          <button type="button" onClick={() => { onSelect(''); setQuery('') }} className="absolute right-9 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 dark:hover:text-ink-100" aria-label="Quitar cliente seleccionado"><X size={14} /></button>
        ) : null}
        <ChevronDown size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-ink-400 pointer-events-none" />
      </div>
      {error && <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{error}</p>}

      {abierto && (
        <ul id="lista-clientes" role="listbox" aria-label="Clientes" ref={listaRef} className="absolute z-20 left-0 right-0 top-full mt-1 max-h-80 overflow-y-auto bg-white dark:bg-ink-800 border border-slate-200 dark:border-ink-500 rounded-lg shadow-lg">
          {locales.length > 0 && (
            <li className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-ink-400" aria-hidden="true">En Foco</li>
          )}
          {locales.map((cliente, i) => (
            <li key={cliente.id} id={`opcion-cliente-${i}`} role="option" aria-selected={cliente.id === value} data-indice={i}>
              <button
                type="button"
                onMouseEnter={() => setActivo(i)}
                onClick={() => { onSelect(cliente.id); cerrar() }}
                className={`w-full text-left px-3 py-2.5 transition-colors ${i === activo ? 'bg-brand-50 dark:bg-brand-500/10' : ''} ${cliente.id === value ? 'bg-brand-100/60 dark:bg-brand-500/15' : ''}`}
              >
                <span className="block truncate text-sm font-medium text-slate-900 dark:text-ink-100">{cliente.nombreComercial}</span>
                <span className="block truncate text-xs text-slate-400 dark:text-ink-400">
                  {[cliente.correo, cliente.whatsapp].filter(Boolean).join(' · ') || `${cliente._count?.sitios ?? 0} sitio${cliente._count?.sitios === 1 ? '' : 's'}`}
                </span>
              </button>
            </li>
          ))}

          {importables.length > 0 && (
            <li className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-ink-400 border-t border-slate-100 dark:border-ink-500 mt-1" aria-hidden="true">En el CRM — importar</li>
          )}
          {importables.map((resultado, i) => {
            const indice = locales.length + i
            return (
              <li key={resultado.crmId} id={`opcion-cliente-${indice}`} role="option" aria-selected={false} data-indice={indice}>
                <button
                  type="button"
                  onMouseEnter={() => setActivo(indice)}
                  onClick={() => importar(resultado)}
                  disabled={importandoId === resultado.crmId}
                  className={`w-full text-left px-3 py-2.5 transition-colors ${indice === activo ? 'bg-brand-50 dark:bg-brand-500/10' : ''} disabled:opacity-50`}
                >
                  <span className="block truncate text-sm font-medium text-slate-900 dark:text-ink-100 flex items-center gap-1.5"><Building2 size={13} className="shrink-0 text-slate-400" />{resultado.nombreComercial}</span>
                  <span className="block truncate text-xs text-slate-400 dark:text-ink-400 mt-0.5">
                    {[resultado.contactoNombre, resultado.whatsapp || resultado.correo].filter(Boolean).join(' · ') || 'Sin datos de contacto'}
                  </span>
                  <span className="mt-1 inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600 dark:bg-ink-700 dark:text-ink-300">
                    {importandoId === resultado.crmId ? 'Importando...' : 'Enter o clic para importar del CRM'}
                  </span>
                </button>
              </li>
            )
          })}

          {buscandoCrm && (
            <li className="px-3 py-2.5 text-xs text-slate-400 dark:text-ink-400" aria-live="polite">Consultando el CRM...</li>
          )}

          {sinResultados && !registroAbierto && (
            <li>
              <button type="button" onClick={abrirRegistro} className="w-full text-left px-3 py-3 hover:bg-brand-50 dark:hover:bg-brand-500/10 transition-colors">
                <span className="flex items-center gap-2 text-sm font-medium text-brand-800 dark:text-brand-300"><UserPlus size={14} />No está en ningún lado — registrar «{q}» en el CRM</span>
                <span className="block text-xs text-slate-400 dark:text-ink-400 mt-0.5">Se da de alta en el CRM y queda vinculado en Foco.</span>
              </button>
            </li>
          )}

          {registroAbierto && (
            <li className="p-3 border-t border-slate-100 dark:border-ink-500 bg-slate-50 dark:bg-ink-900 space-y-2.5" onClick={(evento) => evento.stopPropagation()}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-600 dark:text-ink-300">Registrar en el CRM</span>
                <button type="button" onClick={() => setRegistroAbierto(false)} className="text-xs text-slate-400 hover:text-slate-700 dark:hover:text-ink-100" aria-label="Cancelar registro">✕</button>
              </div>
              <input value={registro.company} onChange={(evento) => setRegistro({ ...registro, company: evento.target.value })} className={inputCls} placeholder="Empresa *" aria-label="Empresa" />
              <input value={registro.contactoNombre} onChange={(evento) => setRegistro({ ...registro, contactoNombre: evento.target.value })} className={inputCls} placeholder="Nombre del contacto" aria-label="Nombre del contacto" />
              <input value={registro.phonenumber} onChange={(evento) => setRegistro({ ...registro, phonenumber: evento.target.value })} className={inputCls} placeholder="Teléfono / WhatsApp" aria-label="Teléfono o WhatsApp" />
              <input value={registro.correo} onChange={(evento) => setRegistro({ ...registro, correo: evento.target.value })} className={inputCls} placeholder="Correo (requerido para el contacto)" aria-label="Correo del contacto" />
              <button type="button" onClick={registrar} disabled={registrando} className="w-full h-10 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-slate-900 rounded-lg text-sm font-semibold transition-colors">{registrando ? 'Registrando...' : 'Registrar en el CRM'}</button>
            </li>
          )}
        </ul>
      )}
    </div>
  )
}

function PanelNuevo({ clientes, miembros, user, onCerrar, onCreado, onClienteNuevo }) {
  const [form, setForm] = useState({ clienteId: '', sitioId: '', titulo: '', descripcion: '', tipo: 'falla', origen: 'interno', prioridad: 'normal', cobertura: 'por_valorar', infraestructura: 'sin_localizar', responsableId: '', fechaLimite: '' })
  const [sitios, setSitios] = useState([])
  const [nuevoSitio, setNuevoSitio] = useState(false)
  const [sitioForm, setSitioForm] = useState({ nombre: 'Sitio principal', dominio: '', coberturaMantenimiento: 'por_valorar', infraestructura: 'sin_localizar' })
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const hayCambios = Boolean(form.clienteId || form.sitioId || form.titulo || form.descripcion || form.responsableId || form.fechaLimite || nuevoSitio)

  async function seleccionarCliente(clienteId) {
    setForm((actual) => ({ ...actual, clienteId, sitioId: '' }))
    setSitios([])
    setNuevoSitio(false)
    if (!clienteId) return
    try {
      const cliente = await getCliente(clienteId)
      setSitios(cliente.sitios)
      if (cliente.sitios.length === 1) {
        const sitio = cliente.sitios[0]
        setForm((actual) => ({ ...actual, sitioId: sitio.id, cobertura: sitio.coberturaMantenimiento || 'por_valorar', infraestructura: sitio.infraestructura || 'sin_localizar' }))
      } else if (!cliente.sitios.length) {
        setNuevoSitio(true)
      }
    } catch (err) {
      setError(err.message)
    }
  }

  // Cliente importado/registrado vía CRM desde el buscador: entra a la lista
  // local, queda seleccionado y su website prellena el dominio del sitio nuevo.
  function clienteImportado(cliente, sitioSugerido) {
    onClienteNuevo(cliente)
    if (sitioSugerido?.dominio) setSitioForm((actual) => ({ ...actual, dominio: actual.dominio || sitioSugerido.dominio }))
  }

  function seleccionarSitio(sitioId) {
    const sitio = sitios.find((item) => item.id === sitioId)
    setForm((actual) => ({ ...actual, sitioId, cobertura: sitio?.coberturaMantenimiento || 'por_valorar', infraestructura: sitio?.infraestructura || 'sin_localizar' }))
  }

  async function guardar(event) {
    event.preventDefault()
    if (!form.clienteId || !form.titulo.trim()) return
    if (!nuevoSitio && !form.sitioId) return setError('Selecciona el sitio afectado')
    if (nuevoSitio && !sitioForm.dominio.trim()) return setError('Escribe el dominio del sitio')
    setGuardando(true)
    setError('')
    try {
      let sitioId = form.sitioId
      if (nuevoSitio) {
        const sitio = await crearSitio(form.clienteId, { ...sitioForm, url: `https://${sitioForm.dominio.replace(/^https?:\/\//, '')}` })
        sitioId = sitio.id
      }
      const ticket = await crearIncidencia({ ...form, sitioId, reportadoPor: user?.nombre, responsableId: form.responsableId || null, fechaLimite: form.fechaLimite || null })
      onCreado(ticket)
    } catch (err) {
      setError(err.message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Panel titulo="Nuevo ticket" subtitulo="Registra el problema; la infraestructura puede localizarse después." onCerrar={onCerrar} cambiosPendientes={hayCambios && !guardando} footer={<button form="nuevo-ticket" type="submit" disabled={guardando || !form.clienteId || !form.titulo.trim()} className="w-full h-11 md:h-10 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-slate-900 rounded-lg text-sm font-semibold transition-colors">{guardando ? 'Creando ticket...' : 'Crear ticket'}</button>}>
      <form id="nuevo-ticket" onSubmit={guardar} className="space-y-5">
        {error && <MensajeError>{error}</MensajeError>}

        <div>
          <span className="block text-sm font-medium text-slate-700 dark:text-ink-300 mb-1.5">Cliente *</span>
          <BuscadorCliente
            clientes={clientes}
            value={form.clienteId}
            onSelect={seleccionarCliente}
            onImportado={clienteImportado}
          />
        </div>

        {form.clienteId && (
          <Campo label="Sitio afectado *">
            {sitios.length > 0 && !nuevoSitio && <select value={form.sitioId} onChange={(event) => seleccionarSitio(event.target.value)} className={inputCls}><option value="">Seleccionar sitio...</option>{sitios.map((sitio) => <option key={sitio.id} value={sitio.id}>{sitio.nombre} · {dominioSitio(sitio)}</option>)}</select>}
            {nuevoSitio ? (
              <div className="p-3 bg-slate-50 dark:bg-ink-900 border border-slate-200 dark:border-ink-500 rounded-lg space-y-3">
                <div className="flex items-center justify-between"><span className="text-xs font-semibold text-slate-600 dark:text-ink-300">Registrar sitio</span>{sitios.length > 0 && <button type="button" onClick={() => setNuevoSitio(false)} className="text-xs text-slate-500 hover:text-slate-900 dark:hover:text-white">Elegir existente</button>}</div>
                <input value={sitioForm.nombre} onChange={(event) => setSitioForm({ ...sitioForm, nombre: event.target.value })} className={inputCls} placeholder="Nombre del sitio" />
                <input value={sitioForm.dominio} onChange={(event) => setSitioForm({ ...sitioForm, dominio: event.target.value })} className={inputCls} placeholder="ejemplo.com" />
              </div>
            ) : <button type="button" onClick={() => setNuevoSitio(true)} className="mt-2 text-xs font-medium text-brand-800 dark:text-brand-300 hover:underline">+ Registrar otro sitio</button>}
          </Campo>
        )}

        <Campo label="Problema *"><input value={form.titulo} onChange={(event) => setForm({ ...form, titulo: event.target.value })} className={inputCls} placeholder="Ej. El sitio muestra un error crítico" /></Campo>
        <Campo label="Descripción"><textarea value={form.descripcion} onChange={(event) => setForm({ ...form, descripcion: event.target.value })} className={textareaCls} placeholder="Qué reportaron, desde cuándo ocurre y cualquier contexto útil..." /></Campo>

        <div className="grid grid-cols-2 gap-3">
          <Campo label="Tipo"><SelectOpciones value={form.tipo} onChange={(tipo) => setForm({ ...form, tipo })} opciones={TIPOS} /></Campo>
          <Campo label="Origen"><SelectOpciones value={form.origen} onChange={(origen) => setForm({ ...form, origen })} opciones={ORIGENES} /></Campo>
          <Campo label="Prioridad"><SelectOpciones value={form.prioridad} onChange={(prioridad) => setForm({ ...form, prioridad })} opciones={PRIORIDADES.map((item) => [item.value, item.label])} /></Campo>
          <Campo label="Cobertura"><SelectOpciones value={form.cobertura} onChange={(cobertura) => setForm({ ...form, cobertura })} opciones={COBERTURAS} /></Campo>
        </div>

        <Campo label="Responsable"><select value={form.responsableId} onChange={(event) => setForm({ ...form, responsableId: event.target.value })} className={inputCls}><option value="">Sin asignar</option>{miembros.map((miembro) => <option key={miembro.id} value={miembro.id}>{miembro.nombre}</option>)}</select></Campo>
        <Campo label="Fecha límite"><input type="date" value={form.fechaLimite} onChange={(event) => setForm({ ...form, fechaLimite: event.target.value })} className={inputCls} /></Campo>
      </form>
    </Panel>
  )
}

function datosEditables(ticket) {
  return { titulo: ticket.titulo, descripcion: ticket.descripcion || '', estado: ticket.estado, prioridad: ticket.prioridad, cobertura: ticket.cobertura, infraestructura: ticket.infraestructura, responsableId: ticket.responsableId || '', fechaLimite: ticket.fechaLimite?.slice(0, 10) || '', diagnostico: ticket.diagnostico || '', causaRaiz: ticket.causaRaiz || '', resolucion: ticket.resolucion || '' }
}

function PanelDetalle({ ticket, miembros, onCerrar, onGuardar }) {
  const [form, setForm] = useState(() => datosEditables(ticket))
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [guardado, setGuardado] = useState(false)
  const hayCambios = JSON.stringify(form) !== JSON.stringify(datosEditables(ticket))

  useEffect(() => {
    setForm(datosEditables(ticket))
  }, [ticket])

  async function guardar() {
    setGuardando(true)
    setError('')
    try {
      await onGuardar(ticket.id, { ...form, responsableId: form.responsableId || null, fechaLimite: form.fechaLimite || null })
      setGuardado(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setGuardando(false)
    }
  }

  async function cambiarEstado(estado) {
    setForm((actual) => ({ ...actual, estado }))
    try {
      await onGuardar(ticket.id, { estado })
    } catch (err) {
      setError(err.message)
    }
  }

  const footer = (
    <div className="flex gap-2">
      <button onClick={guardar} disabled={guardando || !hayCambios} className="flex-1 h-11 md:h-10 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-slate-900 rounded-lg text-sm font-semibold">
        {guardando ? 'Guardando...' : 'Guardar cambios'}
      </button>
      {form.estado === 'todo' && <button onClick={() => cambiarEstado('doing')} className="h-11 md:h-10 px-4 border border-slate-300 dark:border-ink-500 rounded-lg text-sm font-medium text-slate-700 dark:text-ink-100">Empezar</button>}
      {form.estado === 'doing' && <button onClick={() => cambiarEstado('revision')} className="h-11 md:h-10 px-4 border border-slate-300 dark:border-ink-500 rounded-lg text-sm font-medium text-slate-700 dark:text-ink-100">Revisar</button>}
      {form.estado === 'revision' && <button onClick={() => cambiarEstado('done')} className="h-11 md:h-10 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium">Resolver</button>}
    </div>
  )

  return (
    <Panel titulo={folio(ticket.folio)} subtitulo={`${ticket.cliente.nombreComercial} · ${dominioSitio(ticket.sitio)}`} onCerrar={onCerrar} cambiosPendientes={hayCambios && !guardando} footer={footer}>
      <div className="space-y-6">
        {error && <MensajeError>{error}</MensajeError>}
        {guardado && !hayCambios && <div role="status" className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-sm">Cambios guardados.</div>}
        <div className="flex gap-2 flex-wrap"><span className={`px-2.5 py-1 rounded-md text-xs font-medium ${estadoInfo(form.estado).badge}`}>{estadoInfo(form.estado).label}</span><span className={`px-2.5 py-1 rounded-md text-xs font-medium ${prioridadInfo(form.prioridad).className}`}>{prioridadInfo(form.prioridad).label}</span><span className="px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 dark:bg-ink-700 text-slate-600 dark:text-ink-300">{opcionLabel(ORIGENES, ticket.origen)}</span></div>

        <Campo label="Problema"><input data-autofocus value={form.titulo} onChange={(event) => { setGuardado(false); setForm({ ...form, titulo: event.target.value }) }} className={inputCls} /></Campo>
        <Campo label="Descripción original"><textarea value={form.descripcion} onChange={(event) => setForm({ ...form, descripcion: event.target.value })} className={textareaCls} /></Campo>

        <section className="border-y border-slate-200 dark:border-ink-500 py-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-ink-400 mb-3">Contexto</h3>
          <dl className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-2 text-sm">
            <dt className="text-slate-500 dark:text-ink-400">Cliente</dt><dd className="text-slate-800 dark:text-ink-100">{ticket.cliente.nombreComercial}</dd>
            <dt className="text-slate-500 dark:text-ink-400">Contacto</dt><dd className="text-slate-800 dark:text-ink-100">{ticket.cliente.contactoNombre || 'Sin registrar'}</dd>
            <dt className="text-slate-500 dark:text-ink-400">Sitio</dt><dd><a href={ticket.sitio.url || `https://${dominioSitio(ticket.sitio)}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-800 dark:text-brand-300 hover:underline">{dominioSitio(ticket.sitio)} <ExternalLink size={12} /></a></dd>
            <dt className="text-slate-500 dark:text-ink-400">Recibido</dt><dd className="text-slate-800 dark:text-ink-100">{new Date(ticket.creadoEn).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}</dd>
          </dl>
        </section>

        <div className="grid grid-cols-2 gap-3">
          <Campo label="Estado"><SelectOpciones value={form.estado} onChange={(estado) => setForm({ ...form, estado })} opciones={ESTADOS.map((item) => [item.value, item.label])} /></Campo>
          <Campo label="Prioridad"><SelectOpciones value={form.prioridad} onChange={(prioridad) => setForm({ ...form, prioridad })} opciones={PRIORIDADES.map((item) => [item.value, item.label])} /></Campo>
          <Campo label="Cobertura"><SelectOpciones value={form.cobertura} onChange={(cobertura) => setForm({ ...form, cobertura })} opciones={COBERTURAS} /></Campo>
          <Campo label="Infraestructura"><SelectOpciones value={form.infraestructura} onChange={(infraestructura) => setForm({ ...form, infraestructura })} opciones={INFRAESTRUCTURAS} /></Campo>
        </div>

        <Campo label="Responsable"><select value={form.responsableId} onChange={(event) => setForm({ ...form, responsableId: event.target.value })} className={inputCls}><option value="">Sin asignar</option>{miembros.map((miembro) => <option key={miembro.id} value={miembro.id}>{miembro.nombre}</option>)}</select></Campo>
        <Campo label="Fecha límite"><input type="date" value={form.fechaLimite} onChange={(event) => setForm({ ...form, fechaLimite: event.target.value })} className={inputCls} /></Campo>

        <section className="space-y-4 pt-1">
          <div className="flex items-center gap-2"><Wrench size={15} className="text-slate-400" /><h3 className="text-sm font-semibold text-slate-800 dark:text-ink-100">Trabajo técnico</h3></div>
          <Campo label="Diagnóstico"><textarea value={form.diagnostico} onChange={(event) => setForm({ ...form, diagnostico: event.target.value })} className={textareaCls} placeholder="Qué se encontró durante la revisión..." /></Campo>
          <Campo label="Causa raíz"><textarea value={form.causaRaiz} onChange={(event) => setForm({ ...form, causaRaiz: event.target.value })} className={textareaCls} placeholder="Qué originó el problema..." /></Campo>
          <Campo label="Resolución"><textarea value={form.resolucion} onChange={(event) => setForm({ ...form, resolucion: event.target.value })} className={textareaCls} placeholder="Qué se hizo y cómo se verificó..." /></Campo>
        </section>
      </div>
    </Panel>
  )
}

function Campo({ label, children }) {
  return <label className="block"><span className="block text-sm font-medium text-slate-700 dark:text-ink-300 mb-1.5">{label}</span>{children}</label>
}

function SelectOpciones({ value, onChange, opciones }) {
  return <select value={value} onChange={(event) => onChange(event.target.value)} className={inputCls}>{opciones.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}</select>
}

function MensajeError({ children }) {
  return <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300 text-sm"><AlertCircle size={16} className="mt-0.5 shrink-0" />{children}</div>
}

function EstadoMensaje({ icon, titulo, detalle, accion, onAccion }) {
  return <div className="h-full min-h-80 flex items-center justify-center p-6"><div className="text-center max-w-sm"><div className="w-11 h-11 mx-auto rounded-xl bg-slate-100 dark:bg-ink-800 text-slate-500 dark:text-ink-300 flex items-center justify-center">{icon}</div><h2 className="font-semibold text-slate-800 dark:text-ink-100 mt-4">{titulo}</h2><p className="text-sm text-slate-500 dark:text-ink-300 mt-1">{detalle}</p><button onClick={onAccion} className="mt-4 h-9 px-4 rounded-lg bg-brand-500 hover:bg-brand-600 text-slate-900 text-sm font-semibold">{accion}</button></div></div>
}

function TablaSkeleton() {
  return <div className="p-5 space-y-2" aria-label="Cargando tickets">{Array.from({ length: 7 }, (_, index) => <div key={index} className="h-16 rounded-lg bg-white dark:bg-ink-800 border border-slate-200 dark:border-ink-500 animate-pulse" />)}</div>
}
