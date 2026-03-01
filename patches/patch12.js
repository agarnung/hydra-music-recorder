// Onda expansiva en nebulosa gris

voronoi(100,0.1,0.1)
  .color(0.35,0.3,0.3)
  .colorama([0.005,0.015,0.02,0.025].fast(1))
  .brightness(0.01)
  .modulate(noise(1.5,0.05).add(gradient(),-1),1000)
  .modulateScale(osc(4,-0.5,0).kaleid(50).scale(0.5),1,-1)
  .out(o0)
