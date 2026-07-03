# Spec — Sistema de Seguimiento de Proyectos Web
## EsBrillante Digital Agency

---

## 1. Descripción General

Sistema interno de seguimiento de proyectos web con dos vistas diferenciadas: una para el equipo interno de EsBrillante y otra para el cliente. Reemplaza el uso de Trello como herramienta de seguimiento, adaptándose específicamente al flujo de trabajo de la agencia.

El sistema no es un gestor de proyectos genérico — es una herramienta construida sobre las plantillas, roles y lógica real de EsBrillante.

**Objetivos principales:**
- Que todo el equipo sepa en todo momento qué hacer y qué está bloqueado
- Que el cliente vea el progreso de su proyecto sin acceder a herramientas internas
- Que Jesús tenga visibilidad y control sin necesidad de preguntar al equipo
- Que los tiempos queden medidos para análisis y conexión futura con sistema de finanzas
- Que los recordatorios ocurran automáticamente sin depender de que alguien lo recuerde

---

## 2. Roles y Permisos

### Admin (Jesús y quien él designe)
- Crear y configurar nuevos proyectos
- Seleccionar paquete base y ajustar checklist antes de iniciar
- Modificar el checklist durante el proyecto si algo cambia
- Ver historial completo — responsables reales, log de cambios, tiempos
- Recibir alertas cuando un cliente lleva 7+ días sin responder

### Equipo (Copy, Diseñador, Programador, Karla)
- Ver proyectos donde están asignados
- Ver todas las tareas disponibles para tomar en ese momento
- Marcar tareas como completadas — quien la hace, la marca
- Ver quién hizo qué internamente
- No pueden modificar el checklist ni crear proyectos
- Reciben recordatorios por correo de tareas activas sin completar

### Cliente
- Accede por link único del proyecto + contraseña compartida simple
- No requiere registro ni cuenta propia
- Solo ve su proyecto, su progreso general y sus tareas pendientes
- Las tareas pendientes incluyen instrucciones claras de qué hacer exactamente
- El responsable de cada tarea aparece siempre como "Equipo EsBrillante"
- Recibe recordatorios por correo cuando tiene tareas pendientes sin completar

---

## 3. Alta de Proyecto

Al crear un proyecto nuevo, el Admin completa un formulario de registro con los siguientes datos:

### Datos del cliente
- Nombre comercial
- Nombre del contacto principal
- WhatsApp
- Correo electrónico
- Participantes del lado del cliente:
  - Nombre
  - Correo
  - Rol: Aprobador / Proveedor de recursos / Solo seguimiento
  - (puede haber más de un participante)

### Datos del proyecto
- Paquete base (ver sección 4)
- Ajustes al paquete: extras a agregar / tareas a quitar
- Fecha de inicio
- Fecha estimada de entrega
- Anticipo confirmado: Sí / No
  - El sistema no activa el proyecto si el anticipo no está confirmado

### Condiciones técnicas del proyecto
Checkboxes que determinan qué tareas técnicas se incluyen en el checklist:

```
¿El cliente ya tiene dominio?           Sí / No
¿El cliente ya tiene hosting?           Sí / No
¿Requiere correos corporativos?         Sí / No
¿Requiere Cloudflare?                   Sí / No (default: Sí)
¿Requiere Google Analytics?             Sí / No
¿Requiere Search Console?               Sí / No
¿Requiere plugin adicional?             Sí / No → campo de texto: ¿Cuál?
¿Requiere capacitación al cliente?      Sí / No (default: Sí)
```

### Equipo asignado
- Copy: [lista desplegable de miembros disponibles] / Por asignar
- Diseñador: [lista desplegable] / Por asignar
- Programador: [lista desplegable] / No aplica
- Admin del proyecto: [lista desplegable]

### Mensaje de inicio interno
Al guardar el proyecto, el sistema genera automáticamente un mensaje de inicio listo para copiar y compartir en el grupo interno de WhatsApp. Incluye:
- Nombre del cliente y descripción breve del proyecto
- Paquete contratado y funcionalidades incluidas
- Equipo asignado con sus roles
- Fecha estimada de entrega
- Link al proyecto en el sistema

---

## 4. Paquetes Base y sus Checklists

Cada paquete define un conjunto de tareas predeterminadas. Al seleccionarlo, el sistema carga esas tareas y el Admin puede agregar o quitar antes de activar el proyecto.

