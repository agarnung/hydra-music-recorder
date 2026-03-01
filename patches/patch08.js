// Células de Agua
// Usa voronoi para crear formas orgánicas. La reacción al bajo es como una gota cayendo en un estanque.

voronoi(5, 0.1, 0.75)
  .color(0.2, 0.5, 0.6)
  .modulate(noise(2, 0.01).add(gradient(), 0.15), () => 0.5)
  .pixelate(2000, 2000)
  .add(src(o0).scrollX(0.001), 0.05)
  .out(o0)