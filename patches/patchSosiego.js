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