#!/bin/bash

PORT=8123
AUDIO=${1:-sosiego.wav}

# --- FUNCIÓN DE SALIDA ---
cleanup() {
    echo -e "\n[!] Deteniendo servidor Hydra..."
    if [ ! -z "$PYTHON_PID" ]; then
        kill $PYTHON_PID 2>/dev/null
        echo "[+] Servidor (PID $PYTHON_PID) detenido correctamente."
    fi
    exit
}

# Capturamos interrupciones normales (Ctrl+C) y cierre de terminal
trap cleanup SIGINT SIGTERM SIGHUP

# =============================================================
# 1. LIMPIEZA AUTOMÁTICA (La solución real)
# =============================================================
# Buscamos si hay algo en el puerto y lo matamos antes de empezar
OCUPADO=$(lsof -i:$PORT -sTCP:LISTEN -t)
if [ ! -z "$OCUPADO" ]; then
    echo "🧹 El puerto $PORT estaba ocupado por el PID $OCUPADO. Limpiando..."
    kill -9 $OCUPADO 2>/dev/null
    sleep 1 # Pausa breve para asegurar que el socket se libere
fi

# 2. Generar archivo de configuración con el audio
echo "// Configuración de audio generada por serve.sh" > audio-config.js
echo "window.AUDIO_FILE = \"$AUDIO\";" >> audio-config.js
echo "✅ Archivo de audio configurado: $AUDIO"

# 3. Lanzar el servidor en SEGUNDO PLANO
echo "🚀 Iniciando servidor en http://localhost:$PORT..."
python3 -m http.server $PORT & 

# 4. GUARDAR EL PID
PYTHON_PID=$!
echo "[i] PID del servidor: $PYTHON_PID"
echo ""
echo "🌐 Abre en tu navegador:"
echo "   http://localhost:$PORT/"
echo ""

# Esperamos al proceso
wait $PYTHON_PID