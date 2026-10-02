import { registerAccount, signIn as apiSignIn, signOut as apiSignOut, getSession, requestGeneration, listGenerations, getGeneration } from './api.js';

const STORAGE_KEY = 'hollowick-studio-draft-v1';
const CONCEPTS_KEY = 'hollowick-studio-concepts-v1';
const MODELS = ['Veo 3.1', 'Gen-4.5', 'Kling 3.0', 'Ray3', 'Seedance 2.5', 'PixVerse v6', 'MiniMax H3 Max Turbo', 'Wan 3.0 Prime', 'Genjutsu'];
// Keep in sync with MODEL_TO_PROVIDER in the backend's
// src/lib/video-providers/index.ts — a model only belongs here once its
// provider adapter is registered there and its API key is set.
const LIVE_MODELS = ['Veo 3.1', 'Gen-4.5', 'Kling 3.0', 'Ray3', 'Seedance 2.5', 'PixVerse v6', 'MiniMax H3 Max Turbo', 'Wan 3.0 Prime', 'Genjutsu'];
// Genjutsu is a motion-transfer model — it needs a reference video URL plus
// one or more character/product image URLs, not just a text prompt. Keep in
// sync with MODEL_TO_PROVIDER in the backend's src/lib/video-providers/index.ts.
const REFERENCE_INPUT_MODELS = ['Genjutsu'];
const PRESETS = {
  dunes: {
    label: 'Desert dream',
    image: '/media/dunes.jpg',
    video: '/media/hero.mp4',
    poster: '/media/hero-poster.jpg',
    prompt: 'An otherworldly journey across sculptural desert dunes. A lone figure moves through the warm, shifting light. Slow camera movement, rich sand textures, a quiet cinematic atmosphere.',
  },
  ocean: {
    label: 'Blue hour',
    image: '/media/ocean.jpg',
    video: '/media/examples/coast.mp4',
    poster: '/media/examples/coast.jpg',
    prompt: 'An endless ocean at blue hour. The camera glides just above the water as a silver wave catches the last light. Immersive, minimal, beautifully detailed. Shot on 35mm film.',
  },
  portrait: {
    label: 'Human nature',
    image: '/media/portrait.jpg',
    video: '/media/examples/golden-portrait.mp4',
    poster: '/media/examples/golden-portrait.jpg',
    prompt: 'An intimate cinematic portrait in soft natural light. A fleeting expression, a gentle breeze, beautiful skin texture. The camera slowly draws closer. Understated, tactile, alive.',
  },
  architecture: {
    label: 'Quiet spaces',
    image: '/media/architecture.jpg',
    video: '/media/examples/architecture.mp4',
    poster: '/media/examples/architecture.jpg',
    prompt: 'A slow exploration of a sculptural concrete space. Warm sunlight falls across raw surfaces, revealing extraordinary geometry. Monolithic architecture, soft shadows, a meditative rhythm.',
  },
};

const icon = {
  close: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" stroke-width="1.5"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" stroke-width="1.5"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="1.5"/></svg>',
  up: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 19V5m-6 6 6-6 6 6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 7h7m4 0h5M4 17h3m4 0h9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="13" cy="7" r="2" stroke="currentColor" stroke-width="1.5"/><circle cx="9" cy="17" r="2" stroke="currentColor" stroke-width="1.5"/></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M5 16v5h14v-5" stroke="currentColor" stroke-width="1.5"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m5 12 4 4L19 6" stroke="currentColor" stroke-width="1.5"/></svg>',
};

function readStorage(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value ?? fallback;
  } catch { return fallback; }
}

function writeStorage(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch { return false; }
}

function validDraft(value = {}) {
  value = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const referenceType = value.referenceType === 'upload' || (typeof value.reference === 'string' && value.reference.startsWith('Uploaded reference:')) ? 'upload' : 'preset';
  const legacyName = typeof value.reference === 'string' ? value.reference.replace(/^Uploaded reference:\s*/, '').replace(/\s*\(image stays in this session only\)$/, '') : '';
  return {
    prompt: typeof value.prompt === 'string' ? value.prompt.slice(0, 1600) : '',
    model: MODELS.includes(value.model) ? value.model : MODELS[0],
    ratio: ['16:9', '9:16', '1:1'].includes(value.ratio) ? value.ratio : '16:9',
    duration: value.duration === 10 || value.duration === '10' ? '10' : '5',
    camera: ['Slow dolly in', 'Gentle orbit', 'Locked-off', 'Handheld follow'].includes(value.camera) ? value.camera : 'Slow dolly in',
    preset: typeof value.preset === 'string' && Object.hasOwn(PRESETS, value.preset) ? value.preset : 'dunes',
    referenceType,
    referenceName: referenceType === 'upload' ? (typeof value.referenceName === 'string' ? value.referenceName : legacyName).trim().slice(0, 255) || 'Your uploaded reference' : '',
    // Only meaningful for REFERENCE_INPUT_MODELS (e.g. Genjutsu) — direct,
    // publicly reachable URLs the backend forwards as-is. Unrelated to the
    // "Add reference" mood-board upload below, which never leaves the browser.
    refVideoUrl: typeof value.refVideoUrl === 'string' ? value.refVideoUrl.trim().slice(0, 2083) : '',
    refImageUrls: typeof value.refImageUrls === 'string' ? value.refImageUrls.slice(0, 4000) : '',
  };
}

