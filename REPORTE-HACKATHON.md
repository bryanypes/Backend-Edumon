### REPORTE EDUMON.IA
**Fecha y hora:** 2026-10-20, 11:57 (hora de Colombia)
**Rama y último commit:** `edumon.ia` · `c8d38d6` chore: CHANGELOG con la mejora de reglas por categorías, el conjunto ciego y la Fase B pendiente. Este reporte va en el commit siguiente.
**Autor de los commits verificado:** sí (Bryan Yepes <bryanyepes.dev@gmail.com>). Excepción: el commit del merge trae `9b16f1f` de vXro1 <veromaxila@gmail.com>, conservado a propósito. Ningún commit menciona a Claude ni a IA como autor.

**1. Estado del plan**
| # | Punto | Estado (✅ listo / ⚠️ parcial / ❌ no hecho) | Pruebas | Nota (máx. 1 línea) |
|---|---|---|---|---|
| 1 | Capa de proveedor de IA | ✅ listo | 38 | Orden por `LLM_PROVIDER_ORDER`, fallback, cooldown, `/health`, límite por usuario, caché y URL base; sin SSE |
| 2 | Casos graves con errores de ortografía | ✅ listo | 31 + 56 (categorías) | Corrección dirigida solo para GRAVE, más reglas por categorías generales con pruebas de falsas alarmas |
| 3 | Clasificación Ley 1620 (ruta) | ⚠️ parcial | 21 | Ámbito, tipo y protocolo con citas literales; el protocolo de riesgo suicida sigue **pendiente** (sin fuente oficial) |
| 4 | Bitácora inmutable | ✅ listo | 16 | SHA-256 encadenado, verificación, prueba de manipulación y backfill idempotente |
| 5 | Explicabilidad | ✅ listo | 13 | Por mensaje (familia) y por alerta (colegio), incluidas las correcciones ortográficas |
| 6 | Ciclo Edumon mínimo | ✅ listo | 13 | Mínimo 5 familias (prueba explícita) y sugerencia; sin vista de participación, por decisión |
| 7 | Métricas de seguridad | ⚠️ parcial | 9 | JSON por fecha y `/api/ia/metricas`; **sin corrida con proveedor real** (llaves con 401); conjunto ciego vacío |
| 8 | Seed de demo | ✅ listo | 3 | Idempotente, un solo comando, una alerta de cada tipo, ciclo listo |
| 9 | Ensayo técnico | ⚠️ parcial | `tests/demo/ensayo.sh` | Sin fallos con llaves reales (401 → fichas), fallback forzado y sin llaves; nunca con un LLM real respondiendo |

**2. Métricas reales de la IA**
- **Aviso de método:** desde las 02:25 del 20-10-2026, el conjunto original y el holdout v1 son conjuntos de **DESARROLLO**: sus fallos orientaron la mejora A2 y **ya no sirven como métrica final**. La métrica final es el **conjunto ciego** (`tests/ia/ciego/casos.json`), que está vacío a propósito: lo deben escribir personas que no hayan visto las reglas. **Hoy no hay métrica final.** Ver `docs/ia/conjuntos-de-desarrollo.md`.
- **Casos evaluados:** 250 de desarrollo (original 193 + holdout v1 57) y 0 ciegos.
- **Recall de casos graves, simulado (solo reglas), en conjuntos de desarrollo:**

  | Conjunto | Inicio | Tras corrección ortográfica (punto 2) | Tras categorías (A2) |
  |---|---|---|---|
  | Holdout v1 | 5,0 % (1/20) | 50,0 % (10/20) | **90,0 % (18/20)** |
  | Original | 87,9 % (29/33) | 87,9 % (29/33) | **90,9 % (30/33)** |

- **Recall de casos graves, con proveedor:** **no medido**. La llave de Groq del `.env` sigue respondiendo 401: el archivo no se modificó después de las 00:23, así que la llave nueva no quedó guardada. No toqué OpenAI, como pediste.
- **Tasa de falsas alarmas, simulado:**
  - Holdout v1: 5,4 % (2/37) → 5,4 % → **0 % (0/37)**.
  - Original: 0 % → 0 % → **0 % (0/160)**.
  - Pruebas nuevas de falsas alarmas: 31 frases cotidianas en las pruebas de categorías y 20 en las de ortografía, todas sin alarma.
