# Shine The Mentalist — Show App: Complete Technical Reference

> Use this document when prompting Claude for any enhancement, bug fix, or new feature.
> Paste the relevant sections along with your request so Claude has full context.

---

## 1. What This App Is

A real-time, multi-device **mentalist show controller**. The host (Shine) runs a control panel on his phone/laptop. The audience scans a QR code and watches a synchronized experience unfold on their phones — animations, reveals, personal messages, karaoke, and a Google review redirect — all triggered live by the host, with no audience interaction required beyond the initial page load.

**Deployed on:** [Fly.io](https://fly.io) · App name: `mentalist-inject` · Region: `iad`  
**Stack:** Node.js · Express · Socket.IO (WebSocket + HTTP polling fallback) · Vanilla JS frontend  
**Revision tracking:** `REVISION` constant in `server.js` (currently `v78-remote-mapping`) — bump on every deploy

---

## 2. File Structure

```
/
├── server.js          # Express + Socket.IO server. All room state lives here.
├── package.json       # Dependencies: express ^4.19.2, socket.io ^4.7.5
├── fly.toml           # Fly.io deployment config (1 shared CPU, 1GB RAM, always-on)
├── Dockerfile         # Container definition
├── .dockerignore
├── public/            # Static files served by Express
│   ├── host.html      # Host control panel UI
│   ├── host.js        # Host control panel logic
│   ├── audience.html  # Audience experience UI
│   ├── audience.js    # Audience experience logic
│   ├── styles.css     # Shared CSS (dark theme, CSS variables)
│   ├── logo.png       # Shown in QR code center + logo animation step
│   ├── client.jpg     # FALLBACK ONLY — not used in real shows (see below)
│   ├── music.mp3      # FALLBACK ONLY — not used in real shows (see below)
│   ├── review.mp3     # FALLBACK ONLY — not used in real shows (see below)
│   ├── heart.svg      # Heart SVG (idle screen)
│   └── sample-song.lrc  # Example/reference LRC file only
```

> **Important — Media files in `public/` are fallbacks only.**
> For every real show, Shine uploads the actual show-specific files (client photo, reveal music, review music, karaoke MP3, karaoke LRC) to an external public hosting service (e.g. Supabase storage) and pastes those URLs into the **Media URLs** and **Karaoke** sections of the Host Control Panel. The server state is updated with those URLs and all audience devices load the files directly from the external host — nothing show-specific is ever deployed to Fly.io. The files in `public/` (`client.jpg`, `music.mp3`, `review.mp3`) only serve as a last-resort fallback if a URL field is left blank.

---

## 3. Architecture

### Server (`server.js`)

- Maintains **room state** in a `Map<roomName, stateObject>` (in-memory for speed, persisted to disk since v87 -- see Section 5 -- so it survives redeploys/restarts)
- Each room is identified by a URL-safe string (default: `"SHOW"`)
- State updates are broadcast to all sockets in the room via `io.to(room).emit("state:update", state)`
- Every state change increments `state.seq` so clients can detect stale updates
- **Dual transport:** WebSocket is primary; HTTP POST endpoints (`/api/host/:action`) are a fallback for when mobile browsers pause WebSocket connections in the background
- **HTTP polling endpoints** for audience fallback: `/state.json`, `/counts.json`, `/meta.json`

### Client — Host (`host.js`)
- Connects via Socket.IO, announces role `"host"` with room name
- Settings are persisted in `localStorage` (key: `revealReviewHostSettings:v41:{ROOM}`) purely as a fast local cache for instant paint before the socket connects
- **Server state is the actual cross-device source of truth** (since v84): on the first `state:update` received after connecting, `applyServerStateToForm()` overwrites the form with whatever's on the server (and re-saves it to localStorage), so opening the same room URL on a different device shows the same configured values, not that device's own local cache. Subsequent `state:update` broadcasts during the same connection do NOT re-touch the form (only phase/dock), so a live edit in progress on this device is never clobbered by another device's save. Exception: `iosLaunch*` fields (iOS Shortcuts deep-link settings) are deliberately per-device and never sent to or read from the server.
- Every settings change debounces a `host:saveSettings` emit to keep server state in sync
- All host actions are sent **both** via WebSocket and HTTP POST for reliability on mobile
- Bluetooth remote / keyboard arrow keys are mapped to show actions (see Section 8)
- **Note:** room state lives in the server's `roomStates` Map (Section 5), persisted to disk since v87 -- survives deploys/restarts now, so this cross-device sync and whatever's configured both carry forward.

### Client — Audience (`audience.js`)
- Connects via Socket.IO, announces role `"audience"` with room name
- Also polls `/state.json` every 1 second as a backup (handles missed WebSocket events)
- Uses a `seq` counter to ignore stale/duplicate state updates
- Uses a `runToken` to cancel an in-progress animation sequence if the host changes phase
- Audio must be unlocked by a visible user tap before iOS Safari will play sound

---

## 4. The Complete Show Flow

This is the exact sequence of events from the audience's perspective, in show order.

---

### PHASE 1 — `idle` (Waiting Screen)

**What audience sees:**  
A beating red heart emoji with the text "Get ready — Keep this page open." A pulsing heartbeat sound plays (synthesized via WebAudio, so no file needed). A "Enable Sound" button appears — audience must tap it for audio to work on iOS.

**What host does:**  
Nothing yet. Shares the QR code with the audience. Configures all settings for the show.

**Key technical detail:**  
The heartbeat is WebAudio synthesized (two oscillators, sine + triangle), not an audio file. It plays immediately when the page loads and the user taps "Enable Sound."

---

### PHASE 2 — `reveal_sequence` (The Magic Reveal Animation)

**Triggered by host pressing:** "Show Magic" button (or `ArrowRight` on Bluetooth remote)

**What audience sees — in sequence:**

1. **Logo screen** — The mentalist's logo (configurable URL, defaults to `/logo.png`) appears full screen. Duration: configurable (`logoMs`, default 4000ms).

2. **Animation screen** — A spinning hypnotic spiral with floating emoji particles (✨💫🌟🪄💖❤️, 38 of them). Duration: configurable (`animationMs`, default 12000ms). Reveal background music starts.

3. **Reveal screen** — The reveal content appears. This is either:
   - An **image** (`revealType: "image"`) — displayed full-screen, object-fit: contain
   - A **webpage in an iframe** (`revealType: "page"`) — fills the screen below an 85px top offset to accommodate iOS browser chrome

**What the reveal URL is:**  
By default, it's a link to a specific photo on `11z.co` (Shine's platform). The URL contains a timestamp in the filename (`MMDDYYHHMM`) that Shine changes before the show. The audience sees the cat photo — which Shine has secretly pre-set to show their chosen card. This is the core mentalism effect.

