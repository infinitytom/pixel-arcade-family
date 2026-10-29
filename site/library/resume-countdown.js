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
  function finish(play){
    const job=current;if(!job)return;current=null;clearInterval(job.timer);
    if(job.input)job.em.gameManager.simulateInput=job.input;
    overlay.hidden=true;window.dispatchEvent(new Event('arcade-input-reset'));
    if(play&&job.em===window.EJS_emulator&&!document.hidden)job.em.play();else job.em.pause();
    window.dispatchEvent(new CustomEvent(play?'arcade-resume-countdown-ended':'arcade-resume-countdown-cancelled'));job.resolve(play);
  }
  function start(em=window.EJS_emulator,{reveal}={}){
    if(current)return current.promise;
    if(!em?.started)return Promise.resolve(false);
    let resolve;const promise=new Promise(r=>resolve=r),job={em,resolve,promise,remaining:3,timer:0,input:em.gameManager?.simulateInput};current=job;
    release(em);if(job.input)em.gameManager.simulateInput=function(player,button,value){if(!value)return job.input.call(this,player,button,value);};
    (async()=>{
      try{
        await window.ArcadeExperience?.settled?.();
        if(current!==job)return;
        reveal?.();
        em.play();
        await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
        if(current!==job)return;
        em.pause();place();number.textContent='3';overlay.hidden=false;
        overlay.focus({preventScroll:true});window.dispatchEvent(new Event('arcade-resume-countdown-started'));
        job.timer=setInterval(()=>{
          if(document.hidden)return;
          if(--job.remaining===0){finish(true);return;}
          number.textContent=String(job.remaining);
        },1000);
      }catch{finish(false);}
    })();return promise;
  }
  for(const type of ['keydown','keyup','pointerdown','pointerup','touchstart','touchend'])document.addEventListener(type,event=>{
    if(!current)return;if(event.type==='keydown'&&event.key==='Tab'){event.preventDefault();event.stopImmediatePropagation();overlay.focus({preventScroll:true});return;}if(event.type==='keydown'&&event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();finish(false);return;}
    event.preventDefault();event.stopImmediatePropagation();
  },{capture:true,passive:false});
  document.addEventListener('visibilitychange',()=>{if(current&&document.hidden){current.remaining=3;number.textContent='3';current.em.pause();}});
  window.addEventListener('pagehide',()=>finish(false));
  window.ArcadeResumeCountdown={prepare,start,cancel:()=>finish(false),get active(){return !!current;}};
})();
