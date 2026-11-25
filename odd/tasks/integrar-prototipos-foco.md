# Integrar la herramienta de prototipos dentro de Foco

## Objetivo

Migrar `esbrillante-pages-mcp` (hoy servicio independiente en
`/home/jesusjvc/Proyectos Web/mcp-prototipos/esbrillante-pages-mcp`, desplegado
aparte en Coolify bajo `prototipos.esbrillante.mx`) para que viva dentro del
backend de Foco (`server/`), compartiendo su base de datos (Postgres/Prisma) y
su sesión real de usuario. El dominio público `prototipos.esbrillante.mx` se
mantiene — pasa a apuntar al servicio de Foco en Coolify (decisión del
usuario, opción 1 de las dos evaluadas).

## Problema / por qué

- Hoy la identidad de "equipo" al dejar un comentario viaja como query params
  planos (`?rol=equipo&nombre=X`) que arma Foco al copiar el link
  (`src/pages/Prototipos.jsx:54-58`). Ese nombre queda congelado en el link: si
  se comparte o se reabre después, el comentario queda atribuido a quien
  generó el link, no a quien realmente lo usa.
- `resources/revision.js` resuelve y cachea esa identidad 100% client-side
  (`localStorage` bajo `esbrillante_revisor_nombre`, scoped al dominio de
  esbrillante-pages) — no hay forma de que dependa de la sesión real de Foco
  mientras viva en otro dominio/servicio.
- Hallazgo adicional durante la exploración: los endpoints
  `/api/anotaciones/*` y `/p/:slug/finalizar-revision` del servicio viejo no
  tienen ninguna autenticación — cualquiera con el link puede crear/editar/
  borrar comentarios ajenos o cerrar la revisión.
- Dos repos/infraestructuras separadas (Coolify aparte, su propio Dockerfile,
  su propio modelo de persistencia en archivos JSON) para algo que es
  conceptualmente parte del mismo producto.

## Decisión de arquitectura confirmada

La cookie de sesión de Foco (`server/src/lib/jwt.js:13-19`, `token`, sin
`domain` explícito) queda atada al dominio donde corre el **backend**, no al
del frontend React. Por eso la ruta pública `/p/:slug` y el widget deben vivir
servidos por el mismo Express de Foco (`server/src/app.js`), no por el SPA —
así, si hay sesión de Foco activa, se resuelve sola; si no (cliente externo
sin cuenta), se mantiene el flujo actual de preguntar el nombre una vez.

## Alcance autorizado

- `server/prisma/schema.prisma` (+ migración) — nuevos modelos `Prototipo` y
  `Anotacion`.
- `server/src/lib/` — nuevos servicios (reemplazo de `pageService.ts` /
  `anotacionService.ts` del repo viejo, sobre Prisma en vez de archivos JSON).
- `server/src/routes/prototipos.js` (ya existe) y nuevo router público para
  `/p/:slug*` y `/api/anotaciones/*` + SSE.
- `server/src/routes/mcp.js` — las 6 tools de prototipos dejan de llamar a
  `pagesMcpClient` (HTTP al servicio externo) y usan los servicios locales,
  agregando el mismo `logEntry` de auditoría que ya se agregó hoy a
  `resolver_comentario_prototipo`.
- Assets estáticos del widget (adaptado de `resources/revision.js` del repo
  viejo) servidos desde Foco.
- `src/pages/Prototipos.jsx` / `src/components/PrototiposPanel.jsx` — quitar
  el armado de `?rol=&nombre=` en el link copiable.
- Script de migración de datos (58 páginas + anotaciones existentes) desde el
  servicio viejo hacia Postgres.
- Documento de seguimiento (este archivo).

Explícitamente fuera de alcance hasta el corte final (tarea 10): apagar o
borrar nada del repo/servicio `esbrillante-pages-mcp`, ni tocar su Coolify. El
servicio viejo sigue sirviendo tráfico hasta que la migración esté verificada.
Cambiar el dominio en Coolify (tarea 9) es un paso manual del usuario, igual
que el volumen de anotaciones de la sesión anterior.

## Checklist

