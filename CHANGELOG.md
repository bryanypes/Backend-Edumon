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
```

`GROQ_API_KEY`, `GROQ_MODEL`, `OPENAI_API_KEY` y `OPENAI_MODEL` ya existían.

### Pendiente (hoja de ruta)

- Streaming SSE.
- Protocolo oficial de riesgo suicida: no se encontró un texto normativo descargable.
- Anclar la bitácora en una cadena global, para detectar también que se borre una alerta completa.
- Un holdout escrito por orientación escolar (el actual lo escribió el mismo autor de las reglas).
- Medición con un proveedor real: las llaves del `.env` responden 401.
