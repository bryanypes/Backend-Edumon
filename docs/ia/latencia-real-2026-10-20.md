# Latencia real del chat con Groq — 2026-10-20 13:55 (hora de Colombia)

Ejecutado con `node tests/demo/latenciaReal.mjs http://127.0.0.1:4101 10` y `PAUSA_MS=65000`, contra un backend local con la llave real de Groq (`openai/gpt-oss-120b`) sobre el seed de demo.

Cada mensaje es una consulta nueva con la edad del hijo, así que Edumon clasifica y redacta la respuesta: son 2 llamadas al LLM por mensaje.

```
 1 · 3229 ms · llm · groq · clasificó groq
 2 · 2797 ms · llm · groq · clasificó groq
 3 · 3009 ms · llm · groq · clasificó groq
 4 · 10005 ms · llm · groq · clasificó reglas
 5 · 3402 ms · llm · groq · clasificó groq
 6 · 3277 ms · llm · groq · clasificó groq
 7 · 3340 ms · llm · groq · clasificó groq
 8 · 3615 ms · llm · groq · clasificó groq
 9 · 3669 ms · llm · groq · clasificó groq
10 · 2718 ms · llm · groq · clasificó groq
{"mensajes":10,"respondidosPorLLM":10,"modos":{"llm":10},"promedioMs":3906,"p95Ms":10005,"minMs":2718,"maxMs":10005}
```

- **Resultado:** 10/10 respuestas redactadas por Groq. Promedio 3.906 ms, p95 10.005 ms, mínimo 2.718 ms, máximo 10.005 ms.
- **El p95 lo marca el mensaje 4:** la clasificación no respondió a tiempo, decidieron las reglas y luego Groq redactó la respuesta.
- **Sin ese caso**, la latencia va de 2,7 a 3,7 s.
- **Por qué la pausa de 65 s:** el nivel gratuito de Groq admite 8.000 tokens por minuto y un mensaje completo usa unos 6.400. En la primera corrida, con 3 s de pausa, solo 3 de 12 mensajes fueron del LLM y el resto cayó a fichas por 429.
