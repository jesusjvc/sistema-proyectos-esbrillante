# MCP de reporte de avance — setup en repos cliente

El backend de este sistema expone un endpoint MCP en `POST /mcp` (montado en `server/src/app.js`, código en `server/src/routes/mcp.js`). Permite que Claude Code, desde cualquier repo de proyecto (ej. E&E Shipping), reporte avance directo al Sistema de Seguimiento sin salir de la sesión.

## 1. Variables de entorno del backend

En el `.env` del servidor (local y en Coolify) agrega:

```
MCP_API_KEY="<genera una con: openssl rand -hex 32>"
```

Esta es la key compartida (global, una sola para todos los proyectos) que usará el MCP para autenticarse. Nunca la subas al repo — vive solo en `.env` / variables de entorno de Coolify.

Ya está configurada en producción (app `proyectos-backend` en Coolify, `https://api-proyectos.esbrillante.mx`).

## 2. Agregar el MCP en cada repo cliente

Desde la raíz del repo (ej. el repo de E&E Shipping), con la key exportada en el shell:

```bash
export ESBRILLANTE_MCP_KEY="<la misma MCP_API_KEY del backend>"

claude mcp add --transport http esbrillante-seguimiento https://api-proyectos.esbrillante.mx/mcp \
  --header "Authorization: Bearer ${ESBRILLANTE_MCP_KEY}" \
  --scope project
```

Esto crea/actualiza `.mcp.json` en la raíz del repo con este contenido (los servidores van bajo la clave `mcpServers`):

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

Verifica la conexión con `claude mcp list` (fuera de una sesión) o `/mcp` (dentro de la sesión de Claude Code) — debe mostrar `esbrillante-seguimiento` conectado con 6 tools.

## 3. Identificar el slug del proyecto

Cada repo cliente reporta a un proyecto específico del Sistema de Seguimiento (creado antes desde el wizard admin, `NuevoProyecto.jsx`). Para saber el slug, desde Claude Code en ese repo:

```
Usa la tool listar_proyectos del MCP esbrillante-seguimiento y dime el slug de <cliente>.
```

Guarda ese slug — todas las demás tools lo piden como primer argumento.

## 4. Tools disponibles

| Tool | Uso |
|---|---|
| `listar_proyectos` | Ver todos los proyectos activos y su slug |
| `ver_proyecto(slug)` | Fase actual, % de avance, tareas pendientes propias y del cliente |
| `registrar_actividad(slug, titulo, descripcion?, fase?, completada?)` | Reportar algo que se hizo (o se está haciendo, con `completada:false`) que no estaba en el checklist original. Visible al cliente si no es `esCliente`. |
| `solicitar_al_cliente(slug, titulo, instrucciones, plazoHoras?, fase?)` | Pedirle algo al cliente — aparece de inmediato en su portal |
| `completar_actividad(slug, tareaId)` | Marcar como lista una tarea ya existente en el checklist |
| `nota_interna(slug, mensaje)` | Nota libre solo para el panel admin, nunca visible al cliente |

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
