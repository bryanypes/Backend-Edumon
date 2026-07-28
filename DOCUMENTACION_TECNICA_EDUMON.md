# Edumon — Documentación Técnica Completa

> Generado a partir de una auditoría directa del código fuente de dos repositorios:
> - **Backend**: `Backend Edumon/` (este repositorio) — Node.js/Express/MongoDB.
> - **Frontend**: `Edumon-Repositorio-nuevo/` (repositorio hermano, en el mismo directorio padre) — React/Vite.
>
> Fecha del corte de esta documentación: 2026-07-27. Basado en el estado real de los archivos al momento de generarla, no en documentación previa.

---

## 1. PROJECT OVERVIEW

### ¿Qué es Edumon?

Edumon es una **plataforma de gestión escolar** (tipo "campus virtual" / portal académico) que conecta a instituciones educativas, docentes, padres/acudientes y una administración central de la plataforma. Permite:

- Gestionar cursos, módulos y tareas con fechas de entrega.
- Que los padres/acudientes entreguen tareas en nombre de sus hijos y reciban calificaciones (sistema de 1 a 5 estrellas).
- Comunicación mediante foros por curso (con mensajes, respuestas y likes).
- Un calendario de eventos institucionales, de "escuela de padres" y de tareas.
- Notificaciones multicanal (en la app vía WebSocket, push FCM, WhatsApp y correo).
- Un sistema de **perfiles familiares** (similar a los perfiles de Netflix): una sola cuenta "titular" puede tener varios perfiles hijos sin credenciales propias.
- Un buzón de contacto público (para consultas de personas no registradas).
- Administración multi-institución: un **superadmin** de la plataforma da de alta instituciones educativas; cada institución tiene su propio **administrador**, que a su vez da de alta docentes y cursos.

### Problema que resuelve

Centraliza la comunicación y el seguimiento académico entre colegio, docentes y familias que hoy suele estar fragmentada entre WhatsApp, papel y llamadas telefónicas, dando trazabilidad (fechas de entrega, historial de calificaciones, notificaciones) y un canal oficial por institución.

### Roles y permisos

| Rol | Descripción | Puede hacer |
|---|---|---|
| `padre` | Padre/acudiente (cuenta titular) | Ver cursos donde está inscrito, crear/gestionar **perfiles familiares** hijos, entregar tareas, calificación recibida (solo lectura), participar en foros, ver calendario/eventos, recibir notificaciones, unirse a cursos, editar su propio perfil |
| `docente` | Profesor de una institución | Crear/editar/archivar cursos propios, crear módulos y tareas, calificar entregas, crear/gestionar foros de sus cursos, crear eventos, carga masiva de participantes vía CSV |
| `administrador` | Administrador de una institución (colegio) | Todo lo del docente + gestionar usuarios de su institución, preregistrar docentes (individual o CSV), ver su institución, actuar como admin general de cursos/módulos/tareas de la institución |
| `superadmin` | Administrador de la plataforma (único, no puede haber más de uno) | Crear y gestionar instituciones, ver el buzón de contacto público, listar instituciones, todo lo de administrador a nivel global |

Control de acceso implementado con middlewares `authMiddleware` (JWT) + `requireRole([...])` + `requireMismaInstitucion` en [authMiddleware.js](src/middlewares/authMiddleware.js).

### Objetivos principales del sistema

1. Un canal oficial único de comunicación colegio ↔ familia.
2. Seguimiento verificable del ciclo tarea → entrega → calificación.
3. Soporte multi-institución (una sola plataforma, múltiples colegios aislados por `institucionId`).
4. Notificaciones en tiempo real y multicanal para no depender de que el usuario abra la app.
5. Soporte para familias con múltiples hijos en el mismo colegio o colegios distintos, sin crear una cuenta por cada hijo.

---

## 2. TECH STACK (versiones exactas instaladas, extraídas de `package-lock.json`)

### Backend (`Backend Edumon/`)

- **Lenguaje**: JavaScript (ES Modules, `"type": "module"`)
- **Runtime**: Node.js (imagen Docker `node:20-alpine` → Node 20)
- **Framework HTTP**: Express `5.1.0`
- **Servidor**: `http` nativo de Node envolviendo Express + Socket.IO adjunto al mismo servidor HTTP
- **ODM / Base de datos**: Mongoose `8.18.1` sobre MongoDB
- **Cache**: no hay capa de caché (Redis, memcached, etc.) — no está presente en dependencias

**Dependencias de producción:**

| Paquete | Versión instalada | Uso |
|---|---|---|
| express | 5.1.0 | Framework HTTP |
| mongoose | 8.18.1 | ODM MongoDB |
| jsonwebtoken | 9.0.2 | Firma/verificación de JWT (access token) |
| bcryptjs | 3.0.2 | Hash de contraseñas |
| cookie-parser | 1.4.7 | Lectura de cookies httpOnly (access/refresh token) |
| cors | 2.8.5 | CORS |
| helmet | 8.1.0 | Cabeceras de seguridad / CSP |
| express-rate-limit | 8.3.2 | Rate limiting global y en `/auth` |
| express-validator | 7.3.2 | Validación de payloads |
| compression | 1.8.1 | Compresión gzip de respuestas |
| connect-timeout | 1.9.1 | Timeout de 30s por request |
| dotenv | 17.2.3 | Carga de variables de entorno |
| multer | 2.1.1 | Manejo de `multipart/form-data` (archivos en memoria) |
| cloudinary | 2.7.0 | Almacenamiento de imágenes/archivos/video (avatares, portadas, adjuntos) |
| csv-parser | 3.2.0 | Parseo de CSV para carga masiva de usuarios/docentes |
| firebase-admin | 13.8.0 | Envío de notificaciones push (FCM) |
| twilio | 5.10.3 | Envío de mensajes de WhatsApp (recuperación de contraseña por teléfono) |
| axios | 1.15.2 | Cliente HTTP (usado para llamar la API de Resend) |
| socket.io | 4.8.1 | Comunicación en tiempo real (notificaciones, presencia) |
| node-cron | 4.2.1 | Tareas programadas (scheduler de tareas/recordatorios) |

**Dependencias de desarrollo:**
| Paquete | Versión | Uso |
|---|---|---|
| nodemon | 3.1.10 | Recarga en caliente en `npm run dev` |

No hay ORM SQL, no hay TypeScript en el backend, no hay GraphQL.

### Frontend (`Edumon-Repositorio-nuevo/`)

