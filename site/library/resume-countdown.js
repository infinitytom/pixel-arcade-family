/* Show only a preparation number over the actual paused game canvas. */
(() => {
  'use strict';
  const stage=document.querySelector('#playerStage');if(!stage)return;
  const overlay=document.createElement('section');overlay.id='resumeCountdown';overlay.hidden=true;overlay.tabIndex=-1;overlay.setAttribute('aria-label','准备继续游戏');
  const number=document.createElement('strong');number.setAttribute('role','timer');number.setAttribute('aria-live','polite');overlay.append(number);stage.append(overlay);
  function place(){const game=document.querySelector('#game');Object.assign(overlay.style,{left:game.offsetLeft+'px',top:game.offsetTop+'px',width:game.offsetWidth+'px',height:game.offsetHeight+'px'});}
  new ResizeObserver(place).observe(document.querySelector('#game'));
  let current=null,configured=false;
  function prepare(){
    const proto=window.EJS_GameManager?.prototype;if(configured||typeof proto?.getRetroArchCfg!=='function')return;
    configured=true;const cfg=proto.getRetroArchCfg;
    proto.getRetroArchCfg=function(){return cfg.call(this)+'\nvideo_font_enable = false\nmenu_enable_widgets = false\nmenu_show_start_screen = false\ninput_menu_toggle_gamepad_combo = "0"\ninput_quit_gamepad_combo = "0"\ninput_menu_toggle = "nul"\ninput_exit_emulator = "nul"\n';};
  }
  function release(em){const input=em.gameManager?.simulateInput;if(typeof input==='function')for(let p=0;p<4;p++)for(let b=0;b<30;b++)input.call(em.gameManager,p,b,0);}
  async function freeze(em,job){
    await window.ArcadeExperience?.settled?.();
    if(current!==job)return;
    em.pause();
    while(document.hidden){if(current!==job)return;await new Promise(resolve=>setTimeout(resolve,100));}
    if(current!==job)return;
    window.ArcadeExperience?.prepareResume?.();
    em.play();
    // Loading a state does not immediately update RetroArch's video cache.
    // Present the restored state before pausing the actual canvas.
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    if(current!==job)return;
    // Core startup can change the native dimensions. Finish shader setup while
    // rendering still runs; applying it after pause can clear the screen.
    window.ArcadeExperience?.prepareResume?.();
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    if(current!==job)return;
    em.pause();
  }
  function finish(play){
    const job=current;if(!job)return;current=null;cancelAnimationFrame(job.frame);
    if(job.input)job.em.gameManager.simulateInput=job.input;
    overlay.hidden=true;window.dispatchEvent(new Event('arcade-input-reset'));
    if(play&&job.em===window.EJS_emulator&&!document.hidden)job.em.play();else job.em.pause();
    window.dispatchEvent(new CustomEvent(play?'arcade-resume-countdown-ended':'arcade-resume-countdown-cancelled'));job.resolve(play);
  }
  function start(em=window.EJS_emulator,{reveal}={}){
    if(current)return current.promise;
    if(!em?.started)return Promise.resolve(false);
    let resolve;const promise=new Promise(r=>resolve=r),job={em,resolve,promise,remaining:3000,last:null,frame:0,input:em.gameManager?.simulateInput};current=job;
    release(em);if(job.input)em.gameManager.simulateInput=function(player,button,value){if(!value)return job.input.call(this,player,button,value);};
    (async()=>{
      try{reveal?.();await freeze(em,job);if(current!==job)return;place();number.textContent='3';overlay.hidden=false;overlay.focus({preventScroll:true});window.dispatchEvent(new Event('arcade-resume-countdown-started'));
        const tick=now=>{if(current!==job)return;if(document.hidden){job.last=null;job.remaining=3000;number.textContent='3';}else{if(job.last!==null)job.remaining-=Math.min(100,now-job.last);job.last=now;number.textContent=String(Math.max(1,Math.ceil(job.remaining/1000)));if(job.remaining<=0){finish(true);return;}}job.frame=requestAnimationFrame(tick);};job.frame=requestAnimationFrame(tick);
      }catch{finish(false);}
    })();return promise;
  }
  for(const type of ['keydown','keyup','pointerdown','pointerup','touchstart','touchend'])document.addEventListener(type,event=>{
    if(!current)return;if(event.type==='keydown'&&event.key==='Tab'){event.preventDefault();event.stopImmediatePropagation();overlay.focus({preventScroll:true});return;}if(event.type==='keydown'&&event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();finish(false);return;}
    event.preventDefault();event.stopImmediatePropagation();
  },{capture:true,passive:false});
  document.addEventListener('visibilitychange',()=>{if(current){current.last=null;current.remaining=3000;current.em.pause();}});
  window.addEventListener('pagehide',()=>finish(false));
  window.ArcadeResumeCountdown={prepare,start,cancel:()=>finish(false),get active(){return !!current;}};
})();
