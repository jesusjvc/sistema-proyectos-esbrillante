# Foco — Gestión de actividades (funcionamiento actual)

Este documento describe cómo funciona hoy el núcleo del sistema: la gestión
de **actividades (tareas)** dentro de un proyecto. Los módulos secundarios
(usuarios/equipo, prototipos, branding, Drive) se mencionan solo de pasada al
final, para tener el mapa completo sin diluir el enfoque.

Generado a partir de una lectura directa del código (no de la documentación
existente, que puede estar desactualizada) el 2026-09-04.

---

## 1. El objeto central: la Tarea

Todo gira alrededor del modelo `Tarea` (`server/prisma/schema.prisma`). Campos
relevantes para el ciclo de vida de una actividad:

| Campo | Qué es |
|---|---|
| `fase` | Número de fase (solo tiene sentido en proyectos "finito"; en "continuo" todo vive en fase 1) |
| `orden` | Float — posición dentro de su fase o columna. Ver §5 |
| `estado` | `pendiente` \| `en_proceso` \| `revision` \| `completada` \| `omitida` — el estado *real*, persistido |
| `responsable` | String libre: un rol (`equipo`, `copy`, `disenador`, `programador`, `admin`, `karla`, `cliente`) o el `userId` de una persona asignada directamente |
| `dependencias` | Array de IDs de otras tareas que deben estar `completada` antes de poder operar esta |
| `esCliente` | Si es `true`, es una actividad que le toca *al cliente*, no al equipo |
| `custom` | Si la tarea fue agregada manualmente (no vino de una plantilla) — solo las `custom` se pueden eliminar |
| `plazoHoras` / `disponibleDesde` | Ventana de tiempo sugerida para una tarea de cliente, usada para recordatorios (§7) |
| `esRutaCritica`, `soloAdmin`, `soloKarlaOAdmin`, `opcional` | Flags de comportamiento/visibilidad |

Una tarea pertenece siempre a un `Proyecto`, y un proyecto es de uno de dos
**tipos**, que cambian por completo cómo se organizan sus tareas:

- **`finito`** — proyecto con entregable final (ej. un sitio web). Las tareas
  se agrupan por **fase** (Arranque, Contenido y Boceto, Diseño, Config
  Técnica, Revisión Interna, Revisión Cliente, Entrega — `src/data/paquetes.js`).
- **`continuo`** — servicio recurrente sin fin definido (ej. mantenimiento
  mensual). Las tareas viven en un **tablero Kanban** con 4 columnas fijas
  (`server/src/lib/kanban.js`): Todo → Doing → Revisión → Done, mapeadas 1:1
  al campo `estado` (`pendiente` → `en_proceso` → `revision` → `completada`).
  `fase` no se usa para nada aquí.

## 2. Ciclo de vida de una tarea

### Estado real (persistido)

```
pendiente ──iniciar──> en_proceso ──completar──> completada
    │                       │                        │
    │                       └──(kanban: mover)──> revision ──> completada
    │
    └──omitir──> omitida
```

- `completar_actividad`/`completar` puede saltar directo de `pendiente` a
  `completada` (no obliga a pasar por `en_proceso` primero) — útil para
  registrar algo que ya se hizo.
- `reabrir` devuelve una tarea completada a `pendiente`, limpiando
  `completadaPor`/`completadaEn`/`asignadoA`.
- `omitir` es un estado terminal alternativo a completar (para tareas que
  dejaron de aplicar) — no se borra el registro, solo se archiva.
- Solo las tareas `custom` se pueden **eliminar** de verdad; el resto son
  parte de la plantilla del paquete contratado.

### Estado calculado (solo para mostrar, en vista por fases)

`DetalleProyecto.jsx` (`estadoCalculado`) deriva un estado *visual* adicional
que no se guarda en DB, para que el equipo vea de un vistazo qué puede hacer:

| Estado calculado | Condición |
|---|---|
| `completada` / `omitida` / `en_proceso` | Igual al estado real |
| `bloqueada_dependencia` | Tiene dependencias sin completar — no se puede iniciar ni completar |
| `bloqueada_cliente` | Sus dependencias ya están resueltas, pero es una tarea `esCliente` → le toca al cliente actuar, no al equipo |
| `disponible` | Dependencias resueltas, no es del cliente → el equipo ya puede trabajarla |