**Skip animation option:**  
If `skipAnimation` is checked, the logo and spiral are skipped — the reveal appears instantly.

**iOS deep link:**  
After pressing Show Magic, if "iPhone App Launch" is enabled, the host's phone opens a configurable deep link URL (default: a Shortcuts app shortcut) after a configurable delay. This is how Shine triggers his on-device magic app invisibly during the show.

**Server phase stays `reveal_sequence`** until the host manually advances. The audience never auto-advances from the reveal.

---

### PHASE 3A — `review` via Client Splash (Messages + Photo + Review)

**Triggered by host pressing:** "Show Messages" button

**This is one of two alternative paths after the reveal. Path A uses text message cards + client photo.**

**What audience sees — in sequence:**

**Step 1: Text cards (any number, since v85)**  
Each card is shown full-screen, one at a time, with a cinematic fade in/out. Cards use a large, bold font (size configurable via `textSize`, default 6.2vw, capped at 96px). The list is dynamic (host adds/removes slides via "+ Add Slide" in the Client Splash section) -- no fixed count.

Two modes, toggled via `clientSplash.manualAdvance`:
- **Auto-timer (default, `manualAdvance: false`):** each card auto-advances after `clientSplash.durationMs` (default 3000ms), same duration for every card.
- **Manual advance (`manualAdvance: true`):** no timer at all. The audience shows whatever `clientSplash.currentCardIndex` points to and waits. The host advances with `host:splashNext`/`host:splashPrev` -- via the "◀ Prev Slide" / "Next Slide ▶" buttons in the Client Splash section, the same two buttons appearing in the live-show dock while this mode + phase are active, or the physical remote's Right/Left buttons (see Section 8). This is what lets the host hold on one slide to give live commentary before moving on.

