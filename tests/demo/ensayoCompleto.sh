#!/usr/bin/env bash
# Ensayo técnico de la demo, sin Docker: MongoDB efímero + backend local +
# proveedores de IA falsos, y el recorrido con curl en cada modo.
#
#   CLAVE_DEMO='<ver DEMO-BACKEND.md>' bash tests/demo/ensayoCompleto.sh [modo...]
#
# Modos (por defecto todos menos "real"):
#   proveedor  OpenAI primero (LLM_PROVIDER_ORDER=openai,groq) — proveedores FALSOS locales
#   fallback   OpenAI falso responde 503 → debe responder Groq falso
#   simulado   sin llaves: reglas + fichas (plan B)
#   real       llaves reales del .env contra las APIs reales
# Nunca toca otra base de datos: la de este ensayo vive en memoria y se borra al final.
set -u
cd "$(dirname "$0")/../.."
: "${CLAVE_DEMO:?Define CLAVE_DEMO (ver DEMO-BACKEND.md)}"
MODOS=("$@"); [ ${#MODOS[@]} -eq 0 ] && MODOS=(proveedor fallback simulado)
PUERTO=4100
MONGO_URI="mongodb://127.0.0.1:27999/edumon_ensayo"
PIDS=()
limpiar() { for p in "${PIDS[@]}"; do kill "$p" 2>/dev/null; done; }
trap limpiar EXIT

esperar_url() { for _ in $(seq 1 60); do curl -s -o /dev/null "$1" && return 0; sleep 1; done; return 1; }

node tests/demo/mongoEfimero.mjs --puerto 27999 > /tmp/edumon-ensayo-mongo.log 2>&1 &
PIDS+=($!)
for _ in $(seq 1 60); do grep -q MONGO_URI /tmp/edumon-ensayo-mongo.log && break; sleep 1; done

RESULTADO=0
for MODO in "${MODOS[@]}"; do
  echo; echo "════════ MODO: $MODO ════════"
  ENV_MODO=()
  case "$MODO" in
    proveedor) OPENAI_FALSO=ok;       GROQ_FALSO=ok ;;
    fallback)  OPENAI_FALSO=falla503; GROQ_FALSO=ok ;;
  esac
  case "$MODO" in
    proveedor|fallback)
      node tests/demo/proveedorFalso.mjs --puerto 4901 --nombre openai-falso --modo "$OPENAI_FALSO" > "/tmp/edumon-ensayo-openai-$MODO.log" 2>&1 & PIDS+=($!); P1=$!
      node tests/demo/proveedorFalso.mjs --puerto 4902 --nombre groq-falso --modo "$GROQ_FALSO" > "/tmp/edumon-ensayo-groq-$MODO.log" 2>&1 & PIDS+=($!); P2=$!
      sleep 1
      ENV_MODO=(OPENAI_API_KEY=llave-falsa-ensayo GROQ_API_KEY=llave-falsa-ensayo
        OPENAI_BASE_URL=http://127.0.0.1:4901/v1 GROQ_BASE_URL=http://127.0.0.1:4902/v1 LLM_PROVIDER_ORDER=openai,groq) ;;
    simulado) ENV_MODO=(OPENAI_API_KEY= GROQ_API_KEY=) ;;
    real)     ENV_MODO=(LLM_PROVIDER_ORDER=openai,groq) ;;
  esac

  # la base se siembra de nuevo en cada modo (seed idempotente)
  env NODE_ENV=development MONGO_URI="$MONGO_URI" node src/scripts/seedDemo.js > "/tmp/edumon-ensayo-seed-$MODO.log" 2>&1 \
    || { echo "❌ seed falló (ver /tmp/edumon-ensayo-seed-$MODO.log)"; RESULTADO=1; continue; }
  env NODE_ENV=development PORT=$PUERTO MONGO_URI="$MONGO_URI" FRONTEND_URL= SMTP_HOST= "${ENV_MODO[@]}" \
    node src/index.js > "/tmp/edumon-ensayo-backend-$MODO.log" 2>&1 &
  PB=$!; PIDS+=($PB)
  esperar_url "http://127.0.0.1:$PUERTO/" || { echo "❌ el backend no arrancó"; RESULTADO=1; kill $PB; continue; }
  grep -m1 "Edumon IA" "/tmp/edumon-ensayo-backend-$MODO.log"

  bash tests/demo/ensayo.sh "http://127.0.0.1:$PUERTO" || RESULTADO=1
  case "$MODO" in
    proveedor|fallback)
      echo "   llamadas recibidas: openai-falso=$(grep -c '→' "/tmp/edumon-ensayo-openai-$MODO.log") ($(grep -o '→ [0-9]*' "/tmp/edumon-ensayo-openai-$MODO.log" | sort | uniq -c | tr '\n' ' ')) · groq-falso=$(grep -c '→' "/tmp/edumon-ensayo-groq-$MODO.log")"
      kill $P1 $P2 2>/dev/null ;;
  esac
  kill $PB 2>/dev/null; wait $PB 2>/dev/null
done
exit $RESULTADO
