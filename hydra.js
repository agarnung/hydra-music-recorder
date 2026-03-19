// ============================================================================
//   Modo archivo: usa hydra-shared.js + patch local
// ============================================================================

const audio = document.getElementById("main-audio");
const params = new URLSearchParams(window.location.search);

HydraShared.initHydraShell();

audio.src = params.get("src") || (window.AUDIO_FILE || "./sinestesia.wav");
audio.crossOrigin = "anonymous";

HydraShared.setFileMode(audio);

audio.onplay = async () => {
  if (!HydraShared.isAudioInitialized()) {
    HydraShared.initAudioFromMediaElement(audio);
  }
  await HydraShared.resumeAudioContextIfNeeded();
};

// ==============
//   HYDRA PATCH
// ==============

function bassBlend() {
  return clamp(1 - ENGINE.val * 2.2, 0.35, 0.95);
}

function bassPower() {
  return clamp(ENGINE.val * 2.5, 0, 1);
}

noise(3, 0.1, 7)
  .rotate(1, -0.1, -5)
  .mask(shape(() => 50 + bassBlend() * 50))
  .colorama(() => 0.4 + bassPower() * 0.05)
  .modulateScale(o0, () => 0.2)
  .saturate(0.5)
  .luma(
    () => (audio.currentTime < 141 ? 0.25 : 0.55 * bassPower()),
    0.1
  )
  .blend(noise(2), () => bassPower() * 0.1)
  .blend(o0, () => 0.2 + bassPower() * 0.5)
  .blend(o0)
  .rotate(
    () => time * 0.00001,
    () => 0.001
  )
  .scale(() => 1.5 + bassPower() * 0.2)
  .out(o0);

HydraShared.startProcessingLoop();
