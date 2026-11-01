# Android and mobile-only workflow

This project is designed to be used and reviewed from an Android phone. You do not need a computer
to open the running preview or to test the delivered phases.

---

## 1. Open the preview

While the Arena session is active, open the **4173 production-preview** port shown in the
conversation (the 5173 development server is also available). It is the real application talking to
the real FastAPI backend in the same sandbox:

- the built SPA is served by `vite preview` on `0.0.0.0:4173`; `5173` runs the HMR dev server;
- `/api/*` is proxied to FastAPI on `:8000`, so cookies and uploads stay same-origin;
- no `localhost` address is needed on the phone;
- the production preview is the better performance check because it serves the hashed, split bundle.

The preview address is session-scoped. It **is not a permanent public deployment**. A permanent link
requires the separate Vercel frontend and a public backend described in [VERCEL.md](VERCEL.md); the
sandbox stops serving when the session ends.

### Sign in

| Role | Email | Password |
|---|---|---|
| Administrator | `admin@example.com` | `AdminPass123` |

You can also create a normal account from `/register`. This demo admin exists only in the sandbox
SQLite database and must never be shipped to production.

---

## 2. What is already mobile-first

| Requirement | Implementation |
|---|---|
| Android browser support | Modern Chrome/Chromium and Firefox; uses standard touch/pointer events and WebGL 2 with a WebGL 1 fallback |
| Different screen sizes | Fluid `shell` container, responsive grids, `clamp()` display type, 390 px and 393 px checks |
| No horizontal overflow | Automated 27-route sweep at 390 px; `min-w-0` constraints on grid children; no global overflow hiding |
| Mobile navigation | Collapsible header menu with 44 px touch targets and a skip link |
| Touch controls | Buttons/inputs use a minimum 44 px height; the 3D controls have labelled pause/walk/camera/fullscreen buttons |
| Responsive forms | Single-column forms, native select/inputs, large touch areas, inline validation |
| Mobile design editor | Pan/zoom-aware stage, touch pointer handling, 44 px toolbar controls and a scrollable layer panel; the stage keeps a fixed aspect ratio |
| Responsive 3D viewer | Resizes with its container, adaptive DPR, `OrbitControls` touch gestures (one finger rotate, two fingers zoom), fullscreen with a layout fallback |
| Optimised assets | Procedural SVG garments (no photo downloads), small GLB models (77–292 KB), hashed/cached bundles, gzip |
| Loading indicators | Route skeletons, 3D progress, upload progress and inline spinners with `role="status"` |
| Mobile errors | Friendly retry boundary for a failed page chunk, network message for the API, WebGL fallback with retry |
| Low-memory behaviour | Per-route code splitting, 3D chunk deferred until a 3D view opens, opt-in 3D on ≤ 4 GB memory / data saver / 2G |
| Reduced motion | Honours `prefers-reduced-motion` and the in-app “Reduce motion” preference |

### What the 3D fallback does

1. If WebGL is unavailable, the fitting room says so and offers a retry, plus the 2D design/print
   path. It never substitutes a screenshot for the live model.
2. If the device reports low memory or data saving, the landing hero shows a silhouette and a
   **Load 3D preview** button. Opening it is your choice.
3. If a lazy route chunk fails on a weak connection, the page shows “This page didn’t load” with
   **Try again** and **Back to the studio** instead of an empty screen.

---

## 3. Ten-minute phone test checklist

Open the preview in Chrome and check:

1. **Landing** — the hero fits without sideways scrolling; tap **Browse the collection**.
2. **Menu** — open the header menu, scroll it, tap a link and confirm it closes.
3. **Studio** — filter women/men, search, change sort; cards stay inside the screen.
4. **Garment** — choose a colour on two different components; the flat preview updates; tap through
   the component rows.
5. **Design editor** — open a saved design, move/resize a layer with a finger, undo/redo, save.
6. **Fitting room** — create an avatar if prompted; rotate with one finger, zoom with two, pause and
   resume the animation, switch camera views, enter/exit fullscreen.
7. **Try-on** — confirm the page says the AI try-on is unavailable rather than showing a fake result
   (no GPU worker is configured in the sandbox).
8. **Print** — create a print package, download the PDF; the download should be offered to Chrome’s
   download manager.
9. **Profile** — upload a photo from the camera/gallery, check the preview is private, change a
   preference and save.
10. **Rotation** — rotate the phone on the fitting room and landing page; no content should be cut
    off or overflow horizontally.

If something fails, note the route, what you tapped and any message. Do not send a photo of a
personal ID; the sandbox is a demo.

---

## 4. Performance expectations and limits

- The landing page's first JS payload is roughly **100 KB gzip** (app + vendor + CSS). The 3D
  engine (≈ **284 KB gzip**) is separate.
- 3D models are **77–292 KB** and are loaded progressively with a progress indicator.
- On a slow connection the 3D hero is deferred/opt-in; all 2D design, account, catalogue and print
  features work without it.
- The audit used **Chromium device emulation** (390 px and Pixel 5) with software WebGL. It is not a
  physical handset measurement; real GPU, heat and battery behaviour still need a hardware pass.
- The app does not request camera/microphone/geolocation. Photos are chosen with the normal file
  picker, which on Android can use the camera app.

---

## 5. If the preview does not open

| Symptom | Check |
|---|---|
| “Site can’t be reached” | The sandbox may have stopped; ask the agent to restart the **Website** and **API server** previews |
| Blank page | Force refresh; if a chunk failed you should see a retry screen |
| 3D missing | Chrome → Settings → Site settings → WebGL; or use the **Load 3D preview** button |
| Signed out after a restart | Expected: access tokens live in memory; sign in again. The refresh cookie may have expired |
| Uploads fail | Use an image under 8 MB and allow Chrome to access files/photos |
| API errors | The Vite preview proxies to the sandbox API; both preview processes must be running |

For a permanent, production-style URL, see [VERCEL.md](VERCEL.md) and
[SUPABASE.md](SUPABASE.md). A Vercel frontend alone is not enough: deploy the FastAPI app as a
second Vercel project (or a container host), connect Supabase PostgreSQL and private Storage, then
put that public HTTPS API URL in `VITE_API_BASE_URL`. Vercel's 4.5 MB request limit means uploads
there are capped at 4 MB.
