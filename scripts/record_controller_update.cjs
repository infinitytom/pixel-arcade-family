// Repeatable product walkthrough through Gamepad API input states. UI actions
// after the initial page activation go through the shipped controller handler.
const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const base=process.env.DEMO_URL||'http://127.0.0.1:18893';
(async()=>{
  await fetch(base+'/library/catalog.json');
  const out=path.resolve(__dirname,'../dist/controller-walkthrough');fs.mkdirSync(out,{recursive:true});
  const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});let context;
  try{
    context=await browser.newContext({viewport:{width:1600,height:1000},recordVideo:{dir:out,size:{width:1600,height:1000}}});
    const page=await context.newPage();page.setDefaultTimeout(10000);
    await page.addInitScript(()=>{
      try{sessionStorage.setItem('arcade-pad-intro','1');}catch{}
      window.recordingPad={id:'Xbox 手柄',index:0,connected:true,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0}))};
      Object.defineProperty(navigator,'getGamepads',{value:()=>[window.recordingPad]});
    });
    await page.route('**/*',r=>r.request().url().startsWith(base)||/^(blob:|data:)/.test(r.request().url())?r.continue():r.abort());
    const events=[],errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base+'/library/');await page.waitForSelector('.cover');await page.locator('#padActivate').click();
    await page.waitForTimeout(400);
    const trimStart=await page.evaluate(()=>performance.now()/1000);
    const started=Date.now();
    const names={0:'A',1:'B',2:'X',3:'Y',4:'LB',5:'RB',8:'Select',9:'Start',12:'↑',13:'↓',14:'←',15:'→'};
    async function caption(title,sub=''){
      await page.evaluate(({title,sub})=>{
        document.querySelector('#walkthrough-caption')?.remove();const box=document.createElement('div');box.id='walkthrough-caption';
        box.style.cssText='position:fixed;bottom:22px;left:50%;transform:translateX(-50%);z-index:2147483647;padding:16px 28px;border:1px solid #6a8543;border-radius:12px;background:#10180ff0;color:#eff8e0;text-align:center;font:700 25px Microsoft YaHei,sans-serif;pointer-events:none';
        const a=document.createElement('div');a.textContent=title;box.append(a);
        if(sub){const b=document.createElement('div');b.textContent=sub;b.style.cssText='font-size:16px;font-weight:400;color:#b9cba6;margin-top:7px';box.append(b);}
        (document.querySelector('#padSettings[open],#padGuide[open],#padKeyboard[open],#detail[open]')||document.body).append(box);
      },{title,sub});
    }
    async function input(buttons=[],axes=[0,0,0,0],label=''){
      await page.evaluate(({buttons,axes,label})=>{
        window.recordingPad.buttons.forEach((b,i)=>{b.pressed=buttons.includes(i);b.value=b.pressed?1:0;});window.recordingPad.axes=axes;
        let hud=document.querySelector('#controller-key');if(!hud){hud=document.createElement('div');hud.id='controller-key';}
        hud.style.cssText='position:fixed;right:25px;top:25px;z-index:2147483647;min-width:80px;padding:12px 19px;border-radius:12px;border:1px solid #92ac69;text-align:center;pointer-events:none;font:700 27px Microsoft YaHei,sans-serif;transition:background .1s;color:'+(label?'#1e2d12':'#bad09d')+';background:'+(label?'#d0ef88':'#172013e8');
        if(label){hud.textContent=label;hud.dataset.last=label;}else hud.textContent=hud.dataset.last||'手柄';
        (document.querySelector('#padSettings[open],#padGuide[open],#padKeyboard[open],#detail[open]')||document.body).append(hud);
      },{buttons,axes,label});
      if(label)events.push({seconds:(Date.now()-started)/1000,input:label});
    }
    async function press(b,rest=320){await input([b],[0,0,0,0],names[b]||String(b));await page.waitForTimeout(170);await input();await page.waitForTimeout(rest+[40,0,80,20][events.length%4]);}
    async function tilt(x,y,label){await input([],[x,y,0,0],label);await page.waitForTimeout(170);await input();await page.waitForTimeout(350);}
    async function expect(fn,label){if(!await page.evaluate(fn))throw Error(label);}
    await caption('从挑游戏开始，就用手柄。','方向移动，A 确认，B 返回。');await page.waitForTimeout(900);
    await press(15);await press(15);await tilt(0,1,'左摇杆 ↓');await press(15);await press(12);await press(14);
    await press(0);await expect(()=>document.querySelector('#detail').open,'A did not open details');
    await caption('看详情，顺手收进收藏。');await page.waitForTimeout(700);await press(3,750);
    await expect(()=>document.querySelector('#save').textContent.includes('已收藏'),'Y did not favorite');
    await press(2,1400);await press(1,450);
    await caption('一页页逛，也能直接搜。');await press(5,950);await expect(()=>document.querySelector('#pageInfo').textContent.startsWith('2 /'),'RB did not page forward');
    await press(15);await press(15);await press(4,800);await expect(()=>document.querySelector('#pageInfo').textContent.startsWith('1 /'),'LB did not page back');
    await press(2);await expect(()=>document.querySelector('#padKeyboard').open,'X did not open keyboard');
    await caption('想玩的那款，几下就找到。','用手柄在屏幕键盘输入游戏名。');
    // Navigate the six-column on-screen keyboard, without focusing keys via DOM.
    for(const b of [15,15,15,0,13,14,0,13,14,0,15,0])await press(b,170);
    await expect(()=>document.querySelector('#search').value==='dino','Gamepad keyboard did not enter dino');
    await page.waitForTimeout(600);await press(1,850);
    await expect(()=>document.querySelectorAll('#grid .cover').length>0,'Search returned no games');
    await press(0,700);await expect(()=>document.querySelector('#detail').open,'Search result details did not open');
    await caption('找到喜欢的，随时开场。');await page.waitForTimeout(1300);await press(1);
    await press(8);await press(15);await press(0);
    await expect(()=>document.querySelector('#padSettings').open,'Gamepad did not enter settings');
    await caption('菜单按键，也能按习惯设置。');await press(15,600);await press(13);await press(15,600);
    await press(1);await press(1);
    await caption('选一款，开一局。','像素放映厅 · 家庭版');await page.waitForTimeout(1500);
    if(errors.length)throw Error(errors.join('; '));
    const video=page.video();await context.close();context=null;const raw=await video.path();
    const output=path.resolve(__dirname,'../dist/pixel-arcade-family-v1.1.2-update-v3.mp4');
    execFileSync('ffmpeg',['-hide_banner','-loglevel','warning','-y','-ss',String(trimStart),'-i',raw,'-vf','fps=30,format=yuv420p','-an','-c:v','libx264','-preset','medium','-crf','20','-movflags','+faststart',output],{stdio:'pipe'});
    const probe=JSON.parse(execFileSync('ffprobe',['-v','quiet','-show_format','-of','json',output],{encoding:'utf8'}));
    const metadata={output,raw,trimStart,duration:Number(probe.format.duration),inputSource:'repeatable Gamepad API states',events};
    fs.writeFileSync(path.join(out,'metadata.json'),JSON.stringify(metadata,null,2));console.log(JSON.stringify(metadata));
  }finally{if(context)await context.close();await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
