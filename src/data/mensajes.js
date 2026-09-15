// Devuelve los nombres (separados por coma) de quienes ocupan `rol` en
// `equipo` — acepta el shape legado (un userId como string) y el actual
// (array de userIds). null si el rol no aplica o no tiene a nadie asignado.
function nombresDeRol(equipo, rol, miembrosPorId) {
  const v = equipo?.[rol]
  if (!v || v === 'no_aplica') return null
  const ids = Array.isArray(v) ? v : [v]
  const nombres = ids.map((id) => miembrosPorId?.[id] || id).filter(Boolean)
  return nombres.length ? nombres.join(', ') : null
}

export function generarMensajeInicio(proyecto, miembrosPorId = {}) {
  const { cliente, proyecto: p, equipo, condicionesTecnicas } = proyecto

  const equipoTexto = [
    ['copy', 'Copy'],
    ['disenador', 'Diseñador'],
    ['programador', 'Programador'],
    ['redes', 'Redes'],
    ['adminProyecto', 'Coordinador'],
  ]
    .map(([rol, label]) => {
      const nombres = nombresDeRol(equipo, rol, miembrosPorId)
      return nombres ? `• ${label}: ${nombres}` : null
    })
    .filter(Boolean)
    .join('\n')

  const extrasTexto = p.extras.length
    ? p.extras.map((e) => `• ${e}`).join('\n')
    : '• Sin extras adicionales'

  const condicionesTexto = [
    condicionesTecnicas.tieneDominio ? '✅ Ya tiene dominio' : '🔲 Dominio por definir',
    condicionesTecnicas.tieneHosting ? '✅ Ya tiene hosting' : '🔲 Hosting nuevo',
    condicionesTecnicas.requiereCloudflare ? '✅ Cloudflare incluido' : null,
    condicionesTecnicas.requiereCorreos ? '✅ Correos corporativos' : null,
    condicionesTecnicas.requiereAnalytics ? '✅ Google Analytics' : null,
    condicionesTecnicas.requiereSearchConsole ? '✅ Search Console' : null,
    condicionesTecnicas.requiereCapacitacion ? '✅ Capacitación al cliente' : null,
  ]
    .filter(Boolean)
    .join('\n')

  const fechaEntrega = p.fechaEstimadaEntrega
    ? new Date(p.fechaEstimadaEntrega).toLocaleDateString('es-MX', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : 'Por definir'

  return `🚀 *NUEVO PROYECTO — ${cliente.nombreComercial.toUpperCase()}*

Hola equipo, arrancamos un nuevo proyecto. Aquí el resumen:

*📋 CLIENTE*
${cliente.nombreComercial}
Contacto: ${cliente.contactoPrincipal}

*📦 PAQUETE*
${p.paquete}

*➕ EXTRAS*
${extrasTexto}

*⚙️ CONFIGURACIÓN TÉCNICA*
${condicionesTexto}

*👥 EQUIPO ASIGNADO*
${equipoTexto || '• Por asignar'}

*📅 FECHA ESTIMADA DE ENTREGA*
${fechaEntrega}

Cualquier duda o bloqueo, comunicarlo en este grupo de inmediato.

¡A darle! 💪`.trim()
}
