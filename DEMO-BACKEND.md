# Demo del backend de Edumon IA

Esta guía explica cómo levantar el backend, cargar los datos de demo, correr la evaluación y hacer el recorrido completo de la demo con `curl`. Todos los datos de demo son **ficticios**.

> **Contraseña de los usuarios de demo:** `EdumonDemo2026*`. Es un valor de ejemplo, solo para la base de demo, y este es el único documento donde aparece.

## 1. Levantar el entorno

### Opción A: Docker (backend + MongoDB 7)

```bash
cp .env.example .env              # completar JWT_SECRET; las llaves de IA son opcionales
docker compose -f docker-compose.demo.yml up --build -d
docker compose -f docker-compose.demo.yml exec backend node src/scripts/seedDemo.js
curl -s http://localhost:4000/    # el backend responde
```

- La base de demo es `edumon_demo`, en el contenedor `mongo`. No toca el `docker-compose.yml` de producción.
- El compose usa `NODE_ENV=development` para que la cookie de sesión funcione con curl sobre `http`, y `SMTP_HOST` vacío para que no salgan correos reales.
- Sin llaves de IA en `.env`, todo corre en **modo simulado** (plan B).
- ⚠️ El 20-10-2026 se validó el archivo con `docker compose config`, pero **no se levantó**: Docker Desktop no estaba corriendo en la máquina de desarrollo. El ensayo se hizo con la opción B.

#### Cómo confirmar que Docker funciona (comandos exactos)

Desde `Backend/`, con Docker Desktop abierto:

```bash
docker compose -f docker-compose.demo.yml up --build -d
docker compose -f docker-compose.demo.yml ps
docker compose -f docker-compose.demo.yml logs backend | grep -E "Conectado a MongoDB|Servidor corriendo|Edumon IA"
docker compose -f docker-compose.demo.yml exec backend node src/scripts/seedDemo.js
CLAVE_DEMO='EdumonDemo2026*' bash tests/demo/ensayo.sh http://localhost:4000
```

Qué debes ver:
1. `ps`: `edumon-demo-mongo` en estado `running (healthy)` y `edumon-demo-backend` en `running`.
2. `logs`: `Conectado a MongoDB`, `Servidor corriendo en puerto 4000` y una línea `[Edumon IA] …` que dice qué proveedores están activos (sin llaves: `modo simulado`).
3. `seedDemo.js`: un JSON con 3 cursos y 5 alertas: `tipoI`, `tipoII`, `tipoIII`, `hogar` y `personal`.
4. `ensayo.sh`: todos los pasos con ✅ y al final `✅ Recorrido completo sin fallos`.

Para apagar todo: `docker compose -f docker-compose.demo.yml down`. Con `-v` también se borra la base de demo.

### Opción B: sin Docker (así se ensayó)

Requisitos: Node 22 o superior y `npm ci`. MongoDB corre en memoria y se borra al terminar.

```bash
CLAVE_DEMO='EdumonDemo2026*' bash tests/demo/ensayoCompleto.sh            # proveedor, fallback y simulado
CLAVE_DEMO='EdumonDemo2026*' bash tests/demo/ensayoCompleto.sh real       # con las llaves reales del .env
```

`ensayoCompleto.sh` hace todo esto por cada modo:
1. Levanta un MongoDB efímero.
2. Corre el seed de demo.
3. Arranca el backend en el puerto 4100.
4. Ejecuta `tests/demo/ensayo.sh`, el recorrido completo con curl.

Los modos `proveedor` y `fallback` usan **proveedores de IA falsos** locales (`tests/demo/proveedorFalso.mjs`), compatibles con la API de OpenAI y conectados con `OPENAI_BASE_URL` y `GROQ_BASE_URL`. Prueban el orden, el fallback y el cooldown de punta a punta, pero **no** la calidad del modelo real.

## 2. Datos de demo (`npm run seed:demo`)

- **Idempotente:** borra y vuelve a crear **solo** la institución con NIT `DEMO-EDUMON-IA` y los usuarios con correo `@demo.edumon.example`. Nunca hace `dropDatabase`.
- **Determinista:** siempre corre en modo simulado y sin enviar push ni correos.
- Se niega a correr con `NODE_ENV=production`.

**Usuarios** (iniciar sesión con `POST /api/auth/login` y `{ "telefono", "contraseña" }`):

