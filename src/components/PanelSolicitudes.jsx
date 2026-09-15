import { useState } from 'react'
import { KANBAN_COLUMNAS } from '../data/kanban'
import { formatFechaHora } from '../data/storage'
import { AlertCircle, CheckCircle2, XCircle, Clock, X, Paperclip } from 'lucide-react'

const RESPONSABLES = [
  { valor: 'equipo', label: 'Equipo (cualquiera)' },
  { valor: 'copy', label: 'Copy' },
  { valor: 'disenador', label: 'Diseñador' },
  { valor: 'programador', label: 'Programador' },
  { valor: 'redes', label: 'Redes' },
  { valor: 'karla', label: 'Karla (QA)' },
  { valor: 'admin', label: 'Admin' },
]

const ORIGEN_LABEL = {
  whatsapp: 'WhatsApp',
  telefono: 'Teléfono',
  interno: 'Detectado por el equipo',
}

const inputCls = 'w-full border border-slate-200 dark:border-ink-500 rounded-lg px-3 py-2.5 text-sm text-slate-800 dark:text-ink-100 bg-white dark:bg-ink-900 outline-none focus:ring-2 focus:ring-brand-400 dark:focus:ring-brand-500/40 focus:border-transparent placeholder:text-slate-400 dark:placeholder:text-ink-400'

/**
 * Lista de solicitudes de cambio levantadas por el cliente. Se usa tanto en
 * DetalleProyecto, usado tanto por admin como por equipo — ambos pueden aprobar
 * (crea una Tarea real) o rechazar (con motivo).
 */