The cards are typed by the host in the Host Control Panel with newlines preserved. Default seed: "Hope you enjoyed my show" / "Let's all wish Kylie a very happy B'Day".

**Step 2: Client photo**  
A photo of the client (the audience member who participated) is shown full-screen. Below it, a configurable text message appears (e.g., "Thank you — one last quick thing ❤️"). Duration: same `durationMs` as the cards (auto mode), or the next manual advance (manual mode) -- this step is index `cards.length` in `currentCardIndex` terms.

Photo URL: configurable via "Client Image URL" field (defaults to `/client.png`). A cache-buster `?v=timestamp` is appended automatically to force a fresh load.

**Step 3: Review redirect**  
Audience is taken to the Google Review screen, then auto-redirected to the Google review URL after a configurable delay (default: 3000ms). A countdown ("Redirecting in 3s…") is shown. In manual mode this is reached at `currentCardIndex === cards.length + 1` (one more Next past the photo).

**Background music during review phase:** The review music track plays (configurable URL, default `/review.mp3`).

---

### PHASE 3B — `karaoke` (AI-Generated Song Alternative)

**Triggered by host pressing:** "Start Karaoke" button

**This is the alternative to Phase 3A. Instead of message cards, an AI-generated personalized song plays with synchronized karaoke lyrics.**

**Pre-loading (silent, automatic):**  
When the host presses "Show Magic" (Phase 2), if karaoke URLs are configured, the server silently emits `karaoke:preload` to all audience devices. The audience devices download the MP3 and LRC lyrics file in the background so there's no loading delay when karaoke starts.

**What audience sees:**

1. **Karaoke screen** — A blurred background image (configurable, defaults to client photo or karaoke background URL) with an overlay. Three lines of lyrics are shown at a time:
   - **Previous line** (dimmed, smaller)
   - **Current line** (large, bright, glowing green highlight)
   - **Next line** (dimmed, smaller)
   
2. **"Enable Sound & Start" button** — A small, subtle button at the bottom. Audience must tap it once on iOS to unlock audio. After tapping, playback begins, synced to the host's start timestamp (`karaokeStartedAt`).

3. **Lyrics sync** — The LRC file (standard LRC format with timestamps like `[00:03.10]`) is parsed and each line is shown in sync with the audio. The display updates every 90ms.

4. **Song title** — Shown above the lyrics (configurable via "Karaoke Title" field).

**After the song ends:**  
Automatically transitions to the client photo (same photo used in Path 3A), shown with "Thank you!" text, for the configured duration. Then redirects to Google Review.

**LRC format expected (standard, line-level):**
```
[00:03.10] First line of lyrics
[00:07.45] Second line of lyrics
[00:12.20] Chorus line
```

**Enhanced LRC also supported (v107+), word-level:**
```
[00:12.00]<00:12.00>Welcome <00:12.40>home, <00:12.90>Jacquie
```
When a line has inline `<mm:ss.xx>` word tags, the karaoke screen progressively
highlights each word as its timestamp passes (bright green = sung, dim white =
upcoming) instead of just showing the whole line at once. Falls back to plain
line-level display automatically for lines with no word tags -- the two
formats can be mixed within the same file. Parsing lives in `parseLrcText()`
in `audience.js`.

---

### PHASE 4 — `review` (Google Review Screen)

**What audience sees:**  
"Thank you!" heading, a "Leave a Google Review" button, and a countdown timer. After the delay, the page navigates to the Google Review URL.

**Configurable:**
- Review URL (Google review link)
- Auto-redirect on/off
- Redirect delay in ms

---

### Reset Controls

- **Reset Phase** — Returns room to `idle`. Audience goes back to the beating heart screen.
- **Reset All** — Clears room state and localStorage settings. Full factory reset.

---

## 5. Server State Object

