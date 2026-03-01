// ===================== 1. VARIABLES GLOBALES Y UTILIDADES =====================
let initialized = false;
let time = 0;
const fps = 60;
const dt = 1 / fps;

// Variables de Audio
let audioCtx, analyser, dataArray, source, lowPassFilter;
// Objeto para guardar el estado del bajo en tiempo real
const BASS_STATE = {
  amp: 0,       // Volumen suavizado del bajo (0.0 a 1.0)
  rawAmp: 0,    // Volumen crudo
  freq: 0,      // Frecuencia dominante detectada (Hz)
  normFreq: 0   // Frecuencia normalizada (0.0 = 20Hz, 1.0 = 60Hz) para colores
};

// Función de suavizado (Linear Interpolation)
const lerp = (start, end, amt) => (1 - amt) * start + amt * end;

// Mapeo de valores
const map = (value, x1, y1, x2, y2) => (value - x1) * (y2 - x2) / (y1 - x1) + x2;

// ===================== 2. CONFIGURACIÓN HYDRA =====================
const canvas = document.getElementById("hydra-canvas");
const audio = document.getElementById("main-audio");
const params = new URLSearchParams(window.location.search);

// Setup de Hydra
const hydra = new Hydra({ canvas, detectAudio: false, makeGlobal: true });

const resize = () => {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  hydra.setResolution(canvas.width, canvas.height);
};
window.addEventListener("resize", resize);
resize();

// Carga de Audio
audio.src = params.get("src") || (window.AUDIO_FILE || "./sinestesia.wav");
audio.crossOrigin = "anonymous";

// ===================== 3. MOTOR DE AUDIO ROBUSTO =====================
function initAudio() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  audioCtx = new AudioContext();

  // 1. Crear Analizador con MÁXIMA resolución posible
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 16384; 
  // fftSize 16384 @ 44100Hz = ~2.7 Hz por bin. 
  // Esto es crucial para diferenciar notas graves.
  
  analyser.smoothingTimeConstant = 0.5; // Suavizado interno del FFT
  // Usamos Float32 para mayor precisión en dB que Uint8
  dataArray = new Float32Array(analyser.frequencyBinCount);

  // 2. Crear Filtro LowPass (Aislar graves físicamente antes de analizar)
  // Esto elimina armónicos de guitarra/voz que podrían "colarse" como ruido.
  lowPassFilter = audioCtx.createBiquadFilter();
  lowPassFilter.type = "lowpass";
  lowPassFilter.frequency.value = 150; // Cortamos todo arriba de 150Hz para el analizador

  source = audioCtx.createMediaElementSource(audio);

  // 3. RUTEO DE CABLES
  // Camino A: Audio -> Altavoces (Sin filtrar para que se escuche bien)
  source.connect(audioCtx.destination);
  
  // Camino B: Audio -> Filtro -> Analizador (Solo para detección)
  source.connect(lowPassFilter);
  lowPassFilter.connect(analyser);

  initialized = true;
  console.log("Audio System: Bass Detection Online");
}

audio.onplay = async () => {
  if (!initialized) initAudio();
  if (audioCtx.state === "suspended") await audioCtx.resume();
};

