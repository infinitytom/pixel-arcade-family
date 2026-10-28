const {chromium}=require('playwright'),assert=require('node:assert/strict');
const source=`#ifdef GL_ES
precision highp float;
#endif
#pragma parameter TINT "Tint" 1.0 0.0 1.0 0.1
#if defined(VERTEX)
attribute vec4 VertexCoord;attribute vec2 TexCoord;varying vec2 uv;void main(){gl_Position=VertexCoord;uv=TexCoord;}
#elif defined(FRAGMENT)
varying vec2 uv;uniform sampler2D Texture;uniform float TINT;void main(){gl_FragColor=texture2D(Texture,uv)*vec4(TINT,1.0,TINT,1.0);}
#endif`;
const names=['phosphor-dot','phosphor-glow','phosphor-line','phosphor-line-glow','phosphor-line-reflex'];
const fixture={format:'pixelarcade-phosphor-v1',shaders:Object.fromEntries(names.map((name,i)=>[name+'.glslp',{shader:{type:'text',value:`shaders = "1"\nshader0 = "fixture.glsl"\nTINT = "${.4+i*.1}"\n`},resources:[{name:'fixture.glsl',type:'text',value:source}]}]))};
(async()=>{const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});try{const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>navigator.getGamepads=()=>[]);if(!process.env.ARCADE_TEST_AUTHOR_SHADERS)await page.route('**/private-shaders.json',r=>r.fulfill({json:fixture}));await page.goto((process.env.DEMO_URL||'http://127.0.0.1:18893')+'/library/');await page.getByRole('button',{name:'游戏厅设置',exact:true}).click();for(const value of ['phosphor','phosphor-glow','phosphor-line','phosphor-line-glow','phosphor-line-reflex']){await page.getByLabel('默认滤镜',{exact:true}).selectOption(value);await page.waitForFunction(()=>document.querySelector('#settingsPreview')?.dataset.nativeShader==='on');assert.ok(await page.locator('#settingsShaderPreview').isVisible());const energy=await page.evaluate(()=>{const canvas=document.querySelector('#settingsShaderPreview'),gl=canvas.getContext('webgl'),pixels=new Uint8Array(canvas.width*canvas.height*4);gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);let energy=0;for(let i=0;i<pixels.length;i+=4)energy+=pixels[i]+pixels[i+1]+pixels[i+2];return energy;});assert.ok(energy>10000,'the actual WebGL preview must contain visible pixels');}
 await page.locator('#settingsPreview').screenshot({path:'test-results/real-shader-settings-preview.png'});
 await page.getByLabel('默认滤镜',{exact:true}).selectOption('original');await page.waitForFunction(()=>document.querySelector('#settingsShaderPreview').hidden);assert.ok(await page.locator('.preview-screen canvas').first().isVisible());
 await page.locator('#arcadeSettings .settings-close').click();await page.waitForFunction(()=>document.querySelector('#settingsShaderPreview').getContext('webgl').isContextLost());assert.deepEqual(errors,[]);console.log('PASS: five selectable presets render actual nonempty WebGL frames, original preview returns, and closing disposes the preview context.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
