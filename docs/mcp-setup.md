# MCP de reporte de avance — setup en repos cliente

El backend de este sistema expone un endpoint MCP en `POST /mcp` (montado en `server/src/app.js`, código en `server/src/routes/mcp.js`). Permite que Claude Code, desde cualquier repo de proyecto (ej. E&E Shipping), reporte avance directo al Sistema de Seguimiento sin salir de la sesión.

## 1. Variables de entorno del backend

En el `.env` del servidor (local y en Coolify) agrega:

```
MCP_API_KEY="<genera una con: openssl rand -hex 32>"
```

Esta es la key compartida (global, una sola para todos los proyectos) que usará el MCP para autenticarse. Nunca la subas al repo — vive solo en `.env` / variables de entorno de Coolify.

Ya está configurada en producción (app `proyectos-backend` en Coolify, `https://api-proyectos.esbrillante.mx`).

## 2. Agregar el MCP

Con la key exportada en el shell — la sintaxis cambia según tu shell:

```bash
# bash / zsh
export ESBRILLANTE_MCP_KEY="<la misma MCP_API_KEY del backend>"
```

```fish
# fish
set -x ESBRILLANTE_MCP_KEY "<la misma MCP_API_KEY del backend>"
```

Elige el scope (`-s/--scope`) según el caso:

**Opción recomendada — `user`: disponible en todos tus repos de esta máquina, sin repetir el setup por proyecto.**

```bash
# bash / zsh
claude mcp add --transport http esbrillante-seguimiento https://api-proyectos.esbrillante.mx/mcp \
  --header "Authorization: Bearer ${ESBRILLANTE_MCP_KEY}" \
  --scope user
```

```fish
# fish (sin llaves en la variable)
claude mcp add --transport http esbrillante-seguimiento https://api-proyectos.esbrillante.mx/mcp \
  --header "Authorization: Bearer $ESBRILLANTE_MCP_KEY" \
  --scope user
```

No genera ningún archivo en el repo — queda guardado en tu `~/.claude.json` (config global del usuario).

**Alternativa — `project`: solo ese repo, versionado en `.mcp.json`** (útil si otras personas del equipo también deben poder usarlo desde ese repo específico):

```bash
# bash / zsh — en fish, usa $ESBRILLANTE_MCP_KEY sin llaves como arriba
claude mcp add --transport http esbrillante-seguimiento https://api-proyectos.esbrillante.mx/mcp \
  --header "Authorization: Bearer ${ESBRILLANTE_MCP_KEY}" \
  --scope project
```

Esto crea/actualiza `.mcp.json` en la raíz del repo (los servidores van bajo la clave `mcpServers`):

```json
{
  "mcpServers": {
    "esbrillante-seguimiento": {
      "type": "http",
      "url": "https://api-proyectos.esbrillante.mx/mcp",
      "headers": {
        "Authorization": "Bearer ${ESBRILLANTE_MCP_KEY}"
      }
    }
  }
}
```

`${ESBRILLANTE_MCP_KEY}` se resuelve en tiempo de conexión desde la variable de entorno del shell — nunca queda la key en texto plano en el archivo, así que `.mcp.json` sí se puede versionar. Cada quien que clone el repo necesita exportar su propia `ESBRILLANTE_MCP_KEY` localmente para que el servidor conecte.

Verifica la conexión con `claude mcp list` (fuera de una sesión) o `/mcp` (dentro de la sesión de Claude Code) — debe mostrar `esbrillante-seguimiento` conectado con 11 tools.

## 3. Identificar (o crear) el proyecto

Si el proyecto del repo ya existe en el Sistema de Seguimiento, pide el slug:

```
Usa la tool listar_proyectos del MCP esbrillante-seguimiento y dime el slug de <cliente>.
```

Si no existe todavía, Claude Code puede crearlo directo con `crear_proyecto` — no hace falta pasar por el wizard admin. `anticipoConfirmado` es solo informativo: en `false` el proyecto queda como "pendiente_anticipo" hasta que se confirme el pago desde el panel admin, pero de cualquier forma ya se le puede reportar avance.

Guarda el slug que devuelva — todas las demás tools lo piden como primer argumento.

## 4. Tools disponibles

