// Validate the visible cabinet surfaces at desktop, portrait and short/wide sizes.
const {chromium}=require('playwright'),assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const site=path.resolve(__dirname,'../site');
const server=http.createServer((req,res)=>{const pathname=decodeURIComponent(new URL(req.url,'http://fixture').pathname);
 if(pathname.startsWith('/data/')){res.writeHead(200,{'Content-Type':'application/javascript'});res.end('');return;}
 if(pathname.endsWith('private-shaders.json')){res.writeHead(404);res.end();return;}
 const file=path.resolve(site,'.'+pathname);if(!file.startsWith(site+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
 res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});try{
 for(const [width,height,aspect] of [[1600,1000,4/3],[390,844,.75],[844,390,4]]){
  const page=await browser.newPage({viewport:{width,height}});await page.addInitScript(()=>navigator.getGamepads=()=>[]);
  await page.goto(`http://127.0.0.1:${server.address().port}/play.html?core=fbneo&src=/roms/test.zip&aspect=${aspect}`);
  await page.waitForFunction(()=>document.querySelector('#arcadeDecoration')?.style.visibility==='');
  for(const frame of ['club','neon']){
   await page.evaluate(frame=>ArcadePreferences.update({frame}),frame);
   const geometry=await page.evaluate(()=>{const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,bottom:r.bottom,right:r.right};};return {screen:rect('#game'),glass:rect('.arcade-glass'),back:rect('.cabinet-bezel'),surface:rect('.deck-surface'),front:rect('.deck-fascia'),base:rect('.cabinet-coins'),stage:rect('#playerStage'),scene:getComputedStyle(document.querySelector('.arcade-scene')).transform,sticks:[...document.querySelectorAll('.joystick')].map(n=>{const box=x=>{const r=x.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y,bottom:r.bottom,h:r.height};};return {base:box(n),shaft:box(n.querySelector('.stick-shaft')),ball:box(n.querySelector('.stick-ball'))};})};});
   for(const stick of geometry.sticks){assert.ok(Math.abs(stick.ball.x-stick.shaft.x)<1&&Math.abs(stick.ball.x-stick.base.x)<1,'ball, shaft and base share a projected centerline');assert.ok(stick.ball.bottom>=stick.shaft.y&&stick.ball.bottom<=stick.shaft.y+stick.ball.h*.25,'shaft enters the center underside of the ball');}
   await page.evaluate(()=>{const button=document.createElement('div');button.className='ejs_virtualGamepad_open';button.textContent='native menu';document.querySelector('#game').append(button);});assert.equal(await page.locator('.ejs_virtualGamepad_open').last().evaluate(n=>getComputedStyle(n).display),'none','native touch hamburger stays hidden');
   assert.equal(geometry.scene,'none');assert.ok(Math.abs(geometry.screen.x-geometry.glass.x)<1&&Math.abs(geometry.screen.y-geometry.glass.y)<1,'screen aligns with its glass');
   assert.ok(geometry.front.w>geometry.back.w+10,'control shelf projects beyond the upright cabinet');
   assert.ok(Math.abs(geometry.surface.y-geometry.back.bottom)<2,'rear of shelf meets the lower monitor surround');
   assert.ok(Math.abs(geometry.surface.bottom-geometry.front.y)<2,'sloped surface meets the front fascia');
   assert.ok(geometry.base.y>=geometry.front.y&&geometry.base.bottom<=geometry.stage.bottom+1,'lower body stays beneath shelf and inside viewport');
   assert.ok(geometry.front.x>=geometry.stage.x&&geometry.front.right<=geometry.stage.right,'wide front edge remains inside viewport');
  }
  const backgroundWidth=await page.evaluate(async()=>{const match=getComputedStyle(document.querySelector('.arcade-room-background')).backgroundImage.match(/url\("?([^")]+)"?\)/);const image=new Image();image.src=match[1];await image.decode();return image.naturalWidth;});assert.ok(backgroundWidth>=1600,'room background actually decodes');
  await page.evaluate(()=>ArcadePreferences.update({frame:'none'}));assert.equal(await page.locator('.arcade-cabinet').isVisible(),false);assert.equal(await page.locator('#game').evaluate(n=>getComputedStyle(n).borderTopLeftRadius),'0px');await page.close();
 }
 console.log('PASS: frontal screen/glass alignment, projecting shelf, connected rear/slope/front surfaces, lower body and viewport fit across desktop/portrait/short-wide layouts.');
}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
