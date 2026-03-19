#!/usr/bin/env bash

PORT=8123
MODE=record
AUDIO="sosiego.wav"

# Uso:
#   ./scripts/serve.sh                    → record, audio por defecto
#   ./scripts/serve.sh live               → modo tiempo real (live.html)
#   ./scripts/serve.sh mi.wav             → record con archivo (compatibilidad)
#   ./scripts/serve.sh record mi.wav      → explícito
#   OPEN_LIVE_BROWSER=1 ./scripts/serve.sh live → intenta abrir el navegador

if [ "${1:-}" = "live" ]; then
  MODE=live
  shift
elif [ "${1:-}" = "record" ]; then
  MODE=record
  shift
fi

if [ -n "${1:-}" ]; then
  AUDIO="$1"
fi

cleanup() {
  echo -e "\n[!] Deteniendo servidor Hydra..."
  if [ -n "${PYTHON_PID:-}" ]; then
    kill "$PYTHON_PID" 2>/dev/null
    echo "[+] Servidor (PID $PYTHON_PID) detenido correctamente."
  fi
  exit 0
}

trap cleanup SIGINT SIGTERM SIGHUP

OCUPADO=$(lsof -i:"$PORT" -sTCP:LISTEN -t 2>/dev/null || true)
if [ -n "$OCUPADO" ]; then
  echo "🧹 El puerto $PORT estaba ocupado por el PID $OCUPADO. Limpiando..."
  kill -9 $OCUPADO 2>/dev/null || true
  sleep 1
fi

if [ "$MODE" = "live" ]; then
  echo "// Configuración generada por serve.sh (modo live)" > audio-config.js
  echo 'window.AUDIO_FILE = "";' >> audio-config.js
  echo "✅ Modo live (sin archivo de audio fijo)"
else
  echo "// Configuración de audio generada por serve.sh" > audio-config.js
  echo "window.AUDIO_FILE = \"$AUDIO\";" >> audio-config.js
  echo "✅ Archivo de audio configurado: $AUDIO"
fi

echo "🚀 Iniciando servidor en http://localhost:$PORT/ ..."
python3 -m http.server "$PORT" &
PYTHON_PID=$!
echo "[i] PID del servidor: $PYTHON_PID"
echo ""

if [ "$MODE" = "live" ]; then
  echo "🎙️  Modo LIVE: abre en el navegador:"
  echo "   http://localhost:$PORT/live.html"
  echo ""
  if [ "${OPEN_LIVE_BROWSER:-0}" = "1" ]; then
    URL="http://localhost:$PORT/live.html"
    ( sleep 1
      if command -v xdg-open >/dev/null 2>&1; then
        xdg-open "$URL" >/dev/null 2>&1 || true
      elif command -v wslview >/dev/null 2>&1; then
        wslview "$URL" >/dev/null 2>&1 || true
      fi
    ) &
    echo "   (OPEN_LIVE_BROWSER=1 → intentando abrir URL)"
  fi
else
  echo "🌐 Modo grabación / archivo: abre en el navegador:"
  echo "   http://localhost:$PORT/"
  echo ""
fi

wait "$PYTHON_PID"
