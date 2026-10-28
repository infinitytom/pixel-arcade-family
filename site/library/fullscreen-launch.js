/* Installed-app launch is fullscreen; tabs can enter it with an explicit gesture. */
(() => {
  'use strict';
  const header=document.querySelector('main>header');if(!header)return;
  const button=document.createElement('button');button.type='button';button.className='fullscreen-launch';button.textContent='进入全屏';button.title='隐藏浏览器地址栏；Esc 可退出全屏';header.append(button);
  const update=()=>{button.hidden=!!document.fullscreenElement||matchMedia('(display-mode: fullscreen)').matches;};
  button.onclick=async()=>{try{await document.documentElement.requestFullscreen();}catch{button.textContent='请按 F11 全屏';}};document.addEventListener('fullscreenchange',update);update();
  let installEvent;const install=document.createElement('button');install.type='button';install.className='fullscreen-launch';install.textContent='安装游戏厅';install.hidden=true;header.append(install);
  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installEvent=event;install.hidden=false;});
  install.onclick=async()=>{if(!installEvent)return;await installEvent.prompt();await installEvent.userChoice;installEvent=null;install.hidden=true;};
  window.addEventListener('appinstalled',()=>{install.hidden=true;});
})();
