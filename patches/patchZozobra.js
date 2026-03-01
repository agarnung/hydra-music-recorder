hush()

speed = 0.35 // Variable global que escala el tiempo  de todo Hydra. Número bajo (0.1, 0.2) para ir lento

// 1. Definimos la función primero
setFunction({
  name: 'sphereDisplacement2',
  type: 'combineCoord',
  inputs: [
    { name: 'radius', type: 'float', default: 4.0 },
    { name: 'rot', type: 'float', default: 0.0 }
  ],
  glsl: `
    vec2 pos = _st - 0.5;
    vec3 rpos = vec3(0.0, 0.0, -10.0);
    vec3 rdir = normalize(vec3(pos * 3.0, 1.0));
    float d = 0.0;

    for(int i = 0; i < 16; ++i){
      float height = length(_c0);
      d = length(rpos) - (radius + height);
      rpos += d * rdir;
      if (abs(d) < 0.001) break;
    }

    if(d > 0.05) {
      // Coordenada "muerta" para el fondo (usaremos esto para recortar)
      return vec2(0.05, 0.05); 
    } else {
      return vec2(
        atan(rpos.z, rpos.x) + rot,
        atan(length(rpos.xz), rpos.y)
      );
    }
  `
})

// 2. Renderizamos la ESFERA en el buffer o1
// Usamos .color(0,0,0) al principio para limpiar el fondo de este buffer
src(o1)
  .layer(
    osc(3, 0.1, 0.75)
  	.thresh(0.5, 5)
  	.blend(noise(2.5), 0.5) // Textura de la esfera
    .sphereDisplacement2(
      // Aquí el truco: mezclamos ruido con el feedback del fondo (src(o0))
      // para que la esfera se deforme con lo que pasa atrás.
      noise(
        () => {
          const bassEffect = audio.currentTime >= 18.25 ? 25 * impulse.infra.value : 2;
          return bassEffect;
        }
        , 0.5), 
      4.0, 
      time * 0.4
    )
  )
  .out(o1)

// 3. Renderizamos el FONDO y componemos en o0
src(o1)
  // --- FONDO ---
  .modulate(noise(3),0.25).thresh(0.85, 0.9)
  .blend(noise(4),0.1).colorama(0.2)
  .blend(gradient(0.5).hue(0.1),0.1)

  // --- COMPOSICIÓN ---
  // Ponemos o1 (la esfera) encima
  // Usamos .mask() con thresh para borrar el cuadrado negro alrededor de la esfera
  .layer(
    src(o0)
    .mask(src(o1).thresh(0.75)) // Recorta lo que sea negro/oscuro
  )
  .out(o0)