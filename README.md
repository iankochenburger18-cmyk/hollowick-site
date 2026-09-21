# Hollowick

A cinematic AI video studio website, built with HTML, CSS, and modern JavaScript. No framework, package install, API key, or external runtime dependency is required.

## Run locally

Install Node.js 20 or newer, then run from this folder:

```sh
npm run dev
```

Open **http://localhost:5173**. The included server listens only on the local machine. Set `PORT` to use a different port.

## Build and deploy

```sh
npm run check
npm run build
npm run preview
```

Publish the contents of `dist/` to any static hosting service. The site uses root-relative URLs and expects deployment at the domain root. The included local server is a development convenience; use static hosting for production.

## Experience

- Full-screen, locally hosted desert film with an editorial headline and interactive prompt entry.
- Scroll-linked hero depth, image parallax, text illumination, section reveals, rotating brand artwork, and a sticky three-part product story.
- Model explorer with keyboard navigation and animated visual transitions.
- Filterable, staggered inspiration gallery with scene details and prompt handoff.
- A responsive studio with four model choices, aspect ratio, duration, camera direction, prompt presets, and local reference uploads.
- Persistent drafts and saved concepts, plus downloadable text briefs.
- Native accessible dialogs, visible focus, reduced-motion support, and a persistent motion toggle. Background video pauses offscreen, when the tab is hidden, or while a dialog is open.

## Product scope

This is a complete front-end website and interactive studio preview. It does **not** make AI generation requests. Reference media is explicitly identified as inspiration. Accounts, billing, live model availability, and video generation require a backend and provider accounts before a commercial launch.

Keep provider credentials on a server. A production integration should submit validated generation jobs to that server, track job progress, and replace the reference frame with the resulting video. Model duration and aspect controls currently express a creative brief; they do not assert provider API constraints.

Drafts and concepts are stored in this browser’s local storage. Uploaded reference images stay in memory for the current studio session and are released when closed. Download a brief to keep a portable copy. No analytics, cookies, or external requests are made by the website itself.

## Files

- `index.html` — semantic page structure, navigation, and gallery dialogs.
- `src/styles.css` — visual system, responsive layouts, and motion.
- `src/main.js` — page behavior, scroll effects, model tabs, gallery filters, and dialogs.
- `src/studio.js`, `src/studio.css` — isolated studio experience.
- `public/media/` — locally bundled media and source/license manifest.
- `public/fonts/` — Manrope and Instrument Serif, with SIL Open Font Licenses.
- `server.mjs`, `build.mjs` — zero-dependency local server and static build.

## Credits and references

Visual media credits and license links are in `public/media/manifest.json`. Photographs come from [Unsplash](https://unsplash.com/license); the Sahara film by dubassy comes from [Mixkit](https://mixkit.co/free-stock-video/dunes-in-the-sahara-desert-4149/). These are stock references, not claimed model outputs.

Design research included [Apple](https://www.apple.com/iphone/) and [Krea](https://www.krea.ai/). The Hollowick layout, visual identity, copy, and interactions are original to this project.

Catalog labels were checked against [Google DeepMind Veo](https://deepmind.google/models/veo/), [Runway](https://runway.com/), [Kling](https://kling.ai/quickstart/klingai-video-3-model-user-guide), and [Luma Ray3](https://lumalabs.ai/ray3). Their names remain the property of the respective providers; inclusion does not imply a partnership.
