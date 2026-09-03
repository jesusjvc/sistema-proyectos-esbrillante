# Foco — Sistema de diseño

Versión 1.0 · 3 de septiembre de 2026 · EsBrillante

## 1. Propósito y alcance

Foco es la aplicación de EsBrillante para coordinar proyectos, responsables, fechas y entregables. Su interfaz debe permitir responder rápidamente: qué tengo que hacer, qué sigue, quién es responsable y qué está bloqueado.

Este documento define la dirección visual y el comportamiento esperado de la aplicación. Es una especificación propuesta para diseño y desarrollo, no una auditoría de la aplicación existente: no se ha inspeccionado su código ni sus pantallas. Adaptar estos patrones a las funciones reales; no crear módulos ficticios solo para reproducir ejemplos.

La referencia de calidad son herramientas profesionales de gestión como Trello y Monday: consistencia, legibilidad, rapidez y claridad de interacción. Foco debe conservar su identidad propia, sin copiar sus marcas ni interfaces.

### Principios

1. **Claridad antes que decoración.** La tarea, responsable, estado y fecha dominan cada vista.
2. **Densidad útil.** Mostrar suficiente información para trabajar sin convertir cada pantalla en un muro de tarjetas.
3. **Una acción principal por contexto.** El amarillo señala qué se puede hacer a continuación.
4. **Contexto continuo.** Abrir una tarea no debe perder filtros, desplazamiento ni selección del tablero.
5. **Respuesta visible.** Guardado, errores, permisos y cambios de otras personas nunca son ambiguos.
6. **Accesibilidad desde los componentes.** Teclado, contraste y movimiento reducido forman parte del diseño.

## 2. Identidad visual

**Personalidad:** enfocada, cercana, ordenada y profesional. Geometría ligeramente redondeada, iconos sencillos y fondos tranquilos. Evitar apariencia infantil, neón, exceso de degradados o grandes bloques promocionales dentro del área de trabajo.

### Logotipo

- Símbolo: marco de enfoque con una palomita central, conservando el diseño aprobado.
- Nombre visual: `foco` en minúsculas. Nombre en textos y títulos: `Foco`.
- Modo claro: símbolo amarillo y nombre negro. Modo oscuro: símbolo amarillo y nombre blanco.
- Firma `by EsBrillante`: bienvenida, acceso y sección Acerca de. Puede omitirse en navegación compacta cuando resulte ilegible.
- No reconstruir el wordmark con la tipografía de interfaz ni deformar el símbolo.
- Espacio libre alrededor: al menos un cuarto de la altura del símbolo.
- En navegación: símbolo de 28–32 px; lockup sin firma de unos 112–136 px de ancho, según proporción final.
- Favicon: solo símbolo; revisar manualmente su lectura a 16 y 32 px. Icono de aplicación: exportaciones separadas de 192 y 512 px.
- Usar SVG de producción y PNG transparentes derivados del original. Las imágenes generadas son referencias visuales; requieren limpieza/vectorización antes de asumir precisión de formas, transparencia y colores.
- No incluir el fondo verde croma en ningún recurso de producción. Tampoco utilizarlo como color de interfaz.

### Amarillo de marca

El SVG proporcionado de EsBrillante contiene **#F9ED48** como amarillo. Este documento lo adopta como valor de referencia de Foco. Sustituye la aproximación #FFDE00 usada en las primeras propuestas. No se asume que el SVG sea un manual corporativo completo.

## 3. Tipografía

**Familia de interfaz: Inter.** Utilizar una sola familia para navegación, formularios, tareas y métricas. Alojar archivos WOFF2 con su licencia, cargar solo los pesos utilizados y habilitar `font-display: swap`. No condicionar la legibilidad a una descarga externa.

```css
font-family: "Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
```

| Rol | Tamaño / interlineado | Peso | Aplicación |
| --- | --- | --- | --- |
| Título de página | 28 / 36 px | 650 | Proyectos, Mi trabajo |
| Título de panel | 22 / 30 px | 600 | Detalle de tarea |
| Título de sección | 18 / 26 px | 600 | Actividad, Entregables |
| Título de tarjeta | 14 / 20 px | 600 | Nombre de tarea |
| Cuerpo | 14 / 22 px | 400 | Descripciones y comentarios |
| Navegación / botón | 14 / 20 px | 500–600 | Controles principales |
| Metadatos | 12 / 18 px | 400–500 | Fechas y conteos |
| Métrica | 28 / 34 px | 650 | Resúmenes breves |

