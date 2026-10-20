#!/usr/bin/env bash
# Levanta un entorno LOCAL aislado (MongoDB en memoria + seed de demo + backend en
# modo simulado, sin llaves) y corre la prueba de carga k6 contra él.
#
#   CLAVE_DEMO='<ver DEMO-BACKEND.md>' bash tests/carga/correrCarga.sh
#
# Nunca usa llaves de IA ni toca otra base de datos.
set -u
cd "$(dirname "$0")/../.."
: "${CLAVE_DEMO:?Define CLAVE_DEMO (ver DEMO-BACKEND.md)}"
command -v k6 >/dev/null || { echo "k6 no está instalado: ver tests/carga/LEEME.md"; exit 1; }
PUERTO=4100
MONGO_URI="mongodb://127.0.0.1:27998/edumon_carga"
PIDS=()
trap 'for p in "${PIDS[@]}"; do kill "$p" 2>/dev/null; done' EXIT

node tests/demo/mongoEfimero.mjs --puerto 27998 > /tmp/edumon-carga-mongo.log 2>&1 & PIDS+=($!)
for _ in $(seq 1 60); do grep -q MONGO_URI /tmp/edumon-carga-mongo.log && break; sleep 1; done
env NODE_ENV=development MONGO_URI="$MONGO_URI" node src/scripts/seedDemo.js > /tmp/edumon-carga-seed.log 2>&1 || { echo "seed falló"; exit 1; }
env NODE_ENV=development PORT=$PUERTO MONGO_URI="$MONGO_URI" FRONTEND_URL= SMTP_HOST= GROQ_API_KEY= OPENAI_API_KEY= \
  node src/index.js > /tmp/edumon-carga-backend.log 2>&1 & PIDS+=($!)
for _ in $(seq 1 60); do curl -s -o /dev/null "http://127.0.0.1:$PUERTO/" && break; sleep 1; done

k6 run -e BASE="http://127.0.0.1:$PUERTO" -e CLAVE_DEMO="$CLAVE_DEMO" --summary-export=/tmp/edumon-carga-resumen.json tests/carga/chat-y-alertas.js
