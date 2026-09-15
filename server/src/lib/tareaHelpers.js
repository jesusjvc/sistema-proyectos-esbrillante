import { randomUUID } from 'crypto'
import prisma from './prisma.js'
import { ordenAlFinal } from './orden.js'
import { estadoDeColumna } from './kanban.js'

// Crea una tarea "custom" (agregada manualmente, no parte de la plantilla del
// paquete) para un proyecto. Compartido entre POST /tareas (alta directa) y
// la aprobación de una Solicitud del cliente (server/src/routes/solicitudes.js).
// No escribe LogEntry — cada caller registra el log con su propio texto.
export async function crearTareaCustom(p, { fase, columna, titulo, descripcion, instruccionesCliente, responsable, esCliente, plazoHoras, dependencias, prioridad, fechaLimite }) {
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

  const completadasIds = new Set(p.tareas.filter((t) => t.estado === 'completada').map((t) => t.id))
  const disponibleDeInicio = esCliente && (dependencias || []).every((d) => completadasIds.has(d))

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
      disponibleDesde: disponibleDeInicio ? new Date() : null,
      prioridad: prioridad || null,
      fechaLimite: fechaLimite ? new Date(fechaLimite) : null,
    },
  })
}

// Convierte una Solicitud pendiente en una Tarea real — compartido entre la
// aprobación manual (equipo/admin resolviendo una solicitud del cliente,
// server/src/routes/solicitudes.js POST /:id/aprobar) y la creación interna
// de un ticket (POST / en la misma ruta), que se autoaprueba de una vez.
export async function aprobarSolicitud(p, solicitud, { fase, columna, responsable, dependencias, prioridad, fechaLimite }, usuario) {
  const nueva = await crearTareaCustom(p, {
    fase, columna, titulo: solicitud.titulo, descripcion: solicitud.descripcion,
    responsable, esCliente: false, dependencias, prioridad, fechaLimite,
  })
  const actualizada = await prisma.solicitud.update({
    where: { id: solicitud.id },
    data: { estado: 'aprobada', tareaId: nueva.id, resueltaPor: usuario, resueltaEn: new Date() },
  })
  return { tarea: nueva, solicitud: actualizada }
}

// Marca `disponibleDesde` en las tareas de cliente que ya tienen todas sus
// dependencias completadas pero aún no habían quedado activas — es el
// momento en que empieza a correr `plazoHoras` para recordatorios y el
// badge de "atrasada". Se llama después de cualquier cambio que pueda
// completar una tarea (puede liberar la dependencia de otra tarea cliente).
export async function activarTareasClienteDisponibles(proyectoId) {
  const tareas = await prisma.tarea.findMany({ where: { proyectoId } })
  const completadasIds = new Set(tareas.filter((t) => t.estado === 'completada').map((t) => t.id))
  const activables = tareas.filter((t) =>
    t.esCliente && t.estado === 'pendiente' && !t.disponibleDesde &&
    t.dependencias.every((d) => completadasIds.has(d))
  )
  if (!activables.length) return
  await Promise.all(activables.map((t) =>
    prisma.tarea.update({ where: { id: t.id }, data: { disponibleDesde: new Date() } })
  ))
}
