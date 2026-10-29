// A shader reset clears the fake GPU surface, making the pause regression visible.
const {chromium}=require('playwright'),http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'../site/library/experience.js'));
const server=http.createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/experience.js'?'application/javascript':'text/html');res.end(req.url==='/experience.js'?source:'<main id="playerStage" style="width:800px;height:700px"><div id="game"><canvas width="640" height="480"></canvas></div></main><dialog id="padGuide" open></dialog><script src="/experience.js"></script>');});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});try{
 const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.address().port+'/?core=fbneo&src=/roms/test.zip');
 await page.evaluate(async()=>{
  const canvas=document.querySelector('canvas'),c=canvas.getContext('2d');window.shaderCalls=[];
  const paint=()=>{c.fillStyle='#39743f';c.fillRect(0,0,640,480);};paint();
  window.EJS_emulator={started:true,paused:false,canvas,config:{shaders:{}},gameManager:{getVideoDimensions(){return 4/3;}},pause(){this.paused=true;},play(){this.paused=false;paint();},enableShader(name){shaderCalls.push({name,paused:this.paused});if(this.paused){c.fillStyle='#000';c.fillRect(0,0,640,480);}else paint();}};
  ArcadeExperience.pauseForPreview(EJS_emulator);await ArcadeExperience.settled();
 });
 const green=()=>page.evaluate(()=>document.querySelector('canvas').getContext('2d').getImageData(200,200,1,1).data[1]);
 assert.equal(await page.evaluate(()=>EJS_emulator.paused),true);assert.ok(await green()>50,'menu pause preserves its actual frame');assert.deepEqual(await page.evaluate(()=>shaderCalls.filter(c=>c.paused)),[]);
 await page.evaluate(()=>{window.ArcadePreferences={get:()=>({filter:'soft',frame:'club',mask:'none',strength:'balanced'})};dispatchEvent(new Event('arcade-preferences-changed'));});
 assert.ok(await green()>50,'settings arriving while paused cannot clear the displayed frame');assert.deepEqual(await page.evaluate(()=>shaderCalls.filter(c=>c.paused)),[]);
 await page.evaluate(()=>{EJS_emulator.play();dispatchEvent(new Event('arcade-resume-countdown-ended'));});
 assert.equal(await page.evaluate(()=>shaderCalls.at(-1).name),'2xScaleHQ.glslp','deferred filter is applied after rendering resumes');assert.ok(await green()>50);
 console.log('PASS: menu pause and settings updates preserve the game frame; shader changes wait until play resumes.');
}finally{await browser.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1;});