### Paquetes disponibles
- Web en Corto
- Web Profesional
- Web Corporativa
- Web Industrial
- Web Experto
- Ecommerce
- Personalizado (parte desde cero, el Admin construye el checklist manualmente)

### Extras disponibles para agregar a cualquier paquete
- Plugin de agendamiento de citas
- Plugin de membresías
- Carga de productos (Ecommerce)
- Pasarela de pago (Stripe / MercadoPago / PayPal)
- Blog con entradas iniciales
- Correos corporativos
- Capacitación extendida
- SEO avanzado

### Tareas que se pueden quitar según el proyecto
Cualquier tarea del checklist base puede removerse si no aplica para ese cliente específico. Solo el Admin puede hacer esto antes o durante el proyecto.

---

## 5. Estructura del Checklist por Fases

### Fase 1 — Arranque
Tareas internas de preparación. Ninguna depende del cliente aún.

Incluye: crear ficha en sistema, crear carpeta en Drive, abrir grupo de WhatsApp, confirmar equipo, enviar mensaje de bienvenida.

### Fase 2 — Contenido y Boceto
Ruta crítica. Tiene dependencia del cliente para avanzar a la siguiente fase.

Incluye: revisión del brief, redacción del boceto por secciones, verificación de disponibilidad de dominio, presentación del boceto al cliente.

**Tareas del cliente en esta fase:**
- Confirmar dominio elegido
- Confirmar qué servicios serán agendables (si aplica plugin)
- Enviar testimonios o reseñas
- Revisar boceto y dar comentarios (plazo sugerido: 48 horas)

### Fase 3 — Diseño y Maquetación
Diseño y maquetación corren juntos — ya no son fases separadas. El equipo puede usar Elementor o trabajar con IA según disponibilidad y tipo de proyecto.

Incluye: selección de plantilla, presentación de opciones al cliente, definición de paleta de colores y tipografía, armado completo del sitio con contenido del boceto aprobado.

**Tareas del cliente en esta fase:**
- Elegir plantilla de las opciones presentadas
- Confirmar correo donde llegan mensajes del formulario de contacto

### Fase 4 — Configuración Técnica
Tareas paralelas. La mayoría pueden avanzar independientemente de la ruta crítica, pero varias tienen dependencias entre sí y con el cliente.

Ver sección 6 para la lógica de dependencias técnicas.

### Fase 5 — Revisión Interna
Sin participación del cliente. El equipo verifica que todo funcione antes de presentar.

Incluye: revisión de secciones completas vs boceto aprobado, responsive móvil y desktop, prueba de formulario, prueba de plugin de agendamiento si aplica, prueba de WhatsApp, revisión de avisos legales si aplica.

Nadie puede marcar esta fase como completa excepto Karla o el Admin.

### Fase 6 — Revisión con Cliente
Ruta crítica. El proyecto espera al cliente.

Incluye: compartir link de staging con instrucciones, recibir comentarios, aplicar correcciones (máximo 2 rondas incluidas en el paquete), obtener aprobación final por escrito.

**Tarea del cliente:**
- Revisar el sitio en el link compartido y enviar comentarios (plazo: 48 horas)
- Dar aprobación final — el mensaje de aprobación en WhatsApp es suficiente

### Fase 7 — Entrega y Cierre
Incluye: migración de staging a dominio final, SSL, prueba final en dominio oficial, entrega de accesos al cliente, capacitación básica de WordPress, confirmación de pago final antes de entregar accesos, cierre del proyecto en el sistema.

**Regla:** No se entregan accesos sin liquidación confirmada.

---

## 6. Lógica de Dependencias Técnicas

Las tareas técnicas tienen una cadena de dependencias que el sistema debe respetar. Una tarea bloqueada no aparece como disponible hasta que su dependencia esté completada.

### Cadena principal
```
Cliente confirma dominio
        ↓
Registrar dominio
        ↓
Conectar a Cloudflare (gestión DNS)
        ↓
Apuntar a hosting (Enhanced Control Panel)
        ↓
Instalar WordPress en dominio final
        ↓
Instalar plantilla y plugins
        ↓
Configurar correos corporativos (si aplica)
        ↓
Conectar Search Console (si aplica)
```

### Lo que puede avanzar SIN dominio confirmado
- Abrir cuenta de hosting en Enhanced Control Panel
- Instalar WordPress en staging o subdominio temporal
- Instalar y configurar plugins (agendamiento, formularios, etc.)
- Preparar estructura base de la plantilla
- Configurar Google Analytics (si ya hay sitio o staging)

