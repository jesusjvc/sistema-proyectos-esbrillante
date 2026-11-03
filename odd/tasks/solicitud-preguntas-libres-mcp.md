# Solicitud al cliente con preguntas libres (MCP)

## Objetivo
Agregar a `solicitar_al_cliente` la posibilidad de armar un formulario de **preguntas
libres** (definidas en el momento, no un módulo fijo): abiertas (texto), cerradas
(Sí/No) u opción múltiple (checkboxes, varias opciones a la vez — confirmado con
el usuario).

## Por qué
El usuario quiere pedirle cosas al cliente con la misma solidez que el módulo
`registrante_dominio` (formulario real, respuesta estructurada), pero sin tener
que crear un módulo fijo nuevo por cada caso — quiere poder definir las preguntas
al vuelo desde el MCP.

## Diseño (confirmado por exploración del código existente)
- `Tarea.preguntas: Json?` (nuevo campo) — array de `{ id, texto, tipo, opciones?, requerida }`.
- Reusa `Tarea.respuestaDatos` (ya existe, genérico) para las respuestas: `{ [preguntaId]: valor }`.
  - `abierta` → string. `cerrada` → `'si' | 'no'`. `opcion_multiple` → `string[]`.
- No se puede combinar `preguntas` con `modulo` en la misma solicitud.
- No escribe a Info clave (a diferencia de dominio/vobo/registrante_dominio) — es de uso libre, sin semántica fija.

## Alcance / tareas
- [x] T1 — Prisma: campo `Tarea.preguntas Json?` + migración manual (`server/prisma/schema.prisma`, `server/prisma/migrations/`).
- [x] T2 — Helpers genéricos en `server/src/lib/modulosCliente.js`: `validarFormaPreguntas`, `erroresRespuestasPreguntas`, `resumenPreguntas`.
- [x] T3 — `server/src/routes/mcp.js`: param `preguntas` en `solicitar_al_cliente` (zod + handler + descripción del tool) y exponer `preguntas` en `tareasPendientesCliente` de `ver_proyecto`.
- [x] T4 — `server/src/routes/cliente.js`: rama de validación/guardado para tareas con `preguntas` en el endpoint de completar tarea.
- [x] T5 — `src/pages/cliente/VistaCliente.jsx`: `TareaClienteCard` renderiza dinámicamente abierta/cerrada/opción múltiple.

## Checks aplicados
- `node --check` en los archivos backend tocados.
- `npx vite build` para el frontend.
- Sin suite de tests automatizada en este repo (AGENTS.md) — verificación manual.

## Ruta
Todo delegado inline (contexto ya completo tras explorar el módulo `registrante_dominio`
existente; cambios mecánicos y acotados, sin decisiones de diseño pendientes salvo
la ya resuelta con el usuario sobre opción múltiple).

## Estado
Implementado (T1–T5). Verificado: `prisma validate` + `prisma generate` OK,
`node --check` en los 3 archivos backend, `npx vite build` OK. Sin tests
automatizados (AGENTS.md) — falta probar manualmente en el portal del cliente
antes de dar por cerrado del todo. Pendiente: commit de trabajo.
