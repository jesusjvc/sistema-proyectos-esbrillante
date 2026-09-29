import { useEffect } from 'react'

// Cierra un modal con la tecla Escape — el mismo gesto en todas las pantallas
// (tareas y proyectos). El listener vive solo mientras el modal está montado,
// así que no hace falta flag de "abierto": montarse ya es estar abierto.
export default function useEscape(onCerrar) {
  useEffect(() => {
    function manejar(e) {
      if (e.key === 'Escape') onCerrar()
    }
    document.addEventListener('keydown', manejar)
    return () => document.removeEventListener('keydown', manejar)
  }, [onCerrar])
}
