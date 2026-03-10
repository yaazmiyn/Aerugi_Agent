# Hermes Mission Control v2 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete Hermes Mission Control to 100% — every button functional, ACE self-improvement loop wired, full Obsidian in-app read/write editor, and a Three.js visual upgrade — then commit and push.

**Architecture:** Python HTTP server (`server.py`, `ThreadingHTTPServer`) serves a vanilla-JS + Three.js frontend (`static/`). New features: ACE (ace-agent/ace) runs after every Hermes session using Ollama as its model backend; vault note CRUD endpoints enable an in-app Obsidian editor in Memory Bay; Three.js background upgrades from a star field to a particle nebula with palette-reactive shaders, and UI micro-animations are added via CSS keyframes + JS event listeners.

**Tech Stack:** Python 3 stdlib + pip (ace-agent), Vanilla JS ES modules, Three.js 0.183.2 (vendor/), Ollama OpenAI-compatible API, `marked.js` (CDN or inline for markdown rendering)

---

## Context

- **Main repo:** `C:\Users\lamar\Hermes_Mission_Control`
- **Working branch:** `codex/hermes-mission-control` (worktree: `claude/pedantic-nash`)
- **Server:** `python server.py` → `http://127.0.0.1:8765`
- **Handler class:** `MissionRequestHandler` in `server.py:1134`
- **JSON helper:** `self._write_json(HTTPStatus.OK, payload)` at `server.py:1265`
- **Read helper:** `self._read_json()` at `server.py:1260`
- **Frontend API:** `fetchJSON(url, options)` at `app.js:290`
- **Three.js state:** `appState.scene = { renderer, scene, camera, starField, planes }` at `app.js:1688`
- **Avatar state:** `appState.avatar.presence` — values: `"boot"`, `"offline"`, `"degraded"`, `"waking"`, `"online"`
- **Page switch:** `setPage(page, persist=true)` at `app.js:866`
- **Palette:** `body[data-ui-palette="blossom|vapor|mint|sunset"]` CSS overrides
- **Obsidian write:** `_write_note(note_type, title, summary, body, source)` at `server.py:747`
- **Vault index:** `_vault_index(write_files=True)` at `server.py:675`
- **Session reset:** `reset_session(wipe_chat_log)` at `server.py:642`
- **do_GET routing:** `server.py:1141` — `if parsed.path == "/api/..."` chain
- **do_POST routing:** `server.py:1194` — same pattern

---

## Task 1: Browser Smoke Test

**Files:** No changes — observation only.

**Step 1: Ensure server is running**
```bash
cd C:\Users\lamar\Hermes_Mission_Control
python server.py
```
Expected output: `Hermes Mission Control running on http://127.0.0.1:8765`

If already running:
```bash
node -e "fetch('http://127.0.0.1:8765/api/status').then(r=>r.json()).then(d=>console.log('ok:', d.ok))"
```
Expected: `ok: true`

**Step 2: Open in Playwright browser**
Use `mcp__plugin_playwright_playwright__browser_navigate` → `http://127.0.0.1:8765/`
Take snapshot with `mcp__plugin_playwright_playwright__browser_snapshot`

**Step 3: Verify each of the 5 nav pages loads**
Click each nav button: Command Bridge, Skills Bay, Memory Bay, Research Ops, Company Ops.
Take a snapshot after each. Expected: page content visible, no error overlay.

**Step 4: Verify window controls on Command Bridge**
Test these in order for one window (e.g., `#system-link-window`):
- Click minimize → title bar only visible
- Click float/dock → window becomes draggable
- Click close → window disappears, reopen from shelf in Operator Dock

**Step 5: Verify Hermes wake + chat**
- Click Wake Hermes button
- Check avatar status pill changes to "waking" then "online"
- Type "hello" in chat input, click Send
- Expected: response appears in chat from Hermes

**Step 6: Check browser console for JS errors**
Use `mcp__plugin_playwright_playwright__browser_console_messages` with level `"error"`
Expected: no errors.

**Step 7: Document any broken controls**
Note anything that does not respond. This is the fix list.

---

## Task 2: ACE Self-Improvement Loop — Backend

**Files:**
- Modify: `C:\Users\lamar\Hermes_Mission_Control\server.py`

