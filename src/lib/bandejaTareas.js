import { nombreProyecto } from '../data/storage'
import { tareaLeTocaPorAsignacion, tareaAsignadaDirectamente, idsDeRol } from './permisos'

// Roles que se resuelven contra el equipo del proyecto — una tarea con uno de
// estos roles y NADIE cubriéndolo en el proyecto está igual "al aire" que una
// con responsable "equipo".
export const ROLES_CON_PERSONA = ['copy', 'disenador', 'programador', 'redes']

// Urgente primero, luego por fecha límite más próxima (sin fecha al final).
const ORDEN_PRIORIDAD = { urgente: 0, normal: 1, cuando_se_pueda: 2 }
export function porPrioridad(a, b) {
  const pa = ORDEN_PRIORIDAD[a.prioridad] ?? 1
  const pb = ORDEN_PRIORIDAD[b.prioridad] ?? 1
  if (pa !== pb) return pa - pb
  if (a.fechaLimite && b.fechaLimite) return new Date(a.fechaLimite) - new Date(b.fechaLimite)
  if (a.fechaLimite) return -1
  if (b.fechaLimite) return 1
  return 0
}

export function proyectosDeTrabajo(proyectos) {
  return proyectos.filter((p) => p.status === 'activo' || p.status === 'en_pausa')
}

// Bandeja de un usuario cualquiera: en proceso, asignadas y bloqueadas por
// dependencias. Las tareas con responsable "equipo" NO aparecen — son "al
// aire" hasta que alguien las reciba; el admin las ve y asigna desde "Sin asignar".
export function bandejaDe(usuarioObjetivo, proyectosTrabajo) {
  const asignadas = []
  const bloqueadas = []
  const enProceso = []
  if (!usuarioObjetivo) return { asignadas, bloqueadas, enProceso }

  const esAdminObjetivo = usuarioObjetivo.rol === 'admin' || usuarioObjetivo.rol === 'ADMIN'
  proyectosTrabajo.forEach((p) => {
    const completadasIds = new Set(p.tareas.filter((t) => t.estado === 'completada').map((t) => t.id))
    const titulosPorId = new Map(p.tareas.map((t) => [t.id, t.titulo]))
    p.tareas.forEach((t) => {
      if (t.estado === 'completada' || t.estado === 'omitida' || t.esCliente) return
      if (t.soloKarlaOAdmin && !usuarioObjetivo.esKarla && !esAdminObjetivo) return
      // Un admin ve solo lo que tiene asignado a su persona directamente — no
      // "todo" (tareaLeCorresponde da acceso total a cualquier admin, y al
      // coordinador/asistente sobre su proyecto, porque sirve para autorizar
      // operaciones, no para armar esta bandeja).
      if (esAdminObjetivo ? !tareaAsignadaDirectamente(t, usuarioObjetivo.id) : !tareaLeTocaPorAsignacion(t, p.equipo, usuarioObjetivo)) return

      if (t.estado === 'en_proceso') {
        if (t.asignadoA === usuarioObjetivo.nombre) enProceso.push({ ...t, proyectoSlug: p.slug, proyectoNombre: nombreProyecto(p) })
        return
      }
      const pendientes = t.dependencias.filter((d) => !completadasIds.has(d))
      if (pendientes.length) {
        bloqueadas.push({
          ...t,
          proyectoSlug: p.slug,
          proyectoNombre: nombreProyecto(p),
          faltaPor: pendientes.map((d) => titulosPorId.get(d) || d),
        })
        return
      }
      // Cualquier responsable que no sea "equipo" (un rol puntual como
      // copy/disenador, o una persona asignada directamente) ya es tuyo
      // específicamente, aunque todavía no le hayas dado clic a "Empezar".
      if (t.responsable !== 'equipo') {
        // Referencias del cliente: tareas del cliente de las que esta
        // depende y que ya tienen respuesta o carpeta de Drive.
        const infoCliente = t.dependencias
          .map((id) => p.tareas.find((x) => x.id === id))
          .filter((x) => x && x.esCliente && (x.respuestaTexto || x.respuestaArchivoUrl || x.driveFolderUrl))
          .map((x) => ({ titulo: x.titulo, respuestaTexto: x.respuestaTexto, respuestaArchivoUrl: x.respuestaArchivoUrl, driveFolderUrl: x.driveFolderUrl }))
        asignadas.push({ ...t, proyectoSlug: p.slug, proyectoNombre: nombreProyecto(p), infoCliente })
      }
    })
  })
  asignadas.sort(porPrioridad)
  return { asignadas, bloqueadas, enProceso }
}

// Tareas "al aire" agrupadas por proyecto: sin responsable específico, o con
// un rol que nadie cubre en ese proyecto.
export function sinAsignarPorProyecto(proyectosTrabajo) {
  return proyectosTrabajo
    .map((p) => ({
      proyecto: p,
      tareas: p.tareas.filter((t) =>
        !t.esCliente && ['pendiente', 'en_proceso', 'revision'].includes(t.estado)
        && (t.responsable === 'equipo' || (ROLES_CON_PERSONA.includes(t.responsable) && idsDeRol(p.equipo, t.responsable).length === 0))),
    }))
    .filter(({ tareas }) => tareas.length > 0)
}
