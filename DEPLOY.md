# DEPLOY.md — Foco

Producción vive en el servidor **LevelRail** (`levelrail.esbrillante.mx`). Coolify queda solo como copia de respaldo y ya no se usa para desplegar.

Frontend y backend son dos apps separadas en LevelRail, conectadas al repo `jesusjvc/sistema-proyectos-esbrillante`, rama `main`.

| App | Build | Puerto | Dominios |
|---|---|---|---|
| `foco-backend` | railpack sobre `server/` (arranca con `npm start`) | 3001 | `api-proyectos.esbrillante.mx`, `prototipos.esbrillante.mx` |
| `foco-frontend` | `Dockerfile.frontend` (contexto: raíz del repo) + `nginx-levelrail-frontend.conf` | 8080 | `foco.esbrillante.mx`, `proyectosweb.esbrillante.mx` |

`server/Dockerfile` existe pero la app del backend no lo usa (build railpack).

## Desplegar

**Cada push a `main` despliega solo** (`trigger_mode: push`, webhook de GitHub). Mergear un PR a `main` es publicar a producción. Las dos apps se despliegan con estrategia blue-green.

```bash
levelrail-cli apps git-source deploy <app>   # desplegar main a mano
levelrail-cli apps deploys list <app>        # historial
levelrail-cli status <app>
levelrail-cli logs <app>
levelrail-cli rollback <app>                 # si el deploy sale mal
```

## Migraciones de Prisma

Se aplican solas: el backend arranca con `prisma migrate deploy && node src/app.js` (`server/package.json`). Una migración nueva en `server/prisma/migrations/` corre en el siguiente deploy del backend. Respaldar la base antes de desplegar una migración destructiva: `levelrail-cli backup <db>` (`levelrail-cli databases list` muestra las bases).

## Variables de entorno

- El `.env` del repo no se sube solo: `levelrail-cli env set|push <app> ...`, luego `levelrail-cli apps restart <app>` para que el proceso las tome (`apps apply` puede reiniciar sin las env nuevas).
- `DATABASE_URL` la inyecta LevelRail al ligar la base (`databases link`); no aparece en `env get`. Los valores sensibles van como secret (`secret_env`), no como env plana.
- `CLIENT_URL` lleva los dos dominios del panel separados por coma (CORS).
- El frontend recibe `VITE_API_URL` y `VITE_GOOGLE_CLIENT_ID` como build args (ver `Dockerfile.frontend`).

## Fuera de LevelRail

- `whatsapp-bridge/` y `correo-bridge/` corren en la máquina del equipo (systemd de usuario), no en el servidor. Apuntan a la API por `FOCO_URL`.

## Verificar

- `curl -s -o /dev/null -w '%{http_code}' https://api-proyectos.esbrillante.mx/api/health` responde 200.
- El panel carga, el login funciona y el portal de un cliente abre.
