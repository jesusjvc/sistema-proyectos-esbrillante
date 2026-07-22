import { useEffect, useRef } from 'react'

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001'

// Se reconecta solo si cambia el slug/activo — el callback se guarda en un
// ref para no tener que exigirle al caller que lo memorice con useCallback.
export function useEventosProyecto(slug, activo, onEvento) {
  const callbackRef = useRef(onEvento)
  callbackRef.current = onEvento

  useEffect(() => {
    if (!slug || !activo) return
    const es = new EventSource(`${BASE}/api/eventos/proyecto/${slug}`, { withCredentials: true })
    es.onmessage = () => callbackRef.current()
    return () => es.close()
  }, [slug, activo])
}

export function useEventosGlobal(activo, onEvento) {
  const callbackRef = useRef(onEvento)
  callbackRef.current = onEvento

  useEffect(() => {
    if (!activo) return
    const es = new EventSource(`${BASE}/api/eventos/global`, { withCredentials: true })
    es.onmessage = () => callbackRef.current()
    return () => es.close()
  }, [activo])
}
