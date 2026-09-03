import { useState } from 'react'
import { KANBAN_COLUMNAS } from '../data/kanban'
import { formatFechaHora } from '../data/storage'
import { AlertCircle, CheckCircle2, XCircle, Clock, X, Paperclip } from 'lucide-react'

const RESPONSABLES = [
  { valor: 'equipo', label: 'Equipo (cualquiera)' },
  { valor: 'copy', label: 'Copy' },
  { valor: 'disenador', label: 'Diseñador' },
  { valor: 'programador', label: 'Programador' },
  { valor: 'karla', label: 'Karla (QA)' },
  { valor: 'admin', label: 'Admin' },
]

const inputCls = 'w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent placeholder:text-slate-400'

/**
 * Lista de solicitudes de cambio levantadas por el cliente. Se usa tanto en
 * DetalleProyecto, usado tanto por admin como por equipo — ambos pueden aprobar
 * (crea una Tarea real) o rechazar (con motivo).
 */
export default function PanelSolicitudes({ solicitudes, esContinuo, fases, miembrosProyecto = [], onAprobar, onRechazar }) {
  const [modalAprobar, setModalAprobar] = useState(null)
  const [modalRechazar, setModalRechazar] = useState(null)

  const pendientes = solicitudes.filter((s) => s.estado === 'pendiente')
  const resueltas = solicitudes.filter((s) => s.estado !== 'pendiente')

  if (solicitudes.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-6 text-center text-sm text-slate-400">
        El cliente aún no ha enviado ninguna solicitud de cambio.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {pendientes.map((s) => (
        <div key={s.id} className="bg-white border-2 border-amber-300 rounded-xl overflow-hidden shadow-sm">
          <div className="bg-amber-50 px-5 py-3 flex items-center gap-2">
            <AlertCircle size={16} className="text-amber-500 shrink-0" />
            <span className="font-semibold text-amber-800 text-sm">{s.titulo}</span>
            <span className="ml-auto text-xs text-amber-600">{formatFechaHora(s.creadaEn)}</span>
          </div>
          <div className="px-5 py-4">
            {s.descripcion && <p className="text-sm text-slate-700 leading-relaxed mb-4 whitespace-pre-wrap">{s.descripcion}</p>}
            {s.archivoUrl && (
              <a
                href={s.archivoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-sm text-brand-700 hover:text-brand-800 mb-4 w-fit"
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
                className="flex-1 border border-slate-200 text-slate-600 hover:bg-slate-50 py-2 rounded-lg text-sm transition-colors"
              >
                Rechazar
              </button>
            </div>
          </div>
        </div>
      ))}

      {resueltas.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-50">
          {resueltas.map((s) => (
            <div key={s.id} className="px-5 py-3.5">
              <div className="flex items-center gap-2">
                {s.estado === 'aprobada' ? (
                  <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                ) : (
                  <XCircle size={14} className="text-red-400 shrink-0" />
                )}
                <span className="text-sm font-medium text-slate-700">{s.titulo}</span>
                <span className={`ml-auto text-xs px-2 py-0.5 rounded-full ${s.estado === 'aprobada' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                  {s.estado === 'aprobada' ? 'Aprobada' : 'Rechazada'}
                </span>
              </div>
              {s.descripcion && <p className="text-sm text-slate-500 mt-1.5 ml-6 whitespace-pre-wrap">{s.descripcion}</p>}
              {s.archivoUrl && (
                <a
                  href={s.archivoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-sm text-brand-700 hover:text-brand-800 mt-1.5 ml-6 w-fit"
                >
                  <Paperclip size={12} className="shrink-0" />
                  {s.archivoNombre || 'Ver archivo adjunto'}
                </a>
              )}
              {s.estado === 'rechazada' && s.motivoRechazo && (
                <p className="text-sm text-red-600 mt-1.5 ml-6"><strong>Motivo:</strong> {s.motivoRechazo}</p>
              )}
              <p className="text-xs text-slate-400 mt-1.5 ml-6 flex items-center gap-1"><Clock size={11} /> Resuelta por {s.resueltaPor} — {formatFechaHora(s.resueltaEn)}</p>
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
    </div>
  )
}

function ModalAprobarSolicitud({ solicitud, esContinuo, fases, miembrosProyecto, onGuardar, onCerrar }) {
  const [form, setForm] = useState({
    fase: fases?.[0]?.numero || 1,
    columna: 'todo',
    responsable: 'equipo',
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
      })
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onCerrar}>
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h3 className="font-semibold text-slate-800">Aprobar solicitud</h3>
          <button onClick={onCerrar} className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="bg-slate-50 rounded-lg px-3 py-2.5">
            <p className="text-sm font-medium text-slate-800">{solicitud.titulo}</p>
            {solicitud.descripcion && <p className="text-sm text-slate-500 mt-1 whitespace-pre-wrap">{solicitud.descripcion}</p>}
          </div>
          <p className="text-sm text-slate-500">Se creará como una tarea del proyecto. Define dónde entra y quién la atiende:</p>

          {esContinuo ? (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Columna</label>
              <select value={form.columna} onChange={(e) => setForm({ ...form, columna: e.target.value })} className={inputCls}>
                {KANBAN_COLUMNAS.map((c) => <option key={c.columna} value={c.columna}>{c.label}</option>)}
              </select>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Fase</label>
              <select value={form.fase} onChange={(e) => setForm({ ...form, fase: e.target.value })} className={inputCls}>
                {(fases || []).map((f) => <option key={f.numero} value={f.numero}>Fase {f.numero} — {f.nombre}</option>)}
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Responsable</label>
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

          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={enviando} className="flex-1 bg-brand-500 hover:bg-brand-600 disabled:opacity-60 text-slate-900 py-2.5 rounded-lg text-sm font-semibold transition-colors">
              Aprobar y crear tarea
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
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h3 className="font-semibold text-slate-800">Rechazar solicitud</h3>
          <button onClick={onCerrar} className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="bg-slate-50 rounded-lg px-3 py-2.5">
            <p className="text-sm font-medium text-slate-800">{solicitud.titulo}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Motivo del rechazo *</label>
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
            <button type="button" onClick={onCerrar} className="px-5 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg text-sm transition-colors">
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
