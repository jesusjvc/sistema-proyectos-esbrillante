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

- [x] 0. Documento de seguimiento creado (este archivo). Commit `52ba097`.
- [x] 1. Guard de sesión desconectada en `whatsapp-bridge/index.js` — estado
      persistente en `alertas.json` (runtime, no commiteado, igual que
      `estado.json`), notifica al caer, re-notifica cada 12h mientras siga
      caída, limpia el flag al recuperarse. Commit `ff3480f`.
- [x] 2. Indicador de sincronización estancada — cálculo on-demand
      (`ok`/`revisar`/`sin_datos`) por grupo vía `estadoGrupoWhatsapp()` en
      `mcp.js`, basado en el último `fechaMensaje` vs. 48h. Commit `17707dd`.
- [x] 3. Alerta automática visible — endpoint `POST
      /api/integraciones/whatsapp/alerta` en `integracionesWhatsApp.js` que
      crea una nota interna (mismo mecanismo que `nota_interna`:
      `prisma.logEntry.create` + `emitirCambio`) en los proyectos afectados;
      el bridge lo llama al detectar la sesión caída. Commit `40cfa29`.
- [x] 4. Tool MCP `listar_grupos_whatsapp` en `mcp.js` — grupos vinculados al
      proyecto con último mensaje y estado (tarea 2). Commit `17707dd`.
- [x] 5. Tool MCP `vincular_grupo_whatsapp` en `mcp.js` — vincula/desvincula
      un grupo sin mandar la lista completa de `infoClave.grupos[]`.
      Commit `17707dd`.
- [x] 6. Filtro opcional `grupo` en `ver_mensajes_whatsapp`. Commit `17707dd`.
- [x] 7. `ultimaActividad()` en `salud.js` considera mensajes de WhatsApp;
      `ver_salud_proyectos` incluye `mensajesWhatsapp` en su query.
      Commit `87c714e`.

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

Todas las tareas (0-7) completadas en `feature/whatsapp-sync-guard-mcp`:

1. `52ba097` — docs: plan de tareas para guard de sincronización whatsapp
2. `ff3480f` — feat: guard de sesión de WhatsApp desconectada en el puente
3. `40cfa29` — feat: endpoint de alerta automática de sincronización de whatsapp
4. `87c714e` — feat: considerar mensajes de whatsapp como señal de actividad en salud de proyectos
5. `17707dd` — feat: tools MCP para listar, vincular y filtrar grupos de whatsapp
   (incluye un fix incidental de consistencia en `solicitar_al_cliente`,
   detectado por el hook de revisión del repo — ver reporte final)

Verificación: `node --check` limpio en los 4 archivos `.js` tocados y
`npx prisma validate` sin tocar el schema (ver reporte final de la sesión).
