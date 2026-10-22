/* Standard Gamepad layout: positions follow Xbox labels (Nintendo labels differ). */
(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const playing = !!$('#game');
  const lobby = !!$('#grid');
  const sheet=document.createElement('link');sheet.rel='stylesheet';sheet.href='/library/controller.css?v=gamepad113b';document.head.append(sheet);
  let previous = new Set(), direction = '', repeatAt = 0, padIndex = null;
  let comboAt = 0, comboArmed = false, neutralRequired = true, returnFocus = null;
  let inputSeen=false, focusSuspended=false, lastDeviceName='';
  const samples=new Map();
  let chosenDevice='', deviceListKey='';
  const defaults={menu:'8,9',hold:1000,deadzone:.55,repeat:140,device:''};
  let settings={...defaults};
  try{const s=JSON.parse(localStorage.getItem('arcade-controller-settings')||'null');if(s){
    if(['8,9','10,11','4,5','6,7'].includes(s.menu))settings.menu=s.menu;
    if([500,1000,1500].includes(s.hold))settings.hold=s.hold;
    if([.35,.55,.75].includes(s.deadzone))settings.deadzone=s.deadzone;
    if([100,140,220].includes(s.repeat))settings.repeat=s.repeat;
    if(typeof s.device==='string')settings.device=s.device;
  }}catch{}
  chosenDevice=settings.device;
  function saveSettings(){try{localStorage.setItem('arcade-controller-settings',JSON.stringify(settings));settingsNote.textContent='已保存在当前浏览器。';}catch{settingsNote.textContent='浏览器不允许保存，设置仅本次页面有效。';}}
  const menuNames={'8,9':'Select + Start','10,11':'L3 + R3','4,5':'LB + RB','6,7':'LT + RT'};
  function menuHelp(){return `${menuNames[settings.menu]} 按住 ${settings.hold/1000} 秒打开游戏菜单`;}
  function refreshMenuHints(){if(playing){defaultHint='A 启动 · '+menuHelp();hint.textContent=defaultHint;$('#playerMenuHint').textContent=menuHelp()+' · Esc 菜单';}const line=$('#padMenuHelp');if(line)line.textContent=menuHelp();}
  const hint = document.createElement('p');
  hint.id = 'gamepadHint';
  hint.setAttribute('role', 'status');
  (playing ? document.querySelector('header') : $('.collection') || document.body).prepend(hint);
  let defaultHint = playing ? 'A 启动 · '+menuHelp()+' · 可在手柄设置中更改' : lobby ?
    '方向移动 · A 确认 · B 返回 · X 搜索/预览 · Y 收藏 · LB/RB 翻页 · LT/RT 切换分区 · Start 开始 · Select 操作指南' :
    '方向选择链接 · 右摇杆 / LB、RB 滚动阅读 · A 打开 · B 返回大厅 · Select 操作指南';
  hint.textContent = defaultHint;
  const deviceBar=document.createElement('div');deviceBar.className='pad-device-bar';
  const deviceLabel=document.createElement('label');deviceLabel.textContent=playing?'菜单控制器 ':'大厅控制器 ';
  const deviceSelect=document.createElement('select');deviceSelect.id='padDevice';deviceSelect.setAttribute('aria-label',playing?'菜单控制器':'大厅控制器');
  const deviceStatus=document.createElement('span');deviceStatus.id='padDeviceStatus';deviceStatus.setAttribute('role','status');
  deviceLabel.append(deviceSelect);deviceBar.append(deviceLabel,deviceStatus);hint.after(deviceBar);
  function status(text){if(deviceStatus.textContent!==text)deviceStatus.textContent=text;}
  function suspendInput(){
    if(playing)releaseGameInput();
    focusSuspended=true;inputSeen=false;neutralRequired=true;previous.clear();direction='';comboAt=0;comboArmed=false;
    status((lastDeviceName?lastDeviceName+' · ':'')+'已暂停接收：切回此窗口并点击网页，再操作手柄。');
  }
  function resumeInput(){
    focusSuspended=false;inputSeen=false;neutralRequired=true;previous.clear();samples.clear();direction='';comboAt=0;
    status((lastDeviceName?lastDeviceName+' · ':'')+'窗口已激活：请松开按键，再按方向或 A 确认输入。');
  }
  const activateButton=document.createElement('button');activateButton.id='padActivate';activateButton.textContent='点击这里后使用手柄';
  activateButton.onclick=()=>{resumeInput();const target=scope()===document?firstGame():controls()[0];focus(target);};deviceBar.append(activateButton);
  const deviceKey=p=>JSON.stringify([p.id,p.index]);
  deviceSelect.addEventListener('change',()=>{chosenDevice=deviceSelect.value;settings.device=chosenDevice;saveSettings();padIndex=null;neutralRequired=true;previous.clear();direction='';});

  function visible(n) { return n && !n.disabled && !n.hidden && n.getClientRects().length > 0; }
  function focus(n) {
    if (!visible(n)) return;
    document.querySelectorAll('.pad-focus').forEach(e => e.classList.remove('pad-focus'));
    n.classList.add('pad-focus'); n.focus({preventScroll:true});
    n.scrollIntoView({block:'nearest', inline:'nearest'});
  }
  function scope() { return $('#padSettings[open]') || $('#padGuide[open]') || $('#padKeyboard[open]') || $('#detail[open]') || (playing&&!$('#playerLaunch')?.hidden?$('#playerLaunch'):null) || document; }
  function controls() {
    return [...scope().querySelectorAll('button, a[href], input, select')].filter(visible);
  }
  function firstGame() { return playing ? $('#game canvas') || $('#game') : $('#grid .cover') || $('#search') || document.querySelector('a[href]') || guideButton; }
  function focusGame(){if(!playing)return;if(!$('#playerLaunch').hidden){focus(!$('#playerStart').disabled?$('#playerStart'):$('#playerLaunchBack'));return;}document.querySelectorAll('.pad-focus').forEach(n=>n.classList.remove('pad-focus'));const target=firstGame();target.tabIndex=-1;target.focus({preventScroll:true});}
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
  const settingsDialog=document.createElement('dialog');settingsDialog.id='padSettings';
  settingsDialog.innerHTML='<h2>手柄设置</h2><p>方向键移动；选中选项后左右切换，上下离开。设置自动保存到当前浏览器。</p><div id="padSettingsFields"></div><p id="padSettingsNote" role="status"></p><p>这些设置控制大厅与自定义游戏菜单。游戏内玩家分配及动作按键仍在模拟器控制设置中配置；系统文件选择窗口需要系统输入。</p>';
  document.body.append(settingsDialog);
  const settingsNote=$('#padSettingsNote'),settingsFields=$('#padSettingsFields');
  const settingControls=new Map();
  for(const [key,label,options] of [
    ['menu','游戏菜单组合键',[['8,9','Select + Start'],['10,11','L3 + R3（摇杆按下）'],['4,5','LB + RB'],['6,7','LT + RT']]],
    ['hold','菜单长按时间',[[500,'0.5 秒'],[1000,'1 秒'],[1500,'1.5 秒']]],
    ['deadzone','左摇杆死区',[[.35,'小（更灵敏）'],[.55,'中（默认）'],[.75,'大（忽略更多漂移）']]],
    ['repeat','方向长按速度',[[220,'慢'],[140,'中（默认）'],[100,'快']]]
  ]){
    const labelNode=document.createElement('label');labelNode.textContent=label;
    const select=document.createElement('select');select.id='padSetting-'+key;select.setAttribute('aria-label',label);
    for(const [value,name] of options)select.add(new Option(name,String(value)));
    select.value=String(settings[key]);select.onchange=()=>{settings[key]=key==='menu'?select.value:Number(select.value);saveSettings();refreshMenuHints();};
    labelNode.append(select);settingsFields.append(labelNode);settingControls.set(key,select);
  }
  let beforeSettings,resumeAfterSettings=false;
  const settingsButton=document.createElement('button');settingsButton.id='padSettingsButton';settingsButton.textContent='手柄设置';deviceBar.append(settingsButton);
  function openSettings(){
    if(settingsDialog.open)return;beforeSettings=document.activeElement;
    const em=window.EJS_emulator;resumeAfterSettings=!!(playing && em?.started && !em.paused);if(resumeAfterSettings)em.pause();if(playing)releaseGameInput();
    settingsFields.prepend(deviceLabel);settingsDialog.showModal();focus(settingControls.get('menu'));
  }
  settingsButton.onclick=openSettings;
  const resetButton=document.createElement('button');resetButton.textContent='恢复默认设置';resetButton.onclick=()=>{
    settings={...defaults};chosenDevice='';deviceSelect.value='';
    for(const [key,select] of settingControls)select.value=String(settings[key]);
    refreshMenuHints();saveSettings();
  };
  const doneButton=document.createElement('button');doneButton.textContent='完成（B）';doneButton.onclick=()=>settingsDialog.close();settingsDialog.append(resetButton,doneButton);
  settingsDialog.addEventListener('close',()=>{deviceBar.prepend(deviceLabel);if(playing)releaseGameInput();if(resumeAfterSettings)window.EJS_emulator?.play();resumeAfterSettings=false;focus(beforeSettings?.isConnected?beforeSettings:firstGame());neutralRequired=true;});
  let beforeGuide, resumeAfterGuide=false;
  const guideText='<h2>拿起手柄，开始一局</h2><p>① 连接到当前设备，先点击此网页，再按任意键并松开。<br>② 保持此窗口在前台；十字键或左摇杆移动高亮，A 确认，B 返回。<br>③ 选中游戏按 A 看详情，Start 直接开始。</p><dl><dt>X / Y</dt><dd>搜索或预览 / 收藏当前游戏</dd><dt>LB / RB</dt><dd>上一页 / 下一页；阅读页面时滚动</dd><dt>LT / RT</dt><dd>快速切换视图、分类、排序、游戏、分页分区</dd><dt>排序 / 模拟核心</dt><dd>左右切换选项，上下移动到其他控件</dd><dt>搜索</dt><dd>屏幕键盘输入拼音、英文或 ROM 名；B 完成并回到结果</dd><dt>右摇杆</dt><dd>滚动页面或详情文字；预览时左右快退 / 快进</dd><dt>游戏菜单</dt><dd>在「手柄设置」中查看或更改菜单组合键：暂停、快捷存读档、重新开始、返回大厅</dd></dl><p>按键名称按 Xbox / 标准 Gamepad 位置标注，其他手柄字母可能不同。无反应时打开控制器检测；需要可信 HTTPS。游戏内动作与投币按键在模拟器中映射。</p>';
  function guideAction(label, fn) {const b=document.createElement('button');b.textContent=label;b.onclick=fn;guide.append(b);return b;}
  function openGuide() {
    if(guide.open)return;
    beforeGuide=document.activeElement;guide.innerHTML=guideText;
    const em=window.EJS_emulator;
    resumeAfterGuide=!!(playing && em?.started && !em.paused);
    if(resumeAfterGuide)em.pause();
    if(playing){releaseGameInput();guide.innerHTML='<h2>游戏菜单</h2><p id="padMenuHelp"></p><p>方向选择 · A 确认 · B 继续游戏</p><p class="player-basics">Select 投币 · Start 开始 · 十字键 / 左摇杆移动<br>动作键随游戏而异，可在下方查看按键。</p>';$('#padMenuHelp').textContent=menuHelp()+'；也可按手柄 Home 键或键盘 Esc。';}
    const close=guideAction(playing?(em?.started?'继续游戏（B）':'开始游戏（A）'):'明白了（B）',()=>{guide.close();if(playing&&!em?.started)startPlayerGame();});
    if(!playing)guide.querySelector('dl').append(Object.assign(document.createElement('dt'),{textContent:'当前菜单快捷键'}),Object.assign(document.createElement('dd'),{id:'padMenuHelp',textContent:menuHelp()}));
    if(playing)guideAction('全屏 / 退出全屏（F）',togglePlayerFullscreen);
    guideAction('手柄设置',openSettings);
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
  guide.addEventListener('close',()=>{if(playing)releaseGameInput();if(resumeAfterGuide)window.EJS_emulator?.play();resumeAfterGuide=false;if(playing)focusGame();else focus(beforeGuide?.isConnected?beforeGuide:firstGame());neutralRequired=true;});
  // Game diagnostics live in settings, never above or over the running canvas.
  if(playing){
    $('#playerStart').onclick=startPlayerGame;$('#playerLaunchBack').onclick=()=>location.assign('/library/');
    settingsDialog.insertBefore(hint,settingsFields);settingsDialog.insertBefore(deviceBar,settingsFields);
    deviceBar.append(deviceLabel,deviceStatus,activateButton);settingsButton.remove();
    document.querySelector('header').append(guideButton);guideButton.textContent='游戏菜单';refreshMenuHints();
    settingsDialog.querySelector('p:last-of-type').textContent='玩家按顺序分配给标准手柄，可在这里更改。每个控制器只能分配给一位玩家。';
    const players=document.createElement('section');players.id='playerAssignments';players.innerHTML='<h3>游戏玩家与按键</h3><p>正在等待模拟器就绪…</p>';settingsFields.prepend(players);
    document.addEventListener('keydown',e=>{if(e.repeat||/INPUT|SELECT|TEXTAREA/.test(e.target.tagName))return;if(e.key==='Escape'){e.preventDefault();if(settingsDialog.open)settingsDialog.close();else if(guide.open)guide.close();else openGuide();}else if(e.key.toLowerCase()==='f'&&!settingsDialog.open){e.preventDefault();togglePlayerFullscreen();}},true);
  }
  function startPlayerGame(){if(window.EJS_emulator?.started)return;const start=$('.ejs_start_button');if(!start)return;$('#playerLaunch').hidden=true;$('#playerMenuHint').textContent='正在加载游戏… · Esc 打开菜单';start.click();focusGame();}
  function updatePlayerLaunch(){
    if(!playing)return;const launch=$('#playerLaunch'),button=$('#playerStart'),em=window.EJS_emulator;
    if(em?.started){if(!launch.hidden)launch.hidden=true;if(!launch.dataset.started){launch.dataset.started='1';refreshMenuHints();}return;}
    if(!launch.hidden&&button.disabled&&$('.ejs_start_button')){button.disabled=false;button.textContent='Ⓐ 开始游戏';$('#launchStatus').textContent='准备好了，按手柄 A 或点击下方按钮。';if(!guide.open&&!settingsDialog.open)focus(button);}
  }
  async function togglePlayerFullscreen(){
    const exiting=document.body.classList.contains('player-immersive')||document.fullscreenElement;
    if(exiting){document.body.classList.remove('player-immersive');if(document.fullscreenElement)await document.exitFullscreen().catch(()=>{});}
    else{document.body.classList.add('player-immersive');if(navigator.userActivation?.isActive)await document.documentElement.requestFullscreen?.().catch(()=>{});}
    guide.close();focusGame();window.dispatchEvent(new Event('resize'));
  }
  if(playing)document.addEventListener('fullscreenchange',()=>{if(!document.fullscreenElement)document.body.classList.remove('player-immersive');});
  const gameBlockedPads=new Set();
  function releaseGameInput(){const em=window.EJS_emulator;for(const p of em?.gamepad?.gamepads||[])if(p)gameBlockedPads.add(p.index);if(!em?.started||!em.gameManager?.simulateInput)return;for(let p=0;p<4;p++)for(let b=0;b<30;b++)em.gameManager.simulateInput(p,b,0);}
  let boundEmulator=null,assignmentKey='',manualPlayers=false;
  function syncGameControllers(pads){
    if(!playing)return;const em=window.EJS_emulator;
    if(!em?.gamepad?.listeners||!em.gamepadSelection)return;
    for(const p of pads)if(!p.buttons.some(b=>b.pressed||b.value>.5)&&p.axes.slice(0,2).every(a=>Math.abs(a)<=settings.deadzone))gameBlockedPads.delete(p.index);
    if(boundEmulator!==em){
      boundEmulator=em;assignmentKey='';
      // EmulatorJS ships player 2–4 with empty mappings. Give new players the
      // standard action layout without copying player 1's keyboard bindings.
      if(em.controls)for(let p=1;p<4;p++)if(!Object.keys(em.controls[p]||{}).length){em.controls[p]={};for(const [b,c]of Object.entries(em.defaultControllers?.[0]||em.controls[0]||{}))if(c.value2!==undefined)em.controls[p][b]={value2:c.value2};}
      // EmulatorJS events use physical indices, while its device array is dense.
      // Resolve gaps after unplug/reconnect before handing events to the emulator.
      const dispatch=em.gamepad.dispatchEvent;
      em.gamepad.dispatchEvent=function(name,event){
        const index=this.gamepads.findIndex(p=>p?.index===event?.gamepadIndex);
        if(index<0)return;
        if(['buttondown','buttonup','axischanged'].includes(name)&&(guide.open||settingsDialog.open||gameBlockedPads.has(event.gamepadIndex)||focusSuspended))return;
        if(name==='axischanged'&&['LEFT_STICK_X','LEFT_STICK_Y'].includes(event.axis)&&['arcade','mame'].includes(em.getControlScheme?.())&&em.started){
          const p=em.gamepadSelection.indexOf(this.gamepads[index].id+'_'+this.gamepads[index].index);
          if(p>=0){const [negative,positive]=event.axis==='LEFT_STICK_X'?[6,7]:[4,5];em.gameManager.simulateInput(p,negative,event.value < -settings.deadzone?1:0);em.gameManager.simulateInput(p,positive,event.value > settings.deadzone?1:0);}return;
        }
        return dispatch.call(this,name,{...event,gamepadIndex:index});
      };
    }
    const key=JSON.stringify(pads.map(p=>[p.id,p.index,p.mapping]));
    const standard=pads.filter(p=>p.mapping==='standard'),available=standard.length?standard:pads;
    const id=p=>p.id+'_'+p.index;
    if(key!==assignmentKey){
      releaseGameInput();assignmentKey=key;
      if(!manualPlayers)em.gamepadSelection.splice(0,4,...Array.from({length:4},(_,i)=>available[i]?id(available[i]):''));
      else for(let i=0;i<4;i++)if(!pads.some(p=>id(p)===em.gamepadSelection[i]))em.gamepadSelection[i]='';
      em.updateGamepadLabels?.();
      const fields=$('#playerAssignments');fields.replaceChildren(Object.assign(document.createElement('h3'),{textContent:'游戏玩家与按键'}));
      for(let i=0;i<4;i++){
        const label=document.createElement('label');label.textContent='玩家 '+(i+1);const select=document.createElement('select');select.setAttribute('aria-label','玩家 '+(i+1));select.add(new Option('未分配',''));
        for(const p of pads)select.add(new Option(`${p.index+1} · ${p.id}`,id(p)));select.value=em.gamepadSelection[i]||'';
        select.onchange=()=>{releaseGameInput();manualPlayers=true;for(let j=0;j<4;j++)if(j!==i&&select.value&&em.gamepadSelection[j]===select.value)em.gamepadSelection[j]='';em.gamepadSelection[i]=select.value;em.updateGamepadLabels?.();fields.querySelectorAll('select').forEach((n,j)=>n.value=em.gamepadSelection[j]||'');};label.append(select);fields.append(label);
      }
      const names={BUTTON_1:'A',BUTTON_2:'B',BUTTON_3:'X',BUTTON_4:'Y',SELECT:'Select',START:'Start',LEFT_TOP_SHOULDER:'LB',RIGHT_TOP_SHOULDER:'RB',DPAD_UP:'↑',DPAD_DOWN:'↓',DPAD_LEFT:'←',DPAD_RIGHT:'→'};
      const editor=document.createElement('section');fields.append(editor);
      const playerLabel=document.createElement('label');playerLabel.textContent='按键设置';const playerSelect=document.createElement('select');playerSelect.setAttribute('aria-label','按键设置玩家');for(let i=0;i<4;i++)playerSelect.add(new Option('玩家 '+(i+1),String(i)));playerLabel.append(playerSelect);editor.append(playerLabel);
      const mappings=document.createElement('div');editor.append(mappings);
      function renderMappings(){
        mappings.replaceChildren();const player=Number(playerSelect.value);
        for(const [button,title] of [[2,'投币'],[3,'开始'],[0,'动作 B'],[1,'动作 Y'],[8,'动作 A'],[9,'动作 X'],[10,'动作 L'],[11,'动作 R']]){
          if(!em.controls?.[player]?.[button])continue;
          const label=document.createElement('label');label.textContent=title;const select=document.createElement('select');select.setAttribute('aria-label',title+'手柄按键');
          select.add(new Option('未绑定',''));for(const [value,name]of Object.entries(names))select.add(new Option(name,value));
          const current=em.controls[player][button].value2||'';if(current&&!Object.hasOwn(names,current))select.add(new Option(current,current));select.value=current;
          select.onchange=()=>{releaseGameInput();em.controls[player][button].value2=select.value;em.checkGamepadInputs?.();em.saveSettings?.();};label.append(select);mappings.append(label);
        }
      }
      playerSelect.onchange=renderMappings;renderMappings();
      const help=document.createElement('p');help.className='player-mapping';help.textContent='方向：十字键 / 左摇杆。动作名称按模拟器布局显示，实际招式由游戏决定。左右切换按键，上下选择下一项。';fields.append(help);
    }
  }
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
    if(settingsDialog.open){if(button===1)settingsDialog.close();else if(button===0 && settingsDialog.contains(document.activeElement)){if(document.activeElement.tagName==='SELECT')move('right');else document.activeElement.click();}return;}
    if(guide.open){if(button===1)guide.close();else if(button===0 && guide.contains(document.activeElement))document.activeElement.click();return;}
    if(!playing && button===8){openGuide();return;}
    if(!playing && !lobby){if(button===1)location.assign('/library/');else if(button===0 && controls().includes(document.activeElement)){const n=document.activeElement;if(n.tagName==='A')location.assign(n.href);else n.click();}else if(button===4 || button===5)window.scrollBy(0,button===4?-innerHeight*.7:innerHeight*.7);return;}
    if (playing) {
      // Leave running-game input to EmulatorJS. Only activate its initial start button.
      if (button === 0){if(!$('#playerLaunch').hidden&&document.activeElement===$('#playerLaunchBack'))$('#playerLaunchBack').click();else startPlayerGame();}
      if (button === 1 && !$('#playerLaunch').hidden)$('#playerLaunchBack').click();
      if (button === 16) openGuide();
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
    updatePlayerLaunch();
    let pads;
    try { pads=Array.from(navigator.getGamepads?.() || []).filter(p=>p && p.connected); }
    catch {hint.textContent='浏览器禁止读取手柄，请通过可信 HTTPS 打开并检查权限。';return;}
    syncGameControllers(pads);
    const listKey=JSON.stringify(pads.map(p=>[p.id,p.index,p.mapping]));
    if(listKey!==deviceListKey){
      deviceListKey=listKey;deviceSelect.replaceChildren(new Option('自动（优先标准手柄）',''));
      for(const p of pads)deviceSelect.add(new Option(`${p.index+1} · ${p.id}`,deviceKey(p)));
      chosenDevice=pads.some(p=>deviceKey(p)===settings.device)?settings.device:'';
      deviceSelect.value=chosenDevice;
    }
    if (!pads.length) {
      status('等待连接：先点击此网页，再按手柄任意键并松开。');samples.clear();inputSeen=false;lastDeviceName='';
      if(padIndex!==null){hint.textContent='手柄已断开，请重新连接后按任意键。';padIndex=null;document.querySelectorAll('.pad-focus').forEach(n=>n.classList.remove('pad-focus'));}
      previous.clear(); direction=''; comboAt=0; comboArmed=false; neutralRequired=true; return;
    }
    // A dial or custom HID may report permanently deflected axes. Prefer standard
    // controllers and switch on NEW input, never on a device's steady axis value.
    const states=new Map(pads.map(p=>[p.index,{
      buttons:p.buttons.map(b=>b.pressed || b.value>.5),
      axes:p.axes.slice(0,2).map(a=>Math.abs(a)>settings.deadzone?Math.sign(a):0),
      rawAxes:p.axes.slice(0,4)
    }]));
    const fresh=p=>{const old=samples.get(deviceKey(p)),s=states.get(p.index);return !!old && (s.buttons.some((v,i)=>v&&!old.buttons[i]) || s.axes.some((v,i)=>v && v!==old.axes[i]));};
    const standard=pads.filter(p=>p.mapping==='standard');
    const candidates=chosenDevice?pads.filter(p=>deviceKey(p)===chosenDevice):standard.length?standard:pads;
    const pad=candidates.find(p=>p.index!==padIndex && fresh(p)) || candidates.find(p=>p.index===padIndex) || candidates[0];
    const oldState=samples.get(deviceKey(pad)),state=states.get(pad.index);
    const changed=!!oldState && (state.buttons.some((v,i)=>v!==oldState.buttons[i]) || state.rawAxes.some((v,i)=>Math.abs(v-oldState.rawAxes[i])>.05));
    samples.clear();for(const p of pads)samples.set(deviceKey(p),states.get(p.index));
    if(pad.index!==padIndex){const inGame=playing&&padIndex!==null&&!guide.open&&!settingsDialog.open;padIndex=pad.index;inputSeen=false;previous.clear();direction='';if(!inGame){neutralRequired=true;comboArmed=false;}hint.textContent='手柄已连接 · '+defaultHint;try{if(lobby && !sessionStorage.getItem('arcade-pad-intro')){sessionStorage.setItem('arcade-pad-intro','1');openGuide();}}catch{}}
    const down=new Set(pad.buttons.flatMap((b,i)=>(b.pressed || b.value>.5)?[i]:[]));
    let dir=down.has(12)?'up':down.has(13)?'down':down.has(14)?'left':down.has(15)?'right':'';
    const [x=0,y=0]=pad.axes;
    if(!dir && Math.max(Math.abs(x),Math.abs(y))>settings.deadzone)dir=Math.abs(x)>Math.abs(y)?(x<0?'left':'right'):(y<0?'up':'down');
    const deviceName=`${pad.index+1} · ${pad.id}`;
    lastDeviceName=deviceName;
    if (document.hidden || !document.hasFocus() || focusSuspended) {suspendInput();return;}
    if(changed)inputSeen=true;
    const reception=inputSeen?(down.size||dir?'正在接收输入':'已收到输入 · 请保持此窗口在前台'):'已识别设备 · 请点击网页后按方向或 A 确认输入';
    // A held launch button must be released on arrival/reconnect before it can act.
    if(neutralRequired){if(!down.size && !dir){neutralRequired=false;comboArmed=true;}status(deviceName+' · '+(neutralRequired?'已识别设备 · 请松开按键和左摇杆。':reception));previous=down;return;}
    status(deviceName+' · '+reception+(!chosenDevice && standard.length && pads.length>standard.length?'（自动忽略非标准设备的轴输入）':''));
    if(playing && !guide.open && !settingsDialog.open){
      if(!$('#playerLaunch').hidden&&dir&&(dir!==direction||now>=repeatAt)){move(dir);repeatAt=now+(dir===direction?settings.repeat:380);}
      if(settings.menu.split(',').every(i=>down.has(Number(i))) && comboArmed){if(!comboAt)comboAt=now;if(now-comboAt>=settings.hold){comboArmed=false;openGuide();}}
      else comboAt=0;
    } else if(dir && (dir!==direction || now>=repeatAt)) {move(dir);repeatAt=now+(dir===direction?settings.repeat:380);}
    const [,,rx=0,ry=0]=pad.axes;
    if(Math.abs(ry)>.35){const target=$('#description');if(settingsDialog.open)settingsDialog.scrollTop+=ry*12;else if($('#detail[open]') && target)target.scrollTop+=ry*12;else if(guide.open)guide.scrollTop+=ry*12;else if(!playing)window.scrollBy(0,ry*12);}
    if(lobby && $('#detail').open && Math.abs(rx)>.55 && now>=repeatAt){const v=$('#preview');if(Number.isFinite(v.duration))v.currentTime=Math.max(0,Math.min(v.duration,v.currentTime+Math.sign(rx)*5));repeatAt=now+300;}
    direction=dir;
    for(const b of down)if(!previous.has(b))act(b);
    previous=down;
  }
  document.addEventListener('pointerdown',()=>{if(focusSuspended && !document.hidden && document.hasFocus())resumeInput();document.querySelectorAll('.pad-focus').forEach(n=>n.classList.remove('pad-focus'));});
  // Update synchronously: animation frames may stop as soon as a tab loses focus.
  window.addEventListener('blur',suspendInput);
  window.addEventListener('focus',resumeInput);
  document.addEventListener('visibilitychange',()=>{if(document.hidden || !document.hasFocus())suspendInput();else resumeInput();});
  window.addEventListener('pagehide',suspendInput);
  requestAnimationFrame(poll);
})();
