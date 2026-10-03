# AGENTS.md — Foco (sistema-proyectos-esbrillante)

Reglas de revisión de código para este repo. Úsalas al revisar un diff antes de aprobar un commit.

## Qué es este proyecto

Sistema interno de seguimiento de proyectos web para EsBrillante. Monorepo:
- `src/` — frontend: React + Vite + Tailwind CSS v4 (paleta `brand`/`ink` en `src/index.css`, no colores de Tailwind por defecto para acentos).
- `server/` — backend: Node/Express + Prisma + Postgres, incluye un servidor MCP (`server/src/routes/mcp.js`) para controlar el sistema desde agentes de IA.
- Deploy: Coolify (apps separadas `proyectos-backend` y `proyectos-frontend`), cada una se construye y despliega de forma independiente.

## Convenciones del código (no son errores, son intencionales)

- **Idioma:** nombres de variables, funciones, rutas, modelos y comentarios van en **español** (`crearTareaCustom`, `destinatariosDeTarea`, `proyectoId`). No sugieras traducir a inglés.
- **Comentarios:** solo cuando explican un *porqué* no obvio (una restricción oculta, un workaround, una decisión de producto). Nunca comentarios que repiten lo que ya dice el nombre de la función/variable. No sugieras agregar comentarios que solo describan el QUÉ.
- **Sin abstracciones prematuras:** no marcar como "falta refactor" código con 2-3 líneas repetidas si no hay una tercera variante real todavía.
- **Manejo de errores "mejor esfuerzo":** integraciones externas (correo vía Mailtrap, Google Drive, Google Chat, CRM) nunca deben lanzar y tumbar el flujo principal — siempre `try/catch` que loguea y regresa `{ enviado: false, motivo }` o similar. Si ves un `await` a una de estas sin try/catch, es un bug real, repórtalo.
- **Lógica duplicada frontend/backend intencional:** `tareaLeCorresponde`/`permisos.js` existe tanto en `src/lib/` como en `server/src/lib/`, a propósito (frontend y backend se despliegan por separado, no comparten build). Si un PR cambia la lógica de permisos en un lado, verifica que el otro archivo se haya actualizado igual — si no, es un bug real que vale la pena señalar.

## Qué sí vale la pena señalar

- Cambios al schema de Prisma (`server/prisma/schema.prisma`) sin su migración correspondiente en `server/prisma/migrations/`.
- Nuevas rutas backend sin `requireAuth`/`requireMcpAuth` cuando deberían tenerlo.
- Tools nuevas del MCP (`server/src/routes/mcp.js`) sin `description` clara en el `inputSchema`, o que no sigan el patrón `ok(...)`/`fail(...)` de las demás.
- Credenciales o tokens reales (no placeholders) en `.env.example` o commiteados en cualquier archivo.
- Componentes de React con JSX mezclando Tailwind de acentos fuera de la paleta `brand-*`/`ink-*` ya definida.
- `console.log` de depuración dejado en código de producción (backend o frontend).

## Qué NO hace falta pedir

- No pidas tests unitarios nuevos — este proyecto no tiene suite de tests automatizados; la verificación es manual (build + prueba en navegador/curl).
- No pidas JSDoc ni tipos — es JS plano, sin TypeScript.
- No sugieras ESLint/Prettier si no hay configuración ya establecida en el repo para esa regla.