**Owner-configurable defaults overlay (since v84):** a `customDefaults` object (`{ revealMusicUrl?, reviewMusicUrl?, reviewUrl? }`), set via the host screen's "💾 Save as Default" button (`host:saveAsDefault`). `seededDefaultState()` = `{ ...defaultState(), ...customDefaults }` is what actually seeds a brand-new room and what Reset All restores -- NOT the raw hardcoded `defaultState()` below once a default has been saved.

**Persistence (v87):** `roomStates` and `customDefaults` used to be in-memory only (wiped on every deploy). Now backed by a small JSON file (`/data/state.json`) on a mounted Fly volume (`mindgames_data`, see `fly.toml` `[[mounts]]`) -- loaded at boot, and re-written (debounced, max once per 1.5s) on every `setState()`/`saveAsDefault`. All disk I/O is try/caught and non-fatal: if it ever fails, the show keeps running in-memory exactly as before, it just won't survive the next restart. `DATA_DIR` env var overrides `/data` for local dev machines without the volume mounted.

This is the complete state object maintained per room on the server and broadcast to all clients:

```javascript
{
  seq: 0,                        // Increments on every state change (clients use to detect stale updates)
  phase: "idle",                 // Current show phase (see below)
  revealType: "page",            // "image" | "page" — how to display the reveal URL
  revealUrl: "https://...",      // URL of the reveal content (image or webpage)
  reviewUrl: "https://...",      // Google review URL
  revealMusicUrl: "/music.mp3",  // Background music during reveal animation
  reviewMusicUrl: "/review.mp3", // Background music during review phase
  clientImageUrl: "/client.png", // Client photo shown after messages / after karaoke
  logoUrl: "",                   // Logo URL for logo animation step (empty = use /logo.png)
  
  timings: {
    logoMs: 4000,                // Duration of logo screen (ms)
    animationMs: 12000,          // Duration of spiral animation (ms)
  },
  
  skipAnimation: false,          // If true, skip logo + spiral, go straight to reveal
  
  clientSplash: {
    enabled: true,               // If false, skip all message cards and photo
    durationMs: 3000,            // Duration per card and photo step (ms) -- auto mode only
    textSize: 6.2,               // Font size for message cards (vw units, 3–10)
    cards: ["...", "..."],       // Dynamic list of slide texts (was fixed card1..card5 through v84), newlines preserved
    photoMessage: "...",         // Text shown below client photo
    manualAdvance: false,        // v85: if true, no auto-timer -- host paces via host:splashNext/Prev
    currentCardIndex: 0,         // v85: only meaningful when manualAdvance is true. 0..cards.length-1 = a card,
                                  //   cards.length = the photo step, cards.length+1 = done (show real review screen).
                                  //   Reset to 0 every time host:sendToReview (re-)enters the review phase.
  },
  
  reviewMode: {
    autoRedirect: true,          // If true, auto-redirect to review URL
    autoRedirectDelayMs: 3000,   // Delay before redirect (ms)
  },
  
  karaoke: {
    audioUrl: "",                // Public URL to MP3 file
    lrcUrl: "",                  // Public URL to .LRC lyrics file
    bgUrl: "",                   // Background image URL for karaoke screen
    title: "",                   // Song title displayed above lyrics
    endPhotoUrl: "",             // Photo shown after karaoke ends (falls back to clientImageUrl)
  },
  
  karaokeStartedAt: null,        // Timestamp (Date.now()) when host pressed Start Karaoke
                                 // Used by all audience devices to sync playback position
  
  lastUpdateTs: Date.now(),      // Timestamp of last state change
}
```

**Valid `phase` values:**
| Phase | Description |
|---|---|
| `idle` | Waiting screen — beating heart |
| `reveal_sequence` | Running logo → spiral → reveal animation |
| `revealed` | Reveal content shown, animation complete |
| `karaoke_prepare` | Karaoke screen shown, waiting for host to start |
| `karaoke` | Karaoke playing |
| `review` | Message cards → photo → Google review redirect |

---

## 6. Socket.IO Events Reference

