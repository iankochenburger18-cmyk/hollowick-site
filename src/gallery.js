const films = [
  {id:'neon-fashion', title:'After hours.', category:'people', shape:'tall', preset:'portrait', model:'Gen-4.5', prompt:'A fashion portrait under neon light. A woman sits on the hood of a vintage sports car, lost in thought. The camera slowly moves closer. Rich shadows, electric color, a quiet midnight atmosphere.'},
  {id:'ink', title:'Liquid dreams.', category:'abstract', shape:'short', preset:'ocean', model:'Kling 3.0', prompt:'Vivid clouds of colored ink bloom through clear water in slow motion. Tendrils unfold like a living sculpture. Macro detail, fluid motion, rich colors against a clean background.'},
  {id:'golden-portrait', title:'Golden state.', category:'people', shape:'tall', preset:'portrait', model:'Gen-4.5', prompt:'An intimate portrait in golden light. A fleeting look, a delicate movement, the feeling of a moment that will never happen again. Soft focus, warm tones, subtle film texture.'},
  {id:'city-drone', title:'The city is alive.', category:'worlds', shape:'tall', preset:'architecture', model:'Veo 3.1', prompt:'An aerial journey above a city at dusk. Streets trace luminous patterns between towers. The camera glides forward, revealing the scale and energy of a world in constant motion.'},
  {id:'dancer', title:'Move in color.', category:'people', shape:'tall', preset:'portrait', model:'Kling 3.0', prompt:'A dancer moves through waves of colored light. Every gesture leaves an impression. Expressive choreography, bold lighting, dynamic camera movement, a vivid experimental music film.'},
  {id:'waterfall', title:'Somewhere wild.', category:'nature', shape:'tall', preset:'dunes', model:'Veo 3.1', prompt:'A hidden waterfall deep in a lush green forest. Mist catches the sunlight while water tumbles over dark stone. Slow, immersive camera movement and extraordinary natural detail.'},
  {id:'architecture', title:'A different angle.', category:'worlds', shape:'short', preset:'architecture', model:'Ray3', prompt:'Look up into an unexpected architectural world. Curved buildings and geometric lines fill a wide-angle frame as the camera turns. An everyday place becomes something extraordinary.'},
  {id:'coast', title:'Out of the ordinary.', category:'nature', shape:'medium', preset:'ocean', model:'Veo 3.1', prompt:'A cinematic aerial passage along a rugged coastline. Deep blue waves crash into jagged rock and dissolve into white foam. A quiet, sweeping sense of scale. Natural light, rich ocean textures.'},
  {id:'western', title:'A character unfolds.', category:'people', shape:'tall', preset:'portrait', model:'Gen-4.5', prompt:'A character portrait with a western sensibility. A solitary figure, textured clothing, a compelling expression. Warm cinematic light, a slow camera push, a story that feels just about to begin.'},
];

const arrow = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 18 18 6M6 6h12v12" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>';