- **Framework**: React `19.1.0`
- **Bundler**: Vite `7.3.3` (con `@vitejs/plugin-react`)
- **Lenguaje**: JSX/JS, con soporte TypeScript parcial (`typescript ^5`, `tsconfig.json`, algunos `.ts`) pero la mayoría del código es `.jsx`
- **CSS**: Tailwind CSS `4.1.14` (vía `@tailwindcss/postcss`) + hojas CSS propias por componente (`src/styles/`)
- **Router**: React Router DOM `7.14.2`
- **Estado global**: Zustand `5.0.12`
- **Data fetching / cache de servidor**: TanStack React Query `5.100.10`
- **HTTP client**: `axios`-like interno vía `src/services/core/apiClient.js` + `src/lib/apiClient.js` (interceptores propios en `src/services/core/interceptors.js`)
- **Animaciones**: Framer Motion `12.23.22`
- **Íconos**: lucide-react `0.469.0`
- **Fuentes**: `@fontsource/dm-sans`, `@fontsource/plus-jakarta-sans`
- **Auth util**: `jwt-decode 4.0.0` (decodificar el JWT en cliente para leer rol/expiración, sin validarlo — la validación real la hace el backend)
- **Firebase (cliente)**: `firebase 12.13.0` — para recibir notificaciones push (FCM) en el navegador

Nota: la carpeta se llama "Edumon-Repositorio-nuevo" y contiene artefactos `.next` residuales, pero el `package.json` real usa **Vite**, no Next.js — Next.js no aparece como dependencia.

### Servicios externos

| Servicio | Propósito | Variable(s) de entorno relacionadas |
|---|---|---|
| MongoDB (Atlas o similar) | Base de datos principal | `MONGO_URI` |
| Cloudinary | Almacenamiento de imágenes/archivos (fotos de perfil, portadas de curso/evento, adjuntos de tareas/entregas/foros) | `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` |
| Firebase Admin SDK | Notificaciones push móviles/web (FCM) | `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` |
| Web Push (VAPID) | Suscripciones push del navegador (modelo `PushSubscription`) | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_EMAIL` |
| Twilio (WhatsApp) | Envío de código de recuperación de contraseña por WhatsApp cuando se usa `telefono` | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_NUMBER` |
| Resend | Envío de correos (recuperación de contraseña por `correo`) — llamado directamente vía HTTP con `axios`, no con el SDK oficial | `RESEND_API_KEY` |

No hay integración con ningún proveedor de IA/LLM en el código actual.

---

## 3. BASE DE DATOS

- **Motor**: MongoDB (NoSQL, documentos). La versión concreta del servidor depende del proveedor (típicamente Atlas) y no está fijada en el código; el driver es Mongoose `8.18.1`, compatible con MongoDB 4.x en adelante.
- 13 colecciones (modelos Mongoose), una por archivo en [src/models/](src/models/).

### 3.1 `users` (modelo `User`)

| Campo | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `nombre` | String | required | Nombre |
| `apellido` | String | required | Apellido |
| `cedula` | String | required, **unique**, regex `^\d{6,10}$` | Documento de identidad |
| `correo` | String | opcional, **unique** (sparse), lowercase, validado por regex | Correo — usado solo para notificaciones y recuperación de contraseña, **no** para login |
| `contraseña` | String | required, min 6, hasheada con bcrypt (salt 10) antes de guardar | Contraseña |
| `rol` | String enum | required | `padre`, `docente`, `administrador`, `superadmin` |
| `telefono` | String | indexado | **Credencial de login** (normalizado a formato `+57XXXXXXXXXX`) |
| `preferencias` | [Boolean] | default `[true, true]` | Preferencias de notificación |
| `modoOscuro` | Boolean | default `false` | Preferencia de tema |
| `fechaRegistro` | Date | default now | — |
| `ultimoAcceso` | Date | — | Última vez que hizo login |
| `primerInicioSesion` | Boolean | default `true` | Fuerza flujo de "primer inicio" en frontend |
| `estado` | String enum | default `activo` | `activo`, `suspendido` |
| `fotoPerfilUrl` | String | — | URL de Cloudinary |
| `fcmToken` / `fcmTokenActualizadoEn` | String / Date | — | Token push del dispositivo |
| `resetPasswordToken` | String | default null | Hash SHA-256 del código de recuperación |
| `resetPasswordExpires` | Date | default null | Expiración del código (15 min) |
| `esTitular` | Boolean | default `true` | Si la cuenta es "titular" (puede tener perfiles familiares) |
| `institucionId` | ObjectId → `Institucion` | default null | Requerido en la práctica para `docente`/`administrador` |
| `refreshTokens[]` | Array (select:false) | TTL index | `tokenHash` (SHA-256), `creadoEn`, `expiraEn`, `userAgent`, `ip`. Máx. 5 sesiones simultáneas |

### 3.2 `instituciones` (modelo `Institucion`)

| Campo | Tipo | Restricciones |
|---|---|---|
| `nombre` | String | required, max 150 |
| `nit` | String | required, **unique** |
| `direccion` | String | — |
| `telefono` | String | — |
| `correo` | String | lowercase |
| `logoUrl` / `logoPublicId` | String | Cloudinary |
| `adminId` | ObjectId → `User` | Admin del colegio |
| `activo` | Boolean | default `true` |
| `codigo` | String | **unique**, autogenerado formato `EDU-XXXXXX` | Código para que docentes/padres se identifiquen con el colegio |

### 3.3 `cursos` (modelo `Curso`)

| Campo | Tipo | Restricciones |
|---|---|---|
| `nombre` | String | required, max 100 |
| `descripcion` | String | required, max 500 |
| `fotoPortadaUrl` / `fotoPortadaPublicId` | String | Cloudinary o URL externa |
| `color` | String | regex hex (`#3B82F6`) |
| `docenteId` | ObjectId → `User` | required, validado async: debe tener `rol: 'docente'` |
| `participantes[]` | Subdocumento `{ usuarioId → User, etiqueta: enum(padre,docente) }` | — |
| `estado` | String enum | `activo`, `archivado` (default `activo`) |
| `institucionId` | ObjectId → `Institucion` | required, indexado |

### 3.4 `modulos` (modelo `Modulo`)

| Campo | Tipo | Restricciones |
|---|---|---|
| `cursoId` | ObjectId → `Curso` | required |
| `titulo` | String | required, max 200 |
| `descripcion` | String | max 1000 |
| `estado` | String enum | `activo`, `inactivo` (default `activo`) |

### 3.5 `tareas` (modelo `Tarea`)