- Formularios móviles: 16 px para facilitar la lectura y evitar zoom involuntario en navegadores que lo aplican.
- No usar menos de 12 px para información funcional. No usar mayúsculas sostenidas en frases.
- Texto largo: ancho de lectura de aproximadamente 65–75 caracteres.
- Fechas y cantidades: números tabulares cuando ayuden a comparar columnas.
- No usar pesos finos. No espaciar artificialmente letras en botones o tablas.
- Permitir ampliación de texto: usar `rem` y alturas mínimas, no contenedores que recorten el contenido.

## 4. Colores y tokens

Consumir nombres semánticos en componentes. Los hexadecimales se centralizan en el tema; no deben repetirse como valores arbitrarios por pantalla.

| Token | Claro | Oscuro | Uso |
| --- | --- | --- | --- |
| `--bg` | #F6F7F9 | #111318 | Fondo de aplicación |
| `--surface` | #FFFFFF | #1B1E25 | Tarjetas y navegación |
| `--surface-raised` | #FFFFFF | #242832 | Menús, diálogos y paneles |
| `--surface-muted` | #EEF0F4 | #15181F | Columnas y secciones secundarias |
| `--surface-hover` | #E8EBF0 | #2D3340 | Hover de controles neutros |
| `--text` | #181B22 | #F5F6F8 | Texto principal |
| `--text-muted` | #555E6D | #B5BDCA | Metadatos y ayuda |
| `--border` | #DCE1E8 | #3D4554 | Separadores decorativos |
| `--control-border` | #788291 | #8793A5 | Contornos funcionales |
| `--brand` | #F9ED48 | #F9ED48 | Acción primaria y marca |
| `--brand-hover` | #F1DF2E | #FFF36A | Hover primario |
| `--brand-pressed` | #E2CE19 | #E2CE19 | Pulsación primaria |
| `--on-brand` | #181B22 | #181B22 | Texto sobre amarillo |
| `--selection` | #FFFAD1 | #38351B | Selección persistente |
| `--on-selection` | #4B4100 | #FFF38A | Texto de selección |
| `--link` | #1D4ED8 | #93C5FD | Enlaces funcionales |
| `--focus-ring` | #1D4ED8 | #93C5FD | Foco de teclado |
| `--disabled-bg` | #E7EAF0 | #2A2F39 | Control desactivado |
| `--disabled-text` | #626C7A | #9BA5B4 | Etiqueta desactivada |

### Colores semánticos

Cada combinación es texto sobre fondo; acompañar siempre con una etiqueta o icono significativo.

| Significado | Texto claro / fondo claro | Texto oscuro / fondo oscuro |
| --- | --- | --- |
| Neutro / por hacer | #475569 / #F1F5F9 | #CBD5E1 / #293241 |
| Información / en curso | #1E40AF / #DBEAFE | #BFDBFE / #172B4D |
| Revisión | #6B21A8 / #F3E8FF | #E9D5FF / #35204A |
| Advertencia | #854D0E / #FEF3C7 | #FDE68A / #3B2D15 |
| Éxito / completado | #166534 / #DCFCE7 | #BBF7D0 / #153527 |
| Error / bloqueo | #991B1B / #FEE2E2 | #FECACA / #431F25 |

Botón destructivo: #B91C1C con texto blanco; hover #991B1B; pressed #7F1D1D, en ambos temas.

### Reglas de uso

- El amarillo no es un color de texto sobre blanco ni el único indicador de foco de teclado.
- Botones amarillos llevan texto oscuro; nunca texto blanco.
- Fondo neutro en la mayor parte de la pantalla. Reservar el amarillo para marca, acción principal y selección puntual.
- `--border` no garantiza contraste suficiente para identificar un control. Usar `--control-border` donde el contorno sea necesario para reconocer inputs, checkboxes o botones.
- Colores de cliente o proyecto son identificadores, no estados. No permitir que sustituyan tokens semánticos.
- Prioridad y estado son propiedades distintas. Prioridad: Baja, Normal, Alta, Urgente, con texto e icono. Nunca inferir urgencia solo del color de una columna.
- Gráficas: añadir etiquetas, patrones o símbolos; no utilizar amarillo como serie sobre blanco sin un contorno oscuro.

