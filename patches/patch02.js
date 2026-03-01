// Este patch crea nubes de color que se expanden suavemente. 
// El bajo (f_sub) controla la densidad de la distorsión, haciendo que el color "respire".

noise(2, 0.05)
  .color(0.2, 0.4, 0.8)
  .modulate(noise(3), () => f_sub() * 0.5)
  .mask(shape(4, 0.8, 0.5))
  .kaleid(2)
  .modulateRotate(src(o0), () => f_bajo() * 0.1)
  .contrast(1.1)
  .out(o0)
