import { initStudio } from './studio.js';
import { initFooter } from './footer.js';
import { initVideoGallery } from './gallery.js';

initFooter();
const videoGallery=initVideoGallery();

const $ = (selector, root=document) => root.querySelector(selector);
const $$ = (selector, root=document) => [...root.querySelectorAll(selector)];
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
let motionPaused = reduceMotion.matches;
try { motionPaused = reduceMotion.matches || localStorage.getItem('hollowick-motion') === 'paused'; } catch {}
const heroVideo = $('#hero-video');
const motionToggle = $('#motion-toggle');
let heroVisible = true;

function syncVideo() {
  const backgroundPaused=motionPaused || document.hidden || !!document.querySelector('dialog[open]');
  if (backgroundPaused || !heroVisible) heroVideo.pause();
  else heroVideo.play().catch(() => {});
  videoGallery.sync({paused:backgroundPaused});
}
function setMotion(paused, persist=false) {
  motionPaused = paused;
  document.body.classList.toggle('motion-paused', paused);
  document.documentElement.classList.toggle('js-motion', !paused);
  motionToggle.setAttribute('aria-pressed', String(paused));
  motionToggle.setAttribute('aria-label', paused ? 'Play motion' : 'Pause motion');
  $('.motion-label',motionToggle).textContent = paused ? 'Motion off' : 'Motion on';
  if (persist) { try { localStorage.setItem('hollowick-motion', paused ? 'paused' : 'playing'); } catch {} }
  syncVideo();
  scheduleScroll();
}
motionToggle.addEventListener('click',()=>setMotion(!motionPaused,true));
reduceMotion.addEventListener('change',event=>setMotion(event.matches));
document.addEventListener('visibilitychange',syncVideo);
document.addEventListener('hollowick:dialog-change',syncVideo);

const header = $('#site-header');
const menuToggle = $('.menu-toggle');
const mobileMenu = $('#mobile-menu');
function closeMenu() { menuToggle.setAttribute('aria-expanded','false'); menuToggle.setAttribute('aria-label','Open menu'); mobileMenu.hidden=true; }
menuToggle.addEventListener('click',()=>{
  const open=mobileMenu.hidden;
  mobileMenu.hidden=!open;
  menuToggle.setAttribute('aria-expanded',String(open));
  menuToggle.setAttribute('aria-label',open?'Close menu':'Open menu');
});
mobileMenu.addEventListener('click',event=>{if(event.target.closest('a,button'))closeMenu();});
document.addEventListener('keydown',event=>{if(event.key==='Escape' && !mobileMenu.hidden){closeMenu();menuToggle.focus();}});
window.addEventListener('resize',()=>{if(window.innerWidth>800)closeMenu();scheduleScroll();},{passive:true});

const reveals = $$('.reveal');
const revealObserver = new IntersectionObserver(entries=>{
  for(const entry of entries)if(entry.isIntersecting){entry.target.classList.add('is-visible');revealObserver.unobserve(entry.target);}
},{threshold:.1,rootMargin:'0px 0px -15px 0px'});
reveals.forEach(element=>revealObserver.observe(element));
new IntersectionObserver(([entry])=>{heroVisible=entry.isIntersecting;syncVideo();},{threshold:0}).observe($('.hero'));

const modelData = {
  veo:{name:'Veo 3.1',image:'/media/dunes.jpg',alt:'Sculptural desert dunes in warm sunlight',title:'Make the unreal<br>feel <em>real.</em>',note:'THE ART OF POSSIBILITY',preset:'dunes'},
  runway:{name:'Gen-4.5',image:'/media/portrait.jpg',alt:'A cinematic portrait in golden evening light',title:'A feeling.<br>A <em>whole story.</em>',note:'A NEW WAY TO SEE',preset:'portrait'},
  kling:{name:'Kling 3.0',image:'/media/ocean.jpg',alt:'Teal ocean surf and textured waves',title:'Follow your<br><em>own rhythm.</em>',note:'IDEAS IN MOTION',preset:'ocean'},
  luma:{name:'Ray3',image:'/media/architecture.jpg',alt:'A sculptural concrete space with dramatic light',title:'A world beyond<br><em>the expected.</em>',note:'CHANGE YOUR PERSPECTIVE',preset:'architecture'}
};
const modelTabs = $$('[data-model-tab]');
function selectModel(key, focus=false) {
  const model=modelData[key];
  if(!model)return;
  modelTabs.forEach(tab=>{
    const selected=tab.dataset.modelTab===key;
    tab.classList.toggle('active',selected);
    tab.setAttribute('aria-selected',String(selected));
    tab.tabIndex=selected?0:-1;
    if(selected&&focus)tab.focus();
  });
  const image=$('#model-image');
  image.src=model.image;image.alt=model.alt;
  image.classList.remove('changing');
  void image.offsetWidth;
  if(!motionPaused)image.classList.add('changing');
  $('#model-preview').setAttribute('aria-labelledby',`model-${key}`);
  $('#preview-title').innerHTML=model.title;
  $('#preview-note').textContent=model.note;
  const button=$('#model-try');
  button.dataset.model=model.name;
  button.dataset.preset=model.preset;
  button.setAttribute('aria-label',`Explore ${model.name} in the studio`);
}
modelTabs.forEach((tab,index)=>{
  tab.addEventListener('click',()=>selectModel(tab.dataset.modelTab));
  tab.addEventListener('keydown',event=>{
    let next=index;
    if(['ArrowDown','ArrowRight'].includes(event.key))next=(index+1)%modelTabs.length;
    else if(['ArrowUp','ArrowLeft'].includes(event.key))next=(index-1+modelTabs.length)%modelTabs.length;
    else if(event.key==='Home')next=0;
    else if(event.key==='End')next=modelTabs.length-1;
    else return;
    event.preventDefault();selectModel(modelTabs[next].dataset.modelTab,true);
  });
});

