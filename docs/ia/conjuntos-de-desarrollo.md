# Conjuntos de evaluación: desarrollo vs. ciego

Declarado el 2026-10-20 a las 02:25 (hora de Colombia), **antes** de tocar las reglas en la mejora A2.

- **Conjunto original (193 casos)** y **holdout v1 (57 casos, `tests/ia/holdout`)** pasan a ser conjuntos de **DESARROLLO**. Desde ahora sus fallos se usaron para orientar mejoras por categorías generales, así que **ya no sirven como métrica final**.
- **Métrica final:** el conjunto **ciego** (`tests/ia/ciego/casos.json`), que escribirán personas que no han visto las reglas. Hasta que tenga casos, no hay métrica final.
- Estado de partida (modo simulado, commit 3d72c72): original recall de graves 87,9 % (29/33), falsas alarmas 0 %; holdout v1 recall 50,0 % (10/20), falsas alarmas 5,4 % (2/37).
