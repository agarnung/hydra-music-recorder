// ===================== 1. VARIABLES GLOBALES =====================
let initialized = false;
let time = 0;
const fps = 60;
const dt = 1 / fps;

let audioCtx, analyser, dataArray, source;
let BINS = {};
let sampleRate = 44100;

// Sistema de detección mejorado
const detectionSystem = {
  dominantFreq: 0,
  spectralCentroid: 0,
  noiseFloor: 0.01,
  energyHistory: [],
  fundamentalFreq: 0,
  confidence: 0,
  
  // Filtros de mediana para estabilidad
  freqHistory: new Array(5).fill(0),
  noiseHistory: new Array(10).fill(0.01),
  
  // Configuración de bandas optimizada para bajo
  BANDAS_HZ: {
    infra: [16, 32],      // Solo los verdaderos infra-graves
    sub: [32, 64],        // Sub-graves principales (kick drums)
    bajo: [64, 160],      // Bajos musicales (E1 ~41Hz a E3 ~165Hz)
    cuerpo: [160, 400],   // Armónicos de bajo/tono medio
    medio: [400, 2000],   // Voces, guitarras
    agudo: [2000, 6000]   // Brillos, hi-hats
  }
};

const peaks = {
  infra: 0, sub: 0, bajo: 0,
  cuerpo: 0, medio: 0, agudo: 0
};

// ===================== NUEVO: SISTEMA DE IMPULSOS MANUALES =====================
const manualImpulseSystem = {
  // Frecuencias específicas para cada tecla numérica
  frequencies: {
    '1': 20,    // Infra grave
    '2': 30,    // Infra
    '3': 40,    // Sub grave
    '4': 50,    // Sub
    '5': 60,    // Sub medio
    '6': 80,    // Bajo grave
    '7': 100,   // Bajo
    '8': 120,   // Bajo medio
    '9': 150,   // Bajo agudo
    '0': 200,   // Cuerpo bajo
    '.': 250    // Cuerpo medio
  },
  
  // Estado de activación
  activeImpulses: {},
  
  // Historial de activaciones
  activationHistory: [],
  
  // Inicializar
  init() {
    // Inicializar todas las teclas como inactivas
    Object.keys(this.frequencies).forEach(key => {
      this.activeImpulses[key] = {
        active: false,
        startTime: 0,
        intensity: 1.0
      };
    });
    
    // Configurar listeners de teclado
    this.setupKeyboardListeners();
    console.log("Sistema de impulsos manuales inicializado");
  },
  
  // Configurar listeners del teclado
  setupKeyboardListeners() {
    document.addEventListener('keydown', (e) => {
      const key = e.key;
      
      // Solo procesar teclas numéricas y el punto
      if (this.frequencies.hasOwnProperty(key)) {
        e.preventDefault();
        
        // Activar impulso
        this.activateImpulse(key);
        
        // Mostrar en consola
        const freq = this.frequencies[key];
        console.log(`🔥 IMPULSO MANUAL: Tecla ${key} - ${freq}Hz`);
      }
      
      // Teclas de control adicionales
      switch(key) {
        case '+':
          // Aumentar intensidad de todos los impulsos
          this.adjustIntensity(1.2);
          break;
        case '-':
          // Disminuir intensidad
          this.adjustIntensity(0.8);
          break;
        case 'r':
          // Resetear sistema
          this.reset();
          break;
      }
    });
    
    document.addEventListener('keyup', (e) => {
      const key = e.key;
      if (this.frequencies.hasOwnProperty(key)) {
        // Desactivar impulso cuando se suelta la tecla
        this.deactivateImpulse(key);
      }
    });
  },
  
  // Activar un impulso
  activateImpulse(key) {
    if (!this.activeImpulse) return;
    
    this.activeImpulses[key] = {
      active: true,
      startTime: time,
      intensity: 1.0
    };
    
    // Añadir al historial
    this.activationHistory.push({
      key,
      frequency: this.frequencies[key],
      time: time
    });
    
    // Limitar historial a 50 eventos
    if (this.activationHistory.length > 50) {
      this.activationHistory.shift();
    }
  },
  
  // Desactivar un impulso
  deactivateImpulse(key) {
    if (this.activeImpulses[key]) {
      this.activeImpulses[key].active = false;
    }
  },
  
  // Obtener impulso activo más reciente
  getActiveImpulse() {
    let latestImpulse = null;
    let latestTime = 0;
    
    Object.entries(this.activeImpulses).forEach(([key, impulse]) => {
      if (impulse.active && impulse.startTime > latestTime) {
        latestTime = impulse.startTime;
        latestImpulse = {
          key,
          frequency: this.frequencies[key],
          ...impulse
        };
      }
    });
    
    return latestImpulse;
  },
  
  // Obtener todos los impulsos activos
  getAllActiveImpulses() {
    const active = [];
    Object.entries(this.activeImpulses).forEach(([key, impulse]) => {
      if (impulse.active) {
        active.push({
          key,
          frequency: this.frequencies[key],
          ...impulse
        });
      }
    });
    return active;
  },
  
  // Ajustar intensidad de todos los impulsos
  adjustIntensity(factor) {
    Object.values(this.activeImpulses).forEach(impulse => {
      impulse.intensity *= factor;
      impulse.intensity = Math.max(0.1, Math.min(5.0, impulse.intensity));
    });
    console.log(`Intensidad ajustada: factor ${factor}`);
  },
  
  // Resetear sistema
  reset() {
    Object.keys(this.activeImpulses).forEach(key => {
      this.activeImpulses[key] = {
        active: false,
        startTime: 0,
        intensity: 1.0
      };
    });
    console.log("Sistema de impulsos manuales reseteado");
  },
  
  // Actualizar estado (llamar cada frame)
  update() {
    // Puedes añadir lógica de decaimiento aquí si quieres
    // que los impulsos duren cierto tiempo después de soltar la tecla
  }
};