### Host → Server
| Event | Description |
|---|---|
| `client:role` | Announce as host and join room |
| `host:saveSettings` | Save settings without changing phase |
| `host:sendReveal` | Trigger reveal sequence (or instant reveal) |
| `host:revealComplete` | Mark reveal sequence as done (auto-called by client) |
| `host:preloadKaraokeSilent` | Tell audience to preload karaoke files silently |
| `host:prepareKaraoke` | Show karaoke screen in "ready" state |
| `host:startKaraoke` | Begin karaoke playback |
| `host:sendToReview` | Trigger message cards → photo → review flow |
| `host:resetPhase` | Return to idle |
| `host:resetAll` | Full reset (now seeded from `customDefaults`, see Section 5) |
| `host:saveAsDefault` | Save current revealMusicUrl/reviewMusicUrl/reviewUrl as the new baseline defaults for fresh rooms + future Reset All (persisted to disk since v87, survives deploys) |
| `host:splashNext` | v85: advance clientSplash.currentCardIndex by 1 (clamped to cards.length+1), for manual-advance message slides |
| `host:splashPrev` | v85: move clientSplash.currentCardIndex back by 1 (clamped to 0) |
| `host:syncCheck` | Health check with callback (returns phase, counts, revision) |
| `client:keepalive` | Sent every 20s to keep socket alive on mobile |

### Server → Clients
| Event | Description |
|---|---|
| `state:update` | Full state object broadcast to all room members |
| `counts:update` | Host/audience count update |
| `karaoke:preload` | Silent preload signal sent to audience only |

### HTTP Fallback Endpoints
| Endpoint | Description |
|---|---|
| `POST /api/host/:action` | HTTP fallback for all host actions |
| `GET /state.json?room=X` | Poll current state |
| `GET /counts.json?room=X` | Poll connection counts |
| `GET /meta.json?room=X` | Server health + revision |
| `GET /health` | Simple 200 OK health check |

---

## 7. Host Control Panel — Field Reference

| UI Field | State Property | Notes |
|---|---|---|
| Reveal URL | `revealUrl` | Image URL or webpage URL |
| Logo URL | `logoUrl` | Empty = use `/logo.png` |
| Logo duration (ms) | `timings.logoMs` | Default 4000 |
| Animation duration (ms) | `timings.animationMs` | Default 12000 |
| Reveal type radio | `revealType` | "page" or "image" |
| Skip animation checkbox | `skipAnimation` | Instant reveal |
| Google review URL | `reviewUrl` | Full Google review link |
| Auto redirect checkbox | `reviewMode.autoRedirect` | |
| Redirect delay (ms) | `reviewMode.autoRedirectDelayMs` | Default 3000 |
| Client Splash enabled | `clientSplash.enabled` | |
| Manual advance checkbox | `clientSplash.manualAdvance` | v85: off = auto-timer, on = host-paced (remote/on-screen button) |
| Duration (ms) | `clientSplash.durationMs` | Auto mode only; hidden when Manual advance is on |
| Text size | `clientSplash.textSize` | vw units, 3–10 |
| Message slides (dynamic list, +Add Slide) | `clientSplash.cards` | Any number (was fixed Card 1–5 through v84), newlines preserved |
| ◀ Prev Slide / Next Slide ▶ | -- (sends `host:splashPrev`/`host:splashNext`) | Only shown while in review phase + Manual advance on; also mirrored in the live-show dock |
| Photo message | `clientSplash.photoMessage` | Text under client photo |
| Reveal Music URL | `revealMusicUrl` | MP3, loops during reveal |
| Review Music URL | `reviewMusicUrl` | MP3, loops during review |
| Client Image URL | `clientImageUrl` | Photo of client, used in splash and after karaoke |
| Karaoke MP3 URL | `karaoke.audioUrl` | Must be publicly accessible |
| Karaoke Lyrics URL | `karaoke.lrcUrl` | Must be publicly accessible .lrc file |
| Karaoke Background URL | `karaoke.bgUrl` | Optional blurred background image |
| Karaoke Title | `karaoke.title` | Shown above lyrics |
| iOS App Launch enabled | `iosLaunchEnabled` | (local only, not sent to server) |
| iOS Deep Link URL | `iosLaunchUrl` | Shortcuts or custom URL scheme |
| iOS Launch Delay (ms) | `iosLaunchDelayMs` | Default 250ms |

---

## 8. Bluetooth Remote / Keyboard Hotkeys

