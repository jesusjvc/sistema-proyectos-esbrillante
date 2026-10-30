# Guard de sincronización de WhatsApp + mejoras MCP

## Objetivo

Dos grupos de WhatsApp del proyecto "Costalym" (slug `costalym-6zxk`) dejaron
de sincronizar mensajes nuevos porque la sesión de WhatsApp (OpenWA, cuenta
"personal") se desconectó. El vínculo grupo↔proyecto, el modelo de datos y el
filtro de fecha de `ver_mensajes_whatsapp` están correctos — el problema es
que nada detecta ni avisa cuando la sesión se cae. El usuario autorizó un
guard de desconexión, un indicador visible de sincronización estancada y 4
mejoras de producto adicionales.

## Alcance autorizado

- `whatsapp-bridge/index.js`, `whatsapp-bridge/estado.json` (si aplica),
  `whatsapp-bridge/alertas.json` (nuevo)
- `server/src/routes/mcp.js`
- `server/src/routes/integracionesWhatsApp.js`
- `server/src/lib/salud.js`
- Documento de seguimiento (este archivo)

Explícitamente fuera de alcance: `server/prisma/schema.prisma` (ninguna
migración), cualquier otro archivo, reiniciar servicios, hacer push o tocar
`main`.

## Checklist

- [x] 0. Documento de seguimiento creado (este archivo).
- [ ] 1. Guard de sesión desconectada en `whatsapp-bridge/index.js` — estado
      persistente en `alertas.json`, notifica al caer, re-notifica cada 12h
      mientras siga caída, limpia el flag al recuperarse.
- [ ] 2. Indicador de sincronización estancada — cálculo on-demand
      (`ok`/`revisar`/`sin_datos`) por grupo, basado en `MAX(fechaMensaje)`
      vs. 48h, consumido por la tool de la tarea 4.
- [ ] 3. Alerta automática visible — endpoint `POST
      /api/integraciones/whatsapp/alerta` en `integracionesWhatsApp.js` que
      crea una nota interna (mismo mecanismo que `nota_interna`:
      `prisma.logEntry.create` + `emitirCambio`) en los proyectos afectados;
      el bridge lo llama al detectar la sesión caída.
- [ ] 4. Tool MCP `listar_grupos_whatsapp` en `mcp.js` — grupos vinculados al
      proyecto con último mensaje y estado (tarea 2).
- [ ] 5. Tool MCP `vincular_grupo_whatsapp` en `mcp.js` — vincula/desvincula
      un grupo sin mandar la lista completa de `infoClave.grupos[]`.
- [ ] 6. Filtro opcional `grupo` en `ver_mensajes_whatsapp`.
- [ ] 7. `ultimaActividad()` en `salud.js` considera mensajes de WhatsApp;
      `ver_salud_proyectos` incluye `mensajesWhatsapp` en su query.

## Criterios de aceptación

- Cada tarea cierra con `node --check` limpio en los archivos `.js` que
  tocó y un commit Conventional Commits en español.
- `npx prisma validate` sigue pasando sin tocar el schema.
- Sin filtro por JID (no existe ese campo en el modelo — ver limitaciones).
- Sin servicios reales tocados, sin push, sin cambios a `main`.

## Notas / limitaciones conocidas

- No existe campo JID persistido en `MensajeWhatsApp` — el filtro de la
  tarea 6 se implementa solo por nombre de grupo (`grupo`), tal como lo
  autorizó el pedido original ante la ausencia de ese campo.
- `ver_proyecto` también llama `calcularSalud()` pero su propio
  `getProyecto()` no incluye `mensajesWhatsapp` — fuera del alcance
  explícito de la tarea 7 (que solo pedía tocar la query de
  `ver_salud_proyectos`); se deja así a propósito.

## Progreso y commits

(se completa a medida que avanza cada tarea)
