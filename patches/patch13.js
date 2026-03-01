// Esfera deformándose con fondo 

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

    if(d > 0.5) {
      // Coordenada "muerta" para el fondo (usaremos esto para recortar)
      return vec2(0.5, 0.5); 
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
    osc(30, 0.1, 0.5) // Textura de la esfera
    .color(1, 1, 1)
    .sphereDisplacement2(
      // Aquí el truco: mezclamos ruido con el feedback del fondo (src(o0))
      // para que la esfera se deforme con lo que pasa atrás.
      noise(2, 0.5).blend(src(o0).color(1,0,0), 0.1), 
      4.0, 
      time * 0.4
    )
  )
  .out(o1)

// 3. Renderizamos el FONDO y componemos en o0
src(o0)
  // --- TU FONDO PSICODÉLICO ---
  .modulate(noise(3), 0.25)
  .thresh(0.85, 0.9)
  .blend(noise(4), 0.1)
  .colorama(0.2)
  .blend(gradient(0.5).hue(0.1), 0.1)
  
  // --- COMPOSICIÓN ---
  // Ponemos o1 (la esfera) encima
  // Usamos .mask() con thresh para borrar el cuadrado negro alrededor de la esfera
  .layer(
    src(o1)
    .mask(src(o1).thresh(0.05)) // Recorta lo que sea negro/oscuro
  )
  .out(o0)