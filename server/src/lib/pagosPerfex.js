import prisma from './prisma.js'
import { obtenerFactura, buscarFacturas } from './perfexClient.js'
import { activarTareasClienteDisponibles } from './tareaHelpers.js'
import { logEntry } from './logEntry.js'
import { emitirCambio } from './eventos.js'

// Foco no maneja montos: de cada factura de Perfex guarda solo su número,
// a qué corresponde (anticipo o una fase), su estado y el porcentaje pagado.
// Vive en proyecto.proyecto.pagos: [{ facturaId, numero, destino, estado,
// porcentaje, revisadoEn }], con destino 'anticipo' o 'fase:<n>'.

const ESTADOS_PERFEX = { 1: 'pendiente', 2: 'pagada', 3: 'parcial', 4: 'vencida', 5: 'cancelada', 6: 'borrador' }
const ESTADOS_FINALES = ['pagada', 'cancelada']

export function estadoFactura(factura) {
  const estado = ESTADOS_PERFEX[Number(factura.status)] || 'pendiente'
  if (estado === 'pagada') return { estado, porcentaje: 100 }
  const total = Number(factura.total) || 0
  const restante = Number(factura.total_left_to_pay)
  const porcentaje = total > 0 && Number.isFinite(restante)
    ? Math.max(0, Math.min(100, Math.round(((total - restante) / total) * 100)))
    : 0
  return { estado, porcentaje }
}

export function destinoValido(destino, proyecto) {
  if (destino === 'anticipo') return true
  const m = /^fase:(\d+)$/.exec(destino || '')
  return !!m && (proyecto.proyecto?.fases || []).some((f) => f.numero === Number(m[1]))
}

// Acepta el número formateado (EB-002481) o el id interno de Perfex.
async function resolverFactura(numero) {
  const limpio = String(numero || '').trim()
  let id = /^\d+$/.test(limpio) ? limpio : null
  if (!id) {
    const encontradas = await buscarFacturas(limpio)
    const exacta = encontradas.find((f) => (f.formatted_number || '').toLowerCase() === limpio.toLowerCase())
    if (!exacta) return null
    id = exacta.id
  }
  return obtenerFactura(id)
}

// Misma transición que el botón "Confirmar anticipo": activa el proyecto si
// esperaba el anticipo y arranca su reloj. Un proyecto en pausa se queda en
// pausa — el anticipo no decide eso.
export async function confirmarAnticipo(proyecto, usuario, detalle = '') {
  const tiempos = { ...(proyecto.tiempos || {}), inicio: proyecto.tiempos?.inicio || new Date().toISOString() }
  const status = proyecto.status === 'pendiente_anticipo' ? 'activo' : proyecto.status
  const datosProyecto = { ...proyecto.proyecto, anticipoConfirmado: true }
  await prisma.proyecto.update({ where: { id: proyecto.id }, data: { status, proyecto: datosProyecto, tiempos } })
  proyecto.status = status
  proyecto.proyecto = datosProyecto
  proyecto.tiempos = tiempos
  await logEntry(proyecto.id, usuario, 'Anticipo confirmado', detalle)
  await activarTareasClienteDisponibles(proyecto.id)
}

// Aplica los efectos de las facturas ya pagadas: anticipo → proyecto activo;
// fase → pagoConfirmado. Nunca revierte un pago ya confirmado aunque la
// factura cambie después en Perfex.
async function aplicarPagos(proyecto, usuario) {
  const pagos = proyecto.proyecto?.pagos || []
  let cambio = false

  const anticipoPagado = pagos.find((pg) => pg.destino === 'anticipo' && pg.estado === 'pagada')
  if (anticipoPagado && !proyecto.proyecto.anticipoConfirmado) {
    await confirmarAnticipo(proyecto, usuario, `Factura ${anticipoPagado.numero} pagada en Perfex`)
    cambio = true
  }

  const fases = [...(proyecto.proyecto?.fases || [])]
  const fasesPagadas = []
  for (const pg of pagos) {
    const m = /^fase:(\d+)$/.exec(pg.destino)
    if (!m || pg.estado !== 'pagada') continue
    const idx = fases.findIndex((f) => f.numero === Number(m[1]))
    if (idx === -1 || fases[idx].pagoConfirmado) continue
    fases[idx] = { ...fases[idx], pagoConfirmado: true }
    fasesPagadas.push({ fase: fases[idx], numero: pg.numero })
  }
  if (fasesPagadas.length) {
    proyecto.proyecto = { ...proyecto.proyecto, fases }
    await prisma.proyecto.update({ where: { id: proyecto.id }, data: { proyecto: proyecto.proyecto } })
    for (const { fase, numero } of fasesPagadas) {
      await logEntry(proyecto.id, usuario, 'Pago de fase confirmado', `Fase ${fase.numero} — ${fase.nombre} (factura ${numero} pagada en Perfex)`)
    }
    await activarTareasClienteDisponibles(proyecto.id)
    cambio = true
  }
  return cambio
}

