// Núcleo compartido entre hydra.js (archivo + grabación) e hydra_live.js (micrófono).
// Los patches pueden usar ENGINE, CONFIG, RANGO_INTERES, map y clamp (mismo ámbito global de documento).
//
// -----------------------------------------------------------------------------
// QUÉ USA CADA MODO (liveAnalyserOptions === null → grabación; !== null → live)
// -----------------------------------------------------------------------------
//
// GRABACIÓN / ARCHIVO (index.html + hydra.js; no se llama setLiveAnalyserOptions)
//   • RANGO_INTERES.{min,max}  → ventana Hz donde se busca el pico (bajo / subs).
//   • CONFIG.inputGain         → ganancia del GainNode antes del analyser.
//   • CONFIG.decay             → caída suave de ENGINE.val cuando baja el pico.
//   • CONFIG.noiseFloor        → umbral; por debajo se trata como silencio.
//   • Analyser: fftSize fijo 16384, smoothingTimeConstant 0, min/maxDecibels -45/-10.
//   • Salida: ENGINE.{val, raw, freq, tone}; bandCount/bandLevels no se rellenan.
//
// LIVE (live.html + hydra_live.js; HydraShared.setLiveAnalyserOptions antes del mic)
//   • setLiveAnalyserOptions({ fftSize?, freqMinHz?, freqMaxHz?, hueMinDeg?, hueMaxDeg? })
//     — freqMinHz/freqMaxHz: solo MAPEO de color (grave→agudo en H); defaults GUITAR_HZ_*.
//     — Detección de pitch: YIN (dominio temporal) + fallback FFT desde LIVE_PITCH_DETECT_MIN_HZ hasta freqMaxHz.
//     — matiz H: hueMinDeg→hueMaxDeg (0–360°; si max<min, arco cruza 0°).
//   • CONFIG.inputGain / noiseFloor → igual que arriba.
//   • Salida: ENGINE.freq ≈ f0 (YIN + fallback FFT); liveCentroidHz = centroide; liveR/G/B.
//
// -----------------------------------------------------------------------------

