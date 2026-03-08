# Hermes.exe Mission Control

Local-first mission control for Hermes, Ollama, Obsidian memory, Letta MemFS staging, Research Ops, and approval-gated Company Ops.

## Run

```powershell
powershell -ExecutionPolicy Bypass -File .\start-mission-control.ps1
```

Default URL:

```text
http://127.0.0.1:8765
```

## What Is Included

- Command Bridge with Hermes chat over Ollama
- Animated vaporwave/anime UI with Three.js background, local sounds, and haptic hooks
- Memory Bay with an Obsidian-compatible vault at `C:\Users\lamar\OneDrive\Documents\Hermes Vault`
- Letta local memory staging via `.letta/memory`
- Research Ops with local mission specs, artifacts, and promotion to the vault
- Company Ops with a Paperclip-style offline adapter and approval queue
- Gated workflow and skill arming from `get-shit-done` and `awesome-openclaw-skills`

## Local Memory Layout

Vault folders are bootstrapped under the Hermes vault path:

- `00 Inbox`
- `01 Daily`
- `10 Projects`
- `20 Entities`
- `30 Knowledge`
- `40 Research`
- `50 Decisions`
- `60 Meetings`
- `70 Memory`
- `90 Templates`
- `99 System`

Generated indexes:

- `99 System/vault-index.json`
- `99 System/vault-map.md`

Letta staging files are written locally to:

```text
.\.letta\memory
```

## Research Ops

Research missions are stored locally under:

```text
data\research-missions
```

Promoted research notes are written to the Obsidian vault and can also be synced into the Letta MemFS relay.

## Security Model

- Server binds only to `127.0.0.1`
- Local-only by default
- Internet, browser, terminal, file, and external actions stay operator-gated
- Paperclip and Letta links are restricted to loopback URLs only
- Notebook, research, and company actions are structured as local adapters first

## Source Layout

- `server.py` - local API and subsystem adapters
- `static/index.html` - multi-page UI shell
- `static/styles.css` - vaporwave/anime styling system
- `static/app.js` - page logic, rendering, avatar animation, and Three.js scene
- `start-mission-control.ps1` - launcher using the Hermes Python runtime
- `external/get-shit-done` - local workflow source, if present
- `external/awesome-openclaw-skills` - local skill catalog source, if present