function validConcept(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.id !== 'string' || !/^[a-z0-9_-]{1,128}$/i.test(value.id)) return null;
  const normalized = validDraft(value);
  if (!normalized.prompt.trim()) return null;
  const timestamp = typeof value.createdAt === 'string' && value.createdAt.length <= 40 ? Date.parse(value.createdAt) : NaN;
  return {
    id: value.id,
    ...normalized,
    prompt: normalized.prompt.trim(),
    createdAt: Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null,
    reference: normalized.referenceType === 'upload' ? `Uploaded reference: ${normalized.referenceName} (image stays in this session only)` : PRESETS[normalized.preset].label,
    type: 'Creative brief — no AI video generated',
  };
}

// Keep existing homepage entry points and carry their direction to the real page.
export function initStudioNavigation() {
  const navigate = (trigger = {}) => {
    const draft = validDraft(readStorage(STORAGE_KEY, {}));
    if (typeof trigger.prompt === 'string' && trigger.prompt.trim()) draft.prompt = trigger.prompt.slice(0, 1600);
    const model = MODELS.find(value => value.toLowerCase() === trigger.model?.toLowerCase());
    if (model) draft.model = model;
    if (Object.hasOwn(PRESETS, trigger.preset || '')) {
      draft.preset = trigger.preset;
      draft.referenceType = 'preset';
      draft.referenceName = '';
    }
    writeStorage(STORAGE_KEY, draft);
    // Session storage also allows handoff when persistent storage is unavailable.
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft)); } catch { /* Optional storage. */ }
    window.location.assign('/studio/');
  };
  document.addEventListener('click', event => {
    if (!(event.target instanceof Element)) return;
    const trigger = event.target.closest('[data-open-studio]');
    if (!trigger) return;
    event.preventDefault();
    navigate(trigger.dataset);
  });
  const heroForm = document.querySelector('#hero-prompt-form');
  heroForm?.addEventListener('submit', event => {
    event.preventDefault();
    navigate({ prompt: new FormData(heroForm).get('prompt') || '' });
  });
}

