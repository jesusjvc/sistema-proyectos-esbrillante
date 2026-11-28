import { useEffect, useRef, useState } from 'react'
import { Building2, ChevronDown, Search, UserPlus, X } from 'lucide-react'
import { buscarClientesCrm, registrarClienteCrm, vincularClienteCrm } from '../data/api'
import { normalizarTexto } from '../lib/texto'

const inputCls = 'w-full h-11 md:h-10 border border-slate-200 dark:border-ink-500 rounded-lg px-3 text-sm text-slate-800 dark:text-ink-100 bg-white dark:bg-ink-900 outline-none focus:ring-2 focus:ring-brand-400/60 focus:border-brand-400'

// Buscador unificado de clientes: mientras escribes filtra los de Foco y,
// en paralelo (debounce 350 ms), consulta el CRM. En un solo dropdown:
// clientes locales, sugerencias del CRM listas para importar y — si no hay
// nada — el registro directo en el CRM. El CRM es la fuente obligatoria.
export default function BuscadorCliente({ clientes, value, onSelect, onImportado }) {
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
  const q = query.trim()
  const nq = normalizarTexto(q)
  const digitos = q.replace(/\D/g, '')

  const locales = !nq ? clientes : clientes.filter((cliente) =>
    normalizarTexto(cliente.nombreComercial).includes(nq)
    || normalizarTexto(cliente.correo).includes(nq)
    || normalizarTexto(cliente.whatsapp).includes(nq)
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