Este cálculo se repite (con la misma lógica) del lado del servidor como
defensa en profundidad: `dependenciasResueltas()` en
`server/src/routes/tareas.js` bloquea `iniciar`/`completar` por API aunque el
frontend no lo hubiera impedido.

## 3. Dependencias

- Se guardan como array de IDs en `Tarea.dependencias`.
- Se editan desde el modal de la tarea (`SelectorDependencias.jsx`), eligiendo
  entre las demás tareas del proyecto.
- **No hay validación de ciclos** en ningún punto del código (ni al crear, ni
  al editar): si A depende de B y B depende de A, ambas quedarían bloqueadas
  para siempre sin ningún aviso. Ver §9.
- Al editar dependencias (`PUT /tareas/:id`) sí se valida que los IDs
  referenciados existan en el proyecto y que una tarea no dependa de sí
  misma.

## 4. Responsable y permisos

`responsable` es un string que se interpreta en cascada
(`server/src/lib/permisos.js`, duplicado sin importar en el frontend porque
back y front se despliegan por separado):

1. `admin` / `cliente` → nadie del equipo puede operarla (excepto un admin real).
2. `karla` → solo el usuario marcado `esKarla`.
3. `equipo` / `copy` / `disenador` / `programador` → se resuelve contra
   `proyecto.equipo` (quién ocupa ese rol en *este* proyecto específico).
4. Cualquier otro valor → se interpreta como el `userId` de una persona
   asignada **directamente** a la tarea (asignación fuera del rol de equipo).

`tareaLeCorresponde(tarea, equipo, user)` es la función que decide si el
usuario logueado puede iniciar/completar/mover esa tarea — un ADMIN puede
operar cualquier tarea de cualquier proyecto; el resto solo las que le
correspondan por rol o asignación directa. Este chequeo se aplica en **todas**
las rutas de escritura sobre tareas y también en las MCP tools.

El selector "Responsable" en la UI solo ofrece a las personas que ya están en
`proyecto.equipo` (Copy/Diseñador/Programador/AdminProyecto de ese proyecto en
particular), no a todos los usuarios del sistema — así se evita asignar una
tarea a alguien que después el propio sistema no le va a dejar operar.

## 5. Orden y reordenamiento

El campo `orden` es un **float**, no un índice entero. Insertar una tarea en
una posición específica no reordena a las demás — se calcula como el punto
medio entre sus dos vecinas (`server/src/lib/orden.js`:
`ordenAntesDe`/`ordenDespuesDe`/`ordenAlFinal`). Esto permite:

- Insertar en cualquier punto sin tocar el resto de las filas.
- Dos endpoints separados según el tipo de proyecto:
  - `POST /tareas/:id/mover` — cambia de **columna Kanban** (`estado`) y/o de
    posición, para proyectos `continuo`.
  - `POST /tareas/:id/reordenar` — cambia solo de **posición dentro de la
    misma fase**, sin tocar `estado`, para proyectos `finito`.
- En la UI, ambos se manejan con `@dnd-kit` (arrastrar y soltar): el tablero
  Kanban (`KanbanBoard.jsx`) y, más recientemente, la lista de tareas por fase
  (`DetalleProyecto.jsx` → `FaseTareasArrastrables`).

## 6. Tareas del cliente (`esCliente: true`)

Un subconjunto de tareas no le toca al equipo sino al cliente — por ejemplo
"Enviar el logo en alta resolución". Su ciclo es distinto:

1. Nace con `estado: pendiente` y `disponibleDesde: null`.
2. Cuando sus dependencias se completan, `activarTareasClienteDisponibles()`
   (se llama después de cualquier `completar`/`mover`/`editar`) le pone
   `disponibleDesde = ahora` — desde ahí empieza a correr `plazoHoras`.
3. El cliente la ve y la responde directo desde su portal
   (`POST /api/cliente/:slug/tareas/:id/completar`) con texto y/o un archivo
   (sube a Drive, aquí solo queda el link).
