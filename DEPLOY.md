# Despliegue del backend: Render + MongoDB Atlas (demo pública)

Arquitectura de la demo:

```
navegador ──HTTPS──▶ Vercel (web estática)
                       └─ rewrite /api, /uploads, /static ──▶ Render (este backend) ──▶ MongoDB Atlas (M0)
```

El navegador solo ve el dominio de Vercel: las cookies de sesión son de primera parte (`HttpOnly; Secure; SameSite=Lax`). La web se despliega con `Frontend/DEPLOY.md`.

Rama a desplegar: **`feature/modulo-ia`**.

## 1. MongoDB Atlas (clúster gratuito)

1. Crear un clúster **M0 (Free)**. Región: AWS `us-east-1` (Virginia), la misma región que el servicio de Render.
2. **Database Access**: crear un usuario solo para la demo (por ejemplo `edumon_demo`) con contraseña larga y rol *Read and write to any database*.
3. **Network Access**: el plan gratuito de Render no tiene IP fija, así que hay que permitir `0.0.0.0/0`. La protección es la contraseña del usuario: que sea larga y exclusiva de esta demo.
4. **Connect → Drivers**: copiar la cadena y agregarle el nombre de la base:
   `mongodb+srv://edumon_demo:<CONTRASEÑA>@<cluster>.mongodb.net/edumon_demo?retryWrites=true&w=majority&appName=edumon`
   Si la contraseña tiene caracteres especiales (`@ : / ? # %`), hay que codificarlos en URL.

## 2. Web Service en Render

New → **Web Service** → conectar el repo `Backend-Edumon` de GitHub.

| Campo | Valor |
|---|---|
| Branch | `feature/modulo-ia` |
| Root Directory | *(vacío: el `package.json` está en la raíz del repo)* |
| Runtime | Node |
| Build Command | `npm ci` |
| Start Command | `npm start` |
| Node | `22.15.0` (fijado en `package.json` → `engines`; Render lo toma de ahí) |
| Instance Type | Free |
| Region | Virginia (US East), igual que Atlas |
| Health Check Path | `/health` |
| Auto-Deploy | On Commit (o manual si prefieres controlar cuándo) |

El servidor escucha en `process.env.PORT` (lo pone Render; **no** definirlo) y en `0.0.0.0`.

## 3. Variables de entorno de producción (Render → Environment)

Ningún valor secreto va en el repo: se pegan solo en el panel de Render.

**Obligatorias para arrancar bien**

| Variable | Valor sugerido | Descripción |
|---|---|---|
| `NODE_ENV` | `production` | Cookies `Secure`, CORS restringido, sin trazas en los errores |
| `MONGO_URI` | `mongodb+srv://…/edumon_demo?…` | Cadena de Atlas (paso 1) |
| `JWT_SECRET` | *(64 bytes aleatorios)* | Firma de los tokens. Generar: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` |
| `FRONTEND_URL` | `https://<tu-proyecto>.vercel.app` | Orígenes permitidos por CORS, separados por coma. Va la URL de Vercel (y la de preview si se usa). Si queda vacía, CORS se abre a cualquier origen |

**Red y sesión**

| Variable | Valor sugerido | Descripción |
|---|---|---|
| `TRUST_PROXY` | `1` | Saltos de proxy de confianza para `req.ip`/`req.secure`. Ver sección 6 |
| `COOKIE_SAMESITE` | *(no definir: `lax`)* | Solo cambiar a `none` si la web llamara al backend desde otro sitio (sin el rewrite de Vercel) |
| `HOST` | *(no definir: `0.0.0.0`)* | Interfaz de escucha |

**IA**

