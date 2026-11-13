// Browser coverage of recent cards, legacy saves, core selection and navigation.
const {chromium}=require('playwright'),assert=require('node:assert/strict');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../site');
const games=Array.from({length:6},(_,i)=>({id:String(i),title:['拳皇97','恐龙快打','合金弹头','街头霸王','雪人兄弟','三国战纪'][i],filename:`game${i}.zip`,rom:`/roms/游戏${i}.zip`,category:'动作',core:'fbneo',publisher:'',aliases:''}));
let binaryRequests=0;
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/arcade/auth/session'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({username:'cloud-user'}));return;}
 if(url.pathname==='/arcade/sync/metadata'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({protocol:2,items:[{kind:'recent',id:'0',value:1700000000000}],games:[{game:'resume:mame2003_plus:/roms/游戏0.zip'}]}));return;}
 if(url.pathname==='/arcade/sync/saves'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({points:[{id:'remote',updatedAt:1700000000000,source:'manual',sessionId:'remote-session',core:'mame2003_plus'}]}));return;}
 if(url.pathname.startsWith('/arcade/sync/')){binaryRequests++;res.statusCode=500;res.end();return;}
 url.pathname=url.pathname.replace(/^\/arcade\//,'/');
 if(url.pathname==='/library/catalog.json'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({games,categories:{动作:6}}));return;}
 const file=path.join(root,url.pathname.endsWith('/')?url.pathname+'index.html':url.pathname);
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.statusCode=404;res.end();return;}
 res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.png')?'image/png':file.endsWith('.svg')?'image/svg+xml':'text/html');res.end(fs.readFileSync(file));
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{window.pad={id:'Xbox test',index:0,mapping:'standard',connected:true,axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0}))};Object.defineProperty(navigator,'getGamepads',{value:()=>[pad]});});
  const base=`http://127.0.0.1:${server.address().port}`;
  await page.goto(base+'/library/');await page.waitForSelector('#grid .cover');
  assert.equal(await page.locator('#homeRecent').isVisible(),false,'new users retain introductory home');
  await page.evaluate(async()=>{
   const canvas=document.createElement('canvas');canvas.width=256;canvas.height=192;const c=canvas.getContext('2d');c.fillStyle='#18274a';c.fillRect(0,0,256,192);c.fillStyle='#d0ef88';for(let i=0;i<12;i++)c.fillRect(i*24,100-i%4*16,16,92);const thumbnail=canvas.toDataURL('image/png');
   await ArcadePreferences.progress('put','resume:fbneo:/roms/游戏0.zip',{state:new Uint8Array([1]),updatedAt:1000,core:'fbneo'});
   await ArcadePreferences.progress('put','resume:mame2003_plus:/roms/游戏0.zip',{state:new Uint8Array([2]),updatedAt:2000,source:'manual',sessionId:'new',thumbnail});
   await ArcadePreferences.progress('put','resume:fbneo:/roms/游戏2.zip',{state:new Uint8Array([3]),updatedAt:3000,source:'auto'});
   // Another account's newer state must never win.
   await new Promise((resolve,reject)=>{const r=indexedDB.open('PixelArcade-progress-v1');r.onerror=reject;r.onsuccess=()=>{const db=r.result,tx=db.transaction('snapshots','readwrite');tx.objectStore('snapshots').put({state:new Uint8Array([9]),updatedAt:999999},'pixelarcade:other:resume:fbneo:/roms/游戏0.zip');tx.oncomplete=()=>{db.close();resolve();};};});
   localStorage.setItem('arcade-recent',JSON.stringify(['deleted','0','1','2','3','4','5']));
  });
  await page.reload();await page.waitForSelector('#homeRecent .recent-play');
  await page.waitForFunction(()=>document.querySelector('#homeRecent .recent-play').textContent==='继续游玩');
  assert.equal(await page.locator('.recent-card').count(),4);assert.equal(await page.locator('.hero').evaluate(n=>n.classList.contains('hero-compact')),true);
  const cards=page.locator('.recent-card'),href=await cards.nth(0).locator('.recent-play').getAttribute('href');
  assert.equal(new URL(href,base).searchParams.get('core'),'mame2003_plus');assert.equal(new URL(href,base).searchParams.get('point'),'2000');
  assert.equal(await cards.nth(0).locator('.resume-preview img').isVisible(),true);
  await page.waitForFunction(()=>document.querySelectorAll('.recent-status')[1].textContent.includes('暂无存档'));
  assert.match(await cards.nth(1).innerText(),/开始游戏/);assert.match(await cards.nth(2).innerText(),/此存档暂无画面预览/);
  // The home lookup must not call the full-state remote merge/download API.
  const summary=await page.evaluate(async()=>{ArcadeAccountSync.mergeSaves=()=>{throw Error('full state download forbidden');};const p=await ArcadePreferences.resumeSummary('/roms/游戏0.zip');return {core:p.core,state:p.state};});
  assert.equal(summary.core,'mame2003_plus');assert.equal(summary.state,undefined);
  await page.evaluate(()=>document.querySelector('#padGuide')?.close());await cards.nth(0).locator('.recent-details').click();assert.equal(await page.locator('#detail').evaluate(n=>n.open),true);await page.locator('#detail .close').click();
  assert.equal(await cards.nth(0).locator('.recent-details').evaluate(n=>n===document.activeElement),true);
  await page.locator('#search').fill('拳皇');assert.equal(await page.locator('#homeRecent').isVisible(),false);await page.locator('#search').fill('');assert.equal(await page.locator('#homeRecent').isVisible(),true);
  await page.locator('#homeRecentAll').click();assert.equal(await page.locator('[data-view="recent"]').evaluate(n=>n.classList.contains('selected')),true);assert.equal(await page.locator('#homeRecent').isVisible(),false);await page.locator('[data-view="all"]').click();
  for(const width of [1600,390]){
   await page.setViewportSize({width,height:1000});await page.evaluate(()=>scrollTo(0,0));
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`no overflow at ${width}`);
   fs.mkdirSync(path.resolve(__dirname,'../test-results'),{recursive:true});await page.screenshot({path:path.resolve(__dirname,`../test-results/home-recent-${width}.png`)});
  }
  await page.evaluate(()=>ArcadePreferences.update({resume:'off'}));await page.waitForFunction(()=>document.querySelector('#homeRecent .recent-play').textContent==='开始游戏');
  assert.equal(new URL(await cards.nth(0).locator('.recent-play').getAttribute('href'),base).searchParams.get('resume'),'new');
  await page.evaluate(()=>ArcadePreferences.update({resume:'offer'}));await page.waitForFunction(()=>document.querySelector('#homeRecent .recent-play').textContent==='继续游玩');
  await page.setViewportSize({width:1600,height:1000});await page.bringToFront();await page.locator('#padActivate').click();
  const down=async buttons=>{await page.evaluate(bs=>pad.buttons.forEach((b,i)=>{b.pressed=bs.includes(i);b.value=+b.pressed;}),buttons);await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await page.waitForTimeout(40);};
  const press=async b=>{await down([b]);await down([]);};await down([]);
  await page.locator('#sortControl').focus();await press(7);assert.equal(await cards.nth(0).locator('.recent-play').evaluate(n=>n===document.activeElement),true,'RT reaches home cards');
  await press(7);assert.equal(await page.locator('#grid .cover').first().evaluate(n=>n===document.activeElement),true,'RT reaches game grid');
  await cards.nth(0).locator('.recent-play').focus();await press(15);assert.equal(await cards.nth(0).locator('.recent-details').evaluate(n=>n===document.activeElement),true,'right reaches details');
  await page.route('**/play.html?**',r=>r.fulfill({contentType:'text/html',body:'<h1>launched</h1>'}));await cards.nth(0).locator('.recent-play').click();
  assert.equal(new URL(page.url()).searchParams.get('core'),'mame2003_plus');
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('arcade-recent'))[0]),'0');
  await page.goto(base+'/library/');await page.waitForSelector('#homeRecent .recent-play');assert.equal(await cards.nth(0).locator('.recent-play').evaluate(n=>n===document.activeElement),true,'return restores home card focus');
  const cloud=await browser.newPage();await cloud.goto(base+'/arcade/library/');await cloud.waitForFunction(()=>document.querySelector('#homeRecent .recent-play')?.textContent==='继续游玩');
  assert.match(await cloud.locator('#homeRecent .recent-play').getAttribute('href'),/core=mame2003_plus/);assert.equal(binaryRequests,0,'cloud home must fetch no binary states');await cloud.close();
  assert.deepEqual(errors,[]);console.log('PASS: recent home, legacy/multiple-core saves, account isolation, local/cloud summary-only reads, preferences, responsive layout, controller and return focus');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
