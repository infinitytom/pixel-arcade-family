// Optional integration check: installed engine and the local dino ROM are required.
const {chromium}=require('playwright'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:process.env.HEADED!=='1'});try{
  const page=await browser.newPage({viewport:{width:1366,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{window.retainedFrames=[];const watcher=setInterval(()=>{const display=window.ArcadePausedDisplay;if(!display)return;clearInterval(watcher);const capture=display.capture;display.capture=async(...args)=>{const result=await capture.apply(display,args);retainedFrames.push(result);return result;};},10);});
  await page.addInitScript(()=>{window.pausedShaderCalls=[];const watcher=setInterval(()=>{const em=window.EJS_emulator;if(!em?.enableShader)return;clearInterval(watcher);const enable=em.enableShader;em.enableShader=function(...args){if(this.started&&this.paused)pausedShaderCalls.push(args[0]);return enable.apply(this,args);};},10);});
  await page.goto(process.env.GAME_URL||(process.env.DEMO_URL||'http://127.0.0.1:18893')+'/play.html?core=mame2003_plus&src=/roms/fbneo/动作街机/dino.zip');
  await page.locator('#playerStart:not([disabled])').click();await page.waitForFunction(()=>EJS_emulator.started);
  await page.waitForTimeout(7000);
  assert.equal(await page.evaluate(()=>EJS_emulator.paused),false,'new game runs without another key');
  if(new URL(page.url()).searchParams.get('core')==='mame2003_plus')assert.match(await page.evaluate(()=>EJS_emulator.getCoreSettings()),/skip_disclaimer = "enabled"/);
  async function checkFrame(label){
    await page.locator('#resumeCountdown').waitFor({state:'visible'});
    assert.equal(await page.evaluate(()=>EJS_emulator.paused),true);assert.equal(await page.evaluate(()=>retainedFrames.at(-1)),true,'the actual core frame is retained in its native canvas');
    assert.deepEqual(await page.evaluate(()=>pausedShaderCalls),[],'no shader change may clear the paused game canvas');
    const frame=await page.evaluate(()=>EJS_emulator.gameManager.getFrameNum());await page.waitForTimeout(250);
    assert.equal(await page.evaluate(()=>EJS_emulator.gameManager.getFrameNum()),frame,'core stays paused');
    await page.waitForTimeout(800); // Include the first 700 ms picture watcher tick.
    // Read the browser compositor, not WebGL's possibly discarded buffer.
    const screenshot=await page.locator('#game').screenshot();
    const pixels=await page.evaluate(async encoded=>{const bytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));const image=await createImageBitmap(new Blob([bytes],{type:'image/png'}));
      const c=document.createElement('canvas');c.width=image.width;c.height=image.height;
      c.getContext('2d').drawImage(image,0,0);image.close();const data=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
      let lit=0;for(let i=0;i<data.length;i+=4)if(data[i]+data[i+1]+data[i+2]>75)lit++;
      return {width:c.width,lit:lit/(c.width*c.height)};
    },screenshot.toString('base64'));
    assert.ok(pixels.width>100&&pixels.lit>.1,'actual displayed game is visible: '+label+' '+JSON.stringify(pixels));
    assert.equal(await page.locator('#resumeCountdown').evaluate(n=>getComputedStyle(n).backgroundColor),'rgba(0, 0, 0, 0)');assert.equal(await page.locator('#resumeCountdown > :not(strong)').count(),0);
    await page.screenshot({path:'test-results/countdown-'+label+'.png'});
    await page.waitForFunction(()=>!ArcadeResumeCountdown.active&&!EJS_emulator.paused,null,{timeout:6000});
    const resumed=await page.evaluate(()=>EJS_emulator.gameManager.getFrameNum());await page.waitForTimeout(250);
    assert.ok(await page.evaluate(()=>EJS_emulator.gameManager.getFrameNum())>resumed,'3,2,1 resumes native execution without input');
  }
  for(const filter of ['original','crt','soft','phosphor','phosphor-glow','phosphor-line','phosphor-line-glow','phosphor-line-reflex']){
    await page.evaluate(filter=>ArcadePreferences.update({filter}),filter);await page.waitForTimeout(500);assert.equal(await page.locator('#game').getAttribute('data-filter'),filter);
    await page.keyboard.press('Escape');await page.getByRole('button',{name:'继续游戏',exact:true}).click();
    await checkFrame(filter);
  }
  assert.equal(await page.evaluate(()=>ArcadeSession.save({manual:true})),true);
  await page.reload();await page.locator('#playerContinue:not([disabled])').click();await checkFrame('cold-restore');
  assert.deepEqual(await page.evaluate(()=>pausedShaderCalls),[]);assert.deepEqual(errors,[]);
  console.log('PASS: '+new URL(page.url()).searchParams.get('core')+' native new-game boot without a key, visible actual paused canvas without any screenshot or shade with all eight filters and cold state restore, automatic countdown completion without focus or input.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
