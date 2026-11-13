/* Recent games on the home page. Full states are loaded only after launch. */
(() => {
  'use strict';
  const section=document.querySelector('#homeRecent');if(!section)return;
  const grid=section.querySelector('.recent-grid'),hero=document.querySelector('.hero');
  const base=location.pathname.startsWith('/arcade/')?'/arcade':'';
  const assetURL=src=>src?.startsWith('/')&&!src.startsWith('/arcade/')?base+src:src;
  const make=(tag,cls,text)=>{const node=document.createElement(tag);node.className=cls;if(text!==undefined)node.textContent=text;return node;};
  let signature='',generation=0,current;
  function render({games,recent,visible,onLaunch,onDetail,onAll},force=false){
    current={games,recent,visible,onLaunch,onDetail,onAll};
    const byId=new Map(games.map(g=>[g.id,g]));
    const list=[...new Set(recent)].map(id=>byId.get(id)).filter(Boolean).slice(0,4);
    section.hidden=!visible||!list.length;hero.classList.toggle('hero-compact',!section.hidden);
    const next=JSON.stringify([list.map(g=>[g.id,g.rom,g.core]),ArcadePreferences.get().resume]);
    if(!force&&next===signature)return;signature=next;const request=++generation;
    grid.replaceChildren();section.querySelector('#homeRecentAll').onclick=onAll;
    for(const game of list){
      const card=make('article','recent-card'),image=make('div','recent-image'),title=make('h3','',game.title);
      const fallback=()=>{image.replaceChildren();if(game.cover){const cover=make('img','');cover.src=assetURL(game.cover);cover.alt='';cover.loading='lazy';cover.onerror=()=>image.replaceChildren(make('span','recent-placeholder','再来一局'));image.append(cover);}else image.append(make('span','recent-placeholder','再来一局'));};fallback();
      const note=make('p','recent-status','正在检查存档…'),actions=make('div','recent-actions');
      const play=make('a','primary recent-play','开始游戏'),details=make('button','recent-details','详情');
      play.dataset.gameId=details.dataset.gameId=game.id;
      const params=new URLSearchParams({core:game.core,src:assetURL(game.rom),bios:assetURL(game.bios||''),name:game.title,cover:assetURL(game.cover||''),aspect:game.aspect||'',resume:'new'});
      play.href=base+'/play.html?'+params;play.setAttribute('aria-label','开始游戏：'+game.title);
      play.onclick=()=>onLaunch(game,'home');details.type='button';details.setAttribute('aria-label','查看详情：'+game.title);details.onclick=()=>onDetail(game);
      actions.append(play,details);card.append(image,title,note,actions);grid.append(card);
      (async()=>{
        try{
          const point=await ArcadePreferences.resumeSummary(game.rom);
          if(request!==generation)return;
          if(!point){note.textContent='暂无存档 · 从新游戏开始';return;}
          note.textContent=ArcadePreferences.resumeLabel(point);
          const preview=ArcadePreferences.resumePreview();preview.update(point);image.replaceChildren(preview);
          if(ArcadePreferences.get().resume==='off'){note.textContent+=' · 继续入口已关闭';return;}
          params.set('core',point.core||game.core);params.set('resume','continue');params.set('point',point.selectionKey||String(point.updatedAt));
          play.href=base+'/play.html?'+params;play.textContent='继续游玩';play.setAttribute('aria-label','继续游玩：'+game.title);
        }catch{if(request===generation)note.textContent='存档暂不可用 · 可进入游戏重试';}
      })();
    }
  }
  window.ArcadeHomeRecent={render};
  window.addEventListener('focus',()=>{if(current)render(current,true);});
  window.addEventListener('arcade-preferences-changed',()=>{if(current)render(current);});
})();
