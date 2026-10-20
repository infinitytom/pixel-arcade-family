// Records the real running app. Local URLs may be overridden for another installation.
const {chromium}=require('playwright');
const fs=require('fs');
const base=process.env.DEMO_URL||'http://127.0.0.1:18891';
(async()=>{
  fs.mkdirSync('dist/recording',{recursive:true});
  const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
  const context=await browser.newContext({viewport:{width:1600,height:900},recordVideo:{dir:'dist/recording',size:{width:1600,height:900}}});
  const page=await context.newPage();
  // Demonstrate that the installed engine can run without a remote emulator CDN.
  await page.route('**/*',route=>{
    const url=route.request().url();
    if(url.startsWith(base)||url.startsWith('data:')||url.startsWith('blob:'))return route.continue();
    return route.abort();
  });
  const start=Date.now(), cuts=[];
  function mark(scene){cuts.push({scene,seconds:(Date.now()-start)/1000});}
  async function caption(title,sub=''){
    await page.evaluate(({title,sub})=>{
      document.getElementById('promo-caption')?.remove();
      const box=document.createElement('div');box.id='promo-caption';
      box.style.cssText='position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:2147483647;background:#10170ef2;color:#effbdc;border:1px solid #7d9c49;border-radius:14px;padding:18px 34px;text-align:center;box-shadow:0 8px 60px #0009;font:700 27px Microsoft YaHei, sans-serif;pointer-events:none;white-space:nowrap;';
      const a=document.createElement('div');a.textContent=title;box.append(a);
      if(sub){const b=document.createElement('div');b.textContent=sub;b.style.cssText='font-size:16px;font-weight:400;color:#b7c9a4;margin-top:9px';box.append(b);}
      document.body.append(box);
    },{title,sub});
  }
  await page.setContent(`<html><meta charset="utf-8"><body style="margin:0;background:#111611;color:#f1f6e8;font-family:Microsoft YaHei,sans-serif;height:100vh;display:grid;place-items:center"><div style="width:1320px"><p style="color:#d0ef88;letter-spacing:8px;font-size:20px">PIXEL ARCADE / FAMILY EDITION</p><h1 style="font-size:82px;line-height:1.3;margin:40px 0">把街机厅，<br>搬进你的飞牛 NAS。</h1><p style="font-size:30px;color:#aebda2">像素放映厅 · 家庭版</p><p style="font-size:21px;color:#7e8e72;margin-top:65px">独立部署　/　中文游戏库　/　浏览器游玩</p></div></body></html>`);
  mark('intro');await page.waitForTimeout(4500);
  await page.goto(base+'/library/');
  await page.waitForFunction(()=>document.querySelectorAll('.card').length>0);
  await page.waitForTimeout(500);
  mark('library');await caption('你的收藏，一眼就能找到。','真实界面录制 · 作者本地收藏演示，部署包不含 ROM');
  await page.waitForTimeout(5500);
  await page.locator('.collection').scrollIntoViewIfNeeded();
  await page.mouse.wheel(0,410);await page.waitForTimeout(3000);
  await page.evaluate(()=>scrollTo({top:0,behavior:'smooth'}));await page.waitForTimeout(700);
  await page.locator('#search').pressSequentially('恐龙',{delay:350});
  mark('search');await caption('中文名、拼音、ROM 文件名，都能搜。','分类 · 收藏 · 最近游玩，留在自己的浏览器');
  await page.waitForTimeout(3000);
  await page.locator('.cover').first().click();
  await caption('选一个核心，准备开场。','ROM 需匹配核心版本，支持情况以实测为准');
  await page.waitForTimeout(4000);
  await page.locator('#save').click();
  await page.locator('#play').click();
  await page.locator('.ejs_start_button').waitFor({timeout:30000});
  await page.locator('.ejs_start_button').click();
  mark('loading');
  await page.waitForTimeout(17000);
  await page.keyboard.press('ArrowLeft');await page.keyboard.press('ArrowRight');
  await page.keyboard.press('o');await page.keyboard.press('k');
  await page.waitForTimeout(7000);
  await page.keyboard.down('v');await page.waitForTimeout(300);await page.keyboard.up('v');
  await page.waitForTimeout(600);
  await page.keyboard.down('Enter');await page.waitForTimeout(300);await page.keyboard.up('Enter');
  mark('gameplay');await caption('运算在浏览器，NAS 提供文件。','恐龙新世纪 · MAME 2003 Plus · 核心与 ROM 均由本地服务加载');
  await page.waitForTimeout(5000);
  await page.keyboard.down('Enter');await page.waitForTimeout(300);await page.keyboard.up('Enter');
  await page.keyboard.down('ArrowRight');await page.keyboard.down('x');
  await page.waitForTimeout(2200);await page.keyboard.up('ArrowRight');await page.keyboard.up('x');
  await page.screenshot({path:'test-results/promo-game.png'});
  await page.goto(base+'/help.html');
  mark('deploy');await caption('一个 Compose 项目，就能独立部署。','源码与教程公开 · 无需续映账号 · 游戏目录只读挂载');
  await page.waitForTimeout(5000);
  await page.setContent(require('./outro.cjs'));
  mark('outro');await page.waitForTimeout(6500);
  const video=page.video();
  await context.close();
  const file=await video.path();
  fs.writeFileSync('dist/recording/timeline.json',JSON.stringify({file,cuts,duration:(Date.now()-start)/1000},null,2));
  console.log(JSON.stringify({file,cuts}));
  await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
