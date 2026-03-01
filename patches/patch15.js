// Un motivo demoniaco

speed = 0.5

// Capa base
noise(2, 0.15)
  .color(0.7, 0.4, 0.4)
  .modulate(noise(3), () =>  0.5)
  .mask(shape(4, 0.8, 0.5))
  .kaleid(2)
  .modulateRotate(src(o0), () => 0.1)
  .contrast(10)
  .rotate(() => time%360/10, 0.05)
  .blend(
    // Segunda capa
    voronoi(5, 0.1, 1.75)
      .color(0.2, 0.5, 0.6)
      .modulate(
        noise(2, 0.01).add(gradient(), 0.15),
        0.5
      )
      .pixelate(2000, 2000)
      .scrollX(0.001)
      .rotate(() => -time%360/10, 0.05),
    0.4
  )
  .out(o0)

processingLoop();