## 5. Base CSS implementable

La tabla anterior es la fuente de verdad. Este bloque inicial cubre los tokens estructurales; completar los semánticos usando los mismos valores.

```css
:root {
  color-scheme: light;
  --font-ui: "Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --bg: #F6F7F9; --surface: #FFFFFF; --surface-raised: #FFFFFF;
  --surface-muted: #EEF0F4; --surface-hover: #E8EBF0;
  --text: #181B22; --text-muted: #555E6D;
  --border: #DCE1E8; --control-border: #788291;
  --brand: #F9ED48; --brand-hover: #F1DF2E; --brand-pressed: #E2CE19;
  --on-brand: #181B22; --selection: #FFFAD1; --on-selection: #4B4100;
  --link: #1D4ED8; --focus-ring: #1D4ED8;
  --disabled-bg: #E7EAF0; --disabled-text: #626C7A;
  --space-1: 4px; --space-2: 8px; --space-3: 12px; --space-4: 16px;
  --space-5: 20px; --space-6: 24px; --space-8: 32px; --space-12: 48px;
  --radius-sm: 6px; --radius-control: 8px; --radius-card: 12px;
  --radius-dialog: 16px; --radius-pill: 999px;
  --shadow-card: 0 1px 2px rgb(16 24 40 / 6%);
  --shadow-popover: 0 8px 24px rgb(16 24 40 / 14%);
  --shadow-modal: 0 24px 64px rgb(16 24 40 / 22%);
  --duration-fast: 120ms; --duration-normal: 180ms;
  --ease: cubic-bezier(.2, 0, 0, 1);
}
[data-theme="dark"] {
  color-scheme: dark;
  --bg: #111318; --surface: #1B1E25; --surface-raised: #242832;
  --surface-muted: #15181F; --surface-hover: #2D3340;
  --text: #F5F6F8; --text-muted: #B5BDCA;
  --border: #3D4554; --control-border: #8793A5;
  --brand-hover: #FFF36A;
  --selection: #38351B; --on-selection: #FFF38A;
  --link: #93C5FD; --focus-ring: #93C5FD;
  --disabled-bg: #2A2F39; --disabled-text: #9BA5B4;
  --shadow-card: none;
  --shadow-popover: 0 8px 24px rgb(0 0 0 / 30%);
  --shadow-modal: 0 24px 64px rgb(0 0 0 / 45%);
}
body { font-family: var(--font-ui); color: var(--text); background: var(--bg); }
:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 3px; }
.button-primary {
  min-height: 40px; padding: 8px 16px; border-radius: var(--radius-control);
  border: 1px solid var(--control-border);
  background: var(--brand); color: var(--on-brand); font: inherit; font-weight: 600;
}
.button-primary:hover:not(:disabled) { background: var(--brand-hover); }
.button-primary:active:not(:disabled) { background: var(--brand-pressed); }
.button-primary:disabled { background: var(--disabled-bg); color: var(--disabled-text); }
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: .01ms !important; animation-iteration-count: 1 !important;
    transition-duration: .01ms !important; scroll-behavior: auto !important;
  }
}
```

Tema: ofrecer Sistema, Claro y Oscuro. Resolver Sistema mediante `prefers-color-scheme`; persistir la elección explícita y aplicar `data-theme` antes de pintar para evitar destellos. No invertir imágenes con filtros CSS.

## 6. Espaciado, estructura y densidad

- Escala de 4 px: 4, 8, 12, 16, 20, 24, 32, 48, 64. No introducir márgenes arbitrarios por componente.
- Separación dentro de un control: 8 px. Padding de tarjeta: 16 px. Entre secciones: 24–32 px.
- Bordes de 1 px. Tarjetas con radio 12 px, controles 8 px, diálogos 16 px. Píldoras solo para etiquetas, avatares y contadores.
- Sombras discretas para elevación real. En oscuro, diferenciar capas principalmente mediante superficie y borde.
- Densidad cómoda por defecto: fila 48 px. Densidad compacta opcional: fila 36 px en escritorio, sin reducir tipografía ni superficie interactiva mínima.

### Estructura de aplicación

