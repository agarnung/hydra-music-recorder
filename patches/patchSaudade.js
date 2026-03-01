// Onda expansiva en nebulosa gris

voronoi(10,0.1,0.1)
  .color(0.4,0.4,0.65)
  .colorama([0.005,0.015,0.02,0.025].fast(1))
  .brightness(0.01)
  .modulate(noise(2).add(gradient(1),0.1),5)
  .modulateScale(osc(5,-0.5,0).kaleid(100).scale(0.5),1,-1)
  .contrast(1.35)
  .mask(shape(4, 0.8, 0.25))

  // Blur fake
  .scale(1.1)
  .add(src(o0).scale(0.99), 0.25) //  <= AQUÍ METER IMPULSO EN 0.05-0.5

  .out(o0)
