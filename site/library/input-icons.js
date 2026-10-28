/* Labels describe physical button positions; icon overrides never remap input. */
(() => {
  let pad=null,mode='keyboard',family='keyboard',lastSignature='',interactionSeen=false;
  const legend=document.createElement('div');legend.id='inputLegend';legend.setAttribute('aria-label','当前输入设备操作提示');
  (document.querySelector('.collection')||document.querySelector('header')||document.querySelector('.guide,.support')||document.body).prepend(legend);
  function identify(device){const id=device?.id||'';if(/dualsense|dualshock|playstation|sony|054c/i.test(id))return 'playstation';if(/nintendo|switch|joy-con|057e/i.test(id))return 'nintendo';if(/xbox|xinput|045e/i.test(id))return 'xbox';if(/arcade|fightstick|qanba|mayflash|hori.*stick/i.test(id))return 'arcade';return 'generic';}
  const layouts={keyboard:['Enter','Esc','/','F'],mouse:['点击','Esc','/','F'],touch:['轻触','返回','搜索','菜单'],xbox:['A','B','X','Y'],playstation:['×','○','□','△'],nintendo:['B','A','Y','X'],generic:['下','右','左','上'],arcade:['1','2','3','4']};
  const layout=(kind,device=pad)=>kind==='generic'&&device&&device.mapping!=='standard'?['1','2','3','4']:layouts[kind]||layouts.generic;
  function psGeneration(device=pad){return /dualshock|09cc|05c4/i.test(device?.id||'')?'ps4':'ps5';}
  function functionKeys(kind=family,device=pad){return kind==='playstation'?{Select:psGeneration(device)==='ps4'?'分享键':'创建键',Start:'选项键'}:kind==='nintendo'?{Select:'−',Start:'+'}:{Select:'Select',Start:'Start'};}
  function glyph(text,kind){const node=document.createElement('span');node.className='input-glyph glyph-'+kind;node.setAttribute('aria-hidden','true');
    if(kind==='playstation'&&['创建键','选项键'].includes(text)){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.classList.add('ps-function-symbol');const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',text==='创建键'?'M12 3v7M4 6l5 5M20 6l-5 5':'M5 6h14M5 12h14M5 18h14');svg.append(path);node.append(svg,document.createTextNode(text));node.classList.add('glyph-function');}else node.textContent=text;return node;}
  const hintSources=new WeakMap(),buttonSources=new WeakMap();
  function tokens(){const v=layout(family);return {A:v[0],B:v[1],X:v[2],Y:v[3],...functionKeys(),...(family==='playstation'?{LB:'L1',RB:'R1',LT:'L2',RT:'R2',Home:'PS'}:family==='nintendo'?{LB:'L',RB:'R',LT:'ZL',RT:'ZR'}:{})};}
  function decorate(){const map=tokens(),keyboard=['keyboard','mouse'].includes(family);if(keyboard){map.B='Esc';map.X='/';map.Y='Y';}if(family==='touch'){map.B='返回';map.X='搜索';map.Y='收藏';}
    for(const node of document.querySelectorAll('#gamepadHint,#launchStatus,#playerMenuHint,#padMenuHelp,#launchMenuChord,.launch-steps,.player-basics')){
      if(node.children.length)continue;const saved=hintSources.get(node),current=node.textContent;const source=saved&&current===saved.rendered?saved.source:current;
      const rendered=source.replace(/\b(A|B|X|Y|Select|Start|LB|RB|LT|RT|Home)\b/g,token=>map[token]||token);hintSources.set(node,{source,rendered});if(current!==rendered)node.textContent=rendered;
    }
    for(const node of document.querySelectorAll('[data-device-action]')){const coin=node.dataset.deviceAction==='coin',controls=window.EJS_emulator?.controls?.[0];let value;if(['keyboard','mouse'].includes(family))value=String(controls?.[coin?2:3]?.value||(coin?'V':'Enter')).toUpperCase();else if(family==='touch')value=coin?'投币':'开始';else value=coin?map.Select:map.Start;const stamp=family+':'+value;if(node.dataset.glyph!==stamp){const icon=glyph(value,family);node.replaceChildren(...icon.childNodes);node.className=icon.className;node.setAttribute('aria-label',value);node.dataset.glyph=stamp;}}
    for(const option of document.querySelectorAll('#padSetting-menu option')){const saved=hintSources.get(option),source=saved?.source||option.textContent;const rendered=source.replace(/\b(Select|Start|LB|RB|LT|RT)\b/g,t=>map[t]||t);hintSources.set(option,{source,rendered});if(option.textContent!==rendered)option.textContent=rendered;}
    for(const node of document.querySelectorAll('#padGuide button,#padSettings button,#playerLaunch button')){
      let record=buttonSources.get(node);if(!record){const match=node.textContent.match(/^(.*)（(A|B|B \/ Esc)）$/);if(!match)continue;record={label:match[1],token:match[2].startsWith('B')?'B':'A'};buttonSources.set(node,record);}
      if(node.dataset.inputIcon===family&&node.querySelector('.input-glyph'))continue;node.replaceChildren(document.createTextNode(record.label+' '),glyph(map[record.token]||record.token,family));node.setAttribute('aria-label',record.label);node.dataset.inputIcon=family;
    }
  }
  function render(){const override=window.ArcadePreferences?.get().inputStyle||'auto';family=override!=='auto'?override:mode==='pad'?identify(pad):mode;const signature=family+':'+psGeneration()+':'+(pad?.mapping||'')+':'+!!document.querySelector('#game');if(signature===lastSignature)return;lastSignature=signature;document.body.dataset.inputFamily=family;document.body.dataset.inputProfile=family==='playstation'?psGeneration():family;
    legend.replaceChildren();const caption=document.createElement('span');caption.className='input-device-name';caption.textContent={keyboard:'键盘',mouse:'键鼠',touch:'触屏',xbox:'Xbox',playstation:psGeneration()==='ps4'?'PS4 · DualShock':'PS5 · DualSense',nintendo:'任天堂',generic:'通用手柄',arcade:'街机摇杆'}[family];legend.append(caption);
    const values=layout(family);
    const entries=family==='keyboard'||family==='mouse'?[['↑↓←→','移动'],[values[0],'确认'],['Esc','返回 / 菜单'],['F','游戏全屏']]:family==='touch'?[['轻触','选择'],['菜单','设置']]:[['✥','移动'],[values[0],'确认'],[values[1],'返回'],[functionKeys().Start,'开始'],...(family==='playstation'?[[functionKeys().Select,'投币 / 指南']]:[])];
    for(const [value,meaning] of entries){const item=document.createElement('span');item.className='input-legend-item';item.append(glyph(value,family),document.createTextNode(meaning));legend.append(item);}decorate();
  }
  document.addEventListener('keydown',()=>{interactionSeen=true;mode='keyboard';render();},true);
  // Switching legends can change height on narrow screens. Do it after release,
  // so the clicked control cannot move between pointerdown and click.
  document.addEventListener('pointerdown',e=>{interactionSeen=true;mode=e.pointerType==='touch'?'touch':'mouse';},true);
  for(const event of ['pointerup','pointercancel'])document.addEventListener(event,()=>requestAnimationFrame(render),true);
  window.addEventListener('arcade-preferences-changed',()=>{lastSignature='';render();});window.addEventListener('arcade-preferences-ready',()=>{lastSignature='';render();});
  window.ArcadeInput={setDevice(device){interactionSeen=true;pad=device;mode='pad';render();},setDetected(device){if(!interactionSeen){pad=device;mode='pad';render();}},identify,getFamily:()=>family,buttonLabels(device){const override=window.ArcadePreferences?.get().inputStyle||'auto',kind=override==='auto'?identify(device):override,v=layout(kind,device),keys=functionKeys(kind,device);return {BUTTON_1:v[0],BUTTON_2:v[1],BUTTON_3:v[2],BUTTON_4:v[3],SELECT:keys.Select,START:keys.Start,LEFT_TOP_SHOULDER:kind==='playstation'?'L1':kind==='nintendo'?'L':'LB',RIGHT_TOP_SHOULDER:kind==='playstation'?'R1':kind==='nintendo'?'R':'RB',DPAD_UP:'↑',DPAD_DOWN:'↓',DPAD_LEFT:'←',DPAD_RIGHT:'→'};}};render();
  const observer=new MutationObserver(()=>decorate());observer.observe(document.body,{childList:true,subtree:true,characterData:true});
  if(!document.querySelector('#game,#grid')){
    document.body.classList.add('arcade-document');const wrapper=document.createElement('main');wrapper.className='document-shell';
    for(const n of [...document.body.childNodes])if(n.nodeType!==1||!['SCRIPT','STYLE','LINK','DIALOG'].includes(n.tagName))wrapper.append(n);
    document.body.prepend(wrapper);
  }
})();
