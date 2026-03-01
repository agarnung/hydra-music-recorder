// Fondo gris nebuloso i

noise(3)
  .modulatePixelate(
    noise(1),
    () => 1 + f_bajo() * 10,
    8
  )
  .hue(() => f_bajo() * 0.5)
  .brightness(() => 0.1 + f_superagudo())
  .mult(solid(1, 1, 1), () => (audio.paused ? 0 : 1))
  .out(o0);