| Campo | Tipo | Restricciones |
|---|---|---|
| `titulo` | String | required, max 200 |
| `descripcion` | String | max 2000 |
| `fechaEntrega` | Date | required |
| `docenteId` | ObjectId → `User` | required |
| `etiquetas[]` | [String] | — |
| `tipoEntrega` | String enum | `texto`, `archivo`, `multimedia`, `enlace`, `presencial`, `grupal` |
| `archivosAdjuntos[]` | Subdocumento `{ tipo: enum(archivo,enlace), url, nombre, publicId?, formato?, tamano?, descripcion? }` | — |
| `criterios` | String | — |
| `estado` | String enum | `publicada`, `cerrada` (default `publicada`) |
| `cursoId` | ObjectId → `Curso` | required |
| `moduloId` | ObjectId → `Modulo` | required |
| `asignacionTipo` | String enum | `todos`, `seleccionados` (default `todos`) |
| `participantesSeleccionados[]` | [ObjectId → `User`] | requerido no-vacío si `asignacionTipo = seleccionados` |

### 3.6 `entregas` (modelo `Entrega`)

| Campo | Tipo | Restricciones |
|---|---|---|
| `tareaId` | ObjectId → `Tarea` | required |
| `padreId` | ObjectId → `User` | required |
| `fechaEntrega` | Date | default now |
| `archivosAdjuntos[]` | `{ url, publicId, nombreOriginal, tipoArchivo, tamano }` | todos required |
| `textoRespuesta` | String | max 5000 |
| `estado` | String enum | `borrador`, `enviada`, `tarde` (default `borrador`) |
| `calificacion.valoracion` | Number | 1–5, entero (sistema de estrellas) |
| `calificacion.comentario` | String | max 1000 |
| `calificacion.fechaCalificacion` / `fechaUltimaModificacion` | Date | — |
| `calificacion.valoracionAnterior` | Number | 1–5 (auditoría de cambio de nota) |
| `calificacion.docenteId` | ObjectId → `User` | quién calificó |

Índice único compuesto `{ tareaId, padreId }` → **un padre solo puede tener una entrega por tarea**.

### 3.7 `eventos` (modelo `Evento`)

| Campo | Tipo | Restricciones |
|---|---|---|
| `titulo` | String | required, 3–200 |
| `descripcion` | String | required, min 10 |
| `fechaInicio` | Date | required, debe ser futura al crear |
| `fechaFin` | Date | required, posterior a `fechaInicio` |
| `hora` | String | formato `HH:MM` |
| `ubicacion` | String | required |
| `docenteId` | ObjectId → `User` | required |
| `imagenPortada` / `adjuntos` | `{ url, publicId, nombre? }` | Cloudinary |
| `cursosIds[]` | [ObjectId → `Curso`] | required |
| `categoria` | String enum | `escuela_padres`, `tarea`, `institucional` |
| `estado` | String enum | `programado`, `en_curso`, `finalizado`, `cancelado` (default `programado`) |

### 3.8 `notificaciones` (modelo `Notificacion`)

| Campo | Tipo | Restricciones |
|---|---|---|
| `usuarioId` | ObjectId → `User` | required |
| `tipo` | String enum | `tarea`, `entrega`, `calificacion`, `foro`, `evento`, `sistema` |
| `mensaje` | String | required, max 500 |
| `leido` | Boolean | default `false` |
| `referenciaId` | ObjectId (polimórfico vía `refPath`) | referencia al recurso origen |
| `referenciaModelo` | String enum | `Tarea`, `Entrega`, `Curso`, `Modulo`, `User`, `Evento`, `Buzon` |
| `metadata` | Map | datos adicionales |
| `prioridad` | String enum | `baja`, `media`, `alta`, `critica` (default `media`) |
| `canalEnviado` | `{ websocket, push, whatsapp, email }` (Booleans) | por qué canales se envió |
| `agrupacionId` | String | agrupar notificaciones relacionadas |

TTL index: se borran automáticamente a los 90 días (`expireAfterSeconds: 7776000`).

### 3.9 `foros` (modelo `Foro`)

| Campo | Tipo | Restricciones |
|---|---|---|
| `titulo` | String | required, max 200 |
| `descripcion` | String | required, max 2000 |
| `docenteId` | ObjectId → `User` | required, validado: debe ser `docente` o `administrador` |
| `cursoId` | ObjectId → `Curso` | required |
| `archivos[]` | `{ url, publicId, tipo: enum(imagen,video,pdf), nombre }` | máx. 5 |
| `estado` | String enum | `abierto`, `cerrado` (default `abierto`) |
| `publico` | Boolean | default `false` |

### 3.10 `mensajeforos` (modelo `MensajeForo`)

| Campo | Tipo | Restricciones |
|---|---|---|
| `foroId` | ObjectId → `Foro` | required |
| `usuarioId` | ObjectId → `User` | required |
| `contenido` | String | required, max 1500 |
| `archivos[]` | igual que en `Foro`, máx. 5 | — |
| `respuestaA` | ObjectId → `MensajeForo` (auto-referencia) | default null — hilos de respuesta |
| `likes` | Number | default 0 |
| `likedBy[]` | [ObjectId → `User`] | — |

### 3.11 `perfilfamiliars` (modelo `PerfilFamiliar`)

| Campo | Tipo | Restricciones |
|---|---|---|
| `titularId` | ObjectId → `User` | required, indexado — cuenta dueña |
| `nombre` | String | required, max 50 |
| `avatarUrl` | String | — |
| `fcmToken` / `fcmTokenActualizadoEn` | String / Date | token push por perfil (no por cuenta) |
| `activo` | Boolean | default `true` |

Perfiles sin credenciales propias — se accede desde la sesión del titular ("perfiles tipo Netflix").

### 3.12 `buzons` (modelo `Buzon`)

| Campo | Tipo | Restricciones |
|---|---|---|
| `nombre` | String | required, max 100 |
| `correo` | String | required, lowercase |
| `telefono` | String | required |
| `mensaje` | String | required, 10–1000 |
| `leido` | Boolean | default `false` |

Formulario de contacto **público** (sin autenticación), con rate limit propio.

### 3.13 `pushsubscriptions` (modelo `PushSubscription`)

| Campo | Tipo | Restricciones |
|---|---|---|
| `usuarioId` | ObjectId → `User` | required, indexado |
| `endpoint` | String | required, **unique** |
| `keys.p256dh` / `keys.auth` | String | required — claves del estándar Web Push |
| `userAgent` | String | — |
| `activa` | Boolean | default `true` |

### 3.14 Diagrama de relaciones (resumen)