- [x] 0. Documento de seguimiento creado (este archivo). Commit `87c7695`.
- [x] 1. Schema Prisma: modelos `Prototipo` (slug, tipo, estado, html/urlExterna,
      proyectoId opcional) y `Anotacion` (prototipoId, autor, rol, estado,
      contenido) + migración `20261105184129_add_prototipos_anotaciones`.
      Validada localmente contra un Postgres de desarrollo aparte (contenedor
      Docker `foco-dev-db`, puerto 5433 — no toca la base real). `npx prisma
      validate` y `migrate deploy` limpios, cliente regenerado. Commit
      `901ecd3`.
- [x] 2. Servicios backend `server/src/lib/prototipoService.js` y
      `anotacionService.js` — CRUD sobre Prisma, mismo contrato de datos que
      el servicio viejo. Cierra los dos hallazgos de la review de la tarea 1:
      `@@unique([prototipoId, numero])` + retry en `crearAnotacion`, y CHECK
      constraint en la migración para html/urlExterna. Probado manualmente
      contra `foco_dev` (18 casos, incluida concurrencia). Commits `f1c132c`
      y `aa5b184` (este último arregla la misma condición de carrera en
      `nueva_version`, señalada por el hook de pre-commit).

      Review de Gentle AI sobre la tarea completa encontró 7 hallazgos no
      bloqueantes (3 WARNING, 4 SUGGESTION); se cerraron todos: validación
      explícita de `accion`/`estado` contra sus enums documentados,
      `finalizarRevisionCliente` ya no confunde cualquier error con "no
      existe" (solo P2025), merge atómico de `contenido` vía `jsonb ||` en
      vez de read-modify-write (mismo riesgo de lost-update que `numero`,
      ahora en otro campo), `tipo` se corrige al reemplazar una página antes
      externa, y los choques de unicidad en el primer publish/registro
      externo dan un mensaje claro en vez de un error crudo de Prisma.
      Commits `613924d` y `131a31b` (este último cierra un hueco adicional
      que el propio hook señaló: `estado: ''` se colaba por el `COALESCE`).
- [x] 3. Resolución de identidad: `server/src/lib/identidadRevisor.js`,
      `resolverIdentidadRevisor(req)` — lee la cookie `token` de `requireAuth`;
      devuelve `{userId, nombre, rol:'equipo'}` si hay sesión de staff activa,
      `null` en cualquier otro caso (sin cookie, inválida, expirada, o de un
      cliente). Probado sin DB: 5 casos (sin cookie, admin, equipo, token de
      cliente, token inválido/expirado). Commit `02de73a`.

      Review de Gentle AI sobre el acumulado encontró 6 hallazgos no
      bloqueantes (2 WARNING, 4 SUGGESTION). Se cerraron 4: contenido no-objeto
      rechazado en `actualizarAnotacion`, `nombre` validado antes de slugificar,
      TOCTOU de borrado concurrente en `reemplazar`/`eliminarPrototipo` con
      mensaje claro, y `validarSlug` quitado de `eliminarPrototipo` (operaba
      sobre un slug ya existente, no uno derivado de un nombre). Commit
      `1e8f071`. Dos quedan sin abordar a propósito:
      - **Falta de test automatizado repetible**: este repo no tiene test
        runner — la verificación es manual, por convención explícita del
        proyecto (ver AGENTS.md). Los scripts de verificación quedan en el
        scratchpad de la sesión, no en el repo.
      - **`identidadRevisor` no revalida `User.activo` contra la DB**:
        coherente con `requireAuth`, que tampoco lo hace en ningún otro lado
        del sistema — cambiarlo acá rompería esa consistencia y agregaría una
        dependencia de DB a una función hoy pura.
