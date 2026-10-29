/* Keep preparation bounded and report stalled network work without deleting data. */
(() => {
  'use strict';
  const stage=document.querySelector('#playerStage');if(!stage)return;
  let failed=false,startedAt=0,lastProgress=0,lastText='',slow=null;
  const pending=new Set();
  function retryButton(parent){let button=parent.querySelector('[data-startup-retry]');if(!button){button=document.createElement('button');button.type='button';button.dataset.startupRetry='';button.textContent='重新载入';button.onclick=()=>location.reload();parent.append(button);}return button;}
  function status(text){const node=document.querySelector('#launchStatus');if(node)node.textContent=text;window.dispatchEvent(new CustomEvent('arcade-rom-progress',{detail:{text}}));}
  function failure(text){failed=true;status(text);retryButton(document.querySelector('.launch-card'));}
  async function run(script,tasks){
    let timeout,warning;
    warning=setTimeout(()=>{if(!failed&&pending.size){status('网络或存储响应较慢，正在等待：'+[...pending].join('、')+'。可重新载入重试。');retryButton(document.querySelector('.launch-card'));}},10000);
    try{
      const work=Promise.all(tasks.map(async([name,task])=>{pending.add(name);if(!failed)status('正在准备：'+[...pending].join('、')+'…');try{await task();}finally{pending.delete(name);if(!failed&&pending.size)status('正在准备：'+[...pending].join('、')+'…');}}));
      await Promise.race([work,new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('准备超过 30 秒：'+[...pending].join('、')+'未响应。请重新载入，已有收藏和存档会保留。')),30000);})]);
      script.onerror=()=>failure('模拟器脚本下载失败，请检查网络后重新载入。');
      if(!failed){status('正在载入模拟器界面…');document.body.append(script);setTimeout(()=>{if(!document.querySelector('#playerLaunch')?.hidden&&!document.querySelector('.ejs_start_button')&&!window.EJS_emulator?.started)failure('模拟器界面下载超过 20 秒，请检查网络后重新载入。');},20000);}
    }catch(error){failure(error.message||'准备失败，请重新载入。');}
    finally{clearTimeout(timeout);clearTimeout(warning);}
  }
  const watch=setInterval(()=>{
    const em=window.EJS_emulator,launch=document.querySelector('#playerLaunch');
    if(!em||!launch?.hidden||em.started||em.failedToStart){startedAt=0;slow?.remove();slow=null;return;}
    const now=performance.now();if(!startedAt){startedAt=lastProgress=now;}
    const text=em.textElem?.textContent?.trim();if(text&&text!==lastText){lastText=text;lastProgress=now;status(text);slow?.remove();slow=null;}
    if(now-lastProgress>20000&&!slow){slow=document.createElement('div');slow.className='startup-network-notice';slow.setAttribute('role','status');const message=document.createElement('p');message.textContent='下载或初始化已超过 20 秒没有进展。可以继续等待，或重新载入重试；无需清理存档和网站数据。';slow.append(message);retryButton(slow);stage.append(slow);}
  },250);
  window.addEventListener('pagehide',()=>clearInterval(watch));
  window.ArcadeStartup={run};
})();