| Zona | Medida de referencia | Contenido |
| --- | --- | --- |
| Barra lateral | 240 px, colapsada 72 px | Marca, navegación, proyectos favoritos, cuenta |
| Barra superior | mínimo 64 px | Contexto, búsqueda global, notificaciones |
| Encabezado de vista | altura flexible | Ruta, título y acción principal |
| Herramientas | mínimo 48 px; puede envolver | Vistas, filtros, ordenar, agrupar |
| Contenido | padding 24 px desktop / 16 px móvil | Tablero, lista o detalle |
| Panel de tarea | 480–560 px | Propiedades, descripción y actividad |

Orden recomendado de navegación, solo cuando existan esas funciones: Mi trabajo, Proyectos, Calendario, Equipo; Ajustes junto a la cuenta. Mostrar favoritos después de las secciones principales. No llenar la barra lateral de módulos de baja frecuencia.

Tableros y tablas aprovechan el ancho disponible. Formularios de ajustes limitados a 720 px; páginas de lectura a 800 px. No centrar un tablero dentro de una columna estrecha de landing page.

## 7. Botones y acciones

| Variante | Apariencia | Uso |
| --- | --- | --- |
| Primario | Amarillo, texto oscuro, borde funcional | Crear tarea, Guardar cambios |
| Secundario | Superficie, texto principal, borde funcional | Cancelar, Importar |
| Terciario | Transparente, texto principal; hover neutro | Ver actividad, acciones contextuales |
| Destructivo | Rojo con blanco | Confirmar eliminación |
| Icono | 40 × 40 px; 44 × 44 en táctil | Más opciones, cerrar |

- Altura pequeña 32 px, normal 40 px, grande 48 px. En móvil, mínimo operativo de producto: 44 px.
- Etiquetas con verbo y objeto: “Crear proyecto”, “Asignar responsable”. Evitar “Aceptar” cuando no describe la acción.
- Iconos de 16–20 px con separación de 8 px. Iconos sin texto requieren nombre accesible y tooltip.
- Hover: cambiar fondo, sin desplazar ni agrandar. Pressed: fondo definido, sin rebotes.
- Loading: conservar ancho; spinner más “Guardando…”, bloquear envíos duplicados y anunciar progreso.
- Disabled: color explícito, sin hover, con explicación próxima si el motivo no es evidente; no depender de un tooltip inaccesible.
- Una acción primaria por región de trabajo. No dar el mismo peso a “Eliminar” y “Guardar”.

## 8. Formularios y selección

- Input: altura mínima 40 px, padding horizontal 12 px, borde funcional, radio 8 px, fondo de superficie.
- Label visible encima, ayuda debajo y error junto al campo. Placeholder es ejemplo, nunca sustituto del label.
- Validar al salir del campo o al enviar; no mostrar errores mientras empieza a escribir.
- Error: icono, texto concreto y borde de error. Conservar los datos y enfocar el primer campo inválido al enviar.
- Textarea: mínimo 120 px, crecimiento controlado, saltos de línea preservados.
- Select: nativo cuando baste. Combobox para responsables, clientes o proyectos largos; búsqueda, teclado, carga y “Sin resultados”.
- Checkbox para selección múltiple; radio para una opción entre varias; switch para un ajuste que se aplica inmediatamente.
- Selector de fecha: calendario más escritura manual; permitir borrar. Mostrar zona horaria cuando afecte una hora de entrega.
- Una fecha sin hora se guarda como fecha de calendario, no como medianoche UTC susceptible de cambiar de día.
- Adjuntos: zona de carga con botón alternativo al arrastre, progreso por archivo, cancelación, reintento y límites reales visibles.
- Editor de descripción: párrafos, listas, enlaces y menciones; evitar barras con decenas de opciones.

## 9. Componentes de gestión

### Tarjeta de tarea

Orden fijo: identificador/contexto opcional → título → etiquetas útiles → fecha y responsable → indicadores de adjuntos/comentarios si existen.

- Título de 2–3 líneas como máximo en tablero; nombre completo en detalle. No truncar toda la tarjeta a una sola línea.
- Mostrar cliente solo cuando no sea evidente por el proyecto.
- Avatar de 24–28 px y nombre accesible. “Sin asignar” debe ser visible y accionable.
- Como máximo dos etiquetas visibles y “+N”. Los contadores cero se omiten.
- La fecha vencida combina texto e icono; una tarea completada no sigue apareciendo vencida.
- Hover discreto; selección con borde y estado accesible. No usar únicamente una sombra para comunicar selección.
- Abrir detalle con botón/enlace de título. Evitar botones anidados dentro de otro botón que envuelva toda la tarjeta.