- [x] 4. Router público nuevo (`/p/:slug`, `/p/:slug/download`,
      `/p/:slug/finalizar-revision`, `/api/anotaciones/:slug` +
      `/eventos` SSE, POST/PATCH/DELETE de anotaciones) — sirve el HTML e
      inyecta el widget, igual que `httpServer.ts` del servicio viejo.
      Nuevo `server/src/routes/prototiposPublico.js`, montado sin prefijo en
      `app.js` junto con `/resources` estático. Porta también
      `externalProxy.js` (con el fix de cookie jar ya confirmado en
      producción), `assetVersion.js`, y agrega el canal
      `cambio-anotaciones`/`suscribirseAnotaciones` en `eventos.js` para el
      SSE. La identidad de quien escribe (`identidadDe`) se resuelve de la
      sesión real vía `resolverIdentidadRevisor`; sin sesión, cae al body
      (flujo de cliente externo sin cambios). `auditar()` recibe el `autor`
      ya resuelto como parámetro — se evitó un lookup innecesario a
      `prisma.user` porque el JWT ya trae el nombre. `logEntry` se movió de
      `mcp.js` a `lib/logEntry.js` para reutilizarlo acá. Probado end-to-end
      con un script en el scratchpad de la sesión (14 aserciones: servir
      HTML local, descarga, anotación de cliente vs. staff con identidad
      real ignorando el body, listar/editar/borrar, auditoría con y sin
      proyecto asignado, finalizar-revisión, SSE) — manual, por convención
      del proyecto (sin test runner). Commit `edad951`.
- [x] 5. `server/src/routes/prototipos.js` (admin: listar/publicar/reasignar/
      eliminar) apuntando a los servicios locales en vez de `pagesMcpClient`.
      Responde el mismo formato `PageMeta` del servicio viejo (`nombre_original`,
      `url`, `archivo`, `fecha_actualizacion`, `proyectoSlug`...) para no tocar
      el frontend todavía. `proyectoSlug` se traduce a `proyectoId` (404 si no
      existe). Escrituras de staff con proyecto asignado quedan en `LogEntry`.
      Se mantiene `notificar-revision` (server-to-server) mientras el servicio
      viejo siga vivo. Extras dentro del alcance: el listado ya no carga el
      `html` de cada página; `registrarPaginaExterna` valida http(s) (una URL
      inválida hacía reventar el proxy de sub-páginas); links compartibles con
      `PROTOTIPOS_PUBLIC_URL` (nueva en `.env.example`).
      **Regresión de la tarea 4 corregida:** "Terminar revisión" ya no avisaba
      por correo/Chat al responsable — `notificarRevisionTerminada` se movió a
      `lib/notificarRevision.js` y se llama sin `await` desde el router público.
      Probado: 21 aserciones del router admin + las 14 de la tarea 4 como
      regresión (SSE endurecido: ahora exige el evento con el slug) + dominio
      público con la variable definida. Commit `eebb8f1`.
      Review de Gentle Guardian Angel: PASSED con 2 hallazgos. Cerrado el
      escape HTML del correo (commit `0f19607`). Descartado con evidencia:
      "falta `include: { cliente: true }`" — `Proyecto.cliente` es columna
      `Json`, Prisma la devuelve sin include, y con include lanza "include
      statements only accept relation fields".
      **Orden de despliegue:** esta rama no se puede desplegar a medias — con
      la tarea 5 en producción y sin la 9 (migración de datos), el listado
      admin saldría vacío porque las 58 páginas siguen en el servicio viejo.
