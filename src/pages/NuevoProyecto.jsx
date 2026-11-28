import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import { useAuth } from '../context/AuthContext'
import { crearProyecto, getClientes, getMiembros, getPropuestasCliente, importarAlcance, generarBorradorPlan } from '../data/api'
import { nombreProyecto } from '../data/storage'
import { generarMensajeInicio } from '../data/mensajes'
import { getPlantillas, getPlantilla, copiarTareasDesde, FASES_WEB } from '../data/plantillas'
import { EQUIPO_NO_APLICA } from '../lib/permisos'
import { AREAS } from '../lib/areas'
import { etiquetasPersonas, miembroActivoPorNombre } from '../lib/nombresPersonas'
import EditorEnriquecido from '../components/EditorEnriquecido'
import BuscadorCliente from '../components/BuscadorCliente'
import { Copy, Check, Plus, Trash2, FolderOpen, Loader2, Kanban, GitBranch, CircleAlert, Sparkles } from 'lucide-react'

const COND_DEFAULT = {
  tieneDominio: false,
  tieneHosting: false,
  requiereCorreos: false,
  requiereCloudflare: true,
  requiereAnalytics: false,
  requiereSearchConsole: false,
  requierePluginAdicional: false,
  pluginAdicionalNombre: '',
  requiereCapacitacion: true,
}

const CONTEXTO_DEFAULT = {
  yaEsCliente: false,
  sitioActual: '',
  tieneDominio: false,
  dominio: '',
  hosting: 'nosotros',
}

const OPCIONES_HOSTING = [
  ['nosotros', 'Con nosotros (incluye Cloudflare)'],
  ['propio', 'Conserva su hosting'],
  ['migra', 'Migra con nosotros'],
]

const ESTADO_PROPUESTA_LABEL = {
  aceptada: 'Aceptada', enviada: 'Enviada', abierta: 'Abierta', revisada: 'Revisada', borrador: 'Borrador', rechazada: 'Rechazada',
}

// Los proyectos finitos ya no capturan condiciones técnicas: se derivan del
// contexto técnico porque las plantillas y el mensaje de inicio las siguen usando.
function condicionesDesdeContexto(ctx) {
  return {
    ...COND_DEFAULT,
    tieneDominio: ctx.tieneDominio,
    tieneHosting: ctx.hosting === 'propio',
    requiereCloudflare: ctx.hosting !== 'propio',
    requiereAnalytics: true,
    requiereSearchConsole: true,
  }
}