The host uses a Bluetooth remote clicker during the show. Arrow keys map to actions:

| Key | Action |
|---|---|
| `ArrowUp` | Show Magic (trigger reveal) |
| `ArrowRight` | Start Karaoke — **or Next Slide if in review phase with Manual advance on (v85)** |
| `ArrowDown` | Show Messages (trigger review flow) |
| `ArrowLeft` | Reset Phase — **or Prev Slide if in review phase with Manual advance on (v85)** |

> **Consolidated in v82-remote-cleanup-persist.** There is now a SINGLE `keydown` listener in `host.js` with the one-action-per-key mapping above (matching the on-screen show dock). The old three overlapping listeners were removed. Reset All is deliberately NOT on the remote (on-screen button only) so a stray `ArrowLeft` can never factory-wipe the show mid-performance.

> **v85 contextual override:** while `currentPhase === "review"` AND the Client Splash "Manual advance" checkbox is on, Right/Left are repurposed to Next/Prev slide instead of Karaoke/Reset Phase -- this is what lets one clicker pace through message slides for live commentary. Reverts to normal behavior immediately once manual advance is off or the phase changes away from review, so the remote's normal mapping is never permanently altered.

> **Show dock:** the host page has a fixed bottom control bar (Magic / [Karaoke or Messages] / Reset Phase + a live phase indicator, plus Prev/Next Slide when applicable per v85 above) so the show triggers are reachable without scrolling. The dock buttons proxy to the real section buttons, so behavior is identical to the remote and to clicking the buttons in their cards.
>
> **v86: smart 2nd slot, not two fixed buttons.** Through v85 the dock always showed separate "🎤 Karaoke" and "💬 Review" buttons, even for a show with no karaoke files configured at all (a dead button). Now there's one slot (`updateDockKaraokeSlot()` in host.js): it shows "🎤 Karaoke" only once `karaokeAudioUrl` is non-empty, otherwise "💬 Messages" (same action the old Review button had). Re-evaluated live on every `karaokeAudioUrl` edit and on settings hydration, so pasting/clearing a karaoke MP3 URL flips the dock immediately without a reload. The separate Review dock button was removed as redundant once Messages can occupy that slot.

---

## 9. Multi-Room Support

The app supports multiple simultaneous shows by appending `?room=ROOMNAME` to URLs.

- Host: `https://mentalist-inject.fly.dev/host.html?room=MYSHOW`
- Audience: `https://mentalist-inject.fly.dev/audience.html?room=MYSHOW`

Room names are sanitized to alphanumeric + `_-`, max 40 characters. Default room is `"SHOW"`.

Each room has its own independent state. Rooms are created automatically on first connection and persist to disk (v87), so they survive a server restart/redeploy.

---

## 10. Audio System

### Reveal & Review Music
- Two `<Audio>` elements pre-created at page load: `revealMusic` and `reviewMusic`
- Both loop, volume 0.7
- Sources are updated from state when URLs change
- iOS requires a user gesture — the "Enable Sound" button unlocks both audio elements

### Heartbeat Sound
- Synthesized via WebAudio API (no file) — two oscillators (sine 85→55Hz + triangle 180Hz)
- Plays during `idle` phase at ~1.05s interval (double-thump pattern)
- Stops when any other phase starts

### Karaoke Music
- A third `<Audio>` element: `karaokeMusic`, pre-loaded silently when "Show Magic" is pressed
- Audience must tap "Enable Sound & Start" button (iOS autoplay restriction)
- Playback is synced to `karaokeStartedAt` server timestamp — late-joining devices calculate elapsed time and seek to correct position

---

## 11. CSS Variables & Design Tokens

Defined in both `styles.css` (shared) and inline in `audience.html`/`host.html`:

```css
--bg: #0b0f1a          /* Page background */
--card: rgba(255,255,255,0.06)  /* Card background */
--txt: #f3f5ff         /* Primary text */
--muted: rgba(243,245,255,0.72) /* Secondary text */
--line: rgba(255,255,255,0.10)  /* Borders */
--radius: 18px         /* Card border radius */
--accent: #7c5cff      /* Purple accent (host UI) */
--danger: #ff4d6d      /* Red/danger buttons */
```

---

