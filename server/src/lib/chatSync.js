// Sincronización de Google Chat → Foco.
//
// Lee los mensajes nuevos de los espacios de Google Chat registrados en la
// Info clave de proyectos activos (infoClave.grupos[] con canal
// 'google-chat') y los guarda en mensajes_whatsapp (modelo compartido de
// canales: el campo `grupo` lleva el nombre del espacio). Corre server-side
// 24/7 vía delegación de dominio — no depende de la máquina del equipo.
//
// Cursor: la fecha del último mensaje guardado por espacio (sin archivo de
// estado — se consulta a la BD en cada vuelta).

import prisma from './prisma.js'
import { chatDwdConfigurado, chatEspacios, chatMensajes, chatMiembros } from './googleChat.js'
import { gruposDe } from '../routes/integracionesWhatsApp.js'

const DIAS_RETENCION = 7

function gruposChatDe(proyecto) {
  return gruposDe(proyecto).filter((g) => g.canal === 'google-chat')
}

export async function sincronizarGoogleChat() {
  if (!chatDwdConfigurado()) return { saltado: 'Google Chat por delegación no configurado (falta GOOGLE_CHAT_IMPERSONATE_USER)' }

  const espacios = await chatEspacios()
  const proyectos = await prisma.proyecto.findMany({ where: { status: 'activo' } })

  const destinos = []
  for (const p of proyectos) {
    for (const g of gruposChatDe(p)) {
      const espacio = espacios.find((e) => (e.nombre || '').trim().toLowerCase() === g.nombre.trim().toLowerCase())
      if (espacio) destinos.push({ proyecto: p, grupo: g.nombre, etiqueta: g.etiqueta, espacioId: espacio.id })
      else console.log(`[chat-sync] El espacio "${g.nombre}" (${p.slug}) no aparece en Google Chat`)
    }
  }
  if (!destinos.length) return { sincronizados: 0, espacios: espacios.length }

  let guardados = 0
  const detalles = []
  for (const destino of destinos) {
    try {
      const ultimo = await prisma.mensajeWhatsApp.findFirst({
        where: { proyectoId: destino.proyecto.id, grupo: destino.grupo },
        orderBy: { fechaMensaje: 'desc' },
      })
      // Piso de la ventana: lo último guardado o, en la primera sincronización,
      // la retención (la API devuelve los mensajes MÁS VIEJOS primero — sin
      // piso, la primera vuelta traería historia de años atrás).
      const piso = ultimo
        ? new Date(new Date(ultimo.fechaMensaje).getTime() + 1000)
        : new Date(Date.now() - (DIAS_RETENCION + 1) * 24 * 3600_000)
      const mensajes = await chatMensajes(destino.espacioId, { desde: piso.toISOString() })
      const miembros = await chatMiembros(destino.espacioId)

      const filas = mensajes
        .filter((m) => m.texto && new Date(m.fecha) > (ultimo ? new Date(ultimo.fechaMensaje) : new Date(0)))
        .map((m) => ({
          proyectoId: destino.proyecto.id,
          grupo: destino.grupo,
          autor: miembros[m.autor] || m.autor,
          texto: m.texto.slice(0, 4000),
          fechaMensaje: new Date(m.fecha),
        }))
      if (filas.length) {
        const r = await prisma.mensajeWhatsApp.createMany({ data: filas })
        guardados += r.count
      }
      detalles.push(`"${destino.etiqueta || destino.grupo}": ${filas.length} nuevo(s)`)
    } catch (err) {
      console.error(`[chat-sync] Error con "${destino.grupo}":`, err.message)
      detalles.push(`"${destino.grupo}": error (${err.message.slice(0, 80)})`)
    }
  }

  // Misma retención que el ingest de WhatsApp.
  const limite = new Date(Date.now() - DIAS_RETENCION * 24 * 3600_000)
  const purgados = await prisma.mensajeWhatsApp.deleteMany({ where: { creadoEn: { lt: limite } } })

  return { sincronizados: guardados, purgados: purgados.count, detalles: detalles.join(' · ') }
}