// ===================== 2. SISTEMA DE FILTRADO ESPECTRAL AVANZADO =====================
class AdvancedSpectralProcessor {
  constructor(bandConfig) {
    this.band = bandConfig;
    this.maxSeen = 0.001;
    this.decay = 0.99;
    this.value = 0;
    this.history = new Array(3).fill(0);
  }

  process(dataArray, binHz, totalEnergy) {
    const { min, max, name } = this.band;
    
    // 1. Calcular energía cruda de la banda
    let rawEnergy = 0;
    for (let i = min; i < max; i++) {
      rawEnergy += dataArray[i];
    }
    
    // 2. Aplicar filtro de ruido adaptativo
    const noiseThreshold = detectionSystem.noiseFloor * (max - min) * 1.2;
    if (rawEnergy < noiseThreshold) return 0;
    
    // 3. Para bandas graves: filtrado especial
    if (name === 'infra' || name === 'sub' || name === 'bajo') {
      return this.processLowBand(dataArray, rawEnergy, binHz, totalEnergy);
    }
    
    // 4. Para bandas medias/altas: procesamiento estándar
    return this.processStandardBand(dataArray, rawEnergy);
  }

  processLowBand(dataArray, rawEnergy, binHz, totalEnergy) {
    const { min, max, name } = this.band;
    
    // Buscar pico más bajo en la banda
    let peakEnergy = 0;
    let peakBin = min;
    
    for (let i = min; i < Math.min(max, min + 20); i++) {
      if (dataArray[i] > peakEnergy) {
        peakEnergy = dataArray[i];
        peakBin = i;
      }
    }
    
    // Calcular energía alrededor del pico
    const windowStart = Math.max(min, peakBin - 2);
    const windowEnd = Math.min(max, peakBin + 3);
    let windowEnergy = 0;
    
    for (let i = windowStart; i < windowEnd; i++) {
      windowEnergy += dataArray[i];
    }
    
    const concentration = windowEnergy / rawEnergy;
    if (concentration < 0.4) return 0;
    
    // Auto-gain adaptativo
    if (windowEnergy > this.maxSeen) {
      this.maxSeen = windowEnergy * 0.7 + this.maxSeen * 0.3;
    } else {
      this.maxSeen *= this.decay;
      if (this.maxSeen < 0.001) this.maxSeen = 0.001;
    }
    
    let normalized = windowEnergy / this.maxSeen;
    
    // Suavizado temporal
    this.history.shift();
    this.history.push(normalized);
    const smoothed = this.history.reduce((a, b) => a + b) / this.history.length;
    
    const dynamicThreshold = 0.05 + (totalEnergy * 0.02);
    
    return smoothed > dynamicThreshold ? 
      Math.pow(smoothed, 1.5) * concentration : 0;
  }

