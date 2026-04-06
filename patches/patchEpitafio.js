// Optimizamos las funciones de control
const bassBlend = () => Math.min(Math.max(1 - ENGINE.val * 2.2, 0.35), 0.95);
const bassPower = () => Math.min(Math.max(ENGINE.val * 2.5, 0), 1);

// Definimos el "base" con reactividad en la estructura
const base = () => 
  voronoi(() => 5 + (bassPower() * 10), 0.1, 1) // Las celdas se multiplican con el bajo
    .color(0.7, 0.15, 0.1)
    .brightness(0.1)   
    .modulate(noise(2, 0.02), () => 0.1 + (bassPower() * 0.4)) // Se deforma con la potencia
    .blend(src(o0).scale(() => 0.999 - (bassPower() * 0.01)), 0.1) 

// Renderizado final combinando las capas
base()
  .blend(
    noise(2, 0.1, 0.2)
      .color(0.7, 0.25, 0.2)  
      .brightness(() => 0.1 + (bassPower() * 0.2)) // Destellos de brillo
      .modulate(noise(2), () => 1.5 * bassPower()) // El ruido muerde más fuerte
      .contrast(1.1)
      .mask(
        shape(4, () => 0.4 + (bassPower() * 0.5), 0.2) // El diamante central se expande
          .rotate(() => time * 0.5)
      )
      .blend(src(o0), () => 0.1 + (0.2 * bassPower()))
  )
  .modulateScrollX(osc(10, 0.1), () => bassPower() * 0.05) // Vibración horizontal reactiva
  .out(o0)