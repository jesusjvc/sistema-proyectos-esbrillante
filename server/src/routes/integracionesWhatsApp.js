import { Router } from 'express'
import prisma from '../lib/prisma.js'
import { requireAuthOrApiKey } from '../middleware/auth.js'

const router = Router()

// Integración de WhatsApp — la consume el puente local (whatsapp-bridge/,
// OpenWA en la máquina del equipo) con la misma API key del MCP. Los grupos
// rastreados viven en Info clave de cada proyecto (infoClave.grupoWhatsapp,
// nombre exacto del grupo en WhatsApp).

const DIAS_RETENCION = 7

function grupoNormalizado(valor) {
  return String(valor || '').trim().toLowerCase()
}

// GET /api/integraciones/whatsapp/grupos — qué grupos rastrear (el puente
// lo consulta al arrancar y cada hora para recoger altas/cambios).
router.get('/grupos', requireAuthOrApiKey, async (req, res) => {
  try {
    const proyectos = await prisma.proyecto.findMany({ where: { status: 'activo' } })
    const grupos = proyectos
      .filter((p) => p.proyecto?.infoClave?.grupoWhatsapp)
      .map((p) => ({
        proyectoId: p.id,
        slug: p.slug,
        cliente: p.cliente?.nombreComercial || p.slug,
        grupo: p.proyecto.infoClave.grupoWhatsapp,
      }))
    res.json(grupos)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// POST /api/integraciones/whatsapp/mensajes — lote de mensajes de UN grupo:
// { grupo, mensajes: [{ autor, texto, fecha }] }. Asigna al proyecto cuyo
// infoClave.grupoWhatsapp coincida (sin importar mayúsculas) y purga los
// mensajes con más de DIAS_RETENCION — el resumen diario (NotaProyecto) es
// lo que queda permanente.
router.post('/mensajes', requireAuthOrApiKey, async (req, res) => {
  const { grupo, mensajes } = req.body
  const nombreGrupo = typeof grupo === 'string' ? grupo.trim() : ''
  if (!nombreGrupo) return res.status(400).json({ error: 'Falta el grupo' })
  if (!Array.isArray(mensajes) || !mensajes.length) return res.status(400).json({ error: 'mensajes debe ser una lista con contenido' })
  if (mensajes.length > 2000) return res.status(400).json({ error: 'Demasiados mensajes en un solo lote (máx. 2000)' })

  try {
    const proyectos = await prisma.proyecto.findMany({ where: { status: 'activo' } })
    const destino = proyectos.filter((p) => grupoNormalizado(p.proyecto?.infoClave?.grupoWhatsapp) === grupoNormalizado(nombreGrupo))
    if (!destino.length) {
      return res.status(404).json({ error: `Ningún proyecto activo tiene el grupo de WhatsApp "${nombreGrupo}" — revísalo en la Info clave del proyecto` })
    }

    const filas = []
    const invalidos = []
    for (const m of mensajes) {
      const texto = String(m?.texto || '').trim()
      const fecha = m?.fecha ? new Date(m.fecha) : null
      if (!texto || !fecha || Number.isNaN(fecha.getTime())) {
        invalidos.push(m)
        continue
      }
      for (const p of destino) {
        filas.push({
          proyectoId: p.id,
          grupo: nombreGrupo,
          autor: String(m.autor || 'Desconocido').trim().slice(0, 120),
          texto: texto.slice(0, 4000),
          fechaMensaje: fecha,
        })
      }
    }

    const guardados = filas.length ? await prisma.mensajeWhatsApp.createMany({ data: filas }) : { count: 0 }

    // Retención: borrar lo anterior a la ventana — barato y auto-mantenido
    // en cada ingest (no depende de un job aparte).
    const limite = new Date(Date.now() - DIAS_RETENCION * 24 * 3600_000)
    const purgados = await prisma.mensajeWhatsApp.deleteMany({ where: { creadoEn: { lt: limite } } })

    res.json({
      ok: true,
      guardados: guardados.count,
      descartados: invalidos.length,
      proyectos: destino.map((p) => p.slug),
      purgados: purgados.count,
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Error interno' })
  }
})

export default router