export default function PanelSolicitudes({ solicitudes, esContinuo, fases, miembrosProyecto = [], onAprobar, onRechazar, onCrearTicket }) {
  const [modalAprobar, setModalAprobar] = useState(null)
  const [modalRechazar, setModalRechazar] = useState(null)
  const [modalNuevoTicket, setModalNuevoTicket] = useState(false)

  const pendientes = solicitudes.filter((s) => s.estado === 'pendiente')
  const resueltas = solicitudes.filter((s) => s.estado !== 'pendiente')

  return (
    <div className="space-y-3">
      {onCrearTicket && (
        <button
          onClick={() => setModalNuevoTicket(true)}
          className="w-full border-2 border-dashed border-slate-200 dark:border-ink-500 hover:border-brand-300 dark:hover:border-brand-500/50 text-slate-500 dark:text-ink-300 hover:text-brand-700 dark:hover:text-brand-400 rounded-xl py-3 text-sm font-medium transition-colors"
        >
          + Registrar ticket (llegó por WhatsApp, teléfono, o lo detectó el equipo)
        </button>
      )}

      {solicitudes.length === 0 && (
        <div className="bg-white dark:bg-ink-800 rounded-xl border border-slate-200 dark:border-ink-500 p-6 text-center text-sm text-slate-400 dark:text-ink-400">
          Ninguna solicitud todavía — ni del cliente ni registrada por el equipo.
        </div>
      )}

      {pendientes.map((s) => (
        <div key={s.id} className="bg-white dark:bg-ink-800 border-2 border-amber-300 dark:border-amber-500/40 rounded-xl overflow-hidden shadow-sm">
          <div className="bg-amber-50 dark:bg-amber-500/10 px-5 py-3 flex items-center gap-2">
            <AlertCircle size={16} className="text-amber-500 dark:text-amber-400 shrink-0" />
            <span className="font-semibold text-amber-800 dark:text-amber-300 text-sm">{s.titulo}</span>
            {s.origen && s.origen !== 'portal' && <span className="text-[10px] uppercase font-medium px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300">{ORIGEN_LABEL[s.origen] || s.origen}</span>}
            <span className="ml-auto text-xs text-amber-600 dark:text-amber-400">{formatFechaHora(s.creadaEn)}</span>
          </div>
          <div className="px-5 py-4">
            {s.descripcion && <p className="text-sm text-slate-700 dark:text-ink-300 leading-relaxed mb-4 whitespace-pre-wrap">{s.descripcion}</p>}
            {s.archivoUrl && (
              <a
                href={s.archivoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-sm text-brand-700 dark:text-brand-400 hover:text-brand-800 dark:hover:text-brand-300 mb-4 w-fit"
              >
                <Paperclip size={12} className="shrink-0" />
                {s.archivoNombre || 'Ver archivo adjunto'}
              </a>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => setModalAprobar(s)}
                className="flex-1 bg-brand-500 hover:bg-brand-600 text-slate-900 py-2 rounded-lg text-sm font-semibold transition-colors"
              >
                Aprobar
              </button>
              <button
                onClick={() => setModalRechazar(s)}
                className="flex-1 border border-slate-200 dark:border-ink-500 text-slate-600 dark:text-ink-300 hover:bg-slate-50 dark:hover:bg-ink-600 py-2 rounded-lg text-sm transition-colors"
              >
                Rechazar
              </button>
            </div>
          </div>
        </div>
      ))}

      {resueltas.length > 0 && (
        <div className="bg-white dark:bg-ink-800 rounded-xl border border-slate-200 dark:border-ink-500 divide-y divide-slate-50 dark:divide-ink-500">
          {resueltas.map((s) => (
            <div key={s.id} className="px-5 py-3.5">
              <div className="flex items-center gap-2">
                {s.estado === 'aprobada' ? (
                  <CheckCircle2 size={14} className="text-emerald-500 dark:text-emerald-400 shrink-0" />
                ) : (
                  <XCircle size={14} className="text-red-400 dark:text-red-500 shrink-0" />
                )}
                <span className="text-sm font-medium text-slate-700 dark:text-ink-300">{s.titulo}</span>
                {s.origen && s.origen !== 'portal' && <span className="text-[10px] uppercase font-medium px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-ink-700 text-slate-500 dark:text-ink-300">{ORIGEN_LABEL[s.origen] || s.origen}</span>}
                <span className={`ml-auto text-xs px-2 py-0.5 rounded-full ${s.estado === 'aprobada' ? 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-red-50 dark:bg-red-500/15 text-red-600 dark:text-red-300'}`}>
                  {s.estado === 'aprobada' ? 'Aprobada' : 'Rechazada'}
                </span>
              </div>
              {s.descripcion && <p className="text-sm text-slate-500 dark:text-ink-300 mt-1.5 ml-6 whitespace-pre-wrap">{s.descripcion}</p>}
              {s.archivoUrl && (
                <a
                  href={s.archivoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-sm text-brand-700 dark:text-brand-400 hover:text-brand-800 dark:hover:text-brand-300 mt-1.5 ml-6 w-fit"
                >
                  <Paperclip size={12} className="shrink-0" />
                  {s.archivoNombre || 'Ver archivo adjunto'}
                </a>
              )}
              {s.estado === 'rechazada' && s.motivoRechazo && (
                <p className="text-sm text-red-600 dark:text-red-400 mt-1.5 ml-6"><strong>Motivo:</strong> {s.motivoRechazo}</p>
              )}
              <p className="text-xs text-slate-400 dark:text-ink-400 mt-1.5 ml-6 flex items-center gap-1"><Clock size={11} /> Resuelta por {s.resueltaPor} — {formatFechaHora(s.resueltaEn)}</p>
            </div>
          ))}
        </div>
      )}

      {modalAprobar && (
        <ModalAprobarSolicitud
          solicitud={modalAprobar}
          esContinuo={esContinuo}
          fases={fases}
          miembrosProyecto={miembrosProyecto}
          onGuardar={async (datos) => { await onAprobar(modalAprobar.id, datos); setModalAprobar(null) }}
          onCerrar={() => setModalAprobar(null)}
        />
      )}

      {modalRechazar && (
        <ModalRechazarSolicitud
          solicitud={modalRechazar}
          onGuardar={async (motivo) => { await onRechazar(modalRechazar.id, motivo); setModalRechazar(null) }}
          onCerrar={() => setModalRechazar(null)}
        />
      )}

      {modalNuevoTicket && (
        <ModalNuevoTicket
          esContinuo={esContinuo}
          fases={fases}
          miembrosProyecto={miembrosProyecto}
          onGuardar={async (datos) => { await onCrearTicket(datos); setModalNuevoTicket(false) }}
          onCerrar={() => setModalNuevoTicket(false)}
        />
      )}
    </div>
  )
}

function ModalAprobarSolicitud({ solicitud, esContinuo, fases, miembrosProyecto, onGuardar, onCerrar }) {
  const [form, setForm] = useState({
    fase: fases?.[0]?.numero || 1,
    columna: 'todo',
    responsable: 'equipo',
    prioridad: '',
    fechaLimite: '',
  })
  const [enviando, setEnviando] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setEnviando(true)
    try {
      await onGuardar({
        fase: esContinuo ? undefined : Number(form.fase),
        columna: esContinuo ? form.columna : undefined,
        responsable: form.responsable,
        prioridad: form.prioridad || null,
        fechaLimite: form.fechaLimite || null,
      })
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onCerrar}>
      <div className="bg-white dark:bg-ink-700 rounded-2xl w-full max-w-lg shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-ink-500">
          <h3 className="font-semibold text-slate-800 dark:text-ink-100">Aprobar solicitud</h3>
          <button onClick={onCerrar} className="text-slate-400 dark:text-ink-400 hover:text-slate-700 dark:hover:text-ink-300"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="bg-slate-50 dark:bg-ink-900 rounded-lg px-3 py-2.5">
            <p className="text-sm font-medium text-slate-800 dark:text-ink-100">{solicitud.titulo}</p>
            {solicitud.descripcion && <p className="text-sm text-slate-500 dark:text-ink-300 mt-1 whitespace-pre-wrap">{solicitud.descripcion}</p>}
          </div>
          <p className="text-sm text-slate-500 dark:text-ink-300">Se creará como una tarea del proyecto. Define dónde entra y quién la atiende:</p>

          {esContinuo ? (
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-ink-300 mb-1.5">Columna</label>
              <select value={form.columna} onChange={(e) => setForm({ ...form, columna: e.target.value })} className={inputCls}>
                {KANBAN_COLUMNAS.map((c) => <option key={c.columna} value={c.columna}>{c.label}</option>)}
              </select>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-ink-300 mb-1.5">Fase</label>
              <select value={form.fase} onChange={(e) => setForm({ ...form, fase: e.target.value })} className={inputCls}>
                {(fases || []).map((f) => <option key={f.numero} value={f.numero}>Fase {f.numero} — {f.nombre}</option>)}
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-ink-300 mb-1.5">Responsable</label>
            <select value={form.responsable} onChange={(e) => setForm({ ...form, responsable: e.target.value })} className={inputCls}>
              <optgroup label="Rol">
                {RESPONSABLES.map((r) => <option key={r.valor} value={r.valor}>{r.label}</option>)}
              </optgroup>
              {miembrosProyecto.length > 0 && (
                <optgroup label="Persona específica">
                  {miembrosProyecto.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                </optgroup>
              )}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-ink-300 mb-1.5">Prioridad</label>
              <select value={form.prioridad} onChange={(e) => setForm({ ...form, prioridad: e.target.value })} className={inputCls}>
                <option value="">Normal</option>
                <option value="urgente">Urgente</option>
                <option value="cuando_se_pueda">Cuando se pueda</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-ink-300 mb-1.5">Fecha límite (equipo)</label>
              <input type="date" value={form.fechaLimite} onChange={(e) => setForm({ ...form, fechaLimite: e.target.value })} className={inputCls} />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={enviando} className="flex-1 bg-brand-500 hover:bg-brand-600 disabled:opacity-60 text-slate-900 py-2.5 rounded-lg text-sm font-semibold transition-colors">
              Aprobar y crear tarea
            </button>
            <button type="button" onClick={onCerrar} className="px-5 border border-slate-200 dark:border-ink-500 text-slate-600 dark:text-ink-300 hover:bg-slate-50 dark:hover:bg-ink-600 rounded-lg text-sm transition-colors">
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// Registrar un ticket que llegó por fuera del portal (WhatsApp, teléfono, o
// lo detectó el propio equipo) — a diferencia de una solicitud del cliente,
// este se aprueba de una vez, no queda pendiente (plan-foco.md 4.5).
function ModalNuevoTicket({ esContinuo, fases, miembrosProyecto, onGuardar, onCerrar }) {
  const [form, setForm] = useState({
    titulo: '',
    descripcion: '',
    tipo: '',
    cobertura: '',
    origen: 'interno',
    responsable: 'equipo',
    fase: fases?.[0]?.numero || 1,
    columna: 'todo',
    prioridad: '',
    fechaLimite: '',
  })
  const [enviando, setEnviando] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.titulo.trim()) return
    setEnviando(true)
    try {
      await onGuardar({
        titulo: form.titulo.trim(),
        descripcion: form.descripcion,
        tipo: form.tipo || null,
        cobertura: form.cobertura || null,
        origen: form.origen,
        responsable: form.responsable,
        fase: esContinuo ? undefined : Number(form.fase),
        columna: esContinuo ? form.columna : undefined,
        prioridad: form.prioridad || null,
        fechaLimite: form.fechaLimite || null,
      })
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onCerrar}>
      <div className="bg-white dark:bg-ink-700 rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-ink-500">
          <h3 className="font-semibold text-slate-800 dark:text-ink-100">Registrar ticket</h3>
          <button onClick={onCerrar} className="text-slate-400 dark:text-ink-400 hover:text-slate-700 dark:hover:text-ink-300"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-ink-300 mb-1.5">Título *</label>
            <input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} className={inputCls} placeholder="Qué hay que hacer..." autoFocus />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-ink-300 mb-1.5">Detalle</label>
            <textarea value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} className={inputCls + ' resize-none'} rows={3} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-ink-300 mb-1.5">De dónde llegó</label>
              <select value={form.origen} onChange={(e) => setForm({ ...form, origen: e.target.value })} className={inputCls}>
                <option value="interno">Lo detectó el equipo</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="telefono">Teléfono</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-ink-300 mb-1.5">Tipo</label>
              <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })} className={inputCls}>
                <option value="">Sin clasificar</option>
                <option value="falla">Falla</option>
                <option value="actualizacion">Actualización de contenido</option>
                <option value="preventivo">Preventivo</option>
                <option value="consulta">Consulta</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-ink-300 mb-1.5">Cobertura</label>
              <select value={form.cobertura} onChange={(e) => setForm({ ...form, cobertura: e.target.value })} className={inputCls}>
                <option value="">Por valorar</option>
                <option value="incluido">Incluido en lo contratado</option>
                <option value="adicional">Adicional</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-ink-300 mb-1.5">Prioridad</label>
              <select value={form.prioridad} onChange={(e) => setForm({ ...form, prioridad: e.target.value })} className={inputCls}>
                <option value="">Normal</option>
                <option value="urgente">Urgente</option>
                <option value="cuando_se_pueda">Cuando se pueda</option>
              </select>
            </div>
          </div>

          {esContinuo ? (
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-ink-300 mb-1.5">Columna</label>
              <select value={form.columna} onChange={(e) => setForm({ ...form, columna: e.target.value })} className={inputCls}>
                {KANBAN_COLUMNAS.map((c) => <option key={c.columna} value={c.columna}>{c.label}</option>)}
              </select>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-ink-300 mb-1.5">Fase</label>
              <select value={form.fase} onChange={(e) => setForm({ ...form, fase: e.target.value })} className={inputCls}>
                {(fases || []).map((f) => <option key={f.numero} value={f.numero}>Fase {f.numero} — {f.nombre}</option>)}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-ink-300 mb-1.5">Responsable</label>
              <select value={form.responsable} onChange={(e) => setForm({ ...form, responsable: e.target.value })} className={inputCls}>
                <optgroup label="Rol">
                  {RESPONSABLES.map((r) => <option key={r.valor} value={r.valor}>{r.label}</option>)}
                </optgroup>
                {miembrosProyecto.length > 0 && (
                  <optgroup label="Persona específica">
                    {miembrosProyecto.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                  </optgroup>
                )}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-ink-300 mb-1.5">Fecha límite (equipo)</label>
              <input type="date" value={form.fechaLimite} onChange={(e) => setForm({ ...form, fechaLimite: e.target.value })} className={inputCls} />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={!form.titulo.trim() || enviando} className="flex-1 bg-brand-500 hover:bg-brand-600 disabled:opacity-60 text-slate-900 py-2.5 rounded-lg text-sm font-semibold transition-colors">
              Registrar y agregar al tablero
            </button>
            <button type="button" onClick={onCerrar} className="px-5 border border-slate-200 dark:border-ink-500 text-slate-600 dark:text-ink-300 hover:bg-slate-50 dark:hover:bg-ink-600 rounded-lg text-sm transition-colors">
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function ModalRechazarSolicitud({ solicitud, onGuardar, onCerrar }) {
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!motivo.trim()) return
    setEnviando(true)
    try {
      await onGuardar(motivo.trim())
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onCerrar}>
      <div className="bg-white dark:bg-ink-700 rounded-2xl w-full max-w-lg shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-ink-500">
          <h3 className="font-semibold text-slate-800 dark:text-ink-100">Rechazar solicitud</h3>
          <button onClick={onCerrar} className="text-slate-400 dark:text-ink-400 hover:text-slate-700 dark:hover:text-ink-300"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="bg-slate-50 dark:bg-ink-900 rounded-lg px-3 py-2.5">
            <p className="text-sm font-medium text-slate-800 dark:text-ink-100">{solicitud.titulo}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-ink-300 mb-1.5">Motivo del rechazo *</label>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              className={inputCls + ' resize-none'}
              rows={3}
              placeholder="El cliente verá este texto en su portal..."
              autoFocus
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={!motivo.trim() || enviando} className="flex-1 bg-red-500 hover:bg-red-600 disabled:opacity-40 text-white py-2.5 rounded-lg text-sm font-semibold transition-colors">
              Rechazar
            </button>
            <button type="button" onClick={onCerrar} className="px-5 border border-slate-200 dark:border-ink-500 text-slate-600 dark:text-ink-300 hover:bg-slate-50 dark:hover:bg-ink-600 rounded-lg text-sm transition-colors">
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
