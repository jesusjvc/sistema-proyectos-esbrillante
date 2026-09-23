import { useCallback, useEffect, useRef, useState } from 'react'
import { listarNotificaciones, contarNoLeidas, marcarNotificacionLeida, marcarTodasLeidas } from '../data/api'

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001'

// Carga inicial (contador + últimas notificaciones) y se suscribe al canal SSE
// dedicado (/api/eventos/notificaciones, ver server/src/lib/eventos.js) para
// ir sumando en tiempo real sin recargar. `activo` es el mismo patrón que
// useEventosGlobal: no abrir el stream hasta que haya sesión.
export function useNotificaciones(activo) {
  const [notificaciones, setNotificaciones] = useState([])
  const [noLeidas, setNoLeidas] = useState(0)
  const montado = useRef(true)

  useEffect(() => {
    montado.current = true
    return () => { montado.current = false }
  }, [])

  useEffect(() => {
    if (!activo) return
    Promise.all([contarNoLeidas(), listarNotificaciones({ limit: 20 })])
      .then(([{ total }, lista]) => {
        if (!montado.current) return
        setNoLeidas(total)
        setNotificaciones(lista)
      })
      .catch(() => {})
  }, [activo])

  useEffect(() => {
    if (!activo) return
    const es = new EventSource(`${BASE}/api/eventos/notificaciones`, { withCredentials: true })
    es.onmessage = (e) => {
      const n = JSON.parse(e.data)
      setNotificaciones((prev) => [n, ...prev].slice(0, 20))
      setNoLeidas((prev) => prev + 1)
    }
    return () => es.close()
  }, [activo])

  const leer = useCallback((id) => {
    let yaEstabaLeida = true
    setNotificaciones((prev) => prev.map((n) => {
      if (n.id !== id) return n
      yaEstabaLeida = n.leida
      return { ...n, leida: true }
    }))
    if (!yaEstabaLeida) setNoLeidas((prev) => Math.max(0, prev - 1))
    marcarNotificacionLeida(id).catch(() => {})
  }, [])

  const leerTodas = useCallback(() => {
    setNotificaciones((prev) => prev.map((n) => ({ ...n, leida: true })))
    setNoLeidas(0)
    marcarTodasLeidas().catch(() => {})
  }, [])

  return { notificaciones, noLeidas, leer, leerTodas }
}