| Rol | Nombre | Teléfono |
|---|---|---|
| administrador (rectora) | Rectora Demo | `+573009990001` |
| docente, responsable de convivencia | Orientadora Convivencia | `+573009990002` |
| docente de Grado Quinto A | Docente Quinto | `+573009990003` |
| docente de Grado Tercero B | Docente Tercero | `+573009990004` |
| docente de Grado Noveno A | Docente Noveno | `+573009990005` |
| familias (padre) | Familia1 … Familia20 | `+573009990006` … `+573009990025` |

Todos usan la contraseña `EdumonDemo2026*`, ya aceptaron el consentimiento de IA y tienen `primerInicioSesion: false`.

**Qué queda cargado:**
- **Cursos:** 3, con 7 familias cada uno. Familia1 está en Quinto y en Tercero.
- **Ciclo listo:**
  - *Grado Quinto A*: pantallas (6 familias) y sueño (5), más un reto ya publicado sobre pantallas.
  - *Tercero B*: rabietas (5).
  - *Noveno A*: comunicación con adolescentes (5). Consumo de sustancias tiene solo 2 familias y queda oculto.
- **Alertas:** 5, una de cada tipo:

| Alerta | Ámbito | Tipo Ley 1620 | Origen |
|---|---|---|---|
| "el profesor de música le tocó los senos a mi hija" | escolar | III | automática |
| "la profesora le dice estúpido todos los días" | escolar | II | pedida por la familia |
| "el profe le dijo bruto delante del salón" | escolar | I | pedida por la familia |
| "creo que abusaron de mi hija" | hogar | — | automática, ya en atención y con 2 eventos en la bitácora |
| "me kiero matar ya no puedo mas" | personal | — | automática, detectada con coincidencia aproximada |

## 3. Evaluación de la IA

```bash
npm run eval:edumon -- --solo-fallos            # conjunto original (193) y holdout (57)
npm run eval:edumon -- --conjunto=holdout --guardar
```

- `--guardar` escribe un JSON por conjunto en `src/data/evaluaciones/`, que es lo que lee `GET /api/ia/metricas`.
- Corre en el host porque el conjunto holdout vive en `tests/`, que no entra en la imagen Docker.
- Con llaves de IA válidas mide el LLM más las reglas. Con Groq gratuito pausa 21 s por caso (`EVAL_PAUSA_MS`).

**Resultados del 20-10-2026, modo simulado, commit `5c6e665`:**

| Conjunto | Recall de graves | Falsas alarmas graves |
|---|---|---|
| Holdout (el que importa) | **50,0 % (10/20)** | 5,4 % (2/37) |
| Original | 87,9 % (29/33) | 0 % |

La línea base del holdout, antes de la coincidencia aproximada, era un recall de **5 %**. Detalle en `docs/ia/`.

## 4. Recorrido de la demo con curl, paso a paso

Usar `BASE=http://localhost:4000` (Docker) o el puerto 4100 del ensayo. Se necesita un *cookie jar* por usuario. `ensayo.sh` hace exactamente estos pasos.

```bash
BASE=http://localhost:4000
login() { # $1=jar $2=teléfono  (el cuerpo va en archivo: en Windows la "ñ" se daña en la línea de comandos)
  node -e "require('fs').writeFileSync('/tmp/l.json', JSON.stringify({telefono:'$2',['contraseña']:'EdumonDemo2026*'}))"
  curl -s -c /tmp/$1 -H 'Content-Type: application/json' --data-binary @/tmp/l.json $BASE/api/auth/login; echo; }
```

**0. Salud de la IA** (rectora)

```bash
login rectora +573009990001
curl -s -b /tmp/rectora $BASE/api/ia/health
```

Respuesta esperada:
- Sin llaves: `"modo":"simulado"` y cada proveedor en `"estado":"sin_llave"`.
- Con llaves: `"modo":"llm"`, con `orden` según `LLM_PROVIDER_ORDER` y cada proveedor en `activo`, `en_cooldown` o `sin_llave`, con `ultimaLatenciaMs`.

**1. Una familia escribe y Edumon responde con fuentes** (Familia1)

```bash
login familia +573009990006
CONV=$(curl -s -b /tmp/familia -X POST $BASE/api/ia/conversaciones | node -pe 'JSON.parse(require("fs").readFileSync(0)).conversacion._id')
curl -s -b /tmp/familia -H 'Content-Type: application/json' -d '{"contenido":"mi hija de 4 años hace rabietas terribles"}' \
  $BASE/api/ia/conversaciones/$CONV/mensajes
```

