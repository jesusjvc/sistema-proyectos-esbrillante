export function generarMensajeInicio(proyecto) {
  const { cliente, proyecto: p, equipo, condicionesTecnicas } = proyecto

  const equipoTexto = [
    equipo.copy && equipo.copy !== 'Por asignar' ? `• Copy: ${equipo.copy}` : null,
    equipo.disenador && equipo.disenador !== 'Por asignar' ? `• Diseñador: ${equipo.disenador}` : null,
    equipo.programador && equipo.programador !== 'No aplica' && equipo.programador !== 'Por asignar'
      ? `• Programador: ${equipo.programador}`
      : null,
    equipo.adminProyecto ? `• Coordinador: ${equipo.adminProyecto}` : null,
  ]
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
