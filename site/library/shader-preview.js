/* Render imported GLSL presets against the original city illustration. */
(() => {
  'use strict';
  const states=new WeakMap();
  const options=text=>Object.fromEntries([...text.matchAll(/^([\w]+)\s*=\s*"?([^"\n]+)"?\s*$/gm)].map(m=>[m[1],m[2].trim()]));
  function destroy(canvas){const state=states.get(canvas);if(state){state.gl.getExtension('WEBGL_lose_context')?.loseContext();states.delete(canvas);}}
  function render(canvas,source,preset,strength,dimensions={}){
    let state=states.get(canvas);
    if(!state){const gl=canvas.getContext('webgl',{alpha:false,antialias:false,preserveDrawingBuffer:true});if(!gl)throw Error('无法预览 WebGL 滤镜');state={gl,programs:[]};states.set(canvas,state);}
    const {gl}=state;for(const program of state.programs)gl.deleteProgram(program);state.programs=[];
    const width=dimensions.width||Math.max(128,Math.round(canvas.parentElement.clientWidth*(devicePixelRatio||1))),height=dimensions.height||Math.round(width*9/16);canvas.width=width;canvas.height=height;
    const files=new Map(preset.resources.map(r=>[r.name,r.value])),config=options(preset.shader.value),params={};
    for(const text of files.values())for(const m of text.matchAll(/#pragma parameter\s+(\w+)\s+"[^"]*"\s+([-+\d.eE]+)/g))params[m[1]]=Number(config[m[1]]??m[2]);
    const amount={light:{scan:.55,mask:.2,dot:.55},balanced:{scan:.78,mask:.4,dot:.78},strong:{scan:.95,mask:.7,dot:.95}}[strength]||{scan:.78,mask:.4,dot:.78};Object.assign(params,{LINE_OPACITY:amount.scan,MASK_INTENSITY:amount.mask,DOT_OPACITY:amount.dot});
    const textures=[],frames=[],buffers=[],programs=state.programs;
    const texture=(w,h,data=null)=>{const tex=gl.createTexture();textures.push(tex);gl.bindTexture(gl.TEXTURE_2D,tex);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);if(data)gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,data);else gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,null);return {tex,w,h};};
    function compile(code,type){const shader=gl.createShader(type);gl.shaderSource(shader,'#define '+(type===gl.VERTEX_SHADER?'VERTEX':'FRAGMENT')+'\n#define PARAMETER_UNIFORM\n'+code);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)){const error=gl.getShaderInfoLog(shader);gl.deleteShader(shader);throw Error(error);}return shader;}
    function uniform(program,name,value){const location=gl.getUniformLocation(program,name);if(location===null)return;if(Array.isArray(value)){if(value.length===16)gl.uniformMatrix4fv(location,false,value);else gl.uniform2fv(location,value);}else if(name==='FrameCount'||name==='FrameDirection'||name.endsWith('Texture')||name==='Texture')gl.uniform1i(location,value);else gl.uniform1f(location,value);}
    const fixture=document.createElement('canvas');fixture.width=dimensions.sourceWidth||128;fixture.height=dimensions.sourceHeight||72;fixture.getContext('2d').drawImage(source,0,0,fixture.width,fixture.height);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);const original=texture(fixture.width,fixture.height,fixture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
    const aliases=new Map(),quad=new Float32Array([-1,-1,1,-1,-1,1,1,1]),uv=new Float32Array([0,0,1,0,0,1,1,1]);let previous=original;
    const matrix=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
    try{for(let pass=0;pass<Number(config.shaders);pass++){
      const name=config['shader'+pass],raw=files.get(name);if(!raw)throw Error('缺少预览着色器文件');
      const code=raw.replaceAll('ARCADE_FINAL_VIEWPORT',`vec4(${width}.0,${height}.0,${1/width},${1/height})`),vertex=compile(code,gl.VERTEX_SHADER),fragment=compile(code,gl.FRAGMENT_SHADER),program=gl.createProgram();programs.push(program);gl.attachShader(program,vertex);gl.attachShader(program,fragment);gl.linkProgram(program);gl.deleteShader(vertex);gl.deleteShader(fragment);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));gl.useProgram(program);
      const size=(axis,prior,viewport)=>{const type=config['scale_type_'+axis+pass]||config['scale_type'+pass]||(pass===Number(config.shaders)-1?'viewport':'source'),amount=Number(config['scale_'+axis+pass]||config['scale'+pass]||1);return Math.max(1,Math.round(type==='absolute'?amount:type==='viewport'?viewport*amount:prior*amount));};
      const w=size('x',previous.w,width),h=size('y',previous.h,height),last=pass===Number(config.shaders)-1;
      let output;if(!last){output=texture(w,h);const f=gl.createFramebuffer();frames.push(f);gl.bindFramebuffer(gl.FRAMEBUFFER,f);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,output.tex,0);if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('预览帧缓冲不可用');}else gl.bindFramebuffer(gl.FRAMEBUFFER,null);
      gl.viewport(0,0,last?width:w,last?height:h);gl.disable(gl.BLEND);gl.clearColor(0,0,0,1);gl.clear(gl.COLOR_BUFFER_BIT);
      for(let location=0;location<gl.getParameter(gl.MAX_VERTEX_ATTRIBS);location++)gl.disableVertexAttribArray(location);
      const color=gl.getAttribLocation(program,'COLOR');if(color>=0)gl.vertexAttrib4f(color,1,1,1,1);
      for(const [attribute,data] of [['VertexCoord',quad],['TexCoord',uv]]){const location=gl.getAttribLocation(program,attribute);if(location<0)continue;const buffer=gl.createBuffer();buffers.push(buffer);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,2,gl.FLOAT,false,0,0);}
      uniform(program,'MVPMatrix',matrix);uniform(program,'InputSize',[previous.w,previous.h]);uniform(program,'TextureSize',[previous.w,previous.h]);uniform(program,'OutputSize',[last?width:w,last?height:h]);uniform(program,'OrigInputSize',[original.w,original.h]);uniform(program,'OrigTextureSize',[original.w,original.h]);uniform(program,'FrameCount',0);uniform(program,'FrameDirection',1);
      let unit=0;const bind=(name,image)=>{gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,image.tex);uniform(program,name,unit++);};bind('Texture',previous);bind('OrigTexture',original);
      gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,previous.tex);const linear=config['filter_linear'+pass]==='true';gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,linear?gl.LINEAR:gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,linear?gl.LINEAR:gl.NEAREST);
      for(const [alias,image] of aliases){bind(alias+'Texture',image);uniform(program,alias+'InputSize',[image.w,image.h]);uniform(program,alias+'TextureSize',[image.w,image.h]);}
      for(const [name,value] of Object.entries(params))uniform(program,name,value);
      gl.drawArrays(gl.TRIANGLE_STRIP,0,4);if(output){previous=output;if(config['alias'+pass])aliases.set(config['alias'+pass],output);}
    }gl.finish();}finally{for(const tex of textures)gl.deleteTexture(tex);for(const frame of frames)gl.deleteFramebuffer(frame);for(const buffer of buffers)gl.deleteBuffer(buffer);}
    return true;
  }
  window.ArcadeShaderPreview={render,destroy};
})();
