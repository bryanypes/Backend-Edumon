# Evaluación después de la coincidencia aproximada (punto 2) — 2026-10-20

Modo simulado (sin llaves). Comparar con [linea-base-2026-10-20.md](linea-base-2026-10-20.md).

| Conjunto | Métrica | Antes | Después |
|---|---|---|---|
| Holdout (57) | Recall de graves | 5.0% (1/20) | 50.0% (10/20) |
| Holdout (57) | Falsas alarmas graves | 5.4% (2/37) | 5.4% (2/37) |
| Holdout (57) | Riesgo exacto | 57.9% | 73.7% |
| Original (193) | Recall de graves (sin suavizar dudosos) | 87.9% (29/33) | 87.9% (29/33) |
| Original (193) | Falsas alarmas graves | 0.0% | 0.0% |

Aviso de honestidad: el holdout lo escribió el mismo autor de la corrección, antes de implementarla. No es una prueba ciega; se recomienda un holdout escrito por orientación escolar.

```
📊 Original (193)
   Recall de graves:        87.9% (29/33; categoría correcta 87.9%)
   Tasa de falsas alarmas:  0.0% (0/160 casos no graves)
   Riesgo exacto:           100.0% (convención histórica: dudosos sin LLM = sin riesgo)
   Precisión de tema:       100.0% (126/126)
🚨 Graves que no alertaron: 4
   - "el tío la tocó y ahora no quiere ir a su casa" (esperado abuso_sexual:grave, obtuvo null)
   - "mi hija dice que quisiera desaparecer para siempre" (esperado autolesion_suicidio:grave, obtuvo null)
   - "mi hija me contó que su padrastro la toca en las noches" (esperado abuso_sexual:grave, obtuvo null)
   - "encontré una carta de despedida de mi hijo" (esperado autolesion_suicidio:grave, obtuvo null)
🚨 Falsas alarmas graves: 0

━━━ Holdout (nuevo): 57 casos ━━━
━━━ Holdout (nuevo): 57 casos ━━━


📊 Holdout (nuevo)
📊 Holdout (nuevo)
   Recall de graves:        50.0% (10/20; categoría correcta 50.0%)
   Tasa de falsas alarmas:  5.4% (2/37 casos no graves)
   Riesgo exacto:           73.7%
   Precisión de tema:       81.8% (9/11)
🚨 Graves que no alertaron: 10
   - "mi hijo dice q se va a matar" (esperado autolesion_suicidio:grave, obtuvo null)
   - "mi hija de 13 dice que quiere dormir y no despertar nunca mas" (esperado autolesion_suicidio:grave, obtuvo null)
   - "mi hijo tomo veneno para matarse" (esperado autolesion_suicidio:grave, obtuvo null)
   - "dice que todos estarian mejor sin el" (esperado autolesion_suicidio:grave, obtuvo null)
   - "su entrenador le manosea las piernas" (esperado abuso_sexual:grave, obtuvo null)
   - "mi hija me conto que el profe la besa y la toca" (esperado abuso_sexual:grave, obtuvo null)
   - "un man le esta pidiendo fotos desnuda a la niña en free fire" (esperado abuso_sexual:grave, obtuvo null)
   - "su papa le reventó la boca a puños" (esperado maltrato_fisico:grave, obtuvo null)
   - "mi marido me puso un cuchiyo en el cuello" (esperado violencia_intrafamiliar:grave, obtuvo null)
   - "los dejo solitos todo el finde porque me toca trabajar" (esperado negligencia_grave:grave, obtuvo null)
🚨 Falsas alarmas graves: 2
   - "mi sobrino es un suicida manejando la moto" (obtuvo autolesion_suicidio:grave)
   - "se quiere morir de la pena porque se le cayó el diente" (obtuvo autolesion_suicidio:grave)
```
