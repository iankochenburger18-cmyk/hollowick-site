import { initStudioNavigation } from './studio.js';
import { initFooter } from './footer.js';
import { registerAccount, signIn as apiSignIn, getSession, startCheckout } from './api.js';

initFooter();
initStudioNavigation();

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

// Header scroll treatment — mirrors main.js/pricing.js's homepage behavior
// (solid background + blur past 150px).
const header = $('#site-header');
function updateScroll() { header.classList.toggle('scrolled', window.scrollY > 150); }
window.addEventListener('scroll', updateScroll, { passive: true });
updateScroll();

// Mobile menu toggle — same behavior as main.js/pricing.js.
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

$$('svg').forEach(element => element.setAttribute('aria-hidden', 'true'));

// ---- The plan this visit is for, carried over from the pricing page ----
// (pricing.js sends signed-out clicks to /signin/?plan=STARTER, etc.). Absent
// entirely for anyone who reached /signin/ some other way.
const PLAN_TIERS = ['STARTER', 'CREATOR', 'PRO', 'STUDIO'];
const PLAN_LABELS = { STARTER: 'Starter', CREATOR: 'Creator', PRO: 'Pro', STUDIO: 'Studio' };
const params = new URLSearchParams(window.location.search);
const planParam = PLAN_TIERS.find(tier => tier === params.get('plan'));

const emphasis = $('[data-signin-emphasis]');
const sub = $('[data-signin-sub]');
if (planParam) {
  emphasis.textContent = `choose ${PLAN_LABELS[planParam]}.`;
  sub.textContent = `Sign in, or create an account, to continue to checkout for the ${PLAN_LABELS[planParam]} plan.`;
} else {
  emphasis.textContent = 'create.';
  sub.textContent = 'Sign in, or create an account, to continue.';
}

const form = $('[data-signin-form]');
const emailInput = $('#signin-email');
const passwordInput = $('#signin-password');
const status = $('[data-signin-status]');
const signinButton = $('[data-signin-action="signin"]');
const signupButton = $('[data-signin-action="signup"]');

function setStatus(message, error = false) {
  status.textContent = message || '';
  status.classList.toggle('signin-status--error', error);
}

// Where a successful sign-in/sign-up sends the browser next: straight into
// Stripe Checkout for the plan that was picked on the pricing page, or into
// the studio if there wasn't one.
async function continueAfterAuth() {
  if (!planParam) { window.location.assign('/studio/'); return; }
  setStatus('Redirecting to checkout…');
  const url = await startCheckout(planParam);
  window.location.href = url;
}

async function handleAuth(action, button, other) {
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  if (!email || password.length < 8) { setStatus('Enter an email and a password of at least 8 characters.', true); return; }
  button.disabled = true;
  other.disabled = true;
  setStatus(action === 'signup' ? 'Creating your account…' : 'Signing in…');
  try {
    if (action === 'signup') await registerAccount(email, password);
    await apiSignIn(email, password);
    await continueAfterAuth();
    // Left disabled: the browser is navigating away.
  } catch (error) {
    setStatus(error.message || 'Something went wrong — try again in a moment.', true);
    button.disabled = false;
    other.disabled = false;
  }
}

form.addEventListener('submit', event => event.preventDefault());
signinButton.addEventListener('click', () => handleAuth('signin', signinButton, signupButton));
signupButton.addEventListener('click', () => handleAuth('signup', signupButton, signinButton));

// Already signed in (e.g. a bookmark, or the back button after checking
// out) — there's nothing for this page to do, so continue on immediately.
getSession().then(session => { if (session?.user) continueAfterAuth(); }).catch(() => {});