function textoPlano(html) {
  return String(html || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()
}

const CLIENTE_VACIO = {
  nombreComercial: '',
  contactoPrincipal: '',
  whatsapp: '',
  correo: '',
  participantes: [],
}

export default function NuevoProyecto() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const base = user?.rol === 'admin' ? '/admin' : '/equipo'
  const [plantillas, setPlantillas] = useState([])

  const [miembros, setMiembros] = useState([])
  const miembrosPorId = Object.fromEntries(miembros.map((m) => [m.id, m.nombre]))
  const [paso, setPaso] = useState(1)
  const [mensajeCopiado, setMensajeCopiado] = useState(false)
  const [proyectoCreado, setProyectoCreado] = useState(null)
  const [creando, setCreando] = useState(false)
  const [errorCrear, setErrorCrear] = useState('')

  const [tipo, setTipo] = useState('finito')
  const [cliente, setCliente] = useState(CLIENTE_VACIO)
  const [clientesFoco, setClientesFoco] = useState([])
  const [clienteId, setClienteId] = useState('')
  const [clienteExterno, setClienteExterno] = useState(false)
  const [proyectoData, setProyectoData] = useState({
    nombre: '',
    paquete: '',
    plantillaId: '',
    descripcion: '',
    fechaInicio: new Date().toISOString().split('T')[0],
    fechaEstimadaEntrega: '',
    anticipoConfirmado: false,
  })
  const [contextoTecnico, setContextoTecnico] = useState(CONTEXTO_DEFAULT)
  const [propuestas, setPropuestas] = useState([])
  const [cargandoPropuestas, setCargandoPropuestas] = useState(false)
  const [errorPropuestas, setErrorPropuestas] = useState('')
  const [propuestaId, setPropuestaId] = useState('')
  const [progresoIA, setProgresoIA] = useState(null)
  const [areasProyecto, setAreasProyecto] = useState([])
  const [equipo, setEquipo] = useState({
    copy: [],
    disenador: [],
    programador: [],
    redes: [],
    adminProyecto: [],
    asistente: [],
  })
  const defaultsEquipoAplicados = useRef(false)
  const [programadorNoAplica, setProgramadorNoAplica] = useState(false)
  const [passwordCliente, setPasswordCliente] = useState(generarPasswordSimple())

  useEffect(() => {
    getMiembros().then(setMiembros).catch(() => {})
    getPlantillas().then(setPlantillas).catch(() => {})
    getClientes().then(setClientesFoco).catch(() => {})
  }, [])

  function aplicarCliente(c) {
    setClienteId(c.id)
    setCliente({
      nombreComercial: c.nombreComercial || '',
      contactoPrincipal: c.contactoNombre || '',
      whatsapp: c.whatsapp || '',
      correo: c.correo || '',
      participantes: (Array.isArray(c.participantes) ? c.participantes : []).map((p) => ({
        nombre: p.nombre || '',
        correo: p.correo || '',
        whatsapp: p.whatsapp || '',
        rol: p.rol || 'Solo seguimiento',
      })),
    })
  }

  // El buscador avisa del cliente importado del CRM antes de seleccionarlo,
  // cuando clientesFoco todavía no lo tiene — por eso aquí ya se aplica.
  function clienteImportado(c) {
    setClientesFoco((prev) => [...prev, c])
    aplicarCliente(c)
  }

  function seleccionarCliente(id) {
    if (!id) {
      setClienteId('')
      setCliente(CLIENTE_VACIO)
      return
    }
    const c = clientesFoco.find((item) => item.id === id)
    if (c) aplicarCliente(c)
  }

  useEffect(() => {
    setPropuestas([])
    setPropuestaId('')
    setErrorPropuestas('')
    if (!clienteId) return
    let vigente = true
    setCargandoPropuestas(true)
    getPropuestasCliente(clienteId)
      .then((lista) => {
        if (!vigente) return
        setPropuestas(lista)
        const aceptada = lista.find((p) => p.estado === 'aceptada')
        if (aceptada) setPropuestaId(aceptada.id)
      })
      .catch((err) => { if (vigente) setErrorPropuestas(err.message || 'No se pudieron cargar las propuestas del CRM') })
      .finally(() => { if (vigente) setCargandoPropuestas(false) })
    return () => { vigente = false }
  }, [clienteId])

  function alternarClienteExterno() {
    setClienteExterno((prev) => !prev)
    setClienteId('')
    setCliente(CLIENTE_VACIO)
  }

  useEffect(() => {
    if (user?.id) {
      setEquipo((prev) => ({ ...prev, adminProyecto: prev.adminProyecto.length ? prev.adminProyecto : [user.id] }))
    }
    if (user?.area) {
      setAreasProyecto((prev) => (prev.length ? prev : [user.area]))
    }
  }, [user])

  const rolesVisibles = rolesEquipoDeAreas(areasProyecto)
  const miembrosSeleccionables = miembros.filter((m) => m.activo !== false || Object.values(equipo).some((ids) => ids.includes(m.id)))
  const etiquetaPersona = etiquetasPersonas(miembrosSeleccionables)

  // Valores por defecto del equipo, solo la primera vez que se abre el paso 3
  // (después respeta lo que se haya cambiado a mano).
  useEffect(() => {
    if (paso !== 3 || defaultsEquipoAplicados.current || !miembros.length) return
    defaultsEquipoAplicados.current = true
    const visibles = rolesEquipoDeAreas(areasProyecto).map(([key]) => key)
    const mario = miembroActivoPorNombre(miembros, 'Mario')
    const melisa = miembroActivoPorNombre(miembros, 'Melisa')
    setEquipo((prev) => {
      const sig = { ...prev }
      if (mario) {
        if (visibles.includes('programador') && !sig.programador.length) sig.programador = [mario.id]
        if (visibles.includes('disenador') && !sig.disenador.length) sig.disenador = [mario.id]
      }
      if (melisa && !sig.asistente.length) sig.asistente = [melisa.id]
      return sig
    })
  }, [paso, miembros, areasProyecto])

  // Los roles que el filtro de áreas oculta se mandan vacíos, aunque se hayan
  // marcado antes de cambiar de área.
  function equipoParaGuardar() {
    const visibles = rolesVisibles.map(([key]) => key)
    const data = Object.fromEntries(Object.entries(equipo).map(([key, ids]) => [key, visibles.includes(key) ? ids : []]))
    if (visibles.includes('programador') && programadorNoAplica) data.programador = EQUIPO_NO_APLICA
    return data
  }

  function toggleArea(area) {
    setAreasProyecto((prev) => (prev.includes(area) ? prev.filter((a) => a !== area) : [...prev, area]))
  }

  function agregarParticipante() {
    setCliente((prev) => ({
      ...prev,
      participantes: [...prev.participantes, { nombre: '', correo: '', whatsapp: '', rol: 'Solo seguimiento' }],
    }))
  }

  function actualizarParticipante(i, campo, valor) {
    setCliente((prev) => {
      const parts = [...prev.participantes]
      parts[i] = { ...parts[i], [campo]: valor }
      return { ...prev, participantes: parts }
    })
  }

  function quitarParticipante(i) {
    setCliente((prev) => ({
      ...prev,
      participantes: prev.participantes.filter((_, idx) => idx !== i),
    }))
  }

  async function handleCrear() {
    setErrorCrear('')
    setCreando(true)
    try {
      const esContinuo = tipo === 'continuo'
      const propuesta = esContinuo ? null : propuestas.find((p) => p.id === propuestaId) || null
      const plantillaId = esContinuo || propuesta ? '' : proyectoData.plantillaId
      const condicionesTecnicas = esContinuo ? COND_DEFAULT : condicionesDesdeContexto(contextoTecnico)
      const plantilla = plantillaId ? await getPlantilla(plantillaId) : null
      const tareas = plantillaId ? await copiarTareasDesde(plantillaId, condicionesTecnicas, []) : []

      const p = await crearProyecto({
        tipo,
        cliente,
        ...(clienteId ? { clienteId } : {}),
        proyecto: {
          nombre: proyectoData.nombre.trim(),
          paquete: esContinuo ? proyectoData.paquete : (propuesta?.titulo || plantilla?.nombre || ''),
          plantillaId,
          // Con propuesta, las fases las propone la IA junto con el plan.
          fases: esContinuo || propuesta ? [] : (plantilla?.fases || FASES_WEB),
          extras: [],
          fechaInicio: proyectoData.fechaInicio,
          fechaEstimadaEntrega: esContinuo || propuesta ? null : (proyectoData.fechaEstimadaEntrega || null),
          anticipoConfirmado: esContinuo ? proyectoData.anticipoConfirmado : false,
          descripcion: propuesta ? '' : proyectoData.descripcion.trim(),
          ...(esContinuo ? {} : { contextoTecnico }),
          ...(propuesta ? { propuestaId: propuesta.id } : {}),
        },
        condicionesTecnicas,
        equipo: equipoParaGuardar(),
        areas: areasProyecto,
        passwordCliente,
        tareas,
        creadoPor: user?.nombre,
      })
      setProyectoCreado(p)
      setPaso(4)
      if (propuesta) prepararPlan(p.slug, propuesta.id)
    } catch (err) {
      setErrorCrear(err.message || 'Error al crear el proyecto')
    } finally {
      setCreando(false)
    }
  }

  async function prepararPlan(slug, idPropuesta) {
    if (user?.rol !== 'admin') {
      setProgresoIA({ etapa: 'sin_permiso' })
      return
    }
    setProgresoIA({ etapa: 'alcance' })
    try {
      await importarAlcance(slug, idPropuesta)
      setProgresoIA({ etapa: 'plan' })
      await generarBorradorPlan(slug)
      setProgresoIA({ etapa: 'listo' })
    } catch (err) {
      setProgresoIA((prev) => ({ etapa: 'error', fallo: prev?.etapa, mensaje: err.message || 'Algo falló' }))
    }
  }

  function copiarMensaje() {
    const msg = generarMensajeInicio(proyectoCreado, miembrosPorId)
    navigator.clipboard.writeText(msg)
    setMensajeCopiado(true)
    setTimeout(() => setMensajeCopiado(false), 2500)
  }

  const esContinuo = tipo === 'continuo'
  const clienteListo = clienteId ? !!cliente.nombreComercial.trim() : (cliente.nombreComercial && cliente.contactoPrincipal && cliente.correo)
  const valido1 = !!proyectoData.nombre.trim() && clienteListo
  const valido2 = esContinuo
    ? !!proyectoData.paquete
    : !!propuestaId || !!proyectoData.plantillaId || !!textoPlano(proyectoData.descripcion)
  const valido3 = true

  return (
    <Layout titulo="Nuevo proyecto" volver={base}>
      {/* Steps */}
      <div className="flex items-center gap-2 mb-8">
        {['Cliente', 'Proyecto', 'Equipo', 'Listo'].map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                paso > i + 1
                  ? 'bg-brand-500 text-slate-900'
                  : paso === i + 1
                  ? 'bg-brand-500 text-slate-900 ring-4 ring-brand-100'
                  : 'bg-slate-200 text-slate-400'
              }`}
            >
              {paso > i + 1 ? <Check size={13} /> : i + 1}
            </div>
            <span className={`text-sm hidden sm:block ${paso === i + 1 ? 'font-semibold text-slate-800' : 'text-slate-400'}`}>{s}</span>
            {i < 3 && <div className="w-8 h-px bg-slate-200 shrink-0" />}
          </div>
        ))}
      </div>

      <div className="max-w-2xl">
        {/* ─── Paso 1: Cliente ─── */}
        {paso === 1 && (
          <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
            <h2 className="font-semibold text-slate-800">Datos del cliente</h2>

            <Campo label="Tipo de proyecto">
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setTipo('finito')}
                  className={`flex items-start gap-3 text-left px-4 py-3 rounded-xl border transition-colors ${
                    tipo === 'finito' ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <GitBranch size={18} className={tipo === 'finito' ? 'text-brand-700' : 'text-slate-400'} />
                  <div>
                    <div className={`text-sm font-medium ${tipo === 'finito' ? 'text-brand-800' : 'text-slate-700'}`}>Finito</div>
                    <div className="text-xs text-slate-400 mt-0.5">Con fases y fecha de entrega</div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setTipo('continuo')}
                  className={`flex items-start gap-3 text-left px-4 py-3 rounded-xl border transition-colors ${
                    tipo === 'continuo' ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <Kanban size={18} className={tipo === 'continuo' ? 'text-brand-700' : 'text-slate-400'} />
                  <div>
                    <div className={`text-sm font-medium ${tipo === 'continuo' ? 'text-brand-800' : 'text-slate-700'}`}>Continuo</div>
                    <div className="text-xs text-slate-400 mt-0.5">Servicio recurrente, tablero Kanban</div>
                  </div>
                </button>
              </div>
            </Campo>

            <Campo label="Nombre del proyecto *">
              <input value={proyectoData.nombre} onChange={(e) => setProyectoData({ ...proyectoData, nombre: e.target.value })} className={inputCls} placeholder="Sitio Web, SEO mensual..." maxLength={80} />
            </Campo>

            {!clienteExterno && (
              <Campo label="Cliente *">
                <BuscadorCliente
                  clientes={clientesFoco}
                  value={clienteId}
                  onSelect={seleccionarCliente}
                  onImportado={clienteImportado}
                />
              </Campo>
            )}
            <button type="button" onClick={alternarClienteExterno} className="text-xs text-brand-700 hover:text-brand-800 underline decoration-dotted">
              {clienteExterno ? 'Elegir cliente del CRM' : 'Cliente externo (no está en el CRM)'}
            </button>

            {(clienteExterno || clienteId) && (
              <>
                <Campo label={clienteExterno ? 'Nombre comercial *' : 'Nombre comercial'}>
                  <input value={cliente.nombreComercial} onChange={(e) => setCliente({ ...cliente, nombreComercial: e.target.value })} className={inputCls} placeholder="IM Multiservice LLC" />
                </Campo>
                <Campo label={clienteExterno ? 'Contacto principal *' : 'Contacto principal'}>
                  <input value={cliente.contactoPrincipal} onChange={(e) => setCliente({ ...cliente, contactoPrincipal: e.target.value })} className={inputCls} placeholder="Ingrid María Martínez Ramos" />
                </Campo>
                <div className="grid grid-cols-2 gap-4">
                  <Campo label="WhatsApp">
                    <input value={cliente.whatsapp} onChange={(e) => setCliente({ ...cliente, whatsapp: e.target.value })} className={inputCls} placeholder="+52 55 1234 5678" />
                  </Campo>
                  <Campo label={clienteExterno ? 'Correo electrónico *' : 'Correo electrónico'}>
                    <input type="email" value={cliente.correo} onChange={(e) => setCliente({ ...cliente, correo: e.target.value })} className={inputCls} placeholder="cliente@empresa.com" />
                  </Campo>
                </div>
              </>
            )}

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-slate-700">Participantes adicionales</label>
                <button onClick={agregarParticipante} className="flex items-center gap-1 text-xs text-brand-700 hover:text-brand-800">
                  <Plus size={13} /> Agregar
                </button>
              </div>
              {cliente.participantes.map((p, i) => (
                <div key={i} className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-3">
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Nombre</label>
                      <input value={p.nombre} onChange={(e) => actualizarParticipante(i, 'nombre', e.target.value)} className={inputCls} placeholder="Nombre completo" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Correo</label>
                      <input value={p.correo} onChange={(e) => actualizarParticipante(i, 'correo', e.target.value)} className={inputCls} placeholder="correo@ejemplo.com" type="email" />
                    </div>
                  </div>
                  <div className="flex items-end gap-3">
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-slate-500 mb-1">WhatsApp / teléfono</label>
                      <input value={p.whatsapp || ''} onChange={(e) => actualizarParticipante(i, 'whatsapp', e.target.value)} className={inputCls} placeholder="+52 55 1234 5678" />
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-slate-500 mb-1">Rol en el proyecto</label>
                      <select value={p.rol} onChange={(e) => actualizarParticipante(i, 'rol', e.target.value)} className={inputCls}>
                        <option>Aprobador</option>
                        <option>Proveedor de recursos</option>
                        <option>Solo seguimiento</option>
                      </select>
                    </div>
                    <button onClick={() => quitarParticipante(i)} className="flex items-center gap-1 text-xs text-slate-400 hover:text-red-500 pb-2.5 transition-colors">
                      <Trash2 size={13} /> Quitar
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setPaso(2)}
                disabled={!valido1}
                className="bg-brand-500 hover:bg-brand-600 disabled:opacity-40 text-slate-900 px-6 py-2.5 rounded-lg text-sm font-semibold transition-colors"
              >
                Siguiente →
              </button>
            </div>
          </div>
        )}

        {/* ─── Paso 2: Proyecto ─── */}
        {paso === 2 && esContinuo && (
          <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">
            <h2 className="font-semibold text-slate-800">Datos del servicio</h2>
            <p className="text-sm text-slate-400">Los proyectos continuos no usan fases ni plantillas — se gestionan con un tablero Kanban que empieza vacío y se llena manualmente o desde Claude Code.</p>

            <Campo label="Nombre del servicio *">
              <input value={proyectoData.paquete} onChange={(e) => setProyectoData({ ...proyectoData, paquete: e.target.value })} className={inputCls} placeholder="Mantenimiento mensual" />
            </Campo>

            <SelectorAreas areasProyecto={areasProyecto} onToggle={toggleArea} />

            <Campo label="Descripción del proyecto (opcional)">
              <EditorEnriquecido
                value={proyectoData.descripcion}
                onChange={(html) => setProyectoData({ ...proyectoData, descripcion: html })}
                placeholder="De qué trata el proyecto y qué se busca lograr — le da contexto al equipo"
              />
            </Campo>

            <Campo label="Fecha de inicio">
              <input type="date" value={proyectoData.fechaInicio} onChange={(e) => setProyectoData({ ...proyectoData, fechaInicio: e.target.value })} className={inputCls} />
            </Campo>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={proyectoData.anticipoConfirmado}
                onChange={(e) => setProyectoData({ ...proyectoData, anticipoConfirmado: e.target.checked })}
                className="accent-brand-500 w-4 h-4"
              />
              <span className="text-sm font-medium text-slate-700">Primer pago confirmado</span>
              {!proyectoData.anticipoConfirmado && (
                <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">El proyecto no se activará sin confirmar el pago</span>
              )}
            </label>

            <div className="flex justify-between pt-2">
              <button onClick={() => setPaso(1)} className="text-slate-500 hover:text-slate-700 text-sm px-4 py-2">← Atrás</button>
              <button
                onClick={() => setPaso(3)}
                disabled={!valido2}
                className="bg-brand-500 hover:bg-brand-600 disabled:opacity-40 text-slate-900 px-6 py-2.5 rounded-lg text-sm font-semibold transition-colors"
              >
                Siguiente →
              </button>
            </div>
          </div>
        )}

        {paso === 2 && !esContinuo && (
          <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">
            <h2 className="font-semibold text-slate-800">Datos del proyecto</h2>

            {cargandoPropuestas && (
              <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={14} className="animate-spin" /> Buscando sus propuestas en el CRM…</p>
            )}
            {errorPropuestas && (
              <p className="flex items-center gap-2 text-xs text-slate-500"><CircleAlert size={13} className="shrink-0" /> {errorPropuestas} — describe el proyecto aquí abajo para continuar sin propuesta.</p>
            )}

            {propuestas.length > 0 && (
              <Campo label="Propuesta del CRM">
                <div className="space-y-1.5">
                  {propuestas.map((pr) => (
                    <OpcionPropuesta key={pr.id} activa={propuestaId === pr.id} onClick={() => setPropuestaId(pr.id)}>
                      <span className="flex-1 min-w-0 truncate">{pr.titulo}</span>
                      {pr.fecha && <span className="text-xs text-slate-400 shrink-0">{pr.fecha}</span>}
                      <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${pr.estado === 'aceptada' ? 'bg-brand-100 text-brand-800' : 'bg-slate-100 text-slate-500'}`}>
                        {ESTADO_PROPUESTA_LABEL[pr.estado] || pr.estado}
                      </span>
                    </OpcionPropuesta>
                  ))}
                  <OpcionPropuesta activa={!propuestaId} onClick={() => setPropuestaId('')}>
                    <span className="flex-1 text-slate-500">Sin propuesta — capturar a mano</span>
                  </OpcionPropuesta>
                </div>
                {propuestaId && (
                  <p className="flex items-center gap-1.5 text-xs text-slate-500 mt-2">
                    <Sparkles size={13} className="text-brand-600 shrink-0" /> Al crear, se importa la propuesta y la IA arma el plan y la fecha de entrega.
                  </p>
                )}
              </Campo>
            )}

            {!propuestaId && !cargandoPropuestas && (
              <>
                <Campo label="Descripción del proyecto *">
                  <EditorEnriquecido
                    value={proyectoData.descripcion}
                    onChange={(html) => setProyectoData({ ...proyectoData, descripcion: html })}
                    placeholder="Qué se va a hacer y qué se busca lograr"
                  />
                </Campo>
                {plantillas.length > 0 && (
                  <Campo label="Plantilla de actividades (opcional)">
                    <select
                      value={proyectoData.plantillaId}
                      onChange={(e) => {
                        const pl = plantillas.find((x) => x.id === e.target.value)
                        setProyectoData({ ...proyectoData, plantillaId: e.target.value, paquete: pl?.nombre || '' })
                      }}
                      className={inputCls}
                    >
                      <option value="">Sin plantilla</option>
                      {Object.entries(
                        plantillas.reduce((acc, pl) => { (acc[pl.area] ||= []).push(pl); return acc }, {})
                      ).map(([area, pls]) => (
                        <optgroup key={area} label={area}>
                          {pls.map((pl) => <option key={pl.id} value={pl.id}>{pl.nombre} ({pl.tareas.length} actividades)</option>)}
                        </optgroup>
                      ))}
                    </select>
                  </Campo>
                )}
              </>
            )}

            <SelectorAreas areasProyecto={areasProyecto} onToggle={toggleArea} />

            <Campo label="Contexto técnico">
              <div className="space-y-2.5">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={contextoTecnico.yaEsCliente} onChange={(e) => setContextoTecnico({ ...contextoTecnico, yaEsCliente: e.target.checked })} className="accent-brand-500 w-4 h-4" />
                  <span className="text-sm text-slate-700">Ya es cliente (tiene un sitio con nosotros)</span>
                </label>
                {contextoTecnico.yaEsCliente && (
                  <input value={contextoTecnico.sitioActual} onChange={(e) => setContextoTecnico({ ...contextoTecnico, sitioActual: e.target.value })} className={inputCls} placeholder="https://sitio-actual.com" />
                )}
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={contextoTecnico.tieneDominio} onChange={(e) => setContextoTecnico({ ...contextoTecnico, tieneDominio: e.target.checked })} className="accent-brand-500 w-4 h-4" />
                  <span className="text-sm text-slate-700">Ya tiene dominio</span>
                </label>
                {contextoTecnico.tieneDominio && (
                  <input value={contextoTecnico.dominio} onChange={(e) => setContextoTecnico({ ...contextoTecnico, dominio: e.target.value })} className={inputCls} placeholder="empresa.com" />
                )}
                <div className="flex flex-wrap gap-2 pt-1">
                  {OPCIONES_HOSTING.map(([valor, label]) => (
                    <label
                      key={valor}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm cursor-pointer transition-colors ${
                        contextoTecnico.hosting === valor ? 'border-brand-500 bg-brand-50 text-brand-800 font-medium' : 'border-slate-200 text-slate-700 hover:border-slate-300'
                      }`}
                    >
                      <input type="radio" name="hosting" checked={contextoTecnico.hosting === valor} onChange={() => setContextoTecnico({ ...contextoTecnico, hosting: valor })} className="accent-brand-500" />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
            </Campo>

            <div className="grid grid-cols-2 gap-4">
              <Campo label="Fecha de inicio">
                <input type="date" value={proyectoData.fechaInicio} onChange={(e) => setProyectoData({ ...proyectoData, fechaInicio: e.target.value })} className={inputCls} />
              </Campo>
              {!propuestaId && (
                <Campo label="Fecha estimada de entrega">
                  <input type="date" value={proyectoData.fechaEstimadaEntrega} onChange={(e) => setProyectoData({ ...proyectoData, fechaEstimadaEntrega: e.target.value })} className={inputCls} />
                </Campo>
              )}
            </div>

            <div className="flex justify-between pt-2">
              <button onClick={() => setPaso(1)} className="text-slate-500 hover:text-slate-700 text-sm px-4 py-2">← Atrás</button>
              <button
                onClick={() => setPaso(3)}
                disabled={!valido2 || cargandoPropuestas}
                className="bg-brand-500 hover:bg-brand-600 disabled:opacity-40 text-slate-900 px-6 py-2.5 rounded-lg text-sm font-semibold transition-colors"
              >
                Siguiente →
              </button>
            </div>
          </div>
        )}

        {/* ─── Paso 3: Equipo ─── */}
        {paso === 3 && (
          <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
            <h2 className="font-semibold text-slate-800">Equipo asignado</h2>

            {rolesVisibles.map(([key, label]) => (
              <Campo key={key} label={label}>
                {key === 'programador' && (
                  <label className="flex items-center gap-1.5 text-xs text-slate-500 mb-1.5">
                    <input type="checkbox" checked={programadorNoAplica} onChange={(e) => setProgramadorNoAplica(e.target.checked)} />
                    No aplica
                  </label>
                )}
                {!(key === 'programador' && programadorNoAplica) && (
                  <div className="flex flex-wrap gap-1.5">
                    {miembrosSeleccionables.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setEquipo({
                          ...equipo,
                          [key]: equipo[key].includes(m.id) ? equipo[key].filter((id) => id !== m.id) : [...equipo[key], m.id],
                        })}
                        className={`text-xs px-2.5 py-1.5 rounded-full border transition-colors ${
                          equipo[key].includes(m.id)
                            ? 'bg-brand-500 border-brand-500 text-slate-900 font-medium'
                            : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                        }`}
                      >
                        {etiquetaPersona[m.id]}
                      </button>
                    ))}
                  </div>
                )}
              </Campo>
            ))}

            <Campo label="Contraseña de acceso del cliente">
              <div className="flex gap-2">
                <input
                  value={passwordCliente}
                  onChange={(e) => setPasswordCliente(e.target.value)}
                  className={inputCls + ' flex-1'}
                />
                <button
                  onClick={() => setPasswordCliente(generarPasswordSimple())}
                  className="px-3 py-2 border border-slate-200 rounded-lg text-xs text-slate-600 hover:bg-slate-50"
                >
                  Generar
                </button>
              </div>
              <p className="text-xs text-slate-400 mt-1">Esta contraseña se compartirá con el cliente para que vea su progreso.</p>
            </Campo>

            {errorCrear && (
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{errorCrear}</p>
            )}

            <div className="flex justify-between pt-2">
              <button onClick={() => setPaso(2)} className="text-slate-500 hover:text-slate-700 text-sm px-4 py-2">← Atrás</button>
              <button
                onClick={handleCrear}
                disabled={creando}
                className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-60 text-slate-900 px-6 py-2.5 rounded-lg text-sm font-semibold transition-colors"
              >
                {creando && <Loader2 size={14} className="animate-spin" />}
                Crear proyecto ✓
              </button>
            </div>
          </div>
        )}

        {/* ─── Paso 4: Listo ─── */}
        {paso === 4 && proyectoCreado && (
          <div className="space-y-4">
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5">
              <div className="text-2xl mb-2">🎉</div>
              <h2 className="font-semibold text-emerald-800 text-lg">¡Proyecto creado!</h2>
              <p className="text-emerald-700 text-sm mt-1">
                {nombreProyecto(proyectoCreado)}{proyectoCreado.proyecto.paquete ? ` — ${proyectoCreado.proyecto.paquete}` : ''}
              </p>
              {!proyectoCreado.proyecto.anticipoConfirmado && (
                <p className="text-amber-700 text-sm mt-2 bg-amber-50 px-3 py-2 rounded-lg border border-amber-200">
                  ⚠️ El proyecto está pendiente de anticipo. No se activará hasta confirmarlo.
                </p>
              )}
            </div>

            {progresoIA && (
              <ProgresoPlan
                progreso={progresoIA}
                onAbrir={() => navigate(`${base}/proyecto/${proyectoCreado.slug}`, { state: { tab: 'info' } })}
              />
            )}

            {proyectoCreado.driveRespuestasId && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex items-center gap-3 text-sm text-emerald-700">
                <FolderOpen size={16} className="shrink-0" />
                Carpeta de Drive del proyecto creada automáticamente.
              </div>
            )}

            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <h3 className="font-semibold text-slate-800 mb-3">Acceso del cliente</h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-slate-500 w-24 shrink-0">Link:</span>
                  <code className="bg-slate-100 px-2 py-1 rounded text-xs text-slate-700 flex-1 truncate">
                    {window.location.origin}/cliente/{proyectoCreado.slug}
                  </code>
                  <button
                    onClick={() => navigator.clipboard.writeText(`${window.location.origin}/cliente/${proyectoCreado.slug}`)}
                    className="text-slate-400 hover:text-slate-700"
                  >
                    <Copy size={14} />
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-500 w-24 shrink-0">Contraseña:</span>
                  <code className="bg-slate-100 px-2 py-1 rounded text-xs text-slate-700">{proyectoCreado.passwordCliente}</code>
                  <button
                    onClick={() => navigator.clipboard.writeText(proyectoCreado.passwordCliente)}
                    className="text-slate-400 hover:text-slate-700"
                  >
                    <Copy size={14} />
                  </button>
                </div>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-slate-800">Mensaje de inicio (WhatsApp)</h3>
                <button
                  onClick={copiarMensaje}
                  className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg transition-colors ${
                    mensajeCopiado ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                >
                  {mensajeCopiado ? <Check size={14} /> : <Copy size={14} />}
                  {mensajeCopiado ? 'Copiado' : 'Copiar'}
                </button>
              </div>
              <pre className="text-xs text-slate-600 whitespace-pre-wrap font-sans bg-slate-50 rounded-lg p-3 max-h-48 overflow-auto">
                {generarMensajeInicio(proyectoCreado, miembrosPorId)}
              </pre>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => navigate(`${base}/proyecto/${proyectoCreado.slug}`)}
                className="flex-1 bg-brand-500 hover:bg-brand-600 text-slate-900 py-3 rounded-lg text-sm font-semibold transition-colors"
              >
                Ver proyecto →
              </button>
              <button
                onClick={() => navigate(base)}
                className="px-6 py-3 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg text-sm transition-colors"
              >
                Ir al dashboard
              </button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}

function OpcionPropuesta({ activa, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-3 text-left px-3 py-2.5 rounded-lg border text-sm transition-colors ${
        activa ? 'border-brand-500 bg-brand-50 text-brand-800 font-medium' : 'border-slate-200 hover:border-slate-300 text-slate-700'
      }`}
    >
      {children}
    </button>
  )
}

