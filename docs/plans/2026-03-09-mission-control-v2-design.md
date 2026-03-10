# Hermes Mission Control v2 — Design Document

**Date:** 2026-03-09
**Status:** Approved
**Branch:** claude/pedantic-nash (worktree from codex/hermes-mission-control)

---

## Goal

Get every feature of Hermes Mission Control working 100% end-to-end, verified in a live browser. Three major additions: ACE self-improvement loop for Hermes, a full Obsidian in-app read/write editor, and a complete Three.js UI/UX upgrade — all within the existing vaporwave/anime branding.

---

## Context

Codex 5.4 built all 5 pages, window management, themes, Hermes wake/chat UI, skill arming, vault capture, and all adapter surfaces. The commit `acaa98a` is unverified in a real browser session. Key gaps:
- ACE (Agentic Context Engineering) not wired in
- Obsidian integration read/writes work in backend but no in-app editor exists
- Three.js animations are minimal (star field + rotating planes + basic avatar)
- Headless browser couldn't conclusively verify window shelf and dragging
- Commit/push blocked until everything is verified

---

## Approach: Foundation-First

1. Live browser smoke test → fix anything actually broken
2. Build the three features in sequence (ACE, Obsidian editor, Three.js)
3. Final end-to-end verification → commit + push

---

## Feature 1: ACE Self-Improvement Loop

