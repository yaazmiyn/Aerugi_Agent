# Hermes Mission Control — Finish & Verify Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Get every feature of Hermes Mission Control working 100% end-to-end, verified in a real browser, then commit and push to GitHub.

**Architecture:** Flask-based local server (server.py) serves a vanilla-JS + Three.js frontend (static/). The backend proxies to Ollama for LLM chat, adds ACE (Anthropic Claude API) as a second agent execution path, and exposes adapter endpoints for Letta, Open Notebook, and Paperclip (offline-graceful when those services aren't running).

**Tech Stack:** Python 3 (stdlib + requests), Vanilla JS ES modules, Three.js 0.183.2, Ollama API, Anthropic API

---

## Context

Codex 5.4 built the full shell: all 5 pages, window management, themes, Hermes wake UI, skill arming, and all adapter surfaces. The last commit (`acaa98a`) has not been pushed because verification is incomplete. Remaining gaps:

1. Browser smoke test (window controls, drag, shelf not conclusively verified headless)
2. Dead/decorative buttons need audit
3. ACE (Anthropic Claude Exec) not wired in
4. Letta and Open Notebook are staging-only (no live API calls; graceful offline needed)
5. Skills Bay missing risk labels, session-only arming behavior, prerequisites
6. Company Ops / Research Ops adapter paths need hardening
7. Ralph on Windows: document WSL fallback
8. Temp artifacts and doc drift to clean
9. Commit + push gated on all of the above

**User constraint:** Only Ollama + Mission Control server are running. Letta/Notebook/Paperclip are offline. ACE needs ANTHROPIC_API_KEY env var.

---

## Task 1: Browser Smoke Test

**Files:** None modified — observation only

1. Start server if not running: `python server.py` in main repo directory
2. Open `http://127.0.0.1:8765/` via Playwright MCP
3. Click through all 5 pages — verify each renders without JS errors
4. Test window controls: minimize, float/dock, close, reopen from shelf
5. Test theme toggles: dark/light mode + 4 palettes
6. Test Hermes wake button — status should change to "online"
7. Send test chat — verify Ollama response
8. **Document every broken/dead control** → input for Task 2

---

## Task 2: Dead Button Audit & Fix

**Files:**
- Modify: `static/app.js`
- Modify: `static/index.html`
- Modify: `static/styles.css`

For each dead button found in Task 1:
- Wire handler if feature is implemented
- Add `disabled` + "Coming soon" tooltip if planned but not ready
- Remove from HTML if purely decorative

Fix Open Windows shelf — confirm `renderShelf()` is called on every window state change.
Verify all window state transitions: open→minimized→open, open→floating→docked, open→closed→reopened.

```bash
node --check static/app.js
git add static/app.js static/index.html static/styles.css
git commit -m "fix: wire dead controls, fix window shelf, remove decorative buttons"
```

---

## Task 3: ACE Integration (Anthropic Claude API)

**Files:**
- Modify: `server.py` — add `/api/ace/status` + `/api/ace/execute`
- Modify: `static/app.js` — add ACE panel init
- Modify: `static/index.html` — add ACE window to Command Bridge

**server.py additions:**
```python
ACE_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
ACE_MODEL = os.environ.get("ACE_MODEL", "claude-opus-4-6")
ACE_BASE_URL = "https://api.anthropic.com/v1/messages"

def handle_ace_status(self):
    self.send_json({"ok": True, "available": bool(ACE_API_KEY), "model": ACE_MODEL if ACE_API_KEY else None})

def handle_ace_execute(self, body):
    if not ACE_API_KEY:
        self.send_json({"ok": False, "error": "ANTHROPIC_API_KEY not set"}, 503)
        return
    # POST to Anthropic API, return response text
```

**Verify graceful offline:**
```bash
node -e "fetch('http://127.0.0.1:8765/api/ace/status').then(r=>r.json()).then(console.log)"
# Expected: {"ok":true,"available":false,"model":null}
```

```bash
git add server.py static/app.js static/index.html
git commit -m "feat: add ACE (Anthropic Claude Exec) integration with graceful offline fallback"
```

---

## Task 4: Letta Live Bridge (Graceful Offline)

**Files:** `server.py`, `static/app.js`

Add `probe_letta()` function that attempts `GET LETTA_URL/health` with 2s timeout.
Add `/api/letta/agents` endpoint: returns `{"ok":true,"online":false,"agents":[],"note":"Letta offline"}` when probe fails.
Update Memory Bay UI: show "Letta: offline (staging mode)" badge; disable live-sync controls.

```bash
git commit -m "feat: letta live bridge with graceful offline fallback"
```

---

## Task 5: Open Notebook Live Bridge (Graceful Offline)

**Files:** `server.py`, `static/app.js`

Same pattern as Task 4 but for port 8091.
Add `/api/notebook/status`. Show "Notebook: offline — queue staged locally" in Memory Bay.

```bash
git commit -m "feat: open notebook live bridge with graceful offline fallback"
```

---

## Task 6: Skills Bay Polish

**Files:** `static/app.js`, `static/index.html`, `static/styles.css`

1. Add `riskLevel` (`low`/`medium`/`high`) and `prereqs` array to skill definitions
2. Render risk badge + prereq chips on each skill card
3. Move armed-skill storage from `localStorage` → `sessionStorage` (session-only arming)
4. Add "Disarm All" button that clears `sessionStorage.armedSkills`

```bash
git commit -m "feat: skills bay — risk labels, prerequisites, session-only arming, disarm all"
```

---

## Task 7: Ralph on Windows — Document Fallback

**Files:** `static/index.html`, `MISSION_CONTROL_BACKLOG.md`

Add status badge to Ralph panel: "Ralph CLI — not available on Windows x64. Use WSL."
Disable all Ralph-dependent buttons with tooltip.
Update backlog to mark Ralph as "Windows Blocked — WSL Required".

```bash
git commit -m "docs: document Ralph Windows constraint, disable unavailable controls"
```

---

## Task 8: Company Ops & Research Ops Hardening

**Files:** `server.py`, `static/app.js`

Add `probe_paperclip()` and `check_gws_binary()` (use `shutil.which("gws")`).
Add `/api/company/status` endpoint.
Show offline banners in Company Ops for Paperclip and GWS.
Manually verify Research Ops create→promote flow writes to `data/research-missions/`.

```bash
git commit -m "feat: company ops graceful degradation + gws binary detection"
```

---

## Task 9: Cleanup & Documentation

**Files:** Temp PNGs to delete, `JSONHandoff.json`, `MISSION_CONTROL_BACKLOG.md`, `README.md`

```bash
rm mission_control_check.png mission_control_rail_wide.png
# Update JSONHandoff.json: set commit_after_this_pass, pushed_to_github: true
# Check off all completed backlog items
# Update README: feature status table, integration availability, ANTHROPIC_API_KEY setup
git add JSONHandoff.json MISSION_CONTROL_BACKLOG.md README.md
git commit -m "docs: update handoff, backlog, and readme to reflect completion"
```

---

## Task 10: Final End-to-End Verification (Playwright)

| Check | Tool | Expected |
|-------|------|----------|
| All 5 pages | Playwright snapshot | Render, no JS errors |
| Hermes cycle | Browser click | Wake→online→reply |
| ACE panel | Browser snapshot | "offline — set ANTHROPIC_API_KEY" |
| Letta badge | Memory Bay | "offline (staging mode)" |
| Notebook badge | Memory Bay | "offline — queue staged locally" |
| Window shelf | Browser click | Minimize→shelf→reopen |
| Skill arming | sessionStorage | Resets on new tab |
| JS syntax | `node --check` | No output |
| API health | `GET /api/status` | `ok:true` |

---

## Task 11: Commit & Push

```bash
git -C C:\Users\lamar\Hermes_Mission_Control push origin codex/hermes-mission-control
```
Expected: Pushed to `https://github.com/yaazmiyn/Aerugi_Agent.git`.
