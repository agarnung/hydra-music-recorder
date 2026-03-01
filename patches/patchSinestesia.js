const base = noise(2, () => {
    /* FÓRMULA: return X + (impulse.value * Y);
       
       ---------------------------------------------------------
       VALOR X (aquí es 0.05) -> VELOCIDAD DE "REPOSO"
       ---------------------------------------------------------
       Es la velocidad mínima cuando NO hay bajo sonando.
       ↑ SI SUBES X: El fondo siempre estará nervioso, nunca se para.
       ↓ SI BAJAS X: El fondo se queda casi congelado en los silencios.
  
       ---------------------------------------------------------
       VALOR Y (aquí es 3.0)  -> POTENCIA DEL "ACELERÓN"
       ---------------------------------------------------------
       Es cuánta velocidad extra se añade de golpe al entrar el bajo.
       ↑ SI SUBES Y: El cambio es violento (latigazo visual).
       ↓ SI BAJAS Y: El cambio es sutil (solo respira un poco).
    */
    
    //       X                 Y
    return 0.05 + (impulse.value * 0.1);
  })
  .color(0.2, 0.4, 0.8)
  .modulate(noise(3), () => 0.5)
  .mask(shape(4, 0.8, 0.5))
  .contrast(1.1)
  .modulateRotate(src(o0), () => 0.1);