```
Institucion 1─┬──* User (institucionId)
              └──1 User (adminId, admin del colegio)

User (docente) 1──* Curso (docenteId)
Institucion   1──* Curso (institucionId)
Curso         *──* User (participantes[].usuarioId, vía subdocumento con etiqueta)

Curso   1──* Modulo (cursoId)
Curso   1──* Tarea  (cursoId)
Modulo  1──* Tarea  (moduloId)
User(docente) 1──* Tarea (docenteId)
Tarea   *──* User (participantesSeleccionados[])

Tarea   1──* Entrega (tareaId)   [único por (tareaId, padreId)]
User(padre)   1──* Entrega (padreId)
User(docente) 1──* Entrega.calificacion (docenteId)

Curso   1──* Foro (cursoId)
User    1──* Foro (docenteId)
Foro    1──* MensajeForo (foroId)
User    1──* MensajeForo (usuarioId)
MensajeForo 1──* MensajeForo (respuestaA, hilos)

User(docente) 1──* Evento (docenteId)
Evento  *──* Curso (cursosIds[])

User    1──* Notificacion (usuarioId)
Notificacion *──1 [Tarea|Entrega|Curso|Modulo|User|Evento|Buzon] (referenciaId + referenciaModelo)

User(titular) 1──* PerfilFamiliar (titularId)
User    1──* PushSubscription (usuarioId)
```

---

## 4. STATE MACHINE (entidades principales)

### `User.estado`
```
activo ──(admin/superadmin: DELETE /api/users/:id → soft delete)──> suspendido
```
No hay transición automática de vuelta a `activo` expuesta salvo edición manual vía `PUT /api/users/:id`.

### `Curso.estado`
```
activo ──(docente/admin: DELETE /api/cursos/:id)──> archivado
```
Unidireccional (soft delete, no hay "desarchivar" expuesto en las rutas).

### `Modulo.estado`
```
activo ──(docente/admin: DELETE /api/modulos/:id)──> inactivo
inactivo ──(docente/admin: PATCH /api/modulos/:id/restore)──> activo
```

### `Tarea.estado`
```
publicada ──(docente/admin dueño: PATCH /api/tareas/:id/close)──> cerrada
```
Unidireccional. Una tarea `cerrada` deja de aceptar nuevas entregas (`enviarEntrega` lo valida explícitamente).

### `Entrega.estado`
```
borrador ──(padre: PATCH /api/entregas/:id/enviar)──┬─(antes de fechaEntrega de la tarea)──> enviada
                                                     └─(después de fechaEntrega)──> tarde
```
Transición disparada por el **padre**, calculada automáticamente por el backend comparando la fecha actual con `tarea.fechaEntrega` (no la elige el usuario). Solo se puede editar/eliminar mientras está en `borrador`. `enviada`/`tarde` son estados terminales para el padre; a partir de ahí el docente puede calificar (`calificacion.valoracion`), lo cual no cambia el campo `estado`.

### `Evento.estado`
```
programado ──(automático, pre-save hook: ahora >= fechaInicio y < fechaFin)──> en_curso
en_curso   ──(automático, pre-save hook: ahora >= fechaFin)──> finalizado
[cualquier estado] ──(docente/admin: DELETE)──> eliminado físicamente (no hay transición documentada a "cancelado" vía código actual, aunque el enum lo contempla)
```
Los estados `programado`/`en_curso`/`finalizado` se recalculan automáticamente cada vez que el documento se guarda (`pre('save')`), en función de la fecha/hora del servidor — no son transiciones manuales de un actor humano.

### `Foro.estado`
```
abierto ──(docente/admin: PATCH /api/foros/:id/estado)──> cerrado
cerrado ──(docente/admin: PATCH /api/foros/:id/estado)──> abierto
```
Bidireccional (toggle).

### `Institucion.activo`
```
true ──(superadmin: PUT /api/instituciones/:id)──> false
```
Boolean simple, editado por superadmin.

---

## 5. API ENDPOINTS

Prefijo base: `/api`. Todas las rutas protegidas requieren cookie `access_token` (o header `Authorization: Bearer`) válida vía `authMiddleware`.

### `/api/auth` — [authRoutes.js](src/routes/authRoutes.js)

| Método | Ruta | Rol requerido | Descripción |
|---|---|---|---|
| POST | `/register` | Público | Registro de usuario (rate-limited: 10/15min) |
| POST | `/login` | Público | Login con `telefono` + `contraseña` (rate-limited) |
| POST | `/forgot-password` | Público | Solicita código de recuperación por **correo** |
| POST | `/reset-password` | Público | Cambia contraseña con código enviado por correo |
| POST | `/forgot-password-phone` | Público | Solicita código de recuperación por **WhatsApp** |
| POST | `/reset-password-phone` | Público | Cambia contraseña con código enviado por WhatsApp |
| POST | `/refresh` | Público (requiere cookie `refresh_token`) | Rota el refresh token y emite nuevo access token |
| GET | `/profile` | Autenticado | Perfil del usuario actual |
| POST | `/change-password` | Autenticado | Cambia contraseña conociendo la actual |
| POST | `/logout` | Autenticado | Cierra la sesión actual |
| POST | `/logout-all` | Autenticado | Cierra todas las sesiones (todas las refresh tokens) |

### `/api/users` — [userRoutes.js](src/routes/userRoutes.js)

| Método | Ruta | Rol requerido | Descripción |
|---|---|---|---|
| GET | `/me/profile` | Autenticado | Perfil propio |
| PUT | `/me/profile` | Autenticado | **Editar perfil propio** (nombre/apellido/correo/telefono) — añadido en esta sesión |
| PUT | `/me/foto-perfil` | Autenticado | Cambiar foto de perfil (predeterminada o subida) |
| PUT | `/me/fcm-token` | Autenticado | Guardar token push del dispositivo |
| PATCH | `/me/modo-oscuro` | Autenticado | Guardar preferencia de tema |
| GET | `/fotos-predeterminadas` | Autenticado | Lista de avatares predefinidos (Cloudinary) |
| GET | `/sesiones/ultimas` | Autenticado | Último acceso propio, o (si `superadmin`) listado paginado de todos los usuarios |
| GET | `/padre/:padreId/info` | Autenticado | Info completa de un padre/acudiente |
| POST | `/` | `administrador`, `superadmin` | Crear usuario |
| GET | `/` | `administrador`, `superadmin` | Listar usuarios (paginado, filtros por rol/estado) |
| GET | `/:id` | `administrador`, `superadmin` | Obtener usuario por ID |
| PUT | `/:id` | `administrador`, `superadmin` | Editar usuario (incluye rol/estado/institución) |
| DELETE | `/:id` | `administrador`, `superadmin` | Suspender usuario (soft delete) |

### `/api/cursos` — [cursoRoutes.js](src/routes/cursoRoutes.js)