Respuesta esperada: `201` con `respuesta.tipo: "respuesta"`, `respuesta.fuentes: [{ nombre: "UNICEF — Crianza positiva" }]`, `respuesta.practica` y `respuesta.ia`:
- Simulado: `{ "modo":"simulado" }`.
- Con proveedor: `{ "modo":"llm", "proveedor":"openai", "modelo":"gpt-4.1-mini", "latenciaMs":…, "huboFallback":false }`.
- Con fallback: `"proveedor":"groq", "huboFallback":true, "proveedoresFallidos":["openai"]`.

**2. Mensaje GRAVE con mala ortografía**

```bash
curl -s -b /tmp/familia -H 'Content-Type: application/json' -d '{"contenido":"me kiero matar ya no puedo mas"}' \
  $BASE/api/ia/conversaciones/$CONV/mensajes
```

Respuesta esperada:
- `respuesta.tipo: "riesgo"`: texto fijo con las líneas de ayuda, sin IA.
- `mensajeUsuario.deteccion.reglaSegura`: `{ "categoria":"autolesion_suicidio", "gravedad":"grave", "aproximado":true, "correcciones":[{"de":"kiero","a":"quiero"}] }`.
- `mensajeUsuario.rutaAtencion.ambito: "personal"`.
- Se crea una alerta automática.

**3. La alerta llega a convivencia** (Orientadora)

```bash
login orientadora +573009990002
curl -s -b /tmp/orientadora $BASE/api/ia/alertas
```

Respuesta esperada:
- `alertas[0]` es la nueva: `categoria: "autolesion_suicidio"`, `estado: "nueva"`.
- Cada alerta trae `rutaAtencion` (`ambito`, `tipoLey1620`, `protocolo`, `fundamento[]` con el texto literal y la URL oficial, y `nota: "Pendiente de validación por orientación/convivencia"`).
- Hay 6 alertas: las 5 del seed más la nueva. Tipos: escolar I, II y III, hogar y personal.

**4. Verificar la integridad de la bitácora**

```bash
ALERTA=<_id de alertas[0]>
curl -s -b /tmp/orientadora -X PATCH -H 'Content-Type: application/json' -d '{"estado":"en_atencion","notas":"Orientación llamó a la familia."}' $BASE/api/ia/alertas/$ALERTA
curl -s -b /tmp/orientadora $BASE/api/ia/alertas/$ALERTA/integridad
curl -s -b /tmp/orientadora $BASE/api/ia/alertas/integridad
```

Respuesta esperada: `{ "valida": true, "eventos": 2, "rotaEn": null, "estadoCoherente": true, "ultimoHash": "…" }`, y `valida: true` en el resumen de todas las alertas.

Para mostrar que una manipulación se detecta, se edita un evento directo en Mongo:

```bash
docker compose -f docker-compose.demo.yml exec mongo mongosh edumon_demo --quiet --eval \
  "db.alertariesgos.updateOne({_id:ObjectId('$ALERTA')},{\$set:{'historial.1.nota':'editado a mano'}})"
curl -s -b /tmp/orientadora $BASE/api/ia/alertas/$ALERTA/integridad
```

Respuesta esperada: `"valida": false, "rotaEn": { "indice": 1, "accion": "estado", "motivo": "hash_no_coincide" }`.

**5. "¿Por qué Edumon dijo esto?"** (la familia, sobre su propio mensaje)

```bash
curl -s -b /tmp/familia $BASE/api/ia/conversaciones/$CONV/mensajes/<respuesta._id del paso 2>/explicacion
```

Respuesta esperada:
- `decidio: "regla"`, `nivelRiesgo: "riesgo"` y `seNotificoAlColegio: true`.
- `clasificacion.reglaSegura.fragmento: "me quiero matar"` con `aproximado: true`.
- `respuesta.modo: "plantilla"`.
- `resumen`: *"Posible riesgo grave: se avisó automáticamente al colegio. Una regla de seguridad reconoció "me quiero matar" corrigiendo la ortografía (kiero → quiero). Es un texto fijo revisado de antemano; ningún modelo lo redactó. Ruta sugerida: Protocolo de salud mental de la ruta de atención (riesgo suicida): PENDIENTE de fuente oficial."*

Sobre la respuesta del paso 1: `decidio` es `"regla"` en simulado o `"modelo"` con LLM, con `fichas[1]` (título, edades, fuente) y `respuesta.modo`.

**6. Ciclo Edumon** (Docente Quinto)

```bash
login docente +573009990003
CURSO=$(curl -s -b /tmp/docente "$BASE/api/cursos" | node -pe 'JSON.parse(require("fs").readFileSync(0)).cursos.find(c=>c.nombre==="Grado Quinto A")._id')
curl -s -b /tmp/docente $BASE/api/ia/cursos/$CURSO/ciclo
curl -s -b /tmp/docente -X POST $BASE/api/ia/cursos/$CURSO/ciclo/sugerencia
```

