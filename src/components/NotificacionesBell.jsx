import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, Check, MessageSquare, AtSign, CheckCircle2, UserPlus, RefreshCw } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useNotificaciones } from '../hooks/useNotificaciones'

const ICONOS = {
  tarea_completada: CheckCircle2,
  tarea_reasignada: UserPlus,
  tarea_comentario: MessageSquare,
  tarea_mencion: AtSign,
  tarea_estado_cambiado: RefreshCw,
}

function tiempoRelativo(fecha) {
  const segundos = Math.floor((Date.now() - new Date(fecha).getTime()) / 1000)
  if (segundos < 60) return 'ahora'
  const minutos = Math.floor(segundos / 60)
  if (minutos < 60) return `hace ${minutos}m`
  const horas = Math.floor(minutos / 60)
  if (horas < 24) return `hace ${horas}h`
  const dias = Math.floor(horas / 24)
  if (dias < 7) return `hace ${dias}d`
  return new Date(fecha).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
}

export default function NotificacionesBell() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { notificaciones, noLeidas, leer, leerTodas } = useNotificaciones(!!user)
  const [abierto, setAbierto] = useState(false)
  const contenedorRef = useRef(null)

  useEffect(() => {
    if (!abierto) return
    function alHacerClickFuera(e) {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target)) setAbierto(false)
    }
    document.addEventListener('mousedown', alHacerClickFuera)
    return () => document.removeEventListener('mousedown', alHacerClickFuera)
  }, [abierto])

  function alHacerClickEnNotificacion(n) {
    leer(n.id)
    setAbierto(false)
    if (n.proyectoSlug) {
      const base = user?.rol === 'admin' ? '/admin/proyecto' : '/equipo/proyecto'
      navigate(`${base}/${n.proyectoSlug}`)
    }
  }

  return (
    <div className="relative" ref={contenedorRef}>
      <button
        onClick={() => setAbierto((v) => !v)}
        className="relative w-9 h-9 rounded-lg flex items-center justify-center text-slate-500 dark:text-ink-300 hover:bg-slate-100 dark:hover:bg-ink-700 transition-colors"
        aria-label="Notificaciones"
      >
        <Bell size={18} />
        {noLeidas > 0 && (
          <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[10px] font-semibold flex items-center justify-center">
            {noLeidas > 99 ? '99+' : noLeidas}
          </span>
        )}
      </button>

      {abierto && (
        <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] bg-white dark:bg-ink-800 border border-slate-200 dark:border-ink-500 rounded-xl shadow-lg z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-ink-600">
            <span className="text-sm font-semibold text-slate-800 dark:text-ink-100">Notificaciones</span>
            {noLeidas > 0 && (
              <button
                onClick={leerTodas}
                className="flex items-center gap-1 text-xs text-brand-700 dark:text-brand-300 hover:underline"
              >
                <Check size={12} /> Marcar todas leídas
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {notificaciones.length === 0 && (
              <div className="px-4 py-8 text-center text-sm text-slate-400 dark:text-ink-400">Sin notificaciones todavía</div>
            )}
            {notificaciones.map((n) => {
              const Icono = ICONOS[n.tipo] || Bell
              return (
                <button
                  key={n.id}
                  onClick={() => alHacerClickEnNotificacion(n)}
                  className={`w-full text-left px-4 py-3 border-b border-slate-50 dark:border-ink-700 last:border-b-0 flex gap-3 hover:bg-slate-50 dark:hover:bg-ink-700 transition-colors ${
                    n.leida ? '' : 'bg-brand-50/60 dark:bg-brand-500/10'
                  }`}
                >
                  <Icono size={16} className="mt-0.5 shrink-0 text-slate-400 dark:text-ink-300" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-slate-700 dark:text-ink-100 leading-snug">{n.mensaje}</div>
                    <div className="text-xs text-slate-400 dark:text-ink-400 mt-0.5">{tiempoRelativo(n.creadaEn)}</div>
                  </div>
                  {!n.leida && <span className="w-2 h-2 rounded-full bg-brand-500 shrink-0 mt-1.5" />}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
