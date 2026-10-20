# Contratos para la web — rama `edumon.ia`

Contrato completo y validado: [docs/openapi/edumon-ia.yaml](docs/openapi/edumon-ia.yaml) (OpenAPI 3.1).
Este archivo es el resumen para integrar rápido.

- **Autenticación:** cookie `access_token`, que pone `POST /api/auth/login`, o `Authorization: Bearer <token>`.
- **Errores comunes:** `401 { message: "Token requerido" }` y `403 { message: "No tienes permisos para esta acción" }`.
- **Compatibilidad:** ningún contrato existente cambió de forma. Todos los campos nuevos son **opcionales** y vienen `null` o ausentes en datos anteriores a esta rama.

## Endpoints nuevos

| Método | Ruta | Rol | Pantalla |
|---|---|---|---|
| GET | `/api/ia/health` | administrador | Panel admin: estado de los proveedores de IA |
| GET | `/api/ia/conversaciones/{id}/mensajes/{mensajeId}/explicacion` | padre (dueño, con consentimiento) | Chat: "¿Por qué Edumon dijo esto?" |
| GET | `/api/ia/alertas/{id}/explicacion` | administrador, docente (visibilidad de alertas) | Detalle de alerta: por qué se generó |
| GET | `/api/ia/alertas/{id}/integridad` | administrador, docente (visibilidad de alertas) | Detalle de alerta: botón "Verificar integridad" |
| GET | `/api/ia/alertas/integridad` | administrador, docente (visibilidad de alertas) | Tablero de convivencia: "Bitácora íntegra" |

Para el Ciclo Edumon y las métricas, ver la sección "Pendientes de esta noche" al final.

## Campos nuevos en respuestas existentes

### `POST /api/ia/conversaciones/{id}/mensajes` (chat)

- `respuesta.ia`: `{ modo, proveedor, modelo, latenciaMs, huboFallback, proveedoresFallidos }`.
  - `modo: "llm"`: la redactó un proveedor (`groq` u `openai`).
  - `modo: "fichas_fallback"`: todos los proveedores fallaron y se mostró la ficha curada. Sugerencia: mostrar el aviso "Edumon respondió sin IA".
  - `modo: "simulado"`: no hay llaves.
  - `modo: "plantilla"`: texto fijo (riesgo, charla, límites).
- `mensajeUsuario.deteccion`: se agregan `proveedor`, `latenciaMs`, `huboFallback`, `proveedoresFallidos` y `desdeCache`.
- `mensajeUsuario.deteccion.reglaSegura`: se agregan `aproximado` y `correcciones` (por ejemplo `kiero → quiero`).
- `mensajeUsuario.categoriaRiesgo` y `mensajeUsuario.rutaAtencion`: ver abajo.
- **Nuevo error `429`**: `{ message, code: "LIMITE_IA", retryAfter }`, con la cabecera `Retry-After`. Mostrar `message` tal cual.
  - El mismo 429 aplica a `POST /api/ia/retos/borrador`, `POST /api/ia/modulos/sugerencias` y `POST /api/ia/lineamientos/borrador`.

### Alertas (`GET /api/ia/alertas`, `GET /api/ia/alertas/{id}`, `PATCH /api/ia/alertas/{id}`)

- `historial[]`: se agregan `seq`, `hashAnterior` y `hash` (SHA-256).
- `rutaAtencion`:

```json
{
  "ambito": "escolar | hogar | personal",
  "tipoLey1620": "I | II | III | null",
  "protocolo": "texto",
  "criterio": "por qué",
  "fundamento": [{ "norma": "...", "articulo": "...", "fuente": "https://...", "texto": "literal" }],
  "fuentePendiente": "texto o null",
  "pendienteValidacion": true,
  "nota": "Pendiente de validación por orientación/convivencia"
}
```

  - `tipoLey1620` solo existe cuando `ambito` es `escolar`.
  - Mostrar siempre `nota`.
  - En riesgo suicida (`ambito: "personal"`) el protocolo dice "PENDIENTE de fuente oficial".
- `PATCH /api/ia/alertas/{id}`: **nuevo error `409`** `{ code: "ALERTA_MODIFICADA" }` si otro usuario la cambió al mismo tiempo. Recargar la alerta y reintentar.

## Respuestas clave (forma resumida)

`GET /api/ia/alertas/{id}/integridad`:

```json
{ "alertaId": "…", "valida": false, "eventos": 3, "ultimoHash": "…", "estadoCoherente": true,
  "rotaEn": { "indice": 1, "accion": "estado", "en": "…", "motivo": "hash_no_coincide" },
  "verificadaEn": "…" }
```

`motivo` puede ser:
- `sin_hash`: alerta anterior a la bitácora; hay que correr `npm run bitacora:encadenar`.
- `secuencia`: falta o sobra un evento.
- `enlace_roto`: el evento no apunta al anterior, o se editó el mensaje o la categoría de la alerta.
- `hash_no_coincide`: se editó el evento.

`GET /api/ia/conversaciones/{id}/mensajes/{mensajeId}/explicacion` devuelve `explicacion` con:
- `nivelRiesgo`, `riesgo` y `decidio`. `decidio` puede ser `regla`, `modelo` o `ambos`.
- `seNotificoAlColegio` y `rutaAtencion`.
- `clasificacion`: fuente, proveedor, modelo, latencia, `reglaSegura` y `reglaDudosa` con su `fragmento`, y `modeloDijo`.
- `respuesta`: modo, proveedor, modelo y `esTextoFijo`.
- `fichas[]` (título, eje, subtema, edades, fuente), `fuentes[]` y `resumen`, un texto listo para mostrar.

`GET /api/ia/health`:

```json
{ "modo": "llm | simulado", "orden": ["groq", "openai"], "timeoutMs": 20000, "cooldownSegundos": 60,
  "proveedores": [{ "nombre": "groq", "modelo": "…", "orden": 1,
    "estado": "activo | en_cooldown | sin_llave | fuera_del_orden",
    "cooldownRestanteSegundos": 0, "motivoCooldown": null, "ultimaLatenciaMs": 310,
    "ultimoExito": "…", "ultimoError": null }] }
```

## Pendientes de esta noche

Se documentan en el YAML a medida que queden listos:
- Ciclo Edumon por curso.
- Métricas de seguridad de la IA (solo administrador).