  processStandardBand(dataArray, rawEnergy) {
    if (rawEnergy > this.maxSeen) {
      this.maxSeen = rawEnergy * 0.8 + this.maxSeen * 0.2;
    } else {
      this.maxSeen *= this.decay;
    }
    
    if (this.maxSeen < 0.001) this.maxSeen = 0.001;
    
    let normalized = rawEnergy / this.maxSeen;
    
    this.history.shift();
    this.history.push(normalized);
    const smoothed = this.history.reduce((a, b) => a + b) / this.history.length;
    
    return smoothed > 0.05 ? Math.pow(smoothed, 1.2) : 0;
  }
}

// ===================== 3. DETECTOR DE TRANSITORIOS MEJORADO =====================
class EnhancedImpulseDetector {
  constructor(config) {
    this.config = config;
    this.reset();
    
    this.energyBuffer = new Array(5).fill(0);
    this.riseBuffer = new Array(3).fill(0);
    this.confidence = 0;
    
    this.lastTriggerTime = 0;
    this.triggerCount = 0;
    this.manualOverride = 0; // Para impulsos manuales
  }

  reset() {
    this.value = 0;
    this.cooldown = 0;
    this.smoothSignal = 0;
    this.rise = 0;
    this.manualOverride = 0;
  }

  // Método para activación manual
  triggerManual(intensity = 1.0) {
    this.value = intensity;
    this.cooldown = this.config.cooldown;
    this.lastTriggerTime = time;
    this.manualOverride = intensity;
    console.log(`[${this.config.band.toUpperCase()}] TRIGGER MANUAL: ${intensity.toFixed(2)}`);
  }

  update(rawInput, bandEnergy, totalEnergy, fundamentalFreq, currentTime) {
    const cfg = this.config;
    
    // 1. Aplicar override manual si existe
    if (this.manualOverride > 0) {
      this.value = this.manualOverride;
      this.manualOverride *= 0.9; // Decaimiento rápido
      if (this.manualOverride < 0.01) this.manualOverride = 0;
      return;
    }
    
    // 2. Actualizar buffer de energía
    this.energyBuffer.shift();
    this.energyBuffer.push(rawInput);
    
    // 3. Suavizado
    const smoothFactor = rawInput > this.smoothSignal ? 0.3 : 0.1;
    this.smoothSignal = this.smoothSignal * (1 - smoothFactor) + rawInput * smoothFactor;
    
    // 4. Calcular pendiente
    const recentEnergy = this.energyBuffer.slice(-3);
    const avgRecent = recentEnergy.reduce((a, b) => a + b) / recentEnergy.length;
    const oldEnergy = this.energyBuffer[0];
    this.rise = avgRecent - oldEnergy;
    
    // 5. Actualizar buffer de pendientes
    this.riseBuffer.shift();
    this.riseBuffer.push(this.rise);
    
    // 6. Verificar condiciones simplificadas
    const isRising = this.rise > cfg.threshold;
    const isAboveMin = this.smoothSignal > cfg.minLevel;
    const hasEnergy = bandEnergy > cfg.energyRatio;
    const notInCooldown = this.cooldown <= 0;
    const consistentRise = this.checkConsistentRise();
    
    // 7. Sistema de confianza simple
    const conditionsMet = [isRising, isAboveMin, hasEnergy, notInCooldown, consistentRise];
    const metCount = conditionsMet.filter(c => c).length;
    this.confidence = metCount / conditionsMet.length;
    
    // 8. Disparar si se cumplen condiciones
    if (isRising && isAboveMin && hasEnergy && notInCooldown && this.confidence > 0.6) {
      const intensity = Math.min(1.0, this.rise * 3);
      this.value = intensity;
      this.cooldown = cfg.cooldown;
      this.lastTriggerTime = currentTime;
      this.triggerCount++;
    }
    
    // 9. Decaimiento
    this.value *= cfg.decay;
    if (this.value < 0.001) this.value = 0;
    
    // 10. Actualizar cooldown
    if (this.cooldown > 0) {
      this.cooldown -= dt;
      if (this.cooldown < 0) this.cooldown = 0;
    }
  }

  checkConsistentRise() {
    const positiveRises = this.riseBuffer.filter(r => r > 0).length;
    return positiveRises >= 2;
  }
}

// ===================== 4. INICIALIZACIÓN DE SISTEMA =====================
const bandProcessors = {};
const impulseDetectors = {};

