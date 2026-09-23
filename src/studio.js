import { registerAccount, signIn as apiSignIn, signOut as apiSignOut, getSession, requestGeneration, listGenerations, getGeneration } from './api.js';

const STORAGE_KEY = 'hollowick-studio-draft-v1';
const CONCEPTS_KEY = 'hollowick-studio-concepts-v1';
const MODELS = ['Veo 3.1', 'Gen-4.5', 'Kling 3.0', 'Ray3'];
const PRESETS = {
  dunes: {
    label: 'Desert dream',
    image: '/media/dunes.jpg',
    prompt: 'An otherworldly journey across sculptural desert dunes. A lone figure moves through the warm, shifting light. Slow camera movement, rich sand textures, a quiet cinematic atmosphere.',
  },
  ocean: {
    label: 'Blue hour',
    image: '/media/ocean.jpg',
    prompt: 'An endless ocean at blue hour. The camera glides just above the water as a silver wave catches the last light. Immersive, minimal, beautifully detailed. Shot on 35mm film.',
  },
  portrait: {
    label: 'Human nature',
    image: '/media/portrait.jpg',
    prompt: 'An intimate cinematic portrait in soft natural light. A fleeting expression, a gentle breeze, beautiful skin texture. The camera slowly draws closer. Understated, tactile, alive.',
  },
  architecture: {
    label: 'Quiet spaces',
    image: '/media/architecture.jpg',
    prompt: 'A slow exploration of a sculptural concrete space. Warm sunlight falls across raw surfaces, revealing extraordinary geometry. Monolithic architecture, soft shadows, a meditative rhythm.',
  },
};

