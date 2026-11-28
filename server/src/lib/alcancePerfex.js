import prisma from './prisma.js'
import { obtenerPropuesta } from './perfexClient.js'
import { logEntry } from './logEntry.js'
import { emitirCambio } from './eventos.js'

// Lo que el cliente contrató, tomado de su propuesta en Perfex y sin precios.
// Vive en proyecto.proyecto.alcance: { propuestaId, titulo,
// importadoEn, conceptos: [{ id, descripcion, detalle, opcional, estado }] }.
// estado: 'incluido' (base), 'por_confirmar' (addon opcional), 'confirmado'
// o 'descartado'. Es la base sobre la que se arma el plan de trabajo.

const ESTADOS_CONCEPTO = ['incluido', 'por_confirmar', 'confirmado', 'descartado']

// Las descripciones de la propuesta mezclan alcance y precio ("Precio de
// lista: $1,200 + IVA"). Se descarta la frase que trae un monto; palabras
// como "pago" o "descuento" solas no cuentan porque también describen
// alcance (una pasarela de pago, cupones de descuento).
const FRASE_CON_PRECIO = /\$\s?\d|\bprecio|\+\s?iva\b|\bmxn\b|\d\s?pesos\b/i

export function quitarPrecios(texto) {
  const plano = String(texto || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
  return plano
    .split(/(?<=[.!?])\s+|\n+/)
    .map((f) => f.replace(/\s+/g, ' ').trim())
    .filter((f) => f && !FRASE_CON_PRECIO.test(f))
    .join(' ')
}

export function conceptosDePropuesta(propuesta) {
  return [...(propuesta.items || [])]
    .sort((a, b) => Number(a.item_order) - Number(b.item_order))
    .map((it, i) => {
      const opcional = String(it.is_optional) === '1'
      const seleccionado = String(it.is_selected) === '1'
      return {
        id: String(it.id || i + 1),
        descripcion: quitarPrecios(it.description),
        detalle: quitarPrecios(it.long_description),
        opcional,
        // Un addon que el cliente ya marcó en Perfex igual se confirma en
        // Foco: la propuesta "luego contempla otras cosas" y hay que validarlo.
        estado: opcional ? 'por_confirmar' : 'incluido',
        ...(opcional && seleccionado ? { marcadoEnPropuesta: true } : {}),
      }
    })
    .filter((c) => c.descripcion)
}

// Acepta el id (467), el número (PROEB-000467) o el link de la propuesta
// (…/propuesta/467/<hash>).
export function idDePropuesta(referencia) {
  const ref = String(referencia || '').trim()
  const enLink = /\/propuesta\/(\d+)/.exec(ref)
  if (enLink) return enLink[1]
  const digitos = /(\d+)\s*$/.exec(ref)
  return digitos ? String(Number(digitos[1])) : null
}

async function crmIdDelProyecto(proyecto) {
  if (!proyecto.clienteId) return null
  const cliente = await prisma.cliente.findUnique({ where: { id: proyecto.clienteId }, select: { crmId: true } })
  return cliente?.crmId ? String(cliente.crmId) : null
}

function errorConStatus(mensaje, status) {
  const error = new Error(mensaje)
  error.status = status
  return error
}

export async function importarAlcance(proyecto, referencia, usuario) {
  const id = idDePropuesta(referencia)
  if (!id) throw errorConStatus('No reconozco la propuesta — usa su número (PROEB-000467), su id o su link', 400)
  const propuesta = await obtenerPropuesta(id)
  if (!propuesta || !propuesta.id) throw errorConStatus(`No encontré la propuesta ${referencia} en Perfex`, 404)

  const crmId = await crmIdDelProyecto(proyecto)
  if (crmId && !(propuesta.rel_type === 'customer' && String(propuesta.rel_id) === crmId)) {
    throw errorConStatus('Esa propuesta es de otro cliente en Perfex', 400)
  }

  const conceptos = conceptosDePropuesta(propuesta)
  // Reimportar conserva lo que ya se confirmó o descartó en Foco.
  const previos = new Map((proyecto.proyecto?.alcance?.conceptos || []).map((c) => [c.id, c.estado]))
  for (const c of conceptos) {
    const previo = previos.get(c.id)
    if (c.opcional && (previo === 'confirmado' || previo === 'descartado')) c.estado = previo
  }

  const alcance = {
    propuestaId: String(propuesta.id),
    titulo: quitarPrecios(propuesta.subject),
    importadoEn: new Date().toISOString(),
    conceptos,
  }
  proyecto.proyecto = { ...proyecto.proyecto, alcance }
  await prisma.proyecto.update({ where: { id: proyecto.id }, data: { proyecto: proyecto.proyecto } })
  const porConfirmar = conceptos.filter((c) => c.estado === 'por_confirmar').length
  await logEntry(proyecto.id, usuario, 'Alcance importado de Perfex', `${alcance.titulo} — ${conceptos.length} conceptos${porConfirmar ? `, ${porConfirmar} por confirmar` : ''}`)
  emitirCambio(proyecto.id)
  return alcance
}

export async function cambiarEstadoConcepto(proyecto, conceptoId, estado, usuario) {
  if (!ESTADOS_CONCEPTO.includes(estado) || estado === 'incluido') {
    throw errorConStatus('estado inválido — usa "confirmado", "descartado" o "por_confirmar"', 400)
  }
  const alcance = proyecto.proyecto?.alcance
  const concepto = alcance?.conceptos?.find((c) => c.id === String(conceptoId))
  if (!concepto) throw errorConStatus('Ese concepto no está en el alcance del proyecto', 404)
  if (!concepto.opcional) throw errorConStatus('Solo los conceptos opcionales se confirman o descartan', 400)

  const conceptos = alcance.conceptos.map((c) => (c === concepto ? { ...c, estado } : c))
  proyecto.proyecto = { ...proyecto.proyecto, alcance: { ...alcance, conceptos } }
  await prisma.proyecto.update({ where: { id: proyecto.id }, data: { proyecto: proyecto.proyecto } })
  await logEntry(proyecto.id, usuario, 'Alcance actualizado', `${concepto.descripcion}: ${estado.replace('_', ' ')}`)
  emitirCambio(proyecto.id)
  return conceptos.find((c) => c.id === concepto.id)
}
