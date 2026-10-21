/* Standard Gamepad layout: positions follow Xbox labels (Nintendo labels differ). */
(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const playing = !!$('#game');
  const lobby = !!$('#grid');
  const sheet=document.createElement('link');sheet.rel='stylesheet';sheet.href='/library/controller.css?v=gamepad1';document.head.append(sheet);
  let previous = new Set(), direction = '', repeatAt = 0, padIndex = null;
  let comboAt = 0, comboArmed = false, neutralRequired = true, returnFocus = null, menuAt=0, menuArmed=true;
  const hint = document.createElement('p');
  hint.id = 'gamepadHint';
  hint.setAttribute('role', 'status');
  (playing ? document.querySelector('header') : $('.collection') || document.body).prepend(hint);
  const defaultHint = playing ? 'A 启动 · L3 + R3 按住半秒打开游戏菜单 · Select + Start 按住 1 秒返回大厅' : lobby ?
    '方向移动 · A 确认 · B 返回 · X 搜索/预览 · Y 收藏 · LB/RB 翻页 · LT/RT 切换分区 · Start 开始 · Select 操作指南' :
    '方向选择链接 · 右摇杆 / LB、RB 滚动阅读 · A 打开 · B 返回大厅 · Select 操作指南';
  hint.textContent = defaultHint;

  function visible(n) { return n && !n.disabled && !n.hidden && n.getClientRects().length > 0; }
  function focus(n) {
    if (!visible(n)) return;
    document.querySelectorAll('.pad-focus').forEach(e => e.classList.remove('pad-focus'));
    n.classList.add('pad-focus'); n.focus({preventScroll:true});
    n.scrollIntoView({block:'nearest', inline:'nearest'});
  }
  function scope() { return $('#padGuide[open]') || $('#padKeyboard[open]') || $('#detail[open]') || document; }
  function controls() {
    return [...scope().querySelectorAll('button, a[href], input, select')].filter(visible);
  }
  function firstGame() { return $('#grid .cover') || $('#search') || document.querySelector('a[href]') || guideButton; }
  function move(dir) {
    const all = controls(), active = document.activeElement;
    if (!all.includes(active)) { focus(scope() === document ? firstGame() : all[0]); return; }
    // A native select is changed directly; synthetic key events cannot open its menu.
    if (active.tagName === 'SELECT' && (dir === 'left' || dir === 'right')) {
      const delta = dir === 'left' || dir === 'up' ? -1 : 1;
      active.selectedIndex = (active.selectedIndex + delta + active.options.length) % active.options.length;
      active.dispatchEvent(new Event('change', {bubbles:true})); return;
    }
    const r = active.getBoundingClientRect(), x = r.x + r.width/2, y = r.y + r.height/2;
    let best = null, score = Infinity;
    for (const n of all) {
      if (n === active) continue;
      if(active.matches('#grid .cover') && n.matches('#grid .fav'))continue;
      const b = n.getBoundingClientRect(), dx = b.x+b.width/2-x, dy = b.y+b.height/2-y;
      const along = dir === 'left' ? -dx : dir === 'right' ? dx : dir === 'up' ? -dy : dy;
      const across = Math.abs(dir === 'left' || dir === 'right' ? dy : dx);
      if (along <= 3) continue;
      const s = along + across*3;
      if (s < score) { score=s; best=n; }
    }
    focus(best);
    if(!best && (dir==='up'||dir==='down'))window.scrollBy(0,dir==='up'?-180:180);
  }

  const guide=document.createElement('dialog');guide.id='padGuide';
  const guideButton=document.createElement('button');guideButton.id='padGuideButton';guideButton.textContent='手柄操作指南';
  hint.after(guideButton);document.body.append(guide);
  let beforeGuide, resumeAfterGuide=false;
  const guideText='<h2>拿起手柄，开始一局</h2><p>① 连接到当前设备，按任意键并松开。<br>② 十字键或左摇杆移动高亮，A 确认，B 返回。<br>③ 选中游戏按 A 看详情，Start 直接开始。</p><dl><dt>X / Y</dt><dd>搜索或预览 / 收藏当前游戏</dd><dt>LB / RB</dt><dd>上一页 / 下一页；阅读页面时滚动</dd><dt>LT / RT</dt><dd>快速切换视图、分类、排序、游戏、分页分区</dd><dt>排序 / 模拟核心</dt><dd>左右切换选项，上下移动到其他控件</dd><dt>搜索</dt><dd>屏幕键盘输入拼音、英文或 ROM 名；B 完成并回到结果</dd><dt>右摇杆</dt><dd>滚动页面或详情文字；预览时左右快退 / 快进</dd><dt>游戏菜单</dt><dd>同时按住 L3 + R3 半秒（左右摇杆按下）：暂停、快捷存读档、重新开始、返回大厅</dd></dl><p>按键名称按 Xbox / 标准 Gamepad 位置标注，其他手柄字母可能不同。无反应时打开控制器检测；需要可信 HTTPS。游戏内动作与投币按键在模拟器中映射。</p>';
  function guideAction(label, fn) {const b=document.createElement('button');b.textContent=label;b.onclick=fn;guide.append(b);return b;}
  function openGuide() {
    if(guide.open)return;
    beforeGuide=document.activeElement;guide.innerHTML=guideText;
    const em=window.EJS_emulator;
    resumeAfterGuide=!!(playing && em?.started && !em.paused);
    if(resumeAfterGuide)em.pause();
    const close=guideAction(playing?'继续游戏（B）':'明白了（B）',()=>guide.close());
    if(playing){
      guideAction('快捷存档',async()=>{
        try{if(!em?.started)throw Error('请先启动游戏');await em.storage.states.put(em.getBaseFileName()+'.controller.state',em.gameManager.getState());guide.querySelector('h2').textContent='已保存快捷存档';}
        catch{guide.querySelector('h2').textContent='暂时无法存档，请确认游戏已启动且浏览器允许存储';}
      });
      guideAction('读取快捷存档',async()=>{
        try{if(!em?.started)throw Error();const state=await em.storage.states.get(em.getBaseFileName()+'.controller.state');if(!state){guide.querySelector('h2').textContent='还没有快捷存档，请先保存';return;}em.gameManager.loadState(state);guide.close();}
        catch{guide.querySelector('h2').textContent='读取失败，请确认游戏已启动且存档有效';}
      });
      guideAction('重新开始…',()=>{
        guide.innerHTML='<h2>重新开始当前游戏？</h2><p>当前未保存的进度会丢失。</p>';
        focus(guideAction('取消（B）',()=>guide.close()));
        guideAction('确认重新开始',()=>{if(em?.started)em.gameManager.restart();guide.close();});
      });
      guideAction('返回大厅…',()=>{
        guide.innerHTML='<h2>返回大厅？</h2><p>请先保存需要保留的游戏进度。</p>';
        focus(guideAction('继续游戏（B）',()=>guide.close()));guideAction('确认返回大厅',()=>location.assign('/library/'));
      });
    }
    guide.showModal();focus(close);
  }
  guideButton.onclick=openGuide;
  guide.addEventListener('close',()=>{if(resumeAfterGuide)window.EJS_emulator?.play();resumeAfterGuide=false;focus(beforeGuide?.isConnected?beforeGuide:firstGame());neutralRequired=true;});
  document.addEventListener('focusin',e=>{
    if(!lobby || guide.open)return;
    const n=e.target;
    hint.textContent=n.closest?.('#detail')?'详情 · A 确认 · B 返回 · X 预览 · Y 收藏 · Start 开始 · 右摇杆滚动/快进':n.closest?.('#grid')?'选游戏 · A 详情 · Start 开始 · Y 收藏 · LB/RB 翻页 · X 搜索 · Select 指南':defaultHint;
  });

  let keyboard;
  if (lobby) {
    keyboard = document.createElement('dialog'); keyboard.id='padKeyboard';
    keyboard.innerHTML='<h2>手柄搜索</h2><p>输入拼音、英文或 ROM 文件名；也可用实体键盘输入中文。</p><output id="padQuery"></output><div class="pad-keys"></div><div class="pad-key-actions"></div>';
    document.body.append(keyboard);
    for (const key of 'abcdefghijklmnopqrstuvwxyz0123456789') {
      const b=document.createElement('button'); b.textContent=key; b.onclick=()=>editQuery($('#search').value+key); $('.pad-keys').append(b);
    }
    for (const [text, action] of [['空格',()=>editQuery($('#search').value+' ')],['退格',()=>editQuery($('#search').value.slice(0,-1))],['清空',()=>editQuery('')],['完成',()=>keyboard.close()]]) {
      const b=document.createElement('button'); b.textContent=text; b.onclick=action; $('.pad-key-actions').append(b);
    }
    keyboard.addEventListener('close',()=>focus(firstGame()));
    const detail=$('#detail');
    detail.addEventListener('close',()=>focus(returnFocus?.isConnected ? returnFocus : [...document.querySelectorAll('#grid .cover')].find(n=>n.dataset.gameId===returnFocus?.dataset.gameId) || firstGame()));
    $('#grid').addEventListener('click',e=>{const c=e.target.closest('.cover');if(c)returnFocus=c;});
  }
  function editQuery(value) { $('#search').value=value; $('#padQuery').textContent=value||'（空）'; $('#search').dispatchEvent(new Event('input',{bubbles:true})); }
  function openSearch() { editQuery($('#search').value); keyboard.showModal(); focus(keyboard.querySelector('button')); }
  function section(delta) {
    const groups=[$('#views button'), $('#chips button.selected') || $('#chips button'), $('#sort'), firstGame(), $('#prev:not(:disabled)') || $('#next:not(:disabled)')];
    const active=document.activeElement;
    let i=active.closest('#views')?0:active.closest('#chips')?1:active.id==='sort'?2:active.closest('#grid')?3:active.closest('.pagination')?4:3;
    for(let n=0;n<groups.length;n++){i=(i+delta+groups.length)%groups.length;if(visible(groups[i])){focus(groups[i]);return;}}
  }
  function act(button) {
    if(guide.open){if(button===1)guide.close();else if(button===0 && guide.contains(document.activeElement))document.activeElement.click();return;}
    if(!playing && button===8){openGuide();return;}
    if(!playing && !lobby){if(button===1)location.assign('/library/');else if(button===0 && controls().includes(document.activeElement)){const n=document.activeElement;if(n.tagName==='A')location.assign(n.href);else n.click();}else if(button===4 || button===5)window.scrollBy(0,button===4?-innerHeight*.7:innerHeight*.7);return;}
    if (playing) {
      // Leave running-game input to EmulatorJS. Only activate its initial start button.
      if (button === 0) $('.ejs_start_button')?.click();
      return;
    }
    const modal=scope(), active=document.activeElement;
    if (button===1) {
      if (modal !== document) modal.close(); else focus(firstGame());
      return;
    }
    if (modal===keyboard) { if(button===0 && visible(active) && keyboard.contains(active))active.click(); return; }
    if (button===0) {
      if (active===$('#search')) {openSearch();return;}
      if (!controls().includes(active)) {focus(firstGame());return;}
      if (active.tagName==='SELECT') {move('right');return;}
      active.click();
      if ($('#detail').open) focus($('#play'));
      else if (!active.isConnected) focus(firstGame());
    } else if (button===2) {
      if ($('#detail').open) { if(visible($('#watch'))){const v=$('#preview');if(v.style.display==='block'){if(v.paused)v.play().catch(()=>{});else v.pause();}else $('#watch').click();} }
      else openSearch();
    } else if (button===3) {
      if ($('#detail').open) $('#save').click();
      else {const cards=[...document.querySelectorAll('#grid .cover')],i=cards.indexOf(active),fav=active.closest('.card')?.querySelector('.fav');if(fav){fav.click();focus(document.querySelectorAll('#grid .cover')[Math.max(0,i)] || firstGame());}}
    } else if (button===9) {
      if (!$('#detail').open && active.matches('#grid .cover')) active.click();
      if ($('#detail').open) $('#play').click();
    } else if (modal===document && (button===4 || button===5)) {
      const b=$(button===4?'#prev':'#next'); if(!b.disabled){b.click();focus(firstGame());}
    } else if (modal===document && (button===6 || button===7)) section(button===6?-1:1);
  }
  function poll(now) {
    requestAnimationFrame(poll);
    let pads;
    try { pads=Array.from(navigator.getGamepads?.() || []).filter(p=>p && p.connected); }
    catch {hint.textContent='浏览器禁止读取手柄，请通过可信 HTTPS 打开并检查权限。';return;}
    if (!pads.length) {
      if(padIndex!==null){hint.textContent='手柄已断开，请重新连接后按任意键。';padIndex=null;document.querySelectorAll('.pad-focus').forEach(n=>n.classList.remove('pad-focus'));}
      previous.clear(); direction=''; comboAt=0; comboArmed=false; neutralRequired=true; return;
    }
    // The last controller with input takes over; never combine two players' buttons.
    const hasInput=p=>p.buttons.some(b=>b.pressed || b.value>.5) || p.axes.slice(0,2).some(a=>Math.abs(a)>.55);
    const pad=pads.find(p=>p.index!==padIndex && hasInput(p)) || pads.find(p=>p.index===padIndex) || pads[0];
    if(pad.index!==padIndex){padIndex=pad.index;previous.clear();direction='';neutralRequired=true;comboArmed=false;hint.textContent='手柄已连接 · '+defaultHint;try{if(lobby && !sessionStorage.getItem('arcade-pad-intro')){sessionStorage.setItem('arcade-pad-intro','1');openGuide();}}catch{}}
    const down=new Set(pad.buttons.flatMap((b,i)=>(b.pressed || b.value>.5)?[i]:[]));
    let dir=down.has(12)?'up':down.has(13)?'down':down.has(14)?'left':down.has(15)?'right':'';
    const [x=0,y=0]=pad.axes;
    if(!dir && Math.max(Math.abs(x),Math.abs(y))>.55)dir=Math.abs(x)>Math.abs(y)?(x<0?'left':'right'):(y<0?'up':'down');
    if (document.hidden || !document.hasFocus()) {neutralRequired=true;previous=down;direction='';comboAt=0;return;}
    // A held launch button must be released on arrival/reconnect before it can act.
    if(neutralRequired){if(!down.size && !dir){neutralRequired=false;comboArmed=true;}previous=down;return;}
    if(playing && down.has(10) && down.has(11)){
      if(menuArmed){if(!menuAt)menuAt=now;if(now-menuAt>=500){menuArmed=false;openGuide();}}
    }else{menuAt=0;menuArmed=true;}
    if(playing && !guide.open){
      if(down.has(8)&&down.has(9)&&comboArmed){if(!comboAt)comboAt=now; if(now-comboAt>=1000){comboArmed=false;location.assign('/library/');}}
      else comboAt=0;
    } else if(dir && (dir!==direction || now>=repeatAt)) {move(dir);repeatAt=now+(dir===direction?140:380);}
    const [,,rx=0,ry=0]=pad.axes;
    if(Math.abs(ry)>.35){const target=$('#description');if($('#detail[open]') && target)target.scrollTop+=ry*12;else if(guide.open)guide.scrollTop+=ry*12;else window.scrollBy(0,ry*12);}
    if(lobby && $('#detail').open && Math.abs(rx)>.55 && now>=repeatAt){const v=$('#preview');if(Number.isFinite(v.duration))v.currentTime=Math.max(0,Math.min(v.duration,v.currentTime+Math.sign(rx)*5));repeatAt=now+300;}
    direction=dir;
    for(const b of down)if(!previous.has(b))act(b);
    previous=down;
  }
  document.addEventListener('pointerdown',()=>document.querySelectorAll('.pad-focus').forEach(n=>n.classList.remove('pad-focus')));
  window.addEventListener('pagehide',()=>{neutralRequired=true;});
  requestAnimationFrame(poll);
})();
