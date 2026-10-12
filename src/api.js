// Thin client for the Hollowick backend API (accounts + real video generation).
// The backend is a separate Next.js app deployed at api.hollowick.app; every
// request needs credentials: 'include' so its session cookie (scoped to
// .hollowick.app) is sent and stored.
const API_BASE = 'https://api.hollowick.app';

function apiFetch(path, options = {}) {
  return fetch(`${API_BASE}${path}`, { credentials: 'include', ...options });
}

async function readJSON(response) {
  try { return await response.json(); }
  catch { return null; }
}

export async function registerAccount(email, password) {
  const response = await apiFetch('/api/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await readJSON(response);
  if (!response.ok) {
    if (response.status === 409) throw new Error('An account with that email already exists.');
    throw new Error(data?.error || 'Could not create your account.');
  }
  return data;
}

async function getCsrfToken() {
  const response = await apiFetch('/api/auth/csrf');
  const data = await readJSON(response);
  if (!data?.csrfToken) throw new Error('Could not reach the sign-in service.');
  return data.csrfToken;
}

export async function signIn(email, password) {
  // Clear any existing session first. Without this, a sign-in attempt that
  // actually fails (wrong password, account no longer exists under this
  // session's old id, etc.) can still leave a *previous* valid session
  // cookie sitting in the browser — and since the only success signal below
  // is "does a session exist afterward", that stale leftover session reads
  // as a successful sign-in even though this attempt did nothing. Starting
  // from a clean slate means a failed attempt reliably leaves no session.
  await signOut();
  const csrfToken = await getCsrfToken();
  await apiFetch('/api/auth/callback/credentials?json=true', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email, password, csrfToken }).toString(),
    // Auth.js answers this with a redirect (even with ?json=true). We must not
    // let the browser follow it: the redirect target isn't covered by the
    // backend's /api/* CORS headers, so a followed redirect gets blocked as a
    // cross-origin read and throws "NetworkError when attempting to fetch
    // resource" even though sign-in itself succeeded. 'manual' stops the
    // browser at the (unreadable, and here unneeded) redirect response.
    redirect: 'manual',
  });
  // The only reliable success signal is whether a session now exists.
  const session = await getSession();
  if (!session?.user) throw new Error('Incorrect email or password.');
  return session;
}

export async function signOut() {
  try {
    const csrfToken = await getCsrfToken();
    await apiFetch('/api/auth/signout?json=true', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ csrfToken }).toString(),
      redirect: 'manual', // same redirect-follow issue as signIn() above
    });
  } catch {
    // Treat the session as ended locally even if the request itself failed.
  }
}

export async function getSession() {
  const response = await apiFetch('/api/auth/session');
  if (!response.ok) return null;
  return readJSON(response);
}

export async function requestGeneration({ prompt, duration, aspectRatio, model, videoUrl, imageUrls, imageUrl }) {
  const response = await apiFetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, duration, aspectRatio, model, videoUrl, imageUrls, imageUrl }),
  });
  const data = await readJSON(response);
  if (response.status === 401) throw new Error('Sign in to generate a real video.');
  if (!response.ok) throw new Error(data?.error || 'Could not start your video generation.');
  return data;
}

export async function listGenerations() {
  const response = await apiFetch('/api/generations');
  if (!response.ok) return [];
  const data = await readJSON(response);
  return Array.isArray(data?.jobs) ? data.jobs : [];
}

export async function getGeneration(id) {
  const response = await apiFetch(`/api/generations/${encodeURIComponent(id)}`);
  const data = await readJSON(response);
  if (!response.ok) throw new Error(data?.error || 'Could not check on that generation.');
  return data;
}

// Starts a real Stripe Checkout session for the given paid tier ('STARTER' |
// 'CREATOR' | 'PRO' | 'STUDIO') and returns the URL to redirect the browser
// to. Requires a signed-in session — the backend returns 401 otherwise, same
// as requestGeneration() above. Only for an account with no active paid
// subscription yet (a trial, or a lapsed one) — see getBillingStatus().
export async function startCheckout(tier) {
  const response = await apiFetch('/api/billing/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tier }),
  });
  const data = await readJSON(response);
  if (response.status === 401) throw new Error('Sign in to choose a plan.');
  if (!response.ok || !data?.url) throw new Error(data?.error || 'Could not start checkout.');
  return data.url;
}

// Tells the caller whether anyone's signed in and, if so, what plan tier
// they're on and whether it's currently active — used by the pricing page
// to decide what each plan card's button should do (see pricing.js).
export async function getBillingStatus() {
  const response = await apiFetch('/api/billing/status');
  if (!response.ok) return { signedIn: false };
  return readJSON(response) ?? { signedIn: false };
}

// Starts a Stripe Billing Portal session for an account that already has an
// active paid subscription (cancelling or switching tiers) and returns the
// URL to redirect to. Using this instead of startCheckout() again is what
// avoids creating a second, parallel subscription for someone who already
// has one.
export async function startPortal() {
  const response = await apiFetch('/api/billing/portal', { method: 'POST' });
  const data = await readJSON(response);
  if (response.status === 401) throw new Error('Sign in first.');
  if (!response.ok || !data?.url) throw new Error(data?.error || 'Could not open billing settings.');
  return data.url;
}
