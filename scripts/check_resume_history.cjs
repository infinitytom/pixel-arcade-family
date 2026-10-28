// Use a controlled clock and fake core to verify persistence timing and history.
const {chromium}=require('playwright'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/data/loader.js*',r=>r.fulfill({contentType:'text/javascript',body:''}));
 await page.addInitScript(()=>localStorage.setItem('pixelarcade:local:preferences',JSON.stringify({autoSave:'on',fullscreen:'off',cheats:'disabled'})));
 await page.clock.install();await page.goto((process.env.DEMO_URL||'http://127.0.0.1:18893')+'/play.html?core=test&src=/roms/history.zip');await page.evaluate(()=>ArcadeSession.ready);
 await page.evaluate(()=>{window.stateNumber=0;window.EJS_emulator={started:true,paused:false,pause(){this.paused=true;},play(){this.paused=false;},gameManager:{getState:()=>new Uint8Array([++stateNumber]),supportsStates:()=>true}};});
 const get=()=>page.evaluate(()=>ArcadePreferences.progress('get','resume:test:/roms/history.zip'));
 await page.clock.fastForward(1000);await page.clock.fastForward(4000);assert.equal(await get(),undefined,'no startup save after a few seconds');
 assert.equal(await page.evaluate(()=>ArcadeSession.save()),true);const first=(await get()).updatedAt;
 await page.clock.fastForward(1000);await page.clock.fastForward(178000);assert.equal((await get()).updatedAt,first,'periodic save must not run before three minutes');
 await page.clock.fastForward(2000);assert.ok((await get()).updatedAt>first,'periodic save must run after three minutes');
 const timed=(await get()).updatedAt;
 for(let i=0;i<3;i++){await page.locator('#padGuideButton').click();await page.clock.fastForward(360000);assert.equal((await get()).updatedAt,timed,'opening menus and paused time must not save');await page.locator('#padGuide').getByRole('button',{name:'继续游戏',exact:true}).click();}
 const oldPoints=await page.evaluate(async()=>ArcadePreferences.resumePoints(await ArcadePreferences.progress('get','resume:test:/roms/history.zip')).map(p=>p.updatedAt));await page.clock.fastForward(2000);assert.equal(await page.evaluate(()=>ArcadeSession.save({reason:'checkpoint'})),true);
 const checkpointPoints=await page.evaluate(async()=>ArcadePreferences.resumePoints(await ArcadePreferences.progress('get','resume:test:/roms/history.zip')).map(p=>p.updatedAt));assert.equal(checkpointPoints.length,oldPoints.length);assert.ok(checkpointPoints.includes(oldPoints.at(-1)),'exit updates latest auto slot instead of pushing older history out');
 const checkpointTime=(await get()).updatedAt;assert.equal(await page.evaluate(()=>ArcadeSession.save({reason:'checkpoint'})),false);assert.equal((await get()).updatedAt,checkpointTime,'duplicate leave events do not save twice');
 await page.evaluate(()=>{window.fakeHidden=true;Object.defineProperty(document,'hidden',{configurable:true,get:()=>fakeHidden});document.dispatchEvent(new Event('visibilitychange'));});await page.clock.fastForward(600000);assert.equal((await get()).updatedAt,checkpointTime,'background time must not create timed saves');await page.evaluate(()=>{window.fakeHidden=false;document.dispatchEvent(new Event('visibilitychange'));delete document.hidden;});await page.clock.fastForward(1000);assert.equal((await get()).updatedAt,checkpointTime,'returning to the page must not immediately save');
 for(let i=0;i<4;i++)await page.clock.fastForward(181000);
 await page.evaluate(()=>ArcadePreferences.update({autoSave:'off'}));
 for(let i=0;i<5;i++)assert.equal(await page.evaluate(()=>ArcadeSession.save({manual:true})),true);
 const points=await page.evaluate(async()=>ArcadePreferences.resumePoints(await ArcadePreferences.progress('get','resume:test:/roms/history.zip')));
 assert.equal(points.filter(p=>p.source==='manual').length,3);assert.equal(points.filter(p=>p.source==='auto').length,3);
 const manualTimes=points.filter(p=>p.source==='manual').map(p=>p.updatedAt);await page.evaluate(()=>ArcadePreferences.update({autoSave:'on'}));await page.clock.fastForward(181000);
 const after=await page.evaluate(async()=>ArcadePreferences.resumePoints(await ArcadePreferences.progress('get','resume:test:/roms/history.zip')));assert.deepEqual(after.filter(p=>p.source==='manual').map(p=>p.updatedAt),manualTimes,'auto saves preserve manual slots');
 assert.equal(after.length,6);
 await page.reload();await page.waitForFunction(()=>document.querySelector('#playerResumeChoice')?.options.length===6);
 for(const width of [390,1440]){await page.setViewportSize({width,height:900});assert.equal(await page.locator('#playerLaunch').evaluate(n=>n.scrollWidth<=n.clientWidth+1),true);await page.locator('#playerResumeChoice').scrollIntoViewIfNeeded();await page.screenshot({path:`test-results/resume-history-${width}.png`});}
 assert.deepEqual(errors,[]);console.log('PASS: three-minute cadence, three automatic and three manual states, manual saves with auto-save off, independent retention and responsive chooser.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
