# foco-correo-bridge — buzón de soporte → tickets de Foco

Puente local que lee por **IMAP** el buzón de `soporte@esbrillante.mx`
(Google Workspace) cada pocos minutos y manda los correos no leídos a la
ingesta de Foco (`POST /api/integraciones/correo/ingest`), donde se cruzan
con clientes y se convierten en tickets — o quedan en la bandeja "Correos
sin asignar" de la mesa de mantenimiento si nadie los reconoce.

Mismo modelo que `whatsapp-bridge/`: proceso local en la máquina del equipo,
sin despliegue, la BD solo se toca vía API. Si el puente está apagado el
correo se acumula en el buzón y se ingesta al volver — nada se pierde.

## Por qué IMAP y no Cloudflare Email Routing

Los MX de `esbrillante.mx` apuntan a **Google Workspace**; activar Email
Routing los reemplazaría por los de Cloudflare y cortaría la entrada de
correo de todas las cuentas del dominio (y Email Routing no soporta
subdominios salvo Enterprise). El buzón en Workspace no toca un solo registro
DNS y además deja la bandeja visible en Gmail para el equipo.

## Setup (una sola vez)

1. **Buzón dedicado**: en el admin de Google Workspace crea el usuario
   `soporte@esbrillante.mx` (requiere licencia propia — no usar un alias de un
   buzón personal: el puente lee TODO lo no leído de la bandeja que le apuntes).
2. **Contraseña de aplicación**: con la verificación en 2 pasos activada en esa
   cuenta → myaccount.google.com → Seguridad → Contraseñas de aplicación.
3. Configura el puente:
   ```bash
   cd correo-bridge
   cp .env.example .env   # llena IMAP_PASS y FOCO_API_KEY (= CORREO_INGEST_KEY del server)
   npm install
   node index.js          # primera corrida en primer plano para ver que conecta
   ```
4. **Servicio systemd de usuario** (siempre encendido — el correo llega a
   cualquier hora; a diferencia del puente de WhatsApp no necesita horario):
   ```ini
   # ~/.config/systemd/user/foco-correo-bridge.service
   [Unit]
   Description=Foco — puente de correo de soporte
   [Service]
   ExecStart=%h/Proyectos Web/foco/correo-bridge/node index.js
   WorkingDirectory=%h/Proyectos Web/foco/correo-bridge
   Restart=on-failure
   RestartSec=30
   [Install]
   WantedBy=default.target
   ```
   ```bash
   systemctl --user daemon-reload
   systemctl --user enable --now foco-correo-bridge
   journalctl --user -u foco-correo-bridge -f
   ```

## Cómo opera

- Solo procesa correos **no leídos**; al ingestarlos los marca como leídos
  (y opcionalmente los mueve a `CORREO_MOVER_A`). Eso es todo el estado — no
  hay cursor aparte ni nada que se pueda desincronizar.
- Si Foco responde 5xx o no hay red, el correo queda sin leer y el siguiente
  ciclo reintenta. Los 4xx (dedupe, correo sin remitente, datos insuficientes)
  se marcan leídos para no trabar la fila — el ingest responde 202 en
  "no cruza con cliente", así que esos sí llegan siempre a la bandeja.
- Los reenvíos del mismo correo no duplican tickets (dedupe por Message-ID
  en Foco).

## Probar sin tocar producción

Apunta `FOCO_URL` a un server local (`http://localhost:3001`) con su
`CORREO_INGEST_KEY` y mándale un correo de prueba al buzón; verifica en la
mesa de mantenimiento que aparezca el ticket o el correo en la bandeja.