// Configuración más sensible
const detectorConfigs = {
  infra: {
    band: 'infra',
    threshold: 0.05,      // Mucho más bajo
    minLevel: 0.05,       // Mucho más bajo
    cooldown: 0.5,        // Más corto
    decay: 0.92,
    energyRatio: 0.1,     // Más bajo
    minInterval: 0.3      // Más corto
  },
  sub: {
    band: 'sub',
    threshold: 0.04,
    minLevel: 0.04,
    cooldown: 0.4,
    decay: 0.94,
    energyRatio: 0.08,
    minInterval: 0.2
  },
  bajo: {
    band: 'bajo',
    threshold: 0.03,
    minLevel: 0.03,
    cooldown: 0.3,
    decay: 0.96,
    energyRatio: 0.06,
    minInterval: 0.15
  },
  cuerpo: {
    band: 'cuerpo',
    threshold: 0.02,
    minLevel: 0.02,
    cooldown: 0.2,
    decay: 0.97,
    energyRatio: 0.05,
    minInterval: 0.1
  },
  medio: {
    band: 'medio',
    threshold: 0.01,
    minLevel: 0.01,
    cooldown: 0.15,
    decay: 0.98,
    energyRatio: 0.04,
    minInterval: 0.08
  },
  agudo: {
    band: 'agudo',
    threshold: 0.008,
    minLevel: 0.008,
    cooldown: 0.1,
    decay: 0.99,
    energyRatio: 0.03,
    minInterval: 0.05
  }
};

// ===================== 5. SISTEMA DE ANÁLISIS ESPECTRAL =====================
class SpectralAnalyzer {
  constructor() {
    this.fundamentalCache = {
      freq: 0,
      confidence: 0,
      timestamp: 0,
      history: new Array(5).fill(0)
    };
  }

  analyze(dataArray, sampleRate, fftSize) {
    const binHz = sampleRate / fftSize;
    const normalizedData = Array.from(dataArray).map(v => v / 255);
    
    // Calcular noise floor
    const noiseFloor = this.calculateNoiseFloor(normalizedData, binHz);
    detectionSystem.noiseFloor = noiseFloor;
    
    // Encontrar frecuencia fundamental
    const fundamental = this.findFundamental(normalizedData, binHz, noiseFloor);
    detectionSystem.fundamentalFreq = fundamental.freq;
    detectionSystem.confidence = fundamental.confidence;
    
    // Calcular frecuencia dominante
    const dominant = this.findDominantFrequency(normalizedData, binHz, noiseFloor);
    detectionSystem.dominantFreq = dominant.freq;
    
    // Calcular centroide espectral
    detectionSystem.spectralCentroid = this.calculateSpectralCentroid(normalizedData, binHz, noiseFloor);
    
    return {
      normalizedData,
      binHz,
      noiseFloor,
      fundamental,
      dominant
    };
  }

  calculateNoiseFloor(data, binHz) {
    const noiseBins = Math.min(200, Math.floor(400 / binHz));
    const noiseValues = [];
    
    for (let i = 1; i < noiseBins; i++) {
      noiseValues.push(data[i]);
    }
    
    if (noiseValues.length === 0) return 0.01;
    
    noiseValues.sort((a, b) => a - b);
    const percentileIndex = Math.floor(noiseValues.length * 0.1);
    const noiseEstimate = noiseValues[percentileIndex];
    
    detectionSystem.noiseHistory.shift();
    detectionSystem.noiseHistory.push(noiseEstimate);
    
    const avgNoise = detectionSystem.noiseHistory.reduce((a, b) => a + b) / detectionSystem.noiseHistory.length;
    return Math.max(0.005, avgNoise * 1.5);
  }

