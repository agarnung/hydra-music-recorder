// Simula el movimiento de una aurora boreal. Los graves profundos (f_infra) mueven la estructura verticalmente y la iluminan.

noise(3, 0.02)
  .modulateScrollY(osc(0.5), () => f_infra() * 0.3)
  .color(
    () => 0.1 - boomBajo() * 0.05,
    () => 0.7 - boomBajo() * 0.15,
    () => 0.5 - boomBajo() * 0.1
  )
  .colorama(0.1)
  .luma(0.3, 0.1)
  .modulatePixelate(noise(2), 100)
  .blend(src(o0).scale(1.002), 0.9)
  .out(o0)