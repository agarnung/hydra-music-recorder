// Líneas muy finas que parecen hilos de seda. 
// El boomBajo genera pequeños "saltos" de luz muy sutiles.

osc(10, 0.02, 0.5)
  .kaleid(5)
  .modulate(noise(2, 0.1))
  .color(0.5, 0.7, 1)
  .modulateScale(osc(2), () => boomBajo() * 0.2)
  .scrollX(0, 0.01)
  .add(src(o0).scale(1.01), 0.8) // Feedback suave
  .out(o0)