### Tablero Kanban

- Columnas de 304 px por defecto, separación 16 px; rango admisible 280–340 px.
- Cabecera con estado, cantidad y menú. Fondo neutro, tarjetas en superficie elevada respecto a la columna.
- Estados iniciales propuestos: Por hacer → En curso → En revisión → Completado. Son configurables; no migrar estados existentes automáticamente.
- Bloqueado es una condición adicional con motivo, no necesariamente otra columna que oculte la fase real.
- Añadir tarea al final de cada columna; conservar columna y posición tras crearla.
- Arrastre con vista previa y destino claramente marcado. Alternativa obligatoria “Mover a…” accesible por teclado y toque.
- Si falla un movimiento, restaurar posición y explicar el error. Anunciar el resultado con estado accesible.
- Scroll horizontal en el tablero, no en toda la aplicación. Evitar scrolls verticales independientes por columna salvo necesidad validada.

### Lista / tabla

- Columnas iniciales: Tarea, Estado, Responsable, Fecha, Prioridad. Proyecto/Cliente solo si hay mezcla de proyectos.
- Nombre flexible con mínimo aproximado de 240 px; estado 140, responsable 160, fecha 128, prioridad 112 px.
- Cabecera fija dentro de su contenedor; orden visible con dirección; selección múltiple explícita.
- Hover tenue de fila. Acciones disponibles al enfocar y en táctil, no únicamente con mouse.
- Edición inline: Enter confirma, Escape cancela; cambios guardados o fallidos visibles.
- Selección masiva sustituye temporalmente la barra de herramientas con conteo y acciones; confirmar alcance de “Seleccionar todo”.
- Aplicar semántica de tabla. Usar grid interactivo solo si se implementa íntegramente su navegación de teclado.

### Detalle de tarea

- Panel lateral en escritorio; pantalla completa en móvil. URL propia o enlace profundo cuando la arquitectura lo permita.
- Cabecera: título editable, estado, menú y cierre. Propiedades, descripción, checklist, adjuntos, comentarios y actividad debajo.
- Mostrar autor y hora en comentarios; distinguir actividad automática de conversación humana.
- Guardado explícito para formularios complejos. Autosave solo donde exista confirmación real y recuperación ante error.
- Conservar borradores; advertir antes de descartar cambios sin guardar. Restaurar foco al elemento de origen al cerrar.

### Otras piezas

| Componente | Regla |
| --- | --- |
| Tabs | Activa mediante texto más subrayado/indicador; nunca solo color |
| Filtros | Chips removibles, conteo y “Limpiar filtros”; persistencia por usuario y vista |
| Búsqueda | Resultados por tipo, estado vacío y teclado; diferenciar global de filtro del tablero |
| Menú | Texto e iconos consistentes; destructivo al final, separado |
| Tooltip | Solo ayuda breve, visible con foco; no contiene acciones esenciales |
| Modal | Título y consecuencia concreta; foco contenido, Escape seguro y retorno de foco |
| Toast | Confirmación breve; errores importantes permanecen también junto al contenido |
| Avatar | Iniciales como fallback; no transmitir disponibilidad solo con punto de color |
| Calendario | Fecha actual, tareas por día y alternativa lista; no depender de arrastrar |
| Progreso | Etiqueta “8 de 12 tareas” junto al porcentaje; explicar base de cálculo |
| Notificaciones | Leída/no leída distinguible; agrupar repetidas sin ocultar cambios importantes |

## 10. Estados del sistema y colaboración

Cada pantalla debe contemplar carga inicial, contenido normal, vacío inicial, vacío por filtros, error recuperable, permiso insuficiente y actualización en curso.

