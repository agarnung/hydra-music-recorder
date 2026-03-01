const base = voronoi(5, 0.1, 
    () => {
    return 1.5 + (impulse.value * 0.5); // default 1.5
  })
  .color(0.2, 0.5, 0.55)
  .modulate(noise(2, 0.01).add(gradient(), 0.15), 0.35)
  .pixelate(2000, 2000)
  .add(src(o0).scrollX(0.001), 0.05)