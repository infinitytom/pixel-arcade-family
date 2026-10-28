// Optional diagnostic for the known native-core cold-restore audio issue. MACROSS_URL points to the user's local ROM.
const {chromium}=require('playwright'),assert=require('node:assert/strict');
(async()=>{
 const url=process.env.MACROSS_URL;if(!url)throw Error('Set MACROSS_URL to a local Macross II play.html URL. No ROM is bundled.');
 const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
   navigator.getGamepads=()=>[];window.resumeEvents=[];window.prepared=[];
   addEventListener('arcade-resume-restored',e=>resumeEvents.push(e.detail));addEventListener('arcade-resume-preparing',e=>prepared.push({percent:e.detail.percent,time:performance.now()}));
   const Native=AudioContext;window.AudioContext=new Proxy(Native,{construct(Target,args){const ctx=Reflect.construct(Target,args);ctx.meter=ctx.createAnalyser();ctx.meter.fftSize=2048;ctx.capture=ctx.createMediaStreamDestination();ctx.meter.connect(ctx.capture);return ctx;}});
   const connect=AudioNode.prototype.connect;AudioNode.prototype.connect=function(target,...args){if(target===this.context.destination&&this.context.meter)connect.call(this,this.context.meter);return connect.call(this,target,...args);};
  });
  const pulse=async id=>{await page.evaluate(id=>EJS_emulator.gameManager.simulateInput(0,id,1),id);await page.waitForTimeout(120);await page.evaluate(id=>EJS_emulator.gameManager.simulateInput(0,id,0),id);};
  const signal=()=>page.evaluate(async()=>{const ctx=EJS_emulator.Module.AL.currentCtx.audioCtx;let sum=0,squares=0,n=0;for(let j=0;j<25;j++){const a=new Float32Array(ctx.meter.fftSize);ctx.meter.getFloatTimeDomainData(a);for(const v of a){sum+=v;squares+=v*v;n++;}await new Promise(r=>setTimeout(r,40));}return Math.sqrt(Math.max(0,squares/n-(sum/n)**2));});
  await page.goto(url);await page.evaluate(()=>ArcadePreferences.ready);await page.evaluate(()=>ArcadePreferences.update({autoSave:'off'}));await page.locator('#playerStart:not([disabled])').click();await page.waitForFunction(()=>EJS_emulator?.started,null,{timeout:90000});await page.keyboard.press('x');await page.waitForTimeout(7500);await pulse(2);await pulse(3);await page.waitForTimeout(3000);
  for(let slot=0;slot<2;slot++){
   if(slot){await pulse(3);await page.waitForTimeout(6500);}
   const baseline=await signal();await page.screenshot({path:'test-results/macross-reference.png'});assert.ok(baseline>.015,'reference game music must be audible');assert.equal(await page.evaluate(()=>ArcadeSession.save({manual:true})),true);
   const point=await page.evaluate(async()=>{const p=new URLSearchParams(location.search),v=await ArcadePreferences.progress('get','resume:'+p.get('core')+':'+p.get('src'));return v.updatedAt;});
   for(let cycle=0;cycle<2;cycle++){
    await page.reload();await page.locator('#playerContinue:not([disabled]):not([hidden])').click();await page.waitForFunction(()=>resumeEvents.length===1,null,{timeout:90000});await page.waitForTimeout(1200);
    const output=await signal();await page.screenshot({path:'test-results/macross-restored.png'});console.log(JSON.stringify({slot,cycle,output}));assert.ok(output>.015,`cold restore ${slot}/${cycle} produced ${output}, below music threshold`);
    assert.equal(await page.evaluate(()=>resumeEvents[0].updatedAt),point);assert.equal(await page.evaluate(()=>EJS_emulator.isFastForward),false);assert.equal(await page.locator('#arcadeEntrance').evaluate(n=>n.hidden),true);
    console.log(JSON.stringify({slot,cycle,acRms:output,preparationMs:await page.evaluate(()=>prepared.length?prepared.at(-1).time-prepared[0].time:0)}));
    await page.evaluate(()=>{EJS_emulator.pause();EJS_emulator.play();});await page.waitForTimeout(500);assert.ok(await signal()>.015,'same-session pause/resume keeps music');
   }
  }
  assert.deepEqual(errors,[]);console.log('PASS: native music after four cold restores at two game states, chosen progress, normal speed, and menu resume.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
