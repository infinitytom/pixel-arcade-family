/* Regenerable core downloads, shared by the lobby and player. No save data. */
(() => {
  'use strict';
  const dataURL=new URL('../data/',document.currentScript.src),catalogURL=new URL('catalog.json',document.currentScript.src);
  const supported=['mame2003_plus','fbneo','fbalpha2012_cps1','fbalpha2012_cps2'];
  const inflight=new Map();let active=0;
  function database(){return new Promise((resolve,reject)=>{const r=indexedDB.open('PixelArcade-core-downloads-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('core');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
  async function record(key,value){const db=await database();try{return await new Promise((resolve,reject)=>{const tx=db.transaction('core',value?'readwrite':'readonly'),r=value?tx.objectStore('core').put(value,key):tx.objectStore('core').get(key);tx.oncomplete=()=>resolve(r.result);tx.onerror=tx.onabort=()=>reject(tx.error);});}finally{db.close();}}
  const stamp=response=>[response.headers.get('etag'),response.headers.get('last-modified'),response.headers.get('content-length')].join('|');
  async function download(core,gl='1'){
    if(!supported.includes(core))throw Error('该核心暂不支持预加载');
    const filename=core+(gl==='2'?'':'-legacy')+'-wasm.data',url=new URL('cores/'+filename,dataURL).href;
    if(inflight.has(url))return inflight.get(url);
    const task=(async()=>{active++;try{
      let saved;try{saved=await record(url);}catch{}
      if(saved?.data?.byteLength){
        try{const head=await fetch(url,{method:'HEAD',cache:'no-cache',signal:AbortSignal.timeout(10000)});if(head.ok&&stamp(head)!=='||'&&saved.stamp===stamp(head))return {filename,data:saved.data,cached:true};}
        catch{ return {filename,data:saved.data,cached:true}; }
      }
      const response=await fetch(url,{cache:'no-cache',signal:AbortSignal.timeout(180000)});if(!response.ok||response.headers.get('content-type')?.includes('text/html'))throw Error('核心下载失败（'+response.status+'）');
      const data=await response.arrayBuffer();if(data.byteLength<1024)throw Error('核心文件不完整');
      await record(url,{data,stamp:stamp(response)});
      return {filename,data,cached:false};
    }finally{active--;inflight.delete(url);}})();inflight.set(url,task);return task;
  }
  async function prepare(core,gl){
    try{const result=await download(core,gl),url=URL.createObjectURL(new Blob([result.data]));window.EJS_paths={...window.EJS_paths,[result.filename]:url};window.addEventListener('pagehide',()=>URL.revokeObjectURL(url),{once:true});return true;}
    catch(e){console.warn('核心预加载未完成，将使用模拟器正常下载：',e.message);return false;}
  }
  async function preload(onProgress=()=>{}){
    if(active)throw Error('核心正在下载，请稍候');
    let cores=['mame2003_plus'];try{const r=await fetch(catalogURL);if(r.ok){const catalog=await r.json();cores=[...new Set(catalog.games.map(g=>g.core).filter(c=>supported.includes(c)))];}}catch{}
    if(!cores.length)cores=['mame2003_plus'];
    let bytes=0;for(const [index,core] of cores.entries()){onProgress('正在预加载 '+core+'（'+(index+1)+'/'+cores.length+'）…');const result=await download(core);bytes+=result.data.byteLength;}
    return {count:cores.length,bytes};
  }
  // Select a game to warm its default core while the player reads its details.
  document.addEventListener('arcade-game-selected',e=>{if(!navigator.connection?.saveData&&supported.includes(e.detail?.core))download(e.detail.core).catch(()=>{});});
  window.ArcadeCoreCache={preload,prepare,get busy(){return active>0;}};
})();
