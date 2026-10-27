/* Shared preferences and narrowly scoped, regenerable engine-cache maintenance. */
(() => {
  'use strict';
  const assets=new URL('./',document.currentScript.src),playing=!!document.querySelector('#game');
  const schema={filter:['original','soft','crt'],frame:['none','club','neon'],mask:['none','scan','aperture'],strength:['light','balanced','strong'],cheats:['manual','disabled'],fullscreen:['on','off'],resume:['offer','off'],autoSave:['on','off'],cacheDays:['0','1','7','30'],inputStyle:['auto','keyboard','xbox','playstation','nintendo','generic','arcade']};
  const defaults={filter:'original',frame:'club',mask:'none',strength:'balanced',cheats:'manual',fullscreen:'on',resume:'offer',autoSave:'on',cacheDays:'0',inputStyle:'auto'};
  let settings={...defaults},scope='pixelarcade:local:',persisted=true,identityReady=true;
  const key=name=>scope+name;
  const ready=(async()=>{
    if(location.pathname.startsWith('/arcade/')){
      try{const r=await fetch('/arcade/auth/session',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(5000)});if(r.ok){const a=await r.json();if(typeof a.username!=='string'||!a.username)throw Error();scope='pixelarcade:'+encodeURIComponent(a.username)+':';}else identityReady=false;}catch{identityReady=false;}
    }
    if(identityReady)try{const saved=JSON.parse(localStorage.getItem(key('preferences'))||'null');for(const name in schema)if(schema[name].includes(saved?.[name]))settings[name]=saved[name];}catch{}
    return settings;
  })();
  function update(values){for(const name in values)if(schema[name]?.includes(values[name]))settings[name]=values[name];try{if(!identityReady)throw Error();localStorage.setItem(key('preferences'),JSON.stringify(settings));persisted=true;}catch{persisted=false;}window.dispatchEvent(new CustomEvent('arcade-preferences-changed'));return persisted;}
  function gameKey(core,src){return key('game:'+core+':'+src);}
  function db(name,store){return new Promise((resolve,reject)=>{
    const request=indexedDB.open(name,1);request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(store))request.result.createObjectStore(store);};request.onerror=()=>reject(request.error);request.onblocked=()=>reject(Error('其他页面正在使用存储'));request.onsuccess=()=>resolve(request.result);
  });}
  function progressIDs(id){
    if(!id.startsWith('resume:'))return [id];
    const split=id.indexOf(':',7);if(split<0)return [id];
    const prefix=id.slice(0,split+1),src=id.slice(split+1);let canonical=id,decoded=id;
    try{const url=new URL(src,location.origin);canonical=prefix+url.pathname+url.search;decoded=prefix+decodeURI(url.pathname)+url.search;}catch{}
    return [...new Set([canonical,id,decoded])];
  }
  async function progress(action,id,value){await ready;if(!identityReady)throw Error('账号状态暂不可用，继续点不会混用其他账号的数据');const database=await db('PixelArcade-progress-v1','snapshots'),ids=progressIDs(id);try{return await new Promise((resolve,reject)=>{
    const tx=database.transaction('snapshots',action==='get'?'readonly':'readwrite'),store=tx.objectStore('snapshots');let result,index=0;
    const request=()=>{const req=action==='get'?store.get(key(ids[index])):store.put(value,key(ids[0]));req.onsuccess=()=>{result=req.result;if(action==='get'&&result===undefined&&++index<ids.length)request();};};request();
    tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });}finally{database.close();}}
  const cacheStores=[['EmulatorJS-roms','rom'],['EmulatorJS-bios','bios'],['EmulatorJS-core','core']];
  async function cacheStore(name,store,clear){
    if(!window.indexedDB)return 0;
    return new Promise((resolve,reject)=>{
      const req=indexedDB.open(name);let nonexistent=false;
      req.onupgradeneeded=()=>{nonexistent=true;req.transaction.abort();};
      req.onerror=()=>nonexistent?resolve(0):reject(req.error);req.onblocked=()=>reject(Error('请先关闭其他游戏页再试'));
      req.onsuccess=()=>{const database=req.result;if(!database.objectStoreNames.contains(store)){database.close();resolve(0);return;}
        const tx=database.transaction(store,clear?'readwrite':'readonly'),objectStore=tx.objectStore(store);let total=0;
        const cursor=objectStore.openCursor();cursor.onsuccess=()=>{const item=cursor.result;if(!item)return;const value=item.value?.data;total+=value?.byteLength||value?.size||0;if(clear)item.delete();item.continue();};
        tx.oncomplete=()=>{database.close();resolve(total);};tx.onerror=tx.onabort=()=>{database.close();reject(tx.error||Error('缓存存储暂不可用'));};
      };
    });
  }
  async function cacheBytes(){const amounts=await Promise.all(cacheStores.map(([name,store])=>cacheStore(name,store,false)));return amounts.reduce((a,b)=>a+b,0);}
  let cleaning=false;
  async function clearCache(){
    if(cleaning)throw Error('正在清理，请稍候');if(playing&&window.EJS_emulator?.started)throw Error('请回大厅后清理缓存');cleaning=true;
    try{const amounts=[];for(const [name,store] of cacheStores)amounts.push(await cacheStore(name,store,true));if(window.caches)for(const name of await caches.keys())if(name.startsWith('pixelarcade-cache-'))await caches.delete(name);try{localStorage.setItem(key('cache-last-clean'),String(Date.now()));}catch{}return amounts.reduce((a,b)=>a+b,0);}finally{cleaning=false;}
  }
  async function cleanIfDue(){await ready;if(!identityReady||playing||!document.querySelector('#grid')||document.hidden||settings.cacheDays==='0')return;const days=Number(settings.cacheDays);let last;try{last=Number(localStorage.getItem(key('cache-last-clean')));if(!last){localStorage.setItem(key('cache-last-clean'),String(Date.now()));return;}}catch{return;}if(Date.now()-last>=days*86400000){try{await clearCache();}catch{}}}
  const theme=document.createElement('link');theme.rel='stylesheet';theme.href=new URL('theme.css?v=arcade4',assets);document.head.append(theme);
  const dialog=document.createElement('dialog');dialog.id='arcadeSettings';dialog.setAttribute('aria-label','游戏厅设置');document.body.append(dialog);let previous,resume=false;
  const make=(tag,text,cls)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
  const labels={filter:'默认滤镜',strength:'默认效果强度',frame:'默认机台遮罩',mask:'默认屏幕纹理',cheats:'金手指功能',fullscreen:'开始游戏时全屏',resume:'继续上次游玩',autoSave:'自动保存继续点',cacheDays:'定期清理缓存',inputStyle:'操作图标风格'};
  const names={filter:['原始像素','柔和 · 像素平滑','老电视 · CRT'],strength:['轻','中','浓'],frame:['关闭 · 最大画面','木纹机台','奶白机台'],mask:['关闭','扫描线','荫罩'],cheats:['允许手动开启，默认不启用效果','关闭金手指功能'],fullscreen:['开启','关闭'],resume:['有继续点时提供选择','不显示继续选项'],autoSave:['开启 · 每 3 分钟保存一个继续点','关闭'],cacheDays:['不自动清理','每天','每 7 天','每 30 天'],inputStyle:['自动识别当前设备','键盘','Xbox','PlayStation','任天堂','通用手柄','街机摇杆']};
  function picturePreview(){
    const preview=make('figure','','settings-preview');preview.id='settingsPreview';preview.setAttribute('aria-label','全局画面效果预览');
    const cabinet=make('div','','preview-cabinet'),marquee=make('div','PIXEL CLUB','preview-marquee'),screen=make('div','','preview-screen'),canvas=make('canvas'),glass=make('div','','preview-glass'),deck=make('div','●　●　●　 ━','preview-deck');
    canvas.width=256;canvas.height=144;canvas.setAttribute('aria-label','像素城市示例画面');const c=canvas.getContext('2d');
    c.fillStyle='#142039';c.fillRect(0,0,256,144);c.fillStyle='#f9cf82';c.fillRect(195,13,22,22);c.fillStyle='#263c59';
    for(let x=0;x<256;x+=24){const h=24+(x*7%47);c.fillRect(x,90-h,21,h);for(let y=90-h+6;y<85;y+=9){c.fillStyle='#b6c7a2';c.fillRect(x+5,y,3,3);c.fillRect(x+13,y,3,3);c.fillStyle='#263c59';}}
    c.fillStyle='#4e6372';c.fillRect(0,90,256,54);c.fillStyle='#a8b66c';c.fillRect(0,90,256,3);c.fillStyle='#9aa4a3';for(let x=0;x<256;x+=32)c.fillRect(x,121,17,2);
    c.fillStyle='#eaaa62';c.fillRect(98,106,51,15);c.fillRect(109,98,24,9);c.fillStyle='#91d8cf';c.fillRect(114,100,16,6);c.fillStyle='#111a26';c.fillRect(105,118,10,8);c.fillRect(133,118,10,8);
    c.font='bold 9px monospace';c.fillStyle='#e8f0d0';c.fillText('1UP  008500',9,13);c.fillStyle='#eb8c99';c.fillText('READY!',105,51);
    screen.append(canvas,glass);cabinet.append(marquee,screen,deck);preview.append(cabinet,make('figcaption','即时示例 · 滤镜、强度、机台和纹理随选择变化；游戏内使用核心原生滤镜。'));
    const refresh=()=>{for(const key of ['filter','strength','frame','mask'])preview.dataset[key]=settings[key];preview.style.setProperty('--preview-blur',{light:'.25px',balanced:'.45px',strong:'.7px'}[settings.strength]);preview.style.setProperty('--preview-strength',{light:'.25',balanced:'.5',strong:'.8'}[settings.strength]);};refresh();preview.refresh=refresh;return preview;
  }
  async function render(){await ready;dialog.replaceChildren();dialog.append(make('p','PIXEL ARCADE / SETTINGS','ui-eyebrow'),make('h2','游戏厅设置'),make('p','全局默认用于尚未单独设置的游戏；单款游戏的选择优先。设置保存在当前浏览器。','ui-muted'));
    const closeIcon=make('button','×','settings-close');closeIcon.type='button';closeIcon.setAttribute('aria-label','关闭游戏厅设置');closeIcon.onclick=()=>dialog.close();dialog.prepend(closeIcon);
    const preview=picturePreview();dialog.append(preview);
    const status=make('p','','settings-status');status.setAttribute('role','status');
    for(const [title,keys] of [['画面与辅助',['filter','strength','frame','mask','cheats']],['启动与输入',['fullscreen','resume','autoSave','inputStyle']],['缓存维护',['cacheDays']]]){
      const section=make('section','','settings-section');section.append(make('h3',title));
      for(const name of keys){const label=make('label',labels[name],'settings-field'),select=make('select');select.setAttribute('aria-label',labels[name]);schema[name].forEach((v,i)=>select.add(new Option(names[name][i],v)));select.value=settings[name];select.onchange=()=>{const old=settings.cacheDays;update({[name]:select.value});preview.refresh();if(name==='cacheDays'&&old==='0')try{localStorage.setItem(key('cache-last-clean'),String(Date.now()));}catch{}status.textContent=persisted?'已保存。游戏内已有单独画面设置时，可选择「使用全局默认」。':'浏览器无法保存，设置仅本次有效。';};label.append(select);section.append(label);}dialog.append(section);
    }
    dialog.append(make('p','浏览器不允许自动进入全屏时，会先填满当前窗口。继续点按游戏与核心分别保存，启动约 3 秒后建立首个继续点，之后约每 3 分钟更新一次；使用「返回大厅」也会尝试保存。继续点不替代重要的手动存档。','ui-muted'));
    dialog.append(make('p','缓存清理仅删除可重新下载的 ROM、BIOS 和核心缓存，不删除存档、继续点、收藏、最近记录或按键设置。浏览器的全局 HTTP 缓存不在此范围内；定期清理只在打开大厅时执行。','ui-muted'));
    const cacheInfo=make('p','正在计算可清理缓存…','cache-info');dialog.append(cacheInfo);cacheBytes().then(bytes=>{cacheInfo.textContent='可清理引擎缓存：'+(bytes/1048576).toFixed(1)+' MB';}).catch(()=>{cacheInfo.textContent='浏览器暂时无法统计缓存。';});
    const clear=make('button','立即清理下载缓存');clear.type='button';clear.onclick=async()=>{clear.disabled=true;try{const bytes=await clearCache();cacheInfo.textContent='已清理 '+(bytes/1048576).toFixed(1)+' MB；下次打开游戏会重新下载所需文件。';}catch(e){cacheInfo.textContent=e.message||'清理失败，请稍后再试。';}finally{clear.disabled=false;}};dialog.append(clear,status);
    const close=make('button','完成');close.type='button';close.className='primary';close.onclick=()=>dialog.close();dialog.append(close);
  }
  async function open(){if(dialog.open)return;previous=document.activeElement;const em=window.EJS_emulator;resume=!!(em?.started&&!em.paused&&!document.querySelector('#padGuide[open]'));if(resume)em.pause();await render();dialog.showModal();dialog.querySelector('select')?.focus();}
  dialog.addEventListener('close',()=>{if(resume)window.EJS_emulator?.play();resume=false;const target=previous?.isConnected?previous:document.querySelector('#padGuide[open] button,#padSettings[open] select');target?.focus();window.dispatchEvent(new CustomEvent('arcade-settings-closed'));});
  dialog.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();dialog.close();}});
  if(!playing){const b=make('button','游戏厅设置','global-settings-button');b.type='button';b.onclick=open;const header=document.querySelector('main>header');if(header)header.append(b);else (document.querySelector('.guide,.support')||document.body).prepend(b);}
  function resumePoints(saved){const seen=new Set();return [saved,...(Array.isArray(saved?.history)?saved.history:[])].filter(p=>p?.state?.byteLength).sort((a,b)=>b.updatedAt-a.updatedAt).filter(p=>{if(seen.has(p.updatedAt))return false;seen.add(p.updatedAt);return true;}).map(p=>({state:p.state,updatedAt:p.updatedAt,source:p.source||'legacy',core:p.core,src:p.src}));}
  const resumeLabel=p=>(p.source==='manual'?'手动存档':p.source==='auto'?'自动存档':'旧继续点')+' · '+new Date(p.updatedAt).toLocaleString('zh-CN');
  window.ArcadePreferences={ready,get:()=>({...settings}),update,key,gameKey,open,progress,resumePoints,resumeLabel,cacheBytes,clearCache};
  ready.then(()=>{cleanIfDue();window.dispatchEvent(new CustomEvent('arcade-preferences-ready'));});setInterval(cleanIfDue,60000);
})();
