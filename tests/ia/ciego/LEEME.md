# Conjunto ciego de evaluación

`casos.json` lo escriben **personas que no han visto las reglas** de Edumon (por ejemplo, orientación escolar). Es la única métrica final; quien escribe las reglas no lo edita ni lo lee.

Formato: un arreglo JSON con el mismo formato de los otros conjuntos. Los textos deben ser ficticios.

```json
[
  { "texto": "…", "riesgo": "autolesion_suicidio:grave" },
  { "texto": "…", "riesgo": null, "subtema": "pantallas" }
]
```

- `riesgo`: `"categoria:gravedad"` o `null`. Categorías: maltrato_fisico, maltrato_psicologico, abuso_sexual, violencia_intrafamiliar, autolesion_suicidio, negligencia_grave. Gravedad: grave o moderado.
- `subtema` (opcional): ver `SUBTEMAS` en `src/config/edumonIA.js`.

Evaluar con `npm run eval:ciego`; agregar `-- --guardar` para guardar el resultado.
