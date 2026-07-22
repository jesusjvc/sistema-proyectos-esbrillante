import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Layout from '../../components/Layout'
import {
  getPlantilla, actualizarPlantilla,
  agregarTareaPlantilla, editarTareaPlantilla, eliminarTareaPlantilla,
  reordenarTareasPlantilla, agregarFasePlantilla, editarFasePlantilla,
  CONDICION_LABELS,
} from '../../data/plantillas'
import {
  Pencil, Trash2, Plus, Check, X, ChevronDown, ChevronUp,
  ChevronUp as MoveUp, ChevronDown as MoveDown, GripVertical, Info, AlertCircle,
} from 'lucide-react'

const RESPONSABLES = [
  { valor: 'admin', label: 'Admin' },
  { valor: 'equipo', label: 'Equipo (cualquiera)' },
  { valor: 'copy', label: 'Copy' },
  { valor: 'disenador', label: 'Diseñador' },
  { valor: 'programador', label: 'Programador' },
  { valor: 'karla', label: 'Karla (QA)' },
  { valor: 'cliente', label: 'Cliente' },
]

export default function EditarPaquete() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [plantilla, setPlantilla] = useState(() => getPlantilla(id))
  const [editandoNombre, setEditandoNombre] = useState(false)
  const [metaForm, setMetaForm] = useState({})
  const [fasesAbiertas, setFasesAbiertas] = useState(new Set([plantilla?.fases[0]?.numero]))
  const [modalTarea, setModalTarea] = useState(null) // { modo: 'nueva'|'editar', faseNum, tarea? }
  const [editandoFase, setEditandoFase] = useState(null)
  const [nuevaFaseNombre, setNuevaFaseNombre] = useState('')
  const [mostrarNuevaFase, setMostrarNuevaFase] = useState(false)

  if (!plantilla) { navigate('/admin/paquetes'); return null }

  function refresh() { setPlantilla(getPlantilla(id)) }

  function toggleFase(num) {
    setFasesAbiertas((prev) => {
      const s = new Set(prev)
      s.has(num) ? s.delete(num) : s.add(num)
      return s
    })
  }

  function guardarMeta() {
    actualizarPlantilla(id, metaForm)
    setEditandoNombre(false)
    refresh()
  }

  function iniciarEditarMeta() {
    setMetaForm({ nombre: plantilla.nombre, area: plantilla.area, descripcion: plantilla.descripcion })
    setEditandoNombre(true)
  }

  function handleGuardarTarea(datos) {
    if (modalTarea.modo === 'nueva') {
      agregarTareaPlantilla(id, { ...datos, fase: modalTarea.faseNum })
    } else {
      editarTareaPlantilla(id, modalTarea.tarea.id, datos)
    }
    setModalTarea(null)
    refresh()
  }

  function handleEliminarTarea(tareaId) {
    eliminarTareaPlantilla(id, tareaId)
    refresh()
  }

  function handleMover(tareaId, dir) {
    reordenarTareasPlantilla(id, tareaId, dir)
    refresh()
  }

  function handleAgregarFase(e) {
    e.preventDefault()
    if (!nuevaFaseNombre.trim()) return
    agregarFasePlantilla(id, { nombre: nuevaFaseNombre.trim() })
    setNuevaFaseNombre('')
    setMostrarNuevaFase(false)
    refresh()
  }

  function handleEditarNombreFase(num, nombre) {
    editarFasePlantilla(id, num, { nombre })
    setEditandoFase(null)
    refresh()
  }

  return (
    <Layout titulo={plantilla.nombre} volver="/admin/paquetes">
      <div className="max-w-3xl">
        {/* Meta del paquete */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 mb-6">
          {editandoNombre ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Nombre</label>
                  <input value={metaForm.nombre} onChange={(e) => setMetaForm({ ...metaForm, nombre: e.target.value })} className={inputCls} autoFocus />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Área</label>
                  <input value={metaForm.area} onChange={(e) => setMetaForm({ ...metaForm, area: e.target.value })} className={inputCls} list="areas-edit" />
                  <datalist id="areas-edit">
                    {['Web', 'Marketing', 'Branding', 'SEO', 'Redes Sociales', 'General'].map((a) => <option key={a} value={a} />)}
                  </datalist>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Descripción</label>
                <input value={metaForm.descripcion} onChange={(e) => setMetaForm({ ...metaForm, descripcion: e.target.value })} className={inputCls} placeholder="Descripción breve del paquete..." />
              </div>
              <div className="flex gap-2">
                <button onClick={guardarMeta} className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm px-4 py-2 rounded-lg transition-colors">
                  <Check size={14} /> Guardar
                </button>
                <button onClick={() => setEditandoNombre(false)} className="text-slate-400 hover:text-slate-700 px-3 py-2 text-sm">Cancelar</button>
              </div>
            </div>
          ) : (
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs bg-brand-100 text-brand-800 px-2 py-0.5 rounded-full font-medium">{plantilla.area}</span>
                  <span className="text-xs text-slate-400">{plantilla.tareas.length} actividades · {plantilla.fases.length} fases</span>
                </div>
                {plantilla.descripcion && <p className="text-sm text-slate-500 mt-1">{plantilla.descripcion}</p>}
              </div>
              <button onClick={iniciarEditarMeta} className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-brand-700 transition-colors shrink-0">
                <Pencil size={14} /> Editar nombre/área
              </button>
            </div>
          )}
        </div>

        {/* Nota sobre condiciones */}
        <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-xl p-4 mb-5 text-sm text-blue-700">
          <Info size={15} className="shrink-0 mt-0.5" />
          <span>Las actividades con <strong>condición</strong> solo se incluyen al crear un proyecto si la condición aplica (por ej., "Requiere Cloudflare" o "Extra: Ecommerce"). Las actividades sin condición siempre se incluyen.</span>
        </div>

        {/* Fases y tareas */}
        <div className="space-y-3">
          {plantilla.fases.map((fase) => {
            const tareasFase = plantilla.tareas.filter((t) => t.fase === fase.numero)
            const abierta = fasesAbiertas.has(fase.numero)

            return (
              <div key={fase.numero} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                {/* Header de fase */}
                <div className="flex items-center gap-2 px-4 py-3 bg-slate-50 border-b border-slate-100">
                  <button onClick={() => toggleFase(fase.numero)} className="flex items-center gap-2 flex-1 text-left">
                    <div className="w-6 h-6 rounded-full bg-brand-100 text-brand-800 text-xs font-bold flex items-center justify-center shrink-0">
                      {fase.numero}
                    </div>
                    {editandoFase === fase.numero ? (
                      <input
                        defaultValue={fase.nombre}
                        autoFocus
                        onBlur={(e) => handleEditarNombreFase(fase.numero, e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleEditarNombreFase(fase.numero, e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        className="border border-brand-300 rounded px-2 py-0.5 text-sm font-medium outline-none focus:ring-2 focus:ring-brand-400"
                      />
                    ) : (
                      <span className="font-medium text-slate-700 text-sm">{fase.nombre}</span>
                    )}
                    <span className="text-xs text-slate-400 ml-1">({tareasFase.length})</span>
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setEditandoFase(editandoFase === fase.numero ? null : fase.numero) }}
                    className="p-1 text-slate-300 hover:text-slate-600 rounded transition-colors"
                    title="Renombrar fase"
                  >
                    <Pencil size={12} />
                  </button>
                  {abierta ? <ChevronUp size={15} className="text-slate-400 shrink-0" onClick={() => toggleFase(fase.numero)} /> : <ChevronDown size={15} className="text-slate-400 shrink-0" onClick={() => toggleFase(fase.numero)} />}
                </div>

                {/* Tareas de la fase */}
                {abierta && (
                  <>
                    {tareasFase.length === 0 && (
                      <div className="px-5 py-4 text-sm text-slate-400 italic">Sin actividades — agrega la primera abajo.</div>
                    )}
                    {tareasFase.map((t, idx) => (
                      <TareaFilaPlantilla
                        key={t.id}
                        tarea={t}
                        idx={idx}
                        total={tareasFase.length}
                        onEditar={() => setModalTarea({ modo: 'editar', faseNum: fase.numero, tarea: t })}
                        onEliminar={() => handleEliminarTarea(t.id)}
                        onMover={(dir) => handleMover(t.id, dir)}
                      />
                    ))}
                    {/* Agregar tarea */}
                    <div className="px-5 py-2.5 border-t border-slate-50">
                      <button
                        onClick={() => setModalTarea({ modo: 'nueva', faseNum: fase.numero })}
                        className="flex items-center gap-1.5 text-xs text-brand-700 hover:text-brand-800 transition-colors"
                      >
                        <Plus size={13} /> Agregar actividad a Fase {fase.numero}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )
          })}

          {/* Nueva fase */}
          {mostrarNuevaFase ? (
            <form onSubmit={handleAgregarFase} className="bg-brand-50 border border-brand-200 rounded-xl px-5 py-4 flex items-center gap-3">
              <input
                value={nuevaFaseNombre}
                onChange={(e) => setNuevaFaseNombre(e.target.value)}
                placeholder="Nombre de la nueva fase..."
                className={inputCls + ' flex-1'}
                autoFocus
              />
              <button type="submit" disabled={!nuevaFaseNombre.trim()} className="bg-brand-500 hover:bg-brand-600 disabled:opacity-40 text-slate-900 text-sm px-4 py-2 rounded-lg transition-colors">
                Agregar
              </button>
              <button type="button" onClick={() => { setMostrarNuevaFase(false); setNuevaFaseNombre('') }} className="text-slate-400 hover:text-slate-700">
                <X size={16} />
              </button>
            </form>
          ) : (
            <button
              onClick={() => setMostrarNuevaFase(true)}
              className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-700 transition-colors px-1"
            >
              <Plus size={15} /> Agregar fase
            </button>
          )}
        </div>
      </div>

      {/* Modal tarea */}
      {modalTarea && (
        <ModalTareaPlantilla
          modo={modalTarea.modo}
          faseNum={modalTarea.faseNum}
          tarea={modalTarea.tarea}
          onGuardar={handleGuardarTarea}
          onCerrar={() => setModalTarea(null)}
        />
      )}
    </Layout>
  )
}

function TareaFilaPlantilla({ tarea: t, idx, total, onEditar, onEliminar, onMover }) {
  const [confirmarEliminar, setConfirmarEliminar] = useState(false)

  return (
    <div className="px-5 py-3.5 border-b border-slate-50 last:border-0 flex items-start gap-3 group hover:bg-slate-50 transition-colors">
      {/* Orden */}
      <div className="flex flex-col gap-0.5 shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={() => onMover('arriba')} disabled={idx === 0} className="text-slate-300 hover:text-slate-600 disabled:opacity-20">
          <MoveUp size={12} />
        </button>
        <button onClick={() => onMover('abajo')} disabled={idx === total - 1} className="text-slate-300 hover:text-slate-600 disabled:opacity-20">
          <MoveDown size={12} />
        </button>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-slate-800">{t.titulo}</span>
          {t.esCliente && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Cliente</span>}
          {t.esRutaCritica && <span className="text-xs bg-brand-100 text-brand-800 px-2 py-0.5 rounded-full">Ruta crítica</span>}
          {t.soloKarlaOAdmin && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Solo Karla/Admin</span>}
          {t.opcional && <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">Opcional</span>}
        </div>
        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
          <span className="text-xs text-slate-400">Responsable: {RESPONSABLES.find((r) => r.valor === t.responsable)?.label || t.responsable}</span>
          {t.condicion && (
            <span className="text-xs text-amber-600 flex items-center gap-1">
              <AlertCircle size={10} />
              Condición: {CONDICION_LABELS[t.condicion] || t.condicion}
            </span>
          )}
        </div>
      </div>

      {confirmarEliminar ? (
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={onEliminar} className="text-xs bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded-lg">Eliminar</button>
          <button onClick={() => setConfirmarEliminar(false)} className="text-xs text-slate-400 px-1">No</button>
        </div>
      ) : (
        <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={onEditar} className="p-1.5 text-slate-400 hover:text-brand-700 hover:bg-brand-50 rounded-lg transition-colors">
            <Pencil size={13} />
          </button>
          <button onClick={() => setConfirmarEliminar(true)} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
            <Trash2 size={13} />
          </button>
        </div>
      )}
    </div>
  )
}

function ModalTareaPlantilla({ modo, faseNum, tarea, onGuardar, onCerrar }) {
  const [form, setForm] = useState({
    titulo: tarea?.titulo || '',
    descripcion: tarea?.esCliente ? '' : (tarea?.descripcion || ''),
    queHacer: tarea?.queHacer || '',
    necesitasAntes: tarea?.necesitasAntes || '',
    plantillaMensaje: tarea?.plantillaMensaje || '',
    queEntregas: tarea?.queEntregas || '',
    instruccionesCliente: tarea?.esCliente ? (tarea?.instruccionesCliente || '') : '',
    responsable: tarea?.responsable || 'equipo',
    esCliente: tarea?.esCliente || false,
    esRutaCritica: tarea?.esRutaCritica || false,
    soloAdmin: tarea?.soloAdmin || false,
    soloKarlaOAdmin: tarea?.soloKarlaOAdmin || false,
    opcional: tarea?.opcional || false,
    plazoHoras: tarea?.plazoHoras || '',
    condicion: tarea?.condicion || '',
  })

  function handleSubmit(e) {
    e.preventDefault()
    if (!form.titulo.trim()) return
    onGuardar({
      ...form,
      responsable: form.esCliente ? 'cliente' : form.responsable,
      plazoHoras: form.plazoHoras ? Number(form.plazoHoras) : null,
      condicion: form.condicion || null,
      queHacer: form.esCliente ? '' : form.queHacer,
      necesitasAntes: form.esCliente ? '' : form.necesitasAntes,
      plantillaMensaje: form.esCliente ? '' : form.plantillaMensaje,
      queEntregas: form.esCliente ? '' : form.queEntregas,
    })
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onCerrar}>
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 sticky top-0 bg-white">
          <h3 className="font-semibold text-slate-800">
            {modo === 'nueva' ? `Nueva actividad — Fase ${faseNum}` : 'Editar actividad'}
          </h3>
          <button onClick={onCerrar} className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className={labelCls}>Título *</label>
            <input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} className={inputCls} autoFocus />
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={form.esCliente} onChange={(e) => setForm({ ...form, esCliente: e.target.checked, responsable: e.target.checked ? 'cliente' : 'equipo' })} className="accent-brand-500 w-4 h-4" />
            <span className="font-medium">Es una actividad del cliente</span>
          </label>

          {!form.esCliente && (
            <>
              <div>
                <label className={labelCls}>Responsable</label>
                <select value={form.responsable} onChange={(e) => setForm({ ...form, responsable: e.target.value })} className={inputCls}>
                  {RESPONSABLES.filter((r) => r.valor !== 'cliente').map((r) => (
                    <option key={r.valor} value={r.valor}>{r.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Descripción breve</label>
                <textarea value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} className={inputCls + ' resize-none'} rows={2} placeholder="Resumen en una línea..." />
              </div>
              <div>
                <label className={labelCls}>¿Qué hay que hacer? (instrucciones detalladas)</label>
                <textarea value={form.queHacer} onChange={(e) => setForm({ ...form, queHacer: e.target.value })} className={inputCls + ' resize-none'} rows={5} placeholder="Paso a paso de cómo ejecutar esta tarea..." />
              </div>
              <div>
                <label className={labelCls}>Antes de empezar (requisitos)</label>
                <textarea value={form.necesitasAntes} onChange={(e) => setForm({ ...form, necesitasAntes: e.target.value })} className={inputCls + ' resize-none'} rows={2} placeholder="Qué debe estar listo antes de ejecutar esta tarea..." />
              </div>
              <div>
                <label className={labelCls}>Plantilla de mensaje (WhatsApp / correo)</label>
                <textarea value={form.plantillaMensaje} onChange={(e) => setForm({ ...form, plantillaMensaje: e.target.value })} className={inputCls + ' resize-none font-mono text-xs'} rows={5} placeholder="Texto listo para copiar y enviar al cliente..." />
              </div>
              <div>
                <label className={labelCls}>Al completar esta tarea entrego</label>
                <textarea value={form.queEntregas} onChange={(e) => setForm({ ...form, queEntregas: e.target.value })} className={inputCls + ' resize-none'} rows={2} placeholder="Qué se entrega o queda listo al marcar como completada..." />
              </div>
            </>
          )}

          {form.esCliente && (
            <>
              <div>
                <label className={labelCls}>Instrucciones para el cliente</label>
                <textarea value={form.instruccionesCliente} onChange={(e) => setForm({ ...form, instruccionesCliente: e.target.value })} className={inputCls + ' resize-none'} rows={4} placeholder="Texto que verá el cliente en su portal..." />
              </div>
              <div>
                <label className={labelCls}>Plazo sugerido (horas)</label>
                <input type="number" value={form.plazoHoras} onChange={(e) => setForm({ ...form, plazoHoras: e.target.value })} className={inputCls} placeholder="48" min="1" />
              </div>
            </>
          )}

          {/* Condición */}
          <div>
            <label className={labelCls}>Condición para incluirse (opcional)</label>
            <select value={form.condicion} onChange={(e) => setForm({ ...form, condicion: e.target.value })} className={inputCls}>
              <option value="">Siempre incluida</option>
              {Object.entries(CONDICION_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
            <p className="text-xs text-slate-400 mt-1">Si eliges una condición, esta actividad solo se agrega al proyecto cuando esa condición esté activa.</p>
          </div>

          {/* Flags */}
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.esRutaCritica} onChange={(e) => setForm({ ...form, esRutaCritica: e.target.checked })} className="accent-brand-500" />
              Ruta crítica
            </label>
            {!form.esCliente && (
              <>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={form.soloKarlaOAdmin} onChange={(e) => setForm({ ...form, soloKarlaOAdmin: e.target.checked })} className="accent-brand-500" />
                  Solo Karla / Admin
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={form.soloAdmin} onChange={(e) => setForm({ ...form, soloAdmin: e.target.checked })} className="accent-brand-500" />
                  Solo Admin
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={form.opcional} onChange={(e) => setForm({ ...form, opcional: e.target.checked })} className="accent-brand-500" />
                  Opcional
                </label>
              </>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={!form.titulo.trim()} className="flex-1 bg-brand-500 hover:bg-brand-600 disabled:opacity-40 text-slate-900 py-2.5 rounded-lg text-sm font-semibold transition-colors">
              {modo === 'nueva' ? 'Agregar actividad' : 'Guardar cambios'}
            </button>
            <button type="button" onClick={onCerrar} className="px-5 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg text-sm transition-colors">
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

const inputCls = 'w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent placeholder:text-slate-400'
const labelCls = 'block text-sm font-medium text-slate-700 mb-1.5'
