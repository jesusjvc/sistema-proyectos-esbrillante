# Foco 2.0 — Etapa E0 (arreglos sin IA)
Objetivo: seguimiento realista sin IA todavía. Rama `feature/foco-2-e0`. Entrega: `ask-on-risk`. Sin suite de tests (verificación con scripts de escenario + build + navegador).
Plan general: Foco 2.0 E0–E4, piloto Juárez Asociados (propuesta Perfex 467).

## Specs
- **S1** Panel del cliente realista: "el cliente ve las actividades que tiene que realizar pero el sistema no es realista y puede dejar tareas que aun no están disponibles como por ejemplo revisar el diseño de la página web, cuando aun ni se comienza con el proyecto, o dar comentarios de la propuesta si aun no se empieza". La disponibilidad se calcula en el servidor (dependencias + fase actual + anticipo + pagos de fase); en pausa sí se muestran (la pausa significa "esperando al cliente"). Recordatorios y salud solo cuentan tareas disponibles.
- **S2** Lista continua: "creo que es mejor tener una lista continua de actividades a realizar, tareas que dependen de que se vean pero no darte tanta visibilidad". Etapas quedan como agrupación interna.
- **S3** "las proxima actividades a realizar, saber quien esta en que".
- **S4** Reporte de agentes: "los chicos del equipo usan para algunas actividades algun agente de IA que desde MCP siempre informen que hacen o como van que el mismo agente inventi a reportar sus avances" — skill con las reglas del juego + tool MCP.

## Tasks
| ID | Specs | Ruta | Estado | Commit |
|---|---|---|---|---|
| T1 | S1 | inline | hecho | ccf0988 |
| T2 | S2 | delegado (paralelo) | hecho | 0041c9a |
| T3 | S3 | delegado (paralelo) | hecho | 8735829 |
| T4 | S4 | delegado (paralelo) | hecho | (este commit) |

## Log
- **L1** (2026-11-27, petición original, extracto): "Quiero validar algunas mejoras en Foco, mas que nada para mejorar el seguimiento de los proyectos y poder coordinar mejor y estar al tanto de que está cada proyecto [...] Es decir tenemos que mejorar el tracking de inicio a fin."
- **L2** (2026-11-27): usuario elige IA interna dentro del backend; programar E0 directo (sin prototipo). Pagos vía facturas Perfex quedan para E1.
- **L3** T1: nueva `idsTareasClienteDisponibles` (`server/src/lib/avance.js`); `activarTareasClienteDisponibles` ahora sincroniza en ambos sentidos (borra relojes de tareas no disponibles); se llama al crear proyecto (REST/MCP), confirmar anticipo, `actualizar_fase` y cada hora en recordatorios. `/api/cliente/:slug` manda `disponible` y recorta tareas del equipo a campos públicos; completar una tarea no disponible (o del equipo) responde 400. Evidencia: 9 escenarios OK (scratch), sync con db simulada OK, imports OK, `vite build` OK. Risk: item 2 (guard nuevo en completar del cliente) e item 3 (`contarPendientesCliente` del MCP ahora cuenta solo disponibles).
- **L4** T1 commiteado con `--no-verify` autorizado por el usuario tras 2 falsos positivos del hook GGA (getFaseActual no modificada; enviarGoogleChat ya atrapa sus errores).
- **L5** T2–T4 delegados en paralelo (razón: 3 unidades independientes con superficies disjuntas). T2: vista "Próximas" por defecto en proyectos finitos (`ListaProximasActividades.jsx`); tareas cliente con dependencias listas van en "Siguen" porque `estadoCalculado` las marca `bloqueada_cliente`. T3: `/admin/equipo-ahora` reusa `bandejaDe` extraído a `src/lib/bandejaTareas.js`. T4: tool MCP `mi_siguiente_actividad`, skill `skills/foco-reporte/SKILL.md`, snippet de `docs/mcp-setup.md`; `dependenciasResueltas` movida a `tareaHelpers.js` (antes privada en `routes/tareas.js`). Evidencia: `vite build` OK, imports OK, script de selección OK. Pendiente: prueba en navegador y con un agente real.