  findFundamental(data, binHz, noiseFloor) {
    const minBin = Math.max(1, Math.floor(16 / binHz));
    const maxBin = Math.min(data.length, Math.ceil(200 / binHz));
    
    let bestCandidate = { freq: 0, energy: 0, confidence: 0 };
    const candidates = [];
    
    for (let i = minBin; i < maxBin - 2; i++) {
      const v0 = data[i];
      const v1 = data[i + 1];
      const v2 = data[i + 2];
      
      if (v1 > v0 && v1 > v2 && v1 > noiseFloor * 2) {
        const freq = (i + 1) * binHz;
        const energy = v1;
        const localSNR = v1 / noiseFloor;
        
        const windowSize = Math.floor(5 / binHz);
        const windowStart = Math.max(minBin, i - windowSize);
        const windowEnd = Math.min(maxBin, i + windowSize + 1);
        
        let windowEnergy = 0;
        for (let j = windowStart; j < windowEnd; j++) {
          windowEnergy += data[j];
        }
        
        const concentration = v1 / (windowEnergy / (windowEnd - windowStart));
        
        candidates.push({
          freq,
          energy,
          snr: localSNR,
          concentration,
          score: localSNR * concentration
        });
      }
    }
    
    candidates.sort((a, b) => b.score - a.score);
    
    if (candidates.length > 0) {
      bestCandidate = candidates[0];
      bestCandidate.confidence = 0.7;
      
      if (candidates.length >= 2) {
        const second = candidates[1];
        const ratio = second.freq / bestCandidate.freq;
        if (ratio > 1.8 && ratio < 2.2) {
          bestCandidate.confidence = 0.9;
        }
      }
    }
    
    detectionSystem.freqHistory.shift();
    detectionSystem.freqHistory.push(bestCandidate.freq);
    
    const sorted = [...detectionSystem.freqHistory].sort((a, b) => a - b);
    const medianFreq = sorted[2];
    
    return {
      freq: medianFreq,
      confidence: bestCandidate.confidence
    };
  }

  findDominantFrequency(data, binHz, noiseFloor) {
    let maxVal = 0;
    let maxBin = 0;
    
    for (let i = 1; i < data.length; i++) {
      if (data[i] > maxVal && data[i] > noiseFloor * 2) {
        maxVal = data[i];
        maxBin = i;
      }
    }
    
    return {
      freq: maxBin * binHz,
      energy: maxVal
    };
  }

  calculateSpectralCentroid(data, binHz, noiseFloor) {
    let weightedSum = 0;
    let totalEnergy = 0;
    
    for (let i = 1; i < data.length; i++) {
      const energy = Math.max(0, data[i] - noiseFloor);
      weightedSum += (i * binHz) * energy;
      totalEnergy += energy;
    }
    
    return totalEnergy > 0 ? weightedSum / totalEnergy : 0;
  }
}

const spectralAnalyzer = new SpectralAnalyzer();

// ===================== 6. SETUP DE AUDIO =====================
const canvas = document.getElementById("hydra-canvas");
const audio = document.getElementById("main-audio");
const params = new URLSearchParams(window.location.search);
audio.src = params.get("src") || (window.AUDIO_FILE || "./sinestesia.wav");
audio.crossOrigin = "anonymous";

const hydra = new Hydra({ canvas, detectAudio: false, makeGlobal: true });

const resize = () => {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  hydra.setResolution(canvas.width, canvas.height);
};
window.addEventListener("resize", resize);
resize();

function initAudio() {
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  sampleRate = audioCtx.sampleRate;
  
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 8192; // Más manejable
  analyser.smoothingTimeConstant = 0.7; // Más suavizado
  
  source = audioCtx.createMediaElementSource(audio);
  source.connect(analyser);
  analyser.connect(audioCtx.destination);
  dataArray = new Uint8Array(analyser.frequencyBinCount);
  
  // Construir bins
  const binHz = sampleRate / analyser.fftSize;
  BINS = {};
  
  Object.entries(detectionSystem.BANDAS_HZ).forEach(([name, [minHz, maxHz]]) => {
    BINS[name] = {
      min: Math.floor(minHz / binHz),
      max: Math.ceil(maxHz / binHz),
      name
    };
    
    bandProcessors[name] = new AdvancedSpectralProcessor(BINS[name]);
    impulseDetectors[name] = new EnhancedImpulseDetector(detectorConfigs[name]);
  });
  
  // Inicializar sistema de impulsos manuales
  manualImpulseSystem.init();
  
  initialized = true;
  console.log("Audio system initialized with FFT size:", analyser.fftSize);
}

audio.onplay = async () => {
  if (!initialized) initAudio();
  if (audioCtx.state === "suspended") await audioCtx.resume();
};

