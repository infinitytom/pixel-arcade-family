/* Recent manual and automatic resume points per exact game/core and account. */
(() => {
  if(!document.querySelector('#game'))return;
  const params=new URLSearchParams(location.search),identity='resume:'+params.get('core')+':'+params.get('src');
  let snapshot=null,pending=false,restored=false,saving=false,lastSave=0,startedAt=0,warned=false,saveQueue=Promise.resolve();
  const autoSaveInterval=3*60*1000;
  const continueButton=document.createElement('button');continueButton.id='playerContinue';continueButton.hidden=true;continueButton.disabled=true;continueButton.textContent='继续上次游玩';document.querySelector('#playerStart').before(continueButton);
  const choiceLabel=document.createElement('label');choiceLabel.className='resume-choice';choiceLabel.hidden=true;choiceLabel.textContent='恢复到哪一个进度 ';const choice=document.createElement('select');choice.id='playerResumeChoice';choice.setAttribute('aria-label','选择恢复进度');choiceLabel.append(choice);continueButton.before(choiceLabel);let points=[],restorePoint=null;
  const note=document.createElement('p');note.id='resumeStatus';note.setAttribute('role','status');document.querySelector('#playerStart').after(note);
  const toast=document.createElement('p');toast.id='playerToast';toast.hidden=true;toast.setAttribute('role','status');document.querySelector('#playerStage').append(toast);let toastTimer;
  function message(text){toast.textContent=text;toast.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{toast.hidden=true;},5000);}
  window.addEventListener('arcade-resume-restored',()=>message('已继续上次游玩'));window.addEventListener('arcade-resume-failed',()=>message('所选进度未能载入，请尝试其他存档'));
  let resumeRequest=0;
  async function refreshResume(){const request=++resumeRequest;try{await window.ArcadePreferences?.ready;const saved=await window.ArcadePreferences.progress('get',identity);if(request!==resumeRequest)return;snapshot=saved;points=window.ArcadePreferences.resumePoints(saved);choice.replaceChildren(...points.map(p=>new Option(window.ArcadePreferences.resumeLabel(p),String(p.updatedAt))));if(points.some(p=>String(p.updatedAt)===params.get('point')))choice.value=params.get('point');const enabled=window.ArcadePreferences.get().resume!=='off';continueButton.hidden=choiceLabel.hidden=!enabled||!points.length;note.textContent=!enabled?'继续选项已在游戏厅设置中关闭。':points.length?'选择一份进度，再点击「继续上次游玩」。手动、自动存档各保留最近 3 份。':'此游戏与核心还没有继续点。手动快捷存档会建立继续点，自动存档每 3 分钟更新。';if(!continueButton.hidden&&!document.querySelector('#playerLaunch')?.hidden){continueButton.disabled=!document.querySelector('.ejs_start_button');if(params.get('resume')!=='new')continueButton.focus();}}catch{note.textContent='继续点暂不可用，仍可开始新游戏。';}}
  const ready=refreshResume();window.addEventListener('arcade-preferences-changed',()=>{if(!window.EJS_emulator?.started)refreshResume();});
  function save(options={}){const em=window.EJS_emulator;if(!em?.started||em.failedToStart||(!options.manual&&(saving||window.ArcadePreferences?.get().autoSave!=='on')))return Promise.resolve(false);
    let bytes;try{if(em.gameManager.supportsStates && !em.gameManager.supportsStates())return Promise.resolve(false);const state=options.state??em.gameManager.getState();bytes=new Uint8Array(state).slice();if(!bytes.byteLength)return Promise.resolve(false);}catch{return Promise.resolve(false);}
    saving=true;
    const write=async()=>{try{await ready;const saved={state:bytes,updatedAt:Math.max(Date.now(),(snapshot?.updatedAt||0)+1),core:params.get('core'),src:params.get('src'),source:options.manual?'manual':'auto'},counts={manual:0,auto:0};const kept=window.ArcadePreferences.resumePoints(saved).concat(window.ArcadePreferences.resumePoints(snapshot)).filter(p=>++counts[p.source==='manual'?'manual':'auto']<=3);saved.history=kept.slice(1);await window.ArcadePreferences.progress('put',identity,saved);snapshot=saved;lastSave=Date.now();warned=false;return true;}catch{if(!warned){message('继续点保存失败，请使用手动存档，或回大厅清理下载缓存后重试。');warned=true;}return false;}};
    const task=saveQueue.then(write,write);saveQueue=task;task.finally(()=>{if(saveQueue===task)saving=false;});return task;
  }
  async function restore(){if(!pending||restored)return false;restored=true;const em=window.EJS_emulator;try{if(!restorePoint?.state?.byteLength)throw Error();em.gameManager.loadState(new Uint8Array(restorePoint.state));note.textContent='已恢复：'+window.ArcadePreferences.resumeLabel(restorePoint);window.dispatchEvent(new CustomEvent('arcade-resume-restored',{detail:{updatedAt:restorePoint.updatedAt,source:restorePoint.source}}));return true;}catch{note.textContent='所选进度载入失败，请尝试其他存档。';window.dispatchEvent(new CustomEvent('arcade-resume-failed'));return false;}}
  async function openHistory(dialog,back){
    dialog.replaceChildren();const h=document.createElement('h2');h.textContent='选择存档进度';const description=document.createElement('p');description.textContent='左右切换进度，再选择恢复。手动、自动存档各保留最近 3 份。';dialog.append(h,description);
    const label=document.createElement('label');label.className='resume-choice';label.textContent='恢复到哪一个进度 ';const select=document.createElement('select');select.id='resumeHistoryChoice';select.setAttribute('aria-label','选择恢复进度');label.append(select);dialog.append(label);
    const load=document.createElement('button');load.textContent='恢复所选进度';load.disabled=true;const cancel=document.createElement('button');cancel.textContent='返回游戏菜单';cancel.onclick=back;dialog.append(load,cancel);
    try{await saveQueue;const saved=await window.ArcadePreferences.progress('get',identity),list=window.ArcadePreferences.resumePoints(saved);if(!dialog.open||!select.isConnected)return;select.replaceChildren(...list.map(p=>new Option(window.ArcadePreferences.resumeLabel(p),String(p.updatedAt))));load.disabled=!list.length;if(!list.length)description.textContent='还没有可恢复的进度。可返回菜单执行「快捷存档」。';
      load.onclick=async()=>{restorePoint=list.find(p=>String(p.updatedAt)===select.value);pending=true;restored=false;if(await restore())dialog.close();else description.textContent='这份进度载入失败，请选择其他存档。';};(list.length?select:cancel).focus();
    }catch{description.textContent='暂时无法读取存档列表，请稍后重试。';cancel.focus();}
  }
  window.ArcadeSession={ready,hasResume:()=>!!snapshot?.state?.byteLength,select(mode){pending=mode==='continue';restorePoint=points.find(p=>String(p.updatedAt)===choice.value)||points[0];restored=false;},save,restore,openHistory};
  setInterval(()=>{const em=window.EJS_emulator;if(!em?.started)return;if(!startedAt)startedAt=Date.now();if(pending&&!restored)restore();if(Date.now()-startedAt>3000&&(!lastSave||Date.now()-lastSave>autoSaveInterval))save();},1000);
  // Menus are a dependable save opportunity, including brief sessions and users
  // who leave while the game is paused. Page-close events alone cannot await IDB.
  const menuObserver=new MutationObserver(records=>{if(records.some(r=>r.target.open&&r.target.matches('#padGuide,#padSettings,#arcadeSettings')))save();});
  menuObserver.observe(document.body,{subtree:true,attributes:true,attributeFilter:['open']});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)save();});window.addEventListener('pagehide',()=>save());
  window.addEventListener('arcade-save-resume',()=>save());
})();
