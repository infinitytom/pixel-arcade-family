/* Durable account sync; per-item edits preserve changes made on other devices. */
(() => {
  'use strict';
  const enabled=location.pathname.startsWith('/arcade/'),endpoint='/arcade/sync/';
  let account=null,prefix='',phase=enabled?'正在连接账号':'本机模式',error='',lastSync=0,busy=null,timer,items=[],games=[],initialized=false,pendingSaves=0,migrationDone=!enabled,operationClock=Date.now();
  const downloaded=new Map(),saveIssues=new Map();
  const uid=()=>crypto.randomUUID(),read=(k,f)=>{try{return JSON.parse(localStorage.getItem(k))??f;}catch{return f;}};
  const canonical=id=>{const match=/^(resume|game):([^:]+):(.*)$/.exec(id);if(!match)return id;try{const u=new URL(match[3],location.origin);return match[1]+':'+match[2]+':'+u.pathname.replace(/^\/arcade\/roms\//,'/roms/')+u.search;}catch{return id;}};
  const localGame=id=>location.pathname.startsWith('/arcade/')?id.replace(/:((?:\/roms\/).*)$/,':/arcade$1'):id;
  const queued=()=>{const result=[];if(!prefix)return result;for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k?.startsWith(prefix+'sync-op:')){const op=read(k,null);if(op)result.push({...op,storageKey:k});}}return result.sort((a,b)=>a.createdAt-b.createdAt||a.opId.localeCompare(b.opId));};
  function status(){let pending=0;try{pending=queued().length+pendingSaves+saveIssues.size;}catch{}return {enabled,account,phase,error,lastSync,pending};}
  function notify(){const n=document.querySelector('#accountSyncIndicator');if(n){n.textContent='账号 · '+phase;n.title=error||'收藏、历史、设置和存档同步到 NAS';n.dataset.phase=phase;}window.dispatchEvent(new CustomEvent('arcade-sync-status',{detail:status()}));}
  function schedule(){clearTimeout(timer);timer=setTimeout(()=>flush(),200);}
  function enqueue(kind,id,value,seed=false){
    if(!account)return false;
    const op={kind,id:kind==='picture'?canonical(id):id,value,seed,opId:uid(),createdAt:++operationClock};
    try{localStorage.setItem(prefix+'sync-op:'+op.opId,JSON.stringify(op));if(!seed){phase='待上传';error='';notify();schedule();}return true;}catch{error='待上传记录无法写入本机，请先导出备份';phase='同步未完成';notify();return false;}
  }
  async function request(path,options={}){
    const r=await fetch(endpoint+path,{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(20000),...options,headers:{...options.headers,'X-Arcade-Account':encodeURIComponent(account)}});
    if(!r.ok){let message;try{message=(await r.json()).detail;}catch{}throw Error(typeof message==='string'?message:r.status===401?'登录已失效，请重新登录':'同步暂不可用（'+r.status+'）');}
    return r.json();
  }
  function apply(payload){
    items=payload.items||[];games=payload.games||[];
    const values=new Map(items.map(x=>[x.kind+'\n'+x.id,x]));
    for(const op of queued()){const id=op.kind+'\n'+op.id;if(!op.seed||!values.has(id))values.set(id,op);}
    const favorites=[],recent=[],settings={};let changed=false;
    const put=(key,value)=>{try{const text=JSON.stringify(value);if(localStorage.getItem(key)!==text){localStorage.setItem(key,text);changed=true;}}catch{error='云端记录已读取，但本机存储空间不足';}};
    for(const value of values.values()){
      if(value.kind==='favorite'&&value.value)favorites.push(value.id);
      if(value.kind==='recent')recent.push([value.id,value.value]);
      if(value.kind==='setting')settings[value.id]=value.value;
      if(value.kind==='picture'){const key=prefix+localGame(value.id);if(value.value===null){try{if(localStorage.getItem(key)!==null){localStorage.removeItem(key);changed=true;}}catch{}}else put(key,value.value);}
    }
    recent.sort((a,b)=>b[1]-a[1]);
    put(prefix+'favorites',favorites);put(prefix+'recent',recent.slice(0,100).map(v=>v[0]));put(prefix+'preferences',settings);
    if(changed)window.dispatchEvent(new CustomEvent('arcade-account-data',{detail:{favorites,recent:recent.slice(0,100).map(v=>v[0]),settings}}));
  }
  function saveDB(action,key,value){return new Promise((resolve,reject)=>{
    const req=indexedDB.open('PixelArcade-sync-v1',1);req.onupgradeneeded=()=>req.result.createObjectStore('pending');req.onerror=()=>reject(req.error);
    req.onsuccess=()=>{const db=req.result,tx=db.transaction('pending',action==='list'?'readonly':'readwrite'),store=tx.objectStore('pending');let result=[];
      if(action==='list'){const cursor=store.openCursor();cursor.onsuccess=()=>{const c=cursor.result;if(c){if(String(c.key).startsWith(prefix))result.push({key:c.key,...c.value});c.continue();}};}else if(action==='put')store.put(value,key);else store.delete(key);
      tx.oncomplete=()=>{db.close();resolve(result);};tx.onerror=tx.onabort=()=>{db.close();reject(tx.error||Error('待上传存档无法保存'));};};
  });}
  const encode=bytes=>{let text='';for(let i=0;i<bytes.length;i+=32768)text+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(text);};
  const decode=text=>Uint8Array.from(atob(text),c=>c.charCodeAt(0));
  const points=value=>value?[value,...(value.history||[])].filter(p=>p?.state?.byteLength).map(({history,...p})=>p):[];
  const pointKey=p=>p.updatedAt+'\n'+(p.sessionId||'');
  async function hash(game,p){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(game+'\n'+p.updatedAt+'\n'+(p.sessionId||'')));return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');}
  function report(e,id){if(id&&account){const game=canonical(id);saveIssues.set(game,e.message);try{localStorage.setItem(prefix+'sync-save-error:'+game,JSON.stringify(e.message));}catch{}}error=e.message;phase='同步未完成';notify();}
  async function queueSave(id,value){
    if(!account)return;
    const game=canonical(id),pending=await saveDB('list');let changed=false,oversized=false;
    for(const p of points(value).reverse()){
      if(p.state.byteLength>16*1024*1024){oversized=true;continue;}const sid=await hash(game,p);if(downloaded.get(game)?.ids.has(sid)||pending.some(q=>q.sid===sid))continue;
      const point={...p,source:p.source==='auto'?'auto':'manual',sessionId:p.sessionId||'',thumbnail:p.thumbnail||null};const item={opId:uid(),game,point,sid,createdAt:Date.now()};await saveDB('put',prefix+'save:'+sid,item);changed=true;
    }
    // Unsent points follow the same retention rule as local history.
    const keep=new Set(points(value).map(pointKey));for(const q of pending)if(q.game===game&&!keep.has(pointKey(q.point)))await saveDB('delete',q.key);
    if(oversized)report(Error('部分存档超过 16 MB，仅保存在本机，请单独导出'),id);else{saveIssues.delete(game);try{localStorage.removeItem(prefix+'sync-save-error:'+game);}catch{}}pendingSaves=(await saveDB('list')).length;if(changed&&!oversized){phase='待上传';notify();schedule();}
  }
  async function flush(metadataOnly=false){
    if(!initialized)return initialize();if(!account)return;if(busy)return busy;
    busy=(async()=>{phase='正在同步';notify();try{
      let ops=queued();while(ops.length){const batch=ops.slice(0,100);const payload=await request('metadata',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operations:batch.map(({storageKey,...op})=>op)})});for(const op of batch)localStorage.removeItem(op.storageKey);apply(payload);ops=queued();}
      if(!metadataOnly&&!migrationDone){await migrateSaves();migrationDone=true;}
      for(const q of metadataOnly?[]:await saveDB('list')){await request('saves',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({opId:q.opId,game:q.game,point:{...q.point,state:encode(new Uint8Array(q.point.state))}})});await saveDB('delete',q.key);const known=read(prefix+'synced-saves:'+q.game,[]);if(!known.includes(pointKey(q.point)))localStorage.setItem(prefix+'synced-saves:'+q.game,JSON.stringify([...known,pointKey(q.point)].slice(-100)));downloaded.delete(q.game);}
      apply(await request('metadata'));lastSync=Date.now();pendingSaves=(await saveDB('list')).length;phase=saveIssues.size?'同步未完成':!migrationDone?'正在迁移本机存档':pendingSaves?'待上传':'已同步';error=[...new Set(saveIssues.values())].join('；');
    }catch(e){phase=navigator.onLine?'同步未完成':'离线 · 待联网同步';error=e.message;}finally{busy=null;notify();}})();return busy;
  }
  async function mergeSaves(id,local){
    if(!account||!initialized)return local;
    const game=canonical(id);if(!navigator.onLine)return local;
    try{
      const manifest=await request('saves?game='+encodeURIComponent(game)),remote=[],ids=new Set(manifest.points.map(p=>p.id));
      const locals=points(local),byId=new Map();for(const p of locals)byId.set(await hash(game,p),p);
      for(const p of manifest.points){if(byId.has(p.id))remote.push(byId.get(p.id));else{const value=await request('saves/'+p.id);remote.push({...value,state:decode(value.state)});}}
      downloaded.set(game,{ids});
      const pending=await saveDB('list'),knownLocal=new Set(read(prefix+'synced-saves:'+game,[]));
      // Previously acknowledged points pruned on another device must stay pruned.
      const localOnly=locals.filter(p=>!knownLocal.has(pointKey(p))||pending.some(q=>q.game===game&&pointKey(q.point)===pointKey(p)));
      const all=[...new Map([...remote,...localOnly].map(p=>[pointKey(p),p])).values()].sort((a,b)=>b.updatedAt-a.updatedAt),counts={manual:0,auto:0};
      const kept=all.filter(p=>++counts[p.source==='manual'?'manual':'auto']<=3);
      localStorage.setItem(prefix+'synced-saves:'+game,JSON.stringify(remote.map(pointKey)));
      const result=kept.length?{...kept[0],history:kept.slice(1)}:local;
      if(result)await queueSave(id,result);
      return result;
    }catch(e){if(local)try{await queueSave(id,local);}catch(queueError){report(queueError,id);}phase='同步未完成';error=e.message;notify();return local;}
  }
  async function migrateSaves(){
    // Only the signed-in account's pre-existing resume points are migrated.
    const req=indexedDB.open('PixelArcade-progress-v1');let absent=false;
    await new Promise((resolve,reject)=>{req.onblocked=()=>reject(Error('请关闭其他旧游戏页后重试存档迁移'));req.onupgradeneeded=()=>{absent=true;req.transaction.abort();};req.onerror=()=>absent?resolve():reject(req.error);req.onsuccess=()=>{const db=req.result;if(absent||!db.objectStoreNames.contains('snapshots')){db.close();resolve();return;}const values=[],tx=db.transaction('snapshots'),c=tx.objectStore('snapshots').openCursor();c.onsuccess=()=>{const cursor=c.result;if(cursor){if(String(cursor.key).startsWith(prefix+'resume:'))values.push([String(cursor.key).slice(prefix.length),cursor.value]);cursor.continue();}};tx.oncomplete=()=>{db.close();resolve(values);};tx.onabort=tx.onerror=()=>{db.close();reject(tx.error||Error('旧存档暂时无法读取'));};};}).then(async values=>{for(const [id,value] of values||[])await mergeSaves(id,value);});
  }
  let starting;
  function initialize(){if(starting)return starting;starting=start().finally(()=>{starting=null;});return starting;}
  async function start(){
    if(!enabled)return;
    try{
      const r=await fetch('/arcade/auth/session',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(5000)});if(!r.ok)throw Error('请重新登录后同步');const a=await r.json();if(typeof a.username!=='string'||!a.username)throw Error('账号信息不可用');if(account&&account!==a.username)throw Error('账号已切换，请刷新页面后继续同步');account=a.username;prefix='pixelarcade:'+encodeURIComponent(account)+':';operationClock=Math.max(Date.now(),...queued().map(v=>v.createdAt));for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k?.startsWith(prefix+'sync-save-error:'))saveIssues.set(k.slice((prefix+'sync-save-error:').length),read(k,'部分本机存档尚未上传'));}
      const payload=await request('metadata');
      // Seed only missing server fields; existing tombstones and cloud values win.
      for(const id of read(prefix+'favorites',[]))enqueue('favorite',id,true,true);
      const recent=read(prefix+'recent',[]),existing=(payload.items||[]).filter(v=>v.kind==='recent').map(v=>v.value),oldest=existing.length?Math.min(...existing)-1:Date.now();recent.forEach((id,i)=>enqueue('recent',id,oldest-i,true));
      for(const [name,value] of Object.entries(read(prefix+'preferences',{})))enqueue('setting',name,value,true);
      for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k?.startsWith(prefix+'game:'))enqueue('picture',k.slice(prefix.length),read(k,null),true);}
      initialized=true;apply(payload);await flush(true);
      // Do not delay game launch while migrating other games' snapshots.
      setTimeout(()=>flush(),500);
    }catch(e){phase='同步未完成';error=e.message;notify();}
  }
  const ready=initialize();
  if(enabled){const indicator=document.createElement('span');indicator.id='accountSyncIndicator';indicator.className='account-sync-indicator';indicator.setAttribute('role','status');(document.querySelector('main>header')||document.querySelector('body>header')||document.body).append(indicator);notify();}
  window.ArcadeAccountSync={report,retry:()=>{migrationDone=false;return flush();},ready,status,canonical,localGame,enqueue,flush,mergeSaves,queueSave,
    favorite:(id,on)=>enqueue('favorite',id,on),recent:id=>enqueue('recent',id,Date.now()),
    settings:values=>{for(const [name,value] of Object.entries(values))enqueue('setting',name,value);},
    picture:(id,value)=>enqueue('picture',id,value)};
  window.addEventListener('online',()=>ready.then(flush));window.addEventListener('focus',()=>ready.then(flush));
  window.addEventListener('storage',e=>{if(prefix&&e.key?.startsWith(prefix+'sync-op:'))schedule();});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)ready.then(flush);});
  setInterval(()=>{if(!document.hidden)ready.then(flush);},30000);
})();