// ===================== 7. LOOP PRINCIPAL =====================
function updateTime() {
  time += dt;
  
  if (initialized && !audio.paused) {
    try {
      analyser.getByteFrequencyData(dataArray);
      
      const analysis = spectralAnalyzer.analyze(dataArray, sampleRate, analyser.fftSize);
      
      let totalEnergy = 0;
      for (let i = 1; i < analysis.normalizedData.length; i++) {
        totalEnergy += Math.max(0, analysis.normalizedData[i] - analysis.noiseFloor);
      }
      
      const bandEnergies = {};
      Object.entries(BINS).forEach(([name, { min, max }]) => {
        let energy = 0;
        for (let i = min; i < max; i++) {
          energy += Math.max(0, analysis.normalizedData[i] - analysis.noiseFloor);
        }
        bandEnergies[name] = totalEnergy > 0 ? energy / totalEnergy : 0;
      });
      
      Object.keys(BINS).forEach(name => {
        peaks[name] = bandProcessors[name].process(
          analysis.normalizedData,
          analysis.binHz,
          totalEnergy
        );
        
        impulseDetectors[name].update(
          peaks[name],
          bandEnergies[name],
          totalEnergy,
          detectionSystem.fundamentalFreq,
          time
        );
      });
      
      // Actualizar sistema de impulsos manuales
      manualImpulseSystem.update();
      
      updateHUD(analysis, bandEnergies);
      
    } catch (error) {
      console.error("Error in main loop:", error);
    }
  }
  
  requestAnimationFrame(updateTime);
}

updateTime();

// ===================== 8. HUD MEJORADO CON INFO DE IMPULSOS MANUALES =====================
const hud = document.getElementById("debugHUD");

function updateHUD(analysis, bandEnergies) {
  if (!initialized) return;

  const bar = (v, scale = 1) => {
    const width = 10;
    const filled = Math.min(Math.floor(v / scale * width), width);
    return "█".repeat(filled) + "░".repeat(width - filled);
  };

  let txt = "=== SISTEMA DE DETECCIÓN CON IMPULSOS MANUALES ===\n";
  txt += "=================================================\n\n";
  
  txt += "CONTROLES TECLADO NUMÉRICO:\n";
  txt += "---------------------------\n";
  txt += "1: 20Hz (Infra grave)     7: 100Hz (Bajo)\n";
  txt += "2: 30Hz (Infra)           8: 120Hz (Bajo medio)\n";
  txt += "3: 40Hz (Sub grave)       9: 150Hz (Bajo agudo)\n";
  txt += "4: 50Hz (Sub)             0: 200Hz (Cuerpo bajo)\n";
  txt += "5: 60Hz (Sub medio)       .: 250Hz (Cuerpo medio)\n";
  txt += "6: 80Hz (Bajo grave)\n";
  txt += "Teclas: + aumentar / - disminuir intensidad\n";
  txt += "Tecla R: Resetear sistema\n\n";
  
  txt += "ANÁLISIS ESPECTRAL:\n";
  txt += "------------------\n";
  txt += `Frec. Fundamental: ${detectionSystem.fundamentalFreq.toFixed(1)} Hz (conf: ${detectionSystem.confidence.toFixed(2)})\n`;
  txt += `Frec. Dominante:   ${detectionSystem.dominantFreq.toFixed(1)} Hz\n`;
  txt += `Centroide:         ${detectionSystem.spectralCentroid.toFixed(1)} Hz\n`;
  txt += `Noise Floor:       ${(detectionSystem.noiseFloor * 100).toFixed(1)}%\n`;
  txt += `Resolución:        ${(analysis.binHz).toFixed(2)} Hz/bin\n\n`;

  txt += "ENERGÍA POR BANDA (relativa):\n";
  txt += "-----------------------------\n";
  ["infra", "sub", "bajo", "cuerpo", "medio", "agudo"].forEach(k => {
    const v = bandEnergies[k] || 0;
    txt += `${k.padEnd(6)}: ${bar(v, 0.3)} ${(v * 100).toFixed(1)}%\n`;
  });

  txt += "\nSEÑAL PROCESADA:\n";
  txt += "---------------\n";
  ["infra", "sub", "bajo", "cuerpo", "medio", "agudo"].forEach(k => {
    const v = peaks[k];
    txt += `${k.padEnd(6)}: ${bar(v, 1)} ${(v * 100).toFixed(0)}%\n`;
  });

  txt += "\nDETECTORES DE IMPULSO:\n";
  txt += "--------------------\n";
  ["infra", "sub", "bajo", "cuerpo", "medio", "agudo"].forEach(k => {
    const det = impulseDetectors[k];
    const isManual = det.manualOverride > 0;
    txt += `${k.toUpperCase().padEnd(6)} | `;
    txt += `Val:${det.value.toFixed(3)} `;
    txt += `Conf:${det.confidence.toFixed(2)} `;
    txt += `Cooldown:${det.cooldown.toFixed(1)}s `;
    txt += isManual ? "🖐️" : (det.value > 0.5 ? "⚡" : det.cooldown > 0 ? "⏳" : "○");
    txt += `\n`;
  });

  // Mostrar impulsos manuales activos
  const activeImpulses = manualImpulseSystem.getAllActiveImpulses();
  if (activeImpulses.length > 0) {
    txt += "\nIMPULSOS MANUALES ACTIVOS:\n";
    txt += "-------------------------\n";
    activeImpulses.forEach(impulse => {
      const age = time - impulse.startTime;
      txt += `Tecla ${impulse.key}: ${impulse.frequency}Hz (${age.toFixed(1)}s)\n`;
    });
  }

  // Estado del sistema
  txt += "\nESTADO DEL SISTEMA:\n";
  txt += "-----------------\n";
  txt += `Tiempo audio: ${audio.currentTime.toFixed(1)}s\n`;
  txt += `FFT Size: ${analyser.fftSize}\n`;
  txt += `Sample Rate: ${sampleRate}Hz\n`;
  txt += `Impulsos manuales activos: ${activeImpulses.length}\n`;

  hud.textContent = txt;
}

// ===================== 9. PATCH HYDRA CON IMPULSOS MANUALES =====================
speed = 0.15;

// Sistema mejorado que incluye impulsos manuales
const enhancedTriggerSystem = {
  lastInfraTrigger: 0,
  lastSubTrigger: 0,
  infraTriggerCount: 0,
  subTriggerCount: 0,
  
  // Obtener valor de impulso combinado (automático + manual)
  getImpulseValue(bandName) {
    const autoValue = impulseDetectors[bandName].value;
    const manualImpulses = manualImpulseSystem.getAllActiveImpulses();
    
    // Buscar si hay impulsos manuales en esta banda
    let manualValue = 0;
    manualImpulses.forEach(impulse => {
      // Determinar a qué banda pertenece la frecuencia
      const freq = impulse.frequency;
      const bandRanges = detectionSystem.BANDAS_HZ;
      
      if (freq >= bandRanges[bandName][0] && freq <= bandRanges[bandName][1]) {
        const age = time - impulse.startTime;
        const decay = Math.max(0, 1.0 - (age / 0.5)); // Decaimiento en 0.5 segundos
        manualValue = Math.max(manualValue, impulse.intensity * decay);
      }
    });
    
    return Math.min(1.0, autoValue + manualValue);
  },
  
  canTriggerInfra() {
    const minInterval = 0.5;
    const now = time;
    return (now - this.lastInfraTrigger) > minInterval && 
           this.getImpulseValue('infra') > 0.3;
  },
  
  canTriggerSub() {
    const minInterval = 0.4;
    const now = time;
    return (now - this.lastSubTrigger) > minInterval && 
           this.getImpulseValue('sub') > 0.25;
  },
  
  canTriggerBajo() {
    const minInterval = 0.3;
    const now = time;
    return (now - this.lastInfraTrigger) > minInterval && 
           this.getImpulseValue('bajo') > 0.2;
  },
  
  registerInfraTrigger() {
    this.lastInfraTrigger = time;
    this.infraTriggerCount++;
  },
  
  registerSubTrigger() {
    this.lastSubTrigger = time;
    this.subTriggerCount++;
  }
};