4. Si pasa `plazoHoras` sin respuesta, un cron (`revisarRecordatoriosVencidos`,
   `server/src/lib/recordatorios.js`) le manda **un correo por proyecto**
   (agrupa todas sus tareas vencidas) — no repite antes de 24h por tarea
   (`ultimoRecordatorioEn`), y respeta `avisosDesactivados` por tarea.
5. El equipo ve el atraso calculado en tiempo real (`formatoAtraso`) sin
   esperar al correo.

## 7. Solicitudes del cliente → nueva actividad

El cliente también puede pedir algo que no estaba en el checklist original
(`Solicitud`, no es una `Tarea` todavía). El equipo/admin la aprueba o
rechaza (`server/src/routes/solicitudes.js`):

- **Aprobar** → llama al mismo helper que crea tareas custom
  (`crearTareaCustom`), fijando `fase`/`columna`/`responsable`/`dependencias`
  a elección de quien aprueba. La `Solicitud` queda con una referencia
  informativa (`tareaId`) a la tarea resultante.
- **Rechazar** → exige un motivo, no crea nada.

## 8. Comentarios internos (estilo Trello)

Cada tarea tiene un hilo de comentarios (`Comentario`, tabla
`comentarios_tarea`) — **100% interno**, el cliente nunca lo ve aunque sea una
tarea `esCliente`.

- UI: `HiloComentarios.jsx`, con `@menciones` que autocompletan contra
  `miembrosPorId` y notifican por correo a la persona mencionada
  (`notificarMencion`, `server/src/lib/notificaciones.js`).
- API: `GET/POST /tareas/:id/comentarios` (`server/src/routes/comentarios.js`).
- También expuesto como MCP tool (`comentar_actividad`) para que un agente de
  IA deje contexto sin salir de su sesión de trabajo (ver §10).

## 9. Plantillas y generación automática del checklist

**Confirmado en código (no había quedado claro en la primera versión de este
documento):** el sistema que realmente se usa hoy es el de `Plantilla`/
`TareaPlantilla` en base de datos, gestionable desde `/admin/paquetes`. Tanto
el wizard "Nuevo proyecto" (`src/pages/NuevoProyecto.jsx`) como el tool MCP
`crear_proyecto` llaman al **mismo** helper de servidor
(`materializarTareasDesdePlantilla`, `server/src/lib/plantillaHelpers.js`):
toma una `plantillaId`, filtra sus `TareaPlantilla` por `condicion` contra las
`condicionesTecnicas`/`extras` del proyecto nuevo, remapea IDs y dependencias,
y ese array es el que se inserta como `Tarea` reales del proyecto. Es una
única fuente de verdad compartida por UI y MCP — no hay divergencia ahí.

`generarTareas(condicionesTecnicas, extras)` en `src/data/paquetes.js` (el
generador hardcodeado de ~50-60 tareas que describía la versión anterior de
este documento) **es código muerto**: se define pero no se llama desde
ningún lado del proyecto (verificado por búsqueda global). Es candidato a
eliminarse — mantenerlo solo invita a que alguien lo edite pensando que
todavía tiene efecto.

### Las plantillas sí expresan dependencias

`TareaPlantilla.dependencias` guarda IDs de otras `TareaPlantilla` de la misma
plantilla — el grafo de dependencias se diseña una sola vez en
`/admin/paquetes` y `materializarTareasDesdePlantilla` lo traduce solo: genera
un `idMap` (`TareaPlantilla.id` → nuevo `Tarea.id`) y reescribe cada
`dependencias` con los IDs nuevos, descartando las que apuntaban a una tarea
excluida por `condicion`. Nadie tiene que volver a capturar dependencias a
mano al crear un proyecto desde plantilla.

**Edge case verificado:** `disponibleDesde` de una tarea `esCliente` se
calcula contra la longitud de `dependencias` **antes** del filtro de
remapeo (línea 76 de `plantillaHelpers.js`), no contra el array ya
filtrado. Si en la plantilla una tarea de cliente dependía únicamente de
tareas que terminan excluidas por condición, sus dependencias reales quedan
en `[]` pero `disponibleDesde` igual nace en `null` — se autocorrige en
cuanto se completa/edita cualquier otra tarea del proyecto (dispara
`activarTareasClienteDisponibles` a nivel proyecto), pero puede tardar en
activarse en vez de estar disponible desde el día uno.

