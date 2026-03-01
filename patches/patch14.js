// Esfera 3D ameba sobre fondo suave 

// LIMPIEZA INICIAL
hush()

// 1. FUNCIÓN DE COORDENADAS (Define CÓMO SE VE la textura)
setFunction({
  name: 'sphereUV',
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
      d = length(rpos) - (radius + (height * 0.5));
      rpos += d * rdir;
      if (abs(d) < 0.01) break;
    }
    // Si no choca, da igual qué coordenada devolvemos, lo recortaremos luego
    // Devolvemos 0.5 para que no haga cosas raras la tarjeta gráfica
    if(d > 1.0) return vec2(0.5); 
    return vec2(atan(rpos.z, rpos.x) + rot, atan(length(rpos.xz), rpos.y));
  `
})

// 2. FUNCIÓN DE MÁSCARA (Define DÓNDE ESTÁ la esfera)
// Esta función es matemática pura: Devuelve BLANCO si hay esfera, NEGRO si no.
setFunction({
  name: 'sphereAlpha',
  type: 'color',
  inputs: [
    { name: 'radius', type: 'float', default: 4.0 }
  ],
  glsl: `
    vec2 pos = _st - 0.5;
    vec3 rpos = vec3(0.0, 0.0, -10.0);
    vec3 rdir = normalize(vec3(pos * 3.0, 1.0));
    float d = 0.0;
    // Bucle idéntico al anterior para que coincidan pixel a pixel
    for(int i = 0; i < 16; ++i){
      float height = length(_c0);
      d = length(rpos) - (radius + (height * 0.5));
      rpos += d * rdir;
      if (abs(d) < 0.01) break;
    }
    // Si d es grande, no hay esfera -> Devuelve TRANSPARENTE (0,0,0,0)
    if(d > 1.0) return vec4(0.0, 0.0, 0.0, 0.0);
    // Si choca -> Devuelve BLANCO SÓLIDO (1,1,1,1)
    return vec4(1.0, 1.0, 1.0, 1.0);
  `
})

// 3. BUFFER o1: TU FONDO (Intacto)
src(o1)
  .modulate(noise(3), 0.25).thresh(0.85, 0.9)
  .blend(noise(4), 0.1).colorama(0.2)
  .blend(gradient(0.5).hue(0.1), 0.1)
  .out(o1)

// 4. BUFFER o2: LA ESFERA VISUAL (Textura)
// Aquí usamos tu estética original
src(o2)
  .layer(
    osc(5, 0.1, 0.5).color(1, 1, 1) // Rayas blancas
    .sphereUV(
      // Pasamos la deformación. IMPORTANTE: Copiaremos esto abajo.
      noise(2, 0.5).blend(src(o1).color(1,0,0), 0.1), 
      4.0, 
      time * 0.4
    )
  )
  .out(o2)

// 5. BUFFER o3: LA SILUETA (Máscara)
// Aquí generamos el recorte dinámico
src(o3)
  .layer(
    solid(1,1,1) // Empezamos con blanco
    .sphereAlpha(
      // USAMOS EXACTAMENTE LA MISMA DEFORMACIÓN QUE ARRIBA
      // Esto asegura que la máscara tenga los mismos bultos que la esfera
      noise(2, 0.5).blend(src(o1).color(1,0,0), 0.1), 
      4.0 
    )
  )
  .out(o3)

// 6. SALIDA FINAL (o0)
src(o1) // Fondo
  .layer(
    src(o2) // Ponemos la esfera
    .mask(src(o3)) // La recortamos con la silueta perfecta de o3
  )
  .out(o0)