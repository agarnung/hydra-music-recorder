// ====================================================================
//   Modo live: nebulosa autónoma (time/noise); la guitarra solo tiñe el color.
// ====================================================================

const micBtn = document.getElementById("live-mic-btn");
const micStatus = document.getElementById("live-mic-status");

// freqMinHz/freqMaxHz: solo MAPEO de color (grave→agudo en el arco H). La detección de pitch usa siempre ~55 Hz…freqMaxHz.
// hueMinDeg / hueMaxDeg (0–360): arco H del grave al agudo (ej. verdes–azules: 90→240).
HydraShared.setLiveAnalyserOptions({
  fftSize: 4096,
  freqMinHz: 82,
  freqMaxHz: 1318.5,
  hueMinDeg: 30,
  hueMaxDeg: 360
});

HydraShared.initHydraShell();
HydraShared.setLiveMode();

async function startLiveInput() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    const msg = "Este navegador no soporta captura de audio (getUserMedia).";
    if (micStatus) {
      micStatus.textContent = msg;
    }
    console.error(msg);
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      },
      video: false
    });
    if (!HydraShared.isAudioInitialized()) {
      HydraShared.initAudioFromStream(stream);
    }
    await HydraShared.resumeAudioContextIfNeeded();
    if (micBtn) {
      micBtn.disabled = true;
      micBtn.textContent = "Entrada activa";
    }
    if (micStatus) {
      micStatus.textContent = "Analizando audio en vivo.";
    }
  } catch (err) {
    console.error(err);
    if (micStatus) {
      micStatus.textContent = `No se pudo acceder al micrófono: ${err.message || err}`;
    }
  }
}

if (micBtn) {
  micBtn.addEventListener("click", () => {
    startLiveInput();
  });
}

document.addEventListener("keydown", (e) => {
  if (e.key !== "r" && e.key !== "R") {
    return;
  }
  const el = e.target;
  if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) {
    return;
  }
  document.body.classList.toggle("live-chrome-hidden");
});

// Movimiento: solo time / noise / feedback. Color: solo ENGINE.liveR/G/B.
noise(2.8, 0.06, 4.5)
  .rotate(() => time * 0.000028, () => 0.015, () => -1.2)
  .modulate(
    noise(3.2, 0.04, 3)
      .rotate(() => time * -0.000019, () => 0.02),
    () => 0.22
  )
  .color(
    () => ENGINE.liveR,
    () => ENGINE.liveG,
    () => ENGINE.liveB
  )
  .modulateScale(
    noise(1.8, 0.12, 2).rotate(() => time * 0.000011, 0.05),
    () => 0.14
  )
  .blend(o0, () => 0.42)
  .out(o0);

HydraShared.startProcessingLoop();