| Variable | Valor sugerido | Descripción |
|---|---|---|
| `GROQ_API_KEY` | *(tu llave)* | Proveedor principal. Sin ninguna llave, Edumon corre en modo simulado (reglas + fichas) |
| `OPENAI_API_KEY` | *(vacío salvo que la llave sea válida)* | Respaldo. Con la llave actual (401) cada caída de Groq suma una llamada fallida; mejor vacía |
| `LLM_PROVIDER_ORDER` | `groq,openai` | Orden de los proveedores |
| `GROQ_MODEL` | `openai/gpt-oss-120b` | Modelo de Groq |
| `OPENAI_MODEL` | `gpt-4.1-mini` | Modelo de OpenAI |
| `LLM_TIMEOUT_MS` | `20000` | Tiempo máximo por proveedor (la web espera hasta 60 s y Vercel hasta 120 s) |
| `LLM_COOLDOWN_SECONDS` | `15` | Pausa tras un 429; 15 s para que Groq gratuito vuelva antes |
| `LLM_CACHE_TTL_SECONDS` | `600` | Caché de clasificaciones |
| `IA_RATE_LIMIT_MAX` | `20` | Solicitudes de IA por usuario en la ventana |
| `IA_RATE_LIMIT_WINDOW_SECONDS` | `60` | Ventana del límite de IA |
| `IA_NOTAS_VOZ` | `true` | Activa `POST …/audio` (Whisper por Groq) |
| `IA_AUDIO_MAX_MB` | `10` | Tamaño máximo de la nota de voz |
| `IA_AUDIO_MAX_SEGUNDOS` | `120` | Duración máxima |
| `GROQ_MODELO_TRANSCRIPCION` | `whisper-large-v3-turbo` | Modelo de transcripción |
| `IA_PLAZO_ATENCION_HORAS_GRAVE` | `24` | Plazos para las métricas de impacto |
| `IA_PLAZO_ATENCION_HORAS_MODERADO` | `72` | |

**Servicios apagados en la demo** (dejar vacías o sin definir)

| Variable | Valor | Efecto |
|---|---|---|
| `SMTP_HOST` | *(vacío)* | No se envían correos (recuperar contraseña por correo no funciona) |
| `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` | *(vacías)* | Sin push; el arranque solo registra un aviso |
| `UPLOAD_DIR` | *(vacío: `./uploads`)* | Disco efímero en Render gratuito (ver sección 7) |
| `BOOTSTRAP_INSTITUCION_*`, `BOOTSTRAP_ADMIN_*` | *(vacías)* | No crea cuentas iniciales; los usuarios salen del seed de demo |

## 4. Cargar los datos de demo en Atlas (desde tu computador)

El seed borra y vuelve a crear **solo** la institución de demo (NIT `DEMO-EDUMON-IA`) y los usuarios `@demo.edumon.example`; nunca hace `dropDatabase`. Se niega a correr con `NODE_ENV=production`, así que se ejecuta desde tu computador y no desde Render.

En Git Bash, desde `Backend/` (rama `feature/modulo-ia`, `npm ci` hecho):

```bash
export MONGO_URI='mongodb+srv://edumon_demo:<CONTRASEÑA>@<cluster>.mongodb.net/edumon_demo?retryWrites=true&w=majority'
export SEED_DEMO_PASSWORD='<contraseña pública de la demo, distinta de la de GitHub>'
NODE_ENV=development node src/scripts/seedDemo.js
unset MONGO_URI SEED_DEMO_PASSWORD
```

- Las variables de la línea de comandos tienen prioridad sobre tu `.env` local, que no se modifica.
- Debe imprimir un JSON con 3 cursos y 5 alertas.
- Para dejar la demo como al inicio (entre jurados, por ejemplo), repetir el mismo comando: no hace falta reiniciar Render.
- Sin `SEED_DEMO_PASSWORD`, la contraseña es la de `DEMO-BACKEND.md`, que está publicada en GitHub. **En el despliegue público, siempre definirla.**

## 5. Verificar el despliegue