| Método | Ruta | Rol requerido | Descripción |
|---|---|---|---|
| POST | `/` | `administrador`, `docente` | Crear curso (foto portada + CSV opcional de participantes) |
| GET | `/` | `administrador`, `docente`, `padre` | Listar todos los cursos |
| GET | `/mis-cursos` | Autenticado | Cursos del usuario actual |
| GET | `/:id/participantes` | `administrador`, `docente` | Participantes de un curso |
| GET | `/:id` | Autenticado | Detalle de un curso |
| PUT | `/:id` | `administrador`, `docente` | Editar curso |
| DELETE | `/:id` | `administrador`, `docente` | Archivar curso (soft delete) |
| POST | `/:id/participantes` | `administrador`, `docente`, `padre` | Agregar participante individual |
| DELETE | `/:id/participantes/:usuarioId` | `administrador`, `docente` | Remover participante |
| POST | `/:id/usuarios-masivo` | `administrador`, `docente` | Carga masiva de participantes vía CSV |

### `/api/modulos` — [moduloRoutes.js](src/routes/moduloRoutes.js)

| Método | Ruta | Rol requerido | Descripción |
|---|---|---|---|
| POST | `/` | `administrador`, `docente` | Crear módulo |
| GET | `/curso/:cursoId` | Autenticado | Módulos de un curso |
| GET | `/` | Autenticado | Listar módulos |
| GET | `/:id` | Autenticado | Detalle de módulo |
| PUT | `/:id` | `administrador`, `docente` | Editar módulo |
| DELETE | `/:id` | `administrador`, `docente` | Inactivar módulo |
| PATCH | `/:id/restore` | `administrador`, `docente` | Reactivar módulo |

### `/api/tareas` — [tareaRoutes.js](src/routes/tareaRoutes.js)

| Método | Ruta | Rol requerido | Descripción |
|---|---|---|---|
| POST | `/` | `administrador`, `docente` | Crear tarea (hasta 10 archivos adjuntos, 50MB c/u) |
| GET | `/` | Autenticado (filtrado automático según rol) | Listar tareas |
| GET | `/:id` | Autenticado + `canViewTarea` | Ver tarea |
| PUT | `/:id` | Autenticado + `canModifyTarea` (docente asignado) | Editar tarea |
| PATCH | `/:id/close` | Autenticado + `canModifyTarea` | Cerrar tarea |
| DELETE | `/:id` | Autenticado + `canModifyTarea` | Eliminar tarea |

### `/api/entregas` — [entregaRoutes.js](src/routes/entregaRoutes.js)

| Método | Ruta | Rol requerido | Descripción |
|---|---|---|---|
| GET | `/` | Autenticado (filtrado por rol) | Listar entregas |
| GET | `/tarea/:tareaId` | `docente`, `administrador` | Entregas de una tarea |
| GET | `/padre/:padreId` | `docente`, `administrador` | Entregas de un padre específico |
| PATCH | `/:id/calificar` | Autenticado + `canCalificarEntrega` (docente de la tarea) | Calificar entrega (1–5 estrellas + comentario) |
| POST | `/` | Autenticado + `canCreateEntrega` (padre) | Crear entrega (borrador o enviar directo, hasta 5 archivos) |
| GET | `/mis-entregas/:tareaId` | Autenticado | Mi entrega para una tarea |
| PUT | `/:id` | Autenticado + `canModifyEntrega` (solo en borrador) | Editar entrega |
| PATCH | `/:id/enviar` | Autenticado + `canModifyEntrega` | Enviar entrega (borrador → enviada/tarde) |
| DELETE | `/:id` | Autenticado + `canModifyEntrega` (solo en borrador) | Eliminar entrega |
| DELETE | `/:id/archivos/:archivoId` | Autenticado + `canModifyEntrega` | Eliminar un archivo adjunto de la entrega |
| GET | `/:id` | Autenticado + `canViewEntrega` (padre dueño, docente o admin) | Ver entrega |

### `/api/notificaciones` — [notificacionRoutes.js](src/routes/notificacionRoutes.js)

| Método | Ruta | Rol requerido | Descripción |
|---|---|---|---|
| GET | `/` | Autenticado | Mis notificaciones (paginado/filtros) |
| GET | `/conteo-no-leidas` | Autenticado | Conteo de no leídas |
| GET | `/:id` | Autenticado | Notificación específica |
| POST | `/` | `administrador`, `superadmin` | Crear notificación manual |
| PATCH | `/:id/leer` | Autenticado | Marcar una como leída |
| PATCH | `/leer-multiples` | Autenticado | Marcar varias como leídas |
| PATCH | `/leer-todas` | Autenticado | Marcar todas como leídas |
| DELETE | `/:id` | Autenticado | Eliminar notificación |
| DELETE | `/limpiar/antiguas` | Autenticado | Eliminar leídas antiguas |

### `/api/eventos` — [eventoRoutes.js](src/routes/eventoRoutes.js)

| Método | Ruta | Rol requerido | Descripción |
|---|---|---|---|
| GET | `/` | Autenticado | Listar eventos |
| GET | `/hoy` | Autenticado | Eventos de hoy |
| GET | `/:id` | Autenticado | Detalle de evento |
| POST | `/` | Autenticado (sin `requireRole` explícito en la ruta) | Crear evento (imagen portada + adjunto, hasta 10MB) |
| PUT | `/:id` | Autenticado | Editar evento |
| DELETE | `/:id` | Autenticado (validado en el controlador: solo `administrador`/`docente`) | Eliminar evento |

### `/api/calendario` — [calendarioRoutes.js](src/routes/calendarioRoutes.js)

| Método | Ruta | Rol requerido | Descripción |
|---|---|---|---|
| GET | `/calendario` | Autenticado | Calendario del usuario actual |
| GET | `/calendario/proximos` | Autenticado | Próximos eventos del usuario |
| GET | `/:cursoId` | Autenticado | Calendario de un curso |
| GET | `/:cursoId/dia` | Autenticado | Eventos de un día concreto |
| GET | `/:cursoId/proximos` | Autenticado | Próximos eventos de un curso |

### `/api/foros` — [foroRoutes.js](src/routes/foroRoutes.js)

| Método | Ruta | Rol requerido | Descripción |
|---|---|---|---|
| POST | `/` | `docente`, `administrador` | Crear foro (hasta 5 archivos, 10MB c/u) |
| GET | `/:id/dashboard` | Autenticado | Dashboard/resumen de un foro |
| GET | `/curso/:cursoId` | Autenticado | Foros de un curso |
| GET | `/:id` | Autenticado | Detalle de foro |
| PUT | `/:id` | `docente`, `administrador` | Editar foro |
| PATCH | `/:id/estado` | `docente`, `administrador` | Abrir/cerrar foro |
| DELETE | `/:id` | `docente`, `administrador` | Eliminar foro |

### `/api/mensajes-foro` — [mensajeForoRoutes.js](src/routes/mensajeForoRoutes.js)