// ===================== 4. ALGORITMO DE DETECCIÓN DE BAJO (20-60HZ) =====================
function analyzeBass() {
  analyser.getFloatFrequencyData(dataArray);

  const sampleRate = audioCtx.sampleRate;
  const binSize = sampleRate / analyser.fftSize; // aprox 2.7 Hz

  // Definir rango estricto de búsqueda (20Hz a 60Hz)
  const startBin = Math.floor(20 / binSize);
  const endBin = Math.ceil(70 / binSize); // Vamos un poco más arriba (70) para capturar el ataque

  let maxDb = -Infinity;
  let maxBinIndex = -1;
  let totalEnergy = 0;

  // Recorremos solo los bins de graves
  for (let i = startBin; i <= endBin; i++) {
    const db = dataArray[i];
    
    // Filtro de ruido base (si es menos de -100dB, es silencio)
    if (db > -100) {
      // Sumar energía para calcular volumen general del bajo
      // Convertir dB a amplitud lineal aproximada para sumar
      totalEnergy += Math.pow(10, db / 20); 

      // Buscar el pico más alto (La nota fundamental)
      if (db > maxDb) {
        maxDb = db;
        maxBinIndex = i;
      }
    }
  }

  // A. CALCULAR AMPLITUD (VOLUMEN)
  // Normalizamos el pico de dB. Usualmente va de -100 a -30 (muy fuerte)
  // Mapeamos -90db a -30db hacia 0.0 a 1.0
  let currentAmp = map(maxDb, -90, -30, 0, 1);
  currentAmp = Math.max(0, Math.min(currentAmp, 1)); // Clamp 0-1

  // B. CALCULAR FRECUENCIA (NOTA)
  let currentFreq = 0;
  if (maxBinIndex > 0) {
    currentFreq = maxBinIndex * binSize;
  }

  // C. NORMALIZAR FRECUENCIA PARA COLOR (0.0 = 20Hz, 1.0 = 60Hz)
  let freqNorm = map(currentFreq, 20, 60, 0, 1);
  freqNorm = Math.max(0, Math.min(freqNorm, 1));

  // D. ACTUALIZAR ESTADO GLOBAL CON SUAVIZADO (SMOOTHING)
  // Usamos lerp para que los valores no salten bruscamente
  // 0.1 = lento (líquido), 0.5 = rápido (reactivo)
  BASS_STATE.rawAmp = currentAmp;
  BASS_STATE.amp = lerp(BASS_STATE.amp, currentAmp, 0.2); 
  BASS_STATE.freq = currentFreq;
  BASS_STATE.normFreq = lerp(BASS_STATE.normFreq, freqNorm, 0.1);
}

// ===================== 5. LOOP PRINCIPAL =====================
function updateTime() {
  time += dt;
  if (initialized && !audio.paused) {
    analyzeBass();
    updateHUD();
  }
  requestAnimationFrame(updateTime);
}
updateTime();

// ===================== 6. HUD DE DEPURACIÓN (VISUALIZAR DATOS) =====================
const hud = document.getElementById("debugHUD"); // Asegúrate de tener este DIV en tu HTML

function updateHUD() {
  if (!hud) return;
  const bar = (v) => "█".repeat(Math.floor(v * 20)).padEnd(20, "░");
  
  hud.innerHTML = `
    <div style="font-family: monospace; color: lime; background: rgba(0,0,0,0.5); padding: 10px;">
      STATUS: ${initialized ? "RUNNING" : "WAITING"}<br>
      ----------------------------------<br>
      BASS FREQ: ${BASS_STATE.freq.toFixed(2)} Hz<br>
      NOTE COLOR: [${bar(BASS_STATE.normFreq)}]<br>
      BASS AMP : [${bar(BASS_STATE.amp)}]<br>
      ----------------------------------<br>
      Resolución FFT: ${(audioCtx.sampleRate/analyser.fftSize).toFixed(2)} Hz/bin
    </div>
  `;
}

// ===================== 7. PATCH HYDRA (CORREGIDO) =====================

// Definimos funciones helper para usar dentro de Hydra
// Devuelve la amplitud del bajo suavizada con un multiplicador
const bass = () => BASS_STATE.amp * 3; 

// Devuelve un color basado en la nota (0.0 = grave/azul, 1.0 = agudo/rojo)
const tone = () => BASS_STATE.normFreq; 

// --- DISEÑO VISUAL ---
solid(0,0,0)
  .add(
    // CAPA 1: Figuras geométricas principales
    shape(4, 0.5)
    .color(() => 0.2 + tone(), 0.5, () => 1 - tone()) // Color reactivo a la nota Hz
    .scale(() => 1 + bass()) // Tamaño reactivo al volumen del bajo
    .repeat(2,2)
    .modulateScale(osc(10, 0.1), () => bass() * 0.5)
    .scrollX(0.1, 0.01)
  )
  .add(
    // CAPA 2: Textura de ruido (CORREGIDA)
    noise(3, 0.1)
    .contrast(10) // <--- REEMPLAZO DE THRESHOLD: Contraste alto hace el mismo efecto
    .color(1, 1, 1)
    .mask(shape(4, 0.2).scale(() => bass() * 2)) // La máscara revela el ruido con el bajo
    , 0.4 // Opacidad de mezcla
  )
  // CAPA 3: Feedback y efectos finales
  .modulate(o0, () => bass() * 0.1) // Distorsión líquida basada en el bajo
  .scale(0.98) // Zoom out constante para crear estela
  .out(o0);