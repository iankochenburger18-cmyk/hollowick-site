import { initStudioNavigation } from './studio.js';
import { initFooter } from './footer.js';

initFooter();
initStudioNavigation();

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

// Header scroll treatment — mirrors main.js's homepage behavior (solid
// background + blur past 150px) without the hero-parallax logic that
// depends on homepage-only elements.
const header = $('#site-header');
function updateScroll() { header.classList.toggle('scrolled', window.scrollY > 150); }
window.addEventListener('scroll', updateScroll, { passive: true });
updateScroll();

// Mobile menu toggle — same behavior as main.js.
const menuToggle = $('.menu-toggle');
const mobileMenu = $('#mobile-menu');
function closeMenu() { menuToggle.setAttribute('aria-expanded', 'false'); menuToggle.setAttribute('aria-label', 'Open menu'); mobileMenu.hidden = true; }
menuToggle.addEventListener('click', () => {
  const open = mobileMenu.hidden;
  mobileMenu.hidden = !open;
  menuToggle.setAttribute('aria-expanded', String(open));
  menuToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
});
mobileMenu.addEventListener('click', event => { if (event.target.closest('a,button')) closeMenu(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape' && !mobileMenu.hidden) { closeMenu(); menuToggle.focus(); } });
window.addEventListener('resize', () => { if (window.innerWidth > 800) closeMenu(); }, { passive: true });

// Scroll-reveal — same IntersectionObserver pattern used sitewide.
const revealObserver = new IntersectionObserver(entries => {
  for (const entry of entries) if (entry.isIntersecting) { entry.target.classList.add('is-visible'); revealObserver.unobserve(entry.target); }
}, { threshold: .1, rootMargin: '0px 0px -15px 0px' });
$$('.reveal').forEach(element => revealObserver.observe(element));

$$('svg').forEach(element => element.setAttribute('aria-hidden', 'true'));
