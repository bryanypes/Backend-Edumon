# Edumon Backend

API REST de Edumon, plataforma de gestión escolar que conecta instituciones, docentes y familias: cursos, módulos, retos (tareas) y entregas con valoración, foros, calendario de eventos y notificaciones. La consumen la web (`Frontend`) y la app Android (`Edumonmovil_flutter`).

## Stack

- Node.js 22 o superior, Express 5 (ES modules)
- MongoDB con Mongoose
- JWT en cookies httpOnly (access token y refresh token rotado)
- Socket.IO (notificaciones en tiempo real), Firebase Admin (push), Nodemailer (correo)
- node-cron (recordatorios), sharp y ExcelJS (imágenes e importación de usuarios)
- Archivos en disco local (`UPLOAD_DIR`)
- Vitest, Supertest y mongodb-memory-server; ESLint y Prettier

## Requisitos

- Node.js 22 o superior
- MongoDB (local o administrado)
- Opcional: credenciales SMTP (correo) y de una cuenta de servicio de Firebase (push). Sin ellas, esos canales quedan desactivados.

## Instalación

```bash
npm install
cp .env.example .env   # completar los valores
npm run dev            # http://localhost:4000
```

`GET /` responde como health check. Todas las rutas de la API están bajo `/api`.

## Variables de entorno

Documentadas una a una en [`.env.example`](.env.example):

- `PORT`, `NODE_ENV`, `FRONTEND_URL` (CORS), `URL_WEB` (enlaces de los correos)
- `MONGO_URI`, `JWT_SECRET`, `SESION_DIAS_PADRES_DOCENTES`
- `UPLOAD_DIR` (archivos subidos)
- `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM_NAME`, `SMTP_FROM_EMAIL`
- `BOOTSTRAP_INSTITUCION_*` y `BOOTSTRAP_ADMIN_<n>_*`: institución y cuentas iniciales que se crean al arrancar si no existen
- `PILOTO_*`: contenido inicial del piloto (solo para `npm run piloto:restablecer`)

## Scripts

| Comando | Descripción |
| --- | --- |
| `npm run dev` | Servidor con recarga (nodemon) |
| `npm start` | Servidor en producción |
| `npm test` | Pruebas (Vitest, base de datos en memoria) |
| `npm run test:watch` / `npm run test:coverage` | Pruebas en modo watch / con cobertura |
| `npm run lint` | ESLint |
| `npm run format` / `npm run format:check` | Prettier |
| `npm run seed` | Borra la base de `MONGO_URI` y carga datos de prueba (clave `Password123*`). Bloqueado con `NODE_ENV=production` |
| `npm run piloto:restablecer -- --confirmar` | Borra la base (salvo las APK) y crea la institución, las cuentas y el contenido del piloto |
| `npm run bootstrap:reset-passwords` | Restablece la contraseña de las cuentas `BOOTSTRAP_ADMIN_*` |
| `npm run correos:prueba` | Envía un correo de cada tipo por el SMTP configurado |
| `npm run telefonos:normalizar` | Migra teléfonos al formato `+57XXXXXXXXXX` (simula; `-- --aplicar` escribe) |

## Estructura

```
src/
  app.js, server.js, index.js   configuración de Express, servidor HTTP/Socket.IO y arranque
  config/         base de datos y almacenamiento
  routes/         endpoints bajo /api
  controllers/    lógica por recurso
  middlewares/    autenticación, permisos, validadores y subida de archivos
  models/         esquemas de Mongoose
  services/       notificaciones y plantillas de correo
  notifications/  canales: WebSocket, push y correo
  events/         bus de eventos interno
  schedulers/     tareas programadas
  socket/         handlers de Socket.IO
  scripts/        seed, piloto y migraciones
  uploads/        recursos estáticos (avatares predeterminados, imágenes de correo)
  utils/
tests/            pruebas unitarias e integración
```

## Docker

`docker compose up --build` levanta solo el backend (puerto 4000) con las variables de `.env`. El despliegue completo (web, API y MongoDB) está en el repositorio raíz `Edumon`.

## Licencia

Sin licencia de código abierto: todos los derechos reservados.

## Autor

Bryan David Yepes
