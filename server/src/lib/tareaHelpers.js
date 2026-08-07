import { randomUUID } from 'crypto'
import prisma from './prisma.js'
import { ordenAlFinal } from './orden.js'
import { estadoDeColumna } from './kanban.js'

// Crea una tarea "custom" (agregada manualmente, no parte de la plantilla del
// paquete) para un proyecto. Compartido entre POST /tareas (alta directa) y
// la aprobación de una Solicitud del cliente (server/src/routes/solicitudes.js).
// No escribe LogEntry — cada caller registra el log con su propio texto.
export async function crearTareaCustom(p, { fase, columna, titulo, descripcion, instruccionesCliente, responsable, esCliente, plazoHoras, dependencias }) {
  const esContinuo = p.tipo === 'continuo'
  const faseFinal = esContinuo ? 1 : (fase || 1)
  const estadoFinal = esContinuo && !esCliente ? (estadoDeColumna(columna) || 'pendiente') : 'pendiente'
  const tareasHermanas = esContinuo
    ? await prisma.tarea.findMany({ where: { proyectoId: p.id, estado: estadoFinal } })
    : await prisma.tarea.findMany({ where: { proyectoId: p.id, fase: faseFinal } })

  if (dependencias?.length) {
    const idsProyecto = new Set(p.tareas.map((t) => t.id))
    const invalidos = dependencias.filter((id) => !idsProyecto.has(id))
    if (invalidos.length > 0) {
      const err = new Error(`Dependencias inválidas: ${invalidos.join(', ')}`)
      err.status = 400
      throw err
    }
  }

  return prisma.tarea.create({
    data: {
      id: randomUUID(),
      proyectoId: p.id,
      fase: faseFinal,
      orden: ordenAlFinal(tareasHermanas),
      titulo,
      descripcion: descripcion || '',
      instruccionesCliente: instruccionesCliente || '',
      responsable: esCliente ? 'cliente' : (responsable || 'equipo'),
      esCliente: esCliente || false,
      plazoHoras: plazoHoras ? Number(plazoHoras) : null,
      dependencias: dependencias || [],
      custom: true,
      estado: estadoFinal,
    },
  })
}
