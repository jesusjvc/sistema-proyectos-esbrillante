import prisma from './prisma.js'
import { obtenerFactura, buscarFacturas, obtenerPropuesta, facturasDeCliente, obtenerCustomer } from './perfexClient.js'
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

// Aplica los efectos de las facturas pagadas: anticipo → proyecto activo;
// fase → pagoConfirmado. El anticipo basta con el primer abono, porque a veces
// una sola factura se va pagando en partes hasta finiquitar; una fase sí
// espera a que su factura quede pagada. Nunca revierte un pago ya confirmado
// aunque la factura cambie después en Perfex.
async function aplicarPagos(proyecto, usuario) {
  const pagos = proyecto.proyecto?.pagos || []
  let cambio = false

  const anticipoPagado = pagos.find((pg) => pg.destino === 'anticipo' && pg.estado !== 'cancelada' && (pg.estado === 'pagada' || pg.porcentaje > 0))
  if (anticipoPagado && !proyecto.proyecto.anticipoConfirmado) {
    const detalle = anticipoPagado.estado === 'pagada'
      ? `Factura ${anticipoPagado.numero} pagada en Perfex`
      : `Factura ${anticipoPagado.numero}: primer pago registrado en Perfex`
    await confirmarAnticipo(proyecto, usuario, detalle)
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
    try {
      if (p.status === 'pendiente_anticipo') await ligarFacturaDePropuesta(p)
      if (!(p.proyecto?.pagos || []).length) continue
      await sincronizarPagosProyecto(p)
    } catch (err) {
      console.error(`Error sincronizando pagos de Perfex en ${p.slug}:`, err.message)
    }
  }
}

function propuestaDelProyecto(proyecto) {
  return proyecto.proyecto?.alcance?.propuestaId || proyecto.proyecto?.propuestaId || null
}

// Cuando la propuesta se convierte en factura desde Perfex, la propuesta
// guarda su invoice_id: esa es la factura del anticipo, sin que nadie la ligue.
export async function ligarFacturaDePropuesta(proyecto, usuario = 'Perfex') {
  const pagos = proyecto.proyecto?.pagos || []
  if (proyecto.proyecto?.anticipoConfirmado || pagos.some((pg) => pg.destino === 'anticipo')) return null
  const propuestaId = propuestaDelProyecto(proyecto)
  if (!propuestaId) return null
  const propuesta = await obtenerPropuesta(propuestaId)
  const facturaId = propuesta?.invoice_id ? String(propuesta.invoice_id) : ''
  if (!facturaId || facturaId === '0' || pagos.some((pg) => pg.facturaId === facturaId)) return null
  return vincularFactura(proyecto, { numero: facturaId, destino: 'anticipo' }, usuario)
}

const FRACCIONES_ANTICIPO = [0.5, 0.3, 0.4, 0.6, 0.7]
const MAX_DETALLES = 10
const MAX_SUGERENCIAS = 5

function palabrasClave(items) {
  const palabras = new Set()
  for (const it of items || []) {
    const texto = `${it.description || ''} ${it.long_description || ''}`
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    for (const p of texto.split(/[^a-z0-9]+/)) {
      // Fuera números y palabras cortas: los precios y "de/con/para" no dicen nada.
      if (p.length >= 4 && !/^\d+$/.test(p)) palabras.add(p)
    }
  }
  return palabras
}

function cercano(valor, esperado) {
  return esperado > 0 && Math.abs(valor - esperado) <= esperado * 0.01
}

// Heurística determinista para encontrar la factura del anticipo cuando no
// salió de convertir la propuesta (p. ej. creada aparte desde el MCP). Los
// montos solo se comparan aquí: nunca salen en la respuesta.
export async function sugerirFacturas(proyecto) {
  if (!proyecto.clienteId) return []
  const cliente = await prisma.cliente.findUnique({ where: { id: proyecto.clienteId }, select: { crmId: true, nombreComercial: true } })
  if (!cliente?.crmId) return []
  const crmId = String(cliente.crmId)

  let lista = await facturasDeCliente(crmId, cliente.nombreComercial)
  if (!lista.length) {
    // El nombre en Foco puede no coincidir con la empresa en Perfex.
    const customer = await obtenerCustomer(crmId).catch(() => null)
    if (customer?.company && customer.company !== cliente.nombreComercial) lista = await facturasDeCliente(crmId, customer.company)
  }

  const ligadas = new Set((proyecto.proyecto?.pagos || []).map((pg) => String(pg.facturaId)))
  const candidatas = lista
    .filter((f) => !ligadas.has(String(f.id)))
    .filter((f) => !['cancelada', 'borrador'].includes(estadoFactura(f).estado))
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || Number(b.id) - Number(a.id))
    .slice(0, MAX_DETALLES)
  if (!candidatas.length) return []

  const propuestaId = propuestaDelProyecto(proyecto)
  const propuesta = propuestaId ? await obtenerPropuesta(propuestaId).catch(() => null) : null
  const totalPropuesta = Number(propuesta?.total) || 0
  const fechaPropuesta = propuesta?.date ? String(propuesta.date).slice(0, 10) : ''
  const palabrasPropuesta = palabrasClave(propuesta?.items)

  const detalles = await Promise.all(candidatas.map((f) => obtenerFactura(f.id).catch(() => null)))
  const puntuadas = candidatas.map((resumen, i) => {
    const f = detalles[i] || resumen
    const total = Number(f.total) || 0
    const fecha = String(f.date || resumen.date || '').slice(0, 10)
    const motivos = []
    let puntos = 0

    if (totalPropuesta > 0 && cercano(total, totalPropuesta)) {
      puntos += 3
      motivos.push('Mismo total que la propuesta')
    } else if (totalPropuesta > 0) {
      const fraccion = FRACCIONES_ANTICIPO.find((fr) => cercano(total, totalPropuesta * fr))
      if (fraccion) {
        puntos += 2
        motivos.push(`Coincide con el ${Math.round(fraccion * 100)}% de la propuesta`)
      }
    }

    if (palabrasPropuesta.size) {
      const propias = palabrasClave(f.items)
      const comunes = [...propias].filter((p) => palabrasPropuesta.has(p)).length
      const parecido = propias.size ? comunes / Math.min(propias.size, palabrasPropuesta.size) : 0
      if (comunes >= 2 && parecido >= 0.3) {
        puntos += 1 + parecido
        motivos.push(motivos.length ? 'conceptos parecidos' : 'Conceptos parecidos a la propuesta')
      }
    }

    const posterior = !fechaPropuesta || !fecha || fecha >= fechaPropuesta
    if (!posterior) motivos.push(motivos.length ? 'anterior a la propuesta' : 'Anterior a la propuesta')
    if (!motivos.length) motivos.push('Factura reciente del cliente')

    return {
      puntos,
      posterior,
      sugerencia: {
        facturaId: String(f.id),
        numero: f.formatted_number || String(f.id),
        fecha,
        ...estadoFactura(f),
        motivo: motivos.join(' · '),
      },
    }
  })

  return puntuadas
    .sort((a, b) => (b.posterior - a.posterior) || (b.puntos - a.puntos) || b.sugerencia.fecha.localeCompare(a.sugerencia.fecha))
    .slice(0, MAX_SUGERENCIAS)
    .map((p) => p.sugerencia)
}