- [x] 6. Widget: adaptar `resources/revision.js` para preguntar primero
      "¿quién soy?" al backend de Foco (nueva ruta que devuelve la sesión si
      existe) antes de caer al modal/localStorage actual.
      **Premisa corregida:** la cookie `token` es host-only en
      `api-proyectos.esbrillante.mx`, así que nunca llegaba a las páginas en
      `prototipos.esbrillante.mx` — la identidad por sesión de las tareas 3-4
      no habría funcionado en producción. Decisión del usuario (2026-11-24):
      el widget habla con el host del API, no `Domain=.esbrillante.mx` (eso
      habría dado al HTML arbitrario de los prototipos acceso a todo el API
      con la sesión del staff).
      Implementado: el `<script>` del widget se inyecta desde `API_PUBLIC_URL`
      (el widget ya derivaba `API_BASE` de su `src`); nueva ruta
      `GET /api/prototipos/yo`; escrituras con `credentials:'include'`; CORS
      al dominio de prototipos solo en `/api/anotaciones`,
      `/api/prototipos/yo` y `/p/:slug/finalizar-revision`, montado antes del
      CORS global. **Hueco de seguridad cerrado:** `/p/*` (GET) solo se sirve
      en `PROTOTIPOS_PUBLIC_URL`; desde el host del API redirige — si no, el
      HTML de un prototipo corría en el mismo origen que todo el API con la
      cookie de staff. Con sesión, el nombre no se guarda en localStorage.
      Probado: regresión de tareas 4-5 (35 aserciones) con config por
      defecto; 12 aserciones de dos dominios con curl (redirect, CORS
      acotado — `/api/proyectos` NO se abre —, identidad real, SSE); y
      navegador real: sin sesión aparece el modal; con sesión entra como
      equipo sin modal, el comentario queda con el nombre real aunque el
      body diga otro, `/api/proyectos` bloqueado por CORS desde la página, y
      tras logout vuelve el modal. Nota de prueba: con `api.localhost` vs
      `prototipos.localhost` la cookie NO viaja porque Chrome los trata como
      sitios distintos; se validó con `localhost:3096`/`:3097` (mismo sitio,
      distinto origen), equivalente a `*.esbrillante.mx` en producción.
      Commits `23bde84`, `96b83c6` (comentarios que apuntaban a `httpServer.ts`,
      sugerencia de la review). Review: PASSED.
      **Para el corte (tarea 10):** definir en Coolify `PROTOTIPOS_PUBLIC_URL`
      y `API_PUBLIC_URL` en el backend.
- [x] 7. `server/src/routes/mcp.js`: las 6 tools de prototipos
      (`pages_publicar_pagina`, `pages_listar_paginas`, `pages_eliminar_pagina`,
      `anotaciones_crear`, `anotaciones_listar`, `anotaciones_resolver`) usan
      los servicios locales + `logEntry` de auditoría en cada escritura.
      Aclaración: Foco solo tenía 3 tools (los equivalentes de listar, ver
      comentarios y resolver); las 6 nombradas arriba son las del MCP viejo.
      Se migraron las 3 existentes a los servicios locales y se agregaron
      `publicar_prototipo`, `eliminar_prototipo` y `comentar_prototipo` con el
      estilo de nombres de Foco, para que las 6 capacidades sigan existiendo
      tras el corte. `comentar_prototipo` firma con la identidad del MCP (sin
      `autor` libre); `resolver_comentario_prototipo` acepta `anotacionIds`.
      Toda escritura audita en `LogEntry` (el plan decía que `resolver` ya lo
      hacía — no era así) y avisa por SSE a los widgets abiertos.
      `reemplazar` ahora asigna el proyecto dentro del servicio. Eliminado
      `pagesMcpClient.js` y `PAGES_MCP_*`. Probado vía JSON-RPC real contra
      `/mcp`: 34 aserciones + regresión de tareas 4-6. Commit `2c8b205`.
      Review PASSED con 2 notas: (1) `PATCH /api/prototipos/:slug` reasignaba
      el proyecto aunque el estado fuera inválido — corregido con RED/GREEN
      observado, commit `dcc61ed`; (2) "`crear_ticket` llama al CRM sin
      try/catch" — falso positivo, ya está protegido en
      `server/src/lib/resolverCliente.js:34`.
      **Para el corte:** los conectores que hoy usan el MCP viejo
      (`pages_*`/`anotaciones_*` en prototipos.esbrillante.mx/mcp) deben
      pasarse al MCP de Foco; las skills que nombren esas tools, actualizarse.
- [x] 8. Frontend: `Prototipos.jsx`/`PrototiposPanel.jsx` — el botón "copiar"
      ya no arma `?rol=&nombre=`, copia la URL limpia.
      No había botón de copiar explícito: el link con `?rol=equipo&nombre=`
      era el del botón "Ver" (`urlEquipo`), que es el que se abría o se
      copiaba. Ahora es `p.url` tal cual; se quitó `useAuth` del panel (ya no
      se usaba). Probado en navegador con backend + Vite locales: el link de
      "Ver" sale limpio, la lista viene del backend local, y al abrirlo el
      widget entra como equipo sin pedir nombre. `vite build` OK. El panel
      dentro del detalle de proyecto tiene el mismo cambio, verificado solo
      por build (no se abrió en navegador). Commit `15ab705`. Review: PASSED.
