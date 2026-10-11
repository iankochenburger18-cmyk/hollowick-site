import { initStudioNavigation } from './studio.js';
import { initFooter } from './footer.js';
import { getBillingStatus, startCheckout, startPortal } from './api.js';

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

// ---- Plan cards: what each one's button does depends on who's asking ----
// (signed out, on a free trial, or already on one of the four paid tiers).
const PLAN_TIERS = ['STARTER', 'CREATOR', 'PRO', 'STUDIO'];
const ctaStatus = $('#pricing-cta-status');

function setCtaStatus(message, error = false) {
  if (!ctaStatus) return;
  ctaStatus.textContent = message || '';
  ctaStatus.classList.toggle('pricing-cta-status--error', error);
}

function setButtonLabel(button, label) {
  const labelSpan = button.querySelector('.pricing-cta-label');
  if (labelSpan) labelSpan.textContent = label;
}

// Runs a checkout/portal action from a button click: disables the button,
// swaps its label while redirecting, and restores it with an error message
// if the backend call itself fails (the browser never actually leaves the
// page in that case, so the button has to recover).
async function runBillingAction(button, action) {
  const original = button.querySelector('.pricing-cta-label')?.textContent;
  button.disabled = true;
  setButtonLabel(button, 'Redirecting…');
  setCtaStatus('');
  try {
    const url = await action();
    window.location.href = url;
  } catch (error) {
    button.disabled = false;
    if (original) setButtonLabel(button, original);
    setCtaStatus(error.message || 'Something went wrong — try again in a moment.', true);
  }
}

async function initPricingCards() {
  const buttons = $$('[data-plan-cta]');
  if (buttons.length === 0) return;

  let status;
  try {
    status = await getBillingStatus();
  } catch {
    status = { signedIn: false };
  }

  for (const button of buttons) {
    const tier = PLAN_TIERS.find(value => value === button.dataset.planCta);
    if (!tier) continue;
    button.disabled = false;

    if (!status.signedIn) {
      // Not signed in yet — there's no account to attach a Checkout session
      // or a Billing Portal session to, so send them to sign in (or create
      // an account) first, carrying which plan they picked so signin.js can
      // resume straight into Checkout once that succeeds.
      button.addEventListener('click', event => {
        event.preventDefault();
        window.location.assign(`/signin/?plan=${tier}`);
      });
      continue;
    }

    if (status.isPaidTier && status.active) {
      // Already paying for something real — route to the Billing Portal
      // instead of starting a second Checkout session, which would create a
      // duplicate subscription rather than replacing the existing one. The
      // card matching their current plan reads "Cancel plan"; every other
      // card reads "Switch to this plan" — both land in the same portal,
      // where Stripe's own hosted UI handles cancelling or changing tiers.
      setButtonLabel(button, tier === status.tier ? 'Cancel plan' : 'Switch to this plan');
      button.addEventListener('click', event => {
        event.preventDefault();
        runBillingAction(button, startPortal);
      });
      continue;
    }

    // Signed in, but nothing active to manage yet — a free trial (expired
    // or not), or a paid plan that's lapsed/been cancelled. Either way
    // there's no live subscription to switch or cancel, only one to start,
    // so every card goes straight to Checkout for its own tier.
    button.addEventListener('click', event => {
      event.preventDefault();
      runBillingAction(button, () => startCheckout(tier));
    });
  }
}

initPricingCards();
