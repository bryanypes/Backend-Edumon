#!/usr/bin/env bash
# Recorrido completo de la demo de Edumon IA con curl (requiere `npm run seed:demo` antes).
#
#   CLAVE_DEMO='<ver DEMO-BACKEND.md>' bash tests/demo/ensayo.sh [http://localhost:4000]
#
# Imprime cada paso con lo que respondió el backend y termina con código 1 si
# algún paso no dio lo esperado. Solo usa datos ficticios del seed de demo.
set -u
BASE="${1:-http://localhost:4000}"
: "${CLAVE_DEMO:?Define CLAVE_DEMO (ver DEMO-BACKEND.md)}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
FALLOS=0
LATENCIAS=()

# lee un campo de un JSON por stdin: campo '.respuesta.tipo'
campo() { node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{const v=new Function('o','return o'+process.argv[1])(JSON.parse(d));console.log(typeof v==='object'?JSON.stringify(v):v)}catch(e){console.log('<sin dato>')}})" "$1"; }
ok() { echo "   ✅ $*"; }
mal() { echo "   ❌ $*"; FALLOS=$((FALLOS + 1)); }
espera() { [ "$2" = "$3" ] && ok "$1: $2" || mal "$1: esperado '$3', obtuvo '$2'"; }

login() { # $1 = nombre del jar, $2 = teléfono
  # el cuerpo se escribe con node: en Windows la "ñ" de "contraseña" se daña si va en la línea de comandos
  node -e "require('fs').writeFileSync(process.argv[1], JSON.stringify({ telefono: process.argv[2], ['contraseña']: process.env.CLAVE_DEMO }))" "$TMP/login.json" "$2"
  curl -s -c "$TMP/$1" -H 'Content-Type: application/json; charset=utf-8' --data-binary "@$TMP/login.json" "$BASE/api/auth/login" | campo '.message'
}
get() { curl -s -b "$TMP/$1" "$BASE$2"; }
post() { curl -s -b "$TMP/$1" -H 'Content-Type: application/json' -d "$3" "$BASE$2"; }
patch() { curl -s -b "$TMP/$1" -X PATCH -H 'Content-Type: application/json' -d "$3" "$BASE$2"; }

echo "▶ 0. Salud de la IA (rectora / administrador)"
espera "login rectora" "$(login rectora +573009990001)" "Login exitoso"
SALUD="$(get rectora /api/ia/health)"
echo "   modo=$(echo "$SALUD" | campo '.modo') orden=$(echo "$SALUD" | campo '.orden') estados=$(echo "$SALUD" | campo '.proveedores.map(p=>p.nombre+":"+p.estado).join(",")')"

echo "▶ 1. Una familia escribe a Edumon y recibe respuesta con fuentes"
espera "login familia" "$(login familia +573009990006)" "Login exitoso"
CONV="$(post familia /api/ia/conversaciones '{}' | campo '.conversacion._id')"
R1="$(curl -s -b "$TMP/familia" -w '\n%{time_total}' -H 'Content-Type: application/json' \
  -d '{"contenido":"mi hija de 4 años hace rabietas terribles"}' "$BASE/api/ia/conversaciones/$CONV/mensajes")"
LATENCIAS+=("$(echo "$R1" | tail -1)")
R1="$(echo "$R1" | sed '$d')"
espera "tipo de respuesta" "$(echo "$R1" | campo '.respuesta.tipo')" "respuesta"
echo "   fuentes=$(echo "$R1" | campo '.respuesta.fuentes.map(f=>f.nombre).join(" | ")')"
echo "   ia=$(echo "$R1" | campo '.respuesta.ia')"
RESP1="$(echo "$R1" | campo '.respuesta._id')"

echo "▶ 2. Mensaje GRAVE con mala ortografía"
R2="$(curl -s -b "$TMP/familia" -w '\n%{time_total}' -H 'Content-Type: application/json' \
  -d '{"contenido":"me kiero matar ya no puedo mas"}' "$BASE/api/ia/conversaciones/$CONV/mensajes")"
LATENCIAS+=("$(echo "$R2" | tail -1)")
R2="$(echo "$R2" | sed '$d')"
espera "respuesta de riesgo" "$(echo "$R2" | campo '.respuesta.tipo')" "riesgo"
espera "coincidencia aproximada" "$(echo "$R2" | campo '.mensajeUsuario.deteccion.reglaSegura.aproximado')" "true"
echo "   ruta=$(echo "$R2" | campo '.mensajeUsuario.rutaAtencion.ambito')/$(echo "$R2" | campo '.mensajeUsuario.rutaAtencion.tipoLey1620')"
RESP2="$(echo "$R2" | campo '.respuesta._id')"

echo "▶ 3. La alerta llega a convivencia, con su clasificación de ruta"
espera "login orientadora" "$(login orientadora +573009990002)" "Login exitoso"
ALERTAS="$(get orientadora /api/ia/alertas)"
ALERTA="$(echo "$ALERTAS" | campo '.alertas[0]._id')"
espera "categoría de la alerta nueva" "$(echo "$ALERTAS" | campo '.alertas[0].categoria')" "autolesion_suicidio"
echo "   alertas visibles=$(echo "$ALERTAS" | campo '.alertas.length') · tipos Ley 1620=$(echo "$ALERTAS" | campo '.alertas.map(a=>a.rutaAtencion?.ambito+":"+(a.rutaAtencion?.tipoLey1620??"-")).join(",")')"

