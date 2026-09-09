import { useEffect, useState } from 'react'
import { Copy, Check, KeyRound, Trash2 } from 'lucide-react'
import { listarMisApiKeys, crearApiKey, revocarApiKey } from '../data/api'

export default function ApiKeysManager() {
  const [keys, setKeys] = useState(null)
  const [nombre, setNombre] = useState('')
  const [creando, setCreando] = useState(false)
  const [nuevaKey, setNuevaKey] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    cargar()
  }, [])

  async function cargar() {
    try {
      setKeys(await listarMisApiKeys())
    } catch {
      setError('No se pudieron cargar tus API keys')
    }
  }

  async function generar() {
    setCreando(true)
    setError('')
    try {
      const creada = await crearApiKey(nombre)
      setNuevaKey(creada)
      setNombre('')
      cargar()
    } catch {
      setError('No se pudo generar la key')
    } finally {
      setCreando(false)
    }
  }

  async function revocar(id) {
    if (!confirm('¿Revocar esta API key? Cualquier conexión que la esté usando dejará de funcionar.')) return
    try {
      await revocarApiKey(id)
      cargar()
    } catch {
      setError('No se pudo revocar la key')
    }
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-slate-800">Tus API keys</h3>
        <p className="text-xs text-slate-500 mt-1 leading-relaxed">
          Cada key es tuya y tus acciones por CLI quedan a tu nombre, respetando lo que tienes asignado — igual
          que si entraras al panel. Al generarla se muestra completa una sola vez; si la pierdes, revócala y
          genera otra.
        </p>
      </div>

      {nuevaKey && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3.5 space-y-2">
          <p className="text-xs font-medium text-emerald-800">Cópiala ahora — no podrás volver a verla completa.</p>
          <CopyBlock value={nuevaKey.token} />
          <button onClick={() => setNuevaKey(null)} className="text-xs font-medium text-emerald-700 hover:text-emerald-900">
            Ya la copié
          </button>
        </div>
      )}

      {!nuevaKey && (
        <div className="flex items-center gap-2">
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Nombre opcional (ej. laptop trabajo)"
            className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-300"
          />
          <button
            onClick={generar}
            disabled={creando}
            className="flex items-center gap-1.5 text-sm font-medium bg-brand-500 text-slate-900 px-3 py-1.5 rounded-lg hover:bg-brand-400 transition-colors disabled:opacity-50 shrink-0"
          >
            <KeyRound size={14} /> Generar nueva key
          </button>
        </div>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}

      {keys?.length > 0 && (
        <div className="divide-y divide-slate-100 border-t border-slate-100 pt-1">
          {keys.map((k) => (
            <div key={k.id} className={`py-2.5 flex items-center justify-between gap-3 ${k.revocadaEn ? 'opacity-50' : ''}`}>
              <div className="min-w-0">
                <p className="text-sm text-slate-700 truncate">
                  {k.nombre || 'Sin nombre'} <code className="text-xs text-slate-400 font-mono">{k.prefijo}••••</code>
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  Creada {formatearFecha(k.creadaEn)}
                  {' · '}
                  {k.revocadaEn
                    ? `Revocada ${formatearFecha(k.revocadaEn)}`
                    : k.ultimoUso
                      ? `Último uso ${formatearFecha(k.ultimoUso)}`
                      : 'Nunca usada'}
                </p>
              </div>
              {!k.revocadaEn && (
                <button
                  onClick={() => revocar(k.id)}
                  className="text-xs font-medium text-red-600 hover:text-red-800 flex items-center gap-1 shrink-0"
                >
                  <Trash2 size={12} /> Revocar
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {keys?.length === 0 && <p className="text-xs text-slate-400">Todavía no tienes ninguna API key.</p>}
    </div>
  )
}

function formatearFecha(fecha) {
  return new Date(fecha).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })
}

function CopyBlock({ value }) {
  const [copiado, setCopiado] = useState(false)

  function copiar() {
    navigator.clipboard.writeText(value)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  return (
    <div className="relative">
      <pre className="text-xs text-slate-700 bg-white border border-emerald-200 rounded-lg p-3 pr-10 font-mono overflow-x-auto whitespace-nowrap">
        {value}
      </pre>
      <button
        onClick={copiar}
        className="absolute top-2 right-2 p-1.5 rounded-md bg-white border border-slate-200 hover:border-brand-300 text-slate-500 hover:text-brand-700 transition-colors"
        title="Copiar"
      >
        {copiado ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
      </button>
    </div>
  )
}
