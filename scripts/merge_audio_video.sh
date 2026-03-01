#!/bin/bash
set -e

# =========================
# ⚡ Script para juntar audio y video
# =========================
VIDEO="$1"
AUDIO="$2"
OUTPUT="${3:-output_merged_$(date +%Y%m%d_%H%M%S).mkv}"

# Detectar formato de salida basado en extensión
if [[ "$OUTPUT" == *.mp4 ]]; then
  FORMAT="mp4"
  USE_LOSSLESS=false
elif [[ "$OUTPUT" == *.mkv ]]; then
  FORMAT="mkv"
  USE_LOSSLESS=true  # MKV soporta FLAC y otros codecs lossless
else
  FORMAT="webm"
  USE_LOSSLESS=true  # WebM permite copiar streams sin recodificar
fi

if [ -z "$VIDEO" ] || [ -z "$AUDIO" ]; then
  echo "Uso: $0 archivo_video.webm archivo_audio.mp3|wav [archivo_salida.mkv|.webm|.mp4]"
  echo ""
  echo "Ejemplo:"
  echo "  $0 hydra_recording_2024-01-01.webm sinestesia.wav"
  echo "  $0 hydra_recording_2024-01-01.webm sinestesia.wav output.mkv"
  echo ""
  echo "Formatos recomendados:"
  echo "  .mkv  - SIN PÉRDIDA (soporta FLAC/PCM, recomendado para WAV)"
  echo "  .webm - Sin degradación visual (copia directa VP8, audio Opus)"
  echo "  .mp4  - Lossless visual (H.264 lossless, audio AAC)"
  exit 1
fi

if [ ! -f "$VIDEO" ]; then
  echo "❌ Error: El archivo de video '$VIDEO' no existe"
  exit 1
fi

if [ ! -f "$AUDIO" ]; then
  echo "❌ Error: El archivo de audio '$AUDIO' no existe"
  exit 1
fi

# Verificar que ffmpeg está instalado
if ! command -v ffmpeg &> /dev/null; then
  echo "❌ Error: ffmpeg no está instalado"
  echo "   Instálalo con: sudo apt install ffmpeg"
  exit 1
fi

echo "🎬 Obteniendo duraciones..."
VIDEO_DURATION_RAW=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$VIDEO" 2>/dev/null | head -1 | tr -d '[:space:]')
AUDIO_DURATION_RAW=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$AUDIO" 2>/dev/null | head -1 | tr -d '[:space:]')

# Validar que las duraciones sean números válidos
if [ -z "$VIDEO_DURATION_RAW" ] || [ "$VIDEO_DURATION_RAW" = "N/A" ] || [ "$VIDEO_DURATION_RAW" = "nan" ]; then
  echo "⚠️  No se pudo obtener la duración del video. Usando -shortest en ffmpeg."
  VIDEO_DURATION=""
  AUDIO_DURATION=""
  USE_SHORTEST=true
else
  VIDEO_DURATION=$(awk "BEGIN {printf \"%.2f\", $VIDEO_DURATION_RAW}")
  AUDIO_DURATION=$(awk "BEGIN {printf \"%.2f\", $AUDIO_DURATION_RAW}")
  USE_SHORTEST=false
  echo "📹 Duración del video: ${VIDEO_DURATION}s"
  echo "🎵 Duración del audio: ${AUDIO_DURATION}s"
fi

# Comparar duraciones solo si las tenemos
VIDEO_TO_USE="$VIDEO"
CLEANUP_VIDEO=false

if [ "$USE_SHORTEST" = false ]; then
  CUT_AUDIO=$(awk -v v="$VIDEO_DURATION_RAW" -v a="$AUDIO_DURATION_RAW" 'BEGIN {if (v < a) print "yes"; else print "no"}')
  CUT_VIDEO=$(awk -v v="$VIDEO_DURATION_RAW" -v a="$AUDIO_DURATION_RAW" 'BEGIN {if (v > a) print "yes"; else print "no"}')
  
  if [ "$CUT_AUDIO" = "yes" ]; then
    echo "✂️  El video es más corto que el audio. Cortando audio a ${VIDEO_DURATION}s..."
    
    # Crear audio temporal cortado
    TEMP_AUDIO=$(mktemp --suffix=.mp3)
    ffmpeg -y -i "$AUDIO" -t "$VIDEO_DURATION" -c:a libmp3lame -b:a 320k "$TEMP_AUDIO" 2>/dev/null
    
    AUDIO_TO_USE="$TEMP_AUDIO"
    CLEANUP_TEMP=true
  elif [ "$CUT_VIDEO" = "yes" ]; then
    echo "✂️  El video es más largo que el audio. Cortando video a ${AUDIO_DURATION}s..."
    
    # Crear video temporal cortado
    TEMP_VIDEO=$(mktemp --suffix=.webm)
    ffmpeg -y -i "$VIDEO" -t "$AUDIO_DURATION" -c:v copy "$TEMP_VIDEO" 2>/dev/null || \
    ffmpeg -y -i "$VIDEO" -t "$AUDIO_DURATION" -c:v libvpx-vp9 "$TEMP_VIDEO" 2>/dev/null
    
    VIDEO_TO_USE="$TEMP_VIDEO"
    CLEANUP_VIDEO=true
    AUDIO_TO_USE="$AUDIO"
    CLEANUP_TEMP=false
  else
    echo "ℹ️  El audio y video tienen la misma duración. Usando ambos completos."
    AUDIO_TO_USE="$AUDIO"
    CLEANUP_TEMP=false
  fi
