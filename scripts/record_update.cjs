// Record the running UI and export a short, silent update walkthrough.
const {chromium}=require('playwright');
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const base=process.env.DEMO_URL||'http://127.0.0.1:18893';
(async()=>{
  const out=path.resolve(__dirname,'../dist/update-v1.1.2');fs.mkdirSync(out,{recursive:true});
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
    await page.setContent('<html lang="zh-CN"><meta charset="utf-8"><body style="margin:0;background:#111611;color:#f1f6e8;font-family:Microsoft YaHei,sans-serif;display:grid;place-items:center;height:100vh"><div style="width:1260px"><p style="font-size:20px;letter-spacing:6px;color:#d0ef88">PIXEL ARCADE · UPDATE 1.1.2</p><h1 style="font-size:70px;line-height:1.3">手柄操作，<br>从激活窗口开始。</h1><p style="font-size:29px;color:#b4c3a5">焦点提示 · 输入状态 · 手柄设置</p></div></body></html>');
    mark('intro');await page.waitForTimeout(3500);
    await page.goto(base+'/library/');await page.waitForSelector('.cover');
    await caption('像素放映厅 v1.1.2','这次更新：把“识别设备”和“收到输入”说清楚');mark('library');await page.waitForTimeout(3500);
    await page.locator('.collection').scrollIntoViewIfNeeded();await page.mouse.wheel(0,220);await page.waitForTimeout(350);
    await page.locator('#padActivate').scrollIntoViewIfNeeded();await page.locator('#padActivate').click();
    await caption('先切到大厅，再点击网页','切换应用、标签页或远程控制后，请重新点击网页再用手柄');mark('activate');await page.waitForTimeout(5500);
    await caption('已识别设备 ≠ 正在接收输入','收到按键后才确认输入；失去焦点时提示暂停接收');mark('status');await page.waitForTimeout(4500);
    await page.locator('#padSettingsButton').click();
    await caption('常用操作，集中到手柄设置','指定控制器 · 更改菜单组合键 · 调整长按时间');mark('settings');await page.waitForTimeout(3000);
    await page.locator('#padSetting-menu').selectOption('4,5');await page.locator('#padSetting-menu').focus();await page.waitForTimeout(1600);
    await page.locator('#padSetting-hold').selectOption('500');await page.waitForTimeout(1600);
    await page.locator('#padSetting-deadzone').selectOption('0.75');await page.locator('#padSetting-repeat').selectOption('220');
    await caption('按自己的习惯调整','摇杆死区和导航速度可调，设置自动保存在当前浏览器');await page.waitForTimeout(3500);
    await page.screenshot({path:path.join(out,'settings-preview.png')});
    await page.getByRole('button',{name:'恢复默认设置',exact:true}).click();await page.waitForTimeout(1000);
    await page.getByRole('button',{name:'完成（B）',exact:true}).click();
    await page.locator('#padGuideButton').click();await caption('不记得按键？随时打开操作指南','大厅按 Select；游戏菜单默认 Select + Start 长按 1 秒，可在设置中更改');mark('guide');await page.waitForTimeout(4500);
    await page.setContent('<html lang="zh-CN"><meta charset="utf-8"><body style="margin:0;background:#111611;color:#f1f6e8;font-family:Microsoft YaHei,sans-serif;display:grid;place-items:center;height:100vh"><div style="width:1260px"><p style="color:#d0ef88;font-size:21px;letter-spacing:5px">PIXEL ARCADE · v1.1.2</p><h1 style="font-size:66px;line-height:1.4">保持窗口在前台，<br>挑一款，开始玩。</h1><p style="font-size:27px;color:#b4c3a5">UU 虚拟手柄大厅操作已确认 · 游戏内及多人操作待验收</p><p style="font-size:20px;color:#879c76;margin-top:50px">github.com/infinitytom/pixel-arcade-family</p></div></body></html>');
    mark('outro');await page.waitForTimeout(4000);
    const video=page.video();await context.close();context=null;const raw=await video.path();
    const output=path.resolve(__dirname,'../dist/pixel-arcade-family-v1.1.2-update.mp4');
    execFileSync('ffmpeg',['-hide_banner','-loglevel','warning','-y','-i',raw,'-vf','fps=30,format=yuv420p','-an','-c:v','libx264','-preset','medium','-crf','22','-movflags','+faststart',output],{stdio:'pipe'});
    const probe=JSON.parse(execFileSync('ffprobe',['-v','quiet','-show_format','-show_streams','-of','json',output],{encoding:'utf8'}));
    const metadata={output,cuts,duration:Number(probe.format.duration),width:probe.streams[0].width,height:probe.streams[0].height,audio:probe.streams.some(s=>s.codec_type==='audio')};
    fs.writeFileSync(path.join(out,'metadata.json'),JSON.stringify(metadata,null,2));console.log(JSON.stringify(metadata));
  }finally{if(context)await context.close();await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