| Método | Ruta | Rol requerido | Descripción |
|---|---|---|---|
| POST | `/` | Autenticado | Crear mensaje/respuesta (hasta 5 archivos) |
| GET | `/foro/:foroId` | Autenticado | Mensajes de un foro |
| POST | `/:id/like` | Autenticado | Dar/quitar like |
| PUT | `/:id` | Autenticado | Editar mensaje |
| DELETE | `/:id` | Autenticado | Eliminar mensaje |

### `/api/instituciones` — [institucionRoutes.js](src/routes/institucionRoutes.js)

| Método | Ruta | Rol requerido | Descripción |
|---|---|---|---|
| POST | `/` | `superadmin` | Crear institución |
| GET | `/` | `superadmin` | Listar instituciones |
| PUT | `/:id` | `superadmin` | Editar institución |
| GET | `/mi-institucion` | `administrador`, `superadmin` | Institución propia |
| POST | `/docentes` | `administrador` | Preregistrar un docente |
| POST | `/docentes/csv` | `administrador` | Preregistrar docentes vía CSV |

### `/api/perfiles` — [perfilFamiliarRoutes.js](src/routes/perfilFamiliarRoutes.js)

| Método | Ruta | Rol requerido | Descripción |
|---|---|---|---|
| GET | `/` | Autenticado (titular) | Listar mis perfiles familiares |
| POST | `/` | Autenticado (titular) | Crear perfil familiar |
| POST | `/seleccionar` | Autenticado (titular) | Activar un perfil (emite nuevo token con `perfilId`) |
| PUT | `/:id` | Autenticado (titular) | Editar perfil |
| DELETE | `/:id` | Autenticado (titular) | Eliminar perfil |
| POST | `/fcm-token` | Autenticado | Guardar token push por perfil activo |

### `/api/buzon` — [buzonRoutes.js](src/routes/buzonRoutes.js)

| Método | Ruta | Rol requerido | Descripción |
|---|---|---|---|
| POST | `/` | Público (rate-limited) | Enviar mensaje de contacto |
| GET | `/` | `superadmin` | Listar mensajes del buzón |
| PATCH | `/:id/leido` | `superadmin` | Marcar mensaje como leído |

### Otras

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/` | Health check (estado de la API y del WebSocket) |
| * | Cualquier ruta no definida | 404 JSON estándar |

---

## 6. SYSTEM FLOW (viaje completo de usuario)

### 6.1 Alta de una institución nueva

1. `superadmin` hace login (`POST /api/auth/login`).
2. `POST /api/instituciones` → crea la institución (se autogenera `codigo` único `EDU-XXXXXX`).
3. `administrador` se registra: `POST /api/auth/register` con `rol: administrador` e `institucionId`.
4. El administrador entra: `POST /api/auth/login`.

### 6.2 Alta de docentes y cursos

1. `administrador` preregistra docentes: `POST /api/instituciones/docentes` (uno a uno) o `POST /api/instituciones/docentes/csv` (masivo).
2. El docente inicia sesión con el `telefono` con el que fue preregistrado.
3. Docente crea un curso: `POST /api/cursos` (foto portada opcional, CSV de participantes opcional).
4. Docente crea módulos: `POST /api/modulos`.
5. Docente crea tareas dentro de un módulo: `POST /api/tareas` (con adjuntos).
6. Docente crea foros del curso: `POST /api/foros`.

### 6.3 Flujo de un padre/acudiente

1. Registro: `POST /api/auth/register` con `rol: padre` (sin `institucionId`).
2. Login con `telefono` + `contraseña`: `POST /api/auth/login`.
3. (Opcional) Crea perfiles familiares para cada hijo: `POST /api/perfiles`.
4. Se une a un curso (vía código de la institución o invitación): `POST /api/cursos/:id/participantes`.
5. Ve sus tareas pendientes: `GET /api/tareas` (filtradas automáticamente).
6. Sube una entrega: `POST /api/entregas` (estado `borrador` o directo `enviada`/`tarde` según fecha).
7. Si quedó en `borrador`, la edita (`PUT /api/entregas/:id`) y luego la envía: `PATCH /api/entregas/:id/enviar`.
8. Recibe notificación (WebSocket/push/WhatsApp/correo) cuando el docente califica: `PATCH /api/entregas/:id/calificar` (acción del docente).
9. Participa en el foro del curso: `POST /api/mensajes-foro`.
10. Consulta el calendario de eventos: `GET /api/calendario/calendario`.

### 6.4 Recuperación de contraseña

- Por teléfono (WhatsApp): `POST /api/auth/forgot-password-phone` → `POST /api/auth/reset-password-phone`.
- Por correo: `POST /api/auth/forgot-password` → `POST /api/auth/reset-password`.

### 6.5 Sesión / refresh

- Access token (JWT, 15 min) y refresh token (opaco, hash SHA-256 en BD, 7 días) se emiten como cookies `httpOnly` en login/register.
- Cuando el access token expira, el cliente llama `POST /api/auth/refresh` (usa solo la cookie `refresh_token`, restringida por `path` a esa ruta) y rota el refresh token.

---

## 7. FOLDER STRUCTURE

### Backend (`Backend Edumon/`)

```
Backend Edumon/
├── Dockerfile
├── docker-compose.yml
├── package.json / package-lock.json
├── reset.js                     # script standalone: DROP de toda la base de datos (uso manual, peligroso)
└── src/
    ├── index.js                 # entrypoint (importa server.js)
    ├── server.js                # configuración de Express, Socket.IO, middlewares globales, montaje de rutas
    ├── config/
    │   ├── cloudinary.js
    │   ├── database.js          # conexión Mongoose
    │   └── multerConfig.js
    ├── controllers/             # 1 archivo por recurso (auth, user, curso, modulo, tarea, entrega,
    │                             #   notificacion, evento, calendario, foro, mensajeForo, institucion,
    │                             #   perfilFamiliar, buzon)
    ├── events/
    │   ├── EventBus.js           # bus de eventos interno (pub/sub in-process)
    │   └── NotificacionObservers.js
    ├── middlewares/
    │   ├── authMiddleware.js     # authMiddleware, requireRole, requireMismaInstitucion
    │   ├── cloudinaryMiddleware.js
    │   ├── csvMiddleware.js
    │   ├── entregaAuthMiddleware.js
    │   ├── errorMiddleware.js
    │   ├── tareaAuthMiddleware.js
    │   └── validators/           # express-validator por recurso
    ├── models/                   # 13 modelos Mongoose (ver sección 3)
    ├── notifications/
    │   ├── NotificadorFacade.js   # fachada que decide qué estrategias usar
    │   └── strategies/            # Strategy pattern: Email, FCM, WebSocket, Whatsapp
    ├── routes/                   # 1 archivo por recurso, montado en server.js bajo /api/...
    ├── schedulers/
    │   └── tareaScheduler.js     # node-cron: recordatorios/vencimientos de tareas
    ├── scripts/
    │   ├── seedAdmins.js          # crea institución + admin + superadmin de ejemplo
    │   └── subirFotosPredeterminadas.js
    ├── services/
    │   ├── mailService.js         # llamada HTTP directa a la API de Resend
    │   └── notificacionService.js
    ├── socket/
    │   └── socketHandlers.js      # eventos Socket.IO (salas por usuario, presencia)
    ├── uploads/
    │   └── fotos-predeterminadas/ # avatares por defecto (SVG/PNG servidos o subidos a Cloudinary)
    └── utils/
        ├── cloudinaryUpload.js
        └── normalizarTelefono.js  # normaliza teléfono a formato +57XXXXXXXXXX
