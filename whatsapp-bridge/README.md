# whatsapp-bridge — OpenWA (open-wa.org) → Foco

Servicio que corre **en tu máquina** (no se despliega): cada
`INTERVALO_MINUTOS` (default 60) sincroniza los mensajes nuevos de los grupos
de proyecto desde **tu OpenWA** (open-wa.org, la app que ya tienes corriendo)
hacia **Foco**, donde la automatización diaria de ZCode los resume en el tab
Status del proyecto y registra datos valiosos en la Info clave.

A diferencia del puente viejo (puppeteer), aquí no hay navegador ni QR: tu
OpenWA es el que está conectado a WhatsApp — este puente solo habla con las
APIs REST de ambas apps.

## Cómo funciona

1. Consulta a Foco los grupos rastreados: proyectos activos cuyo **Info clave
   → Grupo WhatsApp** tenga valor (el nombre debe coincidir exacto con el del
   grupo en WhatsApp).
2. Resuelve la sesión en tu OpenWA (`OPENWA_SESION`, o la única conectada).
3. Por cada grupo rastreado trae los mensajes nuevos desde la última
   sincronización (cursor por chat en `estado.json`) y los envía a Foco.
4. En Foco los mensajes se guardan con **retención de 7 días**; lo permanente
   es el resumen diario que la automatización deja como nota de status.

El envío es **continuo** (cada vuelta), no un lote a hora fija: los mensajes
llegan a Foco dentro de la hora y el resumen de las 09:00 siempre tiene el
día completo, incluso si la máquina estuvo apagada (al arrancar sincroniza
todo lo que OpenWA aún tenga en su historial).

## Setup

```bash
cd whatsapp-bridge
cp .env.example .env    # llenar OPENWA_URL, OPENWA_API_KEY, FOCO_API_KEY
npm install
npm start
```

Déjalo corriendo cuando trabajes (pm2, tmux o una terminal abierta).
Ctrl+C lo detiene — la próxima vuelta sincroniza lo acumulado.
