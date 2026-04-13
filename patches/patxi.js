const bassPower = () => Math.min(Math.max(ENGINE.val * 3.0, 0.1), 0.7);

// 1. Aumentamos la escala del ruido (el primer parámetro) para ganar granularidad
// 2. Usamos el tercer parámetro de noise para añadir "detalle" (octavas)
noise(25, 0.1, 4) // Escala 25 = grano fino / 4 = detalle extra
  .rotate(1, -0.05)
  .mask(shape(20, 0.5, 1.0)) 
  .color(0.6, 0.7, 0.9) 
  .brightness(-0.15) 
  
  // MODULACIÓN DE ALTA RESOLUCIÓN: 
  // Modulamos el ruido consigo mismo antes del feedback para crear textura "rota"
  .modulate(noise(40, 0.01), 0.05) 
  
  // Feedback con escala minúscula para mantener la nitidez
  .modulateScale(o0, () => 1.001 + bassPower() * 0.005)
  
  // Blend con ruido de alta frecuencia (grano fino)
  .blend(noise(50, 0.05).color(0.4, 0.5, 0.6), () => (Math.sin(time)*0.5+0.5) * 0.1)
  
  // Feedback para profundidad sin emborronar
  .blend(o0, 0.6)
  .blend(o0, 0.3)
  
  // El "golpe" de luz ahora es un destello granulado
  .add(
    noise(100, 0.1) // Grano extremo para el destello
    .color(0.8, 0.85, 1)
    .luma(0.4, 0.1), 
    () => bassPower() * 0.1
  )
  
  .contrast(1.4) // El contraste alto define mejor el grano
  .brightness(() => bassPower() * 0.05)
  .out(o0)

HydraShared.startProcessingLoop();