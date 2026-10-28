/* Native EmulatorJS shaders/core options; original lightweight arcade decoration. */
(() => {
  'use strict';
  const script = document.currentScript;
  const assets = new URL('./', script.src);
  const params = new URLSearchParams(location.search);
  const core = params.get('core');
  let rom = (params.get('src') || '').split('/').pop();
  try {rom=decodeURIComponent(rom);} catch {}
  rom=rom.replace(/\.(zip|7z)$/i, '');
  let key = 'arcade-picture-v1:' + core + ':' + params.get('src');
  const defaults = {filter:'original', frame:'club', mask:'none', strength:'balanced'};
  const choices = {
    filter:[['original','原始像素 · 清晰方块'],['soft','柔和 · 像素平滑'],['crt','老电视 · 扫描线与辉光'],['phosphor','荧光点 · 精细 CRT'],['phosphor-glow','荧光点 · 柔光'],['phosphor-line','荧光线 2.0 · 标准'],['phosphor-line-glow','荧光线 2.0 · 扩散辉光'],['phosphor-line-reflex','荧光线 2.0 · 玻璃反射']],
    frame:[['none','关闭 · 最大游戏画面'],['club','老街机厅 · 木纹机台'],['neon','日式街机 · 奶白机台']],
    mask:[['none','关闭'],['scan','轻扫描线'],['aperture','细密荫罩']],
    strength:[['light','轻 · 保留清晰度'],['balanced','中 · 日常游玩'],['strong','浓 · 复古氛围']]
  };
  let picture = {...defaults}, storageOK = true, appliedEmulator = null, appliedShader='', manifest = null, comparison=false, previewURL=null, previewGeneration=0, snapshotBytes=null, capturePromise=Promise.resolve();
  const validRatio=n=>Number.isFinite(n)&&n>=.2&&n<=5;
  let preloadRatio=validRatio(Number(params.get('aspect')))?Number(params.get('aspect')):4/3,ratioKey='',lastMeasured=0;
  try {const saved = JSON.parse(localStorage.getItem(key));for(const k in defaults)if(choices[k].some(([v])=>v===saved?.[k]))picture[k]=saved[k];} catch {}
  const style = document.createElement('link');style.rel='stylesheet';style.href=new URL('experience.css?v=cabinet7',assets);document.head.append(style);
  const stage = document.querySelector('#playerStage');
  const decor = document.createElement('div');decor.id='arcadeDecoration';decor.setAttribute('aria-hidden','true');
  decor.innerHTML='<div class="arcade-cabinet"><div class="cabinet-marquee"><i></i><div><small>像素放映厅</small><strong>VIDEO ARCADE</strong></div><i></i></div><div class="cabinet-bezel"><span class="bezel-caption">HIGH SCORE · ONE MORE ROUND</span><i class="screw s1"></i><i class="screw s2"></i><i class="screw s3"></i><i class="screw s4"></i></div><div class="cabinet-deck"><div class="deck-player"><span>1 PLAYER</span><i class="joystick"></i><div class="arcade-buttons"><b></b><b></b><b></b><b></b><b></b><b></b></div></div><div class="deck-player"><span>2 PLAYERS</span><i class="joystick"></i><div class="arcade-buttons"><b></b><b></b><b></b><b></b><b></b><b></b></div></div></div><div class="cabinet-coins"><span>请投入代币<br><small>INSERT COIN</small></span><i></i><i></i><span>再来一局<br><small>PLAY AT HOME</small></span></div></div><img class="arcade-preview" alt="" hidden><div class="arcade-glass"></div><div class="arcade-mask"></div>';
  stage.append(decor);
  const shaderPreview=document.createElement('canvas');shaderPreview.className='arcade-native-preview';shaderPreview.hidden=true;decor.querySelector('.arcade-glass').before(shaderPreview);
  const scene=document.createElement('div');scene.className='arcade-scene';stage.append(scene);scene.append(document.querySelector('#game'),decor);
  decor.style.visibility='hidden';
  decor.querySelector('.arcade-cabinet').insertAdjacentHTML('afterbegin','<div class="cabinet-roof"></div><div class="cabinet-side side-left"></div><div class="cabinet-side side-right"></div>');
  decor.insertAdjacentHTML('afterbegin','<div class="arcade-neighbor neighbor-left"><b>GAME CENTER</b><i></i><span>INSERT COIN</span></div><div class="arcade-neighbor neighbor-right"><b>VIDEO GAME</b><i></i><span>PLAYER 1 · PLAYER 2</span></div>');
  const shaderNames={original:'disabled',soft:'2xScaleHQ.glslp',crt:'crt-easymode.glslp',phosphor:'phosphor-dot.glslp','phosphor-glow':'phosphor-glow.glslp','phosphor-line':'phosphor-line.glslp','phosphor-line-glow':'phosphor-line-glow.glslp','phosphor-line-reflex':'phosphor-line-reflex.glslp'};
  const strengths={light:{scan:.3,mask:.06,overlay:.13,shade:.13},balanced:{scan:.5,mask:.13,overlay:.22,shade:.22},strong:{scan:.75,mask:.22,overlay:.32,shade:.32}};
  function setShader(em,filter) {
    const id=filter+':'+picture.strength+':'+(em.canvas?.width||0)+'x'+(em.canvas?.height||0);
    if(appliedEmulator===em && appliedShader===id)return;
    let name=shaderNames[filter];if(filter.startsWith('phosphor')&&!em.config?.shaders?.[name]){picture.filter='crt';name=shaderNames.crt;filter='crt';}
    if(filter.startsWith('phosphor')&&em.config?.shaders?.[name]){
      const base=em.config.shaders[name],w=Math.max(1,em.canvas?.width||640),h=Math.max(1,em.canvas?.height||480),viewport=`vec4(${w}.0,${h}.0,${1/w},${1/h})`;
      const amount={light:{scan:.55,mask:.2,dot:.55},balanced:{scan:.78,mask:.4,dot:.78},strong:{scan:.95,mask:.7,dot:.95}}[picture.strength];
      em.config.shaders['arcade-phosphor']={...base,shader:{...base.shader,value:base.shader.value+'\nLINE_OPACITY = \"'+amount.scan+'\"\nMASK_INTENSITY = \"'+amount.mask+'\"\nDOT_OPACITY = \"'+amount.dot+'\"\n'},resources:base.resources.map(r=>({...r,value:r.value.replaceAll('ARCADE_FINAL_VIEWPORT',viewport)}))};name='arcade-phosphor';
    }
    if(filter==='crt' && em.config?.shaders?.[name]){
      const base=em.config.shaders[name],s=strengths[picture.strength];
      em.config.shaders['arcade-crt']={...base,shader:{...base.shader,type:'text',value:base.shader.value+'\nparameters = "SCANLINE_STRENGTH;MASK_STRENGTH;BRIGHT_BOOST"\nSCANLINE_STRENGTH = "'+s.scan+'"\nMASK_STRENGTH = "'+s.mask+'"\nBRIGHT_BOOST = "1.08"\n'}};
      name='arcade-crt';
    }
    em.enableShader(name);appliedEmulator=em;appliedShader=id;
  }
  // EmulatorJS 4.2.3 hands raw ArrayBuffers to FS.writeFile for external assets.
  // Emscripten requires a typed array; otherwise an apparently loaded file is empty.
  const previousReady=window.EJS_ready;
  window.EJS_ready=()=>{
    const canvas=window.EJS_emulator?.canvas;
    if(canvas && !canvas.arcadePreservedFrame){
      const getContext=canvas.getContext;
      canvas.getContext=function(type,attributes){return getContext.call(this,type,/webgl/i.test(type)?{...attributes,preserveDrawingBuffer:true}:attributes);};
      canvas.arcadePreservedFrame=true;
    }
    const prototype=window.EJS_GameManager?.prototype;
    if(prototype && !prototype.arcadeTypedFiles){
      const write=prototype.writeFile;
      prototype.writeFile=function(path,data){return write.call(this,path,data instanceof ArrayBuffer?new Uint8Array(data):data);};
      prototype.arcadeTypedFiles=true;
    }
    previousReady?.();
  };
  function geometry() {
    const em=window.EJS_emulator,gm=em?.gameManager;
    let ratio=preloadRatio;
    try {const measured=em?.started?gm?.getVideoDimensions('aspect'):null;if(validRatio(measured)){ratio=measured;if(ratioKey&&Math.abs(measured-lastMeasured)>.001){lastMeasured=measured;localStorage.setItem(ratioKey,String(measured));}preloadRatio=measured;}} catch {}
    stage.dataset.screenAspect=String(ratio);
    const w=stage.clientWidth,h=stage.clientHeight,cabinet=picture.frame!=='none';
    const edge=cabinet?Math.max(10,Math.min(25,w*.025)):0;
    const marquee=cabinet?Math.max(36,Math.min(72,h*.10)):0;
    const deck=cabinet?Math.max(42,Math.min(88,h*.115)):0;
    const coins=cabinet?Math.max(24,Math.min(46,h*.06)):0;
    const pad=cabinet?Math.min(22,h*.025):0;
    const vw=Math.min(Math.max(1,w-edge*2-(cabinet?Math.min(40,w*.04):0)),Math.max(1,h-marquee-deck-coins-pad*2)*ratio),vh=vw/ratio;
    const left=(w-vw)/2,top=(h-vh-marquee-deck-coins-pad*2)/2+marquee+pad;
    stage.dataset.cabinet=picture.frame;stage.style.setProperty('--screen-radius',(cabinet?Math.min(18,Math.min(vw,vh)*.025):0)+'px');
    Object.assign(document.querySelector('#game').style,{position:'absolute',left:(cabinet?left:0)+'px',top:(cabinet?top:0)+'px',width:(cabinet?vw:w)+'px',height:(cabinet?vh:h)+'px'});
    decor.style.setProperty('--gutter',left+'px');decor.style.setProperty('--screen-top',top+'px');
    decor.style.setProperty('--screen-width',vw+'px');decor.style.setProperty('--screen-height',vh+'px');
    decor.style.setProperty('--cabinet-left',(left-edge)+'px');decor.style.setProperty('--cabinet-top',(top-marquee-pad)+'px');
    decor.style.setProperty('--cabinet-width',(vw+edge*2)+'px');decor.style.setProperty('--cabinet-height',(vh+marquee+deck+coins+pad*2)+'px');
    decor.style.setProperty('--edge',edge+'px');decor.style.setProperty('--marquee',marquee+'px');decor.style.setProperty('--deck',deck+'px');decor.style.setProperty('--coins',coins+'px');decor.style.setProperty('--bezel-pad',pad+'px');
  }
  function apply() {
    decor.dataset.frame=picture.frame;decor.dataset.mask=comparison?'none':picture.mask;decor.dataset.filter=comparison?'original':picture.filter;
    document.querySelector('#game').dataset.filter=decor.dataset.filter;
    decor.dataset.strength=picture.strength;
    decor.style.setProperty('--scan-opacity',strengths[picture.strength].overlay);
    decor.style.setProperty('--glass-shade',strengths[picture.strength].shade);
    const em=window.EJS_emulator;
    if(em?.started) {
      try {setShader(em,comparison?'original':picture.filter);} catch {picture.filter='original';appliedShader='';try{em.enableShader('disabled');}catch{}}
    }
    geometry();
    if(em?.paused&&document.querySelector('#padGuide[data-experience=true][open] [aria-label="画面滤镜"]'))snapshotPreview();
  }
  function save() {window.ArcadeAccountSync?.picture(key.slice(window.ArcadePreferences.key('').length),picture);try{localStorage.setItem(key,JSON.stringify(picture));storageOK=true;}catch{storageOK=false;}apply();}
  window.addEventListener('arcade-account-data',()=>{try{const saved=JSON.parse(localStorage.getItem(key)||'null'),global=ArcadePreferences.get();for(const name of ['filter','frame','mask','strength'])picture[name]=choices[name].some(([v])=>v===saved?.[name])?saved[name]:global[name];apply();}catch{}});
  new ResizeObserver(geometry).observe(stage);
  setInterval(()=>{const em=window.EJS_emulator;if(em?.started){if(appliedEmulator!==em)apply();else geometry();}},700);
  apply();
  window.addEventListener('arcade-preferences-changed',()=>{try{if(localStorage.getItem(key))return;}catch{}const global=window.ArcadePreferences?.get();if(!global)return;for(const name of ['filter','frame','mask','strength'])picture[name]=global[name];apply();if(container?.open&&container.querySelector('[aria-label="画面滤镜"]'))picturePage();});
  function clearPreview() {
    previewGeneration++;const img=decor.querySelector('.arcade-preview');img.hidden=true;img.removeAttribute('src');
    shaderPreview.hidden=true;
    if(previewURL)URL.revokeObjectURL(previewURL);previewURL=null;comparison=false;apply();
  }
  async function snapshotPreview() {
    const gm=window.EJS_emulator?.gameManager;if(!gm)return false;
    const generation=++previewGeneration;
    try {
      await capturePromise;
      if(!snapshotBytes)return false;
      const bytes=snapshotBytes;
      if(previewURL)URL.revokeObjectURL(previewURL);
      previewURL=URL.createObjectURL(new Blob([bytes],{type:'image/png'}));
      const img=decor.querySelector('.arcade-preview');img.src=previewURL;await img.decode();
      if(generation===previewGeneration && container?.open&&container.querySelector('[aria-label="画面滤镜"]')){
        shaderPreview.hidden=true;img.hidden=false;
        if(picture.filter.startsWith('phosphor')&&!comparison){
          const pack=await window.ArcadePreferences.shaderPack();if(generation!==previewGeneration)return false;
          const preset=pack?.shaders?.[shaderNames[picture.filter]],em=window.EJS_emulator;
          if(preset&&window.ArcadeShaderPreview){ArcadeShaderPreview.render(shaderPreview,img,preset,picture.strength,{width:em.canvas.width,height:em.canvas.height,sourceWidth:gm.getVideoDimensions('width'),sourceHeight:gm.getVideoDimensions('height')});shaderPreview.hidden=false;img.hidden=true;}
        }
        return true;
      }
    }catch { /* Keep the paused game visible if the core cannot capture a frame. */ }
    return false;
  }
  function el(tag,text,cls) {const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;}
  function button(parent,text,fn) {const b=el('button',text);b.type='button';b.onclick=fn;parent.append(b);return b;}
  function field(parent,label,options,value,onChange) {
    const row=el('label',label,'experience-field'),select=el('select');select.setAttribute('aria-label',label);
    for(const [v,t] of options)select.add(new Option(t,v));select.value=value;
    select.onchange=()=>onChange(select.value);row.append(select);parent.append(row);return select;
  }
  function nativeOptions() {
    try {return (window.EJS_emulator?.gameManager?.getCoreOptions()||'').split('\n').flatMap(line=>{
      const sep=line.indexOf('; ');if(sep<0)return [];
      const [name,current]=line.slice(0,sep).split('|');
      return [{name,current,values:line.slice(sep+2).split('|')}];
    });}catch{return [];}
  }
  function translate(text) {
    let label=text.replace(/^fbneo-cheat-\d+-/, '');
    if(label.startsWith(rom+'-'))label=label.slice(rom.length+1);
    label=label.replace(/_/g,' ').replace(/^\d+ - /,'').replace(/Kill (.+) with 1 hit Now!?/gi,'立即一击击败 $1');
    const phrases={
      'Infinite Character Select Time':'无限选人时间','Select Cartridge/NeoGeo Type':'选择卡带／NeoGeo 类型',
      'Always have Maximum Power':'始终保持最大能量','Allow special moves during jump':'跳跃时可使用特殊招式',
      'Possible to act Before begins':'开场前即可行动','Finish round to win match':'结束本回合并获胜',
      'Drain All Energy Now!':'立即清空体力','Drain All Power Now!':'立即清空能量','Finish this Round Now!':'立即结束本回合',
      'Select Starting Episode':'选择起始关卡','Select Starting Stage':'选择起始关卡','Select Player Size':'选择角色大小',
      'Maximum Fire Power':'最大火力','Maximum Power':'最大能量','Infinite Energy':'无限体力','Infinite Health':'无限体力',
      'Infinite Lives':'无限生命','Infinite Time':'无限时间','Infinite Credits':'无限投币次数','Infinite Bombs':'无限炸弹',
      'Infinite Ammo':'无限弹药','Infinite Magic':'无限魔法','Infinite Power':'无限能量','Unlimited Fire':'无限射击',
      'Never Get Dizzied':'不会眩晕','Never Faint':'不会昏倒','Invincibility':'无敌','Rapid Fire':'连发',
      'Select Character':'选择角色','Select Weapon':'选择武器','Select Region':'选择地区','Select Speed':'选择速度',
      'Select Background':'选择背景','Select Backdrop':'选择背景','Select Score':'选择分数','Select Team':'选择队伍',
      'Select Rounds Lost':'选择已输回合数','Action Speed Up':'动作加速','Quick Action':'快速动作','Quick Shot':'快速射击',
      'Sound Test Timer Stop':'停止声音测试计时','Sound Test':'声音测试','No limit next shot':'无射击间隔限制',
      'Disabled':'关闭','Enabled':'开启','Normal':'普通','Unlimited':'无限制','Maximum':'最大',
      'Off':'关闭','On':'开启','Japan':'日本','Europe':'欧洲','Asia':'亚洲','USA':'美国','Now':'立即'
    };
    for(const [source,target] of Object.entries(phrases).sort((a,b)=>b[0].length-a[0].length)){
      const escaped=source.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      label=label.replace(new RegExp('\\b'+escaped+'(?=\\W|$)','gi'),target);
    }
    return label.replace(/\b(?:PL|P|Player\s*)([1-4])\b/gi,'玩家 $1').replace(/Set score = 0 Now!?/gi,'立即将分数清零').replace(/Score always = (\d+)/gi,'分数始终为 $1');
  }
  const nativeHelp=document.createElement('section');nativeHelp.id='nativeCheatHelp';nativeHelp.hidden=true;nativeHelp.setAttribute('aria-label','金手指中文指引');
  nativeHelp.innerHTML='<details><summary>金手指中文指引</summary><p>Cheat＝金手指<br>Enable/Disable a Cheat＝开启／关闭项目<br>Return to Main Menu＝返回主菜单<br>Return to Prior Menu＝返回上级<br>On＝开启，Off＝关闭</p><p>方向键选择；动作 A 确认，动作 B 返回上级。<br>Esc、手柄 Home 或菜单组合键：退出到游戏菜单。</p></details>';
  button(nativeHelp,'退出金手指并继续游戏',()=>window.dispatchEvent(new CustomEvent('arcade-native-exit')));stage.append(nativeHelp);
  window.addEventListener('arcade-native-menu',()=>{nativeHelp.hidden=false;nativeHelp.querySelector('details').open=matchMedia('(min-width:1000px)').matches;});
  window.addEventListener('arcade-native-menu-closed',()=>{nativeHelp.hidden=true;});
  let mameLabelsPromise=null;
  function mameLabels(){
    if(!mameLabelsPromise)mameLabelsPromise=fetch(new URL('cheats/mame2003-plus/'+rom+'.dat',assets),{signal:AbortSignal.timeout(5000)}).then(r=>{if(!r.ok)throw Error();return r.text();}).then(text=>{
      const seen=new Set(),labels=[];
      for(const line of text.split('\n')){const parts=line.replace(/^:/,'').split(':');if(parts[0]!==rom||parts.length<6)continue;const desc=parts[5].trim().replace(/\s*\(\d+\/\d+\)$/,'');if(desc&&!seen.has(desc)){seen.add(desc);labels.push(desc);}}
      return labels;
    });
    return mameLabelsPromise;
  }
  function cheats(parent) {
    const em=window.EJS_emulator, gm=em?.gameManager;
    const help=el('section',null,'cheat-instructions');help.innerHTML='<h3>如何进入与退出</h3><p><strong>进入：</strong>按 Esc、点击「游戏菜单」或使用手柄菜单组合键，再选择「金手指」。</p><p><strong>退出界面：</strong>此页按 B / Esc，或点击「继续游戏」。退出界面不会关闭已经启用的效果。</p>';parent.append(help);
    if(window.ArcadePreferences?.get().cheats==='disabled'&&!manifest){parent.append(el('p','金手指资源已在全局设置中关闭。可在「游戏厅设置」中允许手动开启，再重新进入游戏；不会自动启用任何效果。'));button(parent,'打开游戏厅设置',()=>window.ArcadePreferences.open());return;}
    if(!em?.started){parent.append(el('p','启动游戏后，可查看当前核心支持的金手指。'));return;}
    const opts=nativeOptions().filter(o=>/^fbneo-cheat-/.test(o.name));
    if(opts.length) {
      const search=el('input');search.type='search';search.placeholder='筛选金手指';search.setAttribute('aria-label','筛选金手指');parent.append(search);
      const list=el('div',null,'experience-cheats');parent.append(list);
      const rows=[];
      for(const opt of opts) {
        const select=field(list,translate(opt.name),opt.values.map(v=>[v,translate(v)]),opt.current||opt.values[0],v=>{
          try{gm.setVariable(opt.name,v);notice.textContent='已提交给核心；部分选项需继续游戏后生效。';}catch{select.value=opt.current||opt.values[0];notice.textContent='核心未能应用此选项。';}
        });select.parentElement.title=opt.name;rows.push([select.parentElement,(translate(opt.name)+' '+opt.name).toLowerCase()]);
      }
      search.oninput=()=>{const q=search.value.trim().toLowerCase();for(const [row,name] of rows)row.hidden=!name.includes(q);};
      const notice=el('p','金手指默认关闭。个别效果关闭后需要重新启动游戏。','experience-note');notice.setAttribute('role','status');parent.append(notice);
      button(parent,'关闭全部金手指',()=>{for(const o of opts){const off=o.values.find(v=>/(^| - )(disabled|off)$/i.test(v));if(off)gm.setVariable(o.name,off);}cheatPage();});
    } else if(core==='mame2003_plus' && manifest?.mame?.includes(rom)) {
      parent.append(el('p','进入步骤：打开下方核心菜单 → Cheat（金手指）→ Enable/Disable a Cheat（开启／关闭项目）→ 选择项目，用左右方向切换 On（开启）／Off（关闭）。'));
      button(parent,'打开 MAME 核心菜单',()=>{window.dispatchEvent(new CustomEvent('arcade-native-menu'));});
      parent.append(el('p','退出核心菜单：按 Esc、手柄 Home 或菜单组合键回到游戏菜单；也可点击屏幕上的「退出金手指并继续游戏」。动作 B 返回核心菜单的上一级。','experience-note'));
      parent.append(el('p','当前核心原生菜单仍是英文。下方提供本游戏的中文项目对照；这里只显示名称，开关请在核心菜单中操作。','experience-note'));
      const heading=el('h3','本游戏项目 · 中文对照'),list=el('div',null,'experience-cheats cheat-reference');parent.append(heading,list);list.textContent='正在读取项目…';
      mameLabels().then(labels=>{if(!list.isConnected)return;list.replaceChildren();for(const label of labels){const row=el('div',null,'cheat-reference-row');row.append(el('strong',translate(label)),el('small',label));list.append(row);}if(!labels.length)list.textContent='未找到项目名称，请在核心菜单中查看。';}).catch(()=>{if(list.isConnected)list.textContent='中文对照暂时无法加载，核心菜单仍可使用。';});
    } else parent.append(el('p','当前游戏与核心没有可用的原生金手指选项。修改版与其他地区版本不会套用相似游戏的代码。'));
    if(manifest)parent.append(el('p','资源：FBNeo-cheats / MAME 2003 Plus。常见效果以中文显示，专有名称和未翻译项目保留原文；按 ROM 文件名加载，默认不启用。','experience-note'));
  }
  let container, back;
  function page(title,desc) {container.replaceChildren();container.dataset.experience='true';container.append(el('p','PIXEL ARCADE / EXPERIENCE','experience-eyebrow'),el('h2',title),el('p',desc));}
  function picturePage() {
    comparison=false;apply();
    page('调一调，刚刚好','效果实时预览，为这款游戏单独记住。方向选择，左右切换，B 继续游戏。');
    const details={'phosphor-line':'荧光线 2.0 浏览器适配版：保留作者的扫描线与荫罩计算。','phosphor-line-glow':'荧光线 2.0 扩散辉光：模拟亮部向周围扩散，较标准版更柔和。','phosphor-line-reflex':'荧光线 2.0 玻璃反射：加入屏幕曲面、边缘反射与扩散光，性能需求较高。',phosphor:'作者 Roc-Y（脑浆油条）的荧光点 3.3 原版 GLSL 预设，提供精细像素重建与显像管质感。','phosphor-glow':'作者 Roc-Y（脑浆油条）的荧光点 3.3 柔光预设。',original:'原始像素保留清晰的方块边缘。',soft:'柔和模式平滑像素边缘与斜线，适合人物和文字较多的游戏。',crt:'老电视模式加入明显的扫描线、暗角、复古色彩与辉光。'};
    for(const [k,label] of [['filter','画面滤镜'],['strength','效果强度'],['frame','街机机台遮罩'],['mask','额外屏幕纹理']])field(container,label,choices[k],picture[k],v=>{comparison=false;compare.textContent='对比原画';compare.setAttribute('aria-pressed','false');picture[k]=v;save();note.textContent=details[picture.filter]+(storageOK?' 已保存。':' 设置本次有效。')+' 暂停时预览色彩和纹理，像素平滑在继续游戏后呈现。';});
    const note=el('p',details[picture.filter]+' 暂停时预览色彩和纹理，像素平滑在继续游戏后呈现。','experience-note');note.setAttribute('role','status');container.append(note);
    const compare=button(container,'对比原画',()=>{comparison=!comparison;apply();compare.textContent=comparison?'正在看原画 · 返回滤镜':'对比原画';compare.setAttribute('aria-pressed',String(comparison));});compare.setAttribute('aria-pressed','false');
    snapshotPreview().then(ready=>{if(!ready&&!snapshotBytes&&compare.isConnected){compare.disabled=true;compare.textContent='当前核心暂不支持原画对比';}});
    button(container,'恢复默认画面',()=>{picture={...defaults};save();picturePage();});
    button(container,'使用全局默认',()=>{window.ArcadeAccountSync?.picture(key.slice(window.ArcadePreferences.key('').length),null);try{localStorage.removeItem(key);}catch{}const g=window.ArcadePreferences?.get()||defaults;for(const name of ['filter','frame','mask','strength'])picture[name]=g[name];apply();picturePage();});
    button(container,'金手指 →',cheatPage);button(container,'← 返回游戏菜单',back);
  }
  function cheatPage() {clearPreview();page('金手指','按当前游戏和模拟核心显示可用项目。');cheats(container);button(container,'继续游戏（B / Esc）',()=>container.close());button(container,'← 画面与边框',picturePage);button(container,'← 返回游戏菜单',back);}
  window.ArcadeExperience={
    layout:geometry,
    async thumbnail(){
      const em=window.EJS_emulator;if(!em?.canvas?.width)return null;let bitmap=null;
      try{await capturePromise;let source=em.canvas;if(em.paused&&snapshotBytes?.byteLength){bitmap=await createImageBitmap(new Blob([snapshotBytes],{type:'image/png'}));source=bitmap;}
        const canvas=document.createElement('canvas');canvas.width=256;canvas.height=192;const c=canvas.getContext('2d');c.fillStyle='#10150f';c.fillRect(0,0,256,192);const scale=Math.min(256/source.width,192/source.height),w=source.width*scale,h=source.height*scale;c.drawImage(source,(256-w)/2,(192-h)/2,w,h);const data=canvas.toDataURL('image/jpeg',.68);return data.length<100000?data:null;
      }catch{return null;}finally{bitmap?.close();}
    },
    pauseForPreview(em) {
      // Capture a stock-shader frame inside RAF, before WebGL discards its buffer.
      // Finish the current display frame, then pause; never restore a save state.
      snapshotBytes=null;
      if(!em.canvas || typeof em.enableShader!=='function'){em.pause();return;}
      try{em.enableShader('disabled');appliedShader='';}catch{em.pause();return;}
      capturePromise=new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>{
        try {
          const canvas=document.createElement('canvas');canvas.width=em.canvas.width;canvas.height=em.canvas.height;
          canvas.getContext('2d').drawImage(em.canvas,0,0);
          canvas.toBlob(async blob=>{try{if(blob)snapshotBytes=new Uint8Array(await blob.arrayBuffer());}finally{resolve();}},'image/png');
        }catch{resolve();}
        if(document.querySelector('#padGuide')?.open)em.pause();
        try{setShader(em,comparison?'original':picture.filter);}catch{}
      })));
    },
    open(node,onBack,tab='picture'){container=node;back=()=>{clearPreview();onBack();};if(!node.dataset.previewBound){node.addEventListener('close',clearPreview);node.dataset.previewBound='true';}(tab==='cheats'?cheatPage:picturePage)();container.querySelector('select,button')?.focus();},
    async prepare() {
      await window.ArcadePreferences?.ready;
      const pack=await window.ArcadePreferences?.shaderPack();if(pack)window.EJS_shaders={...window.EJS_shaders,...pack.shaders};choices.filter=choices.filter.filter(([name])=>!name.startsWith('phosphor')||pack?.shaders?.[shaderNames[name]]);
      try{ratioKey=window.ArcadePreferences.key('video:'+core+':'+new URL(params.get('src'),location.origin).pathname);const learned=Number(localStorage.getItem(ratioKey));if(validRatio(learned))preloadRatio=learned;else if(!validRatio(Number(params.get('aspect')))){const response=await fetch(new URL('game-layouts.json',assets),{signal:AbortSignal.timeout(3000)});if(response.ok){const layouts=await response.json(),ratio=layouts[core]?.[rom.toLowerCase()]||layouts.fbneo?.[rom.toLowerCase()]||layouts.mame2003_plus?.[rom.toLowerCase()];if(validRatio(ratio))preloadRatio=ratio;}}}catch{}
      geometry();decor.style.visibility='';
      if(window.ArcadePreferences){const previousKey=key;key=window.ArcadePreferences.gameKey(core,params.get('src'));const global=window.ArcadePreferences.get();for(const name of ['filter','frame','mask','strength'])picture[name]=global[name];try{const local=localStorage.getItem(key),old=!local?localStorage.getItem(previousKey):null;const saved=JSON.parse(local||old||'null');for(const name of ['filter','frame','mask','strength'])if(choices[name].some(([v])=>v===saved?.[name]))picture[name]=saved[name];if(old){localStorage.setItem(key,old);localStorage.removeItem(previousKey);}}catch{}apply();if(global.cheats==='disabled')return;}
      try {
        const response=await fetch(new URL('cheats/manifest.json',assets),{signal:AbortSignal.timeout(5000)});if(!response.ok)return;
        manifest=await response.json();
        const files={};
        if(core==='fbneo' && manifest.fbneo?.includes(rom)) files['/fbneo/cheats/'+rom+'.ini']=new URL('cheats/fbneo/'+rom+'.ini',assets).href;
        if(core==='mame2003_plus' && manifest.mame?.includes(rom))files['/mame2003-plus/cheat.dat']=new URL('cheats/mame2003-plus/'+rom+'.dat',assets).href;
        window.EJS_externalFiles={...window.EJS_externalFiles,...files};
      }catch { /* Offline resource failure must never block playing. */ }
    }
  };
})();