export function initStudio() {
  const studio = document.querySelector('#hollowick-studio');
  if (!studio || studio.dataset.ready) return;
  studio.dataset.ready = 'true';
  let draft = validDraft(readStorage(STORAGE_KEY, {}));
  try {
    const handoff = sessionStorage.getItem(STORAGE_KEY);
    if (handoff) draft = validDraft(JSON.parse(handoff));
    sessionStorage.removeItem(STORAGE_KEY);
  } catch { /* The current local draft remains available. */ }
  let concepts = readStorage(CONCEPTS_KEY, []);
  const seenIDs = new Set();
  concepts = Array.isArray(concepts) ? concepts.map(validConcept).filter(item => {
    if (!item || seenIDs.has(item.id)) return false;
    seenIDs.add(item.id);
    return true;
  }) : [];
  let currentConcept = null;
  let uploadURL = null;
  let pendingUpload = null;
  let session = null;
  let activeJob = null;
  let pollTimer = null;
  let pollAttempts = 0;
  studio.innerHTML = `
    <div class="hw-studio-shell">
      <header class="hw-studio-header">
        <a class="hw-studio-brand" href="/" aria-label="Hollowick home"><img class="hw-studio-brand-logo" src="/brand/hollowick-mark-chartreuse.png" width="25" height="27" alt=""/><span>hollowick <span class="hw-studio-brand-divider">/</span> <span class="hw-studio-brand-section">studio</span></span></a>
        <div class="hw-studio-header-actions"><a class="hw-studio-home" href="/#possibilities">Explore films ${icon.arrow}</a><button class="hw-studio-settings-toggle" type="button" data-hw-settings-toggle aria-expanded="false" aria-controls="hw-studio-sidebar" aria-label="Open scene settings">${icon.settings}</button></div>
      </header>
      <h1 id="hw-studio-title" class="hw-studio-visually-hidden">Hollowick video studio</h1>
      <form class="hw-studio-layout" id="hw-studio-form">
        <section class="hw-studio-workspace" aria-label="Video workspace">
        <div class="hw-studio-canvas" aria-label="Video preview">
          <div class="hw-studio-empty" data-hw-empty>
            <div class="hw-studio-empty-mark" aria-hidden="true"><img src="/brand/hollowick-mark-chartreuse.png" width="32" height="35" alt=""/></div>
            <h2>Your next <em>scene.</em></h2>
            <p>Give your imagination a little room.</p>
          </div>
          <figure class="hw-studio-result" data-hw-result hidden>
            <div class="hw-studio-image-wrap">
              <div class="hw-studio-image-frame" data-hw-frame>
                <img class="hw-studio-reference" data-hw-image alt="Desert landscape used as a concept reference" src="/media/dunes.jpg">
                <video class="hw-studio-video" data-hw-video muted loop playsinline preload="none" aria-label="Inspiration reference film"></video>
                <div class="hw-studio-reference-missing" data-hw-reference-missing hidden><span data-hw-missing-title>Reference unavailable.</span><p data-hw-missing-description>Add your image again with the plus button.</p></div>
              </div>
            </div>
            <figcaption class="hw-studio-reference-tools"><span data-hw-reference-kind>Sample film</span><span data-hw-image-ratio>16:9</span></figcaption>
          </figure>
        </div>
        <div class="hw-studio-composer-dock">
          <div class="hw-studio-attachment" data-hw-attachment hidden><img data-hw-attachment-image alt="" hidden><span data-hw-reference-name></span><button type="button" data-hw-remove-upload aria-label="Remove reference image" title="Remove reference">${icon.close}</button></div>
          <div class="hw-studio-controls">
            <button type="button" class="hw-studio-upload" data-hw-add-reference aria-label="Add reference image" title="Add reference image">${icon.plus}</button><input type="file" id="hw-studio-upload" accept="image/jpeg,image/png,image/webp,image/avif" hidden>
            <label class="hw-studio-visually-hidden" for="hw-studio-prompt">Describe your scene</label>
            <textarea id="hw-studio-prompt" name="prompt" maxlength="1600" rows="1" placeholder="Describe your scene…" aria-describedby="hw-studio-status hw-studio-disclosure" required></textarea>
            <div class="hw-studio-model-picker"><label class="hw-studio-visually-hidden" for="hw-studio-model">Video model</label><select id="hw-studio-model" name="model" aria-label="Video model">${MODELS.map(model => `<option value="${model}">${model}</option>`).join('')}</select></div>
            <button type="submit" class="hw-studio-create" data-hw-submit aria-label="Preview concept" title="Preview concept · Ctrl / ⌘ + Enter" aria-keyshortcuts="Control+Enter Meta+Enter">${icon.up}</button>
          </div>
          <div class="hw-studio-dock-foot"><p class="hw-studio-honesty" id="hw-studio-disclosure">Preview mode · sample films, no live generation.</p><p class="hw-studio-status" id="hw-studio-status" role="status" aria-live="polite" aria-atomic="true" data-hw-status></p></div>
        </div>
        </section>
        <div class="hw-studio-sidebar-backdrop" data-hw-settings-backdrop hidden></div>
        <aside class="hw-studio-sidebar" id="hw-studio-sidebar" aria-labelledby="hw-studio-settings-title" tabindex="-1">
          <div class="hw-studio-sidebar-heading"><h2 id="hw-studio-settings-title">Scene settings</h2><span class="hw-studio-sidebar-symbol" aria-hidden="true">${icon.settings}</span><button type="button" class="hw-studio-sidebar-close" data-hw-settings-close aria-label="Close scene settings">${icon.close}</button></div>
          <section class="hw-studio-account-panel" data-hw-account>
            <div class="hw-studio-account-guest" data-hw-account-guest>
              <span class="hw-studio-label">Sign in for real AI video generation</span>
              <div class="hw-studio-account-form" data-hw-auth-form>
                <input class="hw-studio-text-input" type="email" name="email" placeholder="Email" autocomplete="email">
                <input class="hw-studio-text-input" type="password" name="password" placeholder="Password" autocomplete="current-password">
                <div class="hw-studio-account-actions">
                  <button type="button" class="hw-studio-account-btn" data-hw-auth-action="signin">Sign in</button>
                  <button type="button" class="hw-studio-account-btn hw-studio-account-btn--ghost" data-hw-auth-action="signup">Create account</button>
                </div>
              </div>
            </div>
            <div class="hw-studio-account-user" data-hw-account-user hidden>
              <span class="hw-studio-label">Signed in as <strong data-hw-account-email></strong></span>
              <button type="button" class="hw-studio-account-btn hw-studio-account-btn--ghost" data-hw-signout>Sign out</button>
            </div>
            <p class="hw-studio-account-status" data-hw-account-status role="status" aria-live="polite"></p>
          </section>
          <div class="hw-studio-settings-grid">
            <fieldset class="hw-studio-fieldset"><legend class="hw-studio-label">Aspect ratio</legend><div class="hw-studio-segmented">${['16:9','9:16','1:1'].map(ratio => `<label class="hw-studio-segment"><input type="radio" name="ratio" value="${ratio}"><span><i class="hw-studio-ratio-icon hw-studio-ratio-icon--${ratio.replace(':', '-')}" aria-hidden="true"></i>${ratio}</span></label>`).join('')}</div></fieldset>
            <fieldset class="hw-studio-fieldset"><legend class="hw-studio-label">Duration</legend><div class="hw-studio-segmented hw-studio-segmented--duration">${['5','10'].map(duration => `<label class="hw-studio-segment"><input type="radio" name="duration" value="${duration}"><span>${duration}s</span></label>`).join('')}</div></fieldset>
            <div><label class="hw-studio-label" for="hw-studio-camera">Camera movement</label><select id="hw-studio-camera" name="camera"><option>Slow dolly in</option><option>Gentle orbit</option><option>Locked-off</option><option>Handheld follow</option></select></div>
          </div>
          <div class="hw-studio-genjutsu-fields" data-hw-genjutsu-fields hidden>
            <label class="hw-studio-label" for="hw-studio-ref-video">Reference video URL</label>
            <input class="hw-studio-text-input" type="url" id="hw-studio-ref-video" name="refVideoUrl" placeholder="https://…/motion-reference.mp4" maxlength="2083">
            <label class="hw-studio-label" for="hw-studio-ref-images">Character/product image URL(s)</label>
            <input class="hw-studio-text-input" type="text" id="hw-studio-ref-images" name="refImageUrls" placeholder="https://…/one.jpg, https://…/two.jpg" maxlength="4000">
            <p class="hw-studio-field-hint">Genjutsu transfers the motion from your reference video onto these images. Paste direct, publicly reachable URLs — uploads aren't hosted here yet.</p>
          </div>
          <section class="hw-studio-inspiration" aria-labelledby="hw-studio-presets-title"><h3 id="hw-studio-presets-title" class="hw-studio-label">Starting points</h3><div class="hw-studio-presets">${Object.entries(PRESETS).map(([key, preset]) => `<button type="button" class="hw-studio-preset" data-hw-preset="${key}" aria-pressed="false"><img src="${preset.image}" alt="" loading="lazy"><span>${preset.label}</span><i aria-hidden="true">${icon.check}</i></button>`).join('')}</div></section>
          <div class="hw-studio-saved" data-hw-generations-wrap hidden><label class="hw-studio-label" for="hw-studio-generations">Recent generations</label><select id="hw-studio-generations" data-hw-generations aria-label="Your recent generations"><option value="">Recent generations</option></select></div>
          <div class="hw-studio-saved" data-hw-saved-wrap hidden><label class="hw-studio-label" for="hw-studio-saved">Saved concepts</label><select id="hw-studio-saved" aria-label="Load a saved concept"><option value="">Choose a concept</option></select></div>
          <details class="hw-studio-brief-panel" data-hw-brief-panel hidden><summary>Concept details <span>${icon.plus}</span></summary><div class="hw-studio-brief" data-hw-brief></div><div class="hw-studio-secondary-actions" data-hw-export-actions hidden><button type="button" data-hw-save>Save concept</button><button type="button" data-hw-download>${icon.download}Download brief</button></div></details>
        </aside>
      </form>
    </div>`;
  const $ = selector => studio.querySelector(selector);
  const form = $('#hw-studio-form');
  const prompt = $('#hw-studio-prompt');
  const modelSelect = $('#hw-studio-model');
  const cameraSelect = $('#hw-studio-camera');
  const savedSelect = $('#hw-studio-saved');
  const generationsSelect = $('[data-hw-generations]');
  const status = $('[data-hw-status]');
  const disclosure = $('#hw-studio-disclosure');
  const submitBtn = $('[data-hw-submit]');
  const imageElement = $('[data-hw-image]');
  const videoElement = $('[data-hw-video]');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const mobileLayout = matchMedia('(max-width: 800px)');
  const sidebar = $('#hw-studio-sidebar');
  const settingsToggle = $('[data-hw-settings-toggle]');
  const genjutsuFields = $('[data-hw-genjutsu-fields]');
  const refVideoInput = $('#hw-studio-ref-video');
  const refImagesInput = $('#hw-studio-ref-images');
  const accountGuest = $('[data-hw-account-guest]');
  const accountUser = $('[data-hw-account-user]');
  const accountEmail = $('[data-hw-account-email]');
  const accountStatus = $('[data-hw-account-status]');
  const authForm = $('[data-hw-auth-form]');

  function setSidebarOpen(open, restoreFocus = true) {
    open = mobileLayout.matches && open;
    studio.dataset.settingsOpen = String(open);
    sidebar.inert = mobileLayout.matches && !open;
    $('.hw-studio-workspace').inert = open;
    $('.hw-studio-header').inert = open;
    document.querySelector('.skip-link').inert = open;
    $('[data-hw-settings-backdrop]').hidden = !open;
    settingsToggle.setAttribute('aria-expanded', String(open));
    if (open) {
      sidebar.setAttribute('role', 'dialog');
      sidebar.setAttribute('aria-modal', 'true');
      $('[data-hw-settings-close]').focus();
    } else {
      sidebar.removeAttribute('role');
      sidebar.removeAttribute('aria-modal');
      if (restoreFocus && mobileLayout.matches) settingsToggle.focus();
    }
  }
  settingsToggle.addEventListener('click', () => setSidebarOpen(true));
  $('[data-hw-settings-close]').addEventListener('click', () => setSidebarOpen(false));
  $('[data-hw-settings-backdrop]').addEventListener('click', () => setSidebarOpen(false));
  mobileLayout.addEventListener('change', () => { setSidebarOpen(false, false); updateVisualSettings(); });
  sidebar.addEventListener('keydown', event => {
    if (studio.dataset.settingsOpen !== 'true') return;
    if (event.key === 'Escape') { event.preventDefault(); setSidebarOpen(false); }
    if (event.key !== 'Tab') return;
    const focusable = [...sidebar.querySelectorAll('button:not(:disabled), select, input, summary')].filter(element => element.getClientRects().length);
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  setSidebarOpen(false, false);

  function setStatus(message, error = false) {
    status.textContent = message;
    status.classList.toggle('hw-studio-status--error', error);
  }

  function setAccountStatus(message, error = false) {
    accountStatus.textContent = message || '';
    accountStatus.classList.toggle('hw-studio-account-status--error', error);
  }

  function persistDraft() {
    writeStorage(STORAGE_KEY, draft);
  }

  function syncDraftFromForm() {
    const data = new FormData(form);
    draft = validDraft({ ...draft, prompt: data.get('prompt'), model: data.get('model'), ratio: data.get('ratio'), duration: data.get('duration'), camera: data.get('camera'), refVideoUrl: data.get('refVideoUrl'), refImageUrls: data.get('refImageUrls') });
    updateVisualSettings();
    persistDraft();
    if (currentConcept && !conceptMatchesDraft()) {
      resetConcept();
      setStatus('Changes saved. Preview when you’re ready.');
    }
  }

  function conceptMatchesDraft() {
    return currentConcept && ['model', 'ratio', 'duration', 'camera', 'preset', 'referenceType', 'referenceName'].every(key => currentConcept[key] === draft[key]) && currentConcept.prompt === draft.prompt.trim();
  }

  function updateVisualSettings() {
    prompt.style.height = '24px';
    prompt.style.height = `${Math.min(72, prompt.scrollHeight)}px`;
    $('[data-hw-image-ratio]').textContent = draft.ratio;
    $('[data-hw-frame]').dataset.ratio = draft.ratio;
    studio.querySelectorAll('[data-hw-preset]').forEach(button => button.setAttribute('aria-pressed', String(draft.referenceType === 'preset' && button.dataset.hwPreset === draft.preset)));
    genjutsuFields.hidden = !REFERENCE_INPUT_MODELS.includes(draft.model);
  }

  function showReference() {
    const preset = PRESETS[draft.preset];
    const missing = draft.referenceType === 'upload' && !uploadURL;
    const hasResult = Boolean(currentConcept) || Boolean(activeJob);
    $('[data-hw-result]').hidden = !hasResult;
    $('[data-hw-empty]').hidden = hasResult;
    imageElement.hidden = missing;
    $('[data-hw-reference-missing]').hidden = !missing;
    $('[data-hw-missing-title]').textContent = 'Add your reference again.';
    $('[data-hw-missing-description]').textContent = 'Use the plus button below to choose your image.';
    if (!missing) imageElement.src = uploadURL || preset.image;
    imageElement.alt = uploadURL ? 'Your uploaded visual reference' : `${preset.label} inspiration reference`;

    const showingLive = activeJob?.status === 'COMPLETED' && activeJob.resultUrl;
    const isFilm = draft.referenceType === 'preset';
    if (showingLive) {
      imageElement.hidden = true;
      videoElement.hidden = !hasResult;
      videoElement.loop = false;
      videoElement.muted = false;
      videoElement.controls = true;
      if (videoElement.getAttribute('src') !== activeJob.resultUrl) {
        videoElement.src = activeJob.resultUrl;
        videoElement.removeAttribute('poster');
        videoElement.setAttribute('aria-label', `${currentConcept?.model || draft.model} — your generated video`);
        videoElement.load();
      }
      $('[data-hw-reference-kind]').textContent = `${currentConcept?.model || draft.model} · your generation`;
    } else {
      videoElement.controls = false;
      videoElement.muted = true;
      videoElement.loop = true;
      videoElement.hidden = !isFilm || !hasResult;
      $('[data-hw-reference-kind]').textContent = isFilm ? `${preset.label} · sample film` : 'Your reference image';
      if (isFilm && hasResult) {
        if (videoElement.getAttribute('src') !== preset.video) {
          videoElement.src = preset.video;
          videoElement.poster = preset.poster;
          videoElement.setAttribute('aria-label', `${preset.label} — inspiration reference film`);
          videoElement.load();
        }
        if (!reducedMotion.matches && !document.hidden) videoElement.play().catch(() => {});
      } else videoElement.pause();
    }
    updateVisualSettings();
    $('[data-hw-reference-name]').textContent = `${draft.referenceName}${missing ? ' · add again' : ''}`;
    $('[data-hw-attachment]').hidden = draft.referenceType !== 'upload';
    $('[data-hw-attachment-image]').hidden = !uploadURL;
    if (uploadURL) $('[data-hw-attachment-image]').src = uploadURL;
    else $('[data-hw-attachment-image]').removeAttribute('src');
  }

  function applyDraft() {
    if (currentConcept && !conceptMatchesDraft()) resetConcept();
    prompt.value = draft.prompt;
    if (draft.prompt.trim()) prompt.removeAttribute('aria-invalid');
    modelSelect.value = draft.model;
    cameraSelect.value = draft.camera;
    form.querySelector(`input[name="ratio"][value="${draft.ratio}"]`).checked = true;
    form.querySelector(`input[name="duration"][value="${draft.duration}"]`).checked = true;
    refVideoInput.value = draft.refVideoUrl;
    refImagesInput.value = draft.refImageUrls;
    updateVisualSettings();
    showReference();
  }

  function resetConcept() {
    currentConcept = null;
    activeJob = null;
    stopPolling();
    $('[data-hw-export-actions]').hidden = true;
    $('[data-hw-save]').innerHTML = 'Save concept';
    $('[data-hw-save]').disabled = false;
    savedSelect.value = '';
    $('[data-hw-brief-panel]').hidden = true;
    $('[data-hw-brief-panel]').open = false;
    $('[data-hw-brief]').replaceChildren();
    showReference();
  }

  function updateSavedConcepts() {
    savedSelect.replaceChildren(new Option('Choose a concept', ''));
    for (const concept of concepts) {
      const label = concept.prompt.length > 45 ? `${concept.prompt.slice(0, 45)}…` : concept.prompt;
      savedSelect.append(new Option(`${concept.model} · ${label}`, concept.id));
    }
    $('[data-hw-saved-wrap]').hidden = concepts.length === 0;
    if (currentConcept && concepts.some(concept => concept.id === currentConcept.id)) savedSelect.value = currentConcept.id;
  }

  function renderConcept() {
    const brief = $('[data-hw-brief]');
    brief.replaceChildren();
    const description = document.createElement('p');
    description.className = 'hw-studio-brief-prompt';
    description.textContent = currentConcept.prompt;
    const metadata = document.createElement('div');
    metadata.className = 'hw-studio-concept-meta';
    for (const value of [currentConcept.model, `${currentConcept.duration}s`, currentConcept.ratio, currentConcept.camera]) {
      const item = document.createElement('span');
      item.textContent = value;
      metadata.append(item);
    }
    brief.append(description, metadata);
    $('[data-hw-export-actions]').hidden = false;
    const isSaved = concepts.some(concept => concept.id === currentConcept.id);
    $('[data-hw-save]').innerHTML = isSaved ? `${icon.check}Saved` : 'Save concept';
    $('[data-hw-save]').disabled = isSaved;
    savedSelect.value = isSaved ? currentConcept.id : '';
    $('[data-hw-brief-panel]').hidden = false;
    showReference();
  }

  function cancelPendingUpload() {
    if (!pendingUpload) return;
    pendingUpload.image.onload = null;
    pendingUpload.image.onerror = null;
    URL.revokeObjectURL(pendingUpload.url);
    pendingUpload = null;
  }

  function releaseUpload() {
    if (uploadURL) URL.revokeObjectURL(uploadURL);
    uploadURL = null;
    $('#hw-studio-upload').value = '';
  }

  // ---- Account + real generation (backend-connected models only) ----

  function updateSubmitButton() {
    const label = session?.user ? 'Generate video' : 'Preview concept';
    submitBtn.setAttribute('aria-label', label);
    submitBtn.setAttribute('title', `${label} · Ctrl / ⌘ + Enter`);
  }

  function updateDisclosure() {
    disclosure.textContent = session?.user
      ? 'Signed in · generations use your account’s connected models.'
      : 'Preview mode · sample films. Sign in for real generation.';
  }

  function renderAccount() {
    const signedIn = !!session?.user;
    accountGuest.hidden = signedIn;
    accountUser.hidden = !signedIn;
    if (signedIn) accountEmail.textContent = session.user.email || 'your account';
    updateSubmitButton();
    updateDisclosure();
  }

  async function refreshSession() {
    try { session = await getSession(); }
    catch { session = null; }
    renderAccount();
    if (session?.user) refreshGenerationsList();
    else $('[data-hw-generations-wrap]').hidden = true;
  }

  async function refreshGenerationsList() {
    try {
      const jobs = await listGenerations();
      generationsSelect.replaceChildren(new Option('Recent generations', ''));
      for (const job of jobs.slice(0, 12)) {
        const label = job.prompt.length > 32 ? `${job.prompt.slice(0, 32)}…` : job.prompt;
        generationsSelect.append(new Option(`${job.status} · ${label}`, job.id));
      }
      $('[data-hw-generations-wrap]').hidden = jobs.length === 0;
    } catch { /* leave the list as-is if it fails to load */ }
  }

  function stopPolling() {
    if (pollTimer) clearTimeout(pollTimer);
    pollTimer = null;
    pollAttempts = 0;
  }

  function pollGeneration(id) {
    stopPolling();
    const tick = async () => {
      pollAttempts += 1;
      try {
        const job = await getGeneration(id);
        activeJob = job;
        showReference();
        if (job.status === 'COMPLETED') { setStatus('Your video is ready.'); refreshGenerationsList(); return; }
        if (job.status === 'FAILED') { setStatus(job.error || 'That generation failed. Try again.', true); refreshGenerationsList(); return; }
        setStatus(job.status === 'RUNNING' ? 'Generating your video… this can take a minute or two.' : 'Queued…');
        if (pollAttempts >= 100) { setStatus('Still working on it — check back in a bit.'); return; }
        pollTimer = setTimeout(tick, 4000);
      } catch (error) {
        setStatus(error.message || 'Lost track of that generation.', true);
      }
    };
    tick();
  }

  async function startGeneration() {
    if (!LIVE_MODELS.includes(draft.model)) {
      setStatus(`Real generation isn't wired up for ${draft.model} yet — try one of: ${LIVE_MODELS.join(', ')}.`, true);
      return;
    }
    let refVideoUrl, refImageUrls;
    if (REFERENCE_INPUT_MODELS.includes(draft.model)) {
      refVideoUrl = draft.refVideoUrl.trim();
      refImageUrls = draft.refImageUrls.split(/[,\n]/).map(url => url.trim()).filter(Boolean);
      if (!refVideoUrl) { setStatus('Add a reference video URL first.', true); refVideoInput.focus(); return; }
      if (refImageUrls.length === 0) { setStatus('Add at least one character/product image URL.', true); refImagesInput.focus(); return; }
    }
    currentConcept = {
      id: globalThis.crypto?.randomUUID?.() || `concept-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      ...draft,
      prompt: draft.prompt.trim(),
      createdAt: new Date().toISOString(),
      reference: draft.referenceType === 'upload' ? `Uploaded reference: ${draft.referenceName} (image stays in this session only)` : PRESETS[draft.preset].label,
      type: 'Live generation request',
    };
    activeJob = null;
    renderConcept();
    setStatus('Starting your generation…');
    try {
      const job = await requestGeneration({ prompt: draft.prompt.trim(), duration: Number(draft.duration), aspectRatio: draft.ratio, model: draft.model, videoUrl: refVideoUrl, imageUrls: refImageUrls });
      setStatus('Queued…');
      pollGeneration(job.id);
    } catch (error) {
      setStatus(error.message || 'Could not start your video generation.', true);
    }
  }

  authForm.querySelector('[data-hw-auth-action="signin"]').addEventListener('click', async () => {
    const email = String(authForm.querySelector('[name="email"]').value || '').trim();
    const password = String(authForm.querySelector('[name="password"]').value || '');
    if (!email || password.length < 8) { setAccountStatus('Enter an email and a password of at least 8 characters.', true); return; }
    const submitButton = authForm.querySelector('[data-hw-auth-action="signin"]');
    submitButton.disabled = true;
    setAccountStatus('Signing in…');
    try {
      session = await apiSignIn(email, password);
      renderAccount();
      refreshGenerationsList();
      setAccountStatus('Signed in.');
      authForm.querySelector('[name="email"]').value = '';
      authForm.querySelector('[name="password"]').value = '';
    } catch (error) {
      setAccountStatus(error.message || 'Could not sign in.', true);
    } finally {
      submitButton.disabled = false;
    }
  });

  authForm.querySelector('[data-hw-auth-action="signup"]').addEventListener('click', async () => {
    const email = String(authForm.querySelector('[name="email"]').value || '').trim();
    const password = String(authForm.querySelector('[name="password"]').value || '');
    if (!email || password.length < 8) { setAccountStatus('Enter an email and a password of at least 8 characters.', true); return; }
    const signupButton = authForm.querySelector('[data-hw-auth-action="signup"]');
    signupButton.disabled = true;
    setAccountStatus('Creating your account…');
    try {
      await registerAccount(email, password);
      session = await apiSignIn(email, password);
      renderAccount();
      refreshGenerationsList();
      setAccountStatus('Account created and signed in.');
      authForm.querySelector('[name="email"]').value = '';
      authForm.querySelector('[name="password"]').value = '';
    } catch (error) {
      setAccountStatus(error.message || 'Could not create your account.', true);
    } finally {
      signupButton.disabled = false;
    }
  });

  $('[data-hw-signout]').addEventListener('click', async () => {
    await apiSignOut();
    session = null;
    renderAccount();
    setAccountStatus('Signed out.');
    stopPolling();
    activeJob = null;
    showReference();
  });

  generationsSelect.addEventListener('change', () => {
    const id = generationsSelect.value;
    if (!id) return;
    setStatus('Loading that generation…');
    pollGeneration(id);
  });

  // ---- Everything below is unchanged studio-preview behavior ----

  studio.addEventListener('click', event => {
    if (!(event.target instanceof Element)) return;
    if (event.target.closest('[data-hw-add-reference]')) $('#hw-studio-upload').click();
    const presetButton = event.target.closest('[data-hw-preset]');
    if (presetButton) {
      draft.preset = presetButton.dataset.hwPreset;
      draft.prompt = PRESETS[draft.preset].prompt;
      draft.referenceType = 'preset';
      draft.referenceName = '';
      cancelPendingUpload();
      releaseUpload();
      resetConcept();
      applyDraft();
      persistDraft();
      setStatus('Starting point added. Make it your own.');
      if (mobileLayout.matches) setSidebarOpen(false, false);
      prompt.focus({ preventScroll: true });
    }
    if (event.target.closest('[data-hw-remove-upload]')) {
      cancelPendingUpload();
      releaseUpload();
      draft.referenceType = 'preset';
      draft.referenceName = '';
      showReference();
      resetConcept();
      persistDraft();
      setStatus('Reference removed. Your prompt is still here.');
    }
  });

  prompt.addEventListener('keydown', event => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      form.requestSubmit();
    }
  });

  form.addEventListener('input', event => {
    if (event.target.type === 'file') return;
    syncDraftFromForm();
    if (draft.prompt.trim()) prompt.removeAttribute('aria-invalid');
  });
  // Some form integrations dispatch change without a preceding input event.
  form.addEventListener('change', syncDraftFromForm);

  form.addEventListener('submit', event => {
    event.preventDefault();
    syncDraftFromForm();
    if (pendingUpload) {
      setStatus('Your reference is opening. Preview the concept when it’s ready.');
      return;
    }
    if (!draft.prompt.trim()) {
      setStatus('Give your scene a few words to start.', true);
      prompt.setAttribute('aria-invalid', 'true');
      prompt.focus();
      return;
    }
    if (session?.user) {
      startGeneration();
      return;
    }
    currentConcept = {
      id: globalThis.crypto?.randomUUID?.() || `concept-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      ...draft,
      prompt: draft.prompt.trim(),
      createdAt: new Date().toISOString(),
      reference: draft.referenceType === 'upload' ? `Uploaded reference: ${draft.referenceName} (image stays in this session only)` : PRESETS[draft.preset].label,
      type: 'Creative brief — no AI video generated',
    };
    activeJob = null;
    renderConcept();
    setStatus('Reference preview ready. Sign in above for a real generated video.');
  });

  $('[data-hw-save]').addEventListener('click', () => {
    syncDraftFromForm();
    if (!currentConcept) return;
    concepts = [currentConcept, ...concepts.filter(concept => concept.id !== currentConcept.id)];
    const persisted = writeStorage(CONCEPTS_KEY, concepts);
    updateSavedConcepts();
    renderConcept();
    setStatus(persisted ? 'Saved on this device. Your next idea is waiting.' : 'Saved for this session. Download a brief to keep a copy.');
  });

  savedSelect.addEventListener('change', () => {
    const concept = concepts.find(item => item.id === savedSelect.value);
    if (!concept) return;
    cancelPendingUpload();
    releaseUpload();
    draft = validDraft(concept);
    currentConcept = { ...concept, ...draft };
    activeJob = null;
    applyDraft();
    renderConcept();
    persistDraft();
    setStatus(concept.referenceType === 'upload'
      ? 'Concept loaded. Add your reference again; uploaded images aren’t stored.'
      : 'Saved concept loaded. Edit any detail to keep exploring.');
  });

  $('[data-hw-download]').addEventListener('click', () => {
    syncDraftFromForm();
    if (!currentConcept) return;
    const content = [
      'HOLLOWICK / CREATIVE BRIEF',
      '',
      currentConcept.type,
      '',
      'THE IDEA',
      currentConcept.prompt,
      '',
      'DIRECTION',
      `Model: ${currentConcept.model}`,
      `Duration: ${currentConcept.duration} seconds`,
      `Aspect ratio: ${currentConcept.ratio}`,
      `Camera: ${currentConcept.camera}`,
      `Reference: ${currentConcept.reference}`,
      '',
      `Created: ${currentConcept.createdAt ? new Date(currentConcept.createdAt).toLocaleString() : 'Not recorded'}`,
      '',
      'This brief was made in the Hollowick studio. Reference media is inspiration unless a real generated video is shown above.',
    ].join('\n');
    const blobURL = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = blobURL;
    anchor.download = `hollowick-concept-${currentConcept.id.slice(0, 8)}.txt`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    // Browsers retain the download resource after the click has been dispatched.
    URL.revokeObjectURL(blobURL);
    setStatus('Your creative brief is ready to keep.');
  });

  $('#hw-studio-upload').addEventListener('change', event => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(file.type)) {
      setStatus('Choose a JPG, PNG, WebP, or AVIF image.', true);
      event.target.value = '';
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setStatus('Choose a reference image smaller than 15 MB.', true);
      event.target.value = '';
      return;
    }
    cancelPendingUpload();
    const candidate = { image: new Image(), url: URL.createObjectURL(file) };
    pendingUpload = candidate;
    candidate.image.onload = () => {
      if (pendingUpload !== candidate) return;
      pendingUpload = null;
      candidate.image.onload = null;
      candidate.image.onerror = null;
      releaseUpload();
      uploadURL = candidate.url;
      draft.referenceType = 'upload';
      draft.referenceName = file.name.slice(0, 255);
      resetConcept();
      showReference();
      persistDraft();
      setStatus('Reference added for this session. Your image stays on this device.');
    };
    candidate.image.onerror = () => {
      if (pendingUpload !== candidate) return;
      cancelPendingUpload();
      event.target.value = '';
      setStatus('That image couldn’t be opened. Try another image file.', true);
    };
    candidate.image.src = candidate.url;
    setStatus('Opening your reference…');
  });

  imageElement.addEventListener('error', () => {
    if (uploadURL) {
      releaseUpload();
      resetConcept();
      showReference();
      setStatus('That image couldn’t be opened. Try another image file.', true);
      return;
    }
    if (draft.referenceType === 'upload') return;
    imageElement.hidden = true;
    $('[data-hw-reference-missing]').hidden = false;
    $('[data-hw-missing-title]').textContent = 'Reference unavailable.';
    $('[data-hw-missing-description]').textContent = 'Add an image to keep exploring.';
  });

  applyDraft();
  updateSavedConcepts();
  renderAccount();
  refreshSession();
  persistDraft();
  if (draft.referenceType === 'upload') setStatus('Add your reference again; uploaded images aren’t stored.');
  videoElement.addEventListener('error', () => {
    videoElement.hidden = true;
    setStatus('Video unavailable. Your still reference and creative tools are ready.');
  });
  let resumeVideo = false;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      resumeVideo = !videoElement.paused;
      videoElement.pause();
    } else if (resumeVideo && !videoElement.hidden && !reducedMotion.matches) videoElement.play().catch(() => {});
  });
  reducedMotion.addEventListener('change', () => { if (reducedMotion.matches) videoElement.pause(); });
  window.addEventListener('pagehide', event => {
    videoElement.pause();
    cancelPendingUpload();
    if (!event.persisted) releaseUpload();
  });
}

export default initStudio;
