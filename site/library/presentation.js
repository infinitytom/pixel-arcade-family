/* A short poster-to-screen entrance; gameplay starts immediately beneath it. */
(() => {
  'use strict';
  const stage=document.querySelector('#playerStage'),game=document.querySelector('#game');if(!stage||!game)return;
  const params=new URLSearchParams(location.search),assets=new URL('./',document.currentScript.src);let posterURL=new URL('assets/arcade-icon-v1.svg',assets).href;
  try{const cover=new URL(params.get('cover')||'',location.origin);if(params.get('cover')&&cover.origin===location.origin&&/^https?:$/.test(cover.protocol))posterURL=cover.href;}catch{}
  const poster=document.createElement('img');poster.className='launch-poster';poster.alt='游戏海报';poster.src=posterURL;poster.onerror=()=>{poster.onerror=null;poster.src=new URL('assets/arcade-icon-v1.svg',assets).href;posterURL=poster.src;};
  const hero=document.createElement('div');hero.className='launch-hero';const title=document.querySelector('#launchTitle');title.before(hero);hero.append(poster,title);
  const entrance=document.createElement('div');entrance.id='arcadeEntrance';entrance.hidden=true;entrance.setAttribute('aria-hidden','true');const image=document.createElement('img');image.alt='';image.src=posterURL;image.onerror=()=>{image.onerror=null;image.src=new URL('assets/arcade-icon-v1.svg',assets).href;};const label=document.createElement('span');label.textContent='正在启动游戏…';entrance.append(image,label);(game.parentElement||stage).append(entrance);
  const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;let running=false,generation=0,startedAt=0,timer=null;
  function place(){Object.assign(entrance.style,{left:game.offsetLeft+'px',top:game.offsetTop+'px',width:game.offsetWidth+'px',height:game.offsetHeight+'px'});}
  function clear(){generation++;running=false;clearTimeout(timer);entrance.getAnimations().forEach(a=>a.cancel());image.getAnimations().forEach(a=>a.cancel());entrance.hidden=true;}
  new ResizeObserver(place).observe(game);
  window.ArcadePresentation={
    start(){clear();running=true;startedAt=performance.now();const token=generation,from=poster.getBoundingClientRect();image.src=poster.currentSrc||poster.src;entrance.hidden=false;place();if(!reduced()){const to=entrance.getBoundingClientRect(),x=from.left+from.width/2-to.left-to.width/2,y=from.top+from.height/2-to.top-to.height/2;image.animate([{transform:`translate(${x}px,${y}px) scale(.42)`,opacity:.55},{transform:'translate(0,0) scale(1)',opacity:1}],{duration:360,easing:'cubic-bezier(.2,.7,.2,1)',fill:'none'});}requestAnimationFrame(()=>{if(token===generation&&running)place();});},
    ready(){if(!running)return;const token=generation;window.ArcadeExperience?.layout();place();requestAnimationFrame(()=>requestAnimationFrame(()=>{if(token!==generation)return;const finish=()=>{if(token!==generation)return;if(reduced()){clear();return;}const animation=entrance.animate([{opacity:1},{opacity:0}],{duration:300,easing:'ease-out',fill:'forwards'});animation.finished.then(()=>{if(token===generation)clear();}).catch(()=>{});};timer=setTimeout(finish,reduced()?0:Math.max(0,380-(performance.now()-startedAt)));}));},
    failed:clear
  };
})();
