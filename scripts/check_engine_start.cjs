// Use the installed, unmocked engine: constructor bugs must fail CI before release.
const {chromium}=require('playwright'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});try{
 const page=await browser.newPage(),errors=[],requests=[],base=process.env.DEMO_URL||'http://127.0.0.1:18893';
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));await page.addInitScript(()=>navigator.getGamepads=()=>[]);
 await page.goto(base+'/play.html?core=mame2003_plus&src=/roms/constructor-check.zip&name=EngineCheck');
 await page.waitForFunction(()=>window.EJS_emulator&&document.querySelector('#playerStart')?.disabled===false,null,{timeout:15000});
 assert.deepEqual(errors,[]);assert.ok(requests.some(u=>u===base+'/data/version.json'),'version check uses the configured local data directory');assert.ok(!requests.some(u=>u.startsWith('https://cdn.emulatorjs.org/')));
 console.log('PASS: real installed EmulatorJS constructs successfully, local version lookup succeeds and Start becomes ready without a core predownload.');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
