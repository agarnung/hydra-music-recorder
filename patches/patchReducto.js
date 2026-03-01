let base = voronoi(100,0.1,0.1)
  .color(0.2,0.1,0.1)
  .colorama([0.005,0.015,0.02,0.025].fast(1))
  .brightness(0.01)
  .modulate(noise(1.5,0.05).add(gradient(),-1),1000);

base
  .modulateScale(
    osc(4,-0.5,0).kaleid(50).scale(0.5),

    // Efcto controlado por tiempo más audio
    () => (audio.currentTime >= 1.25) // Solo funciona a partir de los 1,25 segundos
          ? impulse.value
          : 0, 
    -1
  )

.out(o0);