// Record the running UI and export a short, silent update walkthrough.
const {chromium}=require('playwright');
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const base=process.env.DEMO_URL||'http://127.0.0.1:18893';
(async()=>{
  const out=path.resolve(__dirname,'../dist/update-v1.1.2');fs.mkdirSync(out,{recursive:true});
  await fetch(base+'/library/catalog.json');
  const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});
  let context;
  try{
    context=await browser.newContext({viewport:{width:1600,height:1000},recordVideo:{dir:out,size:{width:1600,height:1000}}});
    const page=await context.newPage();page.setDefaultTimeout(15000);
    await page.addInitScript(()=>{try{sessionStorage.setItem('arcade-pad-intro','1');}catch{}});
    await page.route('**/*',route=>route.request().url().startsWith(base)||/^(data:|blob:)/.test(route.request().url())?route.continue():route.abort());
    const cuts=[],started=Date.now();
    const mark=scene=>cuts.push({scene,seconds:(Date.now()-started)/1000});
    async function caption(title,sub=''){
      await page.evaluate(({title,sub})=>{
        document.querySelector('#update-caption')?.remove();const box=document.createElement('div');box.id='update-caption';
        box.style.cssText='position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:2147483647;max-width:90vw;background:#11180ff2;border:1px solid #718e48;border-radius:14px;padding:18px 32px;color:#f0f8df;text-align:center;font:700 27px Microsoft YaHei,sans-serif;pointer-events:none;box-shadow:0 10px 40px #0008';
        const heading=document.createElement('div');heading.textContent=title;box.append(heading);
        if(sub){const line=document.createElement('div');line.textContent=sub;line.style.cssText='font-size:17px;font-weight:400;color:#c1d0af;margin-top:8px';box.append(line);}(document.querySelector('dialog[open]')||document.body).append(box);
      },{title,sub});
    }
    await page.setContent('<html lang="zh-CN"><meta charset="utf-8"><body style="margin:0;background:#111611;color:#f1f6e8;font-family:Microsoft YaHei,sans-serif;display:grid;place-items:center;height:100vh"><div style="width:1260px"><p style="font-size:20px;letter-spacing:6px;color:#d0ef88">PIXEL ARCADE · UPDATE 1.1.2</p><h1 style="font-size:70px;line-height:1.3">挑游戏，<br>也用手柄。</h1><p style="font-size:29px;color:#b4c3a5">大字体 · 醒目的高亮 · 顺手的按键</p></div></body></html>');
    mark('intro');await page.waitForTimeout(2000);
    await page.goto(base+'/library/');await page.waitForSelector('.cover');
    await caption('熟悉的游戏，慢慢挑。','分类、搜索、收藏，都在一个大厅里。');mark('library');await page.waitForTimeout(2500);
    await page.locator('.collection').scrollIntoViewIfNeeded();await page.mouse.wheel(0,220);await page.waitForTimeout(350);
    await page.locator('#padActivate').scrollIntoViewIfNeeded();await page.locator('#padActivate').click();
    await caption('从挑游戏开始，就用手柄。','方向移动，A 确认，B 返回。');mark('activate');await page.waitForTimeout(3000);
    await caption('选中哪款，一眼就知道。','醒目的高亮，更大的字体。');mark('highlight');await page.waitForTimeout(3000);
    await page.locator('#padSettingsButton').click();
    await caption('按键顺手，玩得更舒服。','菜单快捷键、摇杆灵敏度和导航速度，都能自己调。');mark('settings');await page.waitForTimeout(2500);
    await page.locator('#padSetting-menu').selectOption('4,5');await page.locator('#padSetting-menu').focus();await page.waitForTimeout(1200);
    await page.locator('#padSetting-hold').selectOption('500');await page.waitForTimeout(1200);
    await page.locator('#padSetting-deadzone').selectOption('0.75');await page.locator('#padSetting-repeat').selectOption('220');
    await caption('调成自己习惯的手感。','设好就记住，下次打开接着用。');await page.waitForTimeout(3000);
    await page.screenshot({path:path.join(out,'settings-preview.png')});
    await page.getByRole('button',{name:'完成（B）',exact:true}).click();
    await page.locator('#padGuideButton').click();await caption('忘了怎么按？随时看一眼。','操作提示就在手边，少找鼠标，多玩一会儿。');mark('guide');await page.waitForTimeout(3500);
    await page.setContent('<html lang="zh-CN"><meta charset="utf-8"><body style="margin:0;background:#111611;color:#f1f6e8;font-family:Microsoft YaHei,sans-serif;display:grid;place-items:center;height:100vh"><div style="width:1260px"><p style="color:#d0ef88;font-size:21px;letter-spacing:5px">PIXEL ARCADE · v1.1.2</p><h1 style="font-size:66px;line-height:1.4">选一款，<br>开一局。</h1><p style="font-size:27px;color:#b4c3a5">像素放映厅 · 家庭版</p><p style="font-size:20px;color:#879c76;margin-top:50px">github.com/infinitytom/pixel-arcade-family</p></div></body></html>');
    mark('outro');await page.waitForTimeout(2500);
    const video=page.video();await context.close();context=null;const raw=await video.path();
    const output=path.resolve(__dirname,'../dist/pixel-arcade-family-v1.1.2-update.mp4');
    execFileSync('ffmpeg',['-hide_banner','-loglevel','warning','-y','-i',raw,'-vf','fps=30,format=yuv420p','-an','-c:v','libx264','-preset','medium','-crf','22','-movflags','+faststart',output],{stdio:'pipe'});
    const probe=JSON.parse(execFileSync('ffprobe',['-v','quiet','-show_format','-show_streams','-of','json',output],{encoding:'utf8'}));
    const metadata={output,cuts,duration:Number(probe.format.duration),width:probe.streams[0].width,height:probe.streams[0].height,audio:probe.streams.some(s=>s.codec_type==='audio')};
    fs.writeFileSync(path.join(out,'metadata.json'),JSON.stringify(metadata,null,2));console.log(JSON.stringify(metadata));
  }finally{if(context)await context.close();await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