## 12. Known Patterns & Conventions

- **`emitHostAction(eventName, actionName, payload)`** — always sends both WebSocket + HTTP POST
- **`debounce(fn, 180ms)`** — used for settings auto-save on input
- **`runToken`** — integer incremented on every phase change; passed into async sequences so they can self-cancel if superseded
- **`isCurrentRun(token)`** — checked at every `await` point in the reveal/splash sequences
- **`warmClientImage()`** — pre-fetches `/client.png` on page load to prevent blank photo
- **`parseLrcText(text)`** — parses standard LRC format; also strips HTML tags (for exports from some karaoke generators)
- **`syncKaraokeToHostClock()`** — calculates elapsed time from `karaokeStartedAt` and seeks `karaokeMusic.currentTime` if drift > 0.35s
- **`seq` deduplication** — audience ignores state updates where `seq <= lastSeq && phase === lastPhase`

---

## 12b. The Interactive Routine (phase `interactive`)

A field of 44 emoji and 5 logos, five spoken instructions, and the whole room
ends on the client's logo. It is the one part of the app where the maths, not
the code, is the fragile thing — read this before touching it.

**Where it lives.** `public/interactive-set.js` holds the item sets, the
layouts, the instructions and the verifier. The server only tracks position:
`state.interactive = { round, revealed }`, where `round: -1` is the field with
no instruction yet. `state.interactiveLogoUrl` is the per-gig client logo.

**Two finishes, picked by whether a logo is configured.** `setFor(url)` returns
`LOGO_SET` when a client logo is set and `EMOJI_SET` when it is not. Host and
audience both call it with the same value out of show state, so they cannot
disagree about which routine is on screen.

| | live items | on screen | lattice | seed | closes on | lands on |
|---|---|---|---|---|---|---|
| `LOGO_SET` | 39 | 203 | 8x6 | 1951 | nearest LOGO | client logo, slot 27 |
| `EMOJI_SET` | 34 | 203 | 8x5 | 174 | nearest GREEN thing | 🐢 |

**Live items vs filler.** Only ~35 things on screen are part of the routine.
The other ~165 are FILLER: they match no instruction at all, and exist purely so
the field can be packed edge to edge. That split is the only way to have both a
full screen and a convergence. Adding more LIVE items does not make the routine
harder, it makes it impossible -- with faces everywhere, "the nearest face" only
moves you to a neighbour, the reachable set stops shrinking, and the room never
funnels. Filler is free because no rule can select it, so `PACK` can be tightened
until the screen is solid without touching the maths. `verifySet()` hard-fails if
any filler ever becomes reachable.

**Filler must answer to nothing**: not a face, not food, not an animal, not
something you could pick up, not a logo, and not green (the emoji set's finish is
about colour). Check candidates by looking at them RENDERED -- ❇️ is named
"sparkle" but Apple draws it as a solid green tile, which would have made it a
legitimate answer to the closing instruction.

They are genuinely separate layouts, not one layout with a swap, because
convergence depends entirely on the geometry and the two fields have different
geometry. **With no logo configured there are no logo tiles on screen at all** --
the routine must not invent a mark nobody chose. Both sets are verified on every
load, including the inactive one.

**Every round is relational** — "move to the nearest X". Nothing is absolute,
because an absolute instruction feels forced to the audience. The consequence is
that **the instructions guarantee nothing on their own; the LAYOUT is what makes
the room converge.** Roughly 1 scatter in 250 works.

**So the seeds are load-bearing.** Both were found by brute force
(`node tools/search-seed.mjs`). Changing a seed, any emoji, the number of logos,
a lattice, or any round's wording **breaks that set silently**. Re-run the
search, then paste the new seed and its `CLIENT_SLOT` back into the file.

**Why the client logo is a slot, not a value.** The room converges on a fixed
POSITION in the layout (`CLIENT_SLOT = 27`), and the per-gig logo is just the
picture drawn there. Swapping the picture cannot move anybody, so a new client
needs no new search and carries no showtime risk. Empty falls back to the show's
`logoUrl`, then to a built-in abstract mark.

