# whatsapp-bridge — puente OpenWA → Foco

Servicio que corre **en tu máquina** (no se despliega): conecta WhatsApp Web con
[OpenWA](https://github.com/open-wa/wa-automate-nodejs), escucha los mensajes de
los grupos de proyecto y a la hora de envío entrega el lote del día a la API de
Foco. La automatización diaria de ZCode los resume en el tab Status del
proyecto y registra datos valiosos en la Info clave.

## Cómo funciona

1. Al arrancar (y cada hora) consulta a Foco la lista de grupos rastreados:
   son los proyectos activos cuyo **Info clave → Grupo WhatsApp** tiene valor.
2. Escucha los mensajes entrantes de esos grupos y los acumula en un buffer
   local (`buffer.json`, sobrevive reinicios).
3. A la **HORA_ENVIO** (default 21:00, hora de tu máquina) envía el lote por
   grupo a Foco y limpia el buffer. Al apagar el servicio (Ctrl+C) también
   envía lo pendiente.
4. En Foco los mensajes se guardan con **retención de 7 días**; lo permanente
   es el resumen diario que la automatización deja como nota de status.

## Importante

- **Solo captura mensajes que llegan mientras tu máquina está encendida y el
  servicio corriendo** — WhatsApp Web no entrega historial retroactivo. Si la
  máquina está apagada durante el día, esos mensajes no llegan al resumen.
- El nombre en **Info clave → Grupo WhatsApp** debe coincidir con el nombre
  exacto del grupo en WhatsApp (sin importar mayúsculas). Si el grupo cambia
  de nombre, actualízalo en Foco.
- Los mensajes de grupos sin proyecto asociado se descartan (el ingest lo
  reporta para detectar errores de nombre).
- Privacidad: Foco guarda los mensajes 7 días; lo permanente es el resumen.

## Setup

```bash
cd whatsapp-bridge
cp .env.example .env        # llenar FOCO_API_KEY (la del MCP)
npm install
npm start                   # escanear el QR la primera vez
```

La sesión queda persistida en `./session` — siguientes arranques no piden QR.
Déjalo corriendo en el horario que manejas la máquina; para detenerlo,
Ctrl+C (envía lo pendiente antes de salir).
