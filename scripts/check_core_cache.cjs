// Verify reusable binary downloads and cache/data boundaries with real IndexedDB.
const {chromium}=require('playwright'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});try{
 const page=await browser.newPage(),base=process.env.DEMO_URL||'http://127.0.0.1:18893';let gets=0,revision='v1';
 await page.addInitScript(()=>navigator.getGamepads=()=>[]);
 await page.route('**/library/catalog.json',r=>r.fulfill({json:{games:[{id:'dino',title:'测试游戏',category:'动作',filename:'dino.zip',rom:'/roms/dino.zip',core:'mame2003_plus'}],categories:{动作:1}}}));
 await page.route('**/data/cores/*-wasm.data',r=>{if(r.request().method()==='GET')gets++;return r.fulfill({status:200,headers:{etag:revision,'content-type':'application/octet-stream','content-length':'2048'},body:r.request().method()==='HEAD'?'':Buffer.alloc(2048,revision==='v1'?1:2)});});
 await page.goto(base+'/library/');await page.waitForFunction(()=>window.ArcadeCoreCache);
 assert.equal((await page.evaluate(()=>ArcadeCoreCache.preload())).count,1);assert.equal(gets,1);
 await page.evaluate(()=>ArcadeCoreCache.preload());assert.equal(gets,1,'warm core must avoid a second GET');
 assert.equal(await page.evaluate(()=>ArcadeCoreCache.prepare('mame2003_plus')),true);
 assert.deepEqual(await page.evaluate(async()=>{const data=await(await fetch(EJS_paths['mame2003_plus-legacy-wasm.data'])).arrayBuffer();return [data.byteLength,new Uint8Array(data)[0]];}),[2048,1],'player receives the cached bytes through its supported EJS_paths hook');
 revision='v2';await page.evaluate(()=>ArcadeCoreCache.preload());assert.equal(gets,2,'changed core validator invalidates old bytes');
 await page.evaluate(async()=>{localStorage.setItem('arcade-favorites','["dino"]');localStorage.setItem('arcade-recent','["dino"]');await ArcadePreferences.progress('put','keep',{state:new Uint8Array([7])});});
 assert.equal(await page.evaluate(()=>ArcadePreferences.clearCache()),2048);
 assert.deepEqual(await page.evaluate(async()=>[localStorage.getItem('arcade-favorites'),localStorage.getItem('arcade-recent'),Array.from((await ArcadePreferences.progress('get','keep')).state)]),['["dino"]','["dino"]',[7]]);
 await page.evaluate(()=>ArcadeCoreCache.preload());assert.equal(gets,3,'cleaned core downloads again');
 await page.reload();await page.getByRole('button',{name:'取消收藏 测试游戏',exact:true}).click();
 assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('arcade-library-backup')).favorites),['dino']);
 await page.getByRole('button',{name:'游戏厅设置',exact:true}).click();await page.getByRole('button',{name:'合并恢复上次收藏与历史',exact:true}).click();await page.getByRole('button',{name:'取消收藏 测试游戏',exact:true}).waitFor();
 await page.getByRole('button',{name:'游戏厅设置',exact:true}).click();
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'导出收藏与历史备份',exact:true}).click();const exported=JSON.parse(require('node:fs').readFileSync(await(await download).path(),'utf8'));assert.deepEqual(exported.favorites,['dino']);
 const input=page.locator('#arcadeSettings input[type=file]');
 await input.setInputFiles({name:'wrong-account.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({...exported,scope:'pixelarcade:other:'}))});await page.getByText('请选择当前账号的收藏历史备份',{exact:true}).waitFor();
 await input.setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({...exported,favorites:['other'],recent:['other']}))});await page.waitForFunction(()=>JSON.parse(localStorage.getItem('arcade-favorites')).includes('other'));assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('arcade-favorites'))),['dino','other']);
 console.log('PASS: core preload/reuse/version refresh, real player blob bytes, safe cache cleanup, collection backup and merge recovery.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
