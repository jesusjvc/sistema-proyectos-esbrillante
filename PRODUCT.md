# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

El equipo interno de EsBrillante administra proyectos, trabajo asignado e incidencias operativas. Los clientes consultan avances y responden solicitudes desde un portal separado, pero el modulo de Mantenimiento sera inicialmente solo para el equipo interno.

## Product Purpose

Foco centraliza la operacion de EsBrillante: seguimiento de proyectos finitos y continuos, responsables, solicitudes de clientes y trabajo diario. Debe reducir la dispersion entre tableros, mensajes y seguimiento manual sin convertir cada cliente o sitio en un proyecto independiente.

## Positioning

Foco adapta el seguimiento al trabajo real de una agencia: combina proyectos con entregables, servicios continuos y una mesa operativa de incidencias, conservando el contexto de cliente, sitio, infraestructura y cobertura.

## Operating Context

- Los proyectos finitos y continuos se gestionan actualmente en Foco.
- Los reportes de sitios web pueden llegar por WhatsApp o ser detectados por el equipo.
- El telefono permite identificar al cliente en el CRM.
- Un cliente puede tener uno o varios sitios; cuando existen varios, el agente debe preguntar cual sitio esta afectado antes de levantar el ticket.
- El CRM es la fuente de clientes, contactos y cobertura comercial.
- Enhanced Control Panel y Cloudflare son fuentes de infraestructura.
- Drive o un gestor de contrasenas conserva credenciales; Foco no debe funcionar como boveda.

## Capabilities and Constraints

- Mantenimiento es un modulo propio, inicialmente interno, separado de Proyectos.
- La vista principal de Mantenimiento es una lista o tabla plana priorizada.
- Kanban se conserva como vista alternativa sobre los mismos tickets y filtros.
- Los tickets deben poder vincularse a un cliente y a un sitio concreto.
- La futura integracion de WhatsApp debe crear tickets con el mismo flujo y modelo que la interfaz.
- La interfaz se mantiene en espanol de Mexico y debe funcionar en escritorio y movil.

## CRM-Backed Clientes (fuente obligatoria)

- Ningun cliente se crea libremente en Foco: nace en el CRM (Perfex, `crm.esbrillante.mx`) y se importa vinculado por `Cliente.crmId`.
- Alta de ticket: si el cliente no aparece en la lista local, se busca en el CRM (empresa, contacto, telefono o correo).
- Resultado ya vinculado se selecciona; resultado nuevo se importa con un clic (datos maestros siempre re-obtenidos del CRM, nunca del navegador).
- Si no existe en el CRM, se registra primero ahi (empresa obligatoria; el correo del contacto es obligatorio porque el CRM lo exige) y queda vinculado en Foco.
- Reimportar un cliente ya vinculado refresca sus datos locales con los del CRM: el CRM manda.
- Sitios y cobertura no vienen del CRM: se registran en Foco al crear el ticket; el website del CRM se usa solo como sugerencia de dominio.
- Integracion tecnica: cliente HTTP `server/src/lib/perfexClient.js` (header `Authtoken`, `PERFEX_BASE_URL`/`PERFEX_API_TOKEN` solo en el servidor). Un WAF del CRM bloquea `&`, `%`, `?` en terminos de busqueda y los DELETE via REST: el cliente sanitiza los terminos y el borrado se hace desde el propio CRM.
- El buscador de cliente al crear un ticket es un unico campo inteligente: mientras se escribe filtra Foco y consulta el CRM en paralelo (debounce 350 ms); en el mismo dropdown aparecen los locales, los del CRM listos para importar (Enter) y, si no existe en ningun lado, la sugerencia de registrarlo en el CRM sin salir del formulario.

## MCP de tickets

- Las tools `listar_tickets`, `crear_ticket` y `actualizar_ticket` (server/src/routes/mcp.js) exponen la mesa de mantenimiento a Claude Code / integraciones externas con el mismo modelo que la interfaz.
- `crear_ticket` resuelve el cliente desde cualquier identificador (id Foco, crmId, empresa, contacto, correo o telefono), importa del CRM si hace falta, usa el unico sitio del cliente o registra el dominio como sitio nuevo, y pregunta cuando hay varios sitios.
- Flujo WhatsApp previsto: telefono origen → resolver cliente → crear ticket con `origen: whatsapp`.

## Brand Commitments

El producto se llama Foco, usa los activos existentes de EsBrillante y conserva el sistema visual documentado en `docs/brand/DESIGN.md`.

## Evidence on Hand

- Implementacion React/Vite existente en `src/`.
- API Express y modelos Prisma en `server/`.
- Sistema visual en `docs/brand/DESIGN.md`.
- Caso real de prueba: Ban&Home Real Estate y `banhomerealestate.com`.

## Product Principles

- Registrar primero y enriquecer sin perder el reporte.
- Mostrar en una sola vista que requiere atencion ahora.
- Mantener una fuente de verdad por tipo de dato y enlazarla desde Foco.
- Pedir confirmacion cuando la identidad del sitio sea ambigua.
- Separar claramente trabajo operativo de proyectos y de informacion para clientes.

## Accessibility & Inclusion

Objetivo WCAG 2.2 AA, navegacion por teclado, alternativa al arrastre y controles tactiles de al menos 44 px en movil.
