export default function SelectorDependencias({ opciones, seleccionadas, onChange }) {
  if (opciones.length === 0) return null

  function toggle(id) {
    onChange(seleccionadas.includes(id) ? seleccionadas.filter((d) => d !== id) : [...seleccionadas, id])
  }

  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 dark:text-ink-300 mb-1.5">
        Depende de <span className="font-normal text-slate-400 dark:text-ink-400">(no queda disponible hasta que se completen)</span>
      </label>
      <div className="border border-slate-200 dark:border-ink-500 rounded-lg max-h-40 overflow-y-auto divide-y divide-slate-50 dark:divide-ink-500">
        {opciones.map((t) => (
          <label key={t.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-slate-50 dark:hover:bg-ink-600">
            <input type="checkbox" checked={seleccionadas.includes(t.id)} onChange={() => toggle(t.id)} className="accent-brand-500 shrink-0" />
            <span className="truncate text-slate-700 dark:text-ink-300">{t.titulo}</span>
            {t.esCliente && <span className="ml-auto text-[10px] shrink-0 bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded-full">Cliente</span>}
          </label>
        ))}
      </div>
    </div>
  )
}
