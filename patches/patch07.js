// Vórtice de sueño
// Un túnel suave. Aquí el f_bajo aumenta ligeramente el brillo y la rotación.

shape(100, 0.3, 0.1)
  .color(0.6, 0.2, 0.9)
  .repeat(5, 5)
  .modulateRotate(noise(1, 0.05), () => f_medio() * 2)
  .modulate(src(o0), 0.1)
  .scale(() => 1 + f_bajo() * 0.1)
  .out(o0)