| Situación | Respuesta de interfaz |
| --- | --- |
| Primera visita sin proyectos | “Crea tu primer proyecto” + explicación breve + acción |
| Búsqueda vacía | “No encontramos tareas con estos filtros” + Limpiar filtros |
| Carga | Skeleton equivalente al contenido; evitar spinner de pantalla completa repetido |
| Error al cargar | Mantener contexto, explicar y ofrecer Reintentar |
| Pérdida de conexión | Indicador persistente; no afirmar “Guardado” si no está confirmado |
| Guardado fallido | Conservar edición, marcar error y ofrecer reintento |
| Edición simultánea | Informar versión nueva y permitir revisar; no sobrescribir silenciosamente |
| Sin permiso | Explicar acceso limitado; ocultar o desactivar acciones según contexto real |
| Eliminación | Priorizar archivar/restaurar; confirmación contextual cuando sea irreversible |

No mostrar presencia en tiempo real, automatizaciones, notificaciones o estados de sincronización simulados. Si una función no está implementada, no presentarla como operativa.

## 11. Responsive

| Ancho CSS | Comportamiento |
| --- | --- |
| Menos de 768 px | Navegación en drawer; panel de tarea completo; herramientas envueltas; vista lista como entrada preferente |
| 768–1199 px | Barra lateral colapsada por defecto; panel superpuesto si no cabe el contenido |
| 1200 px o más | Barra lateral expandida; detalle lateral cuando deja al menos 640 px útiles al tablero |

- En móvil, el usuario puede elegir tablero: una columna de unos 280 px visible, desplazamiento horizontal contenido y selector de estado.
- Formularios en una columna. Las acciones deben seguir visibles sin tapar campos ni teclado virtual.
- No reducir todo el escritorio proporcionalmente ni esconder acciones necesarias tras hover.
- A 320 px de ancho, el shell y formularios no deben provocar scroll horizontal. Tablas y tableros pueden tener su propio contenedor horizontal cuando la información lo requiere.
- Respetar safe areas y zoom. Botones táctiles de al menos 44 × 44 px como objetivo del producto.

## 12. Iconografía y movimiento

- Una sola familia de iconos lineales; geometría de 24 px, trazo uniforme de 2 px y extremos redondeados.
- Tamaños de interfaz: 16 px en metadatos, 20 px en controles, 24 px en navegación destacada.
- SVG con `currentColor`; iconos decorativos fuera del árbol accesible. No usar emojis como controles de navegación.
- Transiciones de color y opacidad: 120 ms; menús/paneles: 180 ms. Evitar `transition: all`.
- No animar dimensiones de listas de forma que cambien la posición del clic. Sin confeti por cada tarea completada.
- Respetar movimiento reducido y no introducir desplazamiento automático innecesario.

Capas sugeridas: base 0, sticky 10, menú 30, fondo modal 40, modal/drawer 50, popover dentro de modal 60, toast 70, tooltip 80. Los overlays deben gestionar foco y eventos, no solo z-index.

## 13. Lenguaje de producto

Español de México, directo y amable. Hablar de tareas, proyectos, responsables y entregables. Evitar jerga técnica en mensajes al equipo.

| Evitar | Preferir |
| --- | --- |
| Operación exitosa | Tarea creada |
| Error 500 | No pudimos guardar los cambios. Inténtalo de nuevo. |
| Submit | Guardar cambios |
| ¿Estás seguro? | ¿Eliminar “Diseño de portada”? Esta acción no se puede deshacer. |
| Sin data | Aún no hay tareas en este proyecto |

Fechas legibles: “3 sep 2026”; en contexto próximo, “Hoy” o “Mañana” con fecha completa accesible. Distinguir “Vence hoy” de “Vencida”. Usar la zona horaria configurada del usuario/equipo; no asumir UTC en presentación.

## 14. Accesibilidad y verificación

Objetivo: WCAG 2.2 nivel AA. La conformidad depende de la implementación completa, no de adoptar esta paleta.

- Texto normal: contraste mínimo 4.5:1; texto grande: 3:1. Controles y gráficos funcionales: 3:1 cuando aplique.
- Navegación completa por teclado, foco visible y no oculto por barras fijas. Alternativa a gestos de arrastre.
- Ninguna información se comunica exclusivamente por color. Labels asociados y nombres accesibles coherentes.
- El mínimo AA de objetivos tiene condiciones y excepciones; Foco adopta un objetivo de producto de 44 px táctiles, superior al mínimo de 24 px en los casos aplicables.
- Revisar zoom de texto al 200%, reflow, errores de formulario y anuncios de estado con lector de pantalla.
- Si hay atajos de una sola letra, permitir desactivarlos o remapearlos; nunca capturarlos mientras se escribe.
- No declarar cumplimiento automático por pasar una herramienta de análisis.

