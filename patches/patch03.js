// Fondo gris nebuloso II

noise(3)
  // SUB → pixelado / estructura
  .modulatePixelate(
    noise(3),
    () => Math.sin(2 * Math.PI * 0.2  * time) - 2 * boomBajo(),
    512
  )

  .blend(
    noise(3, 0).modulateScale(
      noise(3, 0),
      () => 1 * boomBajo(), 
      1
    ),
    0.1 // Control de mezcla (0-1)
  )

  .mult(solid(1,1,1), () => (audio.paused ? 0 : 1))
  .out(o0);