// Patch visual mejorado que responde a impulsos automáticos y manuales
noise(2, 0.05)
  .color(0.4, 0.4, 0.65)
  .brightness(0.075)
  .modulate(noise(2, 0.01).add(gradient(1), 0.01), 5)
  .modulateScale(osc(3, -0.5, 0).kaleid(100).scale(0.5), 1, -1)
  .contrast(1.25)
  .mask(shape(4, 0.75, 0.25))
  
  // Efecto INFRA (automático + manual)
  .scale(() => {
    if (enhancedTriggerSystem.canTriggerInfra()) {
      enhancedTriggerSystem.registerInfraTrigger();
      const intensity = enhancedTriggerSystem.getImpulseValue('infra') * 0.04;
      return 1.0 + intensity;
    }
    return 1.0;
  })
  
  // Efecto SUB (automático + manual)
  .scale(() => {
    if (enhancedTriggerSystem.canTriggerSub()) {
      enhancedTriggerSystem.registerSubTrigger();
      const intensity = enhancedTriggerSystem.getImpulseValue('sub');
      const speed = 0.2 + (intensity * 0.3);
      const t = (Math.sin(time * speed) + 1) * 0.5;
      const min = 0.97;
      const max = 1.03 + (intensity * 0.02);
      return min + t * (max - min);
    }
    return 1.0;
  })
  
  // Efecto BAJO (automático + manual)
  .scale(() => {
    if (enhancedTriggerSystem.canTriggerBajo()) {
      const intensity = enhancedTriggerSystem.getImpulseValue('bajo');
      const wobble = Math.sin(time * 15) * 0.005 * intensity;
      return 1.0 + wobble;
    }
    return 1.0;
  })
  
  // Efecto basado en impulsos manuales (cualquier frecuencia)
  .scale(() => {
    const activeImpulses = manualImpulseSystem.getAllActiveImpulses();
    if (activeImpulses.length > 0) {
      // Calcular intensidad total de impulsos manuales
      let totalIntensity = 0;
      activeImpulses.forEach(impulse => {
        const age = time - impulse.startTime;
        const decay = Math.max(0, 1.0 - (age / 0.3));
        totalIntensity += impulse.intensity * decay;
      });
      
      // Efecto basado en la frecuencia más baja activa
      if (activeImpulses.length > 0) {
        const lowestFreq = Math.min(...activeImpulses.map(i => i.frequency));
        const freqFactor = 1.0 - (lowestFreq / 250); // Más efecto para frecuencias más bajas
        const pulse = Math.sin(time * 20) * 0.01 * totalIntensity * freqFactor;
        return 1.0 + pulse;
      }
    }
    return 1.0;
  })
  
  .add(src(o0).scale(0.99), 0.15)
  .out(o0);

// ===================== 10. FUNCIONES ADICIONALES =====================
// Función para activar impulso manual desde consola
window.triggerManualImpulse = function(frequency, intensity = 1.0) {
  // Encontrar la banda más cercana
  let closestBand = 'infra';
  let minDiff = Infinity;
  
  Object.entries(detectionSystem.BANDAS_HZ).forEach(([band, [min, max]]) => {
    const bandCenter = (min + max) / 2;
    const diff = Math.abs(frequency - bandCenter);
    if (diff < minDiff) {
      minDiff = diff;
      closestBand = band;
    }
  });
  
  // Activar el detector correspondiente
  if (impulseDetectors[closestBand]) {
    impulseDetectors[closestBand].triggerManual(intensity);
    console.log(`Impulso manual activado: ${frequency}Hz en banda ${closestBand}`);
  }
};

// Reset del sistema
function resetDetectionSystem() {
  Object.values(bandProcessors).forEach(p => {
    p.maxSeen = 0.001;
    p.history.fill(0);
  });
  
  Object.values(impulseDetectors).forEach(d => d.reset());
  
  detectionSystem.noiseHistory.fill(0.01);
  detectionSystem.freqHistory.fill(0);
  
  manualImpulseSystem.reset();
  
  console.log("Sistema de detección reiniciado");
}

// Teclas de atajo adicionales
document.addEventListener('keydown', (e) => {
  // Teclas F1-F4 para activar detectores específicos
  switch(e.key) {
    case 'F1':
      impulseDetectors.infra.triggerManual(0.8);
      break;
    case 'F2':
      impulseDetectors.sub.triggerManual(0.8);
      break;
    case 'F3':
      impulseDetectors.bajo.triggerManual(0.8);
      break;
    case 'F4':
      impulseDetectors.cuerpo.triggerManual(0.8);
      break;
  }
});

// Inicialización final
window.addEventListener('load', () => {
  console.log("Sistema de detección con impulsos manuales cargado");
  console.log("=================================================");
  console.log("Usa el teclado numérico para lanzar impulsos:");
  console.log("1-6: Frecuencias graves (20-80Hz)");
  console.log("7-9, 0, .: Frecuencias medias (100-250Hz)");
  console.log("+: Aumentar intensidad");
  console.log("-: Disminuir intensidad");
  console.log("R: Resetear sistema");
  console.log("F1-F4: Activar detectores específicos");
  console.log("=================================================");
});