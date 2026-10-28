// Validate the visible cabinet surfaces at desktop, portrait and short/wide sizes.
const {chromium}=require('playwright'),assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const site=path.resolve(__dirname,'../site');
const server=http.createServer((req,res)=>{const pathname=decodeURIComponent(new URL(req.url,'http://fixture').pathname);
 if(pathname.startsWith('/data/')){res.writeHead(200,{'Content-Type':'application/javascript'});res.end('');return;}
 if(pathname.endsWith('private-shaders.json')){res.writeHead(404);res.end();return;}
 const file=path.resolve(site,'.'+pathname);if(!file.startsWith(site+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
 res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});try{
 for(const [width,height,aspect] of [[1600,1000,4/3],[390,844,.75],[844,390,4]]){
  const page=await browser.newPage({viewport:{width,height}});await page.addInitScript(()=>navigator.getGamepads=()=>[]);
  await page.goto(`http://127.0.0.1:${server.address().port}/play.html?core=fbneo&src=/roms/test.zip&aspect=${aspect}`);
  await page.waitForFunction(()=>document.querySelector('#arcadeDecoration')?.style.visibility==='');
  for(const frame of ['club','neon']){
   await page.evaluate(frame=>ArcadePreferences.update({frame}),frame);
   const geometry=await page.evaluate(()=>{const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,bottom:r.bottom,right:r.right};};return {screen:rect('#game'),glass:rect('.arcade-glass'),back:rect('.cabinet-bezel'),surface:rect('.deck-surface'),front:rect('.deck-fascia'),base:rect('.cabinet-coins'),stage:rect('#playerStage'),scene:getComputedStyle(document.querySelector('.arcade-scene')).transform};});
   assert.equal(geometry.scene,'none');assert.ok(Math.abs(geometry.screen.x-geometry.glass.x)<1&&Math.abs(geometry.screen.y-geometry.glass.y)<1,'screen aligns with its glass');
   assert.ok(geometry.front.w>geometry.back.w+10,'control shelf projects beyond the upright cabinet');
   assert.ok(Math.abs(geometry.surface.y-geometry.back.bottom)<2,'rear of shelf meets the lower monitor surround');
   assert.ok(Math.abs(geometry.surface.bottom-geometry.front.y)<2,'sloped surface meets the front fascia');
   assert.ok(geometry.base.y>=geometry.front.y&&geometry.base.bottom<=geometry.stage.bottom+1,'lower body stays beneath shelf and inside viewport');
   assert.ok(geometry.front.x>=geometry.stage.x&&geometry.front.right<=geometry.stage.right,'wide front edge remains inside viewport');
  }
  await page.evaluate(()=>ArcadePreferences.update({frame:'none'}));assert.equal(await page.locator('.arcade-cabinet').isVisible(),false);assert.equal(await page.locator('#game').evaluate(n=>getComputedStyle(n).borderTopLeftRadius),'0px');await page.close();
 }
 console.log('PASS: frontal screen/glass alignment, projecting shelf, connected rear/slope/front surfaces, lower body and viewport fit across desktop/portrait/short-wide layouts.');
}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
