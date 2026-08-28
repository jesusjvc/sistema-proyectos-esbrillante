import {
  getPlantillasApi, getPlantillaApi, crearPlantillaApi, actualizarPlantillaApi, eliminarPlantillaApi,
  agregarTareaPlantillaApi, editarTareaPlantillaApi, eliminarTareaPlantillaApi, materializarPlantilla,
} from './api.js'

export const CONDICION_LABELS = {
  requiereCloudflare: 'Requiere Cloudflare',
  requiereCorreos: 'Requiere correos corporativos',
  requiereAnalytics: 'Requiere Google Analytics',
  requiereSearchConsole: 'Requiere Search Console',
  requiereCapacitacion: 'Requiere capacitación al cliente',
  requierePluginAdicional: 'Requiere plugin adicional',
  sinCloudflare: 'Solo si NO usa Cloudflare',
  tienePlugin: 'Extra: Plugin de agendamiento / membresías',
  tieneEcommerce: 'Extra: Ecommerce (WooCommerce)',
  tienePasarela: 'Extra: Pasarela de pago',
  tieneBlog: 'Extra: Blog con entradas',
  tieneSeoAvanzado: 'Extra: SEO avanzado',
  tieneCapacitacionExtendida: 'Extra: Capacitación extendida',
}

// ─── CRUD ──────────────────────────────────────────────────────────────────
// Las plantillas viven en la base de datos (server/prisma/schema.prisma,
// modelos Plantilla/TareaPlantilla) — así el MCP también puede leerlas
// (server/src/routes/mcp.js, tool listar_plantillas). Estas funciones son
// wrappers async de src/data/api.js.

export const getPlantillas = () => getPlantillasApi()
export const getPlantilla = (id) => getPlantillaApi(id)
export const crearPlantilla = (datos) => crearPlantillaApi(datos)
export const actualizarPlantilla = (id, cambios) => actualizarPlantillaApi(id, cambios)
export const eliminarPlantilla = (id) => eliminarPlantillaApi(id)

// ─── Tareas dentro de una plantilla ────────────────────────────────────────

export const agregarTareaPlantilla = (plantillaId, tarea) => agregarTareaPlantillaApi(plantillaId, tarea)
export const editarTareaPlantilla = (plantillaId, tareaId, cambios) => editarTareaPlantillaApi(plantillaId, tareaId, cambios)
export const eliminarTareaPlantilla = (plantillaId, tareaId) => eliminarTareaPlantillaApi(plantillaId, tareaId)

export function moverTareaPlantilla(plantillaId, tareaId, { antesDeTareaId, despuesDeTareaId }) {
  return editarTareaPlantillaApi(plantillaId, tareaId, { antesDeTareaId, despuesDeTareaId })
}

// ─── Fases de una plantilla ────────────────────────────────────────────────

export async function agregarFasePlantilla(plantillaId, fase) {
  const p = await getPlantillaApi(plantillaId)
  const maxNum = p.fases.reduce((m, f) => Math.max(m, f.numero), 0)
  const fases = [...p.fases, { numero: maxNum + 1, nombre: fase.nombre }].sort((a, b) => a.numero - b.numero)
  return actualizarPlantillaApi(plantillaId, { fases })
}

export async function editarFasePlantilla(plantillaId, faseNumero, cambios) {
  const p = await getPlantillaApi(plantillaId)
  const fases = p.fases.map((f) => (f.numero === faseNumero ? { ...f, ...cambios } : f))
  return actualizarPlantillaApi(plantillaId, { fases })
}

// ─── Copiar tareas de plantilla a proyecto ─────────────────────────────────
// El filtrado por condicion y el remapeo de ids/dependencias ahora vive en el
// backend (server/src/lib/plantillaHelpers.js) — una sola fuente de verdad
// reusada por este endpoint y por el tool MCP crear_proyecto.

export const copiarTareasDesde = (plantillaId, condiciones, extras) => materializarPlantilla(plantillaId, condiciones, extras)

// ─── Datos del catálogo builtin ────────────────────────────────────────────
// Viven en src/data/plantillasSeedData.js (sin dependencias de Vite) porque
// server/src/scripts/migrarPlantillasABD.js los importa directo desde Node.

export { FASES_WEB, seedPlantillas, tareasWebBase } from './plantillasSeedData.js'