echo "▶ 4. Verificar la integridad de la bitácora (botón)"
patch orientadora "/api/ia/alertas/$ALERTA" '{"estado":"en_atencion","notas":"Orientación llamó a la familia (ensayo)."}' >/dev/null
espera "alerta íntegra" "$(get orientadora "/api/ia/alertas/$ALERTA/integridad" | campo '.valida')" "true"
espera "todas las alertas íntegras" "$(get orientadora /api/ia/alertas/integridad | campo '.valida')" "true"

echo "▶ 5. ¿Por qué Edumon dijo esto?"
E1="$(get familia "/api/ia/conversaciones/$CONV/mensajes/$RESP1/explicacion")"
echo "   respuesta normal: decidio=$(echo "$E1" | campo '.explicacion.decidio') modo=$(echo "$E1" | campo '.explicacion.respuesta.modo') fichas=$(echo "$E1" | campo '.explicacion.fichas.length')"
E2="$(get familia "/api/ia/conversaciones/$CONV/mensajes/$RESP2/explicacion")"
espera "quién decidió el caso grave" "$(echo "$E2" | campo '.explicacion.decidio')" "regla"
echo "   resumen: $(echo "$E2" | campo '.explicacion.resumen')"

echo "▶ 6. Ciclo Edumon: temas anónimos del curso → sugerencia de módulo y reto"
espera "login docente" "$(login docente +573009990003)" "Login exitoso"
CURSO="$(get docente /api/cursos | campo '.cursos.find(c=>c.nombre==="Grado Quinto A")._id')"
CICLO="$(get docente "/api/ia/cursos/$CURSO/ciclo")"
espera "tema principal" "$(echo "$CICLO" | campo '.temas[0].subtema')" "pantallas"
echo "   temas=$(echo "$CICLO" | campo '.temas.map(t=>t.subtema+":"+t.familias).join(",")') retos creados=$(echo "$CICLO" | campo '.temas[0].retosCreados.length')"
SUG="$(post docente "/api/ia/cursos/$CURSO/ciclo/sugerencia" '{}')"
espera "sugerencia basada en" "$(echo "$SUG" | campo '.basadoEn.subtema')" "pantallas"
echo "   módulos por=$(echo "$SUG" | campo '.modulos.generadoPor') · reto por=$(echo "$SUG" | campo '.reto.generadoPor') · reto=$(echo "$SUG" | campo '.reto.titulo')"

echo "▶ 7. Métricas reales de seguridad de la IA"
MET="$(get rectora /api/ia/metricas)"
echo "   $(echo "$MET" | campo '.ultimas.map(u=>u.conjunto+"/"+u.modo+": recall="+u.recallGraves+" FA="+u.tasaFalsasAlarmas).join(" · ")')"
[ -n "$(echo "$MET" | campo '.ultimas.length')" ] && ok "métricas disponibles" || mal "sin métricas"

echo "▶ 8. Costo de la IA e impacto (rectora)"
COS="$(get rectora /api/ia/costos)"
echo "   llamadas=$(echo "$COS" | campo '.llamadas') tokens=$(echo "$COS" | campo '.tokensEntrada')/$(echo "$COS" | campo '.tokensSalida') costo=US\$$(echo "$COS" | campo '.costoAcumuladoUSD') por mensaje=US\$$(echo "$COS" | campo '.chat.costoPorMensajeUSD') proyección mensual=US\$$(echo "$COS" | campo '.proyeccionMensual.costoUSD') (familias=$(echo "$COS" | campo '.proyeccionMensual.familias'))"
IMP="$(get rectora /api/ia/impacto)"
[ "$(echo "$IMP" | campo '.alertas.total')" -ge 5 ] 2>/dev/null && ok "impacto: alertas=$(echo "$IMP" | campo '.alertas.total') familias que usaron Edumon=$(echo "$IMP" | campo '.uso.familiasQueUsaronEdumon')" || mal "impacto sin datos"

PROM="$(printf '%s\n' "${LATENCIAS[@]}" | awk '{s+=$1} END {if (NR) printf "%.3f", s/NR}')"
echo "⏱  Latencia promedio de una respuesta del chat: ${PROM} s (${#LATENCIAS[@]} mensajes)"
SALUD="$(get rectora /api/ia/health)"
echo "ℹ  Proveedores al final: $(echo "$SALUD" | campo '.proveedores.map(p=>p.nombre+":"+p.estado+(p.ultimaLatenciaMs!=null?"("+p.ultimaLatenciaMs+"ms)":"")).join(", ")')"
[ "$FALLOS" -eq 0 ] && echo "✅ Recorrido completo sin fallos" || echo "❌ $FALLOS paso(s) fallaron"
exit $((FALLOS > 0))