### Proyectos "continuo" — sin checklist automático

`plantillaId` solo aplica cuando `tipo === 'finito'`; en ambos caminos de
creación (wizard y MCP) un proyecto `continuo` arranca con **cero tareas**
(`tareasFinal = []` / `tareas = []`). No existe ningún mecanismo de checklist
ni de generación automática de actividades para servicios recurrentes — el
tablero Kanban nace vacío y cada tarjeta se agrega una por una, a mano desde
la UI ("+ agregar tarea" en `KanbanBoard.jsx`) o vía MCP
(`registrar_actividad`/`solicitar_al_cliente`, pasando `columna` en vez de
`fase`). Esto es una decisión de diseño explícita, no un hueco: un servicio
continuo no tiene un checklist fijo que tenga sentido predefinir de la misma
forma que un proyecto con entregable único.

## 10. Integración MCP (agentes de IA)

El backend expone un servidor MCP (`POST /mcp`,
`server/src/routes/mcp.js`) con **19 tools registradas**, la mayoría sobre
actividades:

`listar_proyectos`, `crear_proyecto`, `editar_proyecto`, `cambiar_tipo_proyecto`,
`ver_proyecto`, `actualizar_fase`, `registrar_actividad`, `iniciar_actividad`,
`completar_actividad`, `mover_a_revision`, `editar_actividad`,
`cancelar_actividad`, `nota_interna`, `comentar_actividad`,
`solicitar_al_cliente`, `listar_plantillas` — más 3 tools de Prototipos
(módulo secundario, ver §11).

Esto permite que Claude Code, trabajando en el repo de un cliente, reporte
avance directo en Foco (`registrar_actividad`), pida algo al cliente
(`solicitar_al_cliente`) o dé seguimiento a una tarea existente
(`iniciar_actividad`/`completar_actividad`/`comentar_actividad`) sin que una
persona tenga que replicarlo a mano en el panel. Las acciones respetan el
mismo `tareaLeCorresponde` que la UI — un agente no puede completar una tarea
que no le corresponde a su identidad conectada.

### Dependencias vía MCP y el problema de encadenar tareas nuevas

`registrar_actividad`/`solicitar_al_cliente` sí aceptan `dependeDeTareaIds`
(y `antesDeTareaId`/`despuesDeTareaId` para posición), validados contra las
tareas que **ya existen** en el proyecto al momento de la llamada
(`validarDependencias`, `server/src/routes/mcp.js`) — no se puede referenciar,
dentro de la misma llamada, una tarea que se está a punto de crear, ni de
otro proyecto.

**Limitación verificada:** ninguna de las dos tools devuelve el `id` de la
tarea creada en su respuesta (solo un texto de confirmación con el título).
La única forma de obtenerlo es una llamada de seguimiento a `ver_proyecto`.
Y en proyectos `finito`, `ver_proyecto` solo expone IDs de tareas del equipo
en `tareasEnProceso`/`tareasPendientesEquipo` (estado `pendiente`/
`en_proceso`) — como `registrar_actividad` marca `completada: true` por
**default**, una tarea creada sin pasar `completada: false` explícito queda
completa de inmediato y su ID **no aparece en ningún listado de
`ver_proyecto`**, quedando indescubrible por MCP. Para encadenar A → B hay
que: crear A con `completada: false`, leer su `id` en `ver_proyecto`, crear
B con `dependeDeTareaIds: [idA]`, y si A ya estaba hecha en realidad,
cerrarla después con `completar_actividad`. En proyectos `continuo` este
problema no existe — `resumen.tarjetas` en `ver_proyecto` lista todas las
tarjetas no omitidas con su `id`, sin importar la columna.

## 11. Vistas principales

