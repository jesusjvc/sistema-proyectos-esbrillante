---
name: foco-reporte
description: Reglas para que un agente de IA reporte su avance en Foco (Sistema de Seguimiento de EsBrillante) vía el MCP esbrillante-seguimiento. Usar al trabajar en el repo de un proyecto de cliente, al empezar o terminar una tarea, o cuando pidan "reporta en Foco", "reporta el avance", "marca la tarea". English triggers: working on a client project repo, starting or finishing a task, "report progress to Foco".
---

# Reporte de avance en Foco

Foco es donde el equipo y el cliente ven qué se está haciendo. El MCP
`esbrillante-seguimiento` no reporta nada por sí solo: tú lo invocas siguiendo
estas reglas, sin esperar a que te lo pidan.

## Antes de empezar

1. Busca el slug del proyecto en el `CLAUDE.md` / `AGENTS.md` del repo
   ("El slug de este proyecto es: ..."). Si no aparece, usa `listar_proyectos`
   y confirma el slug con la persona antes de reportar nada.
2. Llama `mi_siguiente_actividad(slug)`. Te devuelve:
   - `enCurso`: lo que ya está marcado en proceso a tu nombre.
   - `disponibles`: lo que te toca y ya se puede hacer (dependencias resueltas).
   - `sinAsignar`: tareas del equipo que nadie ha tomado.
3. Si lo que te pidieron corresponde a una de esas tareas, usa su `tareaId`. Si
   no corresponde a ninguna, es trabajo fuera del plan (ver abajo).

## Durante el trabajo

| Momento | Tool |
|---|---|
| Empiezas a trabajar de verdad una tarea del plan | `iniciar_actividad(slug, tareaId)` |
| Avance relevante, o fin de la sesión de trabajo | `comentar_actividad(slug, tareaId, mensaje)` |
| Terminaste y verificaste la tarea | `completar_actividad(slug, tareaId)` |
| Proyecto continuo: hecho, pero alguien debe revisarlo | `mover_a_revision(slug, tareaId)` |
| Necesitas una decisión, dato o recurso del cliente | `solicitar_al_cliente(slug, titulo, instrucciones)` |
| Hiciste algo que no estaba en el plan | `registrar_actividad(slug, titulo, descripcion, completada)` |

El comentario de avance es de 1 a 3 líneas: qué se hizo, qué sigue y qué lo
bloquea (si algo). Ejemplo:

> Formulario de contacto conectado a Mailtrap y probado en staging. Sigue: validación de campos. Sin bloqueos.

## Reglas

- Nunca inventes un `tareaId`: úsalo solo si salió de `mi_siguiente_actividad`
  o `ver_proyecto`.
- Nunca marques como completado algo que no verificaste (build, prueba en
  navegador o el criterio que indique `queEntregas`).
- Marca en proceso solo lo que de verdad estás trabajando, no todo lo disponible.
- Reporta cada avance que le importaría ver al cliente o al equipo, no cada commit.
- Los comentarios son internos; lo que pidas con `solicitar_al_cliente` sí lo ve
  el cliente en su portal, así que redáctalo para él.
- Si una tool responde que la tarea no te corresponde, no la fuerces: avisa a la
  persona y deja un comentario o pide que la reasignen.
- Si el MCP no está disponible, termina el trabajo y dile a la persona qué
  quedó sin reportar.

## Instalación

Una sola vez por computadora; vuelve a correrlo para actualizar. OpenCode también
lee `~/.claude/skills`, así que el mismo comando sirve para Claude Code y OpenCode.

```bash
# macOS / Linux
mkdir -p ~/.claude/skills/foco-reporte && \
  curl -fsSL https://raw.githubusercontent.com/jesusjvc/sistema-proyectos-esbrillante/main/skills/foco-reporte/SKILL.md \
  -o ~/.claude/skills/foco-reporte/SKILL.md
```

```powershell
# Windows (PowerShell)
New-Item -ItemType Directory -Force "$HOME\.claude\skills\foco-reporte" | Out-Null
Invoke-WebRequest https://raw.githubusercontent.com/jesusjvc/sistema-proyectos-esbrillante/main/skills/foco-reporte/SKILL.md -OutFile "$HOME\.claude\skills\foco-reporte\SKILL.md"
```

- **Claude Cowork / claude.ai:** guarda este `SKILL.md` en una carpeta
  `foco-reporte`, comprímela en .zip y súbela en Configuración → Capacidades → Skills.
- **Otros agentes:** colócala en su directorio de skills, o pega la sección
  "Reglas" en su archivo de instrucciones (`AGENTS.md`).
- Después, en el `CLAUDE.md`/`AGENTS.md` de cada repo de cliente, indica el slug del
  proyecto en Foco (ver `docs/mcp-setup.md` §5). Para probar, pregúntale al agente
  "¿qué me toca en Foco?".

Las mismas instrucciones, con botón de copiar, están en Foco → MCP.

Requisitos: el MCP `esbrillante-seguimiento` conectado con tu cuenta (OAuth) o
tu API key personal, para que el avance quede a tu nombre. Con la API key
compartida, `mi_siguiente_actividad` exige `slug`. Ver `docs/mcp-setup.md`.