ACE (https://github.com/ace-agent/ace) is an Agentic Context Engineering framework. It uses a Generator/Reflector/Curator loop to extract strategies from task trajectories and write delta updates to a context file. We configure it to use the Ollama OpenAI-compatible endpoint so no new model backend is needed.

**Step 1: Install ACE**
```bash
cd C:\Users\lamar\Hermes_Mission_Control
pip install ace-agent
```
Expected: `Successfully installed ace-agent-...`

If pip install fails (ACE may need to be cloned directly):
```bash
git clone https://github.com/ace-agent/ace external/ace
pip install -e external/ace
```

**Step 2: Add ACE imports and constants to server.py**

At `server.py` after line 21 (end of stdlib imports), add:

```python
# ACE self-improvement
ACE_CONTEXT_DELTA_PATH = ROOT / ".letta" / "memory" / "hermes_context_delta.md"
ACE_OLLAMA_BASE = OLLAMA_BASE_URL.replace("/v1", "")  # http://127.0.0.1:11434
```

**Step 3: Add `HermesDataProcessor` class to server.py**

Add after the `default_state()` function (around line 470), before the `MissionService` class:

```python
class HermesDataProcessor:
    """ACE DataProcessor that uses a Hermes chat transcript as task data."""

    def __init__(self, transcript: list[dict]) -> None:
        self.transcript = transcript

    def process_task_data(self) -> list[dict]:
        pairs = []
        msgs = self.transcript
        for i in range(0, len(msgs) - 1, 2):
            if msgs[i].get("role") == "user" and i + 1 < len(msgs) and msgs[i + 1].get("role") == "assistant":
                pairs.append({
                    "input": msgs[i]["content"],
                    "output": msgs[i + 1]["content"],
                    "task_id": f"turn_{i // 2}",
                })
        return pairs

    def answer_is_correct(self, task: dict, prediction: str) -> bool:
        # Heuristic: a response is "correct" if it is non-empty and not an error
        p = (prediction or "").strip()
        return bool(p) and not p.lower().startswith("error") and len(p) > 20

    def evaluate_accuracy(self, tasks: list[dict], predictions: list[str]) -> float:
        if not tasks:
            return 0.0
        correct = sum(1 for t, p in zip(tasks, predictions) if self.answer_is_correct(t, p))
        return correct / len(tasks)
```

**Step 4: Add `run_ace_loop()` method to `MissionService` class**

Find the `MissionService` class (around line 480) and add this method after `reset_session()`:

```python
def run_ace_loop(self, transcript: list[dict] | None = None) -> dict[str, Any]:
    """Run an ACE self-improvement cycle on the current (or provided) chat transcript."""
    with self.lock:
        log = transcript if transcript is not None else list(self.state.get("chat_log", []))

    if len(log) < 4:
        return {"ok": True, "skipped": True, "reason": "Transcript too short for ACE (need ≥ 4 turns)."}

    try:
        from ace import ACE  # installed via pip install ace-agent
    except ImportError:
        return {"ok": False, "error": "ACE not installed. Run: pip install ace-agent"}

    try:
        import openai
        # Configure ACE to use Ollama's OpenAI-compatible endpoint
        client = openai.OpenAI(base_url=f"{OLLAMA_BASE_URL}", api_key="ollama")
        processor = HermesDataProcessor(log)
        ace = ACE(client=client, model=DEFAULT_MODEL)
        result = ace.run(mode="offline", data_processor=processor)
        delta = result.get("context_delta") or result.get("curator_output") or str(result)

        # Write delta to vault system folder
        ACE_CONTEXT_DELTA_PATH.parent.mkdir(parents=True, exist_ok=True)
        timestamp = utc_now()
        existing = ACE_CONTEXT_DELTA_PATH.read_text(encoding="utf-8") if ACE_CONTEXT_DELTA_PATH.exists() else ""
        entry = f"\n\n---\n## ACE Delta — {timestamp}\n\n{delta.strip()}\n"
        ACE_CONTEXT_DELTA_PATH.write_text(existing + entry, encoding="utf-8")

        with self.lock:
            self.state["last_ace_run_at"] = timestamp
            self.state["last_ace_delta_summary"] = delta[:200].strip()
            self._save_state()

        return {"ok": True, "delta_summary": delta[:200], "timestamp": timestamp}
    except Exception as exc:
        return {"ok": False, "error": str(exc), "trace": traceback.format_exc(limit=4)}
```

**Step 5: Add `/api/ace/run` and `/api/ace/status` to `do_GET` and `do_POST` routing**

In `do_GET` (around `server.py:1141`), add before the final `else` / 404 branch:
```python
elif parsed.path == "/api/ace/status":
    self._write_json(HTTPStatus.OK, {
        "ok": True,
        "last_run_at": SERVICE.state.get("last_ace_run_at"),
        "last_delta_summary": SERVICE.state.get("last_ace_delta_summary"),
        "delta_file_exists": ACE_CONTEXT_DELTA_PATH.exists(),
    })
```

In `do_POST` (around `server.py:1194`), add before the final `else` / 404 branch:
```python
elif parsed.path == "/api/ace/run":
    body = self._read_json()
    transcript = body.get("transcript")  # optional override
    self._write_json(HTTPStatus.OK, SERVICE.run_ace_loop(transcript))
```

**Step 6: Inject ACE delta into `_build_system_prompt()`**

In `_build_system_prompt()` at `server.py:592`, after the `return (...)` string is built, modify the return to append the delta:

```python
def _build_system_prompt(self) -> str:
    # ... existing code up to the return statement ...
    base_prompt = (
        "You are Hermes Mission Control, ..."
        # ... existing return string ...
    )
    # Inject ACE delta if available
    if ACE_CONTEXT_DELTA_PATH.exists():
        try:
            delta_text = ACE_CONTEXT_DELTA_PATH.read_text(encoding="utf-8").strip()
            if delta_text:
                base_prompt += f"\n\nAdaptive context (ACE delta):\n{delta_text[-1200:]}"
        except Exception:
            pass
    return base_prompt
```

**Step 7: Auto-trigger ACE from `reset_session()`**

In `reset_session()` at `server.py:642`, add an async-style background thread call after rebuilding the agent:

```python
def reset_session(self, wipe_chat_log: bool = False) -> dict[str, Any]:
    with self.lock:
        log_snapshot = list(self.state.get("chat_log", []))
        if wipe_chat_log:
            self.state["chat_log"] = []
        self.agent = self._build_agent()
        self._save_state()

    # Fire ACE in background so reset returns immediately
    def _ace_bg():
        try:
            self.run_ace_loop(log_snapshot)
        except Exception:
            pass
    threading.Thread(target=_ace_bg, daemon=True).start()

    return self.get_status()
```

**Step 8: Verify the new endpoints**
```bash
node -e "fetch('http://127.0.0.1:8765/api/ace/status').then(r=>r.json()).then(console.log)"
```
Expected: `{ ok: true, last_run_at: null, last_delta_summary: null, delta_file_exists: false }`

```bash
node --check C:\Users\lamar\Hermes_Mission_Control\server.py 2>&1 || python -c "import py_compile; py_compile.compile('server.py', doraise=True); print('OK')"
```

**Step 9: Commit**
```bash
git -C C:\Users\lamar\Hermes_Mission_Control add server.py
git -C C:\Users\lamar\Hermes_Mission_Control commit -m "feat: ACE self-improvement loop — auto-runs after session reset, manual /api/ace/run endpoint"
```

---

## Task 3: ACE Frontend — Status Pill + Manual Trigger

**Files:**
- Modify: `C:\Users\lamar\Hermes_Mission_Control\static\index.html`
- Modify: `C:\Users\lamar\Hermes_Mission_Control\static\app.js`
- Modify: `C:\Users\lamar\Hermes_Mission_Control\static\styles.css`

**Step 1: Add ACE status pill to the Hermes Live window in index.html**

Find `#hermes-live-window` in `index.html`. Inside its `.panel-body`, after the avatar stage div, add:

```html
<div class="ace-status-bar" id="ace-status-bar">
  <span class="ace-label">ACE</span>
  <span class="ace-pill" id="ace-pill" data-ace-state="idle">idle</span>
  <button class="btn-ghost ace-run-btn" id="ace-run-btn" data-help="Run ACE self-improvement cycle now">Run Now</button>
</div>
```

**Step 2: Add "Run ACE Now" button to the main header in index.html**

Find the main header / top bar in `index.html` (the area with save-state-btn, export-btn, reset-btn). Add:

```html
<button id="ace-header-run-btn" class="btn-ghost btn-sm" data-help="Trigger ACE improvement cycle on current session">
  ⟳ ACE
</button>
```

**Step 3: Add ACE CSS to styles.css**

At the end of `styles.css`, add:

```css
/* ── ACE Status Bar ─────────────────────────────── */
.ace-status-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-top: 1px solid var(--line-soft);
  font-size: 0.72rem;
  color: var(--ink);
}
.ace-label {
  font-weight: 700;
  letter-spacing: 0.08em;
  color: var(--lilac-400);
}
.ace-pill {
  padding: 2px 8px;
  border-radius: 20px;
  font-size: 0.68rem;
  font-weight: 600;
  background: var(--lilac-200);
  color: var(--ink-strong);
  transition: background 300ms ease, color 300ms ease;
}
.ace-pill[data-ace-state="running"] {
  background: var(--warning);
  color: #7a4010;
  animation: acePulse 1.2s ease-in-out infinite;
}
.ace-pill[data-ace-state="updated"] {
  background: var(--success);
  color: #1a5c50;
}
.ace-pill[data-ace-state="error"] {
  background: var(--danger);
  color: #7a1530;
}
.ace-run-btn {
  margin-left: auto;
  font-size: 0.68rem;
  padding: 2px 8px;
}
@keyframes acePulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.55; }
}
```

**Step 4: Add ACE state management to app.js**

After `fetchJSON` definition (around `app.js:295`), add:

```js
// ── ACE Self-Improvement ──────────────────────────
const aceState = { status: "idle", lastRun: null };

function setAceStatus(status, label) {
  aceState.status = status;
  const pill = document.getElementById("ace-pill");
  if (pill) {
    pill.dataset.aceState = status;
    pill.textContent = label || status;
  }
}

async function runAce(transcript) {
  setAceStatus("running", "running…");
  try {
    const body = transcript ? { transcript } : {};
    const result = await fetchJSON("/api/ace/run", {
      method: "POST",
      body: JSON.stringify(body),
    });
    if (result.skipped) {
      setAceStatus("idle", "idle (short)");
    } else {
      setAceStatus("updated", "updated ✓");
      aceState.lastRun = result.timestamp;
      setTimeout(() => setAceStatus("idle", "idle"), 8000);
    }
  } catch (err) {
    setAceStatus("error", "error");
    console.warn("ACE run failed:", err.message);
    setTimeout(() => setAceStatus("idle", "idle"), 5000);
  }
}

async function initAce() {
  const status = await fetchJSON("/api/ace/status").catch(() => null);
  if (status?.last_run_at) {
    setAceStatus("idle", "idle");
  }
  // Manual "Run Now" buttons
  const wireAceBtn = (id) => {
    const btn = document.getElementById(id);
    if (btn) btn.addEventListener("click", () => runAce());
  };
  wireAceBtn("ace-run-btn");
  wireAceBtn("ace-header-run-btn");
}
```

**Step 5: Auto-trigger ACE after session reset**

Find the reset button handler in `app.js`. It calls `POST /api/reset`. Modify the handler to also call `runAce()` with the current chat log before wiping:

```js
// Find the existing reset handler (search for "api/reset")
// It should look like:
//   elements.resetBtn.addEventListener("click", async () => { ... })
// Add runAce call BEFORE the fetchJSON("/api/reset") call:

// Before: await fetchJSON("/api/reset", { method: "POST", ... })
// After:
const chatLogSnapshot = appState.mission?.chat_log ? [...appState.mission.chat_log] : [];
await runAce(chatLogSnapshot);  // fire but don't await result — non-blocking via UI
await fetchJSON("/api/reset", { method: "POST", body: JSON.stringify({ wipe_chat_log: true }) });
```

**Step 6: Call `initAce()` in `DOMContentLoaded`**

Find the `DOMContentLoaded` handler in `app.js` (around line 1733). Add `initAce()` to the init sequence after `initScene()`:

```js
initScene();
initAce();  // add this line
```

**Step 7: Verify in browser**
- Reload `http://127.0.0.1:8765/`
- Check Hermes Live window has ACE status bar with "idle" pill and "Run Now" button
- Check header has "⟳ ACE" button
- Click "Run Now" — pill should briefly show "running…" then "idle (short)" (transcript too short)
- Check console: no JS errors

**Step 8: Commit**
```bash
git -C C:\Users\lamar\Hermes_Mission_Control add static/app.js static/index.html static/styles.css
git -C C:\Users\lamar\Hermes_Mission_Control commit -m "feat: ACE frontend — status pill, Run Now button, auto-trigger on session reset"
```

---

## Task 4: Obsidian Editor — Backend Endpoints

**Files:**
- Modify: `C:\Users\lamar\Hermes_Mission_Control\server.py`

**Step 1: Add `get_vault_note()` method to `MissionService`**

After `_vault_index()` (around `server.py:695`), add:

```python
def get_vault_note(self, relative_path: str) -> dict[str, Any]:
    """Return the raw content and frontmatter of a vault note by relative path."""
    root = self._vault_root()
    path = (root / relative_path).resolve()
    # Safety: must stay within vault root
    if not str(path).startswith(str(root.resolve())):
        return {"ok": False, "error": "Path outside vault."}
    if not path.exists():
        return {"ok": False, "error": "Note not found."}
    raw = path.read_text(encoding="utf-8", errors="ignore")
    meta, body = split_frontmatter(raw)
    return {
        "ok": True,
        "relative_path": relative_path,
        "raw": raw,
        "frontmatter": meta,
        "body": body,
        "title": str(meta.get("title") or path.stem.replace("-", " ").title()),
        "note_type": str(meta.get("type") or "note"),
    }

def update_vault_note(self, relative_path: str, content: str) -> dict[str, Any]:
    """Overwrite a vault note with new raw markdown content."""
    root = self._vault_root()
    path = (root / relative_path).resolve()
    if not str(path).startswith(str(root.resolve())):
        return {"ok": False, "error": "Path outside vault."}
    if not path.exists():
        return {"ok": False, "error": "Note not found."}
    path.write_text(content, encoding="utf-8")
    # Rebuild index
    self._vault_index(write_files=True)
    return {"ok": True, "relative_path": relative_path, "saved_at": utc_now()}

def get_vault_tree(self) -> dict[str, Any]:
    """Return the vault folder/file tree for the in-app editor sidebar."""
    root = self._vault_root()
    if not root.exists():
        return {"ok": True, "tree": [], "vault_path": str(root), "exists": False}
    tree = []
    for folder in sorted(root.iterdir()):
        if folder.is_dir() and not folder.name.startswith(".") and folder.name != "90 Templates":
            notes = []
            for md in sorted(folder.rglob("*.md")):
                if "99 System" not in md.parts:
                    meta, _ = split_frontmatter(md.read_text(encoding="utf-8", errors="ignore"))
                    notes.append({
                        "title": str(meta.get("title") or md.stem.replace("-", " ").title()),
                        "type": str(meta.get("type") or "note"),
                        "relative_path": str(md.relative_to(root)),
                        "updated": str(meta.get("updated") or ""),
                    })
            tree.append({"folder": folder.name, "notes": notes})
    return {"ok": True, "tree": tree, "vault_path": str(root), "exists": True}
```

**Step 2: Add vault CRUD routes to `do_GET` and `do_POST`**

In `do_GET` (after existing `/api/vault/index` route), add:

```python
elif parsed.path == "/api/vault/tree":
    self._write_json(HTTPStatus.OK, SERVICE.get_vault_tree())
elif parsed.path == "/api/vault/note":
    from urllib.parse import parse_qs
    qs = parse_qs(urlparse(self.path).query)
    rel = qs.get("path", [""])[0]
    if not rel:
        self._write_json(HTTPStatus.BAD_REQUEST, {"ok": False, "error": "path param required"})
    else:
        self._write_json(HTTPStatus.OK, SERVICE.get_vault_note(rel))
```

In `do_POST` (after existing `/api/vault/capture` route), add:

```python
elif parsed.path == "/api/vault/note":
    # PUT-style update: {path, content}
    body = self._read_json()
    rel_path = body.get("path", "")
    content = body.get("content", "")
    if not rel_path or not content:
        self._write_json(HTTPStatus.BAD_REQUEST, {"ok": False, "error": "path and content required"})
    else:
        self._write_json(HTTPStatus.OK, SERVICE.update_vault_note(rel_path, content))
elif parsed.path == "/api/vault/note/new":
    # Create new note
    body = self._read_json()
    result = SERVICE._write_note(
        note_type=body.get("type", "knowledge"),
        title=body.get("title", "Untitled"),
        summary=body.get("summary", ""),
        body=body.get("body", ""),
        source="mission-control",
    )
    self._write_json(HTTPStatus.OK, {"ok": True, **result})
```

**Step 3: Verify endpoints**
```bash
node -e "fetch('http://127.0.0.1:8765/api/vault/tree').then(r=>r.json()).then(d=>console.log('folders:', d.tree?.length))"
```
Expected: `folders: <number>` (or 0 if vault not bootstrapped)

```bash
python -c "import py_compile; py_compile.compile('server.py', doraise=True); print('syntax OK')"
```

**Step 4: Commit**
```bash
git -C C:\Users\lamar\Hermes_Mission_Control add server.py
git -C C:\Users\lamar\Hermes_Mission_Control commit -m "feat: vault note CRUD endpoints — GET tree, GET/POST note, POST note/new"
```

---

## Task 5: Obsidian Editor — Frontend (Vault Editor Window)

**Files:**
- Modify: `C:\Users\lamar\Hermes_Mission_Control\static\index.html`
- Modify: `C:\Users\lamar\Hermes_Mission_Control\static\app.js`
- Modify: `C:\Users\lamar\Hermes_Mission_Control\static\styles.css`

**Step 1: Add Vault Editor window HTML to the Memory Bay page in index.html**

Find `<section class="page" data-page="memory-bay">` in `index.html`.
Inside the page section, add a new window after the existing windows:

```html
<section id="vault-editor-window" class="window panel-window vault-editor-window">
  <div class="title-bar">
    <span>Vault Editor</span>
    <div class="title-bar-actions">
      <button class="btn-ghost btn-xs" id="vault-new-note-btn" data-help="Create a new vault note">+ New Note</button>
    </div>
    <div class="title-buttons" aria-hidden="true"><span></span><span></span><span></span></div>
  </div>
  <div class="panel-body vault-editor-body">
    <!-- Left: Vault Tree -->
    <div class="vault-tree-panel" id="vault-tree-panel">
      <div class="vault-tree-header">
        <span>Vault</span>
        <button class="btn-ghost btn-xs" id="vault-refresh-tree-btn" data-help="Refresh vault file tree">↻</button>
      </div>
      <div id="vault-tree-list" class="vault-tree-list">
        <p class="muted">Loading vault…</p>
      </div>
    </div>
    <!-- Right: Note Viewer/Editor -->
    <div class="vault-note-panel" id="vault-note-panel">
      <div class="vault-note-toolbar" id="vault-note-toolbar" style="display:none">
        <span class="vault-note-title-display" id="vault-note-title-display"></span>
        <div class="vault-note-actions">
          <button class="btn-ghost btn-xs" id="vault-edit-toggle-btn">Edit</button>
          <button class="btn-primary btn-xs" id="vault-save-btn" style="display:none">Save</button>
        </div>
      </div>
      <div id="vault-note-preview" class="vault-note-preview">
        <p class="muted center">Select a note from the vault tree.</p>
      </div>
      <textarea id="vault-note-editor" class="vault-note-editor" style="display:none" spellcheck="false"></textarea>
    </div>
  </div>
  <!-- New Note Modal -->
  <div class="vault-new-note-modal" id="vault-new-note-modal" style="display:none">
    <div class="modal-inner">
      <h3>New Vault Note</h3>
      <label>Title <input type="text" id="new-note-title" placeholder="Note title…" /></label>
      <label>Type
        <select id="new-note-type">
          <option value="knowledge">Knowledge</option>
          <option value="research">Research</option>
          <option value="decision">Decision</option>
          <option value="memory">Memory</option>
          <option value="meeting">Meeting</option>
          <option value="project">Project</option>
          <option value="protocol">Protocol</option>
        </select>
      </label>
      <label>Summary <input type="text" id="new-note-summary" placeholder="One-line summary…" /></label>
      <label>Body <textarea id="new-note-body" rows="4" placeholder="Note body…"></textarea></label>
      <div class="modal-actions">
        <button class="btn-primary" id="new-note-create-btn">Create Note</button>
        <button class="btn-ghost" id="new-note-cancel-btn">Cancel</button>
      </div>
    </div>
  </div>
</section>
```

**Step 2: Add Vault Editor CSS to styles.css**

At end of `styles.css`:

```css
/* ── Vault Editor ─────────────────────────────────── */
.vault-editor-window { min-height: 420px; }

.vault-editor-body {
  display: grid;
  grid-template-columns: 220px 1fr;
  height: calc(100% - 36px);
  overflow: hidden;
}

.vault-tree-panel {
  border-right: 1px solid var(--line-soft);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.vault-tree-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--ink);
  border-bottom: 1px solid var(--line-soft);
  background: var(--paper-strong);
}

.vault-tree-list {
  flex: 1;
  overflow-y: auto;
  padding: 6px 0;
}

.vault-folder-name {
  padding: 4px 10px;
  font-size: 0.7rem;
  font-weight: 700;
  color: var(--ink);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  cursor: pointer;
  user-select: none;
}

.vault-folder-name:hover { background: var(--rose-100); }

.vault-note-item {
  padding: 4px 10px 4px 20px;
  font-size: 0.73rem;
  cursor: pointer;
  color: var(--ink);
  border-left: 2px solid transparent;
  transition: background 120ms, border-color 120ms;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.vault-note-item:hover { background: var(--rose-100); }
.vault-note-item.is-active {
  background: var(--lilac-200);
  border-left-color: var(--lilac-400);
  font-weight: 600;
}

.vault-note-panel {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.vault-note-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 5px 10px;
  border-bottom: 1px solid var(--line-soft);
  background: var(--paper-strong);
  font-size: 0.75rem;
  gap: 8px;
}

.vault-note-title-display {
  font-weight: 600;
  color: var(--ink-strong);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.vault-note-actions { display: flex; gap: 6px; }

.vault-note-preview {
  flex: 1;
  overflow-y: auto;
  padding: 14px 16px;
  font-size: 0.82rem;
  line-height: 1.65;
  color: var(--ink);
}

.vault-note-editor {
  flex: 1;
  border: none;
  outline: none;
  padding: 14px 16px;
  font-family: "Fira Code", "Consolas", monospace;
  font-size: 0.78rem;
  line-height: 1.6;
  resize: none;
  background: transparent;
  color: var(--ink);
}

.vault-new-note-modal {
  position: absolute;
  inset: 0;
  background: rgba(255,248,253,0.95);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
  backdrop-filter: blur(4px);
}

.vault-new-note-modal .modal-inner {
  background: var(--paper-strong);
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 20px 24px;
  width: 360px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  box-shadow: var(--shadow-soft);
}

.vault-new-note-modal h3 {
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--ink-strong);
  margin: 0 0 4px;
}

.vault-new-note-modal label {
  display: flex;
  flex-direction: column;
  gap: 3px;
  font-size: 0.72rem;
  color: var(--ink);
}

.vault-new-note-modal input,
.vault-new-note-modal select,
.vault-new-note-modal textarea {
  padding: 5px 8px;
  border: 1px solid var(--line-soft);
  border-radius: 6px;
  font-size: 0.76rem;
  background: var(--paper);
  color: var(--ink);
}

.modal-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 6px;
}
```

**Step 3: Add Vault Editor JS to app.js**

After the ACE section (after `initAce()`), add a new section:

```js
// ── Vault Editor ──────────────────────────────────
const vaultEditor = {
  currentPath: null,
  isEditing: false,
  treeData: [],
};

// Simple markdown → HTML renderer (no external dependency)
function renderMarkdown(md) {
  return md
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/^---[\s\S]*?---\n/, "")  // strip frontmatter
    .replace(/^#{1}\s(.+)$/gm, "<h1>$1</h1>")
    .replace(/^#{2}\s(.+)$/gm, "<h2>$1</h2>")
    .replace(/^#{3}\s(.+)$/gm, "<h3>$1</h3>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    .replace(/(<li>[\s\S]+?<\/li>)/g, "<ul>$1</ul>")
    .replace(/\n\n/g, "</p><p>")
    .replace(/^(?!<[hup])/gm, "<p>")
    .replace(/(?<![>])$/gm, "</p>")
    .replace(/<p><\/p>/g, "");
}

async function loadVaultTree() {
  const treeEl = document.getElementById("vault-tree-list");
  if (!treeEl) return;
  treeEl.innerHTML = '<p class="muted">Loading…</p>';
  try {
    const data = await fetchJSON("/api/vault/tree");
    vaultEditor.treeData = data.tree || [];
    renderVaultTree(vaultEditor.treeData);
  } catch (err) {
    treeEl.innerHTML = `<p class="error-text">Could not load vault: ${err.message}</p>`;
  }
}

function renderVaultTree(tree) {
  const treeEl = document.getElementById("vault-tree-list");
  if (!treeEl) return;
  if (!tree.length) {
    treeEl.innerHTML = '<p class="muted" style="padding:10px">Vault is empty. Bootstrap it in the Memory panel.</p>';
    return;
  }
  treeEl.innerHTML = tree.map(folder => `
    <div class="vault-folder-group">
      <div class="vault-folder-name">📁 ${folder.folder}</div>
      ${folder.notes.map(note => `
        <div class="vault-note-item" data-note-path="${note.relative_path}" title="${note.title}">
          ${note.title}
        </div>
      `).join("")}
    </div>
  `).join("");

  treeEl.querySelectorAll(".vault-note-item").forEach(item => {
    item.addEventListener("click", () => openVaultNote(item.dataset.notePath, item.textContent.trim()));
  });
}

async function openVaultNote(relativePath, title) {
  // Update active state in tree
  document.querySelectorAll(".vault-note-item").forEach(el => {
    el.classList.toggle("is-active", el.dataset.notePath === relativePath);
  });
  vaultEditor.currentPath = relativePath;
  vaultEditor.isEditing = false;

  const toolbar = document.getElementById("vault-note-toolbar");
  const titleEl = document.getElementById("vault-note-title-display");
  const preview = document.getElementById("vault-note-preview");
  const editor = document.getElementById("vault-note-editor");
  const editBtn = document.getElementById("vault-edit-toggle-btn");
  const saveBtn = document.getElementById("vault-save-btn");

  toolbar.style.display = "flex";
  titleEl.textContent = title;
  preview.innerHTML = '<p class="muted">Loading…</p>';
  preview.style.display = "block";
  editor.style.display = "none";
  editBtn.textContent = "Edit";
  saveBtn.style.display = "none";

  try {
    const data = await fetchJSON(`/api/vault/note?path=${encodeURIComponent(relativePath)}`);
    preview.innerHTML = renderMarkdown(data.raw);
    editor.value = data.raw;
  } catch (err) {
    preview.innerHTML = `<p class="error-text">Could not load note: ${err.message}</p>`;
  }
}

async function saveVaultNote() {
  if (!vaultEditor.currentPath) return;
  const editor = document.getElementById("vault-note-editor");
  const saveBtn = document.getElementById("vault-save-btn");
  const preview = document.getElementById("vault-note-preview");
  saveBtn.textContent = "Saving…";
  try {
    await fetchJSON("/api/vault/note", {
      method: "POST",
      body: JSON.stringify({ path: vaultEditor.currentPath, content: editor.value }),
    });
    preview.innerHTML = renderMarkdown(editor.value);
    saveBtn.textContent = "Saved ✓";
    setTimeout(() => { saveBtn.textContent = "Save"; }, 2000);
  } catch (err) {
    saveBtn.textContent = "Error";
    setTimeout(() => { saveBtn.textContent = "Save"; }, 2000);
  }
}

async function createVaultNote() {
  const title = document.getElementById("new-note-title").value.trim();
  const type = document.getElementById("new-note-type").value;
  const summary = document.getElementById("new-note-summary").value.trim();
  const body = document.getElementById("new-note-body").value.trim();
  if (!title) {
    document.getElementById("new-note-title").focus();
    return;
  }
  const btn = document.getElementById("new-note-create-btn");
  btn.textContent = "Creating…";
  try {
    const result = await fetchJSON("/api/vault/note/new", {
      method: "POST",
      body: JSON.stringify({ type, title, summary, body }),
    });
    document.getElementById("vault-new-note-modal").style.display = "none";
    await loadVaultTree();
    if (result.id) {
      // Find and open the new note
      const allItems = document.querySelectorAll(".vault-note-item");
      for (const item of allItems) {
        if (item.dataset.notePath && item.dataset.notePath.includes(result.id)) {
          item.click();
          break;
        }
      }
    }
  } catch (err) {
    btn.textContent = "Error";
    setTimeout(() => { btn.textContent = "Create Note"; }, 2000);
  }
}

function initVaultEditor() {
  const editToggle = document.getElementById("vault-edit-toggle-btn");
  const saveBtn = document.getElementById("vault-save-btn");
  const newNoteBtn = document.getElementById("vault-new-note-btn");
  const refreshBtn = document.getElementById("vault-refresh-tree-btn");
  const modal = document.getElementById("vault-new-note-modal");
  const createBtn = document.getElementById("new-note-create-btn");
  const cancelBtn = document.getElementById("new-note-cancel-btn");

  if (editToggle) {
    editToggle.addEventListener("click", () => {
      const preview = document.getElementById("vault-note-preview");
      const editor = document.getElementById("vault-note-editor");
      vaultEditor.isEditing = !vaultEditor.isEditing;
      preview.style.display = vaultEditor.isEditing ? "none" : "block";
      editor.style.display = vaultEditor.isEditing ? "flex" : "none";
      editToggle.textContent = vaultEditor.isEditing ? "Preview" : "Edit";
      if (saveBtn) saveBtn.style.display = vaultEditor.isEditing ? "inline-flex" : "none";
    });
  }

  if (saveBtn) saveBtn.addEventListener("click", saveVaultNote);
  if (refreshBtn) refreshBtn.addEventListener("click", loadVaultTree);
  if (newNoteBtn) newNoteBtn.addEventListener("click", () => {
    if (modal) {
      modal.style.display = "flex";
      document.getElementById("new-note-title")?.focus();
    }
  });
  if (createBtn) createBtn.addEventListener("click", createVaultNote);
  if (cancelBtn) cancelBtn.addEventListener("click", () => {
    if (modal) modal.style.display = "none";
  });

  // Load tree when Memory Bay becomes active
  document.querySelectorAll('[data-nav][data-page="memory-bay"]').forEach(btn => {
    btn.addEventListener("click", () => {
      setTimeout(loadVaultTree, 100); // after page transition
    });
  });

  // Initial load if memory-bay is default page
  if (appState.mission?.active_page === "memory-bay") {
    loadVaultTree();
  }
}
```

**Step 4: Call `initVaultEditor()` in `DOMContentLoaded`**

In `app.js`, in the `DOMContentLoaded` block, after `initAce()`, add:
```js
initVaultEditor();
```

**Step 5: Verify syntax**
```bash
node --check C:\Users\lamar\Hermes_Mission_Control\static\app.js
```
Expected: no output (pass)

**Step 6: Verify in browser**
- Navigate to Memory Bay
- Check Vault Editor window appears
- Vault tree panel shows folders
- Click a note → loads content in preview
- Click "Edit" → switches to textarea
- Edit something → click "Save" → shows "Saved ✓"
- Click "+ New Note" → modal opens → fill out → "Create Note" → note appears in tree

**Step 7: Commit**
```bash
git -C C:\Users\lamar\Hermes_Mission_Control add static/app.js static/index.html static/styles.css
git -C C:\Users\lamar\Hermes_Mission_Control commit -m "feat: Obsidian in-app editor — vault tree browser, note read/edit/save, new note creation"
```

---

## Task 6: Three.js — Particle Nebula Background

**Files:**
- Modify: `C:\Users\lamar\Hermes_Mission_Control\static\app.js`

This replaces the current `initScene()` function (around `app.js:1688`). The new scene uses a `ShaderMaterial`-based particle nebula that reacts to the active color palette.

**Step 1: Define palette color maps at the top of app.js**

Near the top of `app.js` (after constants, before functions), add:

```js
// ── Palette → Three.js Color Mapping ─────────────
const PALETTE_COLORS = {
  blossom: { primary: 0xff6eb4, secondary: 0xa855f7, accent: 0xffd5df },
  vapor:   { primary: 0x00ffff, secondary: 0xff00ff, accent: 0xb8a2ff },
  mint:    { primary: 0x2dd4bf, secondary: 0x4ade80, accent: 0xb6f0e4 },
  sunset:  { primary: 0xfb923c, secondary: 0xfbbf24, accent: 0xffc9c2 },
};

function getCurrentPaletteColors() {
  const palette = document.body.dataset.uiPalette || "blossom";
  return PALETTE_COLORS[palette] || PALETTE_COLORS.blossom;
}
```

**Step 2: Replace `initScene()` with the new nebula scene**

Find the existing `initScene()` function (around `app.js:1688`). Replace it entirely:

```js
function initScene() {
  const canvas = document.getElementById("mission-scene");
  if (!canvas) return;

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 200);
  camera.position.z = 28;

  // ── Particle Nebula ──────────────────────────────
  const PARTICLE_COUNT = window.devicePixelRatio > 1 ? 3000 : 1800;
  const positions = new Float32Array(PARTICLE_COUNT * 3);
  const colors = new Float32Array(PARTICLE_COUNT * 3);
  const sizes = new Float32Array(PARTICLE_COUNT);
  const speeds = new Float32Array(PARTICLE_COUNT);

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = 8 + Math.random() * 22;
    positions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);
    sizes[i] = 0.06 + Math.random() * 0.14;
    speeds[i] = 0.2 + Math.random() * 0.8;
    // Initial colors (overridden in updateNebulaColors)
    colors[i * 3] = 1; colors[i * 3 + 1] = 0.43; colors[i * 3 + 2] = 0.71;
  }

  // Nebula clusters — 5 large glowing blobs
  const CLUSTER_COUNT = 800;
  const clusterPositions = new Float32Array(CLUSTER_COUNT * 3);
  const clusterColors = new Float32Array(CLUSTER_COUNT * 3);
  const clusterSizes = new Float32Array(CLUSTER_COUNT);
  for (let i = 0; i < CLUSTER_COUNT; i++) {
    const cx = (Math.random() - 0.5) * 30;
    const cy = (Math.random() - 0.5) * 20;
    const cz = (Math.random() - 0.5) * 20 - 5;
    clusterPositions[i * 3] = cx + (Math.random() - 0.5) * 8;
    clusterPositions[i * 3 + 1] = cy + (Math.random() - 0.5) * 8;
    clusterPositions[i * 3 + 2] = cz + (Math.random() - 0.5) * 6;
    clusterSizes[i] = 0.3 + Math.random() * 0.6;
    clusterColors[i * 3] = 0.68; clusterColors[i * 3 + 1] = 0.43; clusterColors[i * 3 + 2] = 0.98;
  }

  const vertexShader = `
    attribute float size;
    attribute vec3 color;
    varying vec3 vColor;
    varying float vAlpha;
    uniform float uTime;
    void main() {
      vColor = color;
      float flicker = 0.7 + 0.3 * sin(uTime * 2.0 + position.x * 3.14);
      vAlpha = flicker;
      vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = size * (300.0 / -mvPos.z);
      gl_Position = projectionMatrix * mvPos;
    }
  `;
  const fragmentShader = `
    varying vec3 vColor;
    varying float vAlpha;
    void main() {
      float d = length(gl_PointCoord - vec2(0.5));
      if (d > 0.5) discard;
      float alpha = (1.0 - d * 2.0) * vAlpha * 0.85;
      gl_FragColor = vec4(vColor, alpha);
    }
  `;

  const uniformsParticles = { uTime: { value: 0 } };
  const particleMat = new THREE.ShaderMaterial({
    uniforms: uniformsParticles,
    vertexShader, fragmentShader,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });

  const particleGeo = new THREE.BufferGeometry();
  particleGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  particleGeo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  particleGeo.setAttribute("size", new THREE.BufferAttribute(sizes, 1));
  const particles = new THREE.Points(particleGeo, particleMat);

  const clusterGeo = new THREE.BufferGeometry();
  clusterGeo.setAttribute("position", new THREE.BufferAttribute(clusterPositions, 3));
  clusterGeo.setAttribute("color", new THREE.BufferAttribute(clusterColors, 3));
  clusterGeo.setAttribute("size", new THREE.BufferAttribute(clusterSizes, 1));
  const clusterMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader, fragmentShader,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const clusters = new THREE.Points(clusterGeo, clusterMat);

  scene.add(particles);
  scene.add(clusters);

  // Warp state
  const warpState = { active: false, progress: 0 };

  appState.scene = { renderer, scene, camera, particles, clusters, particleMat, clusterMat, uniformsParticles, positions, speeds, PARTICLE_COUNT, warpState };
  updateNebulaColors();

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

function updateNebulaColors() {
  const s = appState.scene;
  if (!s) return;
  const { primary, secondary, accent } = getCurrentPaletteColors();
  const pc = new THREE.Color(primary);
  const sc = new THREE.Color(secondary);
  const ac = new THREE.Color(accent);
  const colors = s.particles.geometry.attributes.color;
  for (let i = 0; i < s.PARTICLE_COUNT; i++) {
    const mix = Math.random();
    const c = mix < 0.5 ? pc.clone().lerp(sc, mix * 2) : sc.clone().lerp(ac, (mix - 0.5) * 2);
    colors.setXYZ(i, c.r, c.g, c.b);
  }
  colors.needsUpdate = true;
  const cc = s.clusters.geometry.attributes.color;
  for (let i = 0; i < 800; i++) {
    cc.setXYZ(i, pc.r * 0.6, pc.g * 0.6, pc.b * 0.9);
  }
  cc.needsUpdate = true;
}
```

**Step 3: Replace the `animate()` function with the new nebula animation**

Find the existing `animate(time)` function and replace it:

```js
function animate(time) {
  const s = appState.scene;
  if (!s) return;
  const t = time * 0.0002;

  s.uniformsParticles.uTime.value = t;
  s.clusterMat.uniforms.uTime.value = t * 0.6;

  // Drift particles along sine paths
  const pos = s.particles.geometry.attributes.position;
  for (let i = 0; i < s.PARTICLE_COUNT; i++) {
    pos.setY(i, pos.getY(i) + Math.sin(t * s.speeds[i] + i) * 0.0008);
    pos.setX(i, pos.getX(i) + Math.cos(t * s.speeds[i] * 0.7 + i * 0.3) * 0.0004);
  }
  pos.needsUpdate = true;

  // Warp effect: on page switch, spike particle z-velocity
  if (s.warpState.active) {
    s.warpState.progress = Math.min(1, s.warpState.progress + 0.04);
    const warpZ = Math.sin(s.warpState.progress * Math.PI) * 12;
    s.camera.position.z = 28 - warpZ;
    if (s.warpState.progress >= 1) {
      s.warpState.active = false;
      s.warpState.progress = 0;
      s.camera.position.z = 28;
    }
  }

  // Subtle parallax from mouse
  s.particles.rotation.y = t * 0.05 + (appState.pointer?.x || 0) * 0.08;
  s.particles.rotation.x = t * 0.02 + (appState.pointer?.y || 0) * 0.04;
  s.clusters.rotation.y = t * 0.03;

  s.renderer.render(s.scene, s.camera);
  requestAnimationFrame(animate);
}
```

**Step 4: Trigger warp on page switch**

Find the `setPage()` function and add warp trigger:

```js
function setPage(page, persist = true) {
  if (!PAGE_IDS.has(page)) return;
  // Trigger warp effect
  if (appState.scene?.warpState) {
    appState.scene.warpState.active = true;
    appState.scene.warpState.progress = 0;
  }
  if (appState.mission) appState.mission.active_page = page;
  renderPages();
  if (persist) queuePatch({ active_page: page });
}
```

**Step 5: React to palette changes**

Find the palette selector handler in `app.js` (search for `data-ui-palette` or `theme-palette-select`). After setting the palette attribute, call `updateNebulaColors()`:

```js
// After: document.body.dataset.uiPalette = palette;
// Add:   updateNebulaColors();
```

**Step 6: Start the animation loop**

Find where `animate` is first called (search for `requestAnimationFrame(animate)` at startup). Ensure it's called with:
```js
requestAnimationFrame(animate);
```
This should already exist in the init code — just verify it's called after `initScene()`.

**Step 7: Verify syntax and visual**
```bash
node --check C:\Users\lamar\Hermes_Mission_Control\static\app.js
```
Expected: no output

Reload in browser. Expected: dynamic particle nebula visible in background, colors match active palette.

**Step 8: Commit**
```bash
git -C C:\Users\lamar\Hermes_Mission_Control add static/app.js
git -C C:\Users\lamar\Hermes_Mission_Control commit -m "feat: Three.js — particle nebula background with palette-reactive shader colors and warp transitions"
```

---

## Task 7: Three.js — Hermes Avatar Expressive States

**Files:**
- Modify: `C:\Users\lamar\Hermes_Mission_Control\static\app.js`

The avatar canvas is `#hermes-avatar` at `520×520px`. `appState.avatar.presence` holds the state. We add two new states (`thinking`, `speaking`) and upgrade the visual quality of all 5 states.

**Step 1: Find the avatar canvas render function**

Search for `hermes-avatar` in `app.js`. The avatar render uses a canvas 2D context. Find the function that draws to it (search for `getContext('2d')` or similar).

**Step 2: Replace or augment the avatar draw function**

Find the avatar drawing code and replace the draw loop with this enhanced version:

```js
function drawHermesAvatar(time) {
  const canvas = document.getElementById("hermes-avatar");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  const cx = W / 2, cy = H / 2;
  const presence = appState.avatar?.presence || "boot";
  const t = time * 0.001;

  ctx.clearRect(0, 0, W, H);

  const colors = getCurrentPaletteColors();
  const primary = `#${colors.primary.toString(16).padStart(6, "0")}`;
  const secondary = `#${colors.secondary.toString(16).padStart(6, "0")}`;

  // ── Base glow ring ────────────────────────────────
  const ringAlpha = presence === "sleeping" || presence === "boot" ? 0.18 : 0.55;
  const ringRadius = 160 + Math.sin(t * 1.4) * (presence === "sleeping" ? 4 : 8);
  const ringGrad = ctx.createRadialGradient(cx, cy, ringRadius - 12, cx, cy, ringRadius + 12);
  ringGrad.addColorStop(0, `${primary}00`);
  ringGrad.addColorStop(0.5, primary + Math.round(ringAlpha * 255).toString(16).padStart(2, "0"));
  ringGrad.addColorStop(1, `${primary}00`);
  ctx.beginPath();
  ctx.arc(cx, cy, ringRadius, 0, Math.PI * 2);
  ctx.strokeStyle = ringGrad;
  ctx.lineWidth = 3;
  ctx.stroke();

  // ── State-specific rendering ──────────────────────
  if (presence === "online") {
    // Spinning outer ring
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(t * 0.8);
    const dashR = 172;
    ctx.setLineDash([12, 6]);
    ctx.beginPath();
    ctx.arc(0, 0, dashR, 0, Math.PI * 2);
    ctx.strokeStyle = secondary + "88";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
    ctx.setLineDash([]);

    // 3 orbiting micro-dots
    for (let i = 0; i < 3; i++) {
      const angle = t * 1.2 + (i * Math.PI * 2) / 3;
      const ox = cx + Math.cos(angle) * 178;
      const oy = cy + Math.sin(angle) * 178;
      ctx.beginPath();
      ctx.arc(ox, oy, 4, 0, Math.PI * 2);
      ctx.fillStyle = secondary;
      ctx.fill();
    }

  } else if (presence === "waking") {
    // Converging particles
    for (let i = 0; i < 20; i++) {
      const angle = (i / 20) * Math.PI * 2 + t * 2;
      const dist = Math.max(20, 180 - (t % 3) * 60);
      const px = cx + Math.cos(angle) * dist;
      const py = cy + Math.sin(angle) * dist;
      ctx.beginPath();
      ctx.arc(px, py, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = primary + "cc";
      ctx.fill();
    }

  } else if (presence === "thinking") {
    // Dimmed ring + orbiting question marks
    ctx.globalAlpha = 0.6;
    for (let i = 0; i < 4; i++) {
      const angle = t * 0.6 + (i * Math.PI * 2) / 4;
      const dist = 175;
      const px = cx + Math.cos(angle) * dist;
      const py = cy + Math.sin(angle) * dist;
      ctx.font = "bold 16px sans-serif";
      ctx.fillStyle = secondary;
      ctx.fillText("?", px - 5, py + 5);
    }
    ctx.globalAlpha = 1;

    // Pulsing inner ring (slow)
    const thinkPulse = 145 + Math.sin(t * 0.8) * 10;
    ctx.beginPath();
    ctx.arc(cx, cy, thinkPulse, 0, Math.PI * 2);
    ctx.strokeStyle = secondary + "55";
    ctx.lineWidth = 1.5;
    ctx.stroke();

  } else if (presence === "speaking") {
    // Audio waveform rings
    for (let ring = 0; ring < 3; ring++) {
      const baseR = 155 + ring * 18;
      const waveAmp = 10 * (1 - ring * 0.25);
      ctx.beginPath();
      for (let a = 0; a <= Math.PI * 2; a += 0.05) {
        const wave = Math.sin(a * 8 + t * 6 + ring * 1.2) * waveAmp;
        const r = baseR + wave;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        if (a === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.strokeStyle = primary + ["cc", "88", "44"][ring];
      ctx.lineWidth = 2 - ring * 0.4;
      ctx.stroke();
    }

  } else if (presence === "boot" || presence === "offline") {
    // Static grey ring, low opacity
    ctx.globalAlpha = 0.25;
    ctx.beginPath();
    ctx.arc(cx, cy, 155, 0, Math.PI * 2);
    ctx.strokeStyle = "#888";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // ── Center core glow ──────────────────────────────
  const coreOpacity = presence === "online" ? 0.7 : presence === "speaking" ? 0.85 : 0.35;
  const coreR = 80 + Math.sin(t * 2) * (presence === "sleeping" ? 3 : 6);
  const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
  coreGrad.addColorStop(0, primary + Math.round(coreOpacity * 255).toString(16).padStart(2, "0"));
  coreGrad.addColorStop(0.6, secondary + Math.round(coreOpacity * 0.4 * 255).toString(16).padStart(2, "0"));
  coreGrad.addColorStop(1, `${primary}00`);
  ctx.beginPath();
  ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
  ctx.fillStyle = coreGrad;
  ctx.fill();
}
```

**Step 3: Wire `thinking` and `speaking` states to chat events**

Find where chat messages arrive and update avatar state. After the Hermes response starts streaming (or arrives), set:

```js
// When user sends message (before response):
appState.avatar.presence = "thinking";
// When response starts arriving:
appState.avatar.presence = "speaking";
appState.avatar.speakingUntil = Date.now() + 3000;
// After response completes:
appState.avatar.presence = "online";
```

Find the existing send-message handler (search for `fetchJSON("/api/chat"`) and update accordingly.

**Step 4: Integrate `drawHermesAvatar` into the animation loop**

Ensure `drawHermesAvatar(time)` is called inside the `animate(time)` function:

```js
function animate(time) {
  // ... existing nebula code ...
  drawHermesAvatar(time);  // add this line
  s.renderer.render(s.scene, s.camera);
  requestAnimationFrame(animate);
}
```

**Step 5: Verify**
```bash
node --check C:\Users\lamar\Hermes_Mission_Control\static\app.js
```
Reload in browser. The Hermes avatar canvas should show palette-colored rings and glow. Send a chat message — avatar should briefly show "thinking" rings then "speaking" waveform then return to "online".

**Step 6: Commit**
```bash
git -C C:\Users\lamar\Hermes_Mission_Control add static/app.js
git -C C:\Users\lamar\Hermes_Mission_Control commit -m "feat: Hermes avatar — 5 expressive states (sleeping/waking/online/thinking/speaking) with palette-reactive canvas animations"
```

---

## Task 8: UI Micro-animations

**Files:**
- Modify: `C:\Users\lamar\Hermes_Mission_Control\static\styles.css`
- Modify: `C:\Users\lamar\Hermes_Mission_Control\static\app.js`

**Step 1: Add window open/close animation CSS**

Add to `styles.css`:

```css
/* ── Window Micro-animations ──────────────────────── */
@keyframes windowOpen {
  from { opacity: 0; transform: scale(0.88) translateY(8px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}
@keyframes windowClose {
  from { opacity: 1; transform: scale(1); }
  to   { opacity: 0; transform: scale(0.88) translateY(8px); }
}

.window.is-animating-open {
  animation: windowOpen 200ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}
.window.is-animating-close {
  animation: windowClose 150ms ease-in forwards;
  pointer-events: none;
}

/* ── Page Slide Transitions ───────────────────────── */
@keyframes pageSlideIn {
  from { opacity: 0; transform: translateX(2%) scale(0.99); }
  to   { opacity: 1; transform: translateX(0) scale(1); }
}
@keyframes pageSlideOut {
  from { opacity: 1; transform: translateX(0); }
  to   { opacity: 0; transform: translateX(-2%); }
}

.page.is-entering { animation: pageSlideIn 260ms ease-out forwards; }
.page.is-leaving  { animation: pageSlideOut 180ms ease-in forwards; pointer-events: none; }

/* ── Button Ripple ────────────────────────────────── */
.btn-ripple {
  position: relative;
  overflow: hidden;
}
.btn-ripple::after {
  content: "";
  position: absolute;
  width: 0; height: 0;
  border-radius: 50%;
  background: rgba(255,255,255,0.38);
  transform: translate(-50%, -50%);
  transition: width 500ms ease, height 500ms ease, opacity 500ms ease;
  opacity: 1;
  pointer-events: none;
}
.btn-ripple.rippling::after {
  width: 200px; height: 200px;
  opacity: 0;
}

/* ── Button Shimmer ───────────────────────────────── */
.btn-primary {
  position: relative;
  overflow: hidden;
}
.btn-primary::before {
  content: "";
  position: absolute;
  top: 0; left: -100%;
  width: 60%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent);
  transition: left 500ms ease;
  pointer-events: none;
}
.btn-primary:hover::before { left: 140%; }

/* ── Skill Arm Burst ──────────────────────────────── */
@keyframes burstParticle {
  0%   { transform: translate(0, 0) scale(1); opacity: 0.9; }
  100% { transform: translate(var(--dx), var(--dy)) scale(0); opacity: 0; }
}
.burst-particle {
  position: fixed;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  pointer-events: none;
  z-index: 9999;
  animation: burstParticle 600ms ease-out forwards;
}

/* ── Chat Message Slide ───────────────────────────── */
@keyframes msgSlideUp {
  from { opacity: 0; transform: translateY(10px); }
  to   { opacity: 1; transform: translateY(0); }
}
.chat-message { animation: msgSlideUp 180ms ease-out; }
```

**Step 2: Add ripple effect JS**

After the `initVaultEditor()` call area in `app.js`, add:

```js
// ── UI Micro-animations ───────────────────────────
function addRipple(btn) {
  btn.classList.add("btn-ripple");
  btn.addEventListener("click", function(e) {
    const rect = btn.getBoundingClientRect();
    btn.style.setProperty("--ripple-x", `${e.clientX - rect.left}px`);
    btn.style.setProperty("--ripple-y", `${e.clientY - rect.top}px`);
    btn.classList.remove("rippling");
    void btn.offsetWidth; // reflow
    btn.classList.add("rippling");
    setTimeout(() => btn.classList.remove("rippling"), 500);
  });
}

function burstParticles(x, y, color) {
  for (let i = 0; i < 10; i++) {
    const p = document.createElement("div");
    p.className = "burst-particle";
    const angle = (Math.random() * Math.PI * 2);
    const dist = 30 + Math.random() * 50;
    p.style.cssText = `
      left: ${x}px; top: ${y}px;
      background: ${color};
      --dx: ${Math.cos(angle) * dist}px;
      --dy: ${Math.sin(angle) * dist}px;
    `;
    document.body.appendChild(p);
    setTimeout(() => p.remove(), 620);
  }
}

function addMagneticHover(el, strength = 4) {
  el.addEventListener("mousemove", (e) => {
    const rect = el.getBoundingClientRect();
    const dx = (e.clientX - rect.left - rect.width / 2) / rect.width;
    const dy = (e.clientY - rect.top - rect.height / 2) / rect.height;
    el.style.transform = `translate(${dx * strength}px, ${dy * strength}px)`;
  });
  el.addEventListener("mouseleave", () => {
    el.style.transform = "";
  });
}

function initMicroAnimations() {
  // Ripple on all primary buttons
  document.querySelectorAll(".btn-primary, .btn-ghost").forEach(addRipple);

  // Magnetic hover on nav buttons and title actions
  document.querySelectorAll('[data-nav="true"], .title-action').forEach(el => addMagneticHover(el, 3));

  // Skill arm particle burst
  document.addEventListener("click", (e) => {
    const armBtn = e.target.closest("[data-arm-skill]");
    if (armBtn) {
      const rect = armBtn.getBoundingClientRect();
      const colors = getCurrentPaletteColors();
      const color = `#${colors.primary.toString(16).padStart(6, "0")}`;
      burstParticles(rect.left + rect.width / 2, rect.top + rect.height / 2, color);
    }
  });

  // Window open/close animations
  // Intercept applyWindowState to add animation classes
  const origApply = window._origApplyWindowState || applyWindowState;
  window._origApplyWindowState = origApply;
}
```

**Step 3: Wire page slide transitions**

Modify the `renderPages()` function to add slide animation classes:

```js
// In renderPages(), after the forEach that sets is-active:
// Add entering/leaving classes for transitions
elements.pageSections.forEach((section) => {
  const isTarget = section.dataset.page === page;
  const wasActive = section.classList.contains("is-active");
  if (isTarget && !wasActive) {
    section.classList.remove("is-leaving");
    section.classList.add("is-entering");
    setTimeout(() => section.classList.remove("is-entering"), 280);
  } else if (!isTarget && wasActive) {
    section.classList.add("is-leaving");
    setTimeout(() => section.classList.remove("is-leaving"), 200);
  }
  section.classList.toggle("is-active", isTarget);
});
```

**Step 4: Call `initMicroAnimations()` in `DOMContentLoaded`**

Add to the init block:
```js
initMicroAnimations();
```

**Step 5: Verify syntax**
```bash
node --check C:\Users\lamar\Hermes_Mission_Control\static\app.js
```

**Step 6: Verify in browser**
- Click a nav button: page should slide in from the right
- Click a primary button: ripple effect should appear
- Hover over a nav button: subtle magnetic movement
- Arm a skill: particle burst from button
- Close a window: scale-down animation
- Verify chat messages slide up when they arrive

**Step 7: Commit**
```bash
git -C C:\Users\lamar\Hermes_Mission_Control add static/app.js static/styles.css
git -C C:\Users\lamar\Hermes_Mission_Control commit -m "feat: UI micro-animations — window open/close, page slides, button ripples, magnetic hover, skill burst particles"
```

---

## Task 9: Skills Bay Polish — Risk Labels + Session-Only Arming

**Files:**
- Modify: `C:\Users\lamar\Hermes_Mission_Control\static\app.js`
- Modify: `C:\Users\lamar\Hermes_Mission_Control\static\styles.css`

**Step 1: Add risk level data to skill definitions in app.js**

Search for where skills are defined (likely an array or object near the top). Add a `riskLevel` field (`"low"`, `"medium"`, `"high"`) to each skill category:

```js
// For GSD workflows:
{ id: "gsd:quick", name: "Quick Sprint", riskLevel: "low", ... }
// For OpenClaw skills:
{ id: "web-research", name: "Web Research", riskLevel: "medium", ... }
// For file/external actions:
{ id: "file-ops", name: "File Operations", riskLevel: "high", ... }
```

**Step 2: Render risk badge in skill card HTML**

Find the function that renders skill cards (search for `data-arm-skill`). Add the risk badge:

```js
function renderSkillCard(skill) {
  return `
    <div class="skill-card" data-skill-id="${skill.id}">
      <div class="skill-card-header">
        <span class="skill-name">${skill.title || skill.name}</span>
        <span class="risk-badge risk-${skill.riskLevel || "low"}">${skill.riskLevel || "low"}</span>
      </div>
      ${skill.prereqs?.length ? `<div class="skill-prereqs">${skill.prereqs.map(p => `<span class="prereq-chip">${p}</span>`).join("")}</div>` : ""}
      <button class="btn-ghost btn-xs skill-arm-btn" data-arm-skill="${skill.id}">Arm</button>
    </div>
  `;
}
```

**Step 3: Move armed skills from localStorage to sessionStorage**

Search for every `localStorage.setItem` that stores `armedSkills` or armed state. Replace with `sessionStorage`:

```js
// Replace:
localStorage.setItem("armed_skills", JSON.stringify(armed));
// With:
sessionStorage.setItem("armed_skills", JSON.stringify(armed));

// Replace reads:
JSON.parse(localStorage.getItem("armed_skills") || "[]")
// With:
JSON.parse(sessionStorage.getItem("armed_skills") || "[]")
```

Note: The `queuePatch()` system already persists armed state to the backend state file. The sessionStorage change only affects the client-side cache — on refresh, the armed list from the server state will restore.

**Step 4: Add "Disarm All" button and CSS**

Add to Skills Bay page in `index.html`:
```html
<button id="disarm-all-btn" class="btn-danger-outline" data-help="Clear all armed skills and workflows for this session">Disarm All</button>
```

Wire in `app.js`:
```js
document.getElementById("disarm-all-btn")?.addEventListener("click", () => {
  sessionStorage.removeItem("armed_skills");
  // Also reset via API
  fetchJSON("/api/state", {
    method: "POST",
    body: JSON.stringify({ armed_skills: [], armed_workflows: [], armed_scientific_skills: [] }),
  }).catch(console.warn);
  renderSkillBay(); // re-render to show disarmed state
});
```

**Step 5: Add risk badge CSS**

```css
/* ── Risk Badges ──────────────────────────────────── */
.risk-badge {
  padding: 1px 7px;
  border-radius: 10px;
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}
.risk-low    { background: var(--success); color: #1a5c50; }
.risk-medium { background: var(--warning); color: #7a4010; }
.risk-high   { background: var(--danger);  color: #7a1530; }

.prereq-chip {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 8px;
  font-size: 0.63rem;
  background: var(--sky-200);
  color: var(--ink);
  margin-right: 3px;
}

.btn-danger-outline {
  border: 1px solid var(--danger);
  color: var(--danger);
  background: transparent;
  transition: background 150ms ease, color 150ms ease;
}
.btn-danger-outline:hover {
  background: var(--danger);
  color: white;
}
```

**Step 6: Verify and commit**
```bash
node --check C:\Users\lamar\Hermes_Mission_Control\static\app.js
git -C C:\Users\lamar\Hermes_Mission_Control add static/app.js static/index.html static/styles.css
git -C C:\Users\lamar\Hermes_Mission_Control commit -m "feat: skills bay — risk level badges, prerequisites chips, session-only arming, Disarm All button"
```

---

## Task 10: Cleanup + Documentation Update

**Files:**
- Delete: `C:\Users\lamar\Hermes_Mission_Control\mission_control_check.png`
- Delete: `C:\Users\lamar\Hermes_Mission_Control\mission_control_rail_wide.png`
- Modify: `C:\Users\lamar\Hermes_Mission_Control\JSONHandoff.json`
- Modify: `C:\Users\lamar\Hermes_Mission_Control\MISSION_CONTROL_BACKLOG.md`
- Modify: `C:\Users\lamar\Hermes_Mission_Control\README.md`

**Step 1: Remove temp screenshots**
```bash
rm "C:\Users\lamar\Hermes_Mission_Control\mission_control_check.png"
rm "C:\Users\lamar\Hermes_Mission_Control\mission_control_rail_wide.png"
```

**Step 2: Update JSONHandoff.json**

Update these fields:
- `"current_status.summary"`: "Hermes Mission Control v2 complete — ACE self-improvement loop, Obsidian in-app editor, Three.js particle nebula, UI micro-animations, all controls verified."
- `"commit_after_this_pass"`: set to the final commit hash (run `git rev-parse HEAD` after final commit)
- `"pushed_to_github"`: `true`
- `"known_gaps_and_risks"`: Remove resolved items; add only remaining true gaps.
- `"next_recommended_actions"`: `["Run ACE loop after first real session to seed the context delta.", "Add ANTHROPIC_API_KEY to env if Claude API access is desired."]`

**Step 3: Check off completed items in MISSION_CONTROL_BACKLOG.md**

Mark all items from "Immediate Remaining Work" section as done. Add new section:
```markdown
## v2 Additions (2026-03-09)
- [x] ACE self-improvement loop (auto + manual trigger)
- [x] Obsidian in-app read/write editor (vault tree, note viewer, note editor, new note)
- [x] Three.js particle nebula background with palette-reactive colors
- [x] Hermes avatar — 5 expressive states (sleeping/waking/online/thinking/speaking)
- [x] UI micro-animations (window open/close, page slides, button ripples, magnetic hover, skill bursts)
- [x] Skills Bay — risk labels, prerequisites, session-only arming, Disarm All
```

**Step 4: Update README.md**

Add a "Feature Status" table and setup instructions for ACE. The README should include how to start the server (`python server.py`), what env vars are available, and which integrations are online vs. graceful-offline.

**Step 5: Commit**
```bash
git -C C:\Users\lamar\Hermes_Mission_Control add JSONHandoff.json MISSION_CONTROL_BACKLOG.md README.md
git -C C:\Users\lamar\Hermes_Mission_Control commit -m "docs: update handoff, backlog, and readme for v2 completion"
```

---

## Task 11: Final End-to-End Verification (Playwright)

**Tools:** `mcp__plugin_playwright_playwright__browser_*`

**Step 1: Hard reload the app**
```
navigate → http://127.0.0.1:8765/
```
Force reload: press F5 or navigate again. Take snapshot.

**Step 2: Check console for errors**
```
browser_console_messages level: "error"
```
Expected: 0 errors.

**Step 3: Page tour — verify all 5 pages**
Click each nav button. Verify:
- Page slide transition fires
- Warp effect visible in background
- Each page has its windows open/visible
- No "undefined" text or broken layout

**Step 4: Command Bridge verification**
- Hermes avatar shows animated core glow
- ACE status bar visible in Hermes Live window with "idle" pill
- "⟳ ACE" button in header
- Send chat message → avatar → thinking → speaking → online → chat reply visible

**Step 5: Memory Bay verification**
- Vault Editor window opens
- Vault tree renders folders
- Click a note → content loads in preview pane
- Click "Edit" → textarea opens with raw markdown
- Make a small change → Save → "Saved ✓" appears
- Click "+ New Note" → modal opens → fill in → create → note in tree

**Step 6: Skills Bay verification**
- Risk badges visible on skill cards
- Arm a skill → particle burst fires
- Disarm All button visible and functional

**Step 7: Research Ops verification**
- Create a research mission
- Run it
- Promote to vault

**Step 8: Company Ops verification**
- Page loads, offline banners visible for Paperclip and GWS
- Approval queue visible

**Step 9: Theme palette switch**
- Switch to vapor palette → nebula colors shift to cyan/magenta
- Switch to sunset → shifts to orange/gold
- Switch back to blossom

**Step 10: Window management final check**
- Minimize a window → shelf item appears in Operator Dock
- Reopen from shelf → window animates back in with open animation
- Float a window → drag it → undock it → docks back

**Step 11: Syntax check**
```bash
node --check C:\Users\lamar\Hermes_Mission_Control\static\app.js
python -c "import py_compile; py_compile.compile('C:/Users/lamar/Hermes_Mission_Control/server.py', doraise=True); print('OK')"
```
Both expected to pass with no errors.

---

## Task 12: Commit + Push

**Step 1: Final git status**
```bash
git -C C:\Users\lamar\Hermes_Mission_Control status
git -C C:\Users\lamar\Hermes_Mission_Control log --oneline -12
```

**Step 2: Stage and commit anything remaining**
```bash
git -C C:\Users\lamar\Hermes_Mission_Control add -p
git -C C:\Users\lamar\Hermes_Mission_Control commit -m "chore: mission control v2 — final verification pass complete"
```

**Step 3: Update JSONHandoff.json with final commit hash**
```bash
HASH=$(git -C C:\Users\lamar\Hermes_Mission_Control rev-parse HEAD)
echo "Final commit: $HASH"
```
Edit JSONHandoff.json: `"commit_after_this_pass": "<hash>"`

**Step 4: Push**
```bash
git -C C:\Users\lamar\Hermes_Mission_Control push origin codex/hermes-mission-control
```
Expected: Branch pushed to `https://github.com/yaazmiyn/Aerugi_Agent.git`

**Step 5: Confirm**
```bash
git -C C:\Users\lamar\Hermes_Mission_Control log --oneline -3
```
Expected: All new commits visible.

---

## Quick Reference — New Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/ace/status` | ACE last run time, delta summary |
| POST | `/api/ace/run` | Trigger ACE improvement cycle |
| GET | `/api/vault/tree` | Vault folder + note tree |
| GET | `/api/vault/note?path=<rel>` | Raw note content + frontmatter |
| POST | `/api/vault/note` | Update existing note `{path, content}` |
| POST | `/api/vault/note/new` | Create new note `{type, title, summary, body}` |

## Quick Reference — New UI Elements

| ID | Location | Purpose |
|----|----------|---------|
| `#ace-pill` | Hermes Live window | ACE status indicator |
| `#ace-run-btn` | Hermes Live window | Manual ACE trigger |
| `#ace-header-run-btn` | Main header | Quick ACE trigger |
| `#vault-editor-window` | Memory Bay | Full vault editor |
| `#vault-tree-panel` | Vault Editor | Folder/note tree |
| `#vault-note-preview` | Vault Editor | Rendered note content |
| `#vault-note-editor` | Vault Editor | Raw markdown editor |
| `#vault-new-note-btn` | Vault Editor | New note modal trigger |
| `#disarm-all-btn` | Skills Bay | Session skills reset |
