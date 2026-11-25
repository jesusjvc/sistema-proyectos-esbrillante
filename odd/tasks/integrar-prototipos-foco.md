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
- [ ] 2. Servicios backend `server/src/lib/prototipoService.js` y
      `anotacionService.js` — CRUD sobre Prisma, mismo contrato de datos que
      el servicio viejo (para no romper el widget más de lo necesario).
- [ ] 3. Resolución de identidad: helper que, dado un request, devuelve
      `{ nombre, rol }` — si hay cookie `token` de Foco válida usa esa sesión
      real; si no, null (el widget cae al flujo de pedir nombre, como hoy).
- [ ] 4. Router público nuevo (`/p/:slug`, `/p/:slug/download`,
      `/p/:slug/finalizar-revision`, `/api/anotaciones/:slug` +
      `/eventos` SSE, POST/PATCH/DELETE de anotaciones) — sirve el HTML e
      inyecta el widget, igual que `httpServer.ts` del servicio viejo.
- [ ] 5. `server/src/routes/prototipos.js` (admin: listar/publicar/reasignar/
      eliminar) apuntando a los servicios locales en vez de `pagesMcpClient`.
- [ ] 6. Widget: adaptar `resources/revision.js` para preguntar primero
      "¿quién soy?" al backend de Foco (nueva ruta que devuelve la sesión si
      existe) antes de caer al modal/localStorage actual.
- [ ] 7. `server/src/routes/mcp.js`: las 6 tools de prototipos
      (`pages_publicar_pagina`, `pages_listar_paginas`, `pages_eliminar_pagina`,
      `anotaciones_crear`, `anotaciones_listar`, `anotaciones_resolver`) usan
      los servicios locales + `logEntry` de auditoría en cada escritura.
- [ ] 8. Frontend: `Prototipos.jsx`/`PrototiposPanel.jsx` — el botón "copiar"
      ya no arma `?rol=&nombre=`, copia la URL limpia.
- [ ] 9. Script de migración de datos (58 páginas + anotaciones) desde el
      servicio viejo hacia las tablas nuevas — dry-run primero, confirmación
      antes de escribir.
- [ ] 10. Corte: usuario agrega `prototipos.esbrillante.mx` como dominio
      adicional al servicio de Foco en Coolify; verificación en producción;
      solo después se pausa (no se borra todavía) `esbrillante-pages-mcp`.

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