(function () {
  "use strict";

  // --- 1. Rango y motor para detección bass en modo grabación (mismos nombres que antes para no romper patches) ---
  const RANGO_INTERES = {
    min: 20,
    max: 40
  };

  const CONFIG = {
    inputGain: 2.5,
    decay: 0.99,
    noiseFloor: 0.25
  };

  /** EADGBE + 24 trastes: ~82 Hz (E2) … ~2637 Hz (E6); el matiz H usa hasta E6/X para no exagerar agudos. Y se estrecha un poco más el rango empíricamente */
  const GUITAR_HZ_COLOR_MIN = 82;
  const GUITAR_HZ_COLOR_MAX = 2637 / 4;

  /** Piso fijo (Hz) para FFT / YIN: por debajo del Mi grave abierto; no usar freqMinHz aquí. */
  const LIVE_PITCH_DETECT_MIN_HZ = 55;

  const ENGINE = {
    val: 0,
    raw: 0,
    freq: 0,
    tone: 0,
    bandCount: 0,
    bandLevels: [],
    /** Solo modo live: RGB derivado del audio (el patch no debe usarlos para geometría). */
    liveR: 0.1,
    liveG: 0.1,
    liveB: 0.1,
    /** Solo live: centroide espectral (Hz); sube con armónicos — ver HUD “centr”. */
    liveCentroidHz: 0
  };

  const map = (v, x1, y1, x2, y2) => (v - x1) * (y2 - x2) / (y1 - x1) + x2;
  const clamp = (v, min, max) => Math.max(min, Math.min(v, max));

  // Exponer al ámbito global del documento (siguientes <script> y callbacks de Hydra)
  window.RANGO_INTERES = RANGO_INTERES;
  window.CONFIG = CONFIG;
  window.ENGINE = ENGINE;
  window.map = map;
  window.clamp = clamp;

  let canvas = null;
  let hud = null;
  let hydra = null;
  let audioCtx = null;
  let analyser = null;
  let dataArray = null;
  let gainNode = null;
  let mediaSourceNode = null;
  let initialized = false;
  let shouldProcessAudio = () => false;
  let appModeLabel = "record";

  /** null = grabación/archivo; si existe → fftSize, freqMinHz, freqMaxHz, hueMinDeg, hueMaxDeg. */
  let liveAnalyserOptions = null;

  let liveTimeDomainBuffer = null;
  let liveYinD = null;
  let liveYinCmnd = null;

  const FFT_VALID = [32, 64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768];

  const nearestFftSize = (n) => {
    let best = 2048;
    let bestDiff = Infinity;
    for (let i = 0; i < FFT_VALID.length; i += 1) {
      const d = Math.abs(FFT_VALID[i] - n);
      if (d < bestDiff) {
        bestDiff = d;
        best = FFT_VALID[i];
      }
    }
    return best;
  };

  const resize = () => {
    const dpr = window.devicePixelRatio || 1;
    const width = window.innerWidth;
    const height = window.innerHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    hydra.setResolution(canvas.width, canvas.height);
    console.log(`📐 Resolución: ${canvas.width}x${canvas.height} (DPR: ${dpr})`);
  };

  function createAnalyserChain() {
    analyser = audioCtx.createAnalyser();
    if (liveAnalyserOptions) {
      analyser.fftSize = liveAnalyserOptions.fftSize;
      analyser.smoothingTimeConstant = 0;
    } else {
      analyser.fftSize = 16384;
      analyser.smoothingTimeConstant = 0.0;
    }
    analyser.minDecibels = -45;
    analyser.maxDecibels = -10;
    dataArray = new Float32Array(analyser.frequencyBinCount);
    gainNode = audioCtx.createGain();
    gainNode.gain.value = CONFIG.inputGain;
  }

  const linearMagFromDb = (db) => Math.max(1e-8, 10 ** (db / 20));

  /** h,s,v ∈ [0,1] → {r,g,b} ∈ [0,1] */
  function hsvToRgb(h, s, v) {
    const hh = (h - Math.floor(h)) * 6;
    const i = Math.floor(hh);
    const f = hh - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);
    let r;
    let g;
    let b;
    switch (i) {
      case 0:
        r = v; g = t; b = p;
        break;
      case 1:
        r = q; g = v; b = p;
        break;
      case 2:
        r = p; g = v; b = t;
        break;
      case 3:
        r = p; g = q; b = v;
        break;
      case 4:
        r = t; g = p; b = v;
        break;
      default:
        r = v; g = p; b = q;
        break;
    }
    return { r, g, b };
  }

  /**
   * t ∈ [0,1] (grave→agudo) → componente H para hsvToRgb ∈ [0,1].
   * minDeg/maxDeg en [0,360]. Si maxDeg < minDeg, el arco cruza 0° (ej. 300°→60°).
   */
  function mapPitchTToHue01(minDeg, maxDeg, t) {
    const ta = clamp(minDeg, 0, 360);
    const tb = clamp(maxDeg, 0, 360);
    const u = clamp(t, 0, 1);
    let hueDeg;
    if (tb >= ta) {
      hueDeg = ta + u * (tb - ta);
    } else {
      const span = 360 - ta + tb;
      hueDeg = ta + u * span;
      if (hueDeg >= 360) {
        hueDeg -= 360;
      }
    }
    return hueDeg / 360;
  }

  function liveParabolicPeakHz(peakBin, binSize, lastIdx) {
    if (peakBin < 1 || peakBin >= lastIdx) {
      return peakBin * binSize;
    }
    const y0 = linearMagFromDb(dataArray[peakBin - 1]);
    const y1 = linearMagFromDb(dataArray[peakBin]);
    const y2 = linearMagFromDb(dataArray[peakBin + 1]);
    const denom = y0 - 2 * y1 + y2;
    let delta = 0;
    if (Math.abs(denom) > 1e-10) {
      delta = 0.5 * (y0 - y2) / denom;
    }
    return (peakBin + clamp(delta, -0.55, 0.55)) * binSize;
  }

  /** Si el subarmónico (f/2) sigue fuerte, bajar octavas hacia la fundamental probable. */
  function liveFoldSubharmonics(hz, binSize, ia, ib, fMin) {
    let h = hz;
    let guard = 0;
    while (h > fMin * 1.4 && guard < 8) {
      const bHigh = Math.round(h / binSize);
      const bLow = Math.round(h / 2 / binSize);
      if (bLow < ia || bLow > ib || bHigh < ia || bHigh > ib) {
        break;
      }
      if (dataArray[bLow] > dataArray[bHigh] - 8 && dataArray[bLow] > -55) {
        h /= 2;
        guard += 1;
      } else {
        break;
      }
    }
    return h;
  }

  /**
   * YIN (Cheveigné & Kawahara): mínimo del CMNDF en [tauMin,tauMax] → fundamental fiable.
   * La autocorr por “máximo” elegía períodos cortos (armónicos) y podía invertir graves/agudos.
   */
  function estimateLiveYinF0(td, sampleRate, minHz, maxHz) {
    const n = td.length;
    if (n < 512) {
      return 0;
    }
    const half = Math.floor(n / 2);
    const tauMin = Math.max(2, Math.floor(sampleRate / maxHz));
    const tauMax = Math.min(half - 2, Math.floor(sampleRate / minHz));
    if (tauMax <= tauMin + 12) {
      return 0;
    }

    const bufLen = tauMax + 2;
    if (!liveYinD || liveYinD.length < bufLen) {
      liveYinD = new Float32Array(bufLen);
      liveYinCmnd = new Float32Array(bufLen);
    }
    const d = liveYinD;
    const cmnd = liveYinCmnd;

    for (let tau = 1; tau <= tauMax; tau += 1) {
      let sum = 0;
      const lim = n - tau;
      for (let j = 0; j < lim; j += 1) {
        const diff = td[j] - td[j + tau];
        sum += diff * diff;
      }
      d[tau] = sum;
    }

    cmnd[0] = 1;
    let cumsum = 0;
    for (let tau = 1; tau <= tauMax; tau += 1) {
      cumsum += d[tau];
      cmnd[tau] = cumsum > 1e-12 ? (d[tau] * tau) / cumsum : 1;
    }

    const yinThresh = 0.2;
    let bestTau = -1;
    for (let tau = tauMin + 1; tau < tauMax; tau += 1) {
      if (
        cmnd[tau] < yinThresh &&
        cmnd[tau] <= cmnd[tau - 1] &&
        cmnd[tau] <= cmnd[tau + 1]
      ) {
        bestTau = tau;
        break;
      }
    }
    let bestV;
    if (bestTau < 0) {
      bestTau = tauMin;
      bestV = cmnd[tauMin];
      for (let tau = tauMin + 1; tau <= tauMax; tau += 1) {
        if (cmnd[tau] < bestV) {
          bestV = cmnd[tau];
          bestTau = tau;
        }
      }
    } else {
      bestV = cmnd[bestTau];
    }

    if (bestV > 0.52 || bestTau < 2) {
      return 0;
    }

    let refinedTau = bestTau;
    if (bestTau > 1 && bestTau < tauMax) {
      const y0 = cmnd[bestTau - 1];
      const y1 = cmnd[bestTau];
      const y2 = cmnd[bestTau + 1];
      const denom = y0 - 2 * y1 + y2;
      if (Math.abs(denom) > 1e-12) {
        refinedTau = bestTau + 0.5 * (y0 - y2) / denom;
      }
    }

    const f0 = sampleRate / refinedTau;
    if (f0 < minHz * 0.88 || f0 > maxHz * 1.12) {
      return 0;
    }
    return f0;
  }

  /**
   * Live: centroide en banda de detección; f0 = YIN (fallback pico FFT + plegado).
   * freqMinHz/freqMaxHz solo afectan al matiz (color), no al piso del análisis ni a ENGINE.freq.
   */
  function processLiveAudioColorsOnly() {
    const opt = liveAnalyserOptions;
    const colorFMin = opt.freqMinHz;
    const colorFMax = opt.freqMaxHz;
    const detectFMax = opt.freqMaxHz;
    const binSize = audioCtx.sampleRate / analyser.fftSize;
    const last = dataArray.length - 1;
    let ia = Math.max(1, Math.floor(LIVE_PITCH_DETECT_MIN_HZ / binSize));
    let ib = Math.min(last, Math.floor(detectFMax / binSize));
    if (ib < ia) {
      ib = ia;
    }

    const nTd = analyser.fftSize;
    if (!liveTimeDomainBuffer || liveTimeDomainBuffer.length !== nTd) {
      liveTimeDomainBuffer = new Float32Array(nTd);
    }
    analyser.getFloatTimeDomainData(liveTimeDomainBuffer);

    let num = 0;
    let den = 0;
    let maxDb = -Infinity;
    let peakBin = ia;
    for (let i = ia; i <= ib; i += 1) {
      const db = dataArray[i];
      const m = linearMagFromDb(db);
      num += i * binSize * m;
      den += m;
      if (db > maxDb) {
        maxDb = db;
        peakBin = i;
      }
    }

    const peakNorm = clamp(map(maxDb, -70, -10, 0, 1), 0, 1);
    ENGINE.val = peakNorm;
    ENGINE.raw = peakNorm;

    if (peakNorm < CONFIG.noiseFloor * 0.28 || den < 1e-7) {
      ENGINE.freq = 0;
      ENGINE.liveCentroidHz = 0;
      ENGINE.liveR *= 0.96;
      ENGINE.liveG *= 0.96;
      ENGINE.liveB *= 0.96;
      ENGINE.val *= 0.82;
      return;
    }

    const cHz = num / den;
    ENGINE.liveCentroidHz = cHz;

    const yinMaxHz = Math.min(2500, Math.max(detectFMax, 500));
    let pitchHz = estimateLiveYinF0(
      liveTimeDomainBuffer,
      audioCtx.sampleRate,
      LIVE_PITCH_DETECT_MIN_HZ,
      yinMaxHz
    );
    if (!pitchHz || pitchHz < 40) {
      pitchHz = liveParabolicPeakHz(peakBin, binSize, last);
      pitchHz = liveFoldSubharmonics(
        pitchHz,
        binSize,
        ia,
        ib,
        LIVE_PITCH_DETECT_MIN_HZ
      );
    }
    pitchHz = clamp(pitchHz, 40, Math.min(6000, audioCtx.sampleRate / 2 - 100));
    ENGINE.freq = pitchHz;

    const logLo = Math.log2(colorFMin);
    const logHi = Math.log2(colorFMax);
    const logSpan = logHi - logLo;
    const tPitch = logSpan > 1e-6
      ? clamp((Math.log2(pitchHz) - logLo) / logSpan, 0, 1)
      : 0;
    const hue = mapPitchTToHue01(opt.hueMinDeg, opt.hueMaxDeg, tPitch);
    ENGINE.tone = hue;

    const { r, g, b } = hsvToRgb(hue, 0.9, 0.32 + peakNorm * 0.62);
    const blend = 0.26;
    ENGINE.liveR += (r - ENGINE.liveR) * blend;
    ENGINE.liveG += (g - ENGINE.liveG) * blend;
    ENGINE.liveB += (b - ENGINE.liveB) * blend;
  }

  /**
   * Audio desde <audio> (reproducción de archivo).
   */
  function initAudioFromMediaElement(audioEl) {
    if (initialized) {
      return;
    }
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContext();
    createAnalyserChain();
    mediaSourceNode = audioCtx.createMediaElementSource(audioEl);
    mediaSourceNode.connect(audioCtx.destination);
    mediaSourceNode.connect(gainNode);
    gainNode.connect(analyser);
    initialized = true;
    console.log(`🚀 RANGO DE INTERÉS: ${RANGO_INTERES.min}Hz - ${RANGO_INTERES.max}Hz (archivo)`);
  }

  /**
   * Audio en vivo: MediaStream (micrófono / entrada de sistema según el navegador).
   * No conectamos a destination para no duplicar la escucha (tú oyes por ASIO/altavoces).
   */
  function initAudioFromStream(mediaStream) {
    if (initialized) {
      return;
    }
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContext();
    createAnalyserChain();
    mediaSourceNode = audioCtx.createMediaStreamSource(mediaStream);
    mediaSourceNode.connect(gainNode);
    gainNode.connect(analyser);
    initialized = true;
    console.log(`🚀 RANGO DE INTERÉS: ${RANGO_INTERES.min}Hz - ${RANGO_INTERES.max}Hz (live)`);
  }

  function processingLoop() {
    if (initialized && shouldProcessAudio()) {
      analyser.getFloatFrequencyData(dataArray);
      if (liveAnalyserOptions) {
        processLiveAudioColorsOnly();
      } else {
        const binSize = audioCtx.sampleRate / analyser.fftSize;
        const startBin = Math.floor(RANGO_INTERES.min / binSize);
        const endBin = Math.floor(RANGO_INTERES.max / binSize);
        let maxDb = -Infinity;
        let maxIndex = -1;
        for (let i = startBin; i <= endBin; i += 1) {
          const db = dataArray[i];
          if (db > maxDb) {
            maxDb = db;
            maxIndex = i;
          }
        }
        let currentAmp = map(maxDb, -70, -10, 0, 1);
        currentAmp = clamp(currentAmp, 0, 1);
        if (currentAmp < CONFIG.noiseFloor) {
          currentAmp = 0;
        }
        if (currentAmp > ENGINE.val) {
          ENGINE.val = currentAmp;
        } else {
          ENGINE.val *= CONFIG.decay;
        }
        if (currentAmp > 0.1) {
          const freq = maxIndex * binSize;
          ENGINE.freq = freq;
          ENGINE.tone = clamp(map(freq, RANGO_INTERES.min, RANGO_INTERES.max, 0, 1), 0, 1);
        }
        ENGINE.raw = currentAmp;
      }
    }
    updateHUD();
    requestAnimationFrame(processingLoop);
  }

  function updateHUD() {
    if (!hud) {
      return;
    }
    const bar = (v) => "█".repeat(Math.floor(v * 20)).padEnd(20, "░");
    const active = ENGINE.val > 0.2 ? "<b style='color:#0f0'>ACTIVE</b>" : "<span style='color:#555'>...</span>";
    const fftLine = liveAnalyserOptions
      ? `FFT: ${liveAnalyserOptions.fftSize} | ${liveAnalyserOptions.freqMinHz}–${liveAnalyserOptions.freqMaxHz} Hz | H ${liveAnalyserOptions.hueMinDeg}°→${liveAnalyserOptions.hueMaxDeg}°<br>`
      : `RANGO: ${RANGO_INTERES.min}–${RANGO_INTERES.max} Hz<br>`;
    hud.innerHTML = `
    <div style="background:#000; color:#0f0; font-family:monospace; padding:10px; border:1px solid #0f0;">
      MODO: ${appModeLabel}<br>
      ${fftLine}
      -----------------------------------<br>
      DETECT: ${active}<br>
      FORCE : [${bar(ENGINE.val)}]<br>
      ${liveAnalyserOptions
      ? `NOTA≈ : ${ENGINE.freq.toFixed(1)} Hz<br> 
      CENTR : ${ENGINE.liveCentroidHz.toFixed(1)} Hz<br>`
      : `FREQ  : ${ENGINE.freq.toFixed(1)} Hz<br>`}
      COLOR : ${ENGINE.tone.toFixed(2)}<br>
      -----------------------------------<br>
      Input Gain: x${CONFIG.inputGain}
    </div>
  `;
  }

  window.HydraShared = {
    /**
     * Solo live: FFT, freqMin/Max → solo color; detección desde LIVE_PITCH_DETECT_MIN_HZ. f0 = YIN (+ fallback FFT).
     * Llamar antes de initAudioFromStream.
     */
    setLiveAnalyserOptions(opts) {
      const o = opts || {};
      const fftSize = nearestFftSize(o.fftSize !== undefined ? o.fftSize : 2048);
      let freqMinHz = o.freqMinHz !== undefined ? Number(o.freqMinHz) : GUITAR_HZ_COLOR_MIN;
      let freqMaxHz = o.freqMaxHz !== undefined ? Number(o.freqMaxHz) : GUITAR_HZ_COLOR_MAX;
      if (Number.isNaN(freqMinHz) || freqMinHz < 1) {
        freqMinHz = GUITAR_HZ_COLOR_MIN;
      }
      if (Number.isNaN(freqMaxHz) || freqMaxHz < 1) {
        freqMaxHz = GUITAR_HZ_COLOR_MAX;
      }
      if (freqMaxHz < freqMinHz) {
        const tmp = freqMinHz;
        freqMinHz = freqMaxHz;
        freqMaxHz = tmp;
      }
      if (freqMaxHz <= freqMinHz) {
        freqMaxHz = freqMinHz + 1;
      }
      freqMinHz = clamp(freqMinHz, 1, 24000);
      freqMaxHz = clamp(freqMaxHz, 1, 24000);
      if (freqMaxHz <= freqMinHz) {
        freqMaxHz = freqMinHz + 1;
      }
      let hueMinDeg = o.hueMinDeg !== undefined ? Number(o.hueMinDeg) : 0;
      let hueMaxDeg = o.hueMaxDeg !== undefined ? Number(o.hueMaxDeg) : 360;
      if (Number.isNaN(hueMinDeg)) {
        hueMinDeg = 0;
      }
      if (Number.isNaN(hueMaxDeg)) {
        hueMaxDeg = 360;
      }
      hueMinDeg = clamp(hueMinDeg, 0, 360);
      hueMaxDeg = clamp(hueMaxDeg, 0, 360);
      liveAnalyserOptions = {
        fftSize,
        freqMinHz,
        freqMaxHz,
        hueMinDeg,
        hueMaxDeg
      };
      ENGINE.bandCount = 0;
      ENGINE.bandLevels = [];
    },
    initHydraShell() {
      canvas = document.getElementById("hydra-canvas");
      hud = document.getElementById("debugHUD");
      hydra = new Hydra({ canvas, detectAudio: false, makeGlobal: true });
      window.addEventListener("resize", resize);
      resize();
    },
    setFileMode(audioEl) {
      appModeLabel = "record";
      shouldProcessAudio = () => initialized && !audioEl.paused;
    },
    setLiveMode() {
      appModeLabel = "live";
      shouldProcessAudio = () => initialized && audioCtx && audioCtx.state === "running";
    },
    initAudioFromMediaElement,
    initAudioFromStream,
    async resumeAudioContextIfNeeded() {
      if (audioCtx && audioCtx.state === "suspended") {
        await audioCtx.resume();
      }
    },
    isAudioInitialized() {
      return initialized;
    },
    startProcessingLoop() {
      processingLoop();
    },
    get hydra() {
      return hydra;
    },
    get canvas() {
      return canvas;
    }
  };
}());
