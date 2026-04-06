// 1. Optimizamos las funciones para que sean dinámicas
const bassBlend = () => Math.min(Math.max(1 - (ENGINE.val * 2.2), 0.35), 0.95);
const bassPower = () => Math.min(Math.max(ENGINE.val * 2.5, 0), 1);

// 2. Colores reactivos: en lugar de un random estático, 
// usamos una oscilación leve basada en el tiempo
const r = () => 0.6 + Math.sin(time) * 0.05;
const g = () => 0.3 + Math.cos(time * 0.5) * 0.05;
const b = () => 0.4 + Math.sin(time * 2) * 0.05;

noise(3, 0.05)
  .color(r, g, b)
  // Modulamos la pixelación directamente con la potencia del motor
  .modulatePixelate(
    noise(2, 0.1), 
    () => 200 + (300 * bassBlend()), 
    () => 16 + (20 * bassPower()) // La rejilla también reacciona
  )
  .contrast(() => 1.1 + (0.4 * bassPower()))
  
  // Feedback dinámico: el escalado y la mezcla ahora responden al ENGINE
  .blend(
    src(o0)
      .scale(() => 1.001 + (0.02 * bassPower())) // Pulso visual
      .modulateRotate(noise(1, 0.01), () => bassPower() * 0.1), // Distorsión orgánica
    () => 0.85 - (0.1 * bassPower()) // Menos persistencia cuando hay más potencia
  )
  .out(o0)

