let base = noise(3)
  .modulatePixelate(
    noise(3),
    () => Math.sin(2 * Math.PI * 0.2  * time) - 2 * 1,
    512
  )
  .scale(0.5)

base
.blend(
    noise(3, 0).modulateScale(
        noise(3, 0),
        () => {
        const bassEffect = audio.currentTime >= 7 ? 1.25 * impulse.infra.value : 0;
        return bassEffect;
        }, 
        1
    ),
    0.25 // Control de mezcla (0-1)
    )
    
.out(o0)