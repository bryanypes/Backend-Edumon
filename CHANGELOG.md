# Changelog

## [edumon.ia] — 2026-10-20

Rama `edumon.ia`. Parte de `master` más el merge de `origin/feature/modulo-ia` (módulo de IA Edumon, commit `9b16f1f`). No se hizo merge a `master` ni despliegue.

### Agregado

- **Capa única de proveedores de IA** (`src/services/ia/proveedorIA.js`). Reemplaza `groqClient.js`.
  - Interfaz `classify`, `respond` y `stream`. `stream` por ahora entrega la respuesta completa: no hay SSE.
  - El orden se configura con `LLM_PROVIDER_ORDER` (por defecto `groq,openai`).
  - Fallback automático ante 429, 401/403, 5xx, timeout (`LLM_TIMEOUT_MS`) o error de red.
  - Cooldown en memoria (`LLM_COOLDOWN_SECONDS`) después de un 429 o un 401.
  - Un proveedor sin llave se omite sin error. Al arrancar se registra en el log qué proveedores quedan activos, sin llaves.
  - Las llaves se depuran de todos los mensajes de error.
  - `GROQ_BASE_URL` y `OPENAI_BASE_URL` opcionales, para proxies o servidores compatibles.
- **Caché de clasificaciones del LLM** por hash del mensaje normalizado más el contexto reciente, con TTL `LLM_CACHE_TTL_SECONDS`.
- **Proveedor, modelo, latencia y fallback guardados en cada respuesta.** Las respuestas de Edumon traen `respuesta.ia.modo`: `llm`, `fichas_fallback`, `simulado` o `plantilla`. La detección de cada mensaje lleva los mismos datos.
- **`GET /api/ia/health`** (administrador): estado de cada proveedor (activo, en cooldown, sin llave) y última latencia.
- **Límite por usuario** en los endpoints de `/api/ia` que llaman a la IA (`IA_RATE_LIMIT_MAX` solicitudes cada `IA_RATE_LIMIT_WINDOW_SECONDS` segundos). Al pasarse responde 429 con `code: LIMITE_IA` y un mensaje claro.
- **Coincidencia aproximada solo para reglas de riesgo GRAVE** (`ortografiaGrave.js`): clave fonética del español, distancia de edición 1 y abreviaturas de chat. Una palabra bien escrita nunca se corrige. La detección guarda `aproximado` y `correcciones`.
- **Conjunto de evaluación separado (holdout)** de 57 casos (`tests/ia/holdout`). Quedó congelado antes de tocar las reglas.
  - La evaluación reporta recall de graves y falsas alarmas sin suavizar.
  - `npm run eval:edumon -- --guardar` guarda cada corrida como JSON en `src/data/evaluaciones/`.
- **`GET /api/ia/metricas`** (administrador): última corrida por conjunto y modo, historial, precisión por tema, graves perdidos y falsas alarmas.
- **Bitácora inmutable de alertas.**
  - Cada evento del historial se encadena con SHA-256 al anterior; el primero, a un génesis con los datos inmutables de la alerta.
  - `GET /api/ia/alertas/:id/integridad` y `GET /api/ia/alertas/integridad` dicen si la cadena es válida y, si no, en qué evento se rompe.
  - `PATCH` de alertas con control optimista: responde 409 `ALERTA_MODIFICADA` si otro usuario la cambió al mismo tiempo.
  - Backfill idempotente con `npm run bitacora:encadenar`. Nunca recalcula una cadena ya encadenada.
- **Explicabilidad**: `GET /api/ia/conversaciones/:id/mensajes/:mensajeId/explicacion` (familia) y `GET /api/ia/alertas/:id/explicacion` (colegio). Incluyen fichas, quién decidió (regla, modelo o ambos), nivel y categoría de riesgo, ruta, fuentes, proveedor y modelo.
- **Clasificación de ruta de atención** en alertas y mensajes con riesgo: `ambito` (escolar, hogar o personal), `tipoLey1620` (I, II, III, solo en el ámbito escolar) y `protocolo`.
  - Cita literal del Decreto 1965 de 2013 (arts. 40, 41 y 44) y de la Ley 1098 de 2006 (art. 44), descargados de Función Pública.
  - Todo queda marcado como pendiente de validación por orientación/convivencia.
- **Ciclo Edumon mínimo**:
  - Cada mensaje guarda solo la etiqueta del tema.
  - `GET /api/ia/cursos/:cursoId/ciclo`: temas anónimos con un mínimo de 5 familias distintas, retos creados por tema y ventana de 30 días.
  - `POST /api/ia/cursos/:cursoId/ciclo/sugerencia`: módulos y borrador de reto a partir del tema principal, reutilizando el sugeridor y el generador existentes.