**What ACE is:** [ace-agent/ace](https://github.com/ace-agent/ace) — Agentic Context Engineering. A Python framework using Generator/Reflector/Curator pattern to let a model improve its own strategies without fine-tuning.

**Integration approach — auto + manual:**
- **Auto-trigger:** After every Hermes session ends (reset or tab unload), `POST /api/ace/run` fires automatically with the session transcript
- **Manual trigger:** "Run ACE Now" button in the Mission Control header for on-demand improvement cycles
- **Backend:** `server.py` installs and imports ACE, uses Ollama backend (same model already configured), chat transcript as DataProcessor input
- **Output:** ACE Curator writes `hermes_context_delta.md` to `vault/99 System/`. Next `_build_system_prompt()` loads and injects it into Hermes's context
- **UI:** Status pill on Hermes avatar panel shows `idle | running | updated`

**New backend endpoints:**
- `POST /api/ace/run` — triggers ACE improvement cycle (accepts optional transcript override)
- `GET /api/ace/status` — returns last run time, last delta summary, current status

**Files modified:**
- `server.py` — ACE runner, endpoints, session-end hook
- `static/app.js` — auto-trigger on session reset, "Run ACE Now" button handler, status pill
- `static/index.html` — ACE status pill in Hermes avatar panel, "Run ACE Now" in header

---

## Feature 2: Obsidian In-App Read/Write Editor

**Location:** New "Vault Editor" floating window in Memory Bay (alongside Letta and Notebook windows).

**Components:**
- **Vault Tree panel (left ~240px):** Folder hierarchy from vault root. Folders expand/collapse. Notes show with type icon. Click note → loads in editor.
- **Note Content panel (right):**
  - Read mode: rendered markdown (using `marked.js` or simple regex renderer)
  - Edit mode: raw `<textarea>` with monospace font
  - Toggle: "Edit / Preview" button in window title bar
  - Save button: writes back to disk
- **New Note flow:** "+" button opens a blank note form — title input + type dropdown (research, decision, memory, meeting, project, knowledge, protocol) — uses existing `_write_note` template system
- **Frontmatter display:** Small metadata panel showing note id, type, tags, status — read-only

**New backend endpoints:**
- `GET /api/vault/note?path=<relative_path>` — returns raw file content + parsed frontmatter
- `PUT /api/vault/note` — body: `{path, content}` — writes raw content back to disk
- `POST /api/vault/note` — body: `{type, title, summary, body}` — creates new note (wraps existing `_write_note`)

**Files modified:**
- `server.py` — three new vault endpoints
- `static/app.js` — vault tree renderer, note load/save/create logic
- `static/index.html` — Vault Editor window markup

---

## Feature 3: Three.js Full Visual Upgrade

### Background Scene (replaces current star field + rotating planes)

**Particle nebula system:**
- 3000+ particles with custom `ShaderMaterial`
- Glow/bloom effect via shader — no postprocessing library needed
- Palette-reactive: colors shift dynamically when user switches theme palette
  - blossom: pink/purple `#ff6eb4` / `#a855f7`
  - vapor: cyan/magenta `#00ffff` / `#ff00ff`
  - mint: teal/green `#2dd4bf` / `#4ade80`
  - sunset: orange/gold `#fb923c` / `#fbbf24`
- Slow drift motion — particles move on 3 axes with sinusoidal paths
- Nebula "clouds": 5-6 large low-opacity particle clusters at different depths

**Warp transition (page change):**
- On page switch: particles accelerate toward camera center (z-velocity spike), viewport flashes briefly
- Duration: ~600ms, then particles redistribute for new page
- Triggered by the existing page-switch logic in `app.js`

### Hermes Avatar — 5 Expressive States

| State | Visual |
|-------|--------|
| `sleeping` | Slow breathing pulse (scale 0.95→1.0 oscillation), low opacity glow ring, dimmed colors |
| `waking` | Particles swirl inward from scene into avatar circle, brightness rises, ring spins up |
| `online` | Sharp animated ring with color cycling, 3 orbiting micro-particles, mood label fades in |
| `thinking` | Avatar dims to 60%, small question-mark particle orbit, pulsing ring slows |
| `speaking` | Audio waveform rings (3 concentric animated bars) while response is streaming |

State transitions triggered by: Hermes status API polling (`/api/status`) + chat stream events.

### UI Micro-animations

**Window management:**
- Open: `transform: scale(0.85) → scale(1)` + `opacity: 0 → 1`, origin from title bar. Duration 200ms, ease-out-back.
- Close: inverse — `scale(1) → scale(0.85)` + `opacity: 1 → 0`. Duration 150ms.
- Minimize to shelf: window shrinks to small pill, slides to shelf position in Operator Dock.

**Page transitions:**
- Outgoing: `translateX(0) → translateX(-3%)` + `opacity: 1 → 0`. 250ms.
- Incoming: `translateX(3%) → translateX(0)` + `opacity: 0 → 1`. 250ms, offset by 100ms.

**Button interactions:**
- Magnetic hover: on `mousemove` near buttons, subtle `transform: translate()` push toward cursor (±4px)
- Click ripple: CSS radial ripple from click origin using a pseudo-element
- Primary action buttons: shimmer sweep animation on hover

**Skill arming:**
- Arm: particle burst from button → particles drift upward and fade (10-15 CSS-animated particles)
- Disarm: reverse — particles fall from top of button

**Chat messages:**
- New message: slides up from 12px below, opacity 0→1, duration 200ms
- Hermes response: letter-by-letter streaming with soft glow on the latest character

**Performance:** All CSS animations use only `transform` and `opacity` (GPU-composited). Three.js target 60fps, particle count scales down on lower-end GPUs via `renderer.getPixelRatio()` check.

---

## Verification Plan

After all features are built, verify with Playwright MCP:

| Check | Expected |
|-------|---------|
| All 5 pages render without JS console errors | Pass |
| Hermes wake → online → reply cycle | Working |
| ACE status pill shows `idle` on load | Correct |
| Manual "Run ACE Now" button visible in header | Present |
| Vault Editor window opens in Memory Bay | Opens |
| Vault tree renders folder list | Shows folders |
| Open a vault note → renders content | Displays markdown |
| Edit mode → save → file updated on disk | Writes file |
| Create new note → appears in tree | Creates note |
| Theme palette change → particle colors shift | Colors update |
| Hermes avatar states: sleeping/online/thinking/speaking | All animate |
| Window open/close animations | Smooth transitions |
| Page switch warp effect | Visible flash + particle warp |
| Skill arm → particle burst | Visual burst fires |
| All buttons lead somewhere intentional | No dead controls |

---

## Files to Modify

| File | Changes |
|------|---------|
| `server.py` | ACE endpoints + runner, vault note CRUD endpoints, session-end hook |
| `static/app.js` | ACE auto-trigger + button, vault editor logic, Three.js scene rewrite, micro-animations |
| `static/index.html` | ACE status pill, "Run ACE Now" button, Vault Editor window |
| `static/styles.css` | Animation keyframes, transition utilities, skill burst particles, window animations |

---

## Constraints

- Local-first: ACE uses Ollama (already configured), no external API calls
- All files stay in `C:\Users\lamar\Hermes_Mission_Control` (outside OneDrive)
- No new npm dependencies — use vanilla JS and Three.js (already in vendor/)
- Commit only after full end-to-end verification passes