```bash
API=https://<tu-servicio>.onrender.com
WEB=https://<tu-proyecto>.vercel.app

curl -s $API/health                     # {"ok":true,...}  (el primer llamado puede tardar ~1 min si estaba dormido)
curl -s $API/                           # {"message":"API funcionando correctamente","entorno":"production",...}

# login a través de Vercel: la cookie debe salir Secure y SameSite=Lax
printf '%s' '{"telefono":"+573009990001","contraseña":"<SEED_DEMO_PASSWORD>"}' > login.json
curl -s -i -c jar.txt -X POST $WEB/api/auth/login -H 'Content-Type: application/json' --data-binary @login.json | grep -iE "^HTTP|set-cookie"
# HTTP/2 200 · set-cookie: access_token=…; HttpOnly; Secure; SameSite=Lax

curl -s -b jar.txt $WEB/api/ia/health   # modo "llm" (o "simulado" sin llaves) y estado de cada proveedor
rm -f login.json jar.txt
```

Con `-c`/`-b`, curl guarda y reenvía la cookie aunque sea `Secure`, porque la URL es HTTPS.

## 6. IP real del cliente y límites por IP

Cadena real: `cliente → Vercel → balanceador de Render → app`. Vercel envía la IP del visitante en `x-forwarded-for`/`x-real-ip`, y el balanceador de Render agrega la IP de Vercel. Con `trust proxy = 1`, Express toma como `req.ip` la última IP antes de Render, es decir **la de Vercel**: todos los usuarios que entran por la web se verían como uno solo.

Subir a `TRUST_PROXY=2` sí daría la IP del visitante, pero **no se puede garantizar** desde la app: cualquiera puede llamar directo a `https://<servicio>.onrender.com` con un `X-Forwarded-For` inventado y cambiar de "IP" en cada petición. Por eso:

- **Límite global (500 solicitudes / 15 min):** se cuenta **por usuario autenticado** (el token se verifica con `JWT_SECRET`; un token inválido o vencido cuenta como anónimo) y **por IP solo para peticiones sin sesión**. Así los usuarios con sesión no comparten cupo aunque lleguen todos desde la IP de Vercel.
- **Límite de IA (`IA_RATE_LIMIT_MAX`)**: ya era por usuario.
- **Login y recuperación:** ya eran por teléfono o correo; la IP solo es el respaldo cuando falta ese dato.
- **Peticiones anónimas** (login, chequeo de sesión sin cookie): comparten el cupo de la IP que vea la app. Para la feria (decenas de usuarios) 500 cada 15 min alcanza. Si hiciera falta, `TRUST_PROXY=2` las separa por visitante, con el riesgo de falsificación descrito arriba.
- Las cookies `Secure` no dependen de `req.secure` (Express las marca igual), pero `trust proxy` hace que la app vea `https` detrás de Render.

## 7. Limitaciones conocidas del despliegue gratuito

- **Sin tiempo real (socket.io):** el rewrite de Vercel no pasa websockets. La web se compila con `VITE_TIEMPO_REAL=false` y no intenta conectar: no hay errores en pantalla; el contador y la lista de notificaciones se actualizan al recargar o navegar, no en vivo. El backend sigue sirviendo socket.io para clientes que se conecten directo (por ejemplo, la app móvil).
- **Arranque en frío:** Render gratuito se duerme tras ~15 min sin tráfico y tarda alrededor de un minuto en despertar. Antes de presentar, abrir `$API/health` y esperar la respuesta. Un monitor externo que haga ping a `/health` cada 10 min lo mantiene despierto.
- **Disco efímero:** los archivos subidos (adjuntos, fotos de perfil nuevas) se pierden en cada reinicio o despliegue. Los avatares predeterminados vienen en la imagen y no se pierden.
- **Cuota de Groq gratuita:** unos 2 mensajes por minuto en todo el sistema; pasado eso Edumon responde con fichas curadas (marcado en la web).
- **Correo apagado:** "olvidé mi contraseña" no envía el código.
