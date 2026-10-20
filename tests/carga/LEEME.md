# Prueba de carga (k6)

Mide el chat de las familias y el tablero de alertas **en un entorno local aislado**:
- MongoDB en memoria;
- seed de demo;
- backend en modo simulado, sin llaves de IA.

Nunca se corre contra producción ni contra un proveedor de IA real. El script se niega a correr si `BASE` no es `127.0.0.1` o `localhost`.

## Requisitos

- [k6](https://grafana.com/docs/k6/latest/set-up/install-k6/) instalado. En Windows: `winget install k6`.
- Node 22 o superior y `npm ci`.

## Correr

```bash
CLAVE_DEMO='<ver DEMO-BACKEND.md>' bash tests/carga/correrCarga.sh
```

Escenarios:
- **chat:** 10 familias del seed en paralelo; cada una envía 8 mensajes.
- **alertas:** 2 usuarios de convivencia consultan el tablero durante 40 s.

Umbrales:
- menos de 1 % de errores;
- p95 del chat por debajo de 1,5 s;
- p95 de alertas por debajo de 0,8 s.

El volumen (unas 150 solicitudes) queda bajo el límite global de la API (500 cada 15 min por IP). Una prueba más grande mediría el limitador y no el backend.