```

### Frontend (`Edumon-Repositorio-nuevo/`)

```
Edumon-Repositorio-nuevo/
├── index.html, vite.config.js, tailwind.config.js, postcss.config.js, tsconfig.json
├── package.json / package-lock.json
├── public/                       # avatares, logos, imágenes estáticas
└── src/
    ├── main.jsx                  # entrypoint React
    ├── App.jsx
    ├── pages/
    │   └── LandingPage.jsx
    ├── routes/
    │   ├── AppRoutes.jsx          # definición de rutas (react-router-dom)
    │   ├── ProtectedRoute.jsx / RequireAuth.jsx / RequireRole.jsx / RoleGuard.jsx
    │   └── run-tests.js           # script ad-hoc de verificación (no es un framework de tests)
    ├── security/
    │   ├── permissions.js
    │   ├── roleMatrix.js          # matriz de permisos por rol (usada en tests y guards)
    │   └── guards/withPermission.js
    ├── features/                 # organizado por dominio/feature (screaming architecture)
    │   ├── auth/                 # login, registro, forgot/reset password, primer login, sesiones
    │   ├── cursos/                # detalle de curso con tabs: módulos, tareas, entregas, foros, participantes, calendario
    │   ├── tareas/, entregas/ (servicio)
    │   ├── foros/
    │   ├── calendario/
    │   ├── notificaciones/
    │   ├── instituciones/
    │   ├── docentes/, usuarios/
    │   ├── familia/               # vistas específicas para el rol padre (multi-perfil)
    │   ├── perfil/
    │   ├── buzon/
    │   └── dashboard/{admin,docente,padre}/
    ├── components/                # UI compartida: forms, layout, navigation, ui/, social/
    ├── config/navigation/         # menús de navegación por rol (adminNav, teacherNav, parentNav, superadminNav)
    ├── services/                  # authService, fcmService, sesionesService, core/apiClient + interceptors + sessionManager
    ├── store/
    │   └── useUserStore.js        # Zustand — estado global de usuario/sesión
    ├── context/                   # SearchContext, ToastContext
    ├── hooks/                     # useFCM, useUserPresence
    ├── lib/normalizers/           # normalización de payloads del backend (curso, entrega, foro, tarea, user)
    ├── utils/                     # getRoleStyle, humanizeError, normalizePhone
    └── styles/                    # design-system.css, tokens, componentes CSS, Tailwind
```

---

## 8. DEPLOYMENT

### Backend

- **Contenedorización**: [Dockerfile](Dockerfile) — imagen `node:20-alpine`, instala solo dependencias de producción (`npm ci --omit=dev`), copia `src/`, expone puerto `4000`, arranca con `node src/index.js`.
- **Orquestación local**: [docker-compose.yml](docker-compose.yml) — un único servicio `backend`, construye con el Dockerfile local, carga variables desde `.env`, mapea puerto `4000:4000`, `restart: unless-stopped`.
- No hay configuración de despliegue en la nube visible en el repo (no hay `render.yaml`, `railway.json`, `Procfile`, ni workflows de GitHub Actions) — el despliegue real (plataforma/dominio) depende de dónde se ejecute este contenedor, información que **no está en el código** y debe confirmarse aparte.

**Comandos:**
```bash
npm install          # instalar dependencias
npm run dev           # desarrollo (nodemon)
npm start             # producción (node src/index.js)
docker compose up --build   # levantar con Docker
```

**Variables de entorno** (todas leídas de `.env`, ninguna tiene un valor por defecto salvo `PORT` y `NODE_ENV` en el código):

| Variable | Requerida | Propósito |
|---|---|---|
| `MONGO_URI` | Sí | Cadena de conexión a MongoDB |
| `JWT_SECRET` | Sí | Firma de los access tokens |
| `JWT_EXPIRES_IN` | No (el código fija `15m` de forma hardcodeada para el access token; esta var existe en `.env` pero no se referencia en el código auditado) | — |
| `PORT` | No (default `4000`) | Puerto HTTP |
| `NODE_ENV` | No (default `development`) | Controla CORS abierto, cookies `secure`/`sameSite`, exposición de `stack` en errores |
| `FRONTEND_URL` | Recomendada en prod | Origen adicional permitido por CORS |
| `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | Sí (si se usan imágenes/archivos) | Cloudinary |
| `FIREBASE_PROJECT_ID` / `FIREBASE_CLIENT_EMAIL` / `FIREBASE_PRIVATE_KEY` | Sí (para push) | Firebase Admin SDK |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_EMAIL` | Sí (para Web Push) | Suscripciones push del navegador |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_WHATSAPP_NUMBER` | Sí (recuperación por WhatsApp) | Twilio |
| `RESEND_API_KEY` | Sí (recuperación por correo) | Resend |

### Frontend

- Vite estándar: `npm run dev` (servidor de desarrollo), `npm run build` (build de producción a `dist/`), `npm run preview` (previsualizar build).
- No se encontró configuración de despliegue (Vercel/Netlify config, Dockerfile) en el repo frontend al momento de esta auditoría.

---

## 9. SECURITY