**Four decoy logos are not optional.** A final instruction with one honest
answer is a naked force at the most exposed moment of the routine. Five logos are
visible and position alone decides which one a spectator reaches. The seed was
also chosen for logo SPREAD — most converging layouts huddle all five logos into
one corner, which converges easily and looks arranged.

**The verifier checks against EYESIGHT, not arithmetic.** This is the most
important thing on this page. Anything within `TOLERANCE` (18%) of the nearest
valid target counts as a legitimate choice, and `verifySet()` walks every such
branch. A set passes only if the room converges whichever plausible option each
person takes.

That rule exists because of a real failure on 2026-08-18. The verifier used to
prove convergence assuming everyone computes exact Euclidean distance; Shine
performed the routine, and on his closing move the right answer was 6.8% nearer
than the wrong one. He could not tell them apart, picked the other, and the
routine broke. **A margin you cannot see is not a margin.**

So seeds are now chosen for how much misjudgement they survive, NOT for how
well the targets spread across the screen. The layout that failed had been
picked for spread. The host panel prints the margin ("holds even if everyone
misjudges every distance by up to 30%") and `tools/search-seed.mjs` ranks on it.

**Rounds also declare AMBIGUITY.** A round's `requires` is the narrow reading;
`maybe` names categories a reasonable spectator might also include. The verifier
computes plausible choices under both readings and takes the union, so a set
passes only if the room converges whichever way people read the instruction.

Round 3 says "the nearest thing you could pick up and hold" and declares
`maybe: ['food']`, because a carrot plainly IS something you could pick up, as
is every burger and apple on screen. That gap existed from v150 (when the
wording changed from "not alive and not food", which excluded food explicitly)
until Shine asked the obvious question in v164.

**When adding or rewording a round, ask what else on screen satisfies the words
as spoken** -- not what you intended them to mean. The same discipline applies
to filler: it must satisfy NO rule, judged by how each emoji actually draws.
Two have been caught that way -- ❇️ is called "sparkle" and renders as a solid
green tile, and 🟠/🔶 render as 3D balls and gems that are obviously holdable.

`verifySet()` also still refuses a set that does not end on exactly one item,
that ends on something other than a logo, that strands anyone, that lets anyone
stand still, that lets filler become reachable, or whose closing survivors are
clustered.
The host panel runs it on load and shows ✅ or ⛔ **DO NOT PERFORM**. It also
checks that the converged index still equals `CLIENT_SLOT`. If that badge is not
green, the routine is broken — do not perform it.

---

## 13. Deployment

```bash
fly deploy -a mindgames
```

The `-a mindgames` flag is required -- `fly.toml`'s `app =` field still says the stale `mentalist-inject` name, so a bare `fly deploy` targets the wrong app.

The server is always-on (`auto_stop_machines = "off"`, `min_machines_running = 1`). This is intentional — the show cannot afford cold starts. Room state persists across deploys/restarts via the `mindgames_data` Fly volume (v87, see Section 5) -- a deploy that needs to recreate the machine (e.g. first time attaching a new volume) still restores state from disk on boot.

**After deploying:**
1. Bump `REVISION` in `server.js` before deploying (e.g., `v79-my-feature`)
2. Update `?v=XX` cache busters on `<script>` tags in HTML files

---

## 14. How to Write Enhancement Prompts

When asking Claude to build a new feature or fix a bug, include:

1. **This document** (or the relevant sections)
2. **The specific files affected** — paste the current content of `server.js`, `host.js`, `audience.js`, `host.html`, or `audience.html` as needed
3. **A clear description of the new behavior** from both the host's perspective and the audience's perspective
4. **Where it fits in the show flow** — which phase, before or after what
5. **Any new state fields needed** — mention if the server state object needs new properties
6. **Any new host UI controls needed** — which section of host.html they belong in

### Example prompt structure:
```
Here is my show app documentation: [paste this doc]
Here is the current server.js: [paste file]
Here is the current audience.js: [paste file]

I want to add: [feature description]

From the host's perspective: [what the host does]
From the audience's perspective: [what the audience sees]
This should happen between [Phase X] and [Phase Y].
The new phase/state field should be called: [name]
New host controls needed: [description]
```

---

*Document generated June 2026. App revision at time of writing: v78-remote-mapping.*