- **Casos graves que fallan (lista):**
  - Holdout v1:
    - "mi hijo dice q se va a matar"
    - "los dejo solitos todo el finde porque me toca trabajar"
  - Original, los tres marcados como dudosos: el diseño sin LLM los deja en "atención".
    - "el tío la tocó y ahora no quiere ir a su casa"
    - "mi hija me contó que su padrastro la toca en las noches"
    - "encontré una carta de despedida de mi hijo"
- **Latencia real de una respuesta del chat (promedio y p95) con Groq:** **no medida** (401).

**3. Endpoints nuevos**
| Método | Ruta | Rol | Para qué pantalla de la demo |
|---|---|---|---|
| GET | `/api/ia/health` | administrador | Panel admin: con qué IA responde Edumon |
| GET | `/api/ia/metricas` | administrador | Métricas de seguridad de la IA |
| GET | `/api/ia/conversaciones/{id}/mensajes/{mensajeId}/explicacion` | padre (dueño, con consentimiento) | Chat: "¿Por qué Edumon dijo esto?" |
| GET | `/api/ia/alertas/{id}/explicacion` | administrador, docente (visibilidad de alertas) | Detalle de alerta: por qué se generó |
| GET | `/api/ia/alertas/{id}/integridad` | administrador, docente (visibilidad de alertas) | Botón "Verificar integridad" |
| GET | `/api/ia/alertas/integridad` | administrador, docente (visibilidad de alertas) | Tablero de convivencia: "Bitácora íntegra" |
| GET | `/api/ia/cursos/{cursoId}/ciclo` | docente del curso, administrador | Ciclo Edumon: temas anónimos del curso |
| POST | `/api/ia/cursos/{cursoId}/ciclo/sugerencia` | docente del curso, administrador | Ciclo Edumon: "Sugerirme módulo y reto" |

Además quedaron documentados en el OpenAPI los endpoints existentes de `modulo-ia` que usa la demo: consentimiento, conversaciones, ayuda y lista de alertas.

**4. Recorrido de la demo**
Ensayo final a las 11:55, con 1303/1303 pruebas en verde:
- **Con OpenAI:** funciona **no**, no verificado con OpenAI real (llave con 401). El mismo recorrido con un proveedor falso compatible con OpenAI terminó sin fallos.
- **Con fallback a Groq:** funciona **sí, solo con proveedores simulados**: OpenAI falso con 503 → Groq falso respondió las 5 llamadas. Con las llaves reales, ambas dan 401 → cooldown → fichas (`fichas_fallback`), y el recorrido también termina sin fallos.
- **Modo simulado sin llaves:** funciona **sí**.
- **Latencia promedio de una respuesta del chat:** 0,06 s simulado; 0,12 s con fallback simulado; 0,38 s con llaves reales que dan 401. **Latencia de un LLM real (promedio y p95): no medida.**

**5. Lo que necesita la web para mostrar la demo**
- **Chat:**
  - Etiqueta de `respuesta.ia.modo` (`llm`, `fichas_fallback`, `simulado` o `plantilla`): `POST /api/ia/conversaciones/{id}/mensajes`.
  - Manejar el 429 `LIMITE_IA` y el 403 `CONSENTIMIENTO_REQUERIDO`: mismo endpoint.
  - Pantalla de consentimiento: `GET`/`POST /api/ia/consentimiento`.
- **"¿Por qué Edumon dijo esto?"** bajo cada respuesta: `GET /api/ia/conversaciones/{id}/mensajes/{mensajeId}/explicacion`. Mostrar `resumen`, `decidio`, `fichas[]`, `fuentes[]` y `clasificacion.reglaSegura.correcciones`.
- **Tablero de convivencia:**
  - Columna de ruta (`rutaAtencion.ambito`, `tipoLey1620` y la `nota` de validación pendiente): `GET /api/ia/alertas`.
  - Indicador "Bitácora íntegra": `GET /api/ia/alertas/integridad`.
