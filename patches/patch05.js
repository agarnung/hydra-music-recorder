// patch05.js rotando

osc(10, 0.02, 0.5)
  .kaleid(5)
  .modulate(noise(2, () => f_bajo().pow(2) * 0.1))
  .color(0.1, 0.15, 0.2) 
  .modulateScale(osc(2), () => boomBajo() * 0.2)
  .rotate(
    () => rot = rot * 0.95 + f_bajo() * 0.01,
    0
  )
  .add(src(o0).scale(1.01), 0.8) // Feedback suave
  .out(o0)
