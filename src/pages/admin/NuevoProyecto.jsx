import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../../components/Layout'
import { useAuth } from '../../context/AuthContext'
import { crearProyecto, getMiembros, actualizarLinks, completarTarea } from '../../data/api'
import { generarMensajeInicio } from '../../data/mensajes'
import { getPlantillas, getPlantilla, copiarTareasDesde, FASES_WEB } from '../../data/plantillas'
import { EXTRAS_DISPONIBLES } from '../../data/paquetes'
import { crearCarpetasCliente, driveConfigurado } from '../../data/googleDrive'
import { Copy, Check, Plus, Trash2, FolderOpen, Loader2, AlertCircle } from 'lucide-react'

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

export default function NuevoProyecto() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const plantillas = getPlantillas()

  const [miembros, setMiembros] = useState([])
  const [paso, setPaso] = useState(1)
  const [mensajeCopiado, setMensajeCopiado] = useState(false)
  const [proyectoCreado, setProyectoCreado] = useState(null)
  const [driveEstado, setDriveEstado] = useState(null) // null | 'cargando' | 'ok' | 'error'
  const [driveError, setDriveError] = useState('')
  const [creando, setCreando] = useState(false)
  const [errorCrear, setErrorCrear] = useState('')

  const [cliente, setCliente] = useState({
    nombreComercial: '',
    contactoPrincipal: '',
    whatsapp: '',
    correo: '',
    participantes: [],
  })
  const [proyectoData, setProyectoData] = useState({
    paquete: '',
    plantillaId: '',
    extras: [],
    fechaInicio: new Date().toISOString().split('T')[0],
    fechaEstimadaEntrega: '',
    anticipoConfirmado: false,
  })
  const [condiciones, setCondiciones] = useState(COND_DEFAULT)
  const [equipo, setEquipo] = useState({
    copy: 'Por asignar',
    disenador: 'Por asignar',
    programador: 'No aplica',
    adminProyecto: '',
  })
  const [passwordCliente, setPasswordCliente] = useState(generarPasswordSimple())

  useEffect(() => {
    getMiembros().then(setMiembros).catch(() => {})
  }, [])

  useEffect(() => {
    if (user?.nombre) {
      setEquipo((prev) => ({ ...prev, adminProyecto: prev.adminProyecto || user.nombre }))
    }
  }, [user])

  function toggleExtra(extra) {
    setProyectoData((prev) => ({
      ...prev,
      extras: prev.extras.includes(extra)
        ? prev.extras.filter((e) => e !== extra)
        : [...prev.extras, extra],
    }))
  }

  function agregarParticipante() {
    setCliente((prev) => ({
      ...prev,
      participantes: [...prev.participantes, { nombre: '', correo: '', rol: 'Solo seguimiento' }],
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
      const plantilla = getPlantilla(proyectoData.plantillaId)
      const tareas = copiarTareasDesde(proyectoData.plantillaId, condiciones, proyectoData.extras)

      const p = await crearProyecto({
        cliente,
        proyecto: {
          paquete: proyectoData.paquete,
          plantillaId: proyectoData.plantillaId,
          fases: plantilla?.fases || FASES_WEB,
          extras: proyectoData.extras,
          fechaInicio: proyectoData.fechaInicio,
          fechaEstimadaEntrega: proyectoData.fechaEstimadaEntrega,
          anticipoConfirmado: proyectoData.anticipoConfirmado,
        },
        condicionesTecnicas: condiciones,
        equipo,
        passwordCliente,
        tareas,
        creadoPor: user?.nombre,
      })
      setProyectoCreado(p)
      setPaso(4)

      if (driveConfigurado()) {
        setDriveEstado('cargando')
        try {
          const links = await crearCarpetasCliente(cliente.nombreComercial)
          await actualizarLinks(p.slug, { drive: links.drive })
          const tareaDrive = p.tareas.find((t) => t.linkTipo === 'drive')
          if (tareaDrive) await completarTarea(p.slug, tareaDrive.id)
          setDriveEstado('ok')
        } catch (err) {
          setDriveEstado('error')
          setDriveError(err.message || 'Error desconocido')
        }
      }
    } catch (err) {
      setErrorCrear(err.message || 'Error al crear el proyecto')
    } finally {
      setCreando(false)
    }
  }

  function copiarMensaje() {
    const msg = generarMensajeInicio(proyectoCreado)
    navigator.clipboard.writeText(msg)
    setMensajeCopiado(true)
    setTimeout(() => setMensajeCopiado(false), 2500)
  }

  const valido1 = cliente.nombreComercial && cliente.contactoPrincipal && cliente.correo
  const valido2 = proyectoData.plantillaId && proyectoData.fechaEstimadaEntrega
  const valido3 = true

  return (
    <Layout titulo="Nuevo proyecto" volver="/admin">
      {/* Steps */}
      <div className="flex items-center gap-2 mb-8">
        {['Cliente', 'Proyecto', 'Equipo', 'Listo'].map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                paso > i + 1
                  ? 'bg-violet-600 text-white'
                  : paso === i + 1
                  ? 'bg-violet-600 text-white ring-4 ring-violet-100'
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

            <Campo label="Nombre comercial *">
              <input value={cliente.nombreComercial} onChange={(e) => setCliente({ ...cliente, nombreComercial: e.target.value })} className={inputCls} placeholder="IM Multiservice LLC" />
            </Campo>
            <Campo label="Contacto principal *">
              <input value={cliente.contactoPrincipal} onChange={(e) => setCliente({ ...cliente, contactoPrincipal: e.target.value })} className={inputCls} placeholder="Ingrid María Martínez Ramos" />
            </Campo>
            <div className="grid grid-cols-2 gap-4">
              <Campo label="WhatsApp">
                <input value={cliente.whatsapp} onChange={(e) => setCliente({ ...cliente, whatsapp: e.target.value })} className={inputCls} placeholder="+52 55 1234 5678" />
              </Campo>
              <Campo label="Correo electrónico *">
                <input type="email" value={cliente.correo} onChange={(e) => setCliente({ ...cliente, correo: e.target.value })} className={inputCls} placeholder="cliente@empresa.com" />
              </Campo>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-slate-700">Participantes adicionales</label>
                <button onClick={agregarParticipante} className="flex items-center gap-1 text-xs text-violet-600 hover:text-violet-800">
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
                className="bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white px-6 py-2.5 rounded-lg text-sm font-semibold transition-colors"
              >
                Siguiente →
              </button>
            </div>
          </div>
        )}

        {/* ─── Paso 2: Proyecto ─── */}
        {paso === 2 && (
          <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">
            <h2 className="font-semibold text-slate-800">Datos del proyecto</h2>

            <Campo label="Paquete base *">
              {Object.entries(
                plantillas.reduce((acc, p) => { if (!acc[p.area]) acc[p.area] = []; acc[p.area].push(p); return acc }, {})
              ).map(([area, pqs]) => (
                <div key={area} className="mb-3">
                  <div className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5">{area}</div>
                  <div className="grid grid-cols-2 gap-2">
                    {pqs.map((pq) => (
                      <button
                        key={pq.id}
                        onClick={() => setProyectoData({ ...proyectoData, paquete: pq.nombre, plantillaId: pq.id })}
                        className={`text-left px-3 py-2.5 rounded-lg border text-sm transition-colors ${
                          proyectoData.plantillaId === pq.id
                            ? 'border-violet-500 bg-violet-50 text-violet-700 font-medium'
                            : 'border-slate-200 hover:border-slate-300 text-slate-700'
                        }`}
                      >
                        <div className="font-medium">{pq.nombre}</div>
                        {pq.descripcion && <div className="text-xs text-slate-400 mt-0.5 line-clamp-1">{pq.descripcion}</div>}
                        <div className="text-xs text-slate-300 mt-0.5">{pq.tareas.length} actividades</div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </Campo>

            <Campo label="Extras">
              <div className="grid grid-cols-2 gap-2">
                {EXTRAS_DISPONIBLES.map((e) => (
                  <label key={e} className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={proyectoData.extras.includes(e)}
                      onChange={() => toggleExtra(e)}
                      className="mt-0.5 accent-violet-600"
                    />
                    <span className="text-sm text-slate-700">{e}</span>
                  </label>
                ))}
              </div>
            </Campo>

            <div className="grid grid-cols-2 gap-4">
              <Campo label="Fecha de inicio">
                <input type="date" value={proyectoData.fechaInicio} onChange={(e) => setProyectoData({ ...proyectoData, fechaInicio: e.target.value })} className={inputCls} />
              </Campo>
              <Campo label="Fecha estimada de entrega *">
                <input type="date" value={proyectoData.fechaEstimadaEntrega} onChange={(e) => setProyectoData({ ...proyectoData, fechaEstimadaEntrega: e.target.value })} className={inputCls} />
              </Campo>
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={proyectoData.anticipoConfirmado}
                onChange={(e) => setProyectoData({ ...proyectoData, anticipoConfirmado: e.target.checked })}
                className="accent-violet-600 w-4 h-4"
              />
              <span className="text-sm font-medium text-slate-700">Anticipo confirmado</span>
              {!proyectoData.anticipoConfirmado && (
                <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">El proyecto no se activará sin anticipo</span>
              )}
            </label>

            <h3 className="font-semibold text-slate-800 pt-2">Condiciones técnicas</h3>

            <div className="grid grid-cols-2 gap-3">
              {[
                ['tieneDominio', '¿Ya tiene dominio?'],
                ['tieneHosting', '¿Ya tiene hosting?'],
                ['requiereCorreos', '¿Requiere correos corporativos?'],
                ['requiereCloudflare', '¿Requiere Cloudflare?'],
                ['requiereAnalytics', '¿Requiere Google Analytics?'],
                ['requiereSearchConsole', '¿Requiere Search Console?'],
                ['requiereCapacitacion', '¿Requiere capacitación?'],
              ].map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={condiciones[key]}
                    onChange={(e) => setCondiciones({ ...condiciones, [key]: e.target.checked })}
                    className="accent-violet-600 w-4 h-4"
                  />
                  <span className="text-sm text-slate-700">{label}</span>
                </label>
              ))}
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={condiciones.requierePluginAdicional}
                onChange={(e) => setCondiciones({ ...condiciones, requierePluginAdicional: e.target.checked })}
                className="accent-violet-600 w-4 h-4"
              />
              <span className="text-sm text-slate-700">¿Requiere plugin adicional?</span>
            </label>
            {condiciones.requierePluginAdicional && (
              <input
                value={condiciones.pluginAdicionalNombre}
                onChange={(e) => setCondiciones({ ...condiciones, pluginAdicionalNombre: e.target.value })}
                className={inputCls}
                placeholder="Nombre del plugin..."
              />
            )}

            <div className="flex justify-between pt-2">
              <button onClick={() => setPaso(1)} className="text-slate-500 hover:text-slate-700 text-sm px-4 py-2">← Atrás</button>
              <button
                onClick={() => setPaso(3)}
                disabled={!valido2}
                className="bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white px-6 py-2.5 rounded-lg text-sm font-semibold transition-colors"
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

            {[
              ['copy', 'Copy'],
              ['disenador', 'Diseñador'],
              ['programador', 'Programador'],
              ['adminProyecto', 'Coordinador del proyecto'],
            ].map(([key, label]) => (
              <Campo key={key} label={label}>
                <select
                  value={equipo[key]}
                  onChange={(e) => setEquipo({ ...equipo, [key]: e.target.value })}
                  className={inputCls}
                >
                  <option>Por asignar</option>
                  {key === 'programador' && <option>No aplica</option>}
                  {miembros.map((m) => (
                    <option key={m.id} value={m.nombre}>{m.nombre}</option>
                  ))}
                </select>
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
                className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white px-6 py-2.5 rounded-lg text-sm font-semibold transition-colors"
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
                {proyectoCreado.cliente.nombreComercial} — {proyectoCreado.proyecto.paquete}
              </p>
              {!proyectoCreado.proyecto.anticipoConfirmado && (
                <p className="text-amber-700 text-sm mt-2 bg-amber-50 px-3 py-2 rounded-lg border border-amber-200">
                  ⚠️ El proyecto está pendiente de anticipo. No se activará hasta confirmarlo.
                </p>
              )}
            </div>

            {driveEstado === 'cargando' && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-center gap-3 text-sm text-blue-700">
                <Loader2 size={16} className="animate-spin shrink-0" />
                Creando carpetas en Google Drive...
              </div>
            )}
            {driveEstado === 'ok' && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex items-center gap-3 text-sm text-emerald-700">
                <FolderOpen size={16} className="shrink-0" />
                Carpetas en Google Drive creadas y link guardado en el proyecto.
              </div>
            )}
            {driveEstado === 'error' && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
                <div className="flex items-center gap-2 mb-1">
                  <AlertCircle size={15} className="shrink-0" />
                  No se pudieron crear las carpetas en Drive. Puedes crearlas manualmente desde el proyecto.
                </div>
                {driveError && <div className="text-xs text-amber-500 mt-1">{driveError}</div>}
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
                {generarMensajeInicio(proyectoCreado)}
              </pre>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => navigate(`/admin/proyecto/${proyectoCreado.slug}`)}
                className="flex-1 bg-violet-600 hover:bg-violet-700 text-white py-3 rounded-lg text-sm font-semibold transition-colors"
              >
                Ver proyecto →
              </button>
              <button
                onClick={() => navigate('/admin')}
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

function Campo({ label, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1.5">{label}</label>
      {children}
    </div>
  )
}

const inputCls = 'w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent placeholder:text-slate-400'

function generarPasswordSimple() {
  const palabras = ['cielo', 'verde', 'azul', 'rio', 'sol', 'luna', 'mar', 'viento']
  const n = Math.floor(100 + Math.random() * 900)
  const p = palabras[Math.floor(Math.random() * palabras.length)]
  const q = palabras[Math.floor(Math.random() * palabras.length)]
  return `${p}${n}${q}`
}