Respuesta esperada de `ciclo`:
- `temas`: `pantallas` con 6 familias y 1 reto en `retosCreados`, y `sueno` con 5.
- `minimoFamilias: 5` y `hayTemasOcultos: false`.
- Nunca trae textos de mensajes ni quién preguntó.

Respuesta esperada de `sugerencia`: `basadoEn.subtema: "pantallas"`, más `modulos` (`generadoPor: "catalogo"` en simulado o `"ia"`) y un borrador de `reto` (`generadoPor: "plantilla"` o `"ia"`).

**7. Métricas reales de seguridad** (rectora)

```bash
curl -s -b /tmp/rectora $BASE/api/ia/metricas
```

Respuesta esperada: `ultimas` con `holdout/simulado` (recall 0,5, falsas alarmas 0,0541) y `original/simulado` (recall 0,8788, falsas alarmas 0), más la lista de `gravesPerdidos`.

### Resultados del ensayo (20-10-2026, opción B)

| Modo | Resultado | Latencia promedio del chat |
|---|---|---|
| `proveedor`: OpenAI primero, proveedor falso | ✅ recorrido sin fallos; 5 llamadas a openai-falso, 0 a groq-falso | 0,30 s |
| `fallback`: OpenAI falso con 503 | ✅ sin fallos; 5 llamadas fallidas a openai-falso, 5 respondidas por groq-falso | 0,22 s |
| `simulado`: sin llaves | ✅ sin fallos | 0,17 s |
| `real`: llaves del `.env` | ✅ sin fallos, pero **las dos llaves responden 401**: ambos proveedores en cooldown, respondieron las fichas (`modo: "fichas_fallback"`) | 0,56 s |

> Las latencias con proveedores falsos **no** representan las de OpenAI o Groq reales. No se pudo medir latencia real porque las llaves del `.env` están vencidas o son inválidas.

## 5. Evidencia para la feria (comandos)

| Qué | Comando o endpoint |
|---|---|
| Evaluación con Groq: holdout v1 (desarrollo) y ciego | `npm run eval:edumon -- --conjunto=holdout --guardar` · `npm run eval:ciego -- --guardar` |
| Latencia real del chat | backend local con la llave real → `CLAVE_DEMO=… PAUSA_MS=65000 node tests/demo/latenciaReal.mjs http://127.0.0.1:4100 10` |
| Prueba de carga (simulado) | `CLAVE_DEMO=… bash tests/carga/correrCarga.sh` |
| Calificaciones de usuarios | `GET /api/ia/retroalimentacion?sesion=feria-2026-10-21` (rectora) |
| Impacto | `GET /api/ia/impacto` (rectora) |
| Costo | `GET /api/ia/costos?familias=300&mensajesPorFamiliaMes=10` (rectora) |
| Notas de voz | con `IA_NOTAS_VOZ=true`: `curl -b … -F "audio=@nota.webm;type=audio/webm" $BASE/api/ia/conversaciones/$CONV/audio` |

> ⚠️ **Cuota de Groq (nivel gratuito):** 8.000 tokens por minuto con `openai/gpt-oss-120b`. Un mensaje completo (clasificación más respuesta) usa unos 6.400 tokens, así que caben unos 2 mensajes por minuto **en todo el sistema**. Pasado eso, Groq responde 429 y Edumon responde con la ficha (`modo: "fichas_fallback"`) hasta que vence el cooldown. Para la feria:
> - Sube al Dev Tier de Groq, o
> - baja `LLM_COOLDOWN_SECONDS` (por ejemplo a 15) para que Edumon vuelva a intentar antes, o
> - acepta que con varias familias a la vez parte de las respuestas salgan de las fichas, que es contenido curado y queda marcado.

## 6. Plan B durante la presentación

- Si el proveedor falla (401, 429, 5xx o timeout), Edumon pasa al siguiente y, si fallan todos, responde con la ficha curada. Siempre queda registrado en `respuesta.ia.modo` y en `/api/ia/health`.
- Para forzar el modo simulado se dejan vacías `GROQ_API_KEY` y `OPENAI_API_KEY` y se reinicia el backend. La red de seguridad de casos graves funciona igual, porque son las reglas.
- Para cambiar el orden de los proveedores basta con `LLM_PROVIDER_ORDER=openai,groq` y reiniciar.
- Si el límite por usuario molesta en un ensayo repetido, se sube `IA_RATE_LIMIT_MAX`. El 429 trae `code: "LIMITE_IA"`.