async function guardarPagos(proyecto, pagos) {
  proyecto.proyecto = { ...proyecto.proyecto, pagos }
  await prisma.proyecto.update({ where: { id: proyecto.id }, data: { proyecto: proyecto.proyecto } })
}

async function crmIdDelProyecto(proyecto) {
  if (!proyecto.clienteId) return null
  const cliente = await prisma.cliente.findUnique({ where: { id: proyecto.clienteId }, select: { crmId: true } })
  return cliente?.crmId ? String(cliente.crmId) : null
}

export async function vincularFactura(proyecto, { numero, destino }, usuario) {
  if (!destinoValido(destino, proyecto)) {
    const error = new Error('destino inválido — usa "anticipo" o "fase:<número>" de una fase existente')
    error.status = 400
    throw error
  }
  const factura = await resolverFactura(numero)
  if (!factura) {
    const error = new Error(`No encontré la factura "${numero}" en Perfex`)
    error.status = 404
    throw error
  }
  // Evita ligar por error la factura de otro cliente.
  const crmId = await crmIdDelProyecto(proyecto)
  if (crmId && String(factura.clientid) !== crmId) {
    const error = new Error(`La factura ${factura.formatted_number} es de otro cliente en Perfex`)
    error.status = 400
    throw error
  }

  const facturaId = String(factura.id)
  const pago = {
    facturaId,
    numero: factura.formatted_number || facturaId,
    destino,
    ...estadoFactura(factura),
    revisadoEn: new Date().toISOString(),
  }
  const pagos = (proyecto.proyecto?.pagos || []).filter((pg) => pg.facturaId !== facturaId)
  await guardarPagos(proyecto, [...pagos, pago])
  await logEntry(proyecto.id, usuario, 'Factura vinculada', `${pago.numero} → ${destino === 'anticipo' ? 'anticipo' : `fase ${destino.split(':')[1]}`} (${pago.estado}, ${pago.porcentaje}%)`)
  await aplicarPagos(proyecto, usuario)
  emitirCambio(proyecto.id)
  return pago
}

export async function desvincularFactura(proyecto, facturaId, usuario) {
  const pagos = proyecto.proyecto?.pagos || []
  const quitado = pagos.find((pg) => pg.facturaId === String(facturaId))
  if (!quitado) return false
  await guardarPagos(proyecto, pagos.filter((pg) => pg !== quitado))
  await logEntry(proyecto.id, usuario, 'Factura desvinculada', quitado.numero)
  emitirCambio(proyecto.id)
  return true
}

// Clientes que liquidan todo de entrada: anticipo y todas las fases con
// pago quedan confirmados sin factura que revisar.
export async function marcarPagadoDesdeInicio(proyecto, usuario) {
  if (!proyecto.proyecto?.anticipoConfirmado) await confirmarAnticipo(proyecto, usuario, 'Pagado desde el inicio')
  const fases = (proyecto.proyecto?.fases || []).map((f) => (f.requierePago ? { ...f, pagoConfirmado: true } : f))
  proyecto.proyecto = { ...proyecto.proyecto, fases, pagadoDesdeInicio: true }
  await prisma.proyecto.update({ where: { id: proyecto.id }, data: { proyecto: proyecto.proyecto } })
  await logEntry(proyecto.id, usuario, 'Proyecto pagado desde el inicio')
  await activarTareasClienteDisponibles(proyecto.id)
  emitirCambio(proyecto.id)
}

export async function sincronizarPagosProyecto(proyecto, usuario = 'Perfex') {
  const pagos = proyecto.proyecto?.pagos || []
  const porRevisar = pagos.filter((pg) => !ESTADOS_FINALES.includes(pg.estado))
  if (!porRevisar.length) return false

  const actualizados = await Promise.all(pagos.map(async (pg) => {
    if (ESTADOS_FINALES.includes(pg.estado)) return pg
    const factura = await obtenerFactura(pg.facturaId)
    return factura ? { ...pg, ...estadoFactura(factura), revisadoEn: new Date().toISOString() } : pg
  }))
  await guardarPagos(proyecto, actualizados)
  const cambio = await aplicarPagos(proyecto, usuario)
  emitirCambio(proyecto.id)
  return cambio
}

// Corre cada hora. Un proyecto que falla no detiene a los demás.
export async function sincronizarPagosPerfex() {
  const proyectos = await prisma.proyecto.findMany({ where: { status: { in: ['pendiente_anticipo', 'activo', 'en_pausa'] } } })
  for (const p of proyectos) {
    if (!(p.proyecto?.pagos || []).length) continue
    try {
      await sincronizarPagosProyecto(p)
    } catch (err) {
      console.error(`Error sincronizando pagos de Perfex en ${p.slug}:`, err.message)
    }
  }
}
