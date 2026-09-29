// Medidor circular de progreso — el % se lee de un vistazo y el color del
// arco hereda la salud del proyecto (verde completo, rojo atrasado, ámbar
// estancado, brand en curso). El % al centro es autocontenido: no depende
// de textos alrededor para entenderse.
const COLORES = {
  completo: { arco: '#10b981', texto: 'text-emerald-600 dark:text-emerald-400' },
  atrasado: { arco: '#f43f5e', texto: 'text-rose-600 dark:text-rose-400' },
  estancado: { arco: '#f59e0b', texto: 'text-amber-600 dark:text-amber-400' },
  avanza: { arco: '#facc15', texto: 'text-brand-700 dark:text-brand-400' },
}

export default function MedidorCircular({ porcentaje, tamano = 44, grosor = 4, nivel }) {
  const p = Math.max(0, Math.min(100, Math.round(porcentaje) || 0))
  const r = (tamano - grosor) / 2
  const circunferencia = 2 * Math.PI * r
  const color = COLORES[nivel] || COLORES.avanza
  // En tema claro brand-500 es muy claro contra blanco; uso el mismo ámbar
  // de la marca pero un pelo más oscuro vía el propio trazo SVG.
  const arco = nivel === 'avanza' || !nivel ? '#eab308' : color.arco
  const radio = r - 1

  return (
    <div className="relative shrink-0" style={{ width: tamano, height: tamano }} title={`${p}% completado`}>
      <svg width={tamano} height={tamano} className="-rotate-90">
        <circle
          cx={tamano / 2} cy={tamano / 2} r={radio}
          fill="none" strokeWidth={grosor}
          className="stroke-slate-100 dark:stroke-ink-700"
        />
        {p > 0 && (
          <circle
            cx={tamano / 2} cy={tamano / 2} r={radio}
            fill="none" strokeWidth={grosor} strokeLinecap="round"
            stroke={arco}
            strokeDasharray={`${(circunferencia * p) / 100} ${circunferencia}`}
          />
        )}
      </svg>
      <div className={`absolute inset-0 flex items-center justify-center font-bold tabular-nums ${color.texto}`} style={{ fontSize: Math.max(9, tamano * 0.24) }}>
        {p}%
      </div>
    </div>
  )
}
