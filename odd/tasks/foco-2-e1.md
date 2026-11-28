# Foco 2.0 — Etapa E1 (del contrato al plan)
Objetivo: que lo contratado en Perfex (propuesta y facturas) alimente el plan y el estado de pago de cada proyecto, con un borrador de plan hecho por IA. Rama por tarea desde `main`. Entrega: `ask-on-risk` (cada push a `main` despliega en LevelRail). Sin suite de tests: scripts de escenario + build + prueba en producción.
Piloto: Juárez Asociados (propuesta Perfex PROEB-000467).

## Specs
- **S1** Pagos desde Perfex: "El sistema tiene actualmente manualmente marcar que hay anticipo, eso ya se puede resolver mencioannd que orden de pago es y de alli identificar de si ya se pago o esta en pendiente, algunas lcientesp ueden incluso dejar ese proyecto ya pagado desde el inicio, no maneja numeros solo sabe si ya se pago algo o que porcentaje solamente". Foco guarda solo número de factura, estado y porcentaje pagado; una factura puede atarse al anticipo o a una fase; el anticipo pagado activa el proyecto, una fase pagada se desbloquea; el botón manual queda de respaldo.
- **S2** Alcance contratado: "creo que aqui es importante que exista una vinculación por medio de API para que hay un acceso a esa información y sobre ella armar un plan de trabajo" — "eso si en foco no manejamos precios y nada por estilo, la propuesta luego contempla otras cosas eso hay que confirmarlo para cuando se haga el plan". Se importa la propuesta sin precios; los addons quedan "por confirmar".
- **S3** Plan con IA: "la IA interna se encargaria de definir todas las actividades a realizar" — "definir intermante si esa actividad se realizara con Claude Code, OpenCode o cualquier agente y solo necesita que un humano inicie la solicitud para su ejecución". Siempre borrador: un admin lo aprueba antes de crear tareas. La IA vive en el backend (decisión L2 de E0).
- **S4** Fechas: "muchas veces por retrasos se necesita regoanizar las fechas ya que hay desfase en el Workflow". Fechas encadenadas por dependencias y duración; reprogramar cuando hay desfase.
- **S5** Servicios mensuales: "por ejemplo en un servicio de SEO al inicio se hace un plan, analisis Keyword Research, el siguiente mes ya se empieza con mas ejecuciones, alli entra un problema por ejemplo por 2500 pesos que cubre el servicio, tener una lista interna eso ayudaria mucho a saber si ya me pase o me falto hacer cosas".

## Tasks
| ID | Specs | Ruta | Estado | Commit |
|---|---|---|---|---|
| T1 | S1 | inline | hecho | a932d38 (PR #29, desplegado) |
| T2 | S2 | inline | hecho | (este commit) |
| T3 | S3 | inline | pendiente (requiere llave de API de IA) | — |
| T4 | S4 | inline | pendiente | — |
| T5 | S5 | inline | pendiente | — |

Pronóstico: ~2000 líneas en total → varios PRs, uno por tarea.

## Log
- **L1** (2026-11-27) Usuario: "si salen clientes del CRM, arranca E1". Token nuevo de Perfex cargado como secret en `foco-backend`; búsqueda de clientes del CRM confirmada en el panel. Permisos de facturas/pagos/propuestas sin verificar.
- **L2** Riesgo T1/T2: no se conoce la forma exacta de las respuestas de `/api/invoices`, `/api/payments` y `/api/proposals` del módulo REST de Perfex; hay que verlas antes de programar contra ellas.
- **L3** (2026-11-27) API de Perfex inspeccionada con un token de prueba (archivo borrado al terminar): `/invoices/{id}` trae `status` (1 pendiente, 2 pagada, 3 parcial, 4 vencida, 5 cancelada, 6 borrador), `total`, `total_left_to_pay`, `clientid`, `formatted_number`; `/invoices/search/{EB-…}` busca por número; `/proposals/{id}` trae `items` con `is_optional`/`is_selected` y descripciones que incluyen precios (quitarlos al importar en T2).
- **L4** T1: `server/src/lib/pagosPerfex.js` (estado y % sin montos en `proyecto.pagos`; anticipo pagado → `confirmarAnticipo`, ahora compartido con el botón manual; fase pagada → `pagoConfirmado`; nunca revierte; rechaza facturas de otro cliente del CRM); rutas `POST/DELETE /api/proyectos/:slug/pagos`, `/pagos/sincronizar`, `/pagado-desde-inicio`; revisión horaria en `app.js`; tool MCP `vincular_factura`; bloque "Pagos" en la pestaña Info. Sin migración (vive en el JSON `proyecto`). Evidencia: 13 escenarios contra la base local con Perfex simulado OK, imports OK, `vite build` OK. Cambio de comportamiento: "Confirmar anticipo" ya no saca de pausa ni reactiva un proyecto completado. Risk: item 3 (comportamiento compartido del anticipo).
- **L5** T2: `server/src/lib/alcancePerfex.js` importa la propuesta (id, `PROEB-000467` o link) a `proyecto.alcance` sin precios: quita solo frases con montos (`$1,200`, "precio", "+ IVA", MXN) y conserva alcance como "pasarela de pago". Base = `incluido`, opcionales = `por_confirmar` (se señala si el cliente lo marcó en Perfex); reimportar conserva confirmados/descartados; rechaza propuestas de otro cliente. Rutas `POST /api/proyectos/:slug/alcance`, `PUT .../alcance/conceptos/:id`; tools MCP `importar_alcance`, `actualizar_alcance`; `ver_proyecto` incluye alcance y pagos; tarjeta "Alcance contratado" en Info. Evidencia: 8 casos unitarios + 8 escenarios en base local OK, `vite build` OK.