### Lo que está bloqueado HASTA que el cliente confirma dominio
- Registro del dominio
- Configuración de Cloudflare
- Apuntamiento DNS al hosting
- WordPress en dominio final
- Correos corporativos
- Search Console

---

## 7. Tipos de Estado de Tareas

El sistema distingue tres estados para cada tarea:

**Disponible** — puede hacerse ahora mismo, no tiene bloqueos
**Bloqueada por cliente** — espera respuesta o acción del cliente
**Bloqueada por dependencia** — requiere que otra tarea interna esté completada primero

Cuando un miembro del equipo entra al sistema, ve únicamente las tareas en estado **Disponible** de los proyectos donde está asignado — sin tener que adivinar ni preguntar qué hacer.

---

## 8. Medición de Tiempos

El sistema registra y distingue dos tipos de tiempo:

**Tiempo activo** — el equipo está trabajando, el proyecto avanza.

**Tiempo en pausa** — el proyecto está esperando al cliente en alguna tarea de la ruta crítica. Las tareas paralelas pueden seguir avanzando durante una pausa.

### Datos que se registran por proyecto
```
Fecha de inicio
Fecha de cierre
Tiempo total transcurrido
Tiempo en pausa acumulado (por episodio y total)
Tiempo activo real = Total − Pausas
Número de pausas y duración de cada una
Fase donde ocurrió cada pausa
Quién completó cada tarea y en qué fecha/hora
```

### Quién marca las pausas
Las pausas las marca el equipo de EsBrillante — específicamente cuando se completa una tarea interna y la siguiente le toca al cliente. No es automático para evitar pausas falsas, pero el sistema sugiere marcar pausa cuando detecta que la tarea siguiente tiene estado "Bloqueada por cliente".

### Por qué se separan los tiempos
- El tiempo activo real refleja cuánto tarda EsBrillante en entregar — no se contamina con los días que el cliente tarda en responder
- El tiempo en pausa refleja el comportamiento del cliente — útil para saber en qué fase se atascan más
- Ambos datos son útiles para estimar plazos futuros con más precisión

---

## 9. API para Sistema de Finanzas

El sistema expone un endpoint por proyecto con los siguientes datos para conectar con el sistema de finanzas en una fase posterior:

```json
{
  "proyecto_id": "string",
  "cliente": "string",
  "paquete": "string",
  "fecha_inicio": "date",
  "fecha_estimada_entrega": "date",
  "fecha_cierre": "date | null",
  "status": "activo | en_pausa | completado | cancelado",
  "porcentaje_avance": "number (0-100)",
  "tiempo_activo_horas": "number",
  "tiempo_pausa_horas": "number",
  "fase_actual": "string",
  "anticipo_confirmado": "boolean",
  "pago_final_confirmado": "boolean"
}
```

El porcentaje de avance se calcula principalmente sobre la ruta crítica — las fases que definen cuándo se entrega el sitio.

---

## 10. Recordatorios por Correo

Los recordatorios se envían automáticamente desde Zoho Mail, que ya está configurado en EsBrillante. No requiere servicio externo.

### Para el cliente — cuando tiene tareas pendientes sin completar

| Días sin respuesta | Acción |
|---|---|
| Día 1 | Sin recordatorio — tiempo de gracia |
| Día 2 | Correo recordatorio amable al cliente |
| Día 4 | Segundo correo mencionando que el proyecto está en pausa |
| Día 7 | Alerta interna a Jesús para seguimiento manual por WhatsApp |

Los correos al cliente son en tono profesional y amable, con instrucciones claras de qué necesita hacer y un link directo a su vista del proyecto.

### Para el equipo — cuando una tarea activa lleva más tiempo del esperado

- El tiempo límite es configurable por tipo de tarea (no es lo mismo revisar un boceto que instalar WordPress)
- El recordatorio llega al responsable asignado con copia a Karla
- Si la tarea no tiene responsable asignado, el recordatorio llega a Karla directamente

---

## 11. Fase Posterior — Agente de WhatsApp

*Fuera del alcance del sistema inicial. Documentado para implementación futura.*

Reemplazaría los recordatorios por correo con mensajes automáticos de WhatsApp, tanto para el cliente como para el equipo interno. Requiere integración con WhatsApp Business API.

