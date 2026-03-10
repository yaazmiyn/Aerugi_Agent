# Hermes.exe Mission Control

Local-first mission control for Hermes, Ollama, Obsidian memory, Letta MemFS staging, Research Ops, and approval-gated Company Ops.

## Quick Start

### Option 1: PowerShell (Recommended)
```powershell
powershell -ExecutionPolicy Bypass -File .\start-mission-control.ps1
```

### Option 2: Direct Python
```bash
python server.py
```

Default URL:
```text
http://127.0.0.1:8765
```

## Feature Status

| Feature | Status | Dependencies |
|---------|--------|--------------|
| Command Bridge (Hermes chat over Ollama) | ✅ Online | Ollama running |
| Memory Bay (Obsidian in-app editor) | ✅ Online | Obsidian vault path configured |
| Research Ops (mission specs & vault promotion) | ✅ Online | Obsidian vault |
| Company Ops (approval queue) | ✅ Online | Local only |
| Skills Bay (risk labels, prerequisites, arming) | ✅ Online | Local only |
| Letta memory staging | ⚠️ Graceful Offline | Letta on port 8283 (optional) |
| Notebook export sync | ⚠️ Graceful Offline | Open Notebook on port 8091 (optional) |
| Paperclip integration | ⚠️ Graceful Offline | External service (optional) |
| ACE self-improvement loop | ✅ Online | Ollama (manual trigger: `/api/ace/run`) |
| Three.js particle nebula background | ✅ Online | None |
| Hermes avatar animations | ✅ Online | None |
| UI micro-animations | ✅ Online | None |

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

## Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `ANTHROPIC_API_KEY` | No | Enable Claude API features (optional for local-only mode) |
| `HERMES_VAULT_PATH` | No | Custom Obsidian vault path (defaults to `C:\Users\lamar\OneDrive\Documents\Hermes Vault`) |

## Integration Status

### Always Online (No External Dependencies)
- Command Bridge with Hermes chat over Ollama
- Research Ops with local mission specs
- Company Ops with approval queue
- Skills Bay with risk management
- Vault note CRUD endpoints
- ACE self-improvement loop (local inference via Ollama)

### Graceful Offline (Optional External Services)
- **Letta Memory Staging**: Requires `http://127.0.0.1:8283` (start Letta on port 8283)
- **Notebook Export**: Requires `http://127.0.0.1:8091` (start Open Notebook on port 8091)
- **Paperclip Integration**: Offline adapter active, external service optional

### Next Steps After Starting

1. Check the Hermes avatar in the top-right to confirm server is running
2. Navigate to Memory Bay to explore the Obsidian vault in-app editor
3. Use Skills Bay to view available skills and enable them
4. Create a research mission in Research Ops to test the workflow
5. (Optional) Start Letta and Open Notebook for full feature set

## Troubleshooting

- **Port 8765 in use**: Change the port in `server.py` or kill the existing process
- **Vault not found**: Verify the Obsidian vault path matches your setup
- **Ollama connection failed**: Ensure Ollama is running (`ollama serve`)
- **ACE loop errors**: Check that a local LLM is available via Ollama
