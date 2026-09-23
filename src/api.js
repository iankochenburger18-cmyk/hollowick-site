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
  const csrfToken = await getCsrfToken();
  await apiFetch('/api/auth/callback/credentials?json=true', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email, password, csrfToken }).toString(),
  });
  // Auth.js answers the credentials callback with a redirect either way;
  // the only reliable signal is whether a session now exists.
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

export async function requestGeneration({ prompt, duration, aspectRatio }) {
  const response = await apiFetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, duration, aspectRatio }),
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