function ProgresoPlan({ progreso, onAbrir }) {
  const { etapa, fallo, mensaje } = progreso
  const lineas = [
    ['alcance', 'Importando la propuesta…', 'Propuesta importada'],
    ['plan', 'La IA está armando el plan… (puede tardar un par de minutos)', 'Borrador del plan listo para revisar'],
  ]
  const orden = { alcance: 0, plan: 1, listo: 2 }
  const actual = etapa === 'error' ? orden[fallo] : orden[etapa]
  const terminado = etapa === 'listo' || etapa === 'error' || etapa === 'sin_permiso'
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
      <h3 className="font-semibold text-slate-800 flex items-center gap-2"><Sparkles size={15} className="text-brand-600" /> Plan de trabajo</h3>
      {etapa === 'sin_permiso' ? (
        <p className="text-sm text-slate-500">Un admin puede importar la propuesta y generar el plan desde la pestaña Info del proyecto.</p>
      ) : (
        lineas.map(([clave, enCurso, hecho], i) => {
          if (i > actual) return null
          const falloAqui = etapa === 'error' && i === actual
          return (
            <p key={clave} className="flex items-center gap-2 text-sm text-slate-600">
              {falloAqui ? <CircleAlert size={14} className="shrink-0" /> : i < actual ? <Check size={14} className="text-brand-700 shrink-0" /> : <Loader2 size={14} className="animate-spin shrink-0" />}
              {falloAqui ? mensaje : i < actual ? hecho : enCurso}
            </p>
          )
        })
      )}
      {etapa === 'error' && <p className="text-xs text-slate-400">Puedes reintentarlo desde la pestaña Info del proyecto.</p>}
      {terminado && (
        <button onClick={onAbrir} className="mt-1 bg-brand-500 hover:bg-brand-600 text-slate-900 px-4 py-2 rounded-lg text-sm font-semibold transition-colors">
          {etapa === 'listo' ? 'Revisar el plan →' : 'Abrir el proyecto →'}
        </button>
      )}
    </div>
  )
}

