/* Adapt 7z arcade sets to ZIP inside the emulator's temporary filesystem. */
(() => {
  'use strict';
  const bound=new WeakSet(),signature=[55,122,188,175,39,28],encoder=new TextEncoder(),assets=new URL('./',document.currentScript.src),parents=[];
  const table=Uint32Array.from({length:256},(_,n)=>{for(let j=0;j<8;j++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
  function crc32(bytes){let crc=0xffffffff;for(let i=0;i<bytes.length;i++)crc=table[(crc^bytes[i])&255]^(crc>>>8);return (crc^0xffffffff)>>>0;}
  function header(length){const bytes=new Uint8Array(length);return {bytes,view:new DataView(bytes.buffer)};}
  function zipWriter(fs,path){
    const stream=fs.open(path,'w'),directory=[],names=new Set();let offset=0,closed=false;
    const write=data=>{if(offset+data.length>0xffffffff)throw Error('解压后的资源超出当前核心可读取的 ZIP 大小');fs.write(stream,data,0,data.length,offset);offset+=data.length;};
    return {
      add(name,input){
        if(typeof name!=='string'||name.endsWith('/'))return;
        name=name.replace(/\\/g,'/');if(!name||name.startsWith('/')||name.includes('\0')||name.split('/').some(p=>p==='..')||names.has(name))throw Error('7z 包内的文件名无效或重复');
        const filename=encoder.encode(name),data=input instanceof Uint8Array?input:new Uint8Array(input);
        if(filename.length>65535||names.size>=65535||data.length>0xffffffff)throw Error('资源超出当前 ZIP 格式支持范围');
        names.add(name);const crc=crc32(data),start=offset,local=header(30),v=local.view;
        v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint16(12,33,true);v.setUint32(14,crc,true);v.setUint32(18,data.length,true);v.setUint32(22,data.length,true);v.setUint16(26,filename.length,true);
        write(local.bytes);write(filename);write(data);
        const central=header(46),c=central.view;c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint16(8,0x800,true);c.setUint16(14,33,true);c.setUint32(16,crc,true);c.setUint32(20,data.length,true);c.setUint32(24,data.length,true);c.setUint16(28,filename.length,true);c.setUint32(42,start,true);directory.push(central.bytes,filename);
      },
      finish(){if(!names.size)throw Error('7z 包中没有游戏文件');const start=offset;for(const data of directory)write(data);const end=header(22),v=end.view;v.setUint32(0,0x06054b50,true);v.setUint16(8,names.size,true);v.setUint16(10,names.size,true);v.setUint32(12,offset-start,true);v.setUint32(16,start,true);write(end.bytes);fs.close(stream);closed=true;},
      abort(){if(!closed){try{fs.close(stream);}catch{}closed=true;}try{fs.unlink(path);}catch{}}
    };
  }
  function progress(em,text){if(em.textElem)em.textElem.innerText=text;window.dispatchEvent(new CustomEvent('arcade-rom-progress',{detail:{text}}));}
  async function convert(em,source=em.fileName){
    const fs=em.gameManager.FS,probe=new Uint8Array(6),stream=fs.open(source,'r');try{fs.read(stream,probe,0,6,0);}finally{fs.close(stream);}
    if(!signature.every((b,i)=>probe[i]===b))return source;
    progress(em,'正在准备 7z 兼容资源…');
    const compression=new window.EJS_COMPRESSION(em);let timer;
    const workerFile=await Promise.race([compression.getWorkerFile('7z'),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('7z 解压组件下载超时')),30000);})]).finally(()=>clearTimeout(timer));
    const target=source.replace(/\.(7z|zip)$/i,'')+'.zip',temporary=target+'.arcade-tmp',writer=zipWriter(fs,temporary),url=URL.createObjectURL(workerFile);let worker;
    try{
      worker=new Worker(url);const raw=fs.readFile(source);
      await new Promise((resolve,reject)=>{
        timer=setTimeout(()=>reject(Error('7z 解压超时，请重新载入后重试')),300000);
        worker.onerror=()=>reject(Error('7z 解压失败，请检查资源是否完整'));worker.onmessageerror=()=>reject(Error('7z 解压结果无法读取'));
        worker.onmessage=event=>{const data=event.data;if(!data)return;try{
          if(data.t===4){const percent=Math.floor(data.current/data.total*100);if(Number.isFinite(percent))progress(em,'正在解压 7z · '+Math.min(100,percent)+'%');}
          else if(data.t===2){progress(em,'正在整理游戏文件…');writer.add(data.file,data.data);}
          else if(data.t===1)resolve();
        }catch(error){reject(error);}};
        worker.postMessage(raw,[raw.buffer]);
      });
      writer.finish();fs.rename(temporary,target);if(source!==target)fs.unlink(source);
      progress(em,'兼容资源已就绪，正在启动游戏…');
      return target;
    }catch(error){writer.abort();throw error;}
    finally{clearTimeout(timer);worker?.terminate();URL.revokeObjectURL(url);}
  }
  async function prepareLibrary(){
    const query=new URLSearchParams(location.search),core=query.get('core'),src=query.get('src')||'';
    if(!['fbneo','mame2003_plus'].includes(core)||src.startsWith('blob:'))return;
    const bios=query.get('bios')||'';if(core==='fbneo'&&/\/neogeo\.zip$/i.test(bios))window.EJS_externalFiles={...window.EJS_externalFiles,'/neogeo.zip':new URL(bios,location.origin).href};
    const canonical=value=>decodeURIComponent(new URL(value,location.origin).pathname).replace(/^\/arcade\/roms\//,'/roms/');
    try{
      const response=await fetch(new URL('rom-parents.json',assets),{signal:AbortSignal.timeout(5000)});if(!response.ok)return;
      const map=(await response.json())[core]||{},stem=canonical(src).split('/').pop().replace(/\.(zip|7z)$/i,'').toLowerCase();if(!map[stem])return;
      const catalogResponse=await fetch(new URL('catalog.json',assets),{signal:AbortSignal.timeout(10000)});if(!catalogResponse.ok)return;
      const games=(await catalogResponse.json()).games||[],seen=new Set([stem]);let parent=map[stem];
      while(parent&&!seen.has(parent)&&seen.size<9){
        seen.add(parent);if(!/^[a-z0-9_+-]+$/i.test(parent))break;
        const candidates=games.filter(g=>typeof g.rom==='string'&&g.filename?.replace(/\.(zip|7z)$/i,'').toLowerCase()===parent&&canonical(g.rom)!==canonical(src));
        const modified=g=>g.hack===true||/hack/i.test(g.category+' '+g.rom);
        candidates.sort((a,b)=>Number(modified(a))-Number(modified(b))||a.rom.length-b.rom.length||a.rom.localeCompare(b.rom));
        const selected=candidates[0];if(!selected)break;
        let url=new URL(selected.rom,location.origin);if(url.origin!==location.origin||!/^\/(arcade\/)?roms\//.test(url.pathname))break;
        if(src.startsWith('/arcade/roms/')&&url.pathname.startsWith('/roms/'))url=new URL('/arcade'+url.pathname,location.origin);
        const extension=/\.7z$/i.test(url.pathname)?'.7z':'.zip',name='/'+parent+extension;
        window.EJS_externalFiles={...window.EJS_externalFiles,[name]:url.href};if(!parents.includes(name))parents.push(name);parent=map[parent];
      }
    }catch(error){console.warn('父资源检查暂未完成：',error.message);}
  }
  function prepare(){
    const em=window.EJS_emulator;if(!em||bound.has(em)||typeof em.downloadRom!=='function')return;
    if(!['arcade','mame'].includes(em.getCore(true)))return;
    bound.add(em);const download=em.downloadRom;
    em.downloadRom=async function(...args){await download.apply(this,args);try{this.fileName=await convert(this);for(const name of parents)await convert(this,name);}catch(error){this.arcadeStartError='游戏资源准备失败：'+(error.message||'请检查资源是否完整后重试');this.startGameError(this.arcadeStartError);throw error;}};
  }
  window.ArcadeRomArchive={prepare,prepareLibrary};
})();
