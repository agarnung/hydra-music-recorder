// Luz Polarizada 
// Colores pastel que se mezclan mediante interferencia. Muy relajante para música ambient o downtempo.

osc(20, 0.01, 1)
  .modulate(noise(2, 0.05))
  .diff(osc(10, 0.02).rotate(Math.PI/2))
  .color(0.9, 0.7, 0.8)
  .modulateScale(noise(2), () => f_bajo() * 0.3)
  .contrast(1.2)
  .out(o0)
