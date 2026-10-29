/* Freeze the restored game behind a translucent preparation countdown. */
(() => {
  'use strict';
  const stage=document.querySelector('#playerStage');if(!stage)return;
  const frozen=document.createElement('img');frozen.className='resume-countdown-frame';frozen.alt='';frozen.hidden=true;
  const overlay=document.createElement('section');overlay.id='resumeCountdown';overlay.hidden=true;overlay.setAttribute('aria-label','准备继续游戏');
  const shade=document.createElement('div');shade.className='resume-countdown-shade';const card=document.createElement('div');card.className='resume-countdown-card';
  const title=document.createElement('p');title.textContent='准备继续';const number=document.createElement('strong');number.setAttribute('role','timer');number.setAttribute('aria-live','polite');
  const hint=document.createElement('p');hint.textContent='看清局面，准备操作';const pause=document.createElement('button');pause.type='button';pause.textContent='暂停 · Esc';pause.dataset.sound='none';card.append(title,number,hint,pause);shade.append(card);overlay.append(shade);stage.append(overlay);
  let current=null,configured=false;
  function prepare(){
    const proto=window.EJS_GameManager?.prototype;if(configured||typeof proto?.getRetroArchCfg!=='function')return;
    configured=true;const cfg=proto.getRetroArchCfg;
    proto.getRetroArchCfg=function(){return cfg.call(this)+'\nvideo_font_enable = false\nmenu_enable_widgets = false\nmenu_show_start_screen = false\ninput_menu_toggle_gamepad_combo = "0"\ninput_quit_gamepad_combo = "0"\ninput_menu_toggle = "nul"\ninput_exit_emulator = "nul"\n';};
  }
  function release(em){const input=em.gameManager?.simulateInput;if(typeof input==='function')for(let p=0;p<4;p++)for(let b=0;b<30;b++)input.call(em.gameManager,p,b,0);}
  async function freeze(em,job){
    em.pause();
    while(document.hidden){if(current!==job)return;await new Promise(resolve=>setTimeout(resolve,100));}
    if(current!==job)return;
    em.play();
    // Loading a state does not immediately update RetroArch's video cache.
    // Present the restored state before requesting its screenshot.
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    if(current!==job)return;
    // Ask the core for its own video frame. WebGL buffers may be cleared when
    // a paused shader is changed, even though the core still has a valid image.
    const gm=em.gameManager;let capture=false,bytes=null;
    try{if(gm?.functions?.screenshot&&gm.FS){try{gm.FS.unlink('/screenshot.png');}catch{}gm.functions.screenshot();capture=true;}}catch{}
    const deadline=performance.now()+1000;let frames=0;
    do{
      await new Promise(resolve=>requestAnimationFrame(resolve));if(current!==job)return;
      frames++;
      if(capture)try{bytes=gm.FS.readFile('/screenshot.png');}catch{}
    }while(frames<2||(capture&&!bytes&&performance.now()<deadline));
    em.pause();
    if(bytes?.byteLength){
      document.querySelector('#game').append(frozen);
      job.url=URL.createObjectURL(new Blob([bytes],{type:'image/png'}));frozen.src=job.url;
      try{await frozen.decode();if(current===job)frozen.hidden=false;}catch{}
    }
  }
  function finish(play){
    const job=current;if(!job)return;current=null;cancelAnimationFrame(job.frame);
    if(job.input)job.em.gameManager.simulateInput=job.input;
    overlay.hidden=true;window.dispatchEvent(new Event('arcade-input-reset'));
    frozen.hidden=true;frozen.removeAttribute('src');if(job.url)URL.revokeObjectURL(job.url);
    if(play&&job.em===window.EJS_emulator&&!document.hidden)job.em.play();else job.em.pause();
    window.dispatchEvent(new CustomEvent(play?'arcade-resume-countdown-ended':'arcade-resume-countdown-cancelled'));job.resolve(play);
  }
  function start(em=window.EJS_emulator,{reveal}={}){
    if(current)return current.promise;
    if(!em?.started)return Promise.resolve(false);
    let resolve;const promise=new Promise(r=>resolve=r),job={em,resolve,promise,remaining:3000,last:null,frame:0,input:em.gameManager?.simulateInput};current=job;
    release(em);if(job.input)em.gameManager.simulateInput=function(player,button,value){if(!value)return job.input.call(this,player,button,value);};
    (async()=>{
      try{await freeze(em,job);if(current!==job)return;reveal?.();number.textContent='3';hint.textContent='看清局面，准备操作';overlay.hidden=false;pause.focus({preventScroll:true});window.dispatchEvent(new Event('arcade-resume-countdown-started'));
        const tick=now=>{if(current!==job)return;if(document.hidden){job.last=null;job.remaining=3000;number.textContent='3';hint.textContent='已暂停 · 回到游戏窗口后继续准备';}else{if(job.last!==null)job.remaining-=Math.min(100,now-job.last);job.last=now;hint.textContent='看清局面，准备操作';number.textContent=String(Math.max(1,Math.ceil(job.remaining/1000)));if(job.remaining<=0){finish(true);return;}}job.frame=requestAnimationFrame(tick);};job.frame=requestAnimationFrame(tick);
      }catch{finish(false);}
    })();return promise;
  }
  pause.onclick=()=>finish(false);
  for(const type of ['keydown','keyup','pointerdown','pointerup','touchstart','touchend'])document.addEventListener(type,event=>{
    if(!current)return;if(event.type==='keydown'&&event.key==='Tab'){event.preventDefault();event.stopImmediatePropagation();pause.focus({preventScroll:true});return;}if(event.type==='keydown'&&event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();finish(false);return;}
    if((event.target===pause||pause.contains(event.target))&&(!event.type.startsWith('key')||['Enter',' '].includes(event.key)))return;
    event.preventDefault();event.stopImmediatePropagation();
  },{capture:true,passive:false});
  document.addEventListener('visibilitychange',()=>{if(current){current.last=null;current.remaining=3000;current.em.pause();}});
  window.addEventListener('pagehide',()=>finish(false));
  window.ArcadeResumeCountdown={prepare,start,cancel:()=>finish(false),get active(){return !!current;}};
})();