else
  # Si no tenemos duraciones, usar ambos completos y dejar que ffmpeg maneje con -shortest
  AUDIO_TO_USE="$AUDIO"
  CLEANUP_TEMP=false
fi

echo "🎬 Juntando audio y video..."

# Detectar codec de audio
AUDIO_CODEC=$(ffprobe -v error -select_streams a:0 -show_entries stream=codec_name -of default=noprint_wrappers=1:nokey=1 "$AUDIO_TO_USE" 2>/dev/null | head -1 | tr -d '[:space:]')

# Si el audio es WAV/PCM y el formato es webm, cambiar automáticamente a MKV para mantener sin pérdida
if [[ "$AUDIO_CODEC" == pcm* ]] && [ "$FORMAT" = "webm" ]; then
  echo "⚠️  WAV/PCM detectado. WebM no soporta PCM sin pérdida."
  echo "   Cambiando automáticamente a MKV con FLAC (SIN PÉRDIDA)..."
  OUTPUT="${OUTPUT%.webm}.mkv"
  FORMAT="mkv"
fi

if [ "$FORMAT" = "mkv" ]; then
  # MKV: Soporta FLAC lossless y PCM, perfecto para WAV sin pérdida
  if [[ "$AUDIO_CODEC" == pcm* ]]; then
    echo "   (Copiando video, convirtiendo WAV/PCM a FLAC - SIN PÉRDIDA)..."
    ffmpeg -y \
      -fflags +genpts \
      -i "$VIDEO_TO_USE" \
      -i "$AUDIO_TO_USE" \
      -map 0:v:0 \
      -map 1:a:0 \
      -c:v copy \
      -c:a flac \
      -compression_level 12 \
      ${USE_SHORTEST:+-shortest} \
      "$OUTPUT"
  else
    # Si no es PCM, copiar directamente (ya es compatible)
    echo "   (Copiando streams directamente - SIN DEGRADACIÓN)..."
    ffmpeg -y \
      -fflags +genpts \
      -i "$VIDEO_TO_USE" \
      -i "$AUDIO_TO_USE" \
      -map 0:v:0 \
      -map 1:a:0 \
      -c:v copy \
      -c:a copy \
      ${USE_SHORTEST:+-shortest} \
      "$OUTPUT"
  fi
elif [ "$FORMAT" = "webm" ]; then
  # WebM: Copiar video directamente, pero recodificar audio MP3 a Opus (alta calidad)
  if [ "$AUDIO_CODEC" = "mp3" ]; then
    echo "   (Copiando video, recodificando MP3 a Opus 320k - MÁXIMA CALIDAD)..."
    ffmpeg -y \
      -fflags +genpts \
      -i "$VIDEO_TO_USE" \
      -i "$AUDIO_TO_USE" \
      -map 0:v:0 \
      -map 1:a:0 \
      -c:v copy \
      -c:a libopus \
      -b:a 320k \
      -application audio \
      ${USE_SHORTEST:+-shortest} \
      "$OUTPUT"
  else
    # Si el audio ya es Opus o Vorbis, copiar directamente
    echo "   (Copiando streams directamente - SIN DEGRADACIÓN)..."
    ffmpeg -y \
      -fflags +genpts \
      -i "$VIDEO_TO_USE" \
      -i "$AUDIO_TO_USE" \
      -map 0:v:0 \
      -map 1:a:0 \
      -c:v copy \
      -c:a copy \
      ${USE_SHORTEST:+-shortest} \
      "$OUTPUT"
  fi
else
  # MP4: Usar codecs lossless para evitar degradación visual
  echo "   (Recodificando a MP4 con codecs lossless - SIN PÉRDIDA VISUAL)..."
  ffmpeg -y \
    -fflags +genpts \
    -i "$VIDEO_TO_USE" \
    -i "$AUDIO_TO_USE" \
    -map 0:v:0 \
    -map 1:a:0 \
    -vf "scale=iw:-2" \
    -vsync vfr \
    -c:v libx264 \
    -preset veryslow \
    -qp 0 \
    -pix_fmt yuv420p \
    -c:a copy \
    ${USE_SHORTEST:+-shortest} \
    "$OUTPUT"
fi

# Limpiar archivos temporales si se crearon
if [ "$CLEANUP_TEMP" = true ]; then
  rm -f "$TEMP_AUDIO"
fi
if [ "$CLEANUP_VIDEO" = true ]; then
  rm -f "$TEMP_VIDEO"
fi

echo ""
echo "✅ Video final generado: $OUTPUT"
echo ""

