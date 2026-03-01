// ============================================================================
//   SISTEMA DE VISUALIZACIÓN DE BAJO - CONTROL DE RANGO
// ============================================================================

// 1. ¡DEFINE TU RANGO AQUÍ! 
// ---------------------------------------------------------
const RANGO_INTERES = { 
  min: 10,  // Frecuencia mínima (Hz)
  max: 35   // Frecuencia máxima (Hz)
};
// ---------------------------------------------------------

const CONFIG = {
  inputGain: 2.25,       // Ganancia de entrada (Subir si no detecta, Bajar si satura)
  decay: 0.99,          // Velocidad de desvanecimiento (0.8 = Rápido, 0.98 = Lento)
  noiseFloor: 0.45       // Ignorar sonidos por debajo de este volumen (0.0 a 1.0)
};

// 2. ESTADO DEL MOTOR
const ENGINE = {
  val: 0,       // Valor visual (suavizado)
  raw: 0,       // Valor crudo
  freq: 0,      // Hz detectados
  tone: 0       // Color (0.0 = inicio del rango, 1.0 = final del rango)
};

// ============================================================================
//   3. SETUP INICIAL
// ============================================================================
const canvas = document.getElementById("hydra-canvas");
const audio = document.getElementById("main-audio");
const hud = document.getElementById("debugHUD"); 
const params = new URLSearchParams(window.location.search);

const hydra = new Hydra({ canvas, detectAudio: false, makeGlobal: true });

// Función de resize que considera devicePixelRatio para máxima calidad
const resize = () => {
  const dpr = window.devicePixelRatio || 1;
  const width = window.innerWidth;
  const height = window.innerHeight;
  
  // Establecer el tamaño físico del canvas (considerando DPR)
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = width + 'px';
  canvas.style.height = height + 'px';
  
  // Configurar Hydra a la resolución física completa
  hydra.setResolution(canvas.width, canvas.height);
  
  console.log(`📐 Resolución: ${canvas.width}x${canvas.height} (DPR: ${dpr})`);
};

window.addEventListener("resize", resize);
resize();

audio.src = params.get("src") || (window.AUDIO_FILE || "./sinestesia.wav");
audio.crossOrigin = "anonymous";

// Variables Audio
let audioCtx, analyser, dataArray, source, gainNode;
let initialized = false;

// ============================================================================
//   4. MOTOR DE AUDIO (ADAPTATIVO)
// ============================================================================
function initAudioStack() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  audioCtx = new AudioContext();

  analyser = audioCtx.createAnalyser();
  // Usamos 16384 para tener precisión incluso si eliges un rango muy pequeño (ej. 30-40hz)
  analyser.fftSize = 16384; 
  analyser.smoothingTimeConstant = 0.0; // Reactividad inmediata
  analyser.minDecibels = -45;
  analyser.maxDecibels = -10;
  dataArray = new Float32Array(analyser.frequencyBinCount);

  gainNode = audioCtx.createGain();
  gainNode.gain.value = CONFIG.inputGain;

  source = audioCtx.createMediaElementSource(audio);
  source.connect(audioCtx.destination);
  source.connect(gainNode);             
  gainNode.connect(analyser);          

  initialized = true;
  console.log(`🚀 RANGO DE INTERÉS: ${RANGO_INTERES.min}Hz - ${RANGO_INTERES.max}Hz`);
}

audio.onplay = async () => {
  if (!initialized) initAudioStack();
  if (audioCtx.state === "suspended") await audioCtx.resume();
};

// ============================================================================
//   5. LOOP DE PROCESAMIENTO
// ============================================================================
const map = (v, x1, y1, x2, y2) => (v - x1) * (y2 - x2) / (y1 - x1) + x2;
const clamp = (v, min, max) => Math.max(min, Math.min(v, max));

function processingLoop() {
  if (initialized && !audio.paused) {
    analyser.getFloatFrequencyData(dataArray);
    const binSize = audioCtx.sampleRate / analyser.fftSize;
    
    // Calcular bins basados en TU variable RANGO_INTERES
    const startBin = Math.floor(RANGO_INTERES.min / binSize);
    const endBin = Math.floor(RANGO_INTERES.max / binSize);
    
    let maxDb = -Infinity;
    let maxIndex = -1;

    // Buscar el pico SOLO dentro de tu rango
    for (let i = startBin; i <= endBin; i++) {
      const db = dataArray[i];
      if (db > maxDb) {
        maxDb = db;
        maxIndex = i;
      }
    }
    
    // Normalizar volumen
    let currentAmp = map(maxDb, -70, -10, 0, 1);
    currentAmp = clamp(currentAmp, 0, 1);
    
    // Gate (Puerta de ruido)
    if (currentAmp < CONFIG.noiseFloor) currentAmp = 0;

    // ATAQUE INSTANTÁNEO (Sin suavizado al subir)
    if (currentAmp > ENGINE.val) {
       ENGINE.val = currentAmp; 
    } else {
       ENGINE.val *= CONFIG.decay; // Decaimiento suave
    }
    
    // Calcular Color basado en TU rango
    if (currentAmp > 0.1) {
      const freq = maxIndex * binSize;
      ENGINE.freq = freq;
      // Mapear color: MinHz = 0, MaxHz = 1
      ENGINE.tone = clamp(map(freq, RANGO_INTERES.min, RANGO_INTERES.max, 0, 1), 0, 1);
    }
    
    ENGINE.raw = currentAmp;
  }

  updateHUD();
  requestAnimationFrame(processingLoop);
}

// ============================================================================
//   6. HUD
// ============================================================================
function updateHUD() {
  if (!hud) return;
  const bar = (v) => "█".repeat(Math.floor(v * 20)).padEnd(20, "░");
  const active = ENGINE.val > 0.2 ? "<b style='color:#0f0'>ACTIVE</b>" : "<span style='color:#555'>...</span>";
  
  hud.innerHTML = `
    <div style="background:#000; color:#0f0; font-family:monospace; padding:10px; border:1px solid #0f0;">
      RANGO CONFIGURADO: ${RANGO_INTERES.min} Hz - ${RANGO_INTERES.max} Hz<br>
      -----------------------------------<br>
      DETECT: ${active}<br>
      FORCE : [${bar(ENGINE.val)}]<br>
      FREQ  : ${ENGINE.freq.toFixed(1)} Hz<br>
      COLOR : ${ENGINE.tone.toFixed(2)}<br>
      -----------------------------------<br>
      Input Gain: x${CONFIG.inputGain}
    </div>
  `;
}

// ============================================================================
//   7. HYDRA PATCH: "VIBRATING VOID" (Inspirado en tu original)
// ============================================================================

// Control de blend reactivo al bajo
function bassBlend() {
  // ENGINE.val ∈ [0,1]
  // Bajo fuerte → blend pequeño
  // Silencio → blend grande
  return clamp(1 - ENGINE.val * 1.2, 0.5, 0.9)
}

speed = 0.5

noise(3, 0.02)
  .modulateScrollY(osc(0.5), () => bassBlend() * 0.3)
  .color(
    () => 0.1 - bassBlend() * 0.05,
    () => 0.7 - bassBlend() * 0.08,
    () => 0.5 - bassBlend() * 0.01
  )
  .colorama(0.1)
  .luma(0.59, 0.1)
  .modulatePixelate(noise(3), 500)
  .blend(src(o0).scale(1.002), 0.9)
  .out(o0)

processingLoop();