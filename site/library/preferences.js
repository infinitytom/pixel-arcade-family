/* Shared preferences and narrowly scoped, regenerable engine-cache maintenance. */
(() => {
  'use strict';
  const assets=new URL('./',document.currentScript.src),playing=!!document.querySelector('#game');
  const schema={filter:['original','soft','crt','phosphor','phosphor-glow','phosphor-line','phosphor-line-glow','phosphor-line-reflex'],frame:['none','club','neon'],mask:['none','scan','aperture'],strength:['light','balanced','strong'],cheats:['manual','disabled'],fullscreen:['on','off'],resume:['offer','off'],autoSave:['on','off'],cacheDays:['0','1','7','30'],uiSound:['on','off'],uiVolume:['10','20','35','50','75','100'],inputStyle:['auto','keyboard','xbox','playstation','nintendo','generic','arcade']};
  const defaults={filter:'original',frame:'club',mask:'none',strength:'balanced',cheats:'manual',fullscreen:'on',resume:'offer',autoSave:'on',cacheDays:'0',inputStyle:'auto',uiSound:'on',uiVolume:'20'};
  let settings={...defaults},scope='pixelarcade:local:',persisted=true,identityReady=true;
  const key=name=>scope+name;
  const ready=(async()=>{
    if(location.pathname.startsWith('/arcade/')){
      try{const r=await fetch('/arcade/auth/session',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(5000)});if(r.ok){const a=await r.json();if(typeof a.username!=='string'||!a.username)throw Error();scope='pixelarcade:'+encodeURIComponent(a.username)+':';}else identityReady=false;}catch{identityReady=false;}
    }
    await window.ArcadeAccountSync?.ready;
    if(identityReady)try{const saved=JSON.parse(localStorage.getItem(key('preferences'))||'null');for(const name in schema)if(schema[name].includes(saved?.[name]))settings[name]=saved[name];}catch{}
    return settings;
  })();
  function update(values){for(const name in values)if(schema[name]?.includes(values[name]))settings[name]=values[name];try{if(!identityReady)throw Error();localStorage.setItem(key('preferences'),JSON.stringify(settings));persisted=true;}catch{persisted=false;}window.ArcadeAccountSync?.settings(Object.fromEntries(Object.entries(values).filter(([name,value])=>schema[name]?.includes(value))));window.dispatchEvent(new CustomEvent('arcade-preferences-changed'));return persisted;}
  const libraryKey=name=>location.pathname.startsWith('/arcade/')?key(name):'arcade-'+name;
  function libraryRecords(){if(!identityReady)throw Error('账号状态暂不可用');if(window.ArcadeLibraryRecords)return window.ArcadeLibraryRecords.get();const result={};for(const name of ['favorites','recent']){const value=JSON.parse(localStorage.getItem(libraryKey(name))||'[]');result[name]=Array.isArray(value)?value.filter(v=>typeof v==='string'):[];}return result;}
  function restoreLibrary(value){if(!identityReady||!value||!['favorites','recent'].every(n=>Array.isArray(value[n])&&value[n].length<=10000&&value[n].every(v=>typeof v==='string'&&v.length<2048)))throw Error('备份格式不正确');const current=libraryRecords();for(const name of ['favorites','recent']){localStorage.setItem(libraryKey(name),JSON.stringify([...new Set([...current[name],...value[name]])]));for(const id of value[name])if(!current[name].includes(id))name==='favorites'?window.ArcadeAccountSync?.favorite(id,true):window.ArcadeAccountSync?.recent(id);}}
  let packPromise;
  function shaderPack(){return packPromise??=(async()=>{try{const r=await fetch(new URL('private-shaders.json',assets),{cache:'no-cache',signal:AbortSignal.timeout(3000)});if(!r.ok)return null;const p=await r.json();if(p.format!=='pixelarcade-phosphor-v1')return null;for(const name of ['phosphor-dot.glslp','phosphor-glow.glslp']){const v=p.shaders?.[name];if(v?.shader?.type!=='text'||typeof v.shader.value!=='string'||!Array.isArray(v.resources)||v.resources.some(r=>!/^[A-Za-z0-9_.-]+$/.test(r.name)||r.type!=='text'||typeof r.value!=='string'))return null;}return p;}catch{return null;}})();}
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
  async function localProgress(action,id,value){await ready;if(!identityReady)throw Error('账号状态暂不可用，继续点不会混用其他账号的数据');const database=await db('PixelArcade-progress-v1','snapshots'),ids=progressIDs(id);try{return await new Promise((resolve,reject)=>{
    const tx=database.transaction('snapshots',action==='get'?'readonly':'readwrite'),store=tx.objectStore('snapshots');let result,index=0;
    const request=()=>{const req=action==='get'?store.get(key(ids[index])):store.put(value,key(ids[0]));req.onsuccess=()=>{result=req.result;if(action==='get'&&result===undefined&&++index<ids.length)request();};};request();
    tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });}finally{database.close();}}
  async function progress(action,id,value){
    if(action!=='get'){await localProgress(action,id,value);try{await window.ArcadeAccountSync?.queueSave(id,value);}catch(e){window.ArcadeAccountSync?.report(e,id);}return;}
    const local=await localProgress('get',id),merged=await window.ArcadeAccountSync?.mergeSaves(id,local);
    if(merged&&merged!==local){try{await localProgress('put',id,merged);}catch{}}
    return merged??local;
  }
  window.addEventListener('arcade-account-data',e=>{for(const name in schema)if(schema[name].includes(e.detail.settings?.[name]))settings[name]=e.detail.settings[name];window.dispatchEvent(new CustomEvent('arcade-preferences-changed'));});
  const cacheStores=[['EmulatorJS-roms','rom'],['EmulatorJS-bios','bios'],['EmulatorJS-core','core'],['PixelArcade-core-downloads-v1','core']];
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
    if(cleaning)throw Error('正在清理，请稍候');if(window.ArcadeCoreCache?.busy)throw Error('核心正在下载，请完成后再清理');if(playing&&window.EJS_emulator?.started)throw Error('请回大厅后清理缓存');cleaning=true;
    try{const amounts=[];for(const [name,store] of cacheStores)amounts.push(await cacheStore(name,store,true));if(window.caches)for(const name of await caches.keys())if(name.startsWith('pixelarcade-cache-'))await caches.delete(name);try{localStorage.setItem(key('cache-last-clean'),String(Date.now()));}catch{}return amounts.reduce((a,b)=>a+b,0);}finally{cleaning=false;}
  }
  async function cleanIfDue(){await ready;if(!identityReady||playing||!document.querySelector('#grid')||document.hidden||settings.cacheDays==='0')return;const days=Number(settings.cacheDays);let last;try{last=Number(localStorage.getItem(key('cache-last-clean')));if(!last){localStorage.setItem(key('cache-last-clean'),String(Date.now()));return;}}catch{return;}if(Date.now()-last>=days*86400000){try{await clearCache();}catch{}}}
  const theme=document.createElement('link');theme.rel='stylesheet';theme.href=new URL('theme.css?v=arcade10',assets);document.head.append(theme);
  const dialog=document.createElement('dialog');dialog.id='arcadeSettings';dialog.setAttribute('aria-label','游戏厅设置');document.body.append(dialog);let previous,resume=false;
  const make=(tag,text,cls)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
  const labels={filter:'默认滤镜',strength:'默认效果强度',frame:'默认机台遮罩',mask:'默认屏幕纹理',cheats:'金手指功能',fullscreen:'开始游戏时全屏',resume:'继续上次游玩',autoSave:'自动保存继续点',cacheDays:'定期清理缓存',inputStyle:'操作图标风格',uiSound:'操作音效',uiVolume:'操作音量'};
  const names={filter:['原始像素','柔和 · 像素平滑','老电视 · CRT','荧光点 · 精细 CRT','荧光点 · 柔光','荧光线 2.0 · 标准','荧光线 2.0 · 扩散辉光','荧光线 2.0 · 玻璃反射'],strength:['轻','中','浓'],frame:['关闭 · 最大画面','木纹机台','奶白机台'],mask:['关闭','扫描线','荫罩'],cheats:['允许手动开启，默认不启用效果','关闭金手指功能'],fullscreen:['开启','关闭'],resume:['有继续点时提供选择','不显示继续选项'],autoSave:['开启 · 每 3 分钟保存一个继续点','关闭'],cacheDays:['不自动清理','每天','每 7 天','每 30 天'],uiSound:['开启','关闭'],uiVolume:['10% · 很轻','20% · 轻','35%','50%','75%','100%'],inputStyle:['自动识别当前设备','键盘','Xbox','PlayStation','任天堂','通用手柄','街机摇杆']};
  function picturePreview(){
    const preview=make('figure','','settings-preview');preview.id='settingsPreview';preview.setAttribute('aria-label','全局画面效果预览');
    const cabinet=make('div','','preview-cabinet'),marquee=make('div','PIXEL CLUB','preview-marquee'),screen=make('div','','preview-screen'),canvas=make('canvas'),shaderCanvas=make('canvas'),glass=make('div','','preview-glass'),deck=make('div','●　●　●　 ━','preview-deck');
    shaderCanvas.id='settingsShaderPreview';shaderCanvas.hidden=true;shaderCanvas.setAttribute('aria-label','当前着色器渲染的像素城市预览');let previewGeneration=0;
    canvas.width=256;canvas.height=144;canvas.setAttribute('aria-label','像素城市示例画面');const c=canvas.getContext('2d');
    c.fillStyle='#142039';c.fillRect(0,0,256,144);c.fillStyle='#f9cf82';c.fillRect(195,13,22,22);c.fillStyle='#263c59';
    for(let x=0;x<256;x+=24){const h=24+(x*7%47);c.fillRect(x,90-h,21,h);for(let y=90-h+6;y<85;y+=9){c.fillStyle='#b6c7a2';c.fillRect(x+5,y,3,3);c.fillRect(x+13,y,3,3);c.fillStyle='#263c59';}}
    c.fillStyle='#4e6372';c.fillRect(0,90,256,54);c.fillStyle='#a8b66c';c.fillRect(0,90,256,3);c.fillStyle='#9aa4a3';for(let x=0;x<256;x+=32)c.fillRect(x,121,17,2);
    c.fillStyle='#eaaa62';c.fillRect(98,106,51,15);c.fillRect(109,98,24,9);c.fillStyle='#91d8cf';c.fillRect(114,100,16,6);c.fillStyle='#111a26';c.fillRect(105,118,10,8);c.fillRect(133,118,10,8);
    c.font='bold 9px monospace';c.fillStyle='#e8f0d0';c.fillText('1UP  008500',9,13);c.fillStyle='#eb8c99';c.fillText('READY!',105,51);
    screen.append(canvas,shaderCanvas,glass);cabinet.append(marquee,screen,deck);preview.append(cabinet,make('figcaption','即时示例 · 滤镜、强度、机台和纹理随选择变化；游戏内使用核心原生滤镜。'));
    const refresh=async()=>{preview.querySelector('figcaption').textContent='像素城市示例 · 滤镜、强度、机台和纹理随选择变化。';const request=++previewGeneration;for(const key of ['filter','strength','frame','mask'])preview.dataset[key]=settings[key];preview.style.setProperty('--preview-blur',{light:'.25px',balanced:'.45px',strong:'.7px'}[settings.strength]);preview.style.setProperty('--preview-strength',{light:'.25',balanced:'.5',strong:'.8'}[settings.strength]);canvas.hidden=false;shaderCanvas.hidden=true;preview.dataset.nativeShader='off';const name={phosphor:'phosphor-dot.glslp','phosphor-glow':'phosphor-glow.glslp','phosphor-line':'phosphor-line.glslp','phosphor-line-glow':'phosphor-line-glow.glslp','phosphor-line-reflex':'phosphor-line-reflex.glslp'}[settings.filter];if(!name)return;const pack=await shaderPack();if(request!==previewGeneration||!dialog.open||!preview.isConnected)return;try{if(!pack?.shaders?.[name]||!window.ArcadeShaderPreview)throw Error();preview.dataset.nativeShader='on';ArcadeShaderPreview.render(shaderCanvas,canvas,pack.shaders[name],settings.strength);canvas.hidden=true;shaderCanvas.hidden=false;preview.dataset.nativeShader='on';preview.querySelector('figcaption').textContent='同款着色器实时渲染像素城市示例 · 实际游戏可用「对比原画」比较。';}catch{preview.dataset.nativeShader='off';preview.querySelector('figcaption').textContent='此设备暂时无法渲染高级预览，请进入游戏查看；原始示例仍可显示。';}};refresh();preview.refresh=refresh;preview.destroy=()=>{previewGeneration++;window.ArcadeShaderPreview?.destroy(shaderCanvas);};return preview;
  }
  async function render(){await ready;dialog.replaceChildren();dialog.append(make('p','PIXEL ARCADE / SETTINGS','ui-eyebrow'),make('h2','游戏厅设置'),make('p','全局默认用于尚未单独设置的游戏；单款游戏的选择优先。设置保存在当前浏览器。','ui-muted'));
    const closeIcon=make('button','×','settings-close');closeIcon.type='button';closeIcon.setAttribute('aria-label','关闭游戏厅设置');closeIcon.onclick=()=>dialog.close();dialog.prepend(closeIcon);
    const preview=picturePreview();dialog.append(preview);
    const installedPack=await shaderPack();const status=make('p','','settings-status');status.setAttribute('role','status');
    for(const [title,keys] of [['画面与辅助',['filter','strength','frame','mask','cheats']],['启动与输入',['fullscreen','resume','autoSave','inputStyle']],['声音',['uiSound','uiVolume']],['缓存维护',['cacheDays']]]){
      const section=make('section','','settings-section');section.append(make('h3',title));
      for(const name of keys){const label=make('label',labels[name],'settings-field'),select=make('select');select.setAttribute('aria-label',labels[name]);schema[name].forEach((v,i)=>select.add(new Option(names[name][i],v)));if(name==='filter')for(const option of select.options)if(option.value.startsWith('phosphor')&&!installedPack?.shaders?.[({'phosphor':'phosphor-dot.glslp','phosphor-glow':'phosphor-glow.glslp','phosphor-line':'phosphor-line.glslp','phosphor-line-glow':'phosphor-line-glow.glslp','phosphor-line-reflex':'phosphor-line-reflex.glslp'})[option.value]]){option.disabled=true;option.textContent+=' · 未导入资源';}select.value=settings[name];select.onchange=()=>{const old=settings.cacheDays;update({[name]:select.value});preview.refresh();if(name==='cacheDays'&&old==='0')try{localStorage.setItem(key('cache-last-clean'),String(Date.now()));}catch{}status.textContent=persisted?'已保存。游戏内已有单独画面设置时，可选择「使用全局默认」。':'浏览器无法保存，设置仅本次有效。';};label.append(select);section.append(label);}if(title==='声音'){const test=make('button','试听操作音');test.type='button';test.dataset.sound='none';test.onclick=async()=>{status.textContent=settings.uiSound==='off'?'音效已关闭，请先开启。':await window.ArcadeSound?.preview()?'正在试听：移动、确认、返回、启动、存档成功与失败。':'请先点击页面或按键，浏览器允许声音后再试听。';};section.append(test,make('p','只用手柄时，若提示未启用声音，请先用鼠标点击一次页面或按一下键盘。试听无声时请检查标签页静音及系统音量。长按移动限频；游戏画面内的动作不播放大厅操作音，自动存档成功保持安静。','ui-muted'));}dialog.append(section);
    }
    dialog.append(make('p','浏览器不允许自动进入全屏时，会先填满当前窗口。继续点按游戏与核心分别保存，实际游玩满 3 分钟后定时保存，暂停和后台不计时；打开菜单不保存。返回大厅或离开页面会更新本局最近的自动恢复点，避免重复记录。继续点不替代重要的手动存档。','ui-muted'));
    dialog.append(make('p','缓存清理仅删除可重新下载的 ROM、BIOS 和核心缓存，不删除存档、继续点、收藏、最近记录或按键设置。浏览器的全局 HTTP 缓存不在此范围内；定期清理只在打开大厅时执行。','ui-muted'));
    const cacheInfo=make('p','正在计算可清理缓存…','cache-info');dialog.append(cacheInfo);cacheBytes().then(bytes=>{cacheInfo.textContent='可清理引擎缓存：'+(bytes/1048576).toFixed(1)+' MB';}).catch(()=>{cacheInfo.textContent='浏览器暂时无法统计缓存。';});
    const preload=make('button','预加载游戏库所需核心');preload.type='button';preload.onclick=async()=>{preload.disabled=true;try{if(!window.ArcadeCoreCache)throw Error('请刷新页面后重试');const result=await ArcadeCoreCache.preload(text=>cacheInfo.textContent=text);cacheInfo.textContent='已准备 '+result.count+' 个核心，共 '+(result.bytes/1048576).toFixed(1)+' MB。下次启动将复用，可随时清理。';}catch(e){cacheInfo.textContent=e.message||'预加载失败，请重试。';}finally{preload.disabled=false;}};dialog.append(preload,make('p','预加载只下载当前游戏库需要的默认核心，不包含游戏 ROM；查看游戏详情也会提前准备核心。核心更新时会重新下载。','ui-muted'));
    const clear=make('button','立即清理下载缓存');clear.type='button';clear.onclick=async()=>{clear.disabled=true;try{const bytes=await clearCache();cacheInfo.textContent='已清理 '+(bytes/1048576).toFixed(1)+' MB；下次打开游戏会重新下载所需文件。';}catch(e){cacheInfo.textContent=e.message||'清理失败，请稍后再试。';}finally{clear.disabled=false;}};dialog.append(clear,status);
    const sync=window.ArcadeAccountSync;
    const syncSection=make('section','','settings-section');syncSection.append(make('h3','账号同步'));
    const syncNote=make('p','','ui-muted');syncNote.id='accountSyncStatus';
    const syncText=()=>{const s=sync?.status();syncNote.textContent=s?.enabled?'账号 '+(s.account||'未连接')+' · '+s.phase+(s.lastSync?' · 上次同步 '+new Date(s.lastSync).toLocaleTimeString('zh-CN'):'')+(s.error?'：'+s.error:''):'本机模式：此入口未启用账号服务。';};syncText();syncSection.append(syncNote);
    const retry=make('button','立即同步并重试');retry.type='button';retry.disabled=!sync?.status().enabled;retry.onclick=async()=>{retry.disabled=true;try{await sync.retry();}finally{retry.disabled=false;syncText();}};syncSection.append(retry,make('p','收藏、历史、全局及单个游戏画面设置、存档与缩略图随账号保存到 NAS。首次连接会合并本机已有记录；离线修改保留待上传。手柄设备编号和玩家分配保留在本机。手动、自动存档各保留 3 份；单份上限 16 MB，账号云存档上限 512 MB。请确认显示「已同步」后再清除浏览器网站数据。','ui-muted'));dialog.append(syncSection);
    const librarySection=make('section','','settings-section');librarySection.append(make('h3','收藏与游玩历史'));
    let records;try{records=libraryRecords();}catch{}
    librarySection.append(make('p','当前入口：'+location.origin+' · '+(scope==='pixelarcade:local:'?'本地浏览器':decodeURIComponent(scope.slice(11,-1)))+'；收藏 '+(records?.favorites.length??'不可用')+' 条，最近游玩 '+(records?.recent.length??'不可用')+' 条。本机保留离线副本；账号入口的同步情况见上方。下载缓存清理会保留记录；浏览器删除网站数据会清除尚未上传的修改和本地备份。导出的收藏历史备份不包含游戏存档。','ui-muted'));
    const exportButton=make('button','导出收藏与历史备份');exportButton.type='button';exportButton.onclick=()=>{try{const url=URL.createObjectURL(new Blob([JSON.stringify({format:'pixelarcade-library-v1',scope,...libraryRecords()},null,2)],{type:'application/json'})),a=make('a');a.href=url;a.download='pixelarcade-library-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status.textContent='已导出收藏和历史；游戏存档请在游戏内单独导出。';}catch{status.textContent='导出失败，浏览器存储暂不可用。';}};
    const importButton=make('button','导入收藏与历史备份'),file=make('input');importButton.type='button';file.type='file';file.accept='.json,application/json';file.hidden=true;importButton.onclick=()=>file.click();file.onchange=async()=>{try{if(!file.files[0])return;if(file.files[0].size>4*1024*1024)throw Error('备份文件过大');const value=JSON.parse(await file.files[0].text());if(value.format!=='pixelarcade-library-v1'||value.scope!==scope)throw Error('请选择当前账号的收藏历史备份');restoreLibrary(value);location.reload();}catch(e){status.textContent=e.message||'导入失败';}finally{file.value='';}};
    librarySection.append(exportButton,importButton,file);
    try{const saved=JSON.parse(localStorage.getItem(libraryKey('library-backup'))||'null');if(saved?.favorites?.length||saved?.recent?.length){const recover=make('button','合并恢复上次收藏与历史');recover.type='button';recover.onclick=()=>{try{restoreLibrary(saved);location.reload();}catch(e){status.textContent=e.message;}};librarySection.append(recover,make('p','可用本地备份：收藏 '+saved.favorites.length+' 条，历史 '+saved.recent.length+' 条。恢复会合并，不覆盖当前记录。','ui-muted'));}}catch{}
    dialog.append(librarySection);
    const close=make('button','完成');close.type='button';close.className='primary';close.onclick=()=>dialog.close();dialog.append(close);
  }
  window.addEventListener('arcade-sync-status',e=>{const n=document.querySelector('#accountSyncStatus');if(n)n.textContent='账号 '+(e.detail.account||'未连接')+' · '+e.detail.phase+(e.detail.error?'：'+e.detail.error:'');});
  async function open(){if(dialog.open)return;previous=document.activeElement;const em=window.EJS_emulator;resume=!!(em?.started&&!em.paused&&!document.querySelector('#padGuide[open]'));if(resume)em.pause();await render();dialog.showModal();requestAnimationFrame(()=>dialog.querySelector('#settingsPreview')?.refresh());dialog.querySelector('select')?.focus();}
  dialog.addEventListener('close',()=>{dialog.querySelector('#settingsPreview')?.destroy();if(resume)window.EJS_emulator?.play();resume=false;const target=previous?.isConnected?previous:document.querySelector('#padGuide[open] button,#padSettings[open] select');target?.focus();window.dispatchEvent(new CustomEvent('arcade-settings-closed'));});
  dialog.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();dialog.close();}});
  if(!playing){const b=make('button','游戏厅设置','global-settings-button');b.type='button';b.onclick=open;const header=document.querySelector('main>header');if(header)header.append(b);else (document.querySelector('.guide,.support')||document.body).prepend(b);}
  function resumePoints(saved){const seen=new Set(),list=[saved,...(Array.isArray(saved?.history)?saved.history:[])].filter(p=>p?.state?.byteLength).sort((a,b)=>b.updatedAt-a.updatedAt).filter(p=>{const id=p.updatedAt+':'+(p.sessionId||'');if(seen.has(id))return false;seen.add(id);return true;}).map(p=>({state:p.state,updatedAt:p.updatedAt,source:p.source||'legacy',core:p.core,src:p.src,thumbnail:p.thumbnail,sessionId:p.sessionId,reason:p.reason}));const counts=new Map();for(const p of list)counts.set(p.updatedAt,(counts.get(p.updatedAt)||0)+1);return list.map(p=>({...p,selectionKey:counts.get(p.updatedAt)>1?p.updatedAt+':'+(p.sessionId||''):String(p.updatedAt)}));}
  const resumeLabel=p=>(p.source==='manual'?'手动存档':p.source==='auto'?(p.reason==='checkpoint'?'离开前自动保存':p.reason==='periodic'?'定时自动存档':'自动存档'):'旧继续点')+' · '+new Date(p.updatedAt).toLocaleString('zh-CN');
  function resumePreview(){const figure=make('figure','','resume-preview'),image=make('img'),empty=make('span','此存档暂无画面预览','resume-preview-empty'),caption=make('figcaption');image.hidden=true;image.decoding='async';figure.append(image,empty,caption);image.onerror=()=>{image.hidden=true;empty.hidden=false;};figure.update=point=>{const valid=typeof point?.thumbnail==='string'&&point.thumbnail.length<100000&&/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(point.thumbnail);image.hidden=!valid;empty.hidden=!!valid;if(valid){image.src=point.thumbnail;image.alt=resumeLabel(point)+'的游戏画面';}else image.removeAttribute('src');caption.textContent=point?resumeLabel(point):'选择一份存档查看画面';};figure.update(null);return figure;}
  window.ArcadePreferences={ready,get:()=>({...settings}),update,key,gameKey,open,shaderPack,progress,resumePoints,resumeLabel,resumePreview,cacheBytes,clearCache};
  ready.then(()=>{cleanIfDue();window.dispatchEvent(new CustomEvent('arcade-preferences-ready'));});setInterval(cleanIfDue,60000);
})();
