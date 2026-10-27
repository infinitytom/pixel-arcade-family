/* Original, synthesized UI cues. No recordings, downloads or background music. */
(() => {
  'use strict';
  if(window.ArcadeSound)return;
  let context=null,master=null,lastCue='',lastAt=-Infinity,lastMove=-Infinity,pointerAt=-Infinity;
  const voices=new Set(),timers=new Set();
  const settings=()=>window.ArcadePreferences?.get()||{uiSound:'off',uiVolume:'20'};
  function stop(){for(const timer of timers)clearTimeout(timer);timers.clear();for(const voice of voices){try{voice.stop();}catch{}}voices.clear();}
  function level(){if(master&&context)master.gain.setTargetAtTime(settings().uiSound==='on'?Number(settings().uiVolume)/400:0,context.currentTime,.012);if(settings().uiSound!=='on')stop();}
  function unlock(event){if(!event.isTrusted||document.hidden||settings().uiSound!=='on')return;try{if(context?.state==='closed'){context=null;master=null;}if(!context){const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;context=new Audio();master=context.createGain();master.gain.value=Number(settings().uiVolume)/400;master.connect(context.destination);}if(context.state==='suspended')context.resume().catch(()=>{});}catch{}}
  const cues={move:[[0,440,.035,330]],confirm:[[0,523,.055],[.065,659,.065]],back:[[0,392,.085,262]],start:[[0,523,.05],[.055,659,.05],[.11,784,.05],[.165,1047,.11]],save:[[0,659,.065],[.075,784,.065],[.15,1047,.10]],error:[[0,220,.09,185],[.12,185,.10,147]]};
  function play(name){
    const notes=cues[name],now=performance.now();if(!notes||settings().uiSound!=='on'||!context||context.state!=='running'||document.hidden||!document.hasFocus())return false;
    if(name==='move'){if(now-lastMove<110||now-lastAt<95)return false;lastMove=now;}else if(name===lastCue&&now-lastAt<160)return false;
    lastCue=name;lastAt=now;const at=context.currentTime+.004;
    try{for(const [offset,hz,duration,end=hz] of notes){const oscillator=context.createOscillator(),gain=context.createGain(),time=at+offset;oscillator.type='triangle';oscillator.frequency.setValueAtTime(hz,time);oscillator.frequency.exponentialRampToValueAtTime(end,time+duration);gain.gain.setValueAtTime(.0001,time);gain.gain.exponentialRampToValueAtTime(name==='move'?.18:.32,time+.005);gain.gain.exponentialRampToValueAtTime(.0001,time+duration);oscillator.connect(gain);gain.connect(master);voices.add(oscillator);oscillator.onended=()=>{voices.delete(oscillator);oscillator.disconnect();gain.disconnect();};oscillator.start(time);oscillator.stop(time+duration+.01);}window.dispatchEvent(new CustomEvent('arcade-ui-sound',{detail:{name}}));return true;}catch{return false;}
  }
  function preview(){if(settings().uiSound!=='on')return false;stop();['move','confirm','back','start','save','error'].forEach((name,index)=>{const timer=setTimeout(()=>{timers.delete(timer);play(name);},180+index*380);timers.add(timer);});return true;}
  function uiTarget(node){if(!(node instanceof Element)||node.closest('#game'))return false;return !window.EJS_emulator?.started||!!node.closest('#padGuide[open],#padSettings[open],#arcadeSettings[open]');}
  document.addEventListener('pointerdown',e=>{pointerAt=performance.now();unlock(e);},true);
  document.addEventListener('keydown',unlock,true);
  document.addEventListener('focusin',e=>{if(performance.now()-pointerAt>160&&uiTarget(e.target)&&e.target.matches('button,a[href],input,select'))play('move');},true);
  document.addEventListener('change',e=>{if(uiTarget(e.target)&&e.target.matches('select,input[type=range]'))play('move');});
  document.addEventListener('click',e=>{const node=e.target.closest?.('button,a[href]');if(!node||node.disabled||!uiTarget(node)||node.matches('#playerStart,#playerContinue,[data-sound=none]'))return;const label=node.getAttribute('aria-label')||node.textContent;play(/返回|关闭|取消|完成|继续游戏|明白了|^×$/.test(label)?'back':'confirm');},true);
  document.addEventListener('close',e=>{if(e.target instanceof HTMLDialogElement)play('back');},true);
  new MutationObserver(records=>{if(records.some(r=>r.target instanceof HTMLDialogElement&&r.target.open))play('confirm');}).observe(document.body,{subtree:true,attributes:true,attributeFilter:['open']});
  window.addEventListener('arcade-preferences-changed',level);window.addEventListener('blur',stop);document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});window.addEventListener('pagehide',()=>{stop();context?.close().catch(()=>{});});
  window.ArcadeSound={play,preview,stop};
})();
