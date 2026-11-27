# DEPLOY.md — Foco

Producción vive en el servidor **LevelRail** (`levelrail.esbrillante.mx`). Coolify queda solo como copia de respaldo y ya no se usa para desplegar.

Frontend y backend son dos apps separadas en LevelRail y se despliegan de forma independiente. Para ver sus nombres reales: `levelrail-cli apps list`.

| App | Dockerfile | Puerto | Dominio |
|---|---|---|---|
| Backend (Express + Prisma) | `server/Dockerfile` | 3001 | `api-proyectos.esbrillante.mx` |
| Frontend (Vite + nginx) | `Dockerfile.frontend` + `nginx-levelrail-frontend.conf` | 8080 | dominio del panel |

## Desplegar

```bash
levelrail-cli up            # desde la carpeta de la app; buildea y despliega
levelrail-cli status <app>
levelrail-cli logs <app>
levelrail-cli rollback <app>   # si el deploy sale mal
```

## Migraciones de Prisma

Se aplican solas: el backend arranca con `prisma migrate deploy && node src/app.js` (`server/package.json`). Una migración nueva en `server/prisma/migrations/` corre en el siguiente deploy del backend. Respaldar la base antes de desplegar una migración destructiva: `levelrail-cli backup <db>`.

## Variables de entorno

- El `.env` del repo no se sube solo: `levelrail-cli env set|push <app> ...`, luego `levelrail-cli apps restart <app>` para que el proceso las tome (`apps apply` puede reiniciar sin las env nuevas).
- `DATABASE_URL` la inyecta LevelRail al ligar la base (`databases link`); no aparece en `env get`.
- El frontend recibe `VITE_API_URL` y `VITE_GOOGLE_CLIENT_ID` como build args (ver `Dockerfile.frontend`).

## Fuera de LevelRail

- `whatsapp-bridge/` y `correo-bridge/` corren en la máquina del equipo (systemd de usuario), no en el servidor. Apuntan a la API por `FOCO_URL`.

## Verificar

- `curl -s -o /dev/null -w '%{http_code}' https://api-proyectos.esbrillante.mx/api/health` responde 200.
- El panel carga, el login funciona y el portal de un cliente abre.