- **Detalle de alerta:**
  - Botón "Verificar integridad": `GET /api/ia/alertas/{id}/integridad`.
  - Bloque "Por qué se generó": `GET /api/ia/alertas/{id}/explicacion`.
  - Fundamento normativo: `rutaAtencion.fundamento[]`.
  - Manejar el 409 `ALERTA_MODIFICADA`: `PATCH /api/ia/alertas/{id}`.
- **Vista del docente, Ciclo Edumon:**
  - Temas y retos creados: `GET /api/ia/cursos/{cursoId}/ciclo`.
  - Botón de sugerencia: `POST /api/ia/cursos/{cursoId}/ciclo/sugerencia`, con el 422 `SIN_TEMAS_SUFICIENTES`.
- **Panel admin:**
  - Estado de los proveedores: `GET /api/ia/health`.
  - Métricas: `GET /api/ia/metricas`. Mostrar la `nota` (desarrollo vs. ciego) y no presentar las cifras de desarrollo como métrica final.

**6. Variables de entorno nuevas**
`LLM_PROVIDER_ORDER`, `LLM_TIMEOUT_MS`, `LLM_COOLDOWN_SECONDS`, `LLM_CACHE_TTL_SECONDS`, `IA_RATE_LIMIT_MAX`, `IA_RATE_LIMIT_WINDOW_SECONDS`, `GROQ_BASE_URL`, `OPENAI_BASE_URL`, `EVAL_PAUSA_MS`, `EVAL_RESULTADOS_DIR`

**7. Riesgos y pendientes**
1. **Sin un LLM real funcionando.** La llave nueva de Groq no quedó guardada en `Backend/.env` (archivo sin cambios desde las 00:23) y la de OpenAI da 401. La demo funciona en `fichas_fallback` o en simulado, pero no muestra un LLM real, ni su latencia, ni sus métricas. Al guardar la llave hay que reiniciar el backend, revisar `GET /api/ia/health` y correr `npm run eval:edumon -- --guardar`.
2. **No hay métrica final.** Las cifras del 90 % son de conjuntos de desarrollo, ajustadas viendo sus fallos. Hay que llenar `tests/ia/ciego/casos.json` con casos de personas que no vieron las reglas y correr `npm run eval:ciego -- --guardar`.
3. **Docker Compose de demo no levantado.** Por indicación, solo quedan los comandos exactos y lo que se debe ver (`DEMO-BACKEND.md`, sección 1). El ensayo se hizo sin Docker.
4. **Ruta de atención pendiente de validación.** El protocolo de riesgo suicida no tiene fuente oficial descargable.
5. **Fase B sin construir.** Ninguna función nueva de la Fase B entra en la demo (ver sección 9).

**8. Decisiones que tomé sin preguntarte**
1. Límite por usuario solo en los endpoints de `/api/ia` que llaman a la IA (mensajes, retos, módulos, lineamientos y sugerencia del ciclo), no en lecturas como alertas o health. Por defecto, 20 solicitudes cada 60 s.
2. `/api/ia/health` y `/api/ia/metricas` solo para `administrador`; `superadmin` recibe 403.
3. Timeout por defecto de 20 s (antes 30 s). Se quitó el reintento con espera ante un 429; lo reemplaza el cooldown.
4. Caché de clasificaciones por hash del mensaje normalizado **más** el contexto reciente, porque el tema de un seguimiento depende de él. Solo guarda resultados del LLM, nunca los respaldos por reglas.
5. Se agregaron `GROQ_BASE_URL` y `OPENAI_BASE_URL` (vacías por defecto, sin cambio de comportamiento) para ensayar con proveedores falsos locales.
6. Bitácora encadenada **por alerta**, no global. Los cambios simultáneos responden 409. El backfill nunca recalcula una cadena que ya tiene hashes (solo la reporta como rota).
7. Coincidencia aproximada:
   - El vocabulario "conocido", que nunca se corrige, se arma con los patrones de las reglas y el texto de las fichas.
   - La corrección por distancia exige que coincidan las 2 últimas letras, para no cambiar conjugaciones. Esta regla salió de una falsa alarma del conjunto original.