La lógica de tiempos y disparadores es la misma que los recordatorios por correo — solo cambia el canal.

Se conectaría al sistema mediante la misma API interna que usa el módulo de recordatorios por correo, facilitando la migración cuando esté listo.

---

## 12. Stack Técnico Sugerido

*Referencia para Claude Code — sujeto a decisión final de Jesús.*

- Backend: Node.js + Express (consistente con el MCP server existente)
- Base de datos: por definir según infraestructura actual
- Frontend: por definir
- Correos: Zoho Mail SMTP
- Hosting: Coolify (consistente con infraestructura actual de EsBrillante)
- API: REST, misma arquitectura que el sistema de finanzas para facilitar integración futura

---

## 13. Fases de Desarrollo

### Fase 1 — Versión localStorage (Validación)

**Objetivo:** Construir y validar toda la lógica del sistema en el navegador antes de tocar cualquier backend. Probar el flujo real con IM Multiservice como caso piloto.

**Alcance:**
- Alta de proyectos con formulario completo
- Generación automática de checklist según paquete y condiciones del proyecto
- Tareas con tres estados — disponible, bloqueada por cliente, bloqueada por dependencia
- Marcar tareas como completadas con registro de responsable y timestamp
- Medición de tiempos — inicio, pausas, tiempo activo acumulado
- Vista interna — responsables reales, log de actividad, tareas disponibles
- Vista cliente — progreso general, tareas pendientes con instrucciones, acceso por contraseña simple
- Plantillas base por paquete con extras y ajustes
- Mensaje de inicio interno generado automáticamente al crear el proyecto

**Limitaciones conocidas en esta fase:**
- Los datos viven en el navegador — no se comparten entre dispositivos
- Sin sincronización en tiempo real entre miembros del equipo
- Recordatorios por correo no disponibles — requieren backend
- API para sistema de finanzas no disponible — requiere backend

**Condición para avanzar a Fase 2:**
El flujo completo validado con al menos un proyecto real (IM Multiservice). Todos los roles probados — Admin, equipo y cliente.

---

### Fase 2 — Backend y Sincronización

**Objetivo:** Migrar los datos de localStorage a base de datos. La lógica ya está probada — solo cambia dónde se guardan los datos.

**Alcance:**
- Base de datos real — por definir según infraestructura en Coolify
- Sincronización entre dispositivos — todo el equipo ve el mismo estado en tiempo real
- Sistema de recordatorios por correo vía Zoho Mail SMTP
- API REST para conectar con sistema de finanzas:
  - Status del proyecto
  - Porcentaje de avance
  - Tiempos activo y en pausa
  - Fechas de inicio, estimada y cierre
  - Estado de pagos
- Links únicos por proyecto para vista del cliente
- Contraseñas por proyecto gestionadas desde el sistema

**Stack sugerido:**
- Backend: Node.js + Express (consistente con MCP server existente)
- Hosting: Coolify (consistente con infraestructura actual)
- Correos: Zoho Mail SMTP
- API: REST, misma arquitectura que sistema de finanzas

---

### Fase 3 — Agente de WhatsApp *(Fase Posterior)*

*Fuera del alcance de Fases 1 y 2. Documentado para implementación futura.*

Reemplazaría los recordatorios por correo con mensajes automáticos de WhatsApp para cliente y equipo interno. Requiere integración con WhatsApp Business API.

La lógica de tiempos y disparadores es idéntica a los recordatorios por correo — solo cambia el canal. Se conectaría al sistema mediante la misma API interna del módulo de correos, facilitando la migración cuando esté listo.

---

## 14. Caso de Prueba — IM Multiservice LLC

El sistema se validará inicialmente con este proyecto real:

**Cliente:** Ingrid María Martínez Ramos — IM Multiservice LLC
**Paquete base:** Web Corporativa
**Extras:** Plugin de agendamiento de citas
**Condiciones técnicas:** Sin dominio confirmado (3 opciones pendientes) / Sin hosting / Requiere Cloudflare / Requiere correos por confirmar / Requiere Analytics y Search Console por confirmar
**Equipo:** Por asignar
**Recursos disponibles:** Logo PNG ✅ / Foto profesional ✅ / Fotos de oficina ✅ / Textos de servicios ✅ / Testimonios ⚠️ pendientes
**Pendiente crítico antes de arrancar:** Confirmar anticipo

