// Real 7z decoder + independent Python ZIP validation, using only authored fixtures.
const {chromium}=require('playwright'),assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawnSync}=require('node:child_process');
const fixture='N3q8ryccAAS3UFG5ogAAAAAAAAAhAAAAAAAAAEDdeZcBACZhcmNhZGUtdGVzdC1wYXlsb2FkAP/kuK3mlofotYTmupDmtYvor5UAAACBMweuD9C1KPyfP0dBBA9xDPzRH7xlk2p3mqDC91A6DOv/G/ACIJGIB3K5Kp0QPyyNfEAOcq47do67c5YxrG73OdqzEsNy4ZYm9fW8FvRsd/pTuhXmDpKMBJZmyHddvE7sQeoHCFtrvkVWhi728bwrNgXBIaoXBisBCXcABwsBAAEjAwEBBV0AEAAADICaCgE9TtP4AAA=';
const base=process.env.DEMO_URL||'http://127.0.0.1:18893',site=path.resolve(__dirname,'../site');
const server=http.createServer(async(req,res)=>{try{
 if(['/data/src/compression.js','/data/compression/extract7z.js'].includes(req.url)){const r=await fetch(base+req.url);res.writeHead(r.status,{'Content-Type':'text/javascript; charset=utf-8'});res.end(Buffer.from(await r.arrayBuffer()));return;}
 res.setHeader('Content-Type',req.url==='/rom-archive.js'?'text/javascript; charset=utf-8':'text/html; charset=utf-8');res.end(req.url==='/rom-archive.js'?fs.readFileSync(path.join(site,'library/rom-archive.js')):'<script src="/data/src/compression.js"></script><script src="/rom-archive.js"></script>');
 }catch(e){res.writeHead(500);res.end(String(e));}});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true}),temporary=fs.mkdtempSync(path.join(os.tmpdir(),'arcade-7z-test-'));
 try{
  const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.address().port+'/');await page.waitForFunction(()=>window.EJS_COMPRESSION&&window.ArcadeRomArchive);
  await page.evaluate(()=>{
   const Native=Worker;window.workers=[];window.Worker=class extends Native{constructor(...args){super(...args);workers.push(this);}terminate(){this.stopped=true;super.terminate();}};
   window.makeEm=(encoded,name='game.7z')=>{
    const files=new Map(),raw=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));
    const FS={open(p,mode){if(mode==='w')files.set(p,new Uint8Array());return {path:p};},close(){},read(s,out,at,length,position){const data=files.get(s.path).subarray(position,position+length);out.set(data,at);return data.length;},write(s,data,at,length,position){const old=files.get(s.path),next=new Uint8Array(Math.max(old.length,position+length));next.set(old);next.set(data.subarray(at,at+length),position);files.set(s.path,next);return length;},readFile:p=>files.get(p).slice(),rename(a,b){files.set(b,files.get(a));files.delete(a);},unlink:p=>files.delete(p)};
    const em={fileName:name,config:{gameUrl:'/roms/'+name},getCore:()=> 'arcade',gameManager:{FS},textElem:{},async downloadFile(url){const r=await fetch('/data/'+url);return {data:await r.text()};},async downloadRom(){this.calls=(this.calls||0)+1;files.set(name,raw);},startGameError(text){this.failure=text;}};window.EJS_emulator=em;return em;
   };
  });
  const converted=await page.evaluate(async fixture=>{const em=makeEm(fixture);ArcadeRomArchive.prepare();ArcadeRomArchive.prepare();await em.downloadRom();const bytes=em.gameManager.FS.readFile(em.fileName);return {file:em.fileName,url:em.config.gameUrl,calls:em.calls,data:btoa(String.fromCharCode(...bytes)),workers:workers.length,stopped:workers.every(w=>w.stopped)};},fixture);
  assert.equal(converted.file,'game.zip');assert.equal(converted.url,'/roms/game.7z');assert.equal(converted.calls,1);assert.equal(converted.workers,1);assert.ok(converted.stopped);
  const zip=path.join(temporary,'result.zip');fs.writeFileSync(zip,Buffer.from(converted.data,'base64'));
  const code="import zipfile,sys;z=zipfile.ZipFile(sys.argv[1]);assert z.testzip() is None;assert set(z.namelist())=={'hello.bin','empty.bin','中文.bin'};assert z.read('hello.bin')==b'arcade-test-payload\\x00\\xff';assert z.read('empty.bin')==b'';assert z.read('中文.bin').decode('utf-8')=='中文资源测试'";
  const result=spawnSync(process.platform==='win32'?'py':'python',[...(process.platform==='win32'?['-3']:[]),'-c',code,zip],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);
  assert.deepEqual(await page.evaluate(async encoded=>{const em=makeEm(encoded,'game.zip'),before=workers.length;ArcadeRomArchive.prepare();await em.downloadRom();return {name:em.fileName,data:btoa(String.fromCharCode(...em.gameManager.FS.readFile(em.fileName))),workers:workers.length-before};},converted.data),{name:'game.zip',data:converted.data,workers:0});
  const broken=await page.evaluate(async()=>{const em=makeEm(btoa(String.fromCharCode(55,122,188,175,39,28,0,0,0,0,0,0)));ArcadeRomArchive.prepare();try{await em.downloadRom();}catch{}return {failure:em.failure,stopped:workers.every(w=>w.stopped)};});assert.match(broken.failure,/7z 游戏资源准备失败/);assert.ok(broken.stopped);
  console.log('PASS: real 7z extraction, ZIP CRC/content/Unicode/empty-file validation, unchanged resource identity, ZIP passthrough, corrupt-archive error and worker cleanup.');
 }finally{await browser.close();await new Promise(r=>server.close(r));for(const name of fs.readdirSync(temporary))fs.unlinkSync(path.join(temporary,name));fs.rmdirSync(temporary);}
})().catch(e=>{console.error(e);process.exitCode=1;});