Referencia normativa: [W3C — WCAG 2.2 Quick Reference](https://www.w3.org/WAI/WCAG22/quickref/).

## 15. Pantallas de referencia para implementar

### Mi trabajo

Título, acción Crear tarea y filtros por proyecto/estado. Secciones Hoy, Próximas y Vencidas con conteos y lista compacta. Priorizar acciones sobre métricas decorativas. No mostrar grandes gráficos si no ayudan a decidir qué hacer.

### Proyecto

Ruta de navegación, nombre, breve contexto, miembros y acción Crear tarea. Debajo: tabs Tablero/Lista/Calendario según capacidades reales; después filtros. Tablero neutro con estados discretos y amarillo limitado a la acción principal.

### Ajustes

Navegación secundaria y formulario de ancho limitado. Agrupar Perfil, Apariencia, Notificaciones y Permisos solo si están implementados. Guardar cambios al final del grupo; no colocar un botón global ambiguo.

### Ejemplo de contenido realista

Proyecto: “Sitio web — Cliente de restaurante”. Tarea: “Revisar menú para la página de inicio”. Estado: En revisión. Responsable: nombre real disponible, o “Sin asignar”. Fecha: fecha del proyecto. Checklist: validar textos, revisar fotos, aprobar versión. Los datos de demostración deben estar claramente identificados en prototipos.

## 16. Reglas para desarrolladores y agentes de IA

1. Leer este archivo antes de crear o modificar una pantalla.
2. Reutilizar los componentes existentes y adaptar tokens antes de reemplazar la arquitectura.
3. Separar tokens, componentes base, componentes de dominio y pantallas.
4. No añadir dependencias ni funciones solo por una preferencia estética.
5. Usar HTML semántico; botones para acciones, enlaces para navegación.
6. Mantener las mismas variantes y estados en todas las pantallas; no crear un botón diferente por módulo.
7. Toda nueva vista debe funcionar en claro/oscuro y contemplar vacío, carga, error y permisos.
8. No codificar datos ficticios como si provinieran del sistema; no asumir capacidades del backend.
9. Cualquier excepción visual debe explicar el problema que resuelve y actualizar el documento si se vuelve patrón.
10. Implementar primero una pantalla de proyecto y su detalle de tarea; validar ahí la base antes de extenderla.

## 17. Criterios de aceptación

- [ ] Amarillo #F9ED48 centralizado; ningún verde croma en producción.
- [ ] Recursos de marca limpios, transparentes y legibles en sus tamaños finales.
- [ ] Inter y fallback; títulos y metadatos consistentes.
- [ ] Tokens de ambos temas aplicados a todos los componentes y overlays.
- [ ] Primario, secundario y destructivo claramente diferenciados.
- [ ] Foco de teclado visible y contraste verificado en combinaciones reales, incluidos hover y selección.
- [ ] Tarjetas con título, estado/contexto, fecha y responsable según datos disponibles.
- [ ] Arrastre con alternativa accesible y recuperación ante error.
- [ ] Formularios con labels, errores específicos y conservación de datos.
- [ ] Estados vacíos, carga, desconexión y permisos resueltos.
- [ ] Verificación a 360, 768, 1280 y 1440 px, además del reflow a 320 px.
- [ ] Flujo crear → asignar → mover → revisar → completar comprobado con persistencia real.
- [ ] No hay controles inertes, módulos simulados ni indicadores de guardado falsos.
- [ ] Revisión manual de teclado y lectura asistida, además de análisis automatizado.

## 18. Referencias y decisiones pendientes

- Marca proporcionada: [SVG de EsBrillante](https://esbrillante.mx/img/logo-esbrillante-blanco.svg). Fuente del amarillo #F9ED48; no equivale a un manual completo.
- Tipografía: [Inter — sitio oficial](https://rsms.me/inter/). Familia propuesta para la interfaz; no reemplaza el dibujo del logotipo.
- Accesibilidad: [W3C — WCAG 2.2](https://www.w3.org/WAI/WCAG22/quickref/).

Pendiente al integrar: revisar pantallas y stack existentes, mapear permisos y estados reales, preparar los SVG finales de Foco y validar los contrastes dentro de los componentes implementados. No se requiere cambiar la lógica del negocio para adoptar la línea visual.