const managedDialogs=$$('#about-dialog');
const dialogOpeners=new WeakMap();
function openDialog(dialog,opener) {
  dialogOpeners.set(dialog,opener||document.activeElement);
  dialog.showModal();document.body.classList.add('dialog-open');syncVideo();
}
managedDialogs.forEach(dialog=>{
  $('.dialog-close',dialog).addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',event=>{
    if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}
  });
  dialog.addEventListener('close',()=>{
    document.body.classList.remove('dialog-open');
    const opener=dialogOpeners.get(dialog);if(opener instanceof HTMLElement)opener.focus({preventScroll:true});
    syncVideo();
  });
});
$('#about-preview').addEventListener('click',event=>openDialog($('#about-dialog'),event.currentTarget));

// Close a gallery dialog before the delegated studio handler opens its modal.
document.addEventListener('click',event=>{
  if(event.target.closest('[data-open-studio]')){
    $$('dialog[open]:not(#hollowick-studio)').forEach(dialog=>dialog.close());
    document.body.classList.remove('dialog-open');closeMenu();heroVideo.pause();
  }
},true);
initStudio();
$$('svg').forEach(element=>element.setAttribute('aria-hidden','true'));
const narrowLayout=window.matchMedia('(max-width: 800px)');
function syncTabOrientation(){ $('.model-tabs').setAttribute('aria-orientation',narrowLayout.matches?'horizontal':'vertical'); }
narrowLayout.addEventListener('change',syncTabOrientation);
syncTabOrientation();
const studioDialog=$('#hollowick-studio');
studioDialog.addEventListener('close',syncVideo);
const dialogObserver=new MutationObserver(syncVideo);
$$('dialog').forEach(dialog=>dialogObserver.observe(dialog,{attributes:true,attributeFilter:['open']}));

const heroMedia=$('.hero-media');
const heroTitle=$('#hero-title');
const manifesto=$('.manifesto');
const litWords=$$('.manifesto-text span');
const orbit=$('.manifesto-orbit');
const ctaOrbit=$('.cta-orbit');
const workflowSteps=$$('.workflow-step');
let scrollScheduled=false;
function scheduleScroll(){if(scrollScheduled)return;scrollScheduled=true;requestAnimationFrame(updateScroll);}
function updateScroll(){
  scrollScheduled=false;
  const y=window.scrollY;
  const vh=window.innerHeight;
  header.classList.toggle('scrolled',y>150);
  const pastHero=$('.hero').getBoundingClientRect().bottom<=header.offsetHeight;
  document.body.classList.toggle('past-hero',pastHero);
  $('.nav-studio').toggleAttribute('inert',!pastHero);
  if(!motionPaused){
    if(y<vh*1.3){const progress=Math.min(y/vh,1);heroMedia.style.transform=`translateY(${y*.25}px) scale(${1+progress*.075})`;heroTitle.style.transform=`translateY(${y*.12}px)`;heroTitle.style.opacity=String(1-progress*.5);}
    const rect=manifesto.getBoundingClientRect();
    const progress=Math.max(0,Math.min(1,(vh-rect.top)/(vh+rect.height)));
    litWords.forEach((word,index)=>word.classList.toggle('lit',progress>.28+index*.13));
    orbit.style.transform=`rotate(${-15+progress*65}deg)`;
    const ctaRect=$('.final-cta').getBoundingClientRect();
    if(ctaRect.top<vh&&ctaRect.bottom>0)ctaOrbit.style.transform=`rotate(${(vh-ctaRect.top)*.045}deg)`;
  }else{heroTitle.style.transform='';heroTitle.style.opacity='';}
  let current='01';
  workflowSteps.forEach(step=>{if(step.getBoundingClientRect().top<vh*.55)current=step.dataset.step;});
  $('#workflow-current').textContent=current;
}
window.addEventListener('scroll',scheduleScroll,{passive:true});
setMotion(motionPaused);
$('#year').textContent=new Date().getFullYear();
