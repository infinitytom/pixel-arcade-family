/* Restore the game's own audio after pause/load, preserving the player's level. */
(() => {
  'use strict';
  if(!document.querySelector('#game'))return;
  let attached=null,generation=0,lastAttempt=0,notice=null;
  const pending=new WeakMap();
  function showNotice(show){
    if(show&&!notice){notice=document.createElement('button');notice.id='restoreGameAudio';notice.className='arcade-sound-enable';notice.type='button';notice.dataset.sound='none';notice.textContent='游戏声音未恢复 · 点击此处或按一下键盘重试';notice.onclick=()=>recover(true);document.body.append(notice);}
    if(notice)notice.hidden=!show;
  }
  function contexts(em){const al=em.Module?.AL;return [...new Set([al?.currentCtx,...Object.values(al?.contexts||{})].map(c=>c?.audioCtx).filter(Boolean))];}
  async function recover(gesture=false){
    const em=window.EJS_emulator;
    if(!em?.started||em.paused||document.hidden||!document.hasFocus())return false;
    const audio=contexts(em);if(!audio.length)return false;
    // Re-created sources after loading a state can lose their output gain even
    // though the player still reports the previous volume/mute preference.
    if(Number.isFinite(em.volume)&&typeof em.setVolume==='function')em.setVolume(em.muted?0:em.volume);
    await Promise.all(audio.map(async context=>{
      if(context.state==='running'||context.state==='closed')return;
      try{
        let attempt=pending.get(context);if(!attempt||gesture){attempt=context.resume();pending.set(context,attempt);attempt.catch(()=>{}).finally(()=>{if(pending.get(context)===attempt)pending.delete(context);});}
        await Promise.race([attempt,new Promise(resolve=>setTimeout(resolve,180))]);
      }catch{}
    }));
    if(em!==window.EJS_emulator||em.paused||document.hidden)return false;
    const ready=audio.every(c=>c.state==='running');showNotice(!ready&&!em.muted);return ready;
  }
  function schedule(){const request=++generation;for(const delay of [0,120,450])setTimeout(()=>{if(request===generation)recover();},delay);}
  function attach(){
    const em=window.EJS_emulator;if(!em?.gameManager?.loadState||typeof em.play!=='function'||attached===em)return;
    attached=em;
    const play=em.play;em.play=function(...args){const result=play.apply(this,args);schedule();return result;};
    const load=em.gameManager.loadState;em.gameManager.loadState=function(...args){const result=load.apply(this,args);schedule();return result;};
    schedule();
  }
  function gesture(event){if(event.isTrusted){attach();const em=window.EJS_emulator;if(em&&(contexts(em).some(c=>c.state!=='running')||notice&&!notice.hidden))recover(true);}}
  document.addEventListener('pointerdown',gesture,true);document.addEventListener('keydown',gesture,true);
  window.addEventListener('arcade-resume-restored',schedule);
  window.addEventListener('focus',schedule);document.addEventListener('visibilitychange',()=>{if(document.hidden){generation++;showNotice(false);}else schedule();});
  const watcher=setInterval(()=>{attach();const em=window.EJS_emulator;if(!em?.started||em.paused||document.hidden||!document.hasFocus())return;if(contexts(em).some(c=>c.state!=='running')&&performance.now()-lastAttempt>1500){lastAttempt=performance.now();recover();}},250);
  window.addEventListener('pagehide',()=>{generation++;clearInterval(watcher);showNotice(false);});
  window.ArcadeGameAudio={recover,attach};
})();