- **Autenticación**: JWT (no sesiones de servidor). Access token de corta duración (15 min) + refresh token opaco de larga duración (7 días), ambos entregados como **cookies `httpOnly`** (no accesibles desde JS del navegador), con `secure`/`sameSite: strict` en producción. Ver [authController.js](src/controllers/authController.js).
- **Refresh tokens**: se almacena solo el **hash SHA-256** en BD (nunca el valor crudo), con rotación en cada `/refresh` (el token usado se invalida y se emite uno nuevo) y **límite de 5 sesiones simultáneas** por usuario (se descarta la más antigua). Índice TTL en Mongo limpia automáticamente los expirados.
- **Password hashing**: bcrypt (`bcryptjs`) con salt factor 10, hook `pre('save')` en el modelo `User`; nunca se devuelve en `toJSON()`.
- **Recuperación de contraseña**: código numérico de 6 dígitos, hasheado con SHA-256 antes de guardarse, expira en 15 minutos; respuesta **genérica** (anti-enumeración de usuarios) tanto si el correo/teléfono existe como si no.
- **Control de roles**: middleware `requireRole([...])` a nivel de ruta; `requireMismaInstitucion` para aislar datos entre instituciones. Varios comentarios en el código documentan bugs de escalación de privilegios ya corregidos (ver sección 11).
- **Autogestión vs. administración**: rutas `/me/*` usan siempre `req.user.userId` (del JWT), nunca un ID que venga del cliente, para que un usuario no pueda editar a otro.
- **Cabeceras de seguridad**: Helmet con CSP explícita (`default-src 'self'`, sin `unsafe-inline` en scripts), HSTS, `Permissions-Policy` restrictiva (cámara/micrófono/geolocalización desactivados), `Cache-Control: no-store` global, `X-Frame-Options` vía `frameAncestors: 'none'`.
- **Sanitización NoSQL**: middleware propio en `server.js` que elimina claves que empiecen por `$` o contengan `.` en `body`/`params`, y sanea caracteres especiales en `query` — mitiga NoSQL injection tipo operator injection.
- **Rate limiting**: global (100 req/15min sobre `/api/`) y estricto en `/api/auth/login` y `/api/auth/register` (10 req/15min), con `Retry-After` estándar.
- **CORS**: en desarrollo, abierto (`origin: true`); en producción, restringido a una whitelist explícita + `FRONTEND_URL`, con `credentials: true` para permitir cookies.
- **Almacenamiento de tokens en cliente**: cookies `httpOnly` gestionadas por el navegador (no `localStorage`), por lo que no son accesibles vía XSS. El frontend usa `jwt-decode` únicamente para leer campos no sensibles del JWT (rol, expiración aproximada), no para validarlo.

---

## 10. TESTING

- **Backend**: no existe carpeta de tests ni framework de testing configurado (no hay Jest, Mocha, Vitest, Supertest, etc. en `package.json`). No hay script `test` real (no está definido en `package.json`).
- **Frontend**: existe un script `"test": "node ./src/routes/run-tests.js"`, pero es un runner artesanal sin dependencias (usa `assert` nativo de Node) que solo verifica la matriz de permisos (`src/security/roleMatrix.js`) para dos roles (`admin`, `padre`). No es una suite de pruebas real ni cubre la mayoría del código.
- **CI/CD**: no se encontró ningún workflow de GitHub Actions (ni carpeta `.github/workflows`) en ninguno de los dos repositorios. El único archivo bajo `.github/` en el frontend es `copilot-instructions.md` (instrucciones para asistentes de IA, no un pipeline).
- **Cómo ejecutar lo que existe hoy**:
  ```bash
  # Backend: no hay comando de test
  # Frontend:
  npm test
  ```

**Conclusión honesta para el documento legal**: actualmente el proyecto no tiene cobertura de pruebas automatizadas ni integración continua; la calidad se sostiene por revisión manual del código (visible en comentarios inline documentando fixes de seguridad aplicados).

---

## 11. KNOWN ISSUES / TROUBLESHOOTING

Extraído de comentarios explícitos dejados en el propio código fuente (bugs reales ya corregidos, documentados por quien los arregló) y de hallazgos de esta sesión:

1. **Login con teléfono confundido con correo** (corregido en `seedAdmins.js` en esta sesión): el script de seed no imprimía el campo `telefono` en consola, solo `correo`, lo que llevaba a intentar iniciar sesión con el correo (que no es la credencial de login). Ver [src/scripts/seedAdmins.js](src/scripts/seedAdmins.js).
2. **Falta de endpoint de autogestión de perfil** (corregido en esta sesión): no existía ninguna ruta para que un usuario editara su propio nombre/apellido/correo/teléfono; solo existía para foto de perfil y token FCM. Se agregó `PUT /api/users/me/profile`.
3. **Escalación de rol vía `PUT /api/users/:id`** (ya corregido, documentado en [userRoutes.js](src/routes/userRoutes.js#L62-L63)): `updateUserValidator` permite cambiar `rol`; sin `requireRole` cualquier usuario autenticado podía autoelevarse a administrador.
4. **Creación/borrado de módulos por cualquier rol** (ya corregido, [moduloRoutes.js](src/routes/moduloRoutes.js#L22-L24)): antes solo llevaban `authMiddleware`, permitiendo que un padre creara o borrara módulos de cualquier curso.
5. **Creación de tareas por cualquier rol** (ya corregido, [tareaRoutes.js](src/routes/tareaRoutes.js#L62-L64)): `createTarea` no validaba rol; cualquier padre autenticado podía crear tareas.
6. **Fuga de entregas/calificaciones por tarea o por padre** (ya corregido, [entregaRoutes.js](src/routes/entregaRoutes.js#L49-L67)): `/tarea/:tareaId` y `/padre/:padreId` no verificaban propiedad ni rol; cualquier padre podía leer entregas/calificaciones ajenas adivinando el ID.
7. **Notificaciones "del sistema" falsificables** (ya corregido, [notificacionRoutes.js](src/routes/notificacionRoutes.js#L49-L51)): `POST /api/notificaciones` permitía fijar cualquier `usuarioId` destino; sin `requireRole`, cualquier usuario podía crear notificaciones dirigidas a otros.
8. **`POST /api/eventos` sin `requireRole` a nivel de ruta**: a diferencia de cursos/foros/tareas, la creación de eventos solo exige `authMiddleware` (cualquier rol autenticado puede crear eventos); la restricción a `administrador`/`docente` solo se aplica explícitamente en `deleteEvento`. Debe confirmarse si esto es intencional o pendiente de endurecer.
9. **`reset.js` en la raíz del backend**: script standalone que ejecuta `dropDatabase()` sobre la base de datos apuntada por `MONGO_URI` sin ninguna confirmación. Alto riesgo si se ejecuta apuntando a producción por error — se recomienda no dejarlo accesible en el mismo repo desplegado, o exigir una variable de confirmación explícita.
10. **`JWT_EXPIRES_IN` en `.env` sin uso aparente**: la variable existe en `.env` pero el TTL del access token (`15m`) está hardcodeado en `authController.js`; revisar si se pretendía hacerlo configurable.
11. **Carpeta `Edumon-Repositorio-nuevo` con nombre engañoso**: contiene artefactos `.next` pero el proyecto real usa Vite, no Next.js — puede confundir a quien documenta o despliega el frontend.
12. **Falta de tests/CI**: ver sección 10 — no hay red de seguridad automatizada ante regresiones.

---

*Documento generado por auditoría directa de código, sin acceso a documentación previa del proyecto. Cualquier dato no verificable en el código (p. ej., dominio de producción, plan de hosting contratado) se marcó explícitamente como no determinado.*
