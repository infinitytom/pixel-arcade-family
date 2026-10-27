// Optional integration check against a local server with EmulatorJS and a licensed ROM.
// Uses the real emulator input handler and core; generated Gamepad states are not hardware tests.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{
  const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];
    page.setDefaultTimeout(10000);
    page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>{localStorage.setItem('pixelarcade:local:preferences',JSON.stringify({fullscreen:'off',autoSave:'off'}));
      const pad=(id,index,mapping,axes=[0,0,0,0])=>({id,index,mapping,axes,connected:true,buttons:Array.from({length:17},()=>({pressed:false,value:0}))});
      window.pads=[pad('Arduino Leonardo',0,'',[.69,-.65,0,0]),pad('Xbox player one',1,'standard'),pad('Xbox player two',2,'standard')];
      Object.defineProperty(navigator,'getGamepads',{value:()=>window.pads});
    });
    const down=async(bs=[],index=1)=>{await page.evaluate(({bs,index})=>{const p=window.pads.find(p=>p?.index===index);p.buttons.forEach((b,i)=>{b.pressed=bs.includes(i);b.value=b.pressed?1:0;});},{bs,index});await page.waitForTimeout(120);};
    const press=async(b,index=1)=>{await down([b],index);await down([],index);};
    await page.goto((process.env.DEMO_URL||'http://127.0.0.1:18893')+(process.env.PLAYER_PATH||'/play.html?core=mame2003_plus&src=/roms/%E5%8A%A8%E4%BD%9C%E8%A1%97%E6%9C%BA/dino.zip&name=恐龙新世纪'));
    await page.bringToFront();await page.locator('.ejs_start_button').waitFor({timeout:30000});
    await page.locator('#launchStatus').click();await down();assert.equal(await page.locator('#playerStart').isEnabled(),true);fs.mkdirSync('test-results',{recursive:true});await page.screenshot({path:'test-results/player-start.png'});await press(0);assert.equal(await page.locator('#playerLaunch').isVisible(),false);
    await page.waitForFunction(()=>window.EJS_emulator?.started,null,{timeout:90000});await page.waitForTimeout(3000);
    assert.deepEqual(await page.evaluate(()=>EJS_emulator.gamepadSelection.slice(0,2)),['Xbox player one_1','Xbox player two_2']);
    await page.evaluate(()=>{window.inputs=[];const em=EJS_emulator,original=em.gameManager.simulateInput.bind(em.gameManager);em.gameManager.simulateInput=(p,b,v)=>{inputs.push([p,b,v]);return original(p,b,v);};});
    await press(8);await press(9);await press(0);await press(8,2);
    for(const expected of [[0,2,1],[0,3,1],[0,8,1],[1,2,1]])assert.equal(await page.evaluate(e=>inputs.some(v=>JSON.stringify(v)===JSON.stringify(e)),expected),true,`missing ${expected}`);
    console.log('Core P1/P2 inputs passed');
    await page.evaluate(()=>window.pads[1].axes[0]=.8);await page.waitForTimeout(100);await page.evaluate(()=>window.pads[1].axes[0]=0);await page.waitForTimeout(100);
    assert.equal(await page.evaluate(()=>inputs.some(v=>v[0]===0&&v[1]===7&&v[2]===1)),true,'arcade left stick must become digital direction');
    fs.mkdirSync('test-results',{recursive:true});
    for(const width of [390,750,1280,1920]){
      await page.setViewportSize({width,height:900});await page.waitForTimeout(100);
      assert.equal(await page.evaluate(()=>{const g=document.querySelector('#game').getBoundingClientRect(),h=document.querySelector('header').getBoundingClientRect();return g.top>=h.bottom-1&&g.bottom<=innerHeight+1&&h.height<=64&&document.documentElement.scrollWidth<=innerWidth;}),true,`player geometry ${width}`);
      assert.equal(await page.locator('#padDeviceStatus').isVisible(),false);
    }
    await page.setViewportSize({width:1280,height:900});await page.screenshot({path:'test-results/player-game.png'});
    console.log('Layout passed');await press(14);
    await down([8,9]);await page.waitForTimeout(1100);await down();assert.equal(await page.locator('#padGuide').evaluate(n=>n.open),true);
    assert.equal(await page.evaluate(()=>EJS_emulator.paused),true);
    await page.evaluate(()=>inputs.length=0);await press(13);await press(12);
    assert.equal(await page.evaluate(()=>inputs.some(v=>v[2]!==0)),false,'menu directions must not reach core');
    await page.screenshot({path:'test-results/player-menu.png'});
    await page.getByRole('button',{name:'手柄设置',exact:true}).focus();await press(0);
    await page.getByLabel('按键设置玩家',{exact:true}).selectOption('1');await page.getByLabel('动作 A手柄按键',{exact:true}).selectOption('BUTTON_3');
    assert.equal(await page.evaluate(()=>EJS_emulator.controls[1][8].value2),'BUTTON_3');
    await press(1);assert.equal(await page.evaluate(()=>EJS_emulator.paused),true);await press(1);assert.equal(await page.evaluate(()=>EJS_emulator.paused),false);
    await press(2,2);assert.equal(await page.evaluate(()=>inputs.some(v=>v[0]===1&&v[1]===8&&v[2]===1)),true,'player two edited mapping');
    console.log('Opening Home menu');await press(16);await page.getByRole('button',{name:'全屏 / 退出全屏（F）',exact:true}).focus();await press(0);
    assert.equal(await page.evaluate(()=>document.body.classList.contains('player-immersive')),true);assert.equal(await page.locator('header').isVisible(),false);
    console.log('Opening Home menu');await press(16);await page.getByRole('button',{name:'全屏 / 退出全屏（F）',exact:true}).focus();await press(0);assert.equal(await page.locator('header').isVisible(),true);
    // A sparse physical index after disconnect must still reach the right player.
    await page.evaluate(()=>window.pads[0]=null);await page.waitForTimeout(200);await press(8);
    assert.equal(await page.evaluate(()=>inputs.some(v=>v[0]===0&&v[1]===2&&v[2]===1)),true);
    await page.keyboard.press('Escape');assert.equal(await page.locator('#padGuide').evaluate(n=>n.open),true);
    await page.getByRole('button',{name:'返回大厅…',exact:true}).focus();await press(0);await page.getByRole('button',{name:'确认返回大厅',exact:true}).focus();await down([0]);await page.waitForURL('**/library/');
    assert.deepEqual(errors,[]);console.log('PASS: real EmulatorJS/core, P1/P2 input, remapping, arcade stick, pause isolation, full screen, sparse indices, return and responsive geometry.');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