| Tool | Uso |
|---|---|
| `listar_proyectos` | Ver todos los proyectos activos y su slug |
| `crear_proyecto(clienteNombre, ..., anticipoConfirmado)` | Dar de alta un proyecto nuevo sin pasar por el wizard admin |
| `ver_proyecto(slug)` | Fase actual, % de avance, tareas pendientes propias y del cliente |
| `registrar_actividad(slug, titulo, descripcion?, fase?, completada?)` | Reportar algo que se hizo (o se está haciendo, con `completada:false`) que no estaba en el checklist original. Visible al cliente si no es `esCliente`. |
| `solicitar_al_cliente(slug, titulo, instrucciones, plazoHoras?, fase?)` | Pedirle algo al cliente — aparece de inmediato en su portal |
| `iniciar_actividad(slug, tareaId)` | Marcar una tarea como "en proceso" de verdad — que alguien la está trabajando ahora, no solo que está disponible. Úsala solo cuando realmente empieces algo, no para todo lo que esté disponible en paralelo (ver nota abajo). |
| `completar_actividad(slug, tareaId, respuesta?)` | Marcar como lista una tarea ya existente (del equipo o del cliente). Si estás cerrando una solicitud al cliente porque respondió por otro canal, pasa `respuesta` para dejarlo registrado. |
| `editar_actividad(slug, tareaId, titulo?, descripcion?, instrucciones?, plazoHoras?)` | Corregir una tarea ya creada (equipo o cliente) sin tener que cancelarla y volver a crearla |
| `cancelar_actividad(slug, tareaId, motivo?)` | Cancelar una actividad o solicitud que ya no aplica — queda omitida, no se borra |
| `actualizar_fase(slug, numero, fechaEstimada?, requierePago?, pagoConfirmado?)` | Ajustar la fecha estimada o el estado de pago de una fase — útil en proyectos con pagos parciales por fase, donde una sola "fecha de entrega" no refleja la realidad |
| `nota_interna(slug, mensaje)` | Nota libre solo para el panel admin, nunca visible al cliente |

**"En proceso" es un estado real, no una inferencia:** antes, el portal del cliente y las vistas de equipo mostraban como "en proceso" cualquier tarea desbloqueada, aunque nadie la estuviera trabajando todavía — daba la impresión de que todo avanzaba en paralelo. Ahora `en_proceso` solo se activa cuando alguien (persona o Claude Code vía `iniciar_actividad`) declara explícitamente que está trabajando en esa tarea. Si varios miembros del equipo (o varias sesiones de Claude Code) sí están trabajando cosas distintas en paralelo, cada quien marca la suya — el sistema no fuerza secuencialidad, solo pide que "en proceso" refleje trabajo real para que el cliente confíe en lo que ve.

**Proyectos con pagos parciales por fase:** si en `crear_proyecto` cada fase incluye `fechaEstimada`/`requierePago`/`pagoConfirmado`, el portal del cliente reemplaza la fecha única de entrega por un timeline con la fecha estimada de cada fase y un badge "Esperando confirmación de pago" en la que esté bloqueada. Usa `actualizar_fase` para ir ajustando esto conforme avanza el proyecto (ej. marcar `pagoConfirmado:true` cuando llegue el pago de la Fase 2).

**Limitación conocida (aún no soportada):** no hay forma de adjuntar archivos a `solicitar_al_cliente` — si necesitas que el cliente suba o revise un archivo, pega un link (Drive, etc.) directo en `instrucciones`.

## 5. Para que el reporte sea automático, no manual

El MCP no reporta nada por sí solo — necesita que Claude Code lo invoque. Para que esto pase sin que tengas que pedirlo cada vez, agrega algo así al `CLAUDE.md` de cada repo cliente:

```markdown
# Reporte de avance

Este proyecto se reporta al Sistema de Seguimiento de EsBrillante vía el MCP
`esbrillante-seguimiento`. El slug de este proyecto es: `<slug-del-proyecto>`.

Después de completar una unidad de trabajo significativa (una funcionalidad,
un fix importante, un hito del brief), usa `registrar_actividad` para dejarlo
reportado. Si algo requiere una decisión, dato o recurso del cliente antes de
poder seguir, usa `solicitar_al_cliente` en vez de solo preguntarme a mí.
```

Ajusta el criterio de "unidad de trabajo significativa" al ritmo real del proyecto — no cada commit, sino cada avance que le importaría ver al cliente.