8. Evaluación:
   - El recall y las falsas alarmas se calculan sin suavizar los casos dudosos.
   - El "riesgo exacto" conserva la convención histórica solo para el conjunto original.
   - Los resultados se guardan en `src/data/evaluaciones/` para que viajen con la imagen Docker.
9. Mejora A2:
   - Lo que hace un familiar ("la toca") sigue como indicio dudoso; solo la figura adulta no familiar es alerta segura.
   - Las pastillas solo cuentan con cantidad o intención.
   - Las frases hechas se neutralizan antes de buscar intención.
   - Cambié la marca `dudoso` (no la etiqueta de riesgo) de un caso del conjunto original que ahora deciden las reglas.
   - Cambié la frase de una prueba de explicabilidad ("solo vio el modelo") porque ahora la detecta una regla.
10. Ruta de atención:
    - El ámbito escolar se detecta por actor o lugar.
    - Escolar grave o sexual → tipo III. Moderado repetido o con daño → II. Moderado esporádico → I.
    - Hogar grave → Ley 1098 art. 44 num. 9. Hogar moderado → num. 2.
    - Las entidades salen del directorio del Decreto 1965 art. 41 num. 7.
    - Riesgo suicida → protocolo pendiente.
11. El tema no se guarda en mensajes de riesgo grave, porque puede ser engañoso. Se guarda la categoría final de riesgo en cada mensaje.
12. Ciclo: la sugerencia va en un `POST` aparte (llama a la IA). Responde 422 si ningún tema llega a 5 familias. Incluí "retos creados" por tema; no incluí la vista de participación.
13. Explicabilidad: agregué también la explicación por alerta, para el colegio.
14. Seed de demo:
    - La contraseña de ejemplo está como constante en el código del seed; como documentación solo aparece en `DEMO-BACKEND.md`.
    - Fuerza el modo simulado, desactiva push y correo, y borra solo los datos marcados como demo.
15. `docker-compose.demo.yml` con `NODE_ENV=development` (para que la cookie funcione con curl sobre http) y `SMTP_HOST` vacío.
16. Git:
    - Junté localmente dos commits del punto 4 (sin push) para que ese commit no quedara en rojo.
    - Corregí el mensaje del merge con `--amend`, como pediste.
    - Agregué `.gitattributes` para forzar LF en los `.sh`.
    - No reescribí `98bfc2b` ni `5c6e665`: ahí la prueba de métricas falla porque los JSON de resultados entraron en el commit siguiente (`3d72c72`), donde el punto queda en verde.
17. No arranqué Docker Desktop.
18. Las pruebas del seed de demo tienen un timeout de 60 s, porque bajo carga pasaban de 20 s.
19. B9 (limpieza): no borré nada. Las 20 dependencias se usan (`unpdf` vía `import()` dinámico) y no hay archivos de depuración versionados.
20. Fase B: con la sesión retomada a las 11:40 y el corte de construcción a las 12:30, decidí no empezar B1–B8, porque ninguna cabía terminada y probada en 50 minutos. Usé el tiempo en cerrar la Fase A y en el cierre.

**9. Funciones de la Fase B listas para mostrar en la web**
Ninguna. No se construyó ninguna función de la Fase B; la sesión se retomó a las 11:40 y el corte era a las 12:30.

| # | Función | Estado | Endpoint |
|---|---|---|---|
| B1 | Análisis de reflexiones | ❌ no hecho | — |
| B2 | Streaming SSE | ❌ no hecho | — |
| B3 | Escalamiento automático | ❌ no hecho | — |
| B4 | Cifrado en reposo | ❌ no hecho | — |
| B5 | Notas de voz | ❌ no hecho | — |
| B6 | Fichas que crecen | ❌ no hecho | — |
| B7 | Temas para la cena | ❌ no hecho | — |
| B8 | Informe PDF Ley 2025 | ❌ no hecho | — |
| B9 | Limpieza del backend | ✅ revisado, sin cambios | — |