- [x] 9. Script de migración de datos (58 páginas + anotaciones) desde el
      servicio viejo hacia las tablas nuevas — dry-run primero, confirmación
      antes de escribir.
      `server/src/scripts/migrarPrototipos.js` (`npm run db:migrar-prototipos`).
      Lee por la API HTTP del servicio viejo (`/api/prototipos` con
      `PAGES_MCP_API_KEY`, `/p/:slug/download`, `/api/anotaciones/:slug`) — no
      necesita acceso al volumen. Sin `--aplicar` es dry-run. Re-ejecutable:
      upsert por slug y por id, nunca borra lo que existe solo en Foco.
      Hallazgo: el widget viejo calculaba `numero` en el navegador y el
      servicio no validaba nada, así que puede haber números repetidos o
      anotaciones sin id; se renumeran al siguiente libre (respetando también
      los números de anotaciones creadas solo en Foco) y el reporte lo avisa.
      Probado contra el servicio viejo levantado en local con datos en el
      scratchpad: 23 aserciones (dry-run no escribe, HTML byte a byte, fechas
      e ids conservados, externa sin HTML, proyecto faltante, renumeración,
      convergencia en re-corridas, choque con números de Foco, sin API key).
      Commits `f957b9e`, `ac440a5` (2 hallazgos de review cerrados, el
      choque con RED/GREEN observado). **La corrida en producción es parte
      del corte (tarea 10).**
- [x] 10. Corte: usuario agrega `prototipos.esbrillante.mx` como dominio
      adicional al servicio de Foco en Coolify; verificación en producción;
      solo después se pausa (no se borra todavía) `esbrillante-pages-mcp`.
      Hecho el 2026-11-24. Los pasos en Coolify los ejecutó la sesión
      `cuentas-esbrillante` (tiene el token; esta sesión no), con la
      autorización del usuario en cada uno:
      variables de entorno; merge del #18 (`7815bba`, deploy ~90 s);
      migración vía tareas programadas de Coolify (no hay endpoint de exec):
      dry-run y luego `--aplicar` → 62 páginas, 2 anotaciones, 0 errores;
      dominio quitado de la app vieja y agregado a `proyectos-backend`
      (fqdn `https://api-proyectos.esbrillante.mx,https://prototipos.esbrillante.mx`).
      Ambas apps están en el mismo servidor, así que no hubo cambio de DNS.
      Verificación pública desde esta sesión: páginas HTML y externas, widget
      desde api-proyectos, comentarios migrados, redirect de `/p` en el host
      del API, CORS acotado (`/api/proyectos` cerrado), SSE y certificado.
      Verificación con sesión, hecha por el usuario: "Todo ok".
      `esbrillante-pages-mcp` se detiene (no se borra), y su volumen queda
      como respaldo de los datos originales.
      Conectores MCP: el conector viejo `Esbrillante Prototipos`
      (prototipos.esbrillante.mx/mcp, que ahora contesta Foco y pide
      reautenticar) se desactiva y no se vuelve a autenticar, porque duplicaría
      las tools de Foco. Sus 6 capacidades viven en `esbrillante-seguimiento`
      (`publicar_prototipo`, `listar_prototipos`, `eliminar_prototipo`,
      `comentar_prototipo`, `ver_comentarios_prototipo`,
      `resolver_comentario_prototipo`). Los clientes ya conectados deben
      reconectar `esbrillante-seguimiento` para ver la lista de tools nueva,
      porque guardan la que recibieron al conectarse.

## Entrega

Estrategia (decisión del usuario, 2026-11-24): cadena con PR rastreador. La
rama no puede llegar a `main` por partes porque Coolify despliega desde ahí.

| PR | Rama | Commits (hasta) | Tareas |
|----|------|-----------------|--------|
| #18 | `feature/integrar-prototipos-foco` (rastreador, borrador → `main`) | `87c7695` | 0 |
| #19 | `…-01-schema` | `ce27dac` | 1 |
| #20 | `…-02-servicios` | `756abea` | 2-3 |
| #21 | `…-03-router-publico` | `e338762` | 4 (size:exception: assets copiados) |
| #22 | `…-04-router-admin` | `8967438` | 5 |
| #23 | `…-05-widget-sesion` | `643a1b0` | 6 |
| #24 | `…-06-tools-mcp` | `4a2ecda` | 7 |
| #25 | `…-07-migracion` | este documento | 8-9 |