export function initVideoGallery() {
  const wall = document.querySelector('#video-wall');
  if(!wall) return {sync(){}};
  let paused=false;
  let opener=null;
  let filter='all';
  const visible=new WeakMap();
  const cards=[];
  const notify=()=>document.dispatchEvent(new CustomEvent('hollowick:dialog-change'));

  for(const film of films){
    const card=document.createElement('button');
    card.type='button';
    card.className=`video-card video-card--${film.shape}`;
    card.dataset.film=film.id;
    card.dataset.category=film.category;
    card.setAttribute('aria-label',`Watch ${film.title}`);
    card.innerHTML=`<video class="example-video" muted loop playsinline preload="none" poster="/media/examples/${film.id}.jpg" aria-hidden="true" tabindex="-1"></video><span class="video-card-shade"></span><span class="video-card-corner">${arrow}</span><span class="video-card-overlay"><span class="video-card-title">${film.title}</span><span class="video-card-cta">Explore scene ${arrow}</span></span><span class="video-card-category">${film.category}</span>`;
    const video=card.querySelector('video');
    video.muted=true;
    video.dataset.src=`/media/examples/${film.id}.mp4`;
    video.addEventListener('error',()=>card.classList.add('video-unavailable'));
    card.addEventListener('click',()=>openFilm(film,card));
    wall.append(card);
    cards.push(card);
  }

  const dialog=document.createElement('dialog');
  dialog.id='video-viewer';
  dialog.className='video-viewer';
  dialog.setAttribute('aria-labelledby','video-viewer-title');
  dialog.innerHTML=`<button class="video-viewer-close" type="button" aria-label="Close video"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6" fill="none" stroke="currentColor" stroke-width="1.5"/></svg></button><div class="video-viewer-stage"><video id="example-player" controls playsinline muted preload="metadata"></video></div><div class="video-viewer-copy"><span class="video-viewer-eyebrow">A STARTING POINT FOR YOUR NEXT IDEA</span><h2 id="video-viewer-title"></h2><p id="video-viewer-prompt"></p><button class="button button-lime" id="video-use-idea" data-open-studio>Use this idea ${arrow}</button><span class="video-viewer-credit">Curated stock footage · Visual reference</span></div>`;
  document.body.append(dialog);
  const player=dialog.querySelector('video');

  function openFilm(film,card){
    opener=card;
    player.src=`/media/examples/${film.id}.mp4`;
    player.poster=`/media/examples/${film.id}.jpg`;
    player.setAttribute('aria-label',film.title);
    dialog.querySelector('h2').textContent=film.title;
    dialog.querySelector('#video-viewer-prompt').textContent=film.prompt;
    const cta=dialog.querySelector('[data-open-studio]');
    cta.dataset.prompt=film.prompt;cta.dataset.model=film.model;cta.dataset.preset=film.preset;
    dialog.showModal();
    notify();
    player.play().catch(()=>{});
  }

  let backdropDown=false;
  const outside=event=>{const r=dialog.getBoundingClientRect();return event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom;};
  dialog.querySelector('.video-viewer-close').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('pointerdown',event=>{backdropDown=event.target===dialog&&outside(event);});
  dialog.addEventListener('click',event=>{if(backdropDown&&event.target===dialog&&outside(event))dialog.close();backdropDown=false;});
  dialog.addEventListener('close',()=>{
    player.pause();player.removeAttribute('src');player.load();
    if(!document.querySelector('dialog[open]')&&opener?.isConnected&&!opener.hidden)opener.focus({preventScroll:true});
    notify();
  });

  function updatePlayback(card){
    const video=card.querySelector('video');
    if(paused||card.hidden||!visible.get(card)||document.hidden){video.pause();return;}
    if(!video.hasAttribute('src'))video.src=video.dataset.src;
    video.play().catch(()=>{});
  }
  const playbackObserver=new IntersectionObserver(entries=>{
    entries.forEach(entry=>{visible.set(entry.target,entry.isIntersecting);updatePlayback(entry.target);});
  },{threshold:.08});
  cards.forEach(card=>playbackObserver.observe(card));

  function syncColumns(){
    const count=cards.filter(card=>!card.hidden).length;
    const columns=window.innerWidth>=1180?5:window.innerWidth>=900?4:window.innerWidth>=650?3:2;
    wall.style.columnCount=String(Math.min(columns,Math.max(count,1)));
    wall.classList.toggle('is-filtered',filter!=='all');
  }
  document.querySelectorAll('[data-video-filter]').forEach(button=>button.addEventListener('click',()=>{
    filter=button.dataset.videoFilter;
    document.querySelectorAll('[data-video-filter]').forEach(item=>{
      item.classList.toggle('active',item===button);item.setAttribute('aria-pressed',String(item===button));
    });
    cards.forEach(card=>{card.hidden=filter!=='all'&&card.dataset.category!==filter;updatePlayback(card);});
    syncColumns();
  }));
  window.addEventListener('resize',syncColumns,{passive:true});
  syncColumns();
  return {sync(options={}){paused=Boolean(options.paused);cards.forEach(updatePlayback);}};
}
