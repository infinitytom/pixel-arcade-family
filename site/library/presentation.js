/* A skippable walk-up to the cabinet; resume and reduced motion stay immediate. */
(() => {
  'use strict';
  const stage=document.querySelector('#playerStage'),game=document.querySelector('#game');if(!stage||!game)return;
  const scene=game.parentElement,room=stage.querySelector('.arcade-room-background');
  const params=new URLSearchParams(location.search),assets=new URL('./',document.currentScript.src);let posterURL=new URL('assets/arcade-icon-v1.svg',assets).href;
  try{const cover=new URL(params.get('cover')||'',location.origin);if(params.get('cover')&&cover.origin===location.origin&&/^https?:$/.test(cover.protocol))posterURL=cover.href;}catch{}
  const poster=document.createElement('img');poster.className='launch-poster';poster.alt='游戏海报';poster.src=posterURL;poster.onerror=()=>{poster.onerror=null;poster.src=new URL('assets/arcade-icon-v1.svg',assets).href;posterURL=poster.src;};
  const hero=document.createElement('div');hero.className='launch-hero';const title=document.querySelector('#launchTitle');title.before(hero);hero.append(poster,title);
  const entrance=document.createElement('div');entrance.id='arcadeEntrance';entrance.hidden=true;entrance.setAttribute('aria-hidden','true');
  const image=document.createElement('img');image.alt='';image.src=posterURL;image.onerror=()=>{image.onerror=null;image.src=new URL('assets/arcade-icon-v1.svg',assets).href;};
  const label=document.createElement('span');label.textContent='正在准备机台…';entrance.append(image,label);scene.append(entrance);
  const skip=document.createElement('button');skip.id='arcadeApproachSkip';skip.hidden=true;skip.type='button';skip.dataset.sound='none';skip.setAttribute('aria-label','跳过入场动画');skip.innerHTML='<span data-device-action="confirm">确认键</span> 跳过入场';stage.append(skip);
  const media=matchMedia('(prefers-reduced-motion: reduce)'),duration=720,far='translate3d(0,-4%,0) scale(.68)',roomFar='translate3d(0,-.6%,0) scale(.965)';
  let running=false,phase='idle',generation=0,timer=null,motion=false,mode='new',pointerBlockedUntil=0,animations=[],original=null;
  const canMove=()=>!media.matches&&stage.dataset.cabinet!=='none'&&mode==='new'&&typeof scene.animate==='function'&&typeof image.animate==='function';
  function place(){Object.assign(entrance.style,{left:game.offsetLeft+'px',top:game.offsetTop+'px',width:game.offsetWidth+'px',height:game.offsetHeight+'px'});}
  function clear(reason='finished'){
    const wasRunning=running;generation++;running=false;phase='idle';clearTimeout(timer);
    for(const a of animations)a.cancel();animations=[];(entrance.getAnimations?.()||[]).forEach(a=>a.cancel());(image.getAnimations?.()||[]).forEach(a=>a.cancel());
    entrance.hidden=skip.hidden=true;delete stage.dataset.approach;
    if(original){scene.style.transform=original.transform;scene.style.transformOrigin=original.origin;if(room){room.style.transform=original.roomTransform;room.style.transformOrigin=original.roomOrigin;}original=null;}
    if(wasRunning)window.dispatchEvent(new CustomEvent('arcade-presentation-ended',{detail:{reason,mode}}));
  }
  function animate(node,frames,options){const a=node.animate(frames,options);animations.push(a);return a;}
  const observer=new ResizeObserver(()=>{place();if(phase==='approach')clear('resize');});observer.observe(game);
  window.ArcadePresentation={
    start(selectedMode='new'){
      clear('replaced');mode=selectedMode==='continue'?'continue':'new';motion=canMove();running=true;phase='loading';stage.dataset.approach='loading';
      const from=poster.getBoundingClientRect();original={transform:scene.style.transform,origin:scene.style.transformOrigin,roomTransform:room?.style.transform||'',roomOrigin:room?.style.transformOrigin||''};
      if(motion){scene.style.transformOrigin='50% 52%';scene.style.transform=far;if(room){room.style.transformOrigin='50% 52%';room.style.transform=roomFar;}}
      image.src=poster.currentSrc||poster.src;label.textContent=mode==='continue'?'正在准备存档…':'正在准备机台…';entrance.hidden=false;place();
      if(motion){const to=entrance.getBoundingClientRect(),scale=scene.getBoundingClientRect().width/Math.max(1,scene.offsetWidth),x=(from.left+from.width/2-to.left-to.width/2)/scale,y=(from.top+from.height/2-to.top-to.height/2)/scale;animate(image,[{transform:`translate(${x}px,${y}px) scale(.45)`,opacity:.65},{transform:'none',opacity:1}],{duration:260,easing:'cubic-bezier(.2,.7,.2,1)'});}
    },
    ready(){
      if(!running||phase!=='loading')return;window.ArcadeExperience?.layout();place();const token=generation;
      if(!motion||!canMove()){clear('immediate');return;}
      phase='settling';
      // Let fullscreen and core aspect changes settle before moving the camera.
      requestAnimationFrame(()=>requestAnimationFrame(()=>{
        if(token!==generation||!running)return;if(!canMove()){clear('immediate');return;}
        phase='approach';stage.dataset.approach='active';skip.hidden=false;
        (image.getAnimations?.()||[]).forEach(a=>a.cancel());scene.style.transform='';if(room)room.style.transform='';
        try{
          const camera=animate(scene,[{transform:far},{transform:'none'}],{duration,easing:'cubic-bezier(.16,.68,.22,1)'});
          if(room)animate(room,[{transform:roomFar},{transform:'none'}],{duration,easing:'cubic-bezier(.16,.68,.22,1)'});
          animate(entrance,[{opacity:1},{opacity:0}],{duration:190,fill:'forwards',easing:'ease-out'});
          camera.finished.then(()=>{if(token===generation)clear();}).catch(()=>{});
          timer=setTimeout(()=>{if(token===generation)clear();},duration+120);
          window.dispatchEvent(new CustomEvent('arcade-presentation-started',{detail:{duration,mode}}));
        }catch{clear('unsupported');}
      }));
    },
    approaching:()=>running&&phase==='approach',
    skip(){if(phase!=='approach')return false;clear('skipped');return true;},
    failed(){clear('failed');}
  };
  skip.onclick=()=>window.ArcadePresentation.skip();
  window.addEventListener('keydown',e=>{if(phase!=='approach'||e.repeat||e.altKey||e.ctrlKey||e.metaKey||!['Enter',' ','Escape'].includes(e.key))return;if(e.isTrusted)window.ArcadeGameAudio?.recover(true);e.preventDefault();e.stopImmediatePropagation();window.ArcadePresentation.skip();},true);
  stage.addEventListener('pointerdown',e=>{if(phase!=='approach')return;pointerBlockedUntil=performance.now()+300;if(e.isTrusted)window.ArcadeGameAudio?.recover(true);e.preventDefault();e.stopImmediatePropagation();window.ArcadePresentation.skip();},true);
  stage.addEventListener('touchstart',e=>{if(performance.now()<pointerBlockedUntil){e.preventDefault();e.stopImmediatePropagation();}},{capture:true,passive:false});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&running)clear('hidden');});
  window.addEventListener('pagehide',()=>clear('pagehide'));
  media.addEventListener('change',()=>{if(media.matches&&running)clear('reduced-motion');});
  window.addEventListener('arcade-preferences-changed',()=>{if(running&&stage.dataset.cabinet==='none')clear('no-cabinet');});
})();