Fusionar los hijos en orden, sin squash; el rastreador se fusiona a `main`
solo al final, justo antes del corte.

## Runbook del corte (tarea 10)

Pasos manuales en Coolify, en este orden. Merge, deploy y cambios de dominio
son decisiones del usuario.

1. **Variables del backend de Foco** — ✅ hechas el 2026-11-24 (vía la
   sesión `cuentas-esbrillante`, API de Coolify):
   `PROTOTIPOS_PUBLIC_URL=https://prototipos.esbrillante.mx` y
   `API_PUBLIC_URL=https://api-proyectos.esbrillante.mx` creadas;
   `PAGES_MCP_API_KEY` ya existía y coincide con la `API_KEY` del viejo;
   `PAGES_MCP_URL` se queda en `https://prototipos.esbrillante.mx`.
   La app vieja no tiene otro dominio que responda (su único fqdn es
   prototipos.esbrillante.mx; el sslip.io no está ruteado; sin puertos
   expuestos). Decisión del usuario (2026-11-24): no exponerla, y migrar
   **antes** de mover el dominio, sin re-corrida posterior.
2. **Merge del rastreador #18 y deploy** (backend corre la migración de
   Prisma al arrancar). Desde aquí el listado de prototipos en Foco sale de
   Postgres: vacío hasta el paso 4, así que hacer 3-5 de inmediato y seguido.
3. **Dry-run** en la terminal del contenedor del backend:
   `npm run db:migrar-prototipos`. Revisar errores y avisos.
4. **Aplicar:** `npm run db:migrar-prototipos -- --aplicar`.
5. **Mover el dominio** `prototipos.esbrillante.mx` del servicio viejo al
   backend de Foco **justo después** del paso 4. Lo que se comente en el
   viejo entre el 4 y el 5 no se migra (riesgo aceptado: minutos).
   Después del paso 5 el script ya no sirve: `PAGES_MCP_URL` apunta a Foco,
   cuyo `/api/prototipos` exige sesión, así que el script aborta con 401
   sin escribir nada (falla ruidosa, no corrompe). Los datos del viejo
   siguen en su volumen si hiciera falta recuperar algo.
6. **Verificar en producción:** abrir 2-3 prototipos (uno HTML, uno externo
   con sub-páginas); comentar en incógnito (pide nombre) y con sesión de Foco
   (entra como equipo sin preguntar); "Terminar revisión" manda el correo;
   la lista admin muestra las 58 páginas con sus comentarios.
7. **Conectores MCP:** pasar los que usan el MCP viejo
   (`pages_*`/`anotaciones_*`) al MCP de Foco.
8. Solo después de verificar: **pausar** (no borrar) `esbrillante-pages-mcp`.

## Criterios de aceptación

- Cada tarea cierra con su propio commit (Conventional Commits, español) en
  una rama de feature — nunca directo a `main`.
- `npx prisma validate` limpio tras la tarea 1; `node --check` en cada archivo
  `.js` tocado.
- El flujo de cliente externo (sin cuenta Foco) sigue funcionando exactamente
  igual que hoy: pide el nombre una vez, sin login.
- Ningún endpoint de escritura de anotaciones queda sin poder auditarse — toda
  acción de equipo con sesión real queda en `LogEntry` del proyecto.
- El servicio viejo sigue arriba y sirviendo tráfico hasta que la tarea 10 se
  verifique explícitamente con el usuario.

## Notas

- Tamaño de referencia del sistema a portar (mapeado antes de empezar):
  ~2359 líneas TS de servidor + ~1930 líneas JS de widget, 11 endpoints HTTP,
  6 tools MCP, sin base de datos (todo en archivos JSON hoy).
- Evaluamos antes un parche más chico (token firmado en vez de nombre plano)
  pero no resuelve el caso de raíz — el usuario decidió ir por la integración
  completa.
