/* Keep the emulator's own WebGL canvas presented while its CPU loop is paused. */
(() => {
  'use strict';
  const renderers=new WeakMap();let active=null;
  function make(em,context){
    const canvas=em.canvas;if(!canvas)return null;
    const gl=context||canvas.getContext('webgl')||canvas.getContext('webgl2');if(!gl||gl.isContextLost())return null;
    const modern=typeof WebGL2RenderingContext!=='undefined'&&gl instanceof WebGL2RenderingContext;
    const extension=modern?null:gl.getExtension('OES_vertex_array_object');
    if(!modern&&!extension)return null;
    const vaoAPI=modern?{create:()=>gl.createVertexArray(),bind:v=>gl.bindVertexArray(v),binding:gl.VERTEX_ARRAY_BINDING}:{create:()=>extension.createVertexArrayOES(),bind:v=>extension.bindVertexArrayOES(v),binding:extension.VERTEX_ARRAY_BINDING_OES};
    const caps=[gl.BLEND,gl.CULL_FACE,gl.DEPTH_TEST,gl.STENCIL_TEST,gl.SCISSOR_TEST,gl.SAMPLE_COVERAGE,gl.SAMPLE_ALPHA_TO_COVERAGE,gl.RASTERIZER_DISCARD].filter(v=>typeof v==='number');
    function save(){
      const state={program:gl.getParameter(gl.CURRENT_PROGRAM),vao:gl.getParameter(vaoAPI.binding),array:gl.getParameter(gl.ARRAY_BUFFER_BINDING),framebuffer:gl.getParameter(gl.FRAMEBUFFER_BINDING),viewport:gl.getParameter(gl.VIEWPORT),mask:gl.getParameter(gl.COLOR_WRITEMASK),caps:caps.map(c=>gl.isEnabled(c)),unit:gl.getParameter(gl.ACTIVE_TEXTURE)};
      if(modern)state.read=gl.getParameter(gl.READ_FRAMEBUFFER_BINDING);
      gl.activeTexture(gl.TEXTURE0);state.texture=gl.getParameter(gl.TEXTURE_BINDING_2D);if(modern)state.sampler=gl.getParameter(gl.SAMPLER_BINDING);gl.activeTexture(state.unit);return state;
    }
    function restore(s){
      gl.useProgram(s.program);vaoAPI.bind(s.vao);gl.bindBuffer(gl.ARRAY_BUFFER,s.array);
      if(modern){gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER,s.framebuffer);gl.bindFramebuffer(gl.READ_FRAMEBUFFER,s.read);}else gl.bindFramebuffer(gl.FRAMEBUFFER,s.framebuffer);
      gl.viewport(...s.viewport);gl.colorMask(...s.mask);caps.forEach((c,i)=>s.caps[i]?gl.enable(c):gl.disable(c));
      gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,s.texture);if(modern)gl.bindSampler(0,s.sampler);gl.activeTexture(s.unit);
    }
    function shader(type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;}
    const state=save();let program,vao,texture;
    try{
      program=gl.createProgram();
      const vertex=shader(gl.VERTEX_SHADER,modern?'#version 300 es\nin vec2 position;out vec2 uv;void main(){uv=position*.5+.5;gl_Position=vec4(position,0.,1.);}':'attribute vec2 position;varying vec2 uv;void main(){uv=position*.5+.5;gl_Position=vec4(position,0.,1.);}');
      const fragment=shader(gl.FRAGMENT_SHADER,modern?'#version 300 es\nprecision mediump float;in vec2 uv;uniform sampler2D image;out vec4 color;void main(){color=vec4(texture(image,uv).rgb,1.);}':'precision mediump float;varying vec2 uv;uniform sampler2D image;void main(){gl_FragColor=vec4(texture2D(image,uv).rgb,1.);}');
      gl.attachShader(program,vertex);gl.attachShader(program,fragment);gl.bindAttribLocation(program,0,'position');gl.linkProgram(program);
      if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));gl.deleteShader(vertex);gl.deleteShader(fragment);
      vao=vaoAPI.create();vaoAPI.bind(vao);gl.bindBuffer(gl.ARRAY_BUFFER,gl.createBuffer());gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
      gl.useProgram(program);gl.uniform1i(gl.getUniformLocation(program,'image'),0);texture=gl.createTexture();
    }finally{restore(state);}
    let capturing=false,valid=false,ready=false,width=0,height=0,frame=0,drawing=false;
    // Native shaders may delete their currently bound program and rely on GL
    // keeping it alive until the next native bind. Temporary presentation must
    // not finalize that deletion while the native render loop is stopped.
    const deleted=new Set(),useProgram=gl.useProgram,deleteProgram=gl.deleteProgram;
    gl.deleteProgram=function(program){if(program&&program===gl.getParameter(gl.CURRENT_PROGRAM)){deleted.add(program);return;}return deleteProgram.call(this,program);};
    gl.useProgram=function(program){const result=useProgram.call(this,program);if(!drawing)for(const old of deleted)if(old!==program){deleteProgram.call(this,old);deleted.delete(old);}return result;};
    function capture(){
      if(!capturing||drawing||gl.isContextLost()||gl.getParameter(gl.FRAMEBUFFER_BINDING)!==null)return;
      const binding=gl.getParameter(gl.TEXTURE_BINDING_2D),read=modern?gl.getParameter(gl.READ_FRAMEBUFFER_BINDING):null;
      try{
        if(modern)gl.bindFramebuffer(gl.READ_FRAMEBUFFER,null);
        // Loading a state may briefly present an empty startup frame.
        const w=canvas.width,h=canvas.height;if(!w||!h)return;
        const pixel=new Uint8Array(4);let color=false;
        for(const x of [.25,.5,.75]){for(const y of [.25,.5,.75]){gl.readPixels(Math.min(w-1,w*x|0),Math.min(h-1,h*y|0),1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);if(pixel[0]+pixel[1]+pixel[2]>12){color=true;break;}}if(color)break;}
        if(ready&&!color)return;
        gl.bindTexture(gl.TEXTURE_2D,texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
        if(width!==w||height!==h){width=w;height=h;gl.copyTexImage2D(gl.TEXTURE_2D,0,gl.RGBA,0,0,width,height,0);}else gl.copyTexSubImage2D(gl.TEXTURE_2D,0,0,0,0,0,width,height);
        valid=true;ready=ready||color;
      }finally{gl.bindTexture(gl.TEXTURE_2D,binding);if(modern)gl.bindFramebuffer(gl.READ_FRAMEBUFFER,read);}
    }
    // Retain pixels at the native draw, before a driver can discard its buffer.
    for(const name of ['drawArrays','drawElements','drawArraysInstanced','drawElementsInstanced','drawRangeElements','blitFramebuffer'])if(typeof gl[name]==='function'){
      const draw=gl[name];gl[name]=function(...args){const result=draw.apply(this,args);capture();return result;};
    }
    function present(){
      cancelAnimationFrame(frame);if(!em.paused||!valid||gl.isContextLost())return;
      const s=save();drawing=true;
      try{
        gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,canvas.width,canvas.height);gl.colorMask(true,true,true,true);caps.forEach(c=>gl.disable(c));gl.useProgram(program);vaoAPI.bind(vao);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);if(modern)gl.bindSampler(0,null);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);gl.flush();
      }finally{try{restore(s);}finally{drawing=false;}}
      frame=requestAnimationFrame(present);
    }
    canvas.addEventListener('webglcontextlost',()=>{capturing=false;valid=false;deleted.clear();cancelAnimationFrame(frame);renderers.delete(em);});
    return {
      async capture(){
        capturing=true;valid=false;ready=false;const started=performance.now(),deadline=started+1000;
        try{do{await new Promise(r=>requestAnimationFrame(r));}while((!ready||performance.now()-started<100)&&performance.now()<deadline);await new Promise(r=>requestAnimationFrame(r));return valid;}finally{capturing=false;}
      },
      present,
      release(){capturing=false;cancelAnimationFrame(frame);}
    };
  }
  const previousReady=window.EJS_ready;
  window.EJS_ready=()=>{
    const em=window.EJS_emulator,canvas=em?.canvas;
    if(canvas){const getContext=canvas.getContext;canvas.getContext=function(type,...args){const context=getContext.call(this,type,...args);if(context&&/webgl/i.test(type)&&!renderers.has(em)){try{const renderer=make(em,context);if(renderer)renderers.set(em,renderer);}catch(error){console.warn('Paused display initialization:',error.message);}}return context;};}
    previousReady?.();
  };
  function release(){active?.release();active=null;}
  window.ArcadePausedDisplay={
    async capture(em){release();try{let renderer=renderers.get(em);if(!renderer){renderer=make(em);if(!renderer)return false;renderers.set(em,renderer);}active=renderer;return await renderer.capture();}catch(error){console.warn('Paused display unavailable:',error.message);release();return false;}},
    present(){active?.present();},release
  };
  window.addEventListener('pagehide',release);
})();
