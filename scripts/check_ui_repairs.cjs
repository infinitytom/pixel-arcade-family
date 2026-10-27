// Regression coverage for reported navigation, preview and DualSense issues.
const {chromium}=require('playwright');const assert=require('node:assert/strict');const crypto=require('node:crypto');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{sessionStorage.setItem('arcade-pad-intro','1');window.pad={id:'Sony DualSense',index:0,mapping:'standard',connected:true,axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0}))};Object.defineProperty(navigator,'getGamepads',{value:()=>[pad]});});
  const base=process.env.DEMO_URL||'http://127.0.0.1:18893';await page.goto(base+'/library/');await page.waitForFunction(()=>window.ArcadeInput&&window.ArcadePreferences);
  const down=async buttons=>{await page.evaluate(bs=>pad.buttons.forEach((b,i)=>{b.pressed=bs.includes(i);b.value=+b.pressed;}),buttons);await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await page.waitForTimeout(40);};const press=async button=>{await down([button]);await down([]);};
  await page.bringToFront();await page.evaluate(()=>document.querySelector('#padGuide')?.close());await page.locator('#padActivate').click();await down([]);
  for(const width of [390,1440]){
    await page.setViewportSize({width,height:900});await page.evaluate(()=>ArcadePreferences.open());await page.locator('#arcadeSettings h2').click();await down([]);
    const list=page.locator('#arcadeSettings button,#arcadeSettings select'),count=await list.count();await list.first().focus();
    for(let i=1;i<count;i++){await press(13);assert.equal(await list.nth(i).evaluate(n=>n===document.activeElement),true,`down reaches control ${i} at ${width}: ${await page.evaluate(()=>[document.activeElement.outerHTML,document.querySelector('#padDeviceStatus').textContent])}`);const box=await list.nth(i).boundingBox();assert.ok(box.y>=0&&box.y+box.height<=900,`control ${i} is onscreen`);}
    for(let i=count-2;i>=0;i--){await press(12);assert.equal(await list.nth(i).evaluate(n=>n===document.activeElement),true,`up reaches control ${i}`);}
    await page.locator('#arcadeSettings .settings-close').click();
  }
  await page.evaluate(()=>ArcadePreferences.open());const preview=page.locator('#settingsPreview');const hash=async()=>crypto.createHash('sha256').update(await preview.screenshot()).digest('hex');
  await page.getByLabel('默认滤镜',{exact:true}).selectOption('original');const original=await hash();await page.getByLabel('默认滤镜',{exact:true}).selectOption('crt');assert.notEqual(await hash(),original);
  const crt=await hash();await page.getByLabel('默认效果强度',{exact:true}).selectOption('strong');assert.notEqual(await hash(),crt);
  const strong=await hash();await page.getByLabel('默认屏幕纹理',{exact:true}).selectOption('aperture');assert.notEqual(await hash(),strong);
  const mask=await hash();await page.getByLabel('默认机台遮罩',{exact:true}).selectOption('none');assert.notEqual(await hash(),mask);
  await page.getByLabel('默认滤镜',{exact:true}).selectOption('soft');assert.equal(await preview.getAttribute('data-filter'),'soft');await page.screenshot({path:'test-results/settings-preview-repaired.png'});
  await page.locator('#arcadeSettings .settings-close').click();await page.evaluate(()=>ArcadeInput.setDevice(pad));assert.equal(await page.locator('body').getAttribute('data-input-profile'),'ps5');
  assert.match(await page.locator('#inputLegend').innerText(),/创建键/);assert.match(await page.locator('#inputLegend').innerText(),/选项键/);assert.equal(await page.locator('#inputLegend svg').count(),2);
  await page.locator('#padSettingsButton').click();await page.evaluate(()=>ArcadeInput.setDevice(pad));assert.equal(await page.locator('#padSetting-menu option').first().textContent(),'创建键 + 选项键');assert.equal(await page.evaluate(()=>ArcadeInput.buttonLabels(pad).SELECT),'创建键');
  await page.evaluate(()=>ArcadeInput.setDevice({id:'Sony DualShock 4',mapping:'standard'}));assert.equal(await page.locator('body').getAttribute('data-input-profile'),'ps4');assert.equal(await page.locator('#padSetting-menu option').first().textContent(),'分享键 + 选项键');
  assert.deepEqual(errors,[]);console.log('PASS: all settings reachable in both directions at 390/1440px, visible changing previews and distinct PS4/PS5 function keys.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
