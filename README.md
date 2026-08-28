# Edumon — Backend

API REST del backend de **Edumon**, una plataforma de gestión escolar que conecta instituciones educativas, docentes y padres/acudientes: cursos, módulos, tareas, entregas con calificación, foros, calendario de eventos y notificaciones multicanal (WebSocket, push, WhatsApp, correo).

## Stack

- Node.js 24 + Express 5
- MongoDB + Mongoose
- Autenticación con JWT (cookies httpOnly, access + refresh token con rotación)
- Socket.IO (tiempo real)
- Cloudinary (archivos/imágenes), Firebase Admin (push), Twilio (WhatsApp), Brevo (correo)
- Vitest + Supertest + mongodb-memory-server (pruebas), GitHub Actions (CI)

## Requisitos previos

- Node.js `>= 22`
- Una instancia de MongoDB (local o Atlas)
- Cuentas/credenciales de: Cloudinary, Firebase (proyecto con Cloud Messaging), Twilio (con WhatsApp habilitado), Brevo
- (Opcional) Docker

## Instalación

```bash
npm install
cp .env.example .env
# completa .env con tus credenciales reales (ver detalle de cada variable en ese mismo archivo)
```

## Scripts disponibles

| Comando | Descripción |
|---|---|
| `npm run dev` | Levanta el servidor en modo desarrollo (nodemon, recarga en caliente) |
| `npm start` | Levanta el servidor en modo producción |
| `npm run seed` | Crea una institución + un usuario `administrador` + un `superadmin` de ejemplo (ver credenciales impresas en consola) |
| `npm test` | Corre toda la suite de pruebas (Vitest) |
| `npm run test:watch` | Corre las pruebas en modo watch |
| `npm run test:coverage` | Corre las pruebas con reporte de cobertura |
| `npm run reset-db -- --confirm` | **Destructivo.** Borra toda la base de datos de `MONGO_URI`. Bloqueado si `NODE_ENV=production`; requiere el flag `--confirm` |

El servidor arranca por defecto en `http://localhost:4000` (configurable con `PORT`). La ruta `GET /` sirve como health check.

## Variables de entorno

Ver [.env.example](.env.example) para la lista completa con explicación de cada una (base de datos, JWT, Cloudinary, Firebase, Twilio, Brevo). Ninguna tiene valores por defecto sensibles cargados en el repo; `.env` está en `.gitignore` y nunca debe subirse.

## Docker

```bash
docker compose up --build
```

Levanta el backend en el puerto `4000` leyendo las variables desde `.env`. La imagen corre con un usuario sin privilegios (no root), expone un healthcheck sobre `GET /` y hace apagado ordenado ante SIGTERM para no cortar peticiones en curso en cada redeploy.

> **Este `docker-compose.yml` es solo para desarrollo/pruebas del backend por
> separado** (levanta únicamente este servicio). Para el despliegue real
> (frontend + backend juntos en la misma VM), el `docker-compose.yml` que se
> usa es el del repo del frontend (`Edumon-Repositorio-nuevo/docker-compose.yml`)
> — ese sí levanta ambos contenedores en una misma red y hace que el
> frontend le hable a este backend por su nombre de servicio interno
> (`backend:4000`), sin tocar nada de la imagen de este repo.

### Antes de exponerlo a internet

En cuanto se defina el dominio real de la VM, falta un solo ajuste: poner ese
dominio en `FRONTEND_URL` del `.env`. Esa variable alimenta tanto el CORS
como el `Content-Security-Policy` (`connectSrc`) — no hay que tocar nada más
en el código. Sin HTTPS en la VM, el login queda roto en producción: las
cookies de sesión se marcan `Secure` cuando `NODE_ENV=production`, así que el
navegador no las guarda si no hay TLS.

## Estructura del proyecto

```
src/
├── config/        # conexión a Mongo, Cloudinary
├── controllers/    # lógica de negocio por recurso
├── routes/         # definición de endpoints (montados bajo /api/...)
├── models/         # esquemas Mongoose
├── middlewares/     # auth, roles, validadores, uploads
├── notifications/   # estrategias de notificación (WebSocket, push, WhatsApp, correo)
├── events/          # bus de eventos interno
├── schedulers/       # tareas programadas (node-cron)
├── socket/          # handlers de Socket.IO
├── scripts/         # seed y utilidades de mantenimiento
└── utils/
```

## Seguridad (resumen)

- JWT en cookies `httpOnly` (no `localStorage`), access token de 15 min + refresh token rotado de 7 días (hash SHA-256 en BD, máx. 5 sesiones simultáneas).
- Contraseñas con `bcrypt`.
- Rate limiting global y reforzado en `/api/auth/login` y `/api/auth/register`.
- Helmet (CSP, HSTS, Permissions-Policy) y sanitización de payloads contra NoSQL injection.
- Control de acceso por rol (`padre`, `docente`, `administrador`, `superadmin`) y por institución.

## Testing

Suite de pruebas con Vitest + Supertest + mongodb-memory-server (no toca una base de datos real, corre aislada). Se ejecuta automáticamente en GitHub Actions en cada push y pull request ([.github/workflows/tests.yml](.github/workflows/tests.yml)).

```bash
npm test              # toda la suite
npm run test:coverage # con reporte de cobertura
```

## Licencia

Este proyecto aún no tiene asignada una licencia de código abierto. Mientras no se indique lo contrario, todos los derechos están reservados por su autor conforme a la legislación de derechos de autor aplicable.

## Autor

Bryan David Yepes
