import { randomUUID } from 'crypto'
import prisma from './prisma.js'

// Traduce condicionesTecnicas + extras seleccionados a las claves booleanas
// contra las que se evalúa `condicion` de cada TareaPlantilla. Espejo server-side
// de buildCondicionesCtx en src/data/plantillas.js — mismas claves, misma lógica.
function buildCondicionesCtx(condicionesTecnicas, extras) {
  const condiciones = condicionesTecnicas || {}
  const ext = extras || []
  return {
    ...condiciones,
    tienePlugin: ext.includes('Plugin de agendamiento de citas') || ext.includes('Plugin de membresías'),
    tieneEcommerce: ext.includes('Carga de productos (Ecommerce)') || ext.includes('Pasarela de pago (Stripe / MercadoPago / PayPal)'),
    tienePasarela: ext.includes('Pasarela de pago (Stripe / MercadoPago / PayPal)'),
    tieneBlog: ext.includes('Blog con entradas iniciales'),
    tieneSeoAvanzado: ext.includes('SEO avanzado'),
    tieneCapacitacionExtendida: ext.includes('Capacitación extendida'),
    sinCloudflare: !condiciones.requiereCloudflare,
  }
}

function matchCondicion(condicion, ctx) {
  if (!condicion) return true
  return ctx[condicion] === true
}

// Arma el array de tareas de un proyecto nuevo a partir de una plantilla:
// filtra por condicion, remapea ids de TareaPlantilla a nuevos ids de Tarea
// y reescribe las dependencias con esos nuevos ids (descartando las que
// apuntaban a una tarea excluida por condición). Única fuente de verdad
// para materializar plantillas — la usan tanto POST /api/plantillas/:id/materializar
// (UI) como el tool MCP crear_proyecto.
export async function materializarTareasDesdePlantilla(plantillaId, condicionesTecnicas, extras) {
  const plantilla = await prisma.plantilla.findUnique({
    where: { id: plantillaId },
    include: { tareas: { orderBy: { orden: 'asc' } } },
  })
  if (!plantilla) {
    const err = new Error(`No se encontró la plantilla "${plantillaId}".`)
    err.status = 404
    throw err
  }

  const ctx = buildCondicionesCtx(condicionesTecnicas, extras)
  const tareasBase = plantilla.tareas.filter((t) => matchCondicion(t.condicion, ctx))

  const idMap = {}
  tareasBase.forEach((t) => { idMap[t.id] = randomUUID() })

  return tareasBase.map((t) => ({
    id: idMap[t.id],
    fase: t.fase,
    orden: t.orden,
    titulo: t.titulo,
    responsable: t.responsable,
    dependencias: (t.dependencias || []).filter((d) => idMap[d]).map((d) => idMap[d]),
    condicion: t.condicion,
    descripcion: t.descripcion,
    queHacer: t.queHacer,
    necesitasAntes: t.necesitasAntes,
    plantillaMensaje: t.plantillaMensaje,
    queEntregas: t.queEntregas,
    linkTipo: t.linkTipo,
    esCliente: t.esCliente,
    instruccionesCliente: t.instruccionesCliente,
    plazoHoras: t.plazoHoras,
    esRutaCritica: t.esRutaCritica,
    soloAdmin: t.soloAdmin,
    soloKarlaOAdmin: t.soloKarlaOAdmin,
    opcional: t.opcional,
    custom: false,
    estado: 'pendiente',
    completadaPor: null,
    completadaEn: null,
    asignadoA: null,
    disponibleDesde: t.esCliente && !(t.dependencias || []).length ? new Date() : null,
  }))
}