- **`DetalleProyecto.jsx`** — la vista más grande del sistema. Pestaña
  "Tareas" (por fase, con arrastre para reordenar) o tablero Kanban según
  `proyecto.tipo`, más pestañas de "Preguntas al Cliente" y "Prototipos".
  El detalle de cada tarea se abre en un modal único (`ModalDetalleTarea.jsx`)
  que unifica ver + editar + comentarios (clic en la fila entera, sin botón
  "Ver detalles" aparte).
- **`KanbanBoard.jsx`** — tablero de proyectos `continuo`, mismo patrón de
  modal unificado por tarjeta.
- **`MisTareas.jsx`** (`/equipo/tareas` y `/admin/tareas`) — bandeja personal:
  todas las tareas asignadas a la persona logueada, cruzando todos sus
  proyectos.

---

## 12. Módulos secundarios (mención breve, no el foco)

- **Usuarios/Equipo** (`/admin/equipo`, tabla `User`) — alta de personas,
  rol (`ADMIN`/`EQUIPO`), área, avatar. Solo relevante para actividades en
  cuanto resuelve quién es "copy/diseñador/programador" en `proyecto.equipo`.
- **Prototipos** — integración con `esbrillante-pages-mcp` para
  publicar/revisar páginas de prueba; vive como pestaña dentro del proyecto
  pero es un sistema aparte (fuente de verdad en el otro repo).
- **Autenticación** — JWT en cookie httpOnly, login por email+contraseña.
- **Branding "Foco"** — modo oscuro, escala de color `ink`, logo — cosmético.
- **Google Drive** — creación de carpeta por proyecto, solo almacenamiento.

---

## 13. Puntos a revisar / posibles mejoras (observados leyendo el código)

Estas son observaciones, no bugs confirmados en producción — vale la pena
decidir cuáles importan antes de tocar nada:

1. **Sin detección de ciclos en dependencias.** Si dos tareas terminan
   dependiendo una de la otra (por error al editar), ambas quedan bloqueadas
   para siempre sin ningún mensaje que lo explique. Sería barato agregar una
   validación (DFS simple) en `PUT /tareas/:id` y en `crearTareaCustom`.
2. **Código muerto en `src/data/paquetes.js`.** `generarTareas()` (el
   generador hardcodeado de checklist) ya no lo llama nadie — el sistema
   vigente es `Plantilla`/`TareaPlantilla` en base de datos (confirmado, ver
   §9). Vale la pena eliminarlo o marcarlo claramente como legado para que no
   se edite por error pensando que todavía tiene efecto.
3. **`responsable` es un string libre sin tipo.** Funciona (roles conocidos
   vs. fallback a userId), pero es implícito — un typo en un rol nuevo se
   trataría silenciosamente como "asignación directa a un userId inexistente"
   en vez de fallar con un error claro.
4. **El reordenamiento por arrastre en la vista de fases es reciente** — la
   verificación automatizada (navegador) no pudo confirmar el gesto de drag
   end-to-end; quedó pendiente de una prueba manual. Si no se ha confirmado
   todavía que funciona con mouse real, es lo primero a probar.
5. **Sin pruebas automatizadas.** No hay carpeta de tests en el repo — todo
   el ciclo de vida de una tarea (dependencias, permisos, orden) se verifica
   manualmente. Dado que la lógica de dependencias/orden/permisos es la parte
   más delicada del sistema, sería la candidata más rentable a cubrir primero
   si en algún momento se agregan tests.
6. **Recordatorios sin reintento ni cola.** Si Mailjet falla momentáneamente
   al enviar un recordatorio de tarea vencida, `enviado: false` simplemente
   no actualiza `ultimoRecordatorioEn` — se reintentará en la próxima corrida
   del cron, lo cual está bien, pero no queda ningún registro visible en el
   panel de que un correo falló (solo se loggea si se envió con éxito).
7. **Estado "revisión" no existe en proyectos `finito`.** Un proyecto por
   fases no tiene un paso explícito de "en revisión" como sí lo tiene el
   Kanban de `continuo` — si el equipo quiere modelar una revisión interna
   formal antes de dar por completada una tarea de fase, hoy tendría que ser
   una fase separada o una tarea adicional ("Revisar X"), no un estado.

---

*Este documento describe el estado del código al 2026-09-04. Si el sistema
cambia, hay que volver a generarlo — no se actualiza solo.*
