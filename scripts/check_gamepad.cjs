// Self-contained browser regression: no ROMs, engine, NAS, or real controller required.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../site');
const games=Array.from({length:65},(_,i)=>({id:String(i),title:`游戏 ${i}`,filename:`game${i}.zip`,rom:`/roms/game${i}.zip`,category:i<40?'动作':'对战',core:'fbneo',video:'/preview.mp4',aliases:`game${i}`,publisher:'test'}));
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/library/catalog.json'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({games,categories:{动作:40,对战:25}}));return;}
  if(url.pathname.startsWith('/data/')){res.end('');return;}
  const rel=url.pathname.endsWith('/')?url.pathname+'index.html':url.pathname;
  const file=path.join(root,rel);
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.statusCode=404;res.end();return;}
  res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':file.endsWith('.png')?'image/png':file.endsWith('.jpg')?'image/jpeg':'text/html');res.end(fs.readFileSync(file));
});
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const base=`http://127.0.0.1:${server.address().port}`;
  const browser=await chromium.launch({...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{}),headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];
    page.setDefaultTimeout(10000);
    page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>{localStorage.setItem('pixelarcade:local:preferences',JSON.stringify({fullscreen:'off',autoSave:'off'}));
      window.pads=[{id:'Test standard pad',index:0,connected:true,mapping:'standard',axes:[0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0}))}];
      if(location.pathname==='/play.html')window.pads[0].buttons[9]={pressed:true,value:1};
      Object.defineProperty(navigator,'getGamepads',{value:()=>window.pads});
    });
    const down=async(...buttons)=>{
      const apply=()=>page.evaluate(bs=>{for(const p of window.pads||[])if(p)p.buttons.forEach((b,i)=>{b.pressed=bs.includes(i);b.value=b.pressed?1:0;});},buttons);
      try{await apply();}catch(e){if(!/Execution context was destroyed|Cannot find context/.test(e.message))throw e;await page.waitForLoadState('domcontentloaded');await apply();}
      try{await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));}catch(e){if(!/Execution context was destroyed|Cannot find context/.test(e.message))throw e;await page.waitForLoadState('domcontentloaded');}
      await page.waitForTimeout(40);
    };
    const press=async b=>{await down(b);await down();};
    const focus=async s=>page.locator(s).first().focus();
    const active=()=>page.evaluate(()=>document.activeElement.id||document.activeElement.className);
    await page.goto(base+'/library/');await page.bringToFront();await page.waitForSelector('.cover');await down();
    await press(8);assert.equal(await page.locator('#padGuide').evaluate(n=>n.open),true);await press(1);assert.equal(await page.locator('#padGuide').evaluate(n=>n.open),false);
    await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await down();
    assert.match(await page.locator('#padDeviceStatus').innerText(),/已识别设备/);assert.doesNotMatch(await page.locator('#padDeviceStatus').innerText(),/已就绪/);
    // Sorting must not open a native OS popup or trap the controller focus.
    for(const width of [390,1600]){
      await page.setViewportSize({width,height:1000});await page.locator('#sortControl').click();await down();assert.equal(await page.locator('#sort').inputValue(),'title');
      await press(14);assert.equal(await page.locator('#sort').inputValue(),'original');await press(15);assert.equal(await page.locator('#sort').inputValue(),'title');
      await press(0);assert.equal(await page.locator('#sort').inputValue(),'original');await press(13);assert.match(await active(),/cover/);
      await focus('#sortControl');await press(12);assert.equal(await page.locator('#search').evaluate(n=>n===document.activeElement),true);
      await focus('#sortControl');await press(1);assert.match(await active(),/cover/);await focus('#sortControl');await press(7);assert.match(await active(),/cover/);
    }
    await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await down();await page.evaluate(()=>document.activeElement.blur());
    await press(15);assert.match(await active(),/cover/);
    await press(15);assert.equal(await page.locator('.cover').nth(1).evaluate(n=>n===document.activeElement),true);
    await press(0);assert.equal(await page.locator('#detail').evaluate(n=>n.open),true);assert.equal(await active(),'play');
    await press(3);assert.match(await page.locator('#save').innerText(),/已收藏/);
    await press(2);assert.equal(await page.locator('#preview').evaluate(n=>n.style.display),'block');
    await focus('#core');await press(15);assert.equal(await page.locator('#core').inputValue(),'mame2003_plus');
    await press(13);assert.notEqual(await active(),'core');
    await press(1);assert.equal(await page.locator('#detail').evaluate(n=>n.open),false);assert.match(await active(),/cover/);
    await press(5);assert.equal(await page.locator('#pageInfo').innerText(),'2 / 3');
    await down(5);await page.waitForTimeout(500);assert.equal(await page.locator('#pageInfo').innerText(),'3 / 3');await down();
    await press(5);assert.equal(await page.locator('#pageInfo').innerText(),'3 / 3');
    await press(4);assert.equal(await page.locator('#pageInfo').innerText(),'2 / 3');
    await press(7);assert.match(await active(),/prev|next/);await press(7);assert.equal(await page.locator('[data-view="all"]').evaluate(n=>n===document.activeElement),true);
    await press(7);assert.equal(await page.locator('#chips button').first().evaluate(n=>n===document.activeElement),true);
    await focus('#chips button[data-category="对战"]');await press(0);assert.equal(await page.locator('#count').innerText(),'25 款');
    await focus('#chips button[data-category=""]');await press(0);
    await press(2);assert.equal(await page.locator('#padKeyboard').evaluate(n=>n.open),true);
    await page.locator('.pad-keys button').filter({hasText:/^g$/}).focus();await press(0);assert.equal(await page.locator('#search').inputValue(),'g');
    await page.locator('.pad-key-actions button').filter({hasText:'清空'}).focus();await press(0);assert.equal(await page.locator('#search').inputValue(),'');
    await press(1);assert.match(await active(),/cover/);
    // Blur must update the label immediately, even before another animation frame.
    await focus('.cover');
    const lost=await page.evaluate(()=>{window.dispatchEvent(new Event('blur'));return document.querySelector('#padDeviceStatus').textContent;});assert.match(lost,/已暂停接收/);
    await down(0);assert.equal(await page.locator('#detail').evaluate(n=>n.open),false);
    await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await down(0);assert.equal(await page.locator('#detail').evaluate(n=>n.open),false,'held A on focus regain must not activate');
    await down();assert.match(await page.locator('#padDeviceStatus').innerText(),/已收到输入/);
    await press(0);assert.equal(await page.locator('#detail').evaluate(n=>n.open),true);await press(1);
    // Analog input and dead zone; disconnect/reconnect must not activate held A.
    await focus('.cover');await page.evaluate(()=>window.pads[0].axes=[.2,0]);await page.waitForTimeout(90);assert.equal(await page.locator('.cover').first().evaluate(n=>n===document.activeElement),true);
    await page.evaluate(()=>window.pads[0].axes=[.8,0]);await page.waitForTimeout(90);assert.equal(await page.locator('.cover').nth(1).evaluate(n=>n===document.activeElement),true);
    await page.evaluate(()=>window.pads[0].connected=false);await down();assert.match(await page.locator('#gamepadHint').innerText(),/断开/);
    await page.evaluate(()=>{window.pads[0].axes=[0,0];window.pads[0].connected=true;window.pads[0].buttons[0]={pressed:true,value:1};});await page.waitForTimeout(100);assert.equal(await page.locator('#detail').evaluate(n=>n.open),false);await down();
    // Actual reported setup: a non-standard Leonardo dial stays off-centre while
    // the UU virtual Xbox pad sits at index 1. The dial must never steal focus.
    await page.evaluate(()=>{
      const buttons=()=>Array.from({length:17},()=>({pressed:false,value:0}));
      window.pads=[{id:'Arduino Leonardo',index:0,connected:true,mapping:'',axes:[.6929134,-.6456693,0],buttons:buttons()},
        {id:'UU Xbox 360 Controller',index:1,connected:true,mapping:'standard',axes:[0,0,0,0],buttons:buttons()}];
    });
    await down();await focus('.cover');await press(15);
    assert.equal(await page.locator('.cover').nth(1).evaluate(n=>n===document.activeElement),true,'UU pad must work beside an off-centre Leonardo');
    assert.match(await page.locator('#padDeviceStatus').innerText(),/UU Xbox.*(已识别设备|正在接收输入|已收到输入)/);
    await page.waitForTimeout(450);await press(0);assert.equal(await page.locator('#detail').evaluate(n=>n.open),true);await press(1);
    await page.locator('#padDevice').selectOption(JSON.stringify(['Arduino Leonardo',0]));await page.waitForTimeout(90);assert.match(await page.locator('#padDeviceStatus').innerText(),/Arduino.*松开/);
    await page.locator('#padDevice').selectOption('');await down();assert.match(await page.locator('#padDeviceStatus').innerText(),/UU Xbox.*(已识别设备|正在接收输入|已收到输入)/);
    // Another standard pad with a held axis must not bounce ownership every frame.
    await page.evaluate(()=>window.pads.push({id:'Second Xbox',index:2,connected:true,mapping:'standard',axes:[1,0],buttons:Array.from({length:17},()=>({pressed:false,value:0}))}));
    await down();await page.waitForTimeout(120);assert.match(await page.locator('#padDeviceStatus').innerText(),/UU Xbox/);
    await page.evaluate(()=>window.pads=[{id:'Test standard pad',index:0,connected:true,mapping:'standard',axes:[0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0}))}]);await down();
    await focus('.cover');await down(9);await page.waitForURL('**/play.html?**');assert.match(await page.url(),/src=/);
    await page.evaluate(()=>{const b=document.createElement('button');b.className='ejs_start_button';b.hidden=true;b.onclick=()=>window.startRequested=true;document.querySelector('#game').append(b);});
    await page.waitForFunction(()=>!document.querySelector('#playerStart').disabled);await down();
    for(const width of [390,750,1280,1920]){await page.setViewportSize({width,height:900});assert.equal(await page.locator('#playerLaunch').evaluate(n=>n.scrollWidth<=n.clientWidth+1),true,`startup overflow ${width}`);}
    await page.setViewportSize({width:1600,height:1000});await focus('#playerStart');await press(13);assert.equal(await active(),'playerLaunchBack');await press(12);assert.equal(await active(),'playerStart');await press(0);assert.equal(await page.evaluate(()=>window.startRequested),true);assert.equal(await page.locator('#playerLaunch').isVisible(),false);
    await page.evaluate(()=>{window.stateSlot=null;window.EJS_emulator={started:true,paused:false,pause(){this.paused=true},play(){this.paused=false},getBaseFileName:()=> 'game0',storage:{states:{async put(k,v){window.stateSlot=v},async get(){return window.stateSlot}}},gameManager:{getState:()=>[1,2,3],loadState(s){window.loadedState=s},restart(){window.restarted=true}}};});
    for(const width of [390,750,1280,1920]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>{const g=document.querySelector('#game').getBoundingClientRect(),h=document.querySelector('header').getBoundingClientRect();return g.top>=h.bottom-1&&g.bottom<=innerHeight+1&&h.height<=64&&document.documentElement.scrollWidth<=innerWidth;}),true,`player geometry ${width}`);assert.equal(await page.locator('#padDeviceStatus').isVisible(),false);}
    await page.setViewportSize({width:1600,height:1000});
    // Once started, the menu chord opens a pause menu without leaving the game.
    await down(8,9);await page.waitForTimeout(1100);assert.match(page.url(),/play.html/);await down();assert.equal(await page.locator('#padGuide').evaluate(n=>n.open),true);await press(1);
    await page.locator('#padGuideButton').click();await page.locator('#padGuide').getByRole('button',{name:'手柄设置',exact:true}).click();await page.locator('#padSetting-menu').selectOption('10,11');await page.locator('#padSetting-hold').selectOption('500');await press(1);
    await down(10,11);await page.waitForTimeout(550);await down();assert.equal(await page.locator('#padGuide').evaluate(n=>n.open),true);assert.equal(await page.evaluate(()=>EJS_emulator.paused),true);
    assert.match(await page.locator('#padMenuHelp').innerText(),/L3 \+ R3/);
    await page.locator('#padGuide').getByRole('button',{name:'手柄设置',exact:true}).click();await page.locator('#padSetting-menu').selectOption('4,5');await press(1);
    assert.match(await page.locator('#padMenuHelp').innerText(),/LB \+ RB/);assert.equal(await page.evaluate(()=>EJS_emulator.paused),true);
    await page.getByRole('button',{name:'快捷存档',exact:true}).focus();await press(0);assert.deepEqual(await page.evaluate(()=>window.stateSlot),[1,2,3]);
    await page.getByRole('button',{name:'读取快捷存档',exact:true}).focus();await press(0);assert.deepEqual(await page.evaluate(()=>window.loadedState),[1,2,3]);assert.equal(await page.evaluate(()=>EJS_emulator.paused),false);
    await page.locator('#padGuideButton').click();await page.locator('#padGuide').getByRole('button',{name:'手柄设置',exact:true}).click();await page.getByRole('button',{name:'恢复默认设置',exact:true}).click();await press(1);
    await down(8,9);await page.waitForFunction(()=>document.querySelector('#padGuide').open,null,{timeout:5000});await down();
    await page.getByRole('button',{name:'返回大厅…',exact:true}).focus();await press(0);
    assert.equal(await page.getByRole('heading',{name:'返回大厅？'}).count(),1);
    await page.getByRole('button',{name:'确认返回大厅',exact:true}).focus();await down(0);
    await page.waitForURL('**/library/');await page.waitForSelector('.cover');await down();assert.equal(await page.locator('.cover').first().evaluate(n=>n===document.activeElement),true);
    for(const width of [390,750,1280,1920]){
      await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`overflow at ${width}`);
    }
    for(const name of ['help','support','stick-test']){
      await page.goto(`${base}/${name}.html`);await down();await press(8);assert.equal(await page.locator('#padGuide').evaluate(n=>n.open),true);await press(1);await press(1);await page.waitForURL('**/library/');await page.waitForSelector('.cover');await down();
    }
    await page.locator('#padSettingsButton').click();await down();await press(15);assert.equal(await page.locator('#padSetting-menu').inputValue(),'10,11');
    await page.locator('#padSetting-hold').selectOption('500');await page.locator('#padSetting-deadzone').selectOption('0.75');await page.locator('#padSetting-repeat').selectOption('220');await press(1);
    await page.reload();await page.waitForSelector('.cover');await down();await page.locator('#padSettingsButton').click();
    assert.equal(await page.locator('#padSetting-menu').inputValue(),'10,11');assert.equal(await page.locator('#padSetting-hold').inputValue(),'500');assert.equal(await page.locator('#padSetting-deadzone').inputValue(),'0.75');assert.equal(await page.locator('#padSetting-repeat').inputValue(),'220');
    await page.getByRole('button',{name:'恢复默认设置',exact:true}).click();assert.equal(await page.locator('#padSetting-menu').inputValue(),'8,9');await press(1);
    fs.mkdirSync(path.resolve(__dirname,'../test-results'),{recursive:true});
    await page.setViewportSize({width:1600,height:1000});await page.screenshot({path:path.resolve(__dirname,'../test-results/controller-library.png')});
    await page.locator('#padSettingsButton').click();
    for(const width of [390,750,1280,1920]){await page.setViewportSize({width,height:900});assert.equal(await page.locator('#padSettings').evaluate(n=>n.scrollWidth>n.clientWidth+1),false,`settings overflow at ${width}`);}
    await page.setViewportSize({width:1280,height:900});await page.screenshot({path:path.resolve(__dirname,'../test-results/controller-settings.png')});
    assert.deepEqual(errors,[]);console.log('PASS: controller navigation, modal, favorites, preview, core, paging, search, analog, reconnect, launch/return, responsive type.');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>server.close());