const icon = {
  close: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" stroke-width="1.5"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" stroke-width="1.5"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="1.5"/></svg>',
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

export function initStudio() {
  if (document.querySelector('#hollowick-studio')) return;
  let draft = validDraft(readStorage(STORAGE_KEY, {}));
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
  let opener = null;
  let previousOverflow = '';
  let session = null;
  let pollTimer = null;
  let pollAttempts = 0;

  const dialog = document.createElement('dialog');
  dialog.id = 'hollowick-studio';
  dialog.className = 'hw-studio';
  dialog.setAttribute('aria-labelledby', 'hw-studio-title');
  dialog.setAttribute('aria-describedby', 'hw-studio-disclosure');
  dialog.innerHTML = `
    <div class="hw-studio-shell">
      <header class="hw-studio-header">
        <div class="hw-studio-brand"><img class="hw-studio-brand-logo" src="/brand/hollowick-mark-chartreuse.png" width="25" height="27" alt=""/><span id="hw-studio-title">hollowick <span class="hw-studio-brand-divider">/</span> studio</span><span class="hw-studio-preview-badge">PREVIEW</span></div>
        <button class="hw-studio-icon-btn" data-hw-close type="button" aria-label="Close studio">${icon.close}</button>
      </header>
      <div class="hw-studio-account" data-hw-account>
        <div class="hw-studio-account-guest" data-hw-account-guest>
          <span class="hw-studio-account-label">Sign in for real AI video generation</span>
          <form class="hw-studio-account-form" data-hw-auth-form>
            <input class="hw-studio-account-input" type="email" name="email" placeholder="Email" autocomplete="email" required>
            <input class="hw-studio-account-input" type="password" name="password" placeholder="Password" autocomplete="current-password" minlength="8" required>
            <button type="submit" class="hw-studio-account-btn" data-hw-auth-action="signin">Sign in</button>
            <button type="button" class="hw-studio-account-btn hw-studio-account-btn--ghost" data-hw-auth-action="signup">Create account</button>
          </form>
        </div>
        <div class="hw-studio-account-user" data-hw-account-user hidden>
          <span class="hw-studio-account-label">Signed in as <strong data-hw-account-email></strong></span>
          <button type="button" class="hw-studio-account-btn hw-studio-account-btn--ghost" data-hw-signout>Sign out</button>
        </div>
        <p class="hw-studio-account-status" data-hw-account-status role="status" aria-live="polite"></p>
      </div>
      <div class="hw-studio-layout">
        <section class="hw-studio-canvas" aria-label="Concept reference and creative brief">
          <div class="hw-studio-canvas-top"><span class="hw-studio-eyebrow">YOUR NEXT GREAT IDEA</span><span class="hw-studio-frame-number">FRAME 001</span></div>
          <div class="hw-studio-image-wrap">
            <div class="hw-studio-image-frame" data-hw-frame>
              <img class="hw-studio-reference" data-hw-image alt="Desert landscape used as a concept reference" src="/media/dunes.jpg">
              <div class="hw-studio-reference-missing" data-hw-reference-missing hidden><span data-hw-missing-title>Your reference stays with you.</span><p data-hw-missing-description>Add the image again to see this frame.</p></div>
              <div class="hw-studio-frame-shade"></div>
              <span class="hw-studio-frame-corner hw-studio-frame-corner--tl"></span><span class="hw-studio-frame-corner hw-studio-frame-corner--br"></span>
              <div class="hw-studio-frame-label"><span class="hw-studio-live-dot"></span> REFERENCE <span data-hw-image-ratio>16:9</span></div>
            </div>
          </div>
          <div class="hw-studio-reference-tools"><span data-hw-reference-name>Desert dream · inspiration reference</span><label class="hw-studio-upload" for="hw-studio-upload">${icon.plus}<span>Add reference</span></label><input class="hw-studio-visually-hidden" type="file" id="hw-studio-upload" accept="image/jpeg,image/png,image/webp,image/avif"><button class="hw-studio-remove" type="button" data-hw-remove-upload hidden>Remove</button></div>
          <div class="hw-studio-brief" data-hw-brief>
            <p class="hw-studio-eyebrow">A LITTLE DIRECTION. ENDLESS POSSIBILITY.</p>
            <h2>Make room for <em>the idea.</em></h2>
            <p>Shape a scene, find your model, and bring your direction into focus.</p>
          </div>
          <div class="hw-studio-generate" data-hw-generate>
            <div class="hw-studio-generate-head"><span class="hw-studio-eyebrow">LIVE GENERATION <span class="hw-studio-generate-tag">RAY3 · LUMA</span></span><select class="hw-studio-generate-select" data-hw-generations aria-label="Your recent generations"><option value="">Recent generations</option></select></div>
            <div class="hw-studio-generate-video-wrap" data-hw-generate-stage hidden><video class="hw-studio-generate-video" data-hw-generate-video controls playsinline></video></div>
            <p class="hw-studio-generate-status" data-hw-generate-status role="status" aria-live="polite"></p>
            <button type="button" class="hw-studio-generate-btn" data-hw-generate-btn disabled>Generate real video</button>
          </div>
          <div class="hw-studio-saved" data-hw-saved-wrap hidden><label for="hw-studio-saved">SAVED CONCEPTS</label><select id="hw-studio-saved" aria-label="Load a saved concept"><option value="">Choose a concept</option></select></div>
          <p class="hw-studio-honesty" id="hw-studio-disclosure">This is a studio preview. Build and save a creative brief here; live AI video generation isn’t connected. Reference images are inspiration, not generated output.</p>
        </section>
        <form class="hw-studio-controls" id="hw-studio-form">
          <div class="hw-studio-section-heading"><span class="hw-studio-eyebrow">01 / IMAGINE</span><span class="hw-studio-draft-indicator" data-hw-draft-status>DRAFT SAVED ON THIS DEVICE</span></div>
          <label class="hw-studio-label hw-studio-prompt-label" for="hw-studio-prompt">What’s on your mind?</label>
          <div class="hw-studio-prompt-wrap"><textarea id="hw-studio-prompt" name="prompt" maxlength="1600" rows="4" placeholder="A place that doesn’t exist yet. A feeling you can almost see. Start anywhere…" aria-describedby="hw-studio-status" required></textarea><span class="hw-studio-char-count"><span data-hw-count>0</span> / 1600</span></div>
          <div class="hw-studio-presets-label">A little inspiration</div>
          <div class="hw-studio-presets">${Object.entries(PRESETS).map(([key, preset]) => `<button type="button" class="hw-studio-preset" data-hw-preset="${key}"><span class="hw-studio-preset-dot hw-studio-preset-dot--${key}"></span>${preset.label}</button>`).join('')}</div>
          <div class="hw-studio-section-heading hw-studio-section-heading--second"><span class="hw-studio-eyebrow">02 / DIRECT</span></div>
          <div class="hw-studio-direction-grid">
            <div><label class="hw-studio-label" for="hw-studio-model">Your model</label><div class="hw-studio-select-wrap"><select id="hw-studio-model" name="model">${MODELS.map(model => `<option value="${model}">${model}</option>`).join('')}</select></div></div>
            <div><label class="hw-studio-label" for="hw-studio-camera">Camera movement</label><select id="hw-studio-camera" name="camera"><option>Slow dolly in</option><option>Gentle orbit</option><option>Locked-off</option><option>Handheld follow</option></select></div>
          </div>
          <div class="hw-studio-settings-grid">
            <fieldset class="hw-studio-fieldset"><legend class="hw-studio-label">Aspect ratio</legend><div class="hw-studio-segmented">${['16:9','9:16','1:1'].map(ratio => `<label class="hw-studio-segment"><input type="radio" name="ratio" value="${ratio}"><span><i class="hw-studio-ratio-icon hw-studio-ratio-icon--${ratio.replace(':', '-')}" aria-hidden="true"></i>${ratio}</span></label>`).join('')}</div></fieldset>
            <fieldset class="hw-studio-fieldset"><legend class="hw-studio-label">Duration</legend><div class="hw-studio-segmented hw-studio-segmented--duration">${['5','10'].map(duration => `<label class="hw-studio-segment"><input type="radio" name="duration" value="${duration}"><span>${duration}s</span></label>`).join('')}</div></fieldset>
          </div>
          <div class="hw-studio-actions"><button type="submit" class="hw-studio-create"><span>Preview concept</span>${icon.arrow}</button><div class="hw-studio-secondary-actions" data-hw-export-actions hidden><button type="button" data-hw-save>Save concept</button><button type="button" data-hw-download>${icon.download}Download brief</button></div></div>
          <p class="hw-studio-status" id="hw-studio-status" role="status" aria-live="polite" aria-atomic="true" data-hw-status>YOUR IMAGINATION HAS A NEW HOME.</p>
        </form>
      </div>
    </div>`;
  document.body.append(dialog);

  const $ = selector => dialog.querySelector(selector);
  const form = $('#hw-studio-form');
  const prompt = $('#hw-studio-prompt');
  const modelSelect = $('#hw-studio-model');
  const cameraSelect = $('#hw-studio-camera');
  const savedSelect = $('#hw-studio-saved');
  const status = $('[data-hw-status]');
  const imageElement = $('[data-hw-image]');
  const accountGuest = $('[data-hw-account-guest]');
  const accountUser = $('[data-hw-account-user]');
  const accountEmail = $('[data-hw-account-email]');
  const accountStatus = $('[data-hw-account-status]');
  const authForm = $('[data-hw-auth-form]');
  const generationsSelect = $('[data-hw-generations]');
  const generateBtn = $('[data-hw-generate-btn]');
  const generateStatus = $('[data-hw-generate-status]');
  const generateStage = $('[data-hw-generate-stage]');
  const generateVideo = $('[data-hw-generate-video]');

  function setStatus(message, error = false) {
    status.textContent = message;
    status.classList.toggle('hw-studio-status--error', error);
  }

  function setAccountStatus(message, error = false) {
    accountStatus.textContent = message || '';
    accountStatus.classList.toggle('hw-studio-account-status--error', error);
  }

  function setGenerateStatus(message, error = false) {
    generateStatus.textContent = message || '';
    generateStatus.classList.toggle('hw-studio-generate-status--error', error);
  }

  function renderAccount() {
    const signedIn = !!session?.user;
    accountGuest.hidden = signedIn;
    accountUser.hidden = !signedIn;
    if (signedIn) accountEmail.textContent = session.user.email || 'your account';
    generateBtn.disabled = !signedIn;
    if (!signedIn) setGenerateStatus('Sign in above to generate a real video.');
    else if (!generateStatus.textContent) setGenerateStatus('Ready when you are.');
  }

  async function refreshSession() {
    try { session = await getSession(); }
    catch { session = null; }
    renderAccount();
    if (session?.user) refreshGenerationsList();
  }

  async function refreshGenerationsList() {
    try {
      const jobs = await listGenerations();
      generationsSelect.replaceChildren(new Option('Recent generations', ''));
      for (const job of jobs.slice(0, 12)) {
        const label = job.prompt.length > 32 ? `${job.prompt.slice(0, 32)}…` : job.prompt;
        generationsSelect.append(new Option(`${job.status} · ${label}`, job.id));
      }
    } catch { /* leave the list as-is if it fails to load */ }
  }

  function stopPolling() {
    if (pollTimer) clearTimeout(pollTimer);
    pollTimer = null;
    pollAttempts = 0;
  }

  function showGenerationResult(job) {
    if (job.status === 'COMPLETED' && job.resultUrl) {
      generateVideo.src = job.resultUrl;
      generateStage.hidden = false;
      setGenerateStatus('Your video is ready.');
    } else if (job.status === 'FAILED') {
      generateStage.hidden = true;
      setGenerateStatus(job.error || 'That generation failed. Try again.', true);
    } else {
      generateStage.hidden = true;
      setGenerateStatus(job.status === 'RUNNING' ? 'Generating your video… this can take a minute or two.' : 'Queued…');
    }
  }

  function pollGeneration(id) {
    stopPolling();
    const tick = async () => {
      pollAttempts += 1;
      try {
        const job = await getGeneration(id);
        showGenerationResult(job);
        if (job.status === 'COMPLETED' || job.status === 'FAILED') { refreshGenerationsList(); return; }
        if (pollAttempts >= 100) { setGenerateStatus('Still working on it — check back in a bit.'); return; }
        pollTimer = setTimeout(tick, 4000);
      } catch (error) {
        setGenerateStatus(error.message || 'Lost track of that generation.', true);
      }
    };
    tick();
  }

  function persistDraft() {
    const saved = writeStorage(STORAGE_KEY, draft);
    $('[data-hw-draft-status]').textContent = saved ? 'DRAFT SAVED ON THIS DEVICE' : 'DRAFT KEPT FOR THIS SESSION';
  }

  function syncDraftFromForm() {
    const data = new FormData(form);
    draft = validDraft({ ...draft, prompt: data.get('prompt'), model: data.get('model'), ratio: data.get('ratio'), duration: data.get('duration'), camera: data.get('camera') });
    updateVisualSettings();
    persistDraft();
    if (currentConcept && !conceptMatchesDraft()) {
      resetConcept();
      setStatus('Direction updated. Preview your revised concept.');
    }
  }

  function conceptMatchesDraft() {
    return currentConcept && ['model', 'ratio', 'duration', 'camera', 'preset', 'referenceType', 'referenceName'].every(key => currentConcept[key] === draft[key]) && currentConcept.prompt === draft.prompt.trim();
  }

  function updateVisualSettings() {
    $('[data-hw-count]').textContent = draft.prompt.length;
    $('[data-hw-image-ratio]').textContent = draft.ratio;
    $('[data-hw-frame]').dataset.ratio = draft.ratio;
  }

  function showReference() {
    const preset = PRESETS[draft.preset];
    const missing = draft.referenceType === 'upload' && !uploadURL;
    imageElement.hidden = missing;
    $('[data-hw-reference-missing]').hidden = !missing;
    $('[data-hw-missing-title]').textContent = 'Your reference stays with you.';
    $('[data-hw-missing-description]').textContent = 'Add the image again to see this frame.';
    if (!missing) imageElement.src = uploadURL || preset.image;
    imageElement.alt = uploadURL ? 'Your uploaded visual reference' : `${preset.label} inspiration reference`;
    $('[data-hw-reference-name]').textContent = draft.referenceType === 'upload' ? `${draft.referenceName}${missing ? ' · image not stored' : ''}` : `${preset.label} · inspiration reference`;
    $('[data-hw-remove-upload]').hidden = draft.referenceType !== 'upload';
  }

  function applyDraft() {
    if (currentConcept && !conceptMatchesDraft()) resetConcept();
    prompt.value = draft.prompt;
    if (draft.prompt.trim()) prompt.removeAttribute('aria-invalid');
    modelSelect.value = draft.model;
    cameraSelect.value = draft.camera;
    form.querySelector(`input[name="ratio"][value="${draft.ratio}"]`).checked = true;
    form.querySelector(`input[name="duration"][value="${draft.duration}"]`).checked = true;
    updateVisualSettings();
    showReference();
  }

  function resetConcept() {
    currentConcept = null;
    $('[data-hw-export-actions]').hidden = true;
    $('[data-hw-save]').innerHTML = 'Save concept';
    $('[data-hw-save]').disabled = false;
    savedSelect.value = '';
    $('[data-hw-brief]').innerHTML = '<p class="hw-studio-eyebrow">A LITTLE DIRECTION. ENDLESS POSSIBILITY.</p><h2>Make room for <em>the idea.</em></h2><p>Shape a scene, find your model, and bring your direction into focus.</p>';
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
    const eyebrow = document.createElement('p');
    eyebrow.className = 'hw-studio-eyebrow';
    eyebrow.textContent = 'YOUR CREATIVE BRIEF';
    const title = document.createElement('h2');
    title.innerHTML = 'The beginning of <em>something.</em>';
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
    brief.append(eyebrow, title, description, metadata);
    $('[data-hw-export-actions]').hidden = false;
    const isSaved = concepts.some(concept => concept.id === currentConcept.id);
    $('[data-hw-save]').innerHTML = isSaved ? `${icon.check}Saved` : 'Save concept';
    $('[data-hw-save]').disabled = isSaved;
    savedSelect.value = isSaved ? currentConcept.id : '';
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

  function open(trigger = {}) {
    if (dialog.open) return;
    trigger = trigger && typeof trigger === 'object' ? trigger : {};
    opener = document.activeElement;
    if (typeof trigger.prompt === 'string' && trigger.prompt.trim()) {
      draft.prompt = trigger.prompt.slice(0, 1600);
      resetConcept();
    }
    if (typeof trigger.model === 'string') {
      const match = MODELS.find(model => model.toLowerCase() === trigger.model.toLowerCase());
      if (match) { draft.model = match; resetConcept(); }
    }
    if (typeof trigger.preset === 'string' && Object.hasOwn(PRESETS, trigger.preset)) {
      draft.preset = trigger.preset;
      draft.referenceType = 'preset';
      draft.referenceName = '';
      cancelPendingUpload();
      releaseUpload();
    }
    applyDraft();
    updateSavedConcepts();
    persistDraft();
    refreshSession();
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.showModal();
    prompt.focus({ preventScroll: true });
    setStatus(draft.referenceType === 'upload' && !uploadURL
      ? 'Your direction is saved. Add the reference again; uploaded images aren’t stored.'
      : currentConcept ? 'Your concept is ready. Keep exploring or download your brief.' : 'YOUR IMAGINATION HAS A NEW HOME.');
  }

  function close() {
    if (!dialog.open) return;
    syncDraftFromForm();
    dialog.close();
  }

  dialog.addEventListener('close', () => {
    document.body.style.overflow = previousOverflow;
    cancelPendingUpload();
    releaseUpload();
    showReference();
    generateVideo.pause();
    if (!document.querySelector('dialog[open]')) {
      const isVisible = element => element instanceof HTMLElement && element !== document.body && element.isConnected && !element.closest('[hidden], [inert], dialog:not([open])') && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden';
      const returnTarget = isVisible(opener) ? opener : [...document.querySelectorAll('[data-open-studio], .menu-toggle')].find(isVisible);
      returnTarget?.focus({ preventScroll: true });
    }
  });
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  const isOutsideDialog = event => {
    const bounds = dialog.getBoundingClientRect();
    return event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom;
  };
  let backdropPointerDown = false;
  dialog.addEventListener('pointerdown', event => { backdropPointerDown = event.target === dialog && isOutsideDialog(event); });
  dialog.addEventListener('click', event => {
    if (event.target === dialog && backdropPointerDown && isOutsideDialog(event)) close();
    backdropPointerDown = false;
    if (!(event.target instanceof Element)) return;
    if (event.target.closest('[data-hw-close]')) close();
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
      setStatus('A starting point. Make it your own.');
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

  document.addEventListener('click', event => {
    if (!(event.target instanceof Element)) return;
    const trigger = event.target.closest('[data-open-studio]');
    if (!trigger) return;
    event.preventDefault();
    open({ model: trigger.dataset.model, prompt: trigger.dataset.prompt, preset: trigger.dataset.preset });
  });

  const heroForm = document.querySelector('#hero-prompt-form');
  if (heroForm) heroForm.addEventListener('submit', event => {
    event.preventDefault();
    open({ prompt: new FormData(heroForm).get('prompt') || '' });
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
    currentConcept = {
      id: globalThis.crypto?.randomUUID?.() || `concept-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      ...draft,
      prompt: draft.prompt.trim(),
      createdAt: new Date().toISOString(),
      reference: draft.referenceType === 'upload' ? `Uploaded reference: ${draft.referenceName} (image stays in this session only)` : PRESETS[draft.preset].label,
      type: 'Creative brief — no AI video generated',
    };
    renderConcept();
    setStatus('Concept ready. Save it here or take the brief with you.');
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
      'This brief was made in the Hollowick studio preview. Live AI video generation is not connected. Reference images are inspiration, not generated output.',
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

  authForm.addEventListener('submit', async event => {
    event.preventDefault();
    const data = new FormData(authForm);
    const email = String(data.get('email') || '').trim();
    const password = String(data.get('password') || '');
    if (!email || password.length < 8) { setAccountStatus('Enter an email and a password of at least 8 characters.', true); return; }
    const submitButton = authForm.querySelector('[data-hw-auth-action="signin"]');
    submitButton.disabled = true;
    setAccountStatus('Signing in…');
    try {
      session = await apiSignIn(email, password);
      renderAccount();
      setAccountStatus('Signed in.');
      authForm.reset();
    } catch (error) {
      setAccountStatus(error.message || 'Could not sign in.', true);
    } finally {
      submitButton.disabled = false;
    }
  });

  authForm.querySelector('[data-hw-auth-action="signup"]').addEventListener('click', async () => {
    const data = new FormData(authForm);
    const email = String(data.get('email') || '').trim();
    const password = String(data.get('password') || '');
    if (!email || password.length < 8) { setAccountStatus('Enter an email and a password of at least 8 characters.', true); return; }
    const signupButton = authForm.querySelector('[data-hw-auth-action="signup"]');
    signupButton.disabled = true;
    setAccountStatus('Creating your account…');
    try {
      await registerAccount(email, password);
      session = await apiSignIn(email, password);
      renderAccount();
      setAccountStatus('Account created and signed in.');
      authForm.reset();
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
    generateStage.hidden = true;
  });

  generateBtn.addEventListener('click', async () => {
    syncDraftFromForm();
    if (!session?.user) { setGenerateStatus('Sign in above to generate a real video.', true); return; }
    if (!draft.prompt.trim()) { setGenerateStatus('Add a prompt first.', true); prompt.focus(); return; }
    if (draft.model !== 'Ray3') { setGenerateStatus('Real generation currently runs on Ray3 (Luma) — switch your model to Ray3 to generate.', true); return; }
    generateBtn.disabled = true;
    generateStage.hidden = true;
    setGenerateStatus('Starting your generation…');
    try {
      const job = await requestGeneration({ prompt: draft.prompt.trim(), duration: Number(draft.duration), aspectRatio: draft.ratio });
      setGenerateStatus('Queued…');
      pollGeneration(job.id);
    } catch (error) {
      setGenerateStatus(error.message || 'Could not start your video generation.', true);
    } finally {
      generateBtn.disabled = !session?.user;
    }
  });

  generationsSelect.addEventListener('change', () => {
    const id = generationsSelect.value;
    if (!id) return;
    generateStage.hidden = true;
    pollGeneration(id);
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
  return { open, close };
}

export default initStudio;
