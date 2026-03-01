// Control de blend reactivo al bajo
function bassBlend() {
  // ENGINE.val ∈ [0,1]
  // Bajo fuerte → blend pequeño
  // Silencio → blend grande
  return clamp(1 - ENGINE.val * 1.2, 0.5, 0.9)
}

speed = 0.5

// Capa base
noise(2, 0.15)
  .color(0.65, 0.4, 0.4)
  .modulate(noise(3), () =>  0.5)
  .mask(shape(50, 0.8, 0.5))
  .kaleid(2)
  .modulateRotate(src(o0), () => 0.1)
  .contrast(1.5)
  .blend(
    noise(5)
      .color(0.2, 0.5, 0.6)
      .modulate(
        noise(2, 0.01).add(gradient(), 0.15),
        0.5
      )
      .pixelate(2000, 2000)
      .scrollX(0.001)
      .scale(1.1),
    () => (audio.currentTime <= 14) ? 0.85 : bassBlend()
  )

  .out(o0)

processingLoop();