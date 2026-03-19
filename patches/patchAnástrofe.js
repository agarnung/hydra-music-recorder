// licensed with CC BY-NC-SA 4.0 https://creativecommons.org/licenses/by-nc-sa/4.0/
// Inspirado en el patch de Asdrúbal Gomez

noise(3,0.1,7)
.rotate(1,-0.1,-5).mask(shape(20))
.colorama(0.5)
.modulateScale(o0)
.modulateScale(o0,1,)
.blend(noise(2))
.blend(o0)
.blend(o0)
.blend(o0)
.rotate(()=>time*0.00001)
.out(o0)