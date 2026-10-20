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

Ciclo Edumon y métricas: ver las secciones al final.

## Endpoints existentes (modulo-ia) que usa la demo

Ya existían; ahora también están en el OpenAPI. Rol: padre, salvo las alertas.

| Método | Ruta | Para qué |
|---|---|---|
| GET / POST / DELETE | `/api/ia/consentimiento` | Ver, aceptar (`{ version }`) o revocar el consentimiento. Revocar también borra las conversaciones |
| GET / POST | `/api/ia/conversaciones` | Listar y crear conversaciones |
| GET / DELETE | `/api/ia/conversaciones/{id}` | Ver con mensajes y borrar |
| POST | `/api/ia/conversaciones/{id}/mensajes` | Enviar mensaje (ver campos nuevos abajo) |
| POST | `/api/ia/conversaciones/{id}/ayuda` | La familia acepta que el colegio la contacte (409 si no hay oferta pendiente) |
| GET | `/api/ia/alertas?estado=` | Tablero de convivencia (administrador, docente) |

Todo menos `/consentimiento` responde 403 `CONSENTIMIENTO_REQUERIDO` si el perfil no aceptó la versión vigente.

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

## Notas de voz (padre; apagado por defecto)

`POST /api/ia/conversaciones/{id}/audio` recibe `multipart/form-data` con el campo `audio` (webm, ogg, mp3, m4a, wav o aac). Solo funciona si el servidor tiene `IA_NOTAS_VOZ=true`.
- Responde 201 con lo mismo que el envío de un mensaje escrito, más `transcripcion: { texto, duracionSegundos, proveedor, modelo, latenciaMs }`.
- El mensaje del cuidador queda con `entrada: "voz"`.
- Errores (todos con `code`):
  - 404 `NOTAS_VOZ_DESACTIVADAS`.
  - 400 `AUDIO_INVALIDO`.
  - 413 `AUDIO_DEMASIADO_GRANDE` o `AUDIO_DEMASIADO_LARGO`.
  - 422 `AUDIO_SIN_TEXTO`.
  - 503 `TRANSCRIPCION_NO_DISPONIBLE`: mostrar "escribe tu mensaje".
  - 429 `LIMITE_IA`.
- El audio no se guarda en ningún lado.

## Retroalimentación de usuarios (evidencia de validación)

| Método | Ruta | Rol | Pantalla |
|---|---|---|---|
| PUT | `/api/ia/conversaciones/{id}/mensajes/{mensajeId}/calificacion` | padre | Chat: 👍/👎 bajo cada respuesta, con comentario opcional |
| GET | `/api/ia/retroalimentacion?sesion=&desde=&hasta=` | administrador | Panel "¿Les sirve Edumon?" |

- **Calificar:** el cuerpo es `{ "util": true, "comentario": "opcional", "sesionValidacion": "feria-2026-10-21" }`.
  - Responde 201 la primera vez y 200 si se reemplaza; hay una sola calificación por mensaje y perfil.
  - Solo se pueden calificar respuestas de Edumon: con un mensaje del cuidador responde 400.
- **Agregado:** responde `{ total, utiles, noUtiles, porcentajeUtil, porTipoRespuesta, porModoIA, comentariosRecientes[≤20], sesionesValidacion[] }`.
  - No trae familias, perfiles ni conversaciones.
  - En los comentarios se ocultan correos, teléfonos y números largos.
- **Sugerencia para la feria:** que la web mande `sesionValidacion: "feria-2026-10-21"` mientras dure la feria, para separar las pruebas con usuarios reales.

## Métricas de impacto (administrador)

`GET /api/ia/impacto?desde=&hasta=` responde solo agregados de la institución. Por defecto toma los últimos 30 días.
- `uso`: `familiasQueUsaronEdumon`, `conversaciones` y `mensajesDeFamilias`.
- `alertas`:
  - `porAmbito`, `porGravedad` y `plazosHoras` (24 h grave y 72 h moderado; configurables y pendientes de validación).
  - `atendidasDentroDelPlazo`, `fueraDelPlazo`, `sinAtenderAunEnPlazo` y `porcentajeDentroDelPlazo`.
  - `horasPromedioHastaPrimeraAtencion`, calculado desde la bitácora.
- `retosDelCiclo`: `retos`, `entregas`, `porcentajeParticipacion` y `porCurso[]`. Un curso con menos de 5 familias va a `otrosCursos`.
- Errores: 400 si el periodo es inválido.

## Costo de la IA (administrador)

`GET /api/ia/costos?familias=&mensajesPorFamiliaMes=10&desde=&hasta=` responde:
- `costoAcumuladoUSD`, `llamadas`, `tokensEntrada` y `tokensSalida`.
- `porModelo`, con el precio usado en cada uno.
- `chat.costoPorMensajeUSD`.
- `proyeccionMensual`: mensajes por familia al mes × familias; por defecto toma las familias de la institución.
- `tablaDePrecios`: precios con su fuente oficial y fecha.

Los tokens son los reales que reporta el proveedor. Si un modelo no tiene precio en la tabla, su costo es `null`.

## Ciclo Edumon (docente dueño del curso o admin de la institución)

| Método | Ruta | Pantalla |
|---|---|---|
| GET | `/api/ia/cursos/{cursoId}/ciclo` | Vista del docente: "¿Qué preguntan las familias de mi curso?" |
| POST | `/api/ia/cursos/{cursoId}/ciclo/sugerencia` | Botón "Sugerirme un módulo y un reto" |

`GET /api/ia/cursos/{cursoId}/ciclo` responde:

```json
{ "curso": { "_id": "…", "nombre": "Grado Quinto A" },
  "ventana": { "desde": "…", "dias": 30 }, "minimoFamilias": 5, "hayTemasOcultos": false,
  "temas": [{ "eje": "estilos_vida_saludable", "subtema": "pantallas", "subtemaLabel": "Pantallas y celular",
              "ejeLabel": "Estilos de vida saludables", "familias": 6,
              "retosCreados": [{ "tareaId": "…", "titulo": "…", "estado": "publicada", "fechaEntrega": "…" }] }] }
```

- Un tema solo aparece si lo consultaron **5 familias distintas o más**. Los demás no se cuentan; solo se indica `hayTemasOcultos`.
- La respuesta nunca trae el texto de los mensajes ni quién preguntó.

`POST /api/ia/cursos/{cursoId}/ciclo/sugerencia`:
- Responde `{ basadoEn, modulos, reto }`.
  - `modulos` tiene la misma forma que `POST /api/ia/modulos/sugerencias`.
  - `reto` tiene la misma forma que el `borrador` de `POST /api/ia/retos/borrador`.
- El borrador no se guarda. Para publicarlo se usa el flujo normal de tareas con `escuelaPadres: { eje, subtema }`.
- Si ningún tema llega a 5 familias responde `422 { code: "SIN_TEMAS_SUFICIENTES" }`. Puede responder `429 LIMITE_IA`.

## Métricas de seguridad de la IA (administrador)

`GET /api/ia/metricas` responde `{ nota, ultimas[], historial[] }`.
- `ultimas` trae la última corrida por conjunto (`original` o `holdout`) y modo (`simulado` o `llm`).
- Cada corrida incluye `recallGraves`, `tasaFalsasAlarmas`, `riesgoExacto`, `precisionTema` y `precisionPorTema`, todas como fracciones de 0 a 1.
- También trae las listas `gravesPerdidos[]` y `falsasAlarmas[]`, con el texto de cada caso de evaluación (son ficticios).
- El número que importa mostrar es el del conjunto **holdout**.