function SelectorAreas({ areasProyecto, onToggle }) {
  return (
    <Campo label="Área(s) del proyecto">
      <div className="flex flex-wrap gap-2">
        {AREAS.map((a) => (
          <label
            key={a.valor}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm cursor-pointer transition-colors ${
              areasProyecto.includes(a.valor) ? 'border-brand-500 bg-brand-50 text-brand-800 font-medium' : 'border-slate-200 text-slate-700 hover:border-slate-300'
            }`}
          >
            <input type="checkbox" checked={areasProyecto.includes(a.valor)} onChange={() => onToggle(a.valor)} className="accent-brand-500" />
            {a.label}
          </label>
        ))}
      </div>
      <p className="text-xs text-slate-400 mt-1.5">Un proyecto integral puede marcar varias áreas. Sin ninguna marcada, le aparece a todos.</p>
    </Campo>
  )
}

const ROLES_EQUIPO_ALTA = [
  ['copy', 'Copy'],
  ['disenador', 'Diseñador'],
  ['programador', 'Programador'],
  ['redes', 'Redes'],
  ['adminProyecto', 'Coordinador del proyecto'],
  ['asistente', 'Asistente'],
]

const ROLES_POR_AREA = {
  web: ['programador', 'disenador', 'copy'],
  diseno_grafico: ['disenador'],
  redes_sociales: ['redes'],
}

// Sin área elegida se muestran todos los roles; coordinador y asistente siempre.
function rolesEquipoDeAreas(areas) {
  if (!areas.length) return ROLES_EQUIPO_ALTA
  const permitidos = new Set(['adminProyecto', 'asistente', ...areas.flatMap((a) => ROLES_POR_AREA[a] || [])])
  return ROLES_EQUIPO_ALTA.filter(([key]) => permitidos.has(key))
}

function Campo({ label, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1.5">{label}</label>
      {children}
    </div>
  )
}

const inputCls = 'w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent placeholder:text-slate-400'

function generarPasswordSimple() {
  const palabras = ['cielo', 'verde', 'azul', 'rio', 'sol', 'luna', 'mar', 'viento']
  const n = Math.floor(100 + Math.random() * 900)
  const p = palabras[Math.floor(Math.random() * palabras.length)]
  return `${p}${n}`
}
