/* revision.js — EsBrillante Pages · Sistema de Revisión v3 (Pastel-inspired) */
(function () {
  'use strict';

  /* ── 1. Constantes ──────────────────────────────────────────────────────── */
  /* document.currentScript solo es válido de forma síncrona al arrancar el script — capturarlo ya */
  const SCRIPT_TAG = document.currentScript;
  const TIPO = SCRIPT_TAG && SCRIPT_TAG.dataset.tipo === 'pagina_web' ? 'pagina_web' : 'prototipo';
  /* Origen real del servidor de EsBrillante Pages, tomado de dónde se cargó este script (`.src`
     siempre resuelve a absoluto). No usar rutas raíz-relativas sueltas para nuestras propias
     llamadas: cuando esta página es un proxy de una URL externa (ver httpServer.ts), el <base>
     que apunta al dominio externo haría que esas rutas resolvieran contra el dominio equivocado. */
  const API_BASE = SCRIPT_TAG ? new URL(SCRIPT_TAG.src, location.href).origin : location.origin;

  const params = new URLSearchParams(location.search);
  const ROL  = params.get('rol') === 'equipo' ? 'equipo' : 'cliente';
  /* Cuando Foco abre el link para alguien del equipo, manda su nombre real de sesión en la URL
     (junto con rol=equipo) — así no se le pregunta y sus comentarios no quedan etiquetados como
     "Cliente". Mismo nivel de confianza que ya tenía `rol` (ninguno — es un query param abierto,
     no un token firmado); no cambia el modelo de confianza existente, solo evita una pregunta
     redundante cuando el link ya viene de una sesión autenticada de Foco. */
  const NOMBRE_URL = (params.get('nombre') || '').trim();
  const SLUG = (location.pathname.match(/\/p\/([^/?#]+)/) || [])[1]
             || location.pathname.replace(/^\/|\/$/g, '').replace(/\//g, '-')
             || 'demo';
  /* Sub-ruta dentro del sitio (solo aplica a páginas externas multipágina — ver httpServer.ts
     /p/:slug/*): "/p/armado-web/nosotros.html" -> "/nosotros.html". "/index.html" (y variantes
     sin sufijo) se normalizan a "/" porque son la misma página de inicio vista de dos formas. Un
     prototipo de un solo archivo siempre da "/". Todas las anotaciones se guardan juntas por slug
     (un solo archivo en el servidor); esto es solo para saber a cuál página pertenece cada una. */
  const PAGINA = (() => {
    const prefix = `/p/${SLUG}`;
    const resto = location.pathname.startsWith(prefix) ? location.pathname.slice(prefix.length) : '';
    if (!resto || resto === '/') return '/';
    return resto.replace(/\/index\.html?$/i, '/') || '/';
  })();
  const LS_ANNS      = `ebr_anns_${SLUG}`;
  const LS_LOCATE    = `ebr_locate_${SLUG}`; // sessionStorage: id de anotación a enfocar tras navegar de otra página del mismo sitio
  const LS_NOMBRE    = 'esbrillante_revisor_nombre';
  const LS_HELP_SEEN = 'ebr_help_seen';
  const AUDIO_BASE   = API_BASE + '/resources/audio/';
  /* Ancho máximo del contenido revisado (ver limitarAnchoContenido) — un monitor muy ancho/4K
     estira layouts fluidos (%, flex sin límite) más allá de lo que el diseño contempla, y como
     los pines guardan coordenadas de página en píxeles, quedan desalineados al revisar en una
     pantalla de otro tamaño. 1920px cubre cualquier resolución de escritorio "normal". */
  const CONTENT_MAX_WIDTH = 1920;

  /* Guía interactiva de uso — pasos con spotlight + audio narrado (Gemini TTS) */
  const GUIDE_STEPS = [
    {
      audio: TIPO === 'pagina_web' ? 'paso0-pagina-web.mp3' : 'paso0-prototipo.mp3',
      title: '👋 Antes de empezar',
      text: TIPO === 'pagina_web'
        ? 'Esta es la propuesta visual real de tu sitio. Revisa el diseño, los textos y las imágenes, y dinos qué ajustar.'
        : 'Este es un boceto de la estructura de tu sitio, tipo wireframe. Todavía no es el diseño final: enfócate en si la información está en el lugar correcto y si el flujo tiene sentido.',
      target: null,
    },
    {
      audio: 'paso1-comentar.mp3',
      text: 'El modo Comentar ya está activo por defecto. Usa este switch si quieres solo navegar sin comentar.',
      target: '#ebr-mode-switch',
      activateComment: true,
    },
    {
      audio: 'paso2-clic.mp3',
      text: 'Haz clic en cualquier parte de la página. Puedes comentar, sugerir un cambio de texto, decir que te gusta, o pedir que se elimine.',
      target: null,
    },
    {
      audio: 'paso3-contador.mp3',
      text: 'Aquí ves todos tus comentarios. Haz clic para abrir la lista completa.',
      target: '#ebr-bar-count',
    },
    {
      audio: 'paso4-terminar.mp3',
      text: 'Cuando termines, haz clic en Terminar revisión para avisarle al equipo.',
      target: '#ebr-btn-finish',
    },
  ];

  const C = {
    cliente    : { pin:'#f59e0b', txt:'#000', tagBg:'#fef3c7', tagTxt:'#92400e' },
    equipo     : { pin:'#10b981', txt:'#fff', tagBg:'#d1fae5', tagTxt:'#065f46' },
    sugerencia : { pin:'#6366f1', txt:'#fff', tagBg:'#ede9fe', tagTxt:'#4338ca' },
    me_gusta   : { pin:'#ec4899', txt:'#fff', tagBg:'#fce7f3', tagTxt:'#9d174d' },
    eliminar   : { pin:'#ef4444', txt:'#fff', tagBg:'#fee2e2', tagTxt:'#991b1b' },
    resuelto   : { pin:'#d1d5db', txt:'#9ca3af', tagBg:'#f3f4f6', tagTxt:'#6b7280' },
  };

  /* ── 3. Estado ──────────────────────────────────────────────────────────── */
  let annotations  = [];
  let commentMode  = false;
  let suggEditMode = false;     // modo edición inline activo
  let hoveredEl    = null;
  let activeSelEl  = null;      // elemento siendo editado inline
  let activeSelOriginal = '';   // texto original antes de editar
  let sidebarOpen  = false;
  let choiceData   = null;
  let pendingClick = null;
  let editingId    = null;
  let searchQuery  = '';
  let fRol = 'todos', fEst = 'todos';
  let soloEstaPagina = false;
  let paginasColapsadas = null; // Set<string> — null hasta el primer render con >1 página (ver renderSidebar)
  let authorName   = localStorage.getItem(LS_NOMBRE) || '';

  /* ── 4. Persistencia: localStorage + API del servidor ──────────────────── */
  function loadFromLocalStorage() {
    try { return JSON.parse(localStorage.getItem(LS_ANNS) || '[]'); } catch { return []; }
  }
  function persistLocal() { localStorage.setItem(LS_ANNS, JSON.stringify(annotations)); }

  async function syncAnnotationsFromApi() {
    try {
      const resp = await fetch(API_BASE + '/api/anotaciones/' + SLUG);
      if (!resp.ok) return;
      const data = await resp.json();
      if (Array.isArray(data)) { annotations = data; persistLocal(); }
    } catch { /* sin servidor — usar localStorage */ }
  }

  function apiCreate(ann) {
    fetch(API_BASE + '/api/anotaciones/' + SLUG, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ann),
    }).catch(() => {});
  }

  function apiPatch(id, patch) {
    fetch(API_BASE + '/api/anotaciones/' + SLUG + '/' + id, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }).catch(() => {});
  }

  function apiDelete(id) {
    fetch(API_BASE + '/api/anotaciones/' + SLUG + '/' + id, { method: 'DELETE' }).catch(() => {});
  }

  function newAnnotation(x, y, selector, tipo, contenido) {
    const ann = {
      id: `ann_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      slug: SLUG, tipo, rol: ROL,
      autor: authorName, fecha: new Date().toISOString(),
      estado: 'pendiente', selector,
      numero: annotations.length + 1,
      posicion: { x: Math.round(x), y: Math.round(y) },
      contenido, pagina: PAGINA,
    };
    annotations.push(ann);
    persistLocal();
    apiCreate(ann);
    return ann;
  }

  function resolveAnn(id) {
    const a = annotations.find(x => x.id === id);
    if (a) { a.estado = 'resuelto'; persistLocal(); apiPatch(id, { estado: 'resuelto' }); }
    return a;
  }

  function updateAnnotation(id, texto) {
    const a = annotations.find(x => x.id === id);
    if (a) { a.contenido.texto = texto; persistLocal(); apiPatch(id, { contenido: { texto } }); }
    return a;
  }

  function deleteAnn(id) {
    annotations = annotations.filter(a => a.id !== id);
    annotations.forEach((a, i) => { a.numero = i + 1; });
    persistLocal();
    apiDelete(id);
  }

  /** Aplica/retira la opacidad de "marcado para eliminar" según el estado actual de las anotaciones. */
  function syncEliminarOverlays() {
    document.querySelectorAll('.ebr-marked-delete').forEach(el => el.classList.remove('ebr-marked-delete'));
    annotations
      // Solo de esta página: un selector genérico (ej. "header") podría matchear por
      // casualidad un elemento de otra página del mismo sitio con estructura parecida.
      .filter(a => paginaDe(a) === PAGINA && a.contenido.accion === 'eliminar' && a.estado === 'pendiente')
      .forEach(a => {
        let el;
        try { el = document.querySelector(a.selector); } catch { el = null; }
        if (el) el.classList.add('ebr-marked-delete');
      });
  }

  /* ── 5. Arranque ────────────────────────────────────────────────────────── */
  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }
  ready(() => {
    limitarAnchoContenido();
    injectCSS();
    annotations = loadFromLocalStorage(); // render inmediato desde localStorage
    if (ROL === 'equipo' && NOMBRE_URL) {
      authorName = NOMBRE_URL;
      localStorage.setItem(LS_NOMBRE, authorName);
    }
    syncAnnotationsFromApi().then(() => {  // luego sincroniza desde servidor
      if (!authorName) showNameModal();
      else buildUI();
      resumirLocateEntrePaginas();
    });
  });

  /** Si "↗ Ver" en el sidebar mandó a otra página del sitio para llegar a una anotación, al
   *  cargar aquí la retoma: enfoca el pin y hace scroll, igual que si se hubiera hecho clic
   *  estando ya en esta página. */
  function resumirLocateEntrePaginas() {
    const id = sessionStorage.getItem(LS_LOCATE);
    if (!id) return;
    sessionStorage.removeItem(LS_LOCATE);
    const ann = annotations.find(a => a.id === id);
    if (ann) setTimeout(() => locateAnn(ann), 350);
  }

  /* ── 5b. Límite de ancho ────────────────────────────────────────────────── */
  /**
   * Envuelve todo el contenido original del <body> en un contenedor con ancho máximo, ANTES de
   * agregar cualquier UI propia (que se añade después, fuera de este wrap, y por eso sigue
   * ocupando el ancho completo de la ventana). Sin esto, en un monitor muy ancho un layout fluido
   * (%, flex/grid sin límite) se estira más de lo que el diseño contempla, y como los pines
   * guardan coordenadas de página en píxeles (posicion.x/y, tomadas del clic), la misma anotación
   * ya no coincide con el elemento al revisarla desde una pantalla de otro tamaño.
   *
   * A propósito NO se centra (nada de `margin:auto`): centrar movería el punto de origen del
   * contenido según el ancho de cada ventana (el margen izquierdo variaría por persona), que es
   * el mismo problema con otro disfraz. Se deja pegado a la izquierda para que el origen (x=0)
   * sea siempre el mismo sin importar el monitor — el espacio sobrante en monitores anchos queda
   * en blanco a la derecha.
   *
   * Límite conocido: elementos con `position:fixed` (headers/navs fijos) no quedan contenidos por
   * este wrap — sigue siendo el navegador quien los posiciona relativos a la ventana completa, así
   * que un pin sobre un elemento dentro de un header fijo puede seguir desalineándose en monitores
   * muy anchos. Cubre el caso común (contenido en flujo normal), no ese caso específico.
   */
  function limitarAnchoContenido() {
    if (document.getElementById('ebr-content-wrap')) return;
    const wrap = document.createElement('div');
    wrap.id = 'ebr-content-wrap';
    while (document.body.firstChild) wrap.appendChild(document.body.firstChild);
    document.body.appendChild(wrap);
  }

  /* ── 6. CSS ─────────────────────────────────────────────────────────────── */
  function injectCSS() {
    const s = document.createElement('style');
    s.id = 'ebr-css';
    s.textContent = `
#ebr-bottombar,#ebr-bottombar *,#ebr-sidebar,#ebr-sidebar *,
#ebr-popover,#ebr-popover *,#ebr-name-modal,#ebr-name-modal *,
#ebr-sel-bar,#ebr-sel-bar *,#ebr-sugg-bar,#ebr-sugg-bar *,
#ebr-guide-card,#ebr-guide-card *,
.ebr-pin,.ebr-pin *{box-sizing:border-box;font-family:system-ui,-apple-system,sans-serif;}

/* El Preview Bar nativo de Shopify (al revisar un tema sin publicar vía
   ?preview_theme_id=) se renderiza en un iframe que, en la práctica, se pinta
   por encima incluso de elementos con z-index mucho más alto que el suyo —
   confirmado en vivo: nuestra barra queda perfectamente posicionada debajo
   del iframe hasta que este se oculta. Como esa barra no aporta nada al
   flujo de revisión (solo repite Hide bar/Exit preview/Copy link, ajenos a
   EsBrillante), se oculta directamente en vez de pelear con su stacking. */
#PBarNextFrame{display:none!important;}

/* ── Barra inferior ── */
#ebr-bottombar{
  position:fixed;bottom:0;left:0;right:0;z-index:1999980000;
  height:59px;background:#111;
  display:flex;align-items:center;padding:0 14px;gap:8px;
}
/* Franja degradada arriba de la barra — continúa visualmente el marco ámbar de la página,
   que queda tapado en su borde inferior por esta misma barra (más alto z-index). */
#ebr-bottombar::before{
  content:'';position:absolute;top:0;left:0;right:0;height:4px;
  background:linear-gradient(90deg,#f8be00,#f59e0b,#f8be00);
}
.ebr-bar-left{display:flex;align-items:center;gap:8px;flex-shrink:0;}
.ebr-bar-logo{font-size:13px;font-weight:800;color:#f8be00;letter-spacing:-.3px;}
.ebr-bar-sep{color:#555;font-size:13px;}
.ebr-bar-rol{font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;
  text-transform:uppercase;letter-spacing:.05em;}
.ebr-spacer{flex:1;}

/* Switch Navegar/Comentar, estilo interruptor */
.ebr-switch{display:flex;align-items:center;gap:10px;flex-shrink:0;}
.ebr-switch-label{font-size:13px;font-weight:600;color:#777;cursor:pointer;transition:color .15s;}
.ebr-switch-label:hover{color:#bbb;}
.ebr-switch-label.active{color:#fff;}
.ebr-switch-track{
  position:relative;width:42px;height:24px;border-radius:14px;flex-shrink:0;
  background:#333;border:1px solid #444;cursor:pointer;padding:0;
  transition:background-color .2s,border-color .2s;
}
.ebr-switch-track.on{background:#f59e0b;border-color:#f59e0b;}
.ebr-switch-thumb{
  position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;
  background:#fff;transition:transform .2s ease;box-shadow:0 1px 3px rgba(0,0,0,.35);
}
.ebr-switch-track.on .ebr-switch-thumb{transform:translateX(18px);}

/* Botones secundarios de la barra (Compartir, Descargar) */
.ebr-bar-btn{
  border:1.5px solid #4a4a4a;border-radius:8px;padding:6px 12px;
  font-size:12px;font-weight:700;cursor:pointer;flex-shrink:0;
  background:#242424;color:#bbb;
  transition:border-color .15s,color .15s,background .15s;
}
.ebr-bar-btn:hover{border-color:#f59e0b;color:#f59e0b;background:#2a1f00;}
.ebr-bar-btn.copied{border-color:#22c55e;color:#22c55e;background:#0f2417;}

/* Botón de comentarios (contador) */
#ebr-bar-count{
  display:flex;align-items:center;gap:6px;
  background:#242424;border:1px solid #484848;border-radius:20px;
  padding:5px 12px;color:#ccc;font-size:12px;font-weight:600;
  cursor:pointer;transition:background .15s,color .15s,border-color .15s;
  white-space:nowrap;flex-shrink:0;
}
#ebr-bar-count:hover{background:#303030;color:#fff;border-color:#666;}
#ebr-bar-count.has-pending{border-color:#f59e0b;color:#f59e0b;}
#ebr-bar-count.has-pending:hover{background:#2a1f00;border-color:#f59e0b;}
.ebr-count-dot{
  width:7px;height:7px;border-radius:50%;background:#f59e0b;flex-shrink:0;display:none;
}
#ebr-bar-count.has-pending .ebr-count-dot{display:block;}

/* Ícono de ayuda */
#ebr-help-btn{
  width:30px;height:30px;border-radius:50%;
  border:1.5px solid #4a4a4a;background:#242424;
  color:#bbb;font-size:14px;font-weight:800;
  cursor:pointer;display:flex;align-items:center;justify-content:center;
  transition:border-color .15s,color .15s,background .15s;flex-shrink:0;line-height:1;
}
#ebr-help-btn:hover{border-color:#f59e0b;color:#f59e0b;background:#2a1f00;}

/* Botón terminar revisión */
#ebr-btn-finish{
  border:none;border-radius:20px;padding:8px 16px;
  font-size:12px;font-weight:700;cursor:pointer;flex-shrink:0;
  background:#f59e0b;color:#000;
  transition:opacity .15s,transform .15s,box-shadow .15s;
}
#ebr-btn-finish:hover{opacity:.92;transform:translateY(-1px);box-shadow:0 4px 14px rgba(245,158,11,.35);}

/* Marco ámbar alrededor de toda la página — indica que está en modo revisión */
#ebr-frame-border{
  position:fixed;inset:0;z-index:1999800000;pointer-events:none;
  border:5px solid transparent;
  border-image:linear-gradient(135deg,#f8be00,#f59e0b,#fbbf24,#f59e0b,#f8be00) 1;
}

body{padding-bottom:59px!important;}

/* Contenido original de la página, limitado en ancho — ver limitarAnchoContenido().
   Sin margin:auto a propósito: alineado a la izquierda para que el origen (x=0) de las
   coordenadas de página no dependa del ancho de la ventana de quien revisa. */
#ebr-content-wrap{max-width:${CONTENT_MAX_WIDTH}px;}

/* ── Hover highlight ── */
.ebr-hover{outline:2px solid #f59e0b!important;outline-offset:1px!important;cursor:cell!important;}
.ebr-hover-equipo{outline:2px solid #10b981!important;outline-offset:1px!important;cursor:cell!important;}

/* Marcado para eliminar — guía visual mientras la anotación esté pendiente */
.ebr-marked-delete{
  opacity:.35!important;
  filter:saturate(.4);
  outline:1.5px dashed #ef4444!important;outline-offset:2px!important;
  transition:opacity .2s,filter .2s;
}

/* Tooltip cursor */
#ebr-tip{
  position:fixed;z-index:1999960000;background:#111;color:#f8be00;
  font-size:11px;font-weight:600;padding:4px 10px;border-radius:20px;
  pointer-events:none;display:none;white-space:nowrap;transform:translate(12px,-50%);
}
#ebr-tip.on{display:block;}

/* ── Mini toolbar de selección de texto ── */
#ebr-sel-bar{
  position:absolute;z-index:192000000;display:none;
  background:#111;border-radius:8px;
  box-shadow:0 4px 16px rgba(0,0,0,.3);
  padding:4px;gap:2px;display:none;flex-direction:row;
  transform:translateX(-50%);
}
#ebr-sel-bar.on{display:flex;}
.ebr-sel-btn{
  border:none;border-radius:6px;padding:6px 11px;
  font-size:12px;font-weight:600;cursor:pointer;
  transition:opacity .15s;white-space:nowrap;
}
#ebr-sel-comment{background:#2a2a2a;color:#fff;}
#ebr-sel-comment:hover{background:#333;}
#ebr-sel-suggest{background:#f59e0b;color:#000;}
#ebr-sel-suggest:hover{opacity:.85;}

/* ── Barra de edición inline (reemplaza nav) ── */
#ebr-sugg-bar{
  position:fixed;top:0;left:0;right:0;z-index:1999980000;
  height:48px;background:#111;border-bottom:2px solid #6366f1;
  display:none;align-items:center;padding:0 16px;gap:10px;
}
#ebr-sugg-bar.on{display:flex;}
.ebr-sugg-info{color:#aaa;font-size:12px;flex-shrink:0;}
.ebr-sugg-info strong{color:#fff;}
.ebr-sugg-spacer{flex:1;}
#ebr-sugg-cancel{border:none;border-radius:8px;padding:7px 14px;
  font-size:12px;font-weight:600;cursor:pointer;background:#2a2a2a;color:#aaa;}
#ebr-sugg-cancel:hover{color:#fff;}
#ebr-sugg-save{border:none;border-radius:8px;padding:7px 16px;
  font-size:12px;font-weight:700;cursor:pointer;background:#6366f1;color:#fff;
  transition:opacity .15s;}
#ebr-sugg-save:hover{opacity:.85;}

body.ebr-sugg-active{padding-top:48px!important;}

/* ── Pins ── */
#ebr-pins{position:absolute;top:0;left:0;width:0;height:0;overflow:visible;z-index:180000000;pointer-events:none;}

@keyframes ebr-pop{
  from{transform:translate(-50%,-100%) rotate(-45deg) scale(0);opacity:0;}
  to  {transform:translate(-50%,-100%) rotate(-45deg) scale(1);opacity:1;}
}
.ebr-pin{
  position:absolute;width:26px;height:26px;border-radius:50% 50% 50% 0;
  transform:translate(-50%,-100%) rotate(-45deg);
  display:flex;align-items:center;justify-content:center;
  cursor:pointer;pointer-events:all;box-shadow:0 2px 8px rgba(0,0,0,.3);
  transition:transform .2s,box-shadow .2s;animation:ebr-pop .22s cubic-bezier(.34,1.56,.64,1);
  z-index:180020000;
}
.ebr-pin:hover{transform:translate(-50%,-115%) rotate(-45deg) scale(1.15);box-shadow:0 4px 14px rgba(0,0,0,.4);}
.ebr-pin span{transform:rotate(45deg);font-size:10px;font-weight:800;pointer-events:none;}

/* ── Popover ── */
#ebr-popover{
  position:absolute;z-index:190000000;background:#fff;
  border:1px solid #e5e7eb;border-radius:12px;
  box-shadow:0 8px 32px rgba(0,0,0,.16);width:296px;padding:14px;display:none;
}
#ebr-popover.on{display:block;}
.ebr-pop-head{display:flex;align-items:center;gap:7px;margin-bottom:10px;}
.ebr-pop-dot{width:16px;height:16px;border-radius:50%;flex-shrink:0;}
.ebr-pop-head span{font-size:12px;font-weight:700;color:#111;}
.ebr-pop-quote{
  background:#fef9ec;border-left:2px solid #f59e0b;
  border-radius:0 6px 6px 0;padding:6px 9px;
  font-size:11px;color:#92400e;margin-bottom:8px;
  word-break:break-word;line-height:1.4;
  max-height:56px;overflow:hidden;
  display:none;
}
.ebr-pop-quote.on{display:block;}
#ebr-pop-txt{
  width:100%;border:1.5px solid #e5e7eb;border-radius:8px;
  padding:8px 10px;font-size:13px;line-height:1.5;
  resize:vertical;min-height:68px;outline:none;color:#111;
  transition:border-color .15s;
}
#ebr-pop-txt:focus{border-color:#f59e0b;box-shadow:0 0 0 3px rgba(245,158,11,.1);}
.ebr-pop-hint{font-size:11px;color:#9ca3af;margin:5px 0 0;font-style:italic;}
.ebr-pop-acts{display:flex;gap:7px;margin-top:10px;}
.ebr-pop-acts button{flex:1;border:none;border-radius:8px;padding:8px;
  font-size:13px;font-weight:600;cursor:pointer;transition:opacity .15s;}
#ebr-pop-save{background:#111;color:#fff;}
#ebr-pop-save:hover{opacity:.85;}
#ebr-pop-cancel{background:#f3f4f6;color:#374151;}
#ebr-pop-cancel:hover{background:#e5e7eb;}
.ebr-pop-shortcut{font-size:10px;color:#c4c4c4;text-align:right;margin-top:4px;}

/* ── Sidebar IZQUIERDO ── */
#ebr-sidebar{
  position:fixed;top:0;left:0;width:300px;height:calc(100vh - 50px);
  background:#fff;border-right:1px solid #f0f0f0;
  box-shadow:4px 0 24px rgba(0,0,0,.08);z-index:188000000;
  display:flex;flex-direction:column;
  transform:translateX(-100%);transition:transform .25s ease;
}
#ebr-sidebar.open{transform:translateX(0);}
#ebr-sb-head{padding:12px;border-bottom:1px solid #f3f4f6;flex-shrink:0;}
#ebr-sb-head h3{font-size:13px;font-weight:700;margin:0 0 10px;color:#111;}
#ebr-sb-search{
  width:100%;border:1.5px solid #e5e7eb;border-radius:8px;
  padding:7px 10px;font-size:12px;outline:none;color:#111;
  margin-bottom:8px;transition:border-color .15s;
}
#ebr-sb-search:focus{border-color:#f59e0b;}
.ebr-filters{display:flex;gap:4px;flex-wrap:wrap;}
.ebr-filters+.ebr-filters{margin-top:4px;}
.ebr-f{border:1px solid #e5e7eb;border-radius:20px;padding:3px 9px;
  font-size:11px;font-weight:600;cursor:pointer;background:#fff;color:#374151;transition:all .15s;}
.ebr-f.on{background:#111;color:#fff;border-color:#111;}
#ebr-sb-list{flex:1;overflow-y:auto;padding:8px;}
#ebr-sb-empty{text-align:center;color:#9ca3af;font-size:13px;padding:36px 16px;line-height:1.7;}
.ebr-sb-group-head{
  display:flex;align-items:center;gap:6px;cursor:pointer;user-select:none;
  font-size:11px;font-weight:800;color:#6b7280;text-transform:uppercase;letter-spacing:.04em;
  padding:12px 4px 6px;border-radius:6px;transition:background .12s;
}
.ebr-sb-group-head:hover{background:#f9fafb;}
.ebr-sb-group-head:first-child{padding-top:2px;}
.ebr-sb-group-arrow{font-size:9px;color:#9ca3af;width:9px;flex-shrink:0;}
.ebr-sb-group-count{
  background:#f3f4f6;color:#6b7280;border-radius:20px;padding:1px 7px;
  font-size:10px;font-weight:700;text-transform:none;letter-spacing:normal;
}
#ebr-sb-solopagina{
  display:flex;align-items:center;gap:6px;margin-top:8px;
  font-size:11px;color:#6b7280;cursor:pointer;user-select:none;
}
#ebr-sb-solopagina input{margin:0;cursor:pointer;}
.ebr-card{border:1px solid #f3f4f6;border-radius:10px;padding:11px;margin-bottom:6px;
  transition:border-color .15s,box-shadow .15s;}
.ebr-card:hover{border-color:#e5e7eb;box-shadow:0 2px 8px rgba(0,0,0,.05);}
.ebr-card.resuelto{opacity:.5;}
.ebr-card-head{display:flex;align-items:center;gap:7px;margin-bottom:7px;}
.ebr-card-dot{width:20px;height:20px;border-radius:50%;display:flex;
  align-items:center;justify-content:center;font-size:10px;font-weight:800;flex-shrink:0;}
.ebr-card-meta{flex:1;min-width:0;}
.ebr-card-autor{font-size:12px;font-weight:700;color:#111;}
.ebr-card-fecha{font-size:11px;color:#9ca3af;}
.ebr-card-rol{font-size:10px;font-weight:700;padding:2px 7px;border-radius:10px;flex-shrink:0;}
.ebr-card-txt{font-size:13px;color:#374151;line-height:1.5;margin-bottom:8px;word-break:break-word;}
.ebr-card-diff{margin-bottom:8px;}
.ebr-diff-orig{font-size:12px;color:#dc2626;text-decoration:line-through;
  background:#fef2f2;padding:4px 7px;border-radius:5px;word-break:break-word;display:block;margin-bottom:3px;}
.ebr-diff-new{font-size:12px;color:#065f46;background:#f0fdf4;
  padding:4px 7px;border-radius:5px;word-break:break-word;display:block;}
.ebr-diff-new::before{content:'→ ';}
.ebr-card-acts{display:flex;gap:5px;flex-wrap:wrap;}
.ebr-act{border:none;border-radius:20px;padding:3px 9px;
  font-size:11px;font-weight:600;cursor:pointer;transition:opacity .15s;}
.ebr-act:hover{opacity:.8;}
.ebr-act-resolve{background:#d1fae5;color:#065f46;}
.ebr-act-locate {background:#eff6ff;color:#1e40af;}
.ebr-act-delete {background:#fee2e2;color:#991b1b;}

/* ── Modal nombre ── */
#ebr-name-modal{position:fixed;inset:0;z-index:1999960000;display:flex;
  align-items:center;justify-content:center;
  background:rgba(0,0,0,.6);backdrop-filter:blur(4px);}
#ebr-name-card{background:#fff;border-radius:16px;padding:32px;
  width:360px;max-width:calc(100vw - 32px);box-shadow:0 20px 60px rgba(0,0,0,.3);}
.ebr-nm-brand{font-size:12px;font-weight:800;color:#f8be00;background:#111;
  display:inline-block;padding:3px 10px;border-radius:6px;margin-bottom:16px;}
#ebr-name-card h2{font-size:20px;font-weight:800;margin:0 0 6px;color:#111;}
#ebr-name-card p{font-size:13px;color:#6b7280;margin:0 0 20px;line-height:1.5;}
#ebr-name-inp{width:100%;border:2px solid #e5e7eb;border-radius:10px;
  padding:12px 16px;font-size:15px;outline:none;color:#111;
  margin-bottom:16px;transition:border-color .15s;}
#ebr-name-inp:focus{border-color:#f59e0b;}
#ebr-name-ok{width:100%;background:#f59e0b;color:#000;border:none;border-radius:10px;
  padding:14px;font-size:15px;font-weight:700;cursor:pointer;transition:opacity .15s,transform .15s;}
#ebr-name-ok:hover{opacity:.85;transform:translateY(-1px);}

/* Elemento enfocado — spotlight via box-shadow infinito.
   z-index intencional MENOR que #ebr-pins (9000) para que los pines
   queden siempre visibles encima del efecto de oscurecimiento. */
.ebr-focused{
  position:relative;z-index:60000000!important;
  outline:2.5px solid #f59e0b!important;
  outline-offset:3px!important;
  border-radius:3px;
  box-shadow:0 0 0 9999px rgba(0,0,0,.4)!important;
  transition:box-shadow .15s;
}
.ebr-focused-equipo{
  position:relative;z-index:60000000!important;
  outline:2.5px solid #10b981!important;
  outline-offset:3px!important;
  border-radius:3px;
  box-shadow:0 0 0 9999px rgba(0,0,0,.4)!important;
  transition:box-shadow .15s;
}

/* ── Popover de elección (clic → ¿qué quieres hacer?) ── */
#ebr-choice{
  position:absolute;z-index:192000000;background:#fff;
  border:1px solid #e5e7eb;border-radius:12px;
  box-shadow:0 12px 36px rgba(0,0,0,.22);
  width:236px;padding:5px;display:none;
}
#ebr-choice.on{display:block;}
.ebr-ch-label{
  font-size:10px;font-weight:700;color:#9ca3af;
  padding:5px 10px 4px;text-transform:uppercase;letter-spacing:.06em;
}
.ebr-ch-btn{
  display:flex;align-items:center;gap:10px;
  border:none;border-radius:8px;padding:9px 10px;
  font-size:13px;font-weight:600;cursor:pointer;
  background:transparent;color:#111;width:100%;text-align:left;
  transition:background .12s;
}
.ebr-ch-btn:hover{background:#f3f4f6;}
.ebr-ch-btn.sugg:hover{background:#ede9fe;color:#4338ca;}
.ebr-ch-btn.like:hover{background:#fce7f3;color:#be185d;}
.ebr-ch-btn.del:hover{background:#fee2e2;color:#b91c1c;}
.ebr-ch-icon{font-size:18px;line-height:1;flex-shrink:0;}
.ebr-ch-sub{font-size:11px;color:#9ca3af;font-weight:400;margin-top:1px;}

/* ── Toast ── */
#ebr-toast{
  position:fixed;bottom:64px;left:50%;transform:translateX(-50%);z-index:1999980000;
  background:#111;color:#fff;font-size:13px;font-weight:600;
  padding:10px 20px;border-radius:20px;pointer-events:none;
  opacity:0;transition:opacity .3s;white-space:nowrap;
}
#ebr-toast.on{opacity:1;}

/* ── Guía interactiva ── */
#ebr-guide-backdrop{position:fixed;inset:0;z-index:1999960000;background:rgba(0,0,0,.96);display:none;}
#ebr-guide-backdrop.on{display:block;}
#ebr-guide-card{
  --glow:0;
  position:fixed;z-index:2000000000;background:#1b1917;border-radius:16px;
  padding:20px;width:300px;display:none;
  border:2px solid rgba(245,158,11,calc(.28 + .5 * var(--glow)));
  box-shadow:
    0 20px 60px rgba(0,0,0,.45),
    0 0 calc(14px + 46px*var(--glow)) calc(2px + 14px*var(--glow)) rgba(245,158,11,calc(.25 + .45*var(--glow)));
}
#ebr-guide-card.on{display:block;}
#ebr-guide-card.centered{left:50%;top:50%;transform:translate(-50%,-50%);}
/* Anillo de luz giratoria alrededor del borde, tipo asistente de voz — se suma al glow reactivo */
@property --guide-angle{syntax:'<angle>';inherits:false;initial-value:0deg;}
#ebr-guide-card::before{
  content:'';position:absolute;inset:-3px;border-radius:inherit;padding:3px;z-index:-1;
  background:conic-gradient(from var(--guide-angle),transparent 0%,rgba(245,158,11,.95) 12%,transparent 30%,transparent 100%);
  -webkit-mask:linear-gradient(#fff 0 0) content-box,linear-gradient(#fff 0 0);
  -webkit-mask-composite:xor;mask-composite:exclude;
  animation:ebr-guide-spin 3.5s linear infinite;
  pointer-events:none;
}
@keyframes ebr-guide-spin{to{--guide-angle:360deg;}}
/* Paso sin botón objetivo — casi pantalla completa, letra grande */
#ebr-guide-card.big{
  width:min(90vw,760px);border-radius:28px;padding:clamp(32px,6vw,72px);
}
#ebr-guide-card.big .ebr-guide-step{font-size:13px;margin-bottom:14px;}
#ebr-guide-card.big .ebr-guide-title{font-size:clamp(24px,3.4vw,36px);margin-bottom:18px;}
#ebr-guide-card.big .ebr-guide-text{font-size:clamp(18px,2.4vw,24px);line-height:1.6;margin-bottom:32px;}
#ebr-guide-card.big .ebr-guide-audio{font-size:14px;padding:8px 16px;margin-bottom:24px;}
#ebr-guide-card.big .ebr-guide-next{font-size:16px;padding:12px 28px;}
.ebr-guide-step{font-size:11px;font-weight:700;color:#f59e0b;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px;}
.ebr-guide-title{font-size:16px;font-weight:800;color:#fff;margin-bottom:8px;}
.ebr-guide-text{font-size:13px;color:#d1d5db;line-height:1.6;margin-bottom:14px;}
.ebr-guide-word{display:inline-block;opacity:.4;transition:opacity .18s ease,color .18s ease;}
.ebr-guide-word.read{opacity:1;}
.ebr-guide-word.active{color:#f59e0b;}
.ebr-guide-audio{
  display:inline-flex;align-items:center;gap:6px;border:1.5px solid rgba(255,255,255,.25);border-radius:20px;
  padding:5px 12px;font-size:12px;font-weight:600;color:#e5e7eb;background:transparent;cursor:pointer;
  margin-bottom:14px;transition:border-color .15s,color .15s,background-color .15s;
}
.ebr-guide-audio:hover{border-color:#f59e0b;color:#f59e0b;}
.ebr-guide-audio.playing{border-color:#f59e0b;color:#f59e0b;background:rgba(245,158,11,.15);}
.ebr-guide-nav{display:flex;align-items:center;gap:8px;}
.ebr-guide-skip{font-size:12px;color:#9ca3af;cursor:pointer;transition:color .15s;}
.ebr-guide-skip:hover{color:#d1d5db;}
.ebr-guide-spacer{flex:1;}
.ebr-guide-next{border:none;border-radius:20px;padding:8px 18px;font-size:13px;font-weight:700;
  cursor:pointer;background:#f59e0b;color:#000;transition:opacity .15s;}
.ebr-guide-next:hover{opacity:.85;}
`;
    document.head.appendChild(s);
  }

  /* ── 7. Modal nombre ────────────────────────────────────────────────────── */
  function showNameModal() {
    const m = el('div', { id: 'ebr-name-modal' });
    m.innerHTML = `
      <div id="ebr-name-card">
        <span class="ebr-nm-brand">EsBrillante</span>
        <h2>¿Cómo te llamas?</h2>
        <p>Tu nombre aparecerá junto a cada comentario en este prototipo.</p>
        <input id="ebr-name-inp" type="text" placeholder="Ej: Ana García" maxlength="40" autocomplete="name">
        <button id="ebr-name-ok">Entrar a revisión →</button>
      </div>`;
    document.body.appendChild(m);
    const inp = document.getElementById('ebr-name-inp');
    inp.focus();
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') confirm(); });
    document.getElementById('ebr-name-ok').addEventListener('click', confirm);
    function confirm() {
      const v = inp.value.trim();
      if (!v) { inp.style.borderColor = '#ef4444'; return; }
      authorName = v;
      localStorage.setItem(LS_NOMBRE, v);
      m.remove();
      buildUI();
    }
  }

  /* ── 8. Build UI ────────────────────────────────────────────────────────── */
  function buildUI() {
    document.body.appendChild(el('div', { id: 'ebr-frame-border' }));
    buildBottomBar();
    buildSuggBar();
    buildSelBar();
    buildChoice();
    buildCursorTip();
    buildPinLayer();
    buildPopover();
    buildSidebar();
    buildToast();
    buildGuideUI();
    renderPins();
    syncEliminarOverlays();
    bindEvents();
    suscribirseEventos();
    if (!localStorage.getItem(LS_HELP_SEEN)) setTimeout(startGuide, 500);
  }

  /**
   * Tiempo real: cuando alguien más (equipo o cliente) crea/edita/resuelve/borra una anotación en
   * este mismo prototipo, el servidor avisa por SSE y volvemos a sincronizar — así varias personas
   * revisando a la vez se ven los comentarios entre sí sin recargar la página. El evento solo dice
   * "algo cambió" (no manda el contenido), así que la reacción es simplemente re-pedir la lista
   * completa; EventSource se reconecta solo si la conexión se cae.
   */
  function suscribirseEventos() {
    try {
      const es = new EventSource(API_BASE + '/api/anotaciones/' + SLUG + '/eventos');
      es.onmessage = () => {
        syncAnnotationsFromApi().then(() => {
          renderPins();
          refreshCount();
          syncEliminarOverlays();
          if (sidebarOpen) renderSidebar();
        });
      };
    } catch {
      /* SSE no disponible (navegador muy viejo) — la revisión sigue funcionando, solo sin tiempo real */
    }
  }

  /* ── 9. Barra inferior ──────────────────────────────────────────────────── */
  function buildBottomBar() {
    const c   = C[ROL];
    const bar = el('div', { id: 'ebr-bottombar' });
    bar.innerHTML = `
      <div class="ebr-bar-left">
        <span class="ebr-bar-logo">EB</span>
        <span class="ebr-bar-sep">·</span>
        <button id="ebr-bar-count" title="Ver comentarios">
          <span class="ebr-count-dot"></span><span>0 comentarios</span>
        </button>
        <span class="ebr-bar-rol" style="background:${c.tagBg};color:${c.tagTxt};">${ROL}</span>
      </div>

      <div class="ebr-spacer"></div>

      <div class="ebr-switch" id="ebr-mode-switch">
        <span class="ebr-switch-label" id="ebr-switch-label-nav" data-mode="nav">Navegar</span>
        <button class="ebr-switch-track" id="ebr-switch-track" type="button" role="switch" title="Cambiar entre navegar y comentar">
          <span class="ebr-switch-thumb"></span>
        </button>
        <span class="ebr-switch-label" id="ebr-switch-label-com" data-mode="com">Comentar</span>
      </div>

      <div class="ebr-spacer"></div>

      <button class="ebr-bar-btn" id="ebr-btn-share" title="Copiar el link de esta página">🔗 Compartir</button>
      ${ROL === 'equipo' ? '<button class="ebr-bar-btn" id="ebr-btn-download" title="Descargar el HTML del prototipo">⬇ Descargar</button>' : ''}
      <button id="ebr-btn-finish">✓ Terminar revisión</button>
      <button id="ebr-help-btn" title="Ver guía de uso">?</button>`;
    document.body.appendChild(bar);
    document.getElementById('ebr-switch-track').addEventListener('click', () => setMode(commentMode ? 'nav' : 'com'));
    document.getElementById('ebr-switch-label-nav').addEventListener('click', () => setMode('nav'));
    document.getElementById('ebr-switch-label-com').addEventListener('click', () => setMode('com'));
    document.getElementById('ebr-btn-finish').addEventListener('click', finishReview);
    document.getElementById('ebr-bar-count').addEventListener('click', toggleSidebar);
    document.getElementById('ebr-help-btn').addEventListener('click', startGuide);
    document.getElementById('ebr-btn-share').addEventListener('click', shareLink);
    const dlBtn = document.getElementById('ebr-btn-download');
    if (dlBtn) dlBtn.addEventListener('click', () => { window.location.href = `${API_BASE}/p/${SLUG}/download`; });
    refreshCount();
    setMode('com');
  }

  function shareLink() {
    const btn = document.getElementById('ebr-btn-share');
    navigator.clipboard.writeText(location.href)
      .then(() => flashShareBtn(btn, '✓ Copiado'))
      .catch(() => flashShareBtn(btn, '⚠ No se pudo copiar'));
  }

  function flashShareBtn(btn, msg) {
    if (!btn || btn.dataset.flashing) return;
    btn.dataset.flashing = '1';
    const original = btn.innerHTML;
    btn.innerHTML = msg;
    btn.classList.add('copied');
    setTimeout(() => {
      btn.innerHTML = original;
      btn.classList.remove('copied');
      delete btn.dataset.flashing;
    }, 1800);
  }

  function refreshCount() {
    const total   = annotations.length;
    const pending = annotations.filter(a => a.estado === 'pendiente').length;
    const btn = document.getElementById('ebr-bar-count');
    if (!btn) return;
    const txt = total === 0 ? '0 comentarios'
      : `${total} comentario${total !== 1 ? 's' : ''} · ${pending} pendiente${pending !== 1 ? 's' : ''}`;
    btn.innerHTML = `<span class="ebr-count-dot"></span><span>${txt}</span>`;
    btn.classList.toggle('has-pending', pending > 0);
  }

  function setMode(mode) {
    commentMode = (mode === 'com');
    document.getElementById('ebr-switch-track').classList.toggle('on', commentMode);
    document.getElementById('ebr-switch-label-nav').classList.toggle('active', !commentMode);
    document.getElementById('ebr-switch-label-com').classList.toggle('active', commentMode);
    const pinsLayer = document.getElementById('ebr-pins');
    if (pinsLayer) pinsLayer.style.display = commentMode ? '' : 'none';
    if (!commentMode) {
      clearHover();
      closeChoice();
      hideSelBar();
      document.getElementById('ebr-tip').classList.remove('on');
      closePopover();
    }
  }

  function finishReview() {
    setMode('nav');
    const pending = annotations.filter(a => a.estado === 'pendiente').length;
    const total   = annotations.length;
    const msg = total === 0
      ? '¡Revisión completada! Sin comentarios.'
      : `¡Revisión completada! ${total} comentario${total !== 1 ? 's' : ''}, ${pending} pendiente${pending !== 1 ? 's' : ''}.`;
    showToast(msg, 3500);
    fetch(API_BASE + '/p/' + SLUG + '/finalizar-revision', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rol: ROL, autor: authorName }),
    }).catch(() => {});
  }

  /* ── 10. Barra de edición inline (sugerencia de texto) ─────────────────── */
  function buildSuggBar() {
    const bar = el('div', { id: 'ebr-sugg-bar' });
    bar.innerHTML = `
      <span class="ebr-sugg-info">✏️ <strong>Modo sugerencia</strong> — edita el texto directamente en la página</span>
      <div class="ebr-sugg-spacer"></div>
      <button id="ebr-sugg-cancel">Cancelar</button>
      <button id="ebr-sugg-save">Guardar sugerencia</button>`;
    document.body.appendChild(bar);
    document.getElementById('ebr-sugg-cancel').addEventListener('click', cancelSugg);
    document.getElementById('ebr-sugg-save').addEventListener('click', saveSugg);
  }

  function enterSuggMode(targetEl) {
    if (suggEditMode) cancelSugg();
    activeSelEl       = targetEl;
    activeSelOriginal = targetEl.innerText;
    targetEl.contentEditable = 'true';
    targetEl.style.outline   = '2px dashed #6366f1';
    targetEl.style.outlineOffset = '3px';
    targetEl.focus();
    suggEditMode = true;
    document.getElementById('ebr-sugg-bar').classList.add('on');
    document.body.classList.add('ebr-sugg-active');
    setMode('nav'); // desactiva comment mode mientras edita
  }

  function cancelSugg() {
    if (!activeSelEl) return;
    activeSelEl.innerText      = activeSelOriginal;
    activeSelEl.contentEditable = 'false';
    activeSelEl.style.outline  = '';
    activeSelEl.style.outlineOffset = '';
    activeSelEl = null;
    activeSelOriginal = '';
    suggEditMode = false;
    document.getElementById('ebr-sugg-bar').classList.remove('on');
    document.body.classList.remove('ebr-sugg-active');
  }

  function saveSugg() {
    if (!activeSelEl) return;
    const textoSugerido = activeSelEl.innerText.trim();
    if (!textoSugerido || textoSugerido === activeSelOriginal) { cancelSugg(); return; }

    // Restaurar texto original en el DOM (no modificamos el HTML original)
    activeSelEl.innerText      = activeSelOriginal;
    activeSelEl.contentEditable = 'false';
    activeSelEl.style.outline  = '';
    activeSelEl.style.outlineOffset = '';

    // Posición del elemento
    const rect = activeSelEl.getBoundingClientRect();
    const px   = rect.left + window.scrollX + 12;
    const py   = rect.top  + window.scrollY + 12;

    const ann = newAnnotation(px, py, getSelector(activeSelEl), 'sugerencia_texto', {
      texto_original  : activeSelOriginal,
      texto_sugerido  : textoSugerido,
      texto           : `~~${activeSelOriginal}~~ → ${textoSugerido}`,
    });

    activeSelEl = null;
    activeSelOriginal = '';
    suggEditMode = false;
    document.getElementById('ebr-sugg-bar').classList.remove('on');
    document.body.classList.remove('ebr-sugg-active');
    addPin(ann);
    refreshCount();
    if (sidebarOpen) renderSidebar();
    showToast('Sugerencia guardada', 2000);
  }

  /* ── 11. Mini toolbar de selección de texto ─────────────────────────────── */
  function buildSelBar() {
    const bar = el('div', { id: 'ebr-sel-bar' });
    bar.innerHTML = `
      <button class="ebr-sel-btn" id="ebr-sel-comment">💬 Comentar selección</button>
      <button class="ebr-sel-btn" id="ebr-sel-suggest">✏️ Sugerir cambio</button>`;
    document.body.appendChild(bar);
    document.getElementById('ebr-sel-comment').addEventListener('click', onSelComment);
    document.getElementById('ebr-sel-suggest').addEventListener('click', onSelSuggest);
  }

  let selData = null; // { text, pageX, pageY, targetEl }

  function showSelBar(x, y, data) {
    selData = data;
    const bar = document.getElementById('ebr-sel-bar');
    bar.style.left = (x + window.scrollX) + 'px';
    bar.style.top  = (y + window.scrollY - 48) + 'px';
    bar.classList.add('on');
  }

  function hideSelBar() {
    document.getElementById('ebr-sel-bar').classList.remove('on');
    selData = null;
  }

  function onSelComment() {
    if (!selData) return;
    const { text, pageX, pageY, selector } = selData;
    hideSelBar();
    window.getSelection()?.removeAllRanges();
    openPopover(pageX, pageY, selector, text);
  }

  function onSelSuggest() {
    if (!selData) return;
    const target = selData.targetEl;
    hideSelBar();
    window.getSelection()?.removeAllRanges();
    enterSuggMode(target);
  }

  /* ── 12. Popover de elección ────────────────────────────────────────────── */
  function buildChoice() {
    /* Popover de elección */
    const d = el('div', { id: 'ebr-choice' });
    d.innerHTML = `
      <p class="ebr-ch-label">¿Qué quieres hacer?</p>
      <button class="ebr-ch-btn" id="ebr-ch-comment">
        <span class="ebr-ch-icon">💬</span>
        <div><div>Dejar comentario</div><div class="ebr-ch-sub">Agrega una nota sobre este elemento</div></div>
      </button>
      <button class="ebr-ch-btn sugg" id="ebr-ch-suggest">
        <span class="ebr-ch-icon">✏️</span>
        <div><div>Sugerir cambio de texto</div><div class="ebr-ch-sub">Edita el texto directamente aquí</div></div>
      </button>
      <button class="ebr-ch-btn like" id="ebr-ch-like">
        <span class="ebr-ch-icon">❤️</span>
        <div><div>Me gusta</div><div class="ebr-ch-sub">Estás de acuerdo con este elemento</div></div>
      </button>
      <button class="ebr-ch-btn del" id="ebr-ch-delete">
        <span class="ebr-ch-icon">🗑️</span>
        <div><div>Eliminar esto</div><div class="ebr-ch-sub">Pide que este elemento se retire</div></div>
      </button>`;
    document.body.appendChild(d);
    document.getElementById('ebr-ch-comment').addEventListener('click', onChoiceComment);
    document.getElementById('ebr-ch-suggest').addEventListener('click', onChoiceSuggest);
    document.getElementById('ebr-ch-like').addEventListener('click', onChoiceLike);
    document.getElementById('ebr-ch-delete').addEventListener('click', onChoiceDelete);
  }

  /* Tags que NUNCA son texto editable */
  const NO_TEXT_TAGS = new Set([
    'img','video','audio','canvas','picture',
    'input','select','textarea','iframe','svg','br','hr',
    'script','style','link','meta','figure',
  ]);

  /* Tags que SÍ son elementos de texto por naturaleza */
  const TEXT_TAGS = new Set([
    'p','h1','h2','h3','h4','h5','h6',
    'span','a','strong','em','b','i','u','s','mark',
    'li','dt','dd','td','th','caption','label',
    'button','figcaption','blockquote','q',
    'time','cite','abbr','code','small',
  ]);

  /* Texto válido = tiene al menos una letra (descarta emojis, íconos, símbolos puros) */
  function hasLetters(str) {
    return /\p{L}/u.test(str);
  }

  function hasDirectText(el) {
    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE && hasLetters(node.textContent)) return true;
    }
    return false;
  }

  function isTextEl(el) {
    if (!el) return false;
    const tag = el.tagName.toLowerCase();
    if (NO_TEXT_TAGS.has(tag)) return false;
    // Tags de texto conocidos: debe tener letras reales
    if (TEXT_TAGS.has(tag)) return hasLetters(el.innerText || '');
    // Contenedores genéricos: solo si tienen nodo de texto directo con letras
    return hasDirectText(el);
  }

  function openChoice(px, py, selector, targetEl) {
    choiceData = { px, py, selector, targetEl };

    /* Mostrar "Sugerir cambio" solo si el elemento tiene texto */
    const hasTxt = isTextEl(targetEl);
    document.getElementById('ebr-ch-suggest').style.display = hasTxt ? '' : 'none';

    /* Foco visual: spotlight sobre el elemento */
    const focusCls = ROL === 'equipo' ? 'ebr-focused-equipo' : 'ebr-focused';
    targetEl.classList.add(focusCls);

    /* Posicionar el popover junto al elemento (no en el cursor) */
    const rect = targetEl.getBoundingClientRect();
    const d    = document.getElementById('ebr-choice');
    const vw   = window.innerWidth, vh = window.innerHeight;
    const totalBtns = 1 /* comentario */ + (hasTxt ? 1 : 0) + 2 /* like + eliminar */;
    const dw   = 236, dh = 74 + 60 * (totalBtns - 1);

    /* Preferir aparecer a la derecha del elemento; si no cabe, a la izquierda */
    let left = rect.right + window.scrollX + 10;
    let top  = rect.top   + window.scrollY;
    if (rect.right + dw + 10 > vw - 8) left = rect.left + window.scrollX - dw - 10;
    if (left < 8 + window.scrollX)     left = rect.left + window.scrollX; // fallback: encima
    if (top  + dh > window.scrollY + vh - 58) top = window.scrollY + vh - dh - 58;
    if (top  < window.scrollY + 8)            top  = window.scrollY + 8;

    d.style.left = left + 'px';
    d.style.top  = top  + 'px';
    d.classList.add('on');
  }

  function closeChoice() {
    if (choiceData && choiceData.targetEl) {
      choiceData.targetEl.classList.remove('ebr-focused', 'ebr-focused-equipo');
    }
    document.getElementById('ebr-choice').classList.remove('on');
    choiceData = null;
  }

  function onChoiceComment() {
    if (!choiceData) return;
    const { px, py, selector, targetEl } = choiceData;
    closeChoice();
    openPopover(px, py, selector, targetEl.innerText.trim());
  }

  function onChoiceSuggest() {
    if (!choiceData) return;
    const { targetEl } = choiceData;
    closeChoice();
    enterSuggMode(targetEl);
  }

  const ACCION_TEXTO = {
    me_gusta: 'Está de acuerdo con este elemento',
    eliminar: 'Este elemento debe eliminarse',
  };
  const ACCION_TOAST = {
    me_gusta: '❤️ Marcado como "me gusta"',
    eliminar: '🗑️ Solicitud de eliminación agregada',
  };

  function quickAction(accion) {
    if (!choiceData) return;
    const { px, py, selector, targetEl } = choiceData;
    closeChoice();

    const contenido = { texto: ACCION_TEXTO[accion], accion };
    const citado = targetEl.innerText.trim();
    if (citado) contenido.texto_citado = citado;

    const ann = newAnnotation(px, py, selector, 'comentario', contenido);
    addPin(ann);
    refreshCount();
    syncEliminarOverlays();
    if (sidebarOpen) renderSidebar();
    showToast(ACCION_TOAST[accion], 2000);
  }

  function onChoiceLike()   { quickAction('me_gusta'); }
  function onChoiceDelete() { quickAction('eliminar'); }

  /* ── 13. Cursor tip ─────────────────────────────────────────────────────── */
  function buildCursorTip() {
    const tip = el('div', { id: 'ebr-tip' });
    tip.textContent = 'Clic para comentar';
    document.body.appendChild(tip);
  }

  /* ── 13. Eventos ────────────────────────────────────────────────────────── */
  function bindEvents() {
    document.addEventListener('mouseover',  onHover);
    document.addEventListener('mouseout',   onUnhover);
    document.addEventListener('mousemove',  onMouseMove);
    document.addEventListener('mouseup',    onMouseUp);
    document.addEventListener('click',      onPageClick, true);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') handleEsc(); });
  }

  function isEbrEl(t) {
    return t && (
      t.closest('#ebr-bottombar') || t.closest('#ebr-sidebar') ||
      t.closest('#ebr-popover')   || t.closest('#ebr-name-modal') ||
      t.closest('#ebr-pins')      || t.closest('#ebr-tip') ||
      t.closest('#ebr-sel-bar')   || t.closest('#ebr-sugg-bar') ||
      t.closest('#ebr-choice')    || t.closest('#ebr-guide-card') ||
      t.closest('#ebr-toast')
    );
  }

  function onHover(e) {
    if (!commentMode || suggEditMode) return;
    const t = e.target;
    if (isEbrEl(t)) { clearHover(); return; }
    if (t === hoveredEl) return;
    clearHover();
    hoveredEl = t;
    t.classList.add(ROL === 'equipo' ? 'ebr-hover-equipo' : 'ebr-hover');
    document.getElementById('ebr-tip').classList.add('on');
  }

  function onUnhover(e) {
    if (e.target === hoveredEl) clearHover();
    if (!hoveredEl) document.getElementById('ebr-tip').classList.remove('on');
  }

  function clearHover() {
    if (hoveredEl) {
      hoveredEl.classList.remove('ebr-hover', 'ebr-hover-equipo');
      hoveredEl = null;
    }
  }

  function onMouseMove(e) {
    if (!commentMode) return;
    const tip = document.getElementById('ebr-tip');
    tip.style.left = e.clientX + 'px';
    tip.style.top  = e.clientY + 'px';
  }

  function onMouseUp(e) {
    if (!commentMode || suggEditMode) return;
    if (isEbrEl(e.target)) return;

    // Pequeño delay para que el browser termine de crear la selección
    setTimeout(() => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) { hideSelBar(); return; }
      const txt = sel.toString().trim();
      if (!txt) { hideSelBar(); return; }

      const range = sel.getRangeAt(0);
      const rect  = range.getBoundingClientRect();
      if (!rect.width) { hideSelBar(); return; }

      // Centro horizontal de la selección, sobre ella
      const cx = rect.left + rect.width / 2;
      const cy = rect.top;

      // Elemento padre del texto seleccionado (para edición inline)
      let targetEl = range.commonAncestorContainer;
      if (targetEl.nodeType === Node.TEXT_NODE) targetEl = targetEl.parentElement;

      showSelBar(cx, cy, {
        text: txt,
        pageX: cx + window.scrollX,
        pageY: cy + window.scrollY,
        selector: getSelector(targetEl),
        targetEl,
      });
    }, 10);
  }

  function onPageClick(e) {
    if (suggEditMode) return;
    if (!e.target.closest('#ebr-sel-bar'))  hideSelBar();
    if (!e.target.closest('#ebr-choice'))   closeChoice();
    if (!commentMode) return;
    if (isEbrEl(e.target)) return;
    e.preventDefault();
    e.stopPropagation();
    clearHover();
    document.getElementById('ebr-tip').classList.remove('on');
    openChoice(e.pageX, e.pageY, getSelector(e.target), e.target);
  }

  function handleEsc() {
    const guideCard = document.getElementById('ebr-guide-card');
    if (guideCard && guideCard.classList.contains('on')) { endGuide(); return; }
    if (suggEditMode)  { cancelSugg(); return; }
    if (choiceData)    { closeChoice(); return; }
    if (pendingClick)  { closePopover(); return; }
    if (commentMode)   { setMode('nav'); }
    if (sidebarOpen)   { toggleSidebar(); }
  }

  /* ── 14. Capa de pins ───────────────────────────────────────────────────── */
  function buildPinLayer() {
    const layer = el('div', { id: 'ebr-pins' });
    /* buildBottomBar() ya llamó a setMode('com') antes de que esta capa existiera (por eso su
       `if (pinsLayer)` no pudo aplicar el display ahí) — usamos el `commentMode` que dejó
       actualizado para no quedar escondida por default hasta el primer toggle manual. */
    layer.style.display = commentMode ? '' : 'none';
    document.body.appendChild(layer);
  }

  function renderPins() {
    const layer = document.getElementById('ebr-pins');
    if (!layer) return;
    layer.innerHTML = '';
    // Solo las de esta página — las de otras páginas del mismo sitio tienen coordenadas y
    // selectores que no corresponden a nada en el DOM actual.
    annotations.filter(a => paginaDe(a) === PAGINA).forEach(addPin);
  }

  function addPin(ann) {
    const layer = document.getElementById('ebr-pins');
    if (!layer) return;
    const c = pinColor(ann);
    const p = el('div', { class: 'ebr-pin' });
    p.dataset.id = ann.id;
    p.style.cssText = `left:${ann.posicion.x}px;top:${ann.posicion.y}px;background:${c.pin};`;
    p.title = `#${ann.numero} ${ann.autor}: ${(ann.contenido.texto || '').slice(0, 80)}`;
    const icon = ACCION_ICON[ann.contenido.accion];
    p.innerHTML = icon
      ? `<span style="font-size:13px;">${icon}</span>`
      : `<span style="color:${c.txt};">${ann.numero}</span>`;
    p.addEventListener('click', () => openPinDetail(ann));
    layer.appendChild(p);
  }

  function pinColor(ann) {
    if (ann.estado === 'resuelto')         return C.resuelto;
    if (ann.tipo === 'sugerencia_texto')   return C.sugerencia;
    if (ann.contenido.accion)              return C[ann.contenido.accion];
    return C[ann.rol] || C.cliente;
  }

  const ACCION_ICON = { me_gusta: '❤️', eliminar: '🗑️' };

  function scrollToCard(id) {
    const card = document.querySelector(`#ebr-sb-list .ebr-card[data-id="${id}"]`);
    if (!card) return;
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.style.transition = 'background .2s, border-color .2s';
    card.style.background   = '#ede9fe';
    card.style.borderColor  = '#6366f1';
    setTimeout(() => { card.style.background = ''; card.style.borderColor = ''; }, 1400);
  }

  function openPinDetail(ann) {
    if (ann.tipo === 'sugerencia_texto') {
      /* Abrir sidebar y navegar hasta la card de esa sugerencia */
      if (!sidebarOpen) toggleSidebar();
      else renderSidebar();
      setTimeout(() => scrollToCard(ann.id), 60);
      return;
    }
    /* Scroll para que el pin sea visible */
    window.scrollTo({ top: Math.max(0, ann.posicion.y - 180), behavior: 'smooth' });

    editingId = ann.id;
    const pop   = document.getElementById('ebr-popover');
    const txt   = document.getElementById('ebr-pop-txt');
    const quote = document.getElementById('ebr-pop-quote');
    const save  = document.getElementById('ebr-pop-save');
    const head  = pop.querySelector('.ebr-pop-head span');

    txt.value = ann.contenido.texto;
    txt.style.borderColor = '';
    save.textContent = 'Guardar cambios';
    if (head) head.textContent = `#${ann.numero} · ${esc(ann.autor)}`;

    if (ann.contenido.texto_citado) {
      quote.textContent = `"${ann.contenido.texto_citado}"`;
      quote.classList.add('on');
    } else {
      quote.textContent = '';
      quote.classList.remove('on');
    }

    /* Posicionar cerca del pin (coordenadas de página) */
    const vw = window.innerWidth, vh = window.innerHeight;
    const pw = 296, ph = 220;
    const cx = ann.posicion.x - window.scrollX;
    const cy = ann.posicion.y - window.scrollY;
    let left = cx + 16, top = cy - ph / 2;
    if (left + pw > vw - 8)  left = cx - pw - 16;
    if (left < 8)             left = 8;
    if (top  < 8)             top  = 8;
    if (top + ph > vh - 58)   top  = vh - ph - 58;
    pop.style.left = (left + window.scrollX) + 'px';
    pop.style.top  = (top  + window.scrollY) + 'px';
    pop.classList.add('on');
    setTimeout(() => txt.focus(), 50);
  }

  /* ── 15. Popover ────────────────────────────────────────────────────────── */
  function buildPopover() {
    const pop = el('div', { id: 'ebr-popover' });
    const c   = C[ROL];
    pop.innerHTML = `
      <div class="ebr-pop-head">
        <div class="ebr-pop-dot" style="background:${c.pin};"></div>
        <span>${esc(authorName)} · ${ROL}</span>
      </div>
      <div class="ebr-pop-quote" id="ebr-pop-quote"></div>
      <textarea id="ebr-pop-txt" placeholder="Escribe tu comentario…" rows="3"></textarea>
      ${ROL === 'equipo' ? '<p class="ebr-pop-hint">Tip: explica el <em>por qué</em> de tu recomendación.</p>' : ''}
      <div class="ebr-pop-acts">
        <button id="ebr-pop-save">Guardar</button>
        <button id="ebr-pop-cancel">Cancelar</button>
      </div>
      <p class="ebr-pop-shortcut">Ctrl+Enter para guardar</p>`;
    document.body.appendChild(pop);
    document.getElementById('ebr-pop-save').addEventListener('click', savePop);
    document.getElementById('ebr-pop-cancel').addEventListener('click', closePopover);
    document.getElementById('ebr-pop-txt').addEventListener('keydown', e => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) savePop();
    });
  }

  function openPopover(px, py, selector, quotedText) {
    pendingClick = { x: px, y: py, selector };
    const pop   = document.getElementById('ebr-popover');
    const txt   = document.getElementById('ebr-pop-txt');
    const quote = document.getElementById('ebr-pop-quote');
    txt.value = '';
    txt.style.borderColor = '';
    if (quotedText) {
      quote.textContent = `"${quotedText.slice(0, 120)}${quotedText.length > 120 ? '…' : ''}"`;
      quote.classList.add('on');
    } else {
      quote.textContent = '';
      quote.classList.remove('on');
    }

    const vw = window.innerWidth, vh = window.innerHeight;
    const pw = 296, ph = 220;
    const cx = px - window.scrollX, cy = py - window.scrollY;
    let left = cx + 16, top = cy - ph / 2;
    if (left + pw > vw - 8)  left = cx - pw - 16;
    if (left < 8)             left = 8;
    if (top < 8)              top  = 8;
    if (top + ph > vh - 58)   top  = vh - ph - 58;
    pop.style.left = (left + window.scrollX) + 'px';
    pop.style.top  = (top  + window.scrollY) + 'px';
    pop.classList.add('on');
    setTimeout(() => txt.focus(), 50);
  }

  function closePopover() {
    const pop  = document.getElementById('ebr-popover');
    const save = document.getElementById('ebr-pop-save');
    const head = pop.querySelector('.ebr-pop-head span');
    pop.classList.remove('on');
    if (save) save.textContent = 'Guardar';
    if (head) head.textContent = `${esc(authorName)} · ${ROL}`;
    pendingClick = null;
    editingId    = null;
  }

  function savePop() {
    const txt = document.getElementById('ebr-pop-txt');
    const v   = txt.value.trim();
    if (!v) { txt.style.borderColor = '#ef4444'; return; }

    if (editingId) {
      /* Modo edición — actualizar anotación existente */
      updateAnnotation(editingId, v);
      closePopover();
      renderPins();
      refreshCount();
      if (sidebarOpen) renderSidebar();
      return;
    }

    /* Modo creación — nueva anotación */
    const quote   = document.getElementById('ebr-pop-quote');
    const contenido = { texto: v };
    if (quote.classList.contains('on') && quote.textContent) {
      contenido.texto_citado = quote.textContent.replace(/^"|"$/g, '');
    }
    const ann = newAnnotation(pendingClick.x, pendingClick.y, pendingClick.selector, 'comentario', contenido);
    closePopover();
    addPin(ann);
    refreshCount();
    if (sidebarOpen) renderSidebar();
  }

  /* ── 16. Sidebar ────────────────────────────────────────────────────────── */
  function buildSidebar() {
    const sb = el('div', { id: 'ebr-sidebar' });
    sb.innerHTML = `
      <div id="ebr-sb-head">
        <h3>Comentarios · ${esc(SLUG)}</h3>
        <input id="ebr-sb-search" type="search" placeholder="Buscar comentarios…">
        <div class="ebr-filters">
          <button class="ebr-f on" data-frol="todos">Todos</button>
          <button class="ebr-f"    data-frol="cliente">Cliente</button>
          <button class="ebr-f"    data-frol="equipo">Equipo</button>
        </div>
        <div class="ebr-filters">
          <button class="ebr-f on" data-fest="todos">Todos</button>
          <button class="ebr-f"    data-fest="pendiente">Pendientes</button>
          <button class="ebr-f"    data-fest="resuelto">Resueltos</button>
        </div>
        <label id="ebr-sb-solopagina" style="display:none;">
          <input type="checkbox" id="ebr-sb-solopagina-chk"> Mostrar solo esta página
        </label>
      </div>
      <div id="ebr-sb-list">
        <p id="ebr-sb-empty">
          Activa <strong>💬 Comentar</strong> y haz clic<br>en cualquier elemento de la página.
        </p>
      </div>`;
    document.body.appendChild(sb);

    const search = document.getElementById('ebr-sb-search');
    search.addEventListener('input', () => { searchQuery = search.value.trim(); renderSidebar(); });

    sb.querySelectorAll('[data-frol]').forEach(b => b.addEventListener('click', () => {
      sb.querySelectorAll('[data-frol]').forEach(x => x.classList.remove('on'));
      b.classList.add('on'); fRol = b.dataset.frol; renderSidebar();
    }));
    sb.querySelectorAll('[data-fest]').forEach(b => b.addEventListener('click', () => {
      sb.querySelectorAll('[data-fest]').forEach(x => x.classList.remove('on'));
      b.classList.add('on'); fEst = b.dataset.fest; renderSidebar();
    }));

    document.getElementById('ebr-sb-solopagina-chk').addEventListener('change', (e) => {
      soloEstaPagina = e.target.checked;
      renderSidebar();
    });
  }

  function toggleSidebar() {
    sidebarOpen = !sidebarOpen;
    document.getElementById('ebr-sidebar').classList.toggle('open', sidebarOpen);
    if (sidebarOpen) renderSidebar();
  }

  function renderSidebar() {
    const list  = document.getElementById('ebr-sb-list');
    const empty = document.getElementById('ebr-sb-empty');
    if (!list) return;
    list.querySelectorAll('.ebr-card, .ebr-sb-group-head').forEach(c => c.remove());

    const solopaginaRow = document.getElementById('ebr-sb-solopagina');
    const sitioMultipagina = new Set(annotations.map(paginaDe)).size > 1;
    if (solopaginaRow) solopaginaRow.style.display = sitioMultipagina ? '' : 'none';

    let items = annotations;
    if (soloEstaPagina && sitioMultipagina) items = items.filter(a => paginaDe(a) === PAGINA);
    if (fRol !== 'todos') items = items.filter(a => a.rol    === fRol);
    if (fEst !== 'todos') items = items.filter(a => a.estado === fEst);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      items = items.filter(a => {
        const t = a.contenido.texto || '';
        const o = a.contenido.texto_original || '';
        const s = a.contenido.texto_sugerido || '';
        return (t + o + s + a.autor).toLowerCase().includes(q);
      });
    }

    if (!items.length) { empty.style.display = 'block'; return; }
    empty.style.display = 'none';

    const ordenados = [...items].sort((a, b) => {
      if (a.estado !== b.estado) return a.estado === 'pendiente' ? -1 : 1;
      return new Date(b.fecha) - new Date(a.fecha);
    });

    // Agrupar por página solo si hay más de una entre lo que se está mostrando — en un
    // prototipo de un solo archivo (el caso más común) todo cae en "/" y el encabezado
    // repetido no aportaría nada.
    const paginasPresentes = new Set(ordenados.map(paginaDe));
    const agrupar = paginasPresentes.size > 1;

    const grupos = agrupar
      ? [...paginasPresentes].sort((a, b) => (a === PAGINA ? -1 : b === PAGINA ? 1 : etiquetaPagina(a).localeCompare(etiquetaPagina(b))))
      : [null]; // un solo grupo, sin encabezado

    // Primera vez que hay más de una página: colapsadas todas menos la actual, como en Pastel.
    // Los toggles manuales del usuario se respetan en renders siguientes (no se vuelve a tocar).
    if (agrupar && paginasColapsadas === null) {
      paginasColapsadas = new Set([...paginasPresentes].filter((p) => p !== PAGINA));
    }

    grupos.forEach(pagina => {
      const itemsGrupo = agrupar ? ordenados.filter(a => paginaDe(a) === pagina) : ordenados;
      if (agrupar) {
        const colapsado = paginasColapsadas.has(pagina);
        const head = el('div', { class: 'ebr-sb-group-head', 'data-pagina': pagina });
        head.innerHTML = `<span class="ebr-sb-group-arrow">${colapsado ? '▸' : '▾'}</span> ${pagina === PAGINA ? '📍 ' : ''}${esc(etiquetaPagina(pagina))} <span class="ebr-sb-group-count">${itemsGrupo.length}</span>`;
        head.addEventListener('click', () => {
          if (paginasColapsadas.has(pagina)) paginasColapsadas.delete(pagina);
          else paginasColapsadas.add(pagina);
          renderSidebar();
        });
        list.appendChild(head);
        if (colapsado) return;
      }
      itemsGrupo.forEach(ann => renderCard(ann));
    });

    function renderCard(ann) {
        const c     = pinColor(ann);
        const fecha = new Date(ann.fecha).toLocaleDateString('es-MX',
          { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
        const card  = el('div', { class: `ebr-card${ann.estado === 'resuelto' ? ' resuelto' : ''}`, 'data-id': ann.id });

        let bodyHtml = '';
        const quoted = ann.contenido.texto_citado
          ? `<div style="font-size:11px;color:#92400e;background:#fef9ec;border-left:2px solid #f59e0b;
              padding:3px 7px;border-radius:0 4px 4px 0;margin-bottom:6px;word-break:break-word;">
              "${esc(ann.contenido.texto_citado)}"</div>` : '';
        if (ann.tipo === 'sugerencia_texto') {
          bodyHtml = `
            <div class="ebr-card-diff">
              <span class="ebr-diff-orig">${esc(ann.contenido.texto_original)}</span>
              <span class="ebr-diff-new">${esc(ann.contenido.texto_sugerido)}</span>
            </div>`;
        } else if (ann.contenido.accion) {
          bodyHtml = quoted + `<div class="ebr-card-txt">${ACCION_ICON[ann.contenido.accion]} ${esc(ann.contenido.texto)}</div>`;
        } else {
          bodyHtml = quoted + `<div class="ebr-card-txt">${esc(ann.contenido.texto)}</div>`;
        }

        card.innerHTML = `
          <div class="ebr-card-head">
            <div class="ebr-card-dot" style="background:${c.pin};color:${c.txt};">${ACCION_ICON[ann.contenido.accion] || ann.numero}</div>
            <div class="ebr-card-meta">
              <div class="ebr-card-autor">${esc(ann.autor)}</div>
              <div class="ebr-card-fecha">${fecha}</div>
            </div>
            <span class="ebr-card-rol" style="background:${c.tagBg};color:${c.tagTxt};">
              ${ann.tipo === 'sugerencia_texto' ? 'sugerencia' : (ann.contenido.accion || ann.rol)}
            </span>
          </div>
          ${bodyHtml}
          <div class="ebr-card-acts">
            ${ann.estado === 'pendiente'
              ? (ROL === 'equipo'
                  ? `<button class="ebr-act ebr-act-resolve" data-a="resolve" data-id="${ann.id}">✓ Resolver</button>`
                  : `<span style="font-size:11px;color:#9ca3af;">Pendiente</span>`)
              : `<span style="font-size:11px;color:#6b7280;">✓ Resuelto</span>`}
            <button class="ebr-act ebr-act-locate" data-a="locate" data-id="${ann.id}">↗ Ver</button>
            <button class="ebr-act ebr-act-delete" data-a="delete" data-id="${ann.id}">✕</button>
          </div>`;
        list.appendChild(card);
    }

    list.querySelectorAll('[data-a]').forEach(btn => btn.addEventListener('click', () => {
      const { a: action, id } = btn.dataset;
      if (action === 'resolve') {
        resolveAnn(id); renderPins(); refreshCount(); syncEliminarOverlays(); renderSidebar();
      } else if (action === 'locate') {
        const ann = annotations.find(x => x.id === id);
        if (ann && paginaDe(ann) !== PAGINA) {
          // Está en otra página del sitio — navegar ahí y retomar el locate al cargar
          // (resumirLocateEntrePaginas), en vez de hacer scroll a un pin que no existe aquí.
          sessionStorage.setItem(LS_LOCATE, id);
          location.href = API_BASE + '/p/' + SLUG + (paginaDe(ann) === '/' ? '' : paginaDe(ann));
        } else {
          locateAnn(ann);
        }
      } else if (action === 'delete') {
        if (!confirm('¿Eliminar este comentario?')) return;
        deleteAnn(id); renderPins(); refreshCount(); syncEliminarOverlays(); renderSidebar();
      }
    }));
  }

  /* ── 17. Guía interactiva ───────────────────────────────────────────────── */
  let guideStep         = 0;
  let guideAudioEl      = null;
  let guideAudioCtx     = null;
  let guideAnalyser     = null;
  let guideGlowRAF      = null;
  let guideCurrentTarget = null;

  function buildGuideUI() {
    document.body.appendChild(el('div', { id: 'ebr-guide-backdrop' }));
    document.body.appendChild(el('div', { id: 'ebr-guide-card' }));
    /* Un solo <audio> persistente en el DOM — Chrome puede abortar la reproducción
       de un Audio() no anexado al documento ("media removed from the document") */
    guideAudioEl = el('audio', { id: 'ebr-guide-audio-el', preload: 'auto' });
    guideAudioEl.style.display = 'none';
    document.body.appendChild(guideAudioEl);
    guideAudioEl.addEventListener('timeupdate', () => highlightKaraoke(document.getElementById('ebr-guide-text'), guideAudioEl));
    guideAudioEl.addEventListener('ended', () => {
      setAudioBtnState(false);
      clearKaraoke(document.getElementById('ebr-guide-text'));
      setGlow(0);
    });
    // Si cambia el tamaño del viewport (resize de ventana, rotar el celular) con un paso
    // de spotlight abierto, la posición en px queda vieja — recalcularla.
    window.addEventListener('resize', () => {
      if (guideCurrentTarget && document.getElementById('ebr-guide-card').classList.contains('on')) {
        positionGuideCard(guideCurrentTarget);
      }
    });
  }

  function startGuide() {
    guideStep = 0;
    const backdrop = document.getElementById('ebr-guide-backdrop');
    backdrop.classList.add('on');
    if (window.gsap) gsap.fromTo(backdrop, { opacity: 0 }, { opacity: 1, duration: .3, ease: 'power1.out' });
    renderGuideStep();
  }

  function clearGuideTarget() {
    document.querySelectorAll('.ebr-guide-target').forEach(e => {
      e.classList.remove('ebr-focused', 'ebr-focused-equipo', 'ebr-guide-target');
    });
  }

  function stopGuideAudio() {
    if (!guideAudioEl) return;
    guideAudioEl.pause();
    setGlow(0);
  }

  /** Conecta el <audio> a un AnalyserNode (una sola vez — createMediaElementSource no admite llamarse dos veces). */
  function ensureGuideAnalyser() {
    if (guideAudioCtx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    guideAudioCtx = new AC();
    guideAnalyser = guideAudioCtx.createAnalyser();
    guideAnalyser.fftSize = 256;
    const source = guideAudioCtx.createMediaElementSource(guideAudioEl);
    source.connect(guideAnalyser);
    guideAnalyser.connect(guideAudioCtx.destination); // sin esto el audio queda mudo
  }

  function setGlow(v) {
    const card = document.getElementById('ebr-guide-card');
    if (card) card.style.setProperty('--glow', String(v));
  }

  /** Borde/brillo de la tarjeta reaccionando al volumen real del audio, tipo asistente de voz. */
  function startGlowLoop() {
    if (guideGlowRAF || !guideAnalyser) return;
    const data = new Uint8Array(guideAnalyser.frequencyBinCount);
    const tick = () => {
      if (guideAudioEl.paused || guideAudioEl.ended) { setGlow(0); guideGlowRAF = null; return; }
      guideAnalyser.getByteFrequencyData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i];
      const avg = sum / data.length / 255;
      setGlow(Math.min(1, avg * 1.6).toFixed(3));
      guideGlowRAF = requestAnimationFrame(tick);
    };
    guideGlowRAF = requestAnimationFrame(tick);
  }

  function wrapWords(text) {
    return text.split(/\s+/).filter(Boolean)
      .map((w, i) => `<span class="ebr-guide-word" data-i="${i}">${esc(w)}</span>`)
      .join(' ');
  }

  function renderGuideStep() {
    stopGuideAudio();
    clearGuideTarget();
    guideActiveWordIdx = -1;

    const step   = GUIDE_STEPS[guideStep];
    const isLast = guideStep === GUIDE_STEPS.length - 1;
    const card   = document.getElementById('ebr-guide-card');
    const backdrop = document.getElementById('ebr-guide-backdrop');

    let targetEl = step.target ? document.querySelector(step.target) : null;
    if (targetEl) {
      targetEl.classList.add(ROL === 'equipo' ? 'ebr-focused-equipo' : 'ebr-focused', 'ebr-guide-target');
    }
    // El backdrop se muestra siempre — la barra inferior (z-index más alto) sigue visible
    // encima, así que el botón resaltado no se oscurece.
    backdrop.classList.add('on');

    card.innerHTML = `
      <div class="ebr-guide-step">Paso ${guideStep + 1} de ${GUIDE_STEPS.length}</div>
      ${step.title ? `<div class="ebr-guide-title">${step.title}</div>` : ''}
      <div class="ebr-guide-text" id="ebr-guide-text">${wrapWords(step.text)}</div>
      <button class="ebr-guide-audio" id="ebr-guide-audio-btn">🔊 Escuchar</button>
      <div class="ebr-guide-nav">
        <span class="ebr-guide-skip" id="ebr-guide-skip">Saltar</span>
        <div class="ebr-guide-spacer"></div>
        <button class="ebr-guide-next" id="ebr-guide-next">${isLast ? 'Entendido' : 'Siguiente →'}</button>
      </div>`;

    guideCurrentTarget = targetEl;
    if (targetEl) {
      card.classList.remove('centered', 'big');
      card.classList.add('on');
      // classList primero y luego medir: positionGuideCard necesita el alto REAL ya
      // renderizado (varía según el texto de cada paso), no un estimado fijo.
      positionGuideCard(targetEl);
    } else {
      // Limpiar left/top en px que haya dejado un paso anterior con botón — si no,
      // esos estilos inline (más específicos que la clase) pisan el left:50% centrado
      // y la tarjeta queda pegada en la posición vieja, sobre todo si cambió el viewport.
      card.style.left = '';
      card.style.top  = '';
      card.classList.add('centered', 'big', 'on');
    }

    if (window.gsap) {
      // .centered usa transform:translate(-50%,-50%) por CSS — GSAP guarda xPercent/yPercent
      // internamente entre tweens del mismo elemento, así que hay que fijarlo explícito los
      // dos lados (0 en pasos con botón) o el valor del paso centrado anterior se queda pegado
      // y la tarjeta aparece desplazada la mitad de su propio tamaño.
      const centerVars = targetEl ? { xPercent: 0, yPercent: 0 } : { xPercent: -50, yPercent: -50 };
      gsap.fromTo(card,
        Object.assign({ opacity: 0, y: 14, scale: .97 }, centerVars),
        Object.assign({ opacity: 1, y: 0, scale: 1, duration: .35, ease: 'power3.out' }, centerVars)
      );
    }

    document.getElementById('ebr-guide-skip').addEventListener('click', endGuide);
    document.getElementById('ebr-guide-next').addEventListener('click', () => {
      if (isLast) endGuide(); else { guideStep++; renderGuideStep(); }
    });
    document.getElementById('ebr-guide-audio-btn').addEventListener('click', toggleGuideAudioPlayback);

    // Activa el modo Comentar en vivo para que el usuario vea el efecto (pines, hover)
    // en vez de solo leer que existe el botón.
    if (step.activateComment) setMode('com');

    playGuideStepAudio(step.audio);
  }

  function positionGuideCard(targetEl) {
    const card = document.getElementById('ebr-guide-card');
    const rect = targetEl.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    const cw = 300;
    // Alto real ya renderizado (el contenido varía de un paso a otro) — un estimado fijo
    // se queda corto en pasos con texto largo y la tarjeta termina tapando el propio botón.
    const ch = card.offsetHeight || 190;

    let left = rect.left + rect.width / 2 - cw / 2;
    let top  = rect.top > ch + 20 ? rect.top - ch - 14 : rect.bottom + 14;

    if (left < 8)            left = 8;
    if (left + cw > vw - 8)  left = vw - cw - 8;
    if (top < 8)             top  = 8;
    if (top + ch > vh - 8)   top  = vh - ch - 8;

    card.style.left = left + 'px';
    card.style.top  = top  + 'px';
  }

  function setAudioBtnState(playing) {
    const btn = document.getElementById('ebr-guide-audio-btn');
    if (!btn) return;
    btn.classList.toggle('playing', playing);
    btn.textContent = playing ? '⏸ Pausar' : '🔊 Escuchar';
  }

  function playGuideStepAudio(file) {
    guideAudioEl.pause();
    guideAudioEl.src = AUDIO_BASE + file;
    guideAudioEl.currentTime = 0;
    ensureGuideAnalyser();
    if (guideAudioCtx && guideAudioCtx.state === 'suspended') guideAudioCtx.resume().catch(() => {});
    // Autoplay: puede fallar en el primer paso si aún no hubo gesto del usuario en la página
    // (política del navegador) — el botón "Escuchar" queda como respaldo manual en ese caso.
    guideAudioEl.play().then(() => { setAudioBtnState(true); startGlowLoop(); }).catch(() => setAudioBtnState(false));
  }

  function toggleGuideAudioPlayback() {
    if (!guideAudioEl) return;
    if (guideAudioEl.paused) {
      if (guideAudioCtx && guideAudioCtx.state === 'suspended') guideAudioCtx.resume().catch(() => {});
      guideAudioEl.play().then(() => { setAudioBtnState(true); startGlowLoop(); }).catch(() => {});
    } else {
      guideAudioEl.pause();
      setAudioBtnState(false);
      setGlow(0);
    }
  }

  let guideActiveWordIdx = -1;

  function highlightKaraoke(textEl, audioEl) {
    if (!textEl || !audioEl.duration) return;
    const words = textEl.querySelectorAll('.ebr-guide-word');
    if (!words.length) return;
    let totalChars = 0;
    const lens = [];
    words.forEach(w => { const l = w.textContent.length; lens.push(l); totalChars += l; });
    const progressChars = (audioEl.currentTime / audioEl.duration) * totalChars;
    let acc = 0, activeIdx = -1;
    for (let i = 0; i < words.length; i++) {
      const start = acc, end = acc + lens[i];
      if (progressChars >= start && progressChars < end) activeIdx = i;
      acc = end;
    }
    if (activeIdx === guideActiveWordIdx) return;
    words.forEach((w, i) => {
      const read = activeIdx === -1 || i < activeIdx;
      w.classList.toggle('read', read || i === activeIdx);
      w.classList.toggle('active', i === activeIdx);
    });
    guideActiveWordIdx = activeIdx;
    if (activeIdx >= 0 && window.gsap) {
      gsap.fromTo(words[activeIdx], { scale: 1.15 }, { scale: 1, duration: .3, ease: 'power2.out' });
    }
  }

  function clearKaraoke(textEl) {
    guideActiveWordIdx = -1;
    if (!textEl) return;
    textEl.querySelectorAll('.ebr-guide-word').forEach(w => { w.classList.add('read'); w.classList.remove('active'); });
  }

  function endGuide() {
    stopGuideAudio();
    clearGuideTarget();
    localStorage.setItem(LS_HELP_SEEN, '1');
    const backdrop = document.getElementById('ebr-guide-backdrop');
    const card     = document.getElementById('ebr-guide-card');
    if (window.gsap) {
      gsap.to(card, { opacity: 0, y: 10, scale: .97, duration: .2, ease: 'power2.in' });
      gsap.to(backdrop, {
        opacity: 0, duration: .25, ease: 'power1.in',
        onComplete: () => { backdrop.classList.remove('on'); card.classList.remove('on'); },
      });
    } else {
      backdrop.classList.remove('on');
      card.classList.remove('on');
    }
  }

  /* ── 18. Toast ──────────────────────────────────────────────────────────── */
  function buildToast() { document.body.appendChild(el('div', { id: 'ebr-toast' })); }

  function showToast(msg, duration) {
    const t = document.getElementById('ebr-toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('on');
    setTimeout(() => t.classList.remove('on'), duration || 2500);
  }

  /* ── 18. Utilidades ─────────────────────────────────────────────────────── */
  function locateAnn(ann) {
    if (!ann) return;
    window.scrollTo({ top: Math.max(0, ann.posicion.y - 120), behavior: 'smooth' });
    const pin = document.querySelector(`.ebr-pin[data-id="${ann.id}"]`);
    if (pin) {
      pin.style.transition = 'none';
      pin.style.transform  = 'translate(-50%,-100%) rotate(-45deg) scale(1.7)';
      setTimeout(() => { pin.style.transition = ''; pin.style.transform = ''; }, 650);
    }
  }

  function getSelector(target) {
    if (!target || target === document.body || target === document.documentElement) return 'body';
    const parts = [];
    let cur = target, depth = 0;
    while (cur && cur !== document.body && depth < 5) {
      if (cur.id && !cur.id.startsWith('ebr-')) { parts.unshift('#' + cur.id); return parts.join(' > '); }
      let seg = cur.tagName.toLowerCase();
      if (cur.className && typeof cur.className === 'string') {
        const cls = cur.className.trim().split(/\s+/).filter(c => !c.startsWith('ebr-')).slice(0, 2);
        if (cls.length) seg += '.' + cls.join('.');
      }
      const parent = cur.parentElement;
      if (parent) {
        const sibs = Array.from(parent.children).filter(c => c.tagName === cur.tagName);
        if (sibs.length > 1) seg += ':nth-of-type(' + (sibs.indexOf(cur) + 1) + ')';
      }
      parts.unshift(seg);
      cur = cur.parentElement;
      depth++;
    }
    return parts.join(' > ');
  }

  function el(tag, attrs) {
    const e = document.createElement(tag);
    if (attrs) Object.entries(attrs).forEach(([k, v]) => {
      if (k === 'class') e.className = v;
      else if (k === 'id') e.id = v;
      else e.setAttribute(k, v);
    });
    return e;
  }

  function esc(s) {
    return String(s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /* Anotaciones creadas antes de que existiera `pagina` no lo traen — se tratan como "/". */
  function paginaDe(ann) { return ann.pagina || '/'; }

  /** Nombre legible para agrupar/mostrar una sub-ruta: "/" -> "Inicio", "/nosotros.html" -> "Nosotros". */
  function etiquetaPagina(pagina) {
    if (!pagina || pagina === '/') return 'Inicio';
    const nombre = pagina.replace(/^\//, '').replace(/\.html?$/i, '').replace(/[-_]+/g, ' ').trim();
    return nombre ? nombre.charAt(0).toUpperCase() + nombre.slice(1) : pagina;
  }

})();
