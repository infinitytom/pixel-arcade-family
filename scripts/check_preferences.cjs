// Real browser checks for defaults, cache boundaries, scheduled maintenance and input icons.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const base=process.env.DEMO_URL||'http://127.0.0.1:18893';
(async()=>{
  const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base+'/library/');await page.waitForFunction(()=>window.ArcadePreferences);await page.evaluate(()=>ArcadePreferences.ready);
    assert.equal(await page.evaluate(()=>ArcadePreferences.get().fullscreen),'on');
    await page.getByRole('button',{name:'游戏厅设置',exact:true}).click();
    await page.getByLabel('默认滤镜',{exact:true}).selectOption('crt');await page.getByLabel('默认机台遮罩',{exact:true}).selectOption('neon');await page.getByLabel('默认效果强度',{exact:true}).selectOption('light');await page.getByLabel('金手指功能',{exact:true}).selectOption('disabled');await page.getByLabel('开始游戏时全屏',{exact:true}).selectOption('off');
    await page.screenshot({path:'test-results/global-settings.png'});await page.locator('#arcadeSettings').getByRole('button',{name:'完成',exact:true}).click();
    const player='/play.html?core=mame2003_plus&src=/roms/fbneo/动作街机/dino.zip&name=恐龙快打';
    await page.goto(base+player);await page.waitForFunction(()=>document.querySelector('#arcadeDecoration')?.dataset.frame==='neon');assert.equal(await page.locator('#arcadeDecoration').getAttribute('data-filter'),'crt');
    assert.equal(await page.evaluate(()=>Object.keys(window.EJS_externalFiles||{}).length),0);
    await page.locator('#padGuideButton').click();await page.getByRole('button',{name:'画面 · 滤镜与机台',exact:true}).click();await page.getByLabel('画面滤镜',{exact:true}).selectOption('original');
    await page.evaluate(()=>ArcadePreferences.update({filter:'soft'}));await page.reload();await page.waitForFunction(()=>window.ArcadeExperience);await page.waitForFunction(()=>document.querySelector('#arcadeDecoration')?.dataset.frame==='neon');assert.equal(await page.locator('#arcadeDecoration').getAttribute('data-filter'),'original');
    await page.locator('#padGuideButton').click();await page.getByRole('button',{name:'画面 · 滤镜与机台',exact:true}).click();await page.getByRole('button',{name:'使用全局默认',exact:true}).click();await page.reload();await page.waitForFunction(()=>document.querySelector('#arcadeDecoration')?.dataset.filter==='soft');
    await page.goto(base+'/library/');await page.evaluate(()=>ArcadePreferences.ready);
    async function seed(){await page.evaluate(async()=>{
      const put=(name,store,key,value)=>new Promise((resolve,reject)=>{const req=indexedDB.open(name,1);req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(store))req.result.createObjectStore(store);};req.onerror=()=>reject(req.error);req.onsuccess=()=>{const db=req.result,tx=db.transaction(store,'readwrite');tx.objectStore(store).put(value,key);tx.oncomplete=()=>{db.close();resolve();};};});
      for(const [db,store] of [['EmulatorJS-roms','rom'],['EmulatorJS-bios','bios'],['EmulatorJS-core','core']])await put(db,store,'test-cache',{data:new Uint8Array(1024)});
      await put('EmulatorJS-states','states','manual-save',new Uint8Array([1,2,3]));await ArcadePreferences.progress('put','test-resume',{state:new Uint8Array([7,8,9])});localStorage.setItem('arcade-favorites','["keep"]');
      const owned=await caches.open('pixelarcade-cache-test');await owned.put('/owned',new Response('cache'));const other=await caches.open('another-app-cache');await other.put('/other',new Response('keep'));
    });}
    await seed();assert.equal(await page.evaluate(()=>ArcadePreferences.cacheBytes()),3072);assert.equal(await page.evaluate(()=>ArcadePreferences.clearCache()),3072);
    assert.equal(await page.evaluate(()=>ArcadePreferences.cacheBytes()),0);
    assert.deepEqual(await page.evaluate(async()=>Array.from((await ArcadePreferences.progress('get','test-resume')).state)),[7,8,9]);
    assert.equal(await page.evaluate(()=>localStorage.getItem('arcade-favorites')),'["keep"]');
    assert.equal(await page.evaluate(async()=>!!(await (await caches.open('another-app-cache')).match('/other'))),true);
    assert.deepEqual(await page.evaluate(()=>new Promise(resolve=>{const req=indexedDB.open('EmulatorJS-states');req.onsuccess=()=>{const db=req.result,tx=db.transaction('states'),get=tx.objectStore('states').get('manual-save');get.onsuccess=()=>resolve(Array.from(get.result));tx.oncomplete=()=>db.close();};})),[1,2,3]);
    await seed();await page.evaluate(()=>{ArcadePreferences.update({cacheDays:'7'});localStorage.setItem(ArcadePreferences.key('cache-last-clean'),String(Date.now()-8*86400000));});await page.reload();await page.waitForFunction(async()=>window.ArcadePreferences&&(await ArcadePreferences.ready)&&(await ArcadePreferences.cacheBytes())===0);
    for(const [id,family,label] of [['Sony DualSense','playstation','×'],['Nintendo Switch Pro Controller','nintendo','B'],['Xbox Wireless Controller','xbox','A'],['Unknown HID','generic','下'],['Qanba Arcade Stick','arcade','1']]){await page.evaluate(id=>ArcadeInput.setDevice({id,mapping:'standard'}),id);assert.equal(await page.locator('body').getAttribute('data-input-family'),family);assert.equal(await page.locator('#inputLegend .input-glyph').nth(1).textContent(),label);}
    await page.keyboard.press('Tab');assert.equal(await page.locator('body').getAttribute('data-input-family'),'keyboard');
    await page.evaluate(()=>ArcadePreferences.update({inputStyle:'playstation'}));await page.keyboard.press('Tab');assert.equal(await page.locator('body').getAttribute('data-input-family'),'playstation');await page.evaluate(()=>ArcadePreferences.update({inputStyle:'auto'}));
    for(const path of ['/help.html','/support.html','/stick-test.html']){await page.goto(base+path);await page.locator('.document-shell').waitFor();for(const width of [390,1440]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,`${path} overflow at ${width}`);}}
    await page.screenshot({path:'test-results/unified-diagnostics.png'});assert.deepEqual(errors,[]);
    console.log('PASS: global defaults and per-game override, exact cache boundaries, periodic cleanup, save preservation, five controller icon families, keyboard fallback and unified responsive pages.');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