- **Seed de demo** (`npm run seed:demo`): idempotente y limitado a los datos de demo.
- **`docker-compose.demo.yml`** con `mongo:7`.
- **Herramientas de ensayo** en `tests/demo/`: MongoDB efímero, proveedor de IA falso y recorrido con curl.
- **Documentación**:
  - `docs/openapi/edumon-ia.yaml`: OpenAPI 3.1 de todos los endpoints nuevos.
  - `CONTRATOS-WEB.md`.
  - `DEMO-BACKEND.md`.
  - `docs/ia/`: línea base y resultados de la evaluación.

- **Reglas GRAVE por categorías generales** (fase A2):
  - Intención suicida sin la palabra.
  - Ingesta o método.
  - Figura adulta no familiar que besa, toca o manosea.
  - Grooming.
  - Violencia física grave y armas.
  - Cada categoría tiene pruebas de falsas alarmas con frases cotidianas.
  - Las frases hechas ("morir de la risa", "es un suicida manejando") se neutralizan antes de evaluar.
- **Conjunto ciego vacío** (`tests/ia/ciego/casos.json`) con `npm run eval:ciego`. Desde ahora, el conjunto original y el holdout v1 son conjuntos de desarrollo y la métrica final es el ciego.
- **OpenAPI de los endpoints de `modulo-ia` que usa la demo:** consentimiento, conversaciones, ayuda y lista de alertas.

- **Retroalimentación de usuarios:**
  - `PUT /api/ia/conversaciones/:id/mensajes/:mensajeId/calificacion`: útil o no útil, con comentario opcional y etiqueta de sesión de validación.
  - `GET /api/ia/retroalimentacion` (administrador): agregado anónimo.
- **Métricas de impacto**, `GET /api/ia/impacto` (administrador): uso, alertas por ámbito y gravedad, % dentro del plazo (`IA_PLAZO_ATENCION_HORAS_*`), horas hasta la primera atención según la bitácora y participación en retos (mínimo 5 familias por curso).
- **Costo de la IA:**
  - Tokens reales por llamada (`UsoIA`).
  - Tabla de precios oficial con fuente y fecha (`src/config/preciosIA.json`).
  - `GET /api/ia/costos` (administrador), con costo acumulado, costo por mensaje y proyección mensual.
- **Notas de voz:** `POST /api/ia/conversaciones/:id/audio`, apagado por defecto con `IA_NOTAS_VOZ`.
  - Whisper por la capa de proveedores.
  - Pasa por la misma red de seguridad.
  - El audio no se guarda.
- **Prueba de carga** k6 (`tests/carga/`) en un entorno local aislado.
- **Script de latencia real** del chat (`tests/demo/latenciaReal.mjs`).
- Los errores de los proveedores ya no exponen el id de organización de la cuenta.

### Cambiado

- `seed.js`: los padres quedan sin `institucionId` propio, como en el resto del sistema (viene del merge de `modulo-ia`).
- Los motivos de fallo de la IA ya no nombran a Groq fijo.
- Comentario de `DELETE /api/instituciones/:id` corregido: es un borrado lógico.

### Compatibilidad

- No cambió la forma de ningún contrato existente. Todos los campos nuevos de los esquemas son opcionales y tienen valor por defecto, así que los documentos existentes siguen siendo válidos.
- No hay ejecutor de migraciones. El único backfill es `bitacora:encadenar`.

### Variables de entorno nuevas (producción, sin valores)

```
LLM_PROVIDER_ORDER=
LLM_TIMEOUT_MS=
LLM_COOLDOWN_SECONDS=
LLM_CACHE_TTL_SECONDS=
IA_RATE_LIMIT_MAX=
IA_RATE_LIMIT_WINDOW_SECONDS=
GROQ_BASE_URL=
OPENAI_BASE_URL=
EVAL_PAUSA_MS=
EVAL_RESULTADOS_DIR=
IA_PLAZO_ATENCION_HORAS_GRAVE=
IA_PLAZO_ATENCION_HORAS_MODERADO=
IA_PRECIOS_ARCHIVO=
IA_NOTAS_VOZ=
IA_AUDIO_MAX_MB=
IA_AUDIO_MAX_SEGUNDOS=
GROQ_MODELO_TRANSCRIPCION=
OPENAI_MODELO_TRANSCRIPCION=
```

`GROQ_API_KEY`, `GROQ_MODEL`, `OPENAI_API_KEY` y `OPENAI_MODEL` ya existían.

### Pendiente (hoja de ruta)

- Streaming SSE.
- Protocolo oficial de riesgo suicida: no se encontró un texto normativo descargable.
- Anclar la bitácora en una cadena global, para detectar también que se borre una alerta completa.
- Llenar el conjunto ciego (`tests/ia/ciego/casos.json`) con casos escritos por personas que no vieron las reglas.
- Fase B sin construir: análisis de reflexiones, SSE, escalamiento automático, cifrado en reposo, fichas que crecen, temas para la cena e informe PDF Ley 2025.
- La cuota del nivel gratuito de Groq (8.000 tokens por minuto con gpt-oss-120b) alcanza para unos 2 mensajes por minuto en todo el sistema.
- Medición con un proveedor real: las llaves del `.env` responden 401.
