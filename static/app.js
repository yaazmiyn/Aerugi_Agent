import * as THREE from "/vendor/three.module.js";

const $ = (id) => document.getElementById(id);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));
const PAGE_IDS = new Set(["command-bridge", "memory-bay", "research-ops", "company-ops"]);

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

const elements = {
  statusRibbon: $("status-ribbon"),
  memoryMiniStatus: $("memory-mini-status"),
  researchMiniStatus: $("research-mini-status"),
  companyMiniStatus: $("company-mini-status"),
  hermesRuntime: $("hermes-runtime"),
  ollamaRuntime: $("ollama-runtime"),
  modelRuntime: $("model-runtime"),
  workspaceLabel: $("workspace-label"),
  contextCount: $("context-count"),
  modelSelect: $("model-select"),
  workspaceButtons: $$("#workspace-mode .segmented-btn"),
  promptButtons: $$(".prompt-btn"),
  navButtons: $$("#page-nav .nav-button"),
  pageSections: $$(".page"),
  guardInternet: $("guard-internet"),
  guardBrowser: $("guard-browser"),
  guardTerminal: $("guard-terminal"),
  guardFiles: $("guard-files"),
  guardActions: $("guard-actions"),
  saveStateButton: $("save-state-btn"),
  exportButton: $("export-btn"),
  resetButton: $("reset-btn"),
  chatForm: $("chat-form"),
  chatInput: $("chat-input"),
  chatLog: $("chat-log"),
  chatStatus: $("chat-status"),
  notesInput: $("notes-input"),
  boardButtons: $$("#board-tabs .segmented-btn"),
  boardList: $("board-list"),
  addCardButton: $("add-card-btn"),
  skillSearch: $("skill-search"),
  skillsTabs: $$("#skills-tabs .segmented-btn"),
  gsdPanel: $("gsd-panel"),
  openclawPanel: $("openclaw-panel"),
  skillCategoryTabs: $("skill-category-tabs"),
  openclawList: $("openclaw-list"),
  vaultPathInput: $("vault-path-input"),
  memoryModeSelect: $("memory-mode-select"),
  captureModeSelect: $("capture-mode-select"),
  vaultBootstrapButton: $("vault-bootstrap-btn"),
  vaultRefreshButton: $("vault-refresh-btn"),
  vaultStatusLabel: $("vault-status-label"),
  vaultNoteCount: $("vault-note-count"),
  captureCount: $("capture-count"),
  vaultSyncAt: $("vault-sync-at"),
  vaultSearch: $("vault-search"),
  vaultNoteList: $("vault-note-list"),
  captureQueue: $("capture-queue"),
  lettaBaseUrlInput: $("letta-base-url-input"),
  lettaAgentIdInput: $("letta-agent-id-input"),
  lettaTestButton: $("letta-test-btn"),
  lettaSyncButton: $("letta-sync-btn"),
  lettaMode: $("letta-mode"),
  lettaMemfsCount: $("letta-memfs-count"),
  lettaSyncAt: $("letta-sync-at"),
  missionTitleInput: $("mission-title-input"),
  missionObjectiveInput: $("mission-objective-input"),
  missionScopeInput: $("mission-scope-input"),
  missionNetworkSelect: $("mission-network-select"),
  missionScheduleInput: $("mission-schedule-input"),
  missionTargetsInput: $("mission-targets-input"),
  createMissionButton: $("create-mission-btn"),
  researchMissionList: $("research-mission-list"),
  researchSelectedLabel: $("research-selected-label"),
  researchArtifactOutput: $("research-artifact-output"),
  runMissionButton: $("run-mission-btn"),
  promoteMissionButton: $("promote-mission-btn"),
  scheduleMissionButton: $("schedule-mission-btn"),
  paperclipBaseUrlInput: $("paperclip-base-url-input"),
  paperclipCompanyIdInput: $("paperclip-company-id-input"),
  companyTestButton: $("company-test-btn"),
  companySyncButton: $("company-sync-btn"),
  companyModeLabel: $("company-mode-label"),
  companyQueueCount: $("company-queue-count"),
  companyIdLabel: $("company-id-label"),
  companyOverviewCard: $("company-overview-card"),
  companyApprovalQueue: $("company-approval-queue"),
  companyAgentList: $("company-agent-list"),
  companyTicketList: $("company-ticket-list"),
  toastDeck: $("toast-deck"),
  avatarCanvas: $("hermes-avatar"),
  avatarMood: $("avatar-mood"),
  avatarLink: $("avatar-link"),
  speech: $("hermes-speech"),
  signalMeter: $("signal-meter"),
  focusMeter: $("focus-meter"),
  memoryMeter: $("memory-meter"),
  sceneCanvas: $("mission-scene"),
};

const appState = {
  mission: null,
  runtime: null,
  catalog: null,
  memoryStatus: null,
  vaultIndex: { notes: [], counts: {} },
  researchStatus: null,
  researchMissions: [],
  companyStatus: null,
  companyOverview: null,
  companyAgents: [],
  companyTickets: [],
  activeBoard: "research",
  activeSkillPanel: "gsd",
  activeSkillCategory: "research",
  selectedMissionId: null,
  pendingPatch: {},
  saveTimer: null,
  pointer: { x: 0, y: 0 },
  audioContext: null,
  audioUnlocked: false,
  avatar: { typing: 0, speakingUntil: 0, bubble: "Standing by in local mode.", mood: "Idle", presence: "boot" },
  scene: null,
};

async function fetchJSON(url, options = {}) {
  const response = await fetch(url, { headers: { "Content-Type": "application/json", ...(options.headers || {}) }, ...options });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) throw new Error(payload.error || `Request failed: ${response.status}`);
  return payload;
}

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
  setAceStatus("running", "running\u2026");
  try {
    const body = transcript ? { transcript } : {};
    const result = await fetchJSON("/api/ace/run", {
      method: "POST",
      body: JSON.stringify(body),
    });
    if (result.skipped) {
      setAceStatus("idle", "idle (short)");
    } else {
      setAceStatus("updated", "updated \u2713");
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
  const wireBtn = (id) => {
    const btn = document.getElementById(id);
    if (btn) btn.addEventListener("click", () => runAce());
  };
  wireBtn("ace-run-btn");
  wireBtn("ace-header-run-btn");
}

// ── Vault Editor ──────────────────────────────────
const vaultEditor = { currentPath: null, isEditing: false, treeData: [] };

function renderMarkdown(md) {
  return md
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/^---[\s\S]*?---\n/, "")
    .replace(/^#{1}\s(.+)$/gm, "<h1>$1</h1>")
    .replace(/^#{2}\s(.+)$/gm, "<h2>$1</h2>")
    .replace(/^#{3}\s(.+)$/gm, "<h3>$1</h3>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    .replace(/\n\n/g, "<br><br>");
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
    treeEl.innerHTML = '<p class="muted">Could not load vault.</p>';
  }
}

function renderVaultTree(tree) {
  const treeEl = document.getElementById("vault-tree-list");
  if (!treeEl) return;
  if (!tree.length) {
    treeEl.innerHTML = '<p class="muted" style="padding:10px">Vault empty. Bootstrap it first.</p>';
    return;
  }
  treeEl.innerHTML = tree.map(f =>
    '<div class="vault-folder-group">' +
    '<div class="vault-folder-name">' + f.folder + '</div>' +
    f.notes.map(n =>
      '<div class="vault-note-item" data-note-path="' + n.relative_path + '" title="' + n.title + '">' + n.title + '</div>'
    ).join("") +
    '</div>'
  ).join("");
  treeEl.querySelectorAll(".vault-note-item").forEach(item => {
    item.addEventListener("click", () => openVaultNote(item.dataset.notePath, item.textContent.trim()));
  });
}

async function openVaultNote(relativePath, title) {
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
    const data = await fetchJSON("/api/vault/note?path=" + encodeURIComponent(relativePath));
    preview.innerHTML = renderMarkdown(data.raw);
    editor.value = data.raw;
  } catch (err) {
    preview.innerHTML = '<p class="muted">Could not load note.</p>';
  }
}

async function saveVaultNote() {
  if (!vaultEditor.currentPath) return;
  const editor = document.getElementById("vault-note-editor");
  const saveBtn = document.getElementById("vault-save-btn");
  saveBtn.textContent = "Saving…";
  try {
    await fetchJSON("/api/vault/note", {
      method: "POST",
      body: JSON.stringify({ path: vaultEditor.currentPath, content: editor.value }),
    });
    document.getElementById("vault-note-preview").innerHTML = renderMarkdown(editor.value);
    saveBtn.textContent = "Saved \u2713";
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
  if (!title) { document.getElementById("new-note-title").focus(); return; }
  const btn = document.getElementById("new-note-create-btn");
  btn.textContent = "Creating…";
  try {
    await fetchJSON("/api/vault/note/new", {
      method: "POST",
      body: JSON.stringify({ type, title, summary, body }),
    });
    document.getElementById("vault-new-note-modal").style.display = "none";
    btn.textContent = "Create Note";
    // Reset form
    document.getElementById("new-note-title").value = "";
    document.getElementById("new-note-summary").value = "";
    document.getElementById("new-note-body").value = "";
    await loadVaultTree();
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

  if (editToggle) editToggle.addEventListener("click", () => {
    const preview = document.getElementById("vault-note-preview");
    const editor = document.getElementById("vault-note-editor");
    vaultEditor.isEditing = !vaultEditor.isEditing;
    preview.style.display = vaultEditor.isEditing ? "none" : "block";
    editor.style.display = vaultEditor.isEditing ? "block" : "none";
    editToggle.textContent = vaultEditor.isEditing ? "Preview" : "Edit";
    if (saveBtn) saveBtn.style.display = vaultEditor.isEditing ? "inline-flex" : "none";
  });
  if (saveBtn) saveBtn.addEventListener("click", saveVaultNote);
  if (refreshBtn) refreshBtn.addEventListener("click", loadVaultTree);
  if (newNoteBtn) newNoteBtn.addEventListener("click", () => {
    if (modal) { modal.style.display = "flex"; document.getElementById("new-note-title")?.focus(); }
  });
  if (createBtn) createBtn.addEventListener("click", createVaultNote);
  if (cancelBtn) cancelBtn.addEventListener("click", () => { if (modal) modal.style.display = "none"; });

  // Load tree when Memory Bay becomes active
  document.querySelectorAll('.nav-button[data-page="memory-bay"]').forEach(btn => {
    btn.addEventListener("click", () => setTimeout(loadVaultTree, 100));
  });
}

// ── UI Micro-animations ───────────────────────────
function burstParticles(x, y, color) {
  for (var i = 0; i < 10; i++) {
    var p = document.createElement("div");
    p.className = "burst-particle";
    var angle = Math.random() * Math.PI * 2;
    var dist = 30 + Math.random() * 50;
    p.style.cssText = "left:" + x + "px;top:" + y + "px;background:" + color +
      ";--dx:" + (Math.cos(angle) * dist) + "px;--dy:" + (Math.sin(angle) * dist) + "px";
    document.body.appendChild(p);
    setTimeout(function() { p.remove(); }, 620);
  }
}

function addMagneticHover(el, strength) {
  strength = strength || 3;
  el.addEventListener("mousemove", function(e) {
    var rect = el.getBoundingClientRect();
    var dx = (e.clientX - rect.left - rect.width / 2) / rect.width;
    var dy = (e.clientY - rect.top - rect.height / 2) / rect.height;
    el.style.transform = "translate(" + (dx * strength) + "px," + (dy * strength) + "px)";
  });
  el.addEventListener("mouseleave", function() { el.style.transform = ""; });
}

function initMicroAnimations() {
  // Magnetic hover on nav buttons
  document.querySelectorAll('[data-page]').forEach(function(el) {
    if (el.tagName === 'BUTTON' || el.classList.contains('nav-button')) addMagneticHover(el, 3);
  });

  // Skill arm particle burst via event delegation
  document.addEventListener("click", function(e) {
    var armBtn = e.target.closest("[data-arm-skill], [data-workflow]");
    if (armBtn) {
      var rect = armBtn.getBoundingClientRect();
      var colors = getCurrentPaletteColors();
      burstParticles(rect.left + rect.width / 2, rect.top + rect.height / 2,
        "#" + colors.primary.toString(16).padStart(6, "0"));
    }
  });
}

function setActive(buttons, value, key) { buttons.forEach((button) => button.classList.toggle("is-active", button.dataset[key] === value)); }
function labelTime(value) { return value ? value.replace("T", " ").replace("Z", "") : "Never"; }
function trimText(value, limit = 180) { const text = String(value || "").replace(/\s+/g, " ").trim(); return text.length <= limit ? text : `${text.slice(0, Math.max(0, limit - 3)).trim()}...`; }
function buzz(pattern = 10) { if (navigator.vibrate) navigator.vibrate(pattern); }
function unlockAudio() { if (!appState.audioUnlocked) { appState.audioContext = appState.audioContext || new AudioContext(); appState.audioUnlocked = true; } }
function playTone(frequency, duration, type = "sine", gainValue = 0.024, delay = 0) {
  if (!appState.audioUnlocked) return;
  const ctx = appState.audioContext;
  const start = ctx.currentTime + delay;
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(gainValue, start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain).connect(ctx.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}
function playUiSound(name) {
  if (!appState.audioUnlocked) return;
  if (name === "send") { playTone(660, 0.08, "triangle"); playTone(880, 0.14, "sine", 0.018, 0.05); return; }
  if (name === "receive") { playTone(520, 0.09, "sine"); playTone(740, 0.15, "triangle", 0.018, 0.04); playTone(920, 0.18, "sine", 0.014, 0.09); return; }
  if (name === "switch") { playTone(780, 0.06, "square", 0.016); playTone(980, 0.1, "triangle", 0.012, 0.04); return; }
  playTone(620, 0.07, "triangle");
}
function toast(title, body) {
  const node = document.createElement("div");
  node.className = "toast";
  node.innerHTML = `<strong>${title}</strong><div>${body}</div>`;
  elements.toastDeck.appendChild(node);
  window.setTimeout(() => node.remove(), 3600);
}
function setSpeech(text, mood = null, speaking = false) {
  elements.speech.textContent = text;
  appState.avatar.bubble = text;
  if (mood) appState.avatar.mood = mood;
  if (speaking) appState.avatar.speakingUntil = performance.now() + 2600;
  elements.avatarMood.textContent = appState.avatar.mood;
}

function queuePatch(patch) {
  appState.pendingPatch = { ...appState.pendingPatch, ...patch };
  window.clearTimeout(appState.saveTimer);
  appState.saveTimer = window.setTimeout(() => { void flushPatch(); }, 420);
}

async function flushPatch() {
  if (!Object.keys(appState.pendingPatch).length) return;
  const patch = appState.pendingPatch;
  appState.pendingPatch = {};
  const payload = await fetchJSON("/api/state", { method: "POST", body: JSON.stringify(patch) });
  applyStatus(payload);
}

function applyStatus(payload) {
  appState.mission = payload.state;
  appState.runtime = payload.runtime;
  appState.memoryStatus = payload.subsystems?.memory || appState.memoryStatus;
  appState.researchStatus = payload.subsystems?.research || appState.researchStatus;
  appState.companyStatus = payload.subsystems?.company || appState.companyStatus;
  if (appState.mission?.active_page) setPage(appState.mission.active_page, false);
  renderStatus();
  renderChat();
  renderBoards();
  renderSkills();
  renderMemory();
}

async function loadApp() {
  const [status, catalog, memoryStatus, vaultIndex, researchStatus, researchMissions, companyStatus, companyOverview, companyAgents, companyTickets] = await Promise.all([
    fetchJSON("/api/status"),
    fetchJSON("/api/catalog"),
    fetchJSON("/api/memory/status"),
    fetchJSON("/api/vault/index"),
    fetchJSON("/api/research/status"),
    fetchJSON("/api/research/missions"),
    fetchJSON("/api/company/status"),
    fetchJSON("/api/company/overview"),
    fetchJSON("/api/company/agents"),
    fetchJSON("/api/company/tickets"),
  ]);
  appState.catalog = catalog.catalog;
  appState.memoryStatus = memoryStatus;
  appState.vaultIndex = vaultIndex;
  appState.researchStatus = researchStatus;
  appState.researchMissions = researchMissions.missions || [];
  appState.companyStatus = companyStatus;
  appState.companyOverview = companyOverview;
  appState.companyAgents = companyAgents.agents || [];
  appState.companyTickets = companyTickets.tickets || [];
  appState.mission = status.state;
  appState.runtime = status.runtime;
  appState.selectedMissionId = appState.selectedMissionId || appState.researchMissions[0]?.id || null;
  renderStatus();
  renderPages();
  renderChat();
  renderBoards();
  renderSkills();
  renderMemory();
  renderResearch();
  renderCompany();
}

function renderStatus() {
  if (!appState.mission || !appState.runtime) return;
  const ollamaOnline = Boolean(appState.runtime.ollama?.online);
  elements.statusRibbon.textContent = `Local bridge ${ollamaOnline ? "online" : "offline"}. Model ${appState.mission.current_model}. Memory ${appState.memoryStatus?.note_count || 0} notes. Approvals ${appState.companyStatus?.queued_approvals || 0}.`;
  elements.memoryMiniStatus.textContent = `${appState.memoryStatus?.note_count || 0} notes`;
  elements.researchMiniStatus.textContent = `${appState.researchStatus?.mission_count || 0} missions`;
  elements.companyMiniStatus.textContent = `${appState.companyStatus?.queued_approvals || 0} queued`;
  elements.hermesRuntime.textContent = appState.runtime.agent_available ? "Linked" : "Offline";
  elements.ollamaRuntime.innerHTML = `<span class="status-pill ${ollamaOnline ? "is-online" : ""}">${ollamaOnline ? "Online" : "Offline"}</span>`;
  elements.modelRuntime.textContent = appState.mission.current_model;
  elements.workspaceLabel.textContent = appState.runtime.workspace_mode_label;
  elements.contextCount.textContent = `${appState.mission.selected_context_note_ids?.length || 0} notes`;
  elements.modelSelect.value = appState.mission.current_model;
  elements.notesInput.value = appState.mission.notes || "";
  elements.guardInternet.checked = Boolean(appState.mission.guardrails?.internet_access_requested);
  elements.guardBrowser.checked = Boolean(appState.mission.guardrails?.browser_tools_requested);
  elements.guardTerminal.checked = Boolean(appState.mission.guardrails?.terminal_tools_requested);
  elements.guardFiles.checked = Boolean(appState.mission.guardrails?.file_tools_requested);
  elements.guardActions.checked = Boolean(appState.mission.guardrails?.external_actions_requested);
  elements.vaultPathInput.value = appState.mission.vault_path || "";
  elements.memoryModeSelect.value = appState.mission.memory_mode || "vault_plus_letta";
  elements.captureModeSelect.value = appState.mission.capture_mode || "selective_auto";
  elements.lettaBaseUrlInput.value = appState.mission.letta_base_url || "";
  elements.lettaAgentIdInput.value = appState.mission.letta_agent_id || "";
  elements.paperclipBaseUrlInput.value = appState.mission.paperclip_base_url || "";
  elements.paperclipCompanyIdInput.value = appState.mission.paperclip_company_id || "";
  elements.companyIdLabel.textContent = appState.companyStatus?.company_id || "-";
  elements.companyModeLabel.textContent = appState.companyStatus?.mode || "pending";
  elements.companyQueueCount.textContent = String(appState.companyStatus?.queued_approvals || 0);
  elements.vaultStatusLabel.textContent = appState.memoryStatus?.vault_exists ? "Ready" : "Not Bootstrapped";
  elements.vaultNoteCount.textContent = String(appState.memoryStatus?.note_count || 0);
  elements.captureCount.textContent = String(appState.memoryStatus?.capture_queue_count || 0);
  elements.vaultSyncAt.textContent = labelTime(appState.memoryStatus?.last_vault_sync_at);
  elements.lettaMode.textContent = appState.memoryStatus?.letta?.mode || "pending";
  elements.lettaMemfsCount.textContent = String(appState.memoryStatus?.letta?.memfs_note_count || 0);
  elements.lettaSyncAt.textContent = labelTime(appState.memoryStatus?.last_letta_sync_at);
  elements.chatStatus.textContent = appState.mission.armed_workflows?.length ? `Hermes is standing by with ${appState.mission.armed_workflows.length} armed workflow pack(s).` : "Hermes is standing by.";
  elements.avatarLink.textContent = ollamaOnline ? "Local Link Live" : "Offline Loop";
  elements.signalMeter.style.width = `${ollamaOnline ? 88 : 30}%`;
  elements.focusMeter.style.width = `${Math.min(100, 24 + (appState.mission.armed_workflows?.length || 0) * 18)}%`;
  elements.memoryMeter.style.width = `${Math.min(100, 18 + (appState.mission.selected_context_note_ids?.length || 0) * 16)}%`;
  setActive(elements.workspaceButtons, appState.mission.workspace_mode, "mode");
  setActive(elements.boardButtons, appState.activeBoard, "board");
  setActive(elements.skillsTabs, appState.activeSkillPanel, "skillPanel");
}

function renderPages() {
  const currentPage = appState.mission?.active_page || "command-bridge";
  elements.pageSections.forEach(function(section) {
    var isTarget = section.dataset.page === currentPage;
    var wasActive = section.classList.contains("is-active");
    if (isTarget && !wasActive) {
      section.classList.add("is-entering");
      setTimeout(function() { section.classList.remove("is-entering"); }, 280);
    }
    section.classList.toggle("is-active", isTarget);
  });
  elements.navButtons.forEach((button) => button.classList.toggle("is-active", button.dataset.page === currentPage));
}
function setPage(page, persist = true) {
  if (!PAGE_IDS.has(page)) return;
  if (appState.scene?.warpState) {
    appState.scene.warpState.active = true;
    appState.scene.warpState.progress = 0;
  }
  if (appState.mission) appState.mission.active_page = page;
  renderPages();
  if (persist) queuePatch({ active_page: page });
}

function createMessage(role, content) {
  const node = document.createElement("article");
  node.className = "message";
  node.dataset.role = role;
  node.innerHTML = `<div class="message-badge"></div><div><p class="message-role">${role === "assistant" ? "Hermes" : "You"}</p><div class="message-content"></div></div>`;
  node.querySelector(".message-content").textContent = content;
  return node;
}
function renderChat() {
  elements.chatLog.innerHTML = "";
  const chatLog = appState.mission?.chat_log || [];
  if (!chatLog.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "Open the line and give Hermes a task. This cockpit is optimized for research briefs, operating plans, memory capture, and approval-gated business support.";
    elements.chatLog.appendChild(empty);
    return;
  }
  chatLog.forEach((entry) => { if (entry?.content && entry?.role) elements.chatLog.appendChild(createMessage(entry.role, entry.content)); });
  elements.chatLog.scrollTop = elements.chatLog.scrollHeight;
}

function renderBoards() {
  elements.boardList.innerHTML = "";
  const board = appState.mission?.boards?.[appState.activeBoard] || [];
  if (!board.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No mission cards here yet. Add one for the next thread you want under control.";
    elements.boardList.appendChild(empty);
    return;
  }
  board.forEach((card, index) => {
    const node = document.createElement("div");
    node.className = "card";
    node.innerHTML = `<div class="field"><span class="field-label">Title</span><input class="ui-input card-title-input" type="text"></div><div class="field"><span class="field-label">Status</span><select class="ui-input card-status-select"><option>Queued</option><option>Ready</option><option>Active</option><option>Standby</option><option>Blocked</option></select></div><div class="field"><span class="field-label">Detail</span><textarea class="ui-input card-detail-input" rows="4"></textarea></div><button class="ui-button" type="button">Remove</button>`;
    node.querySelector(".card-title-input").value = card.title || "";
    node.querySelector(".card-status-select").value = card.status || "Queued";
    node.querySelector(".card-detail-input").value = card.detail || "";
    node.querySelector(".card-title-input").addEventListener("input", (event) => { appState.mission.boards[appState.activeBoard][index].title = event.target.value; queuePatch({ boards: appState.mission.boards }); });
    node.querySelector(".card-status-select").addEventListener("change", (event) => { appState.mission.boards[appState.activeBoard][index].status = event.target.value; queuePatch({ boards: appState.mission.boards }); });
    node.querySelector(".card-detail-input").addEventListener("input", (event) => { appState.mission.boards[appState.activeBoard][index].detail = event.target.value; queuePatch({ boards: appState.mission.boards }); });
    node.querySelector("button").addEventListener("click", () => { appState.mission.boards[appState.activeBoard].splice(index, 1); renderBoards(); queuePatch({ boards: appState.mission.boards }); });
    elements.boardList.appendChild(node);
  });
}

function filteredGsd() {
  const query = elements.skillSearch.value.trim().toLowerCase();
  const items = appState.catalog?.gsd || [];
  return query ? items.filter((item) => `${item.title} ${item.description} ${item.lane}`.toLowerCase().includes(query)) : items;
}
function filteredOpenclaw() {
  const query = elements.skillSearch.value.trim().toLowerCase();
  const items = appState.catalog?.openclaw?.[appState.activeSkillCategory] || [];
  const list = query ? items.filter((item) => `${item.title} ${item.description} ${item.category_label}`.toLowerCase().includes(query)) : items;
  return list.slice(0, 48);
}
function toggleWorkflow(id) {
  const armed = new Set(appState.mission.armed_workflows || []);
  armed.has(id) ? armed.delete(id) : armed.add(id);
  appState.mission.armed_workflows = Array.from(armed);
  renderSkills();
  queuePatch({ armed_workflows: appState.mission.armed_workflows });
}
function toggleSkill(id) {
  const armed = new Set(appState.mission.armed_skills || []);
  armed.has(id) ? armed.delete(id) : armed.add(id);
  appState.mission.armed_skills = Array.from(armed);
  renderSkills();
  queuePatch({ armed_skills: appState.mission.armed_skills });
}
function renderSkills() {
  elements.gsdPanel.innerHTML = "";
  elements.openclawList.innerHTML = "";
  elements.skillCategoryTabs.innerHTML = "";
  elements.gsdPanel.style.display = appState.activeSkillPanel === "gsd" ? "grid" : "none";
  elements.openclawPanel.style.display = appState.activeSkillPanel === "openclaw" ? "grid" : "none";
  (appState.catalog?.gsd || []).length || (elements.gsdPanel.innerHTML = `<div class="empty-state">Workflow catalog unavailable.</div>`);
  filteredGsd().forEach((item) => {
    const node = document.createElement("div");
    node.className = "skill-item";
    const riskLevel = item.riskLevel || (item.lane === "ops" || item.lane === "strategy" ? "medium" : "low");
    node.innerHTML = `<div class="topline"><h4>${item.title}</h4><span class="pill">${item.lane}</span><span class="risk-badge risk-${riskLevel}">${riskLevel}</span></div><div class="muted">${item.description}</div><div class="row-actions"><button class="ui-button ${appState.mission.armed_workflows.includes(item.id) ? "primary" : ""}" data-workflow="${item.id}" type="button">${appState.mission.armed_workflows.includes(item.id) ? "Armed" : "Arm"}</button></div>`;
    node.querySelector("button").addEventListener("click", () => toggleWorkflow(item.id));
    elements.gsdPanel.appendChild(node);
  });
  Object.entries(appState.catalog?.openclaw || {}).forEach(([category, items]) => {
    if (!items.length) return;
    const button = document.createElement("button");
    button.className = `segmented-btn ${appState.activeSkillCategory === category ? "is-active" : ""}`;
    button.type = "button";
    button.dataset.category = category;
    button.textContent = category.replace(/^[a-z]/, (m) => m.toUpperCase());
    button.addEventListener("click", () => { appState.activeSkillCategory = category; renderSkills(); });
    elements.skillCategoryTabs.appendChild(button);
  });
  filteredOpenclaw().forEach((item) => {
    const node = document.createElement("div");
    node.className = "skill-item";
    const riskLevel = item.riskLevel || "low";
    node.innerHTML = `<div class="topline"><h4>${item.title}</h4><span class="pill">${item.category_label}</span><span class="risk-badge risk-${riskLevel}">${riskLevel}</span></div><div class="muted">${item.description}</div><div class="row-actions"><button class="ui-button ${appState.mission.armed_skills.includes(item.id) ? "primary" : ""}" data-arm-skill="${item.id}" type="button">${appState.mission.armed_skills.includes(item.id) ? "Armed" : "Arm"}</button><a class="ui-button" href="${item.url}" target="_blank" rel="noreferrer">Source</a></div>`;
    node.querySelector("button").addEventListener("click", () => toggleSkill(item.id));
    elements.openclawList.appendChild(node);
  });
}

function selectedContextSet() { return new Set(appState.mission?.selected_context_note_ids || []); }
function renderMemory() {
  if (!appState.memoryStatus) return;
  const query = elements.vaultSearch.value.trim().toLowerCase();
  const notes = (appState.vaultIndex.notes || []).filter((note) => !query || `${note.title} ${note.summary} ${note.type}`.toLowerCase().includes(query));
  const selected = selectedContextSet();
  elements.vaultNoteList.innerHTML = "";
  if (!notes.length) elements.vaultNoteList.innerHTML = `<div class="empty-state">${appState.memoryStatus.vault_exists ? "No indexed notes match your search." : "Bootstrap the vault to begin indexing notes."}</div>`;
  notes.forEach((note) => {
    const node = document.createElement("div");
    node.className = `note-item ${selected.has(note.id) ? "is-selected" : ""}`;
    node.innerHTML = `<div class="topline"><h4>${note.title}</h4><span class="pill">${note.type}</span></div><div class="note-meta">${note.relative_path || note.path}</div><p>${trimText(note.summary, 200)}</p><div class="row-actions"><button class="ui-button ${selected.has(note.id) ? "primary" : ""}" type="button">${selected.has(note.id) ? "Pinned" : "Pin to Hermes"}</button></div>`;
    node.querySelector("button").addEventListener("click", async () => {
      const next = new Set(selectedContextSet());
      next.has(note.id) ? next.delete(note.id) : next.add(note.id);
      await fetchJSON("/api/vault/context", { method: "POST", body: JSON.stringify({ note_ids: Array.from(next) }) });
      appState.mission.selected_context_note_ids = Array.from(next);
      renderMemory();
      renderStatus();
      setSpeech(`${next.size} vault note${next.size === 1 ? "" : "s"} pinned into Hermes context.`, "Memory", true);
    });
    elements.vaultNoteList.appendChild(node);
  });
  elements.captureQueue.innerHTML = "";
  const queue = appState.mission?.capture_queue || [];
  if (!queue.length) elements.captureQueue.innerHTML = `<div class="empty-state">No pending capture candidates. Hermes will surface durable notes here when selective capture is enabled.</div>`;
  queue.forEach((item) => {
    const node = document.createElement("div");
    node.className = "capture-item";
    node.innerHTML = `<div class="topline"><h4>${item.title}</h4><span class="pill">${item.type}</span></div><p>${trimText(item.summary, 190)}</p><div class="row-actions"><button class="ui-button primary" data-action="save" type="button">Save to Vault</button><button class="ui-button" data-action="sync" type="button">Save + Letta</button><button class="ui-button" data-action="discard" type="button">Discard</button></div>`;
    node.querySelector('[data-action="save"]').addEventListener("click", () => handleCapture(item.id, false));
    node.querySelector('[data-action="sync"]').addEventListener("click", () => handleCapture(item.id, true));
    node.querySelector('[data-action="discard"]').addEventListener("click", () => handleCapture(item.id, false, true));
    elements.captureQueue.appendChild(node);
  });
}

function renderResearch() {
  elements.researchMissionList.innerHTML = "";
  const missions = appState.researchMissions || [];
  if (!missions.length) elements.researchMissionList.innerHTML = `<div class="empty-state">No missions yet. Build one to start a local research run.</div>`;
  missions.forEach((mission) => {
    const node = document.createElement("div");
    node.className = "mission-card";
    node.innerHTML = `<div class="topline"><h4>${mission.title}</h4><span class="pill ${mission.network_policy === "local-only" ? "success" : "warning"}">${mission.network_policy}</span></div><p>${trimText(mission.objective, 180)}</p><div class="tag-row"><span class="badge">${mission.status}</span><span class="badge">${mission.schedule || "manual"}</span><span class="badge">${mission.output_targets?.join(", ") || "brief"}</span></div><div class="row-actions"><button class="ui-button ${appState.selectedMissionId === mission.id ? "primary" : ""}" type="button">${appState.selectedMissionId === mission.id ? "Selected" : "Open"}</button></div>`;
    node.querySelector("button").addEventListener("click", () => { appState.selectedMissionId = mission.id; renderResearch(); });
    elements.researchMissionList.appendChild(node);
  });
  const selected = missions.find((mission) => mission.id === appState.selectedMissionId) || missions[0];
  appState.selectedMissionId = selected?.id || null;
  if (!selected) {
    elements.researchSelectedLabel.innerHTML = `<strong>No mission selected</strong><p>Select a mission to run or promote.</p>`;
    elements.researchArtifactOutput.textContent = "Mission artifacts will appear here.";
    return;
  }
  elements.researchSelectedLabel.innerHTML = `<strong>${selected.title}</strong><p>${trimText(selected.summary || selected.objective, 220)}</p>`;
  elements.missionScheduleInput.value = selected.schedule || "manual";
  const latestArtifact = selected.artifacts?.[0];
  elements.researchArtifactOutput.textContent = latestArtifact ? `Latest artifact: ${latestArtifact.id}\nCreated: ${latestArtifact.created_at}\nPath: ${latestArtifact.path}\n\n${latestArtifact.summary}` : "This mission has not been run yet.";
}

function renderCompany() {
  const overview = appState.companyOverview?.overview || {};
  elements.companyOverviewCard.innerHTML = `<strong>${overview.company_name || "Aerugi"}</strong><p>${overview.mission || "Local-first company orchestration."}</p><div class="tag-row"><span class="badge">${overview.status || appState.companyStatus?.mode || "offline-adapter"}</span><span class="badge">${overview.run_health || "contained"}</span><span class="badge">${overview.queued_approvals || 0} approvals</span></div>`;
  elements.companyApprovalQueue.innerHTML = "";
  const approvals = appState.companyOverview?.approval_queue || [];
  if (!approvals.length) elements.companyApprovalQueue.innerHTML = `<div class="empty-state">No approval items in queue.</div>`;
  approvals.forEach((item) => {
    const node = document.createElement("div");
    node.className = "approval-card";
    node.innerHTML = `<div class="topline"><h4>${item.title}</h4><span class="pill ${item.risk === "spend" ? "danger" : "warning"}">${item.risk}</span></div><p>${item.reason}</p>`;
    elements.companyApprovalQueue.appendChild(node);
  });
  elements.companyAgentList.innerHTML = "";
  appState.companyAgents.forEach((agent) => {
    const node = document.createElement("div");
    node.className = "agent-card";
    node.innerHTML = `<h4>${agent.name}</h4><div class="tag-row"><span class="badge">${agent.role}</span><span class="badge">${agent.status}</span></div><p><strong>Ownership:</strong> ${agent.ownership}</p><p><strong>Work:</strong> ${agent.assigned_work}</p><p><strong>Blocked:</strong> ${agent.blocked_state}</p>`;
    elements.companyAgentList.appendChild(node);
  });
  elements.companyTicketList.innerHTML = "";
  appState.companyTickets.forEach((ticket) => {
    const node = document.createElement("div");
    node.className = "ticket-card";
    node.innerHTML = `<div class="topline"><h4>${ticket.title}</h4><span class="pill ${ticket.approval_status === "awaiting" ? "warning" : ticket.approval_status === "approved" ? "success" : "danger"}">${ticket.approval_status}</span></div><div class="tag-row"><span class="badge">${ticket.priority}</span><span class="badge">${ticket.assignee}</span><span class="badge">${ticket.status}</span>${ticket.internet_required ? '<span class="badge warning">internet</span>' : ''}${ticket.spend_risk ? '<span class="badge danger">spend</span>' : ''}</div><ul class="ticket-log"></ul><div class="approval-actions"></div>`;
    const log = node.querySelector(".ticket-log");
    (ticket.log || []).forEach((entry) => { const li = document.createElement("li"); li.textContent = entry; log.appendChild(li); });
    const actions = node.querySelector(".approval-actions");
    if (ticket.approval_status === "awaiting") {
      ["approve", "reject"].forEach((action) => {
        const button = document.createElement("button");
        button.className = `ui-button ${action === "approve" ? "primary" : ""}`;
        button.type = "button";
        button.textContent = action === "approve" ? "Approve" : "Reject";
        button.addEventListener("click", () => handleApproval(ticket.id, action));
        actions.appendChild(button);
      });
    }
    elements.companyTicketList.appendChild(node);
  });
}

async function refreshMemory() {
  const [memoryStatus, vaultIndex] = await Promise.all([fetchJSON("/api/memory/status"), fetchJSON("/api/vault/index")]);
  appState.memoryStatus = memoryStatus;
  appState.vaultIndex = vaultIndex;
  renderStatus();
  renderMemory();
}
async function refreshResearch() {
  const [status, missions] = await Promise.all([fetchJSON("/api/research/status"), fetchJSON("/api/research/missions")]);
  appState.researchStatus = status;
  appState.researchMissions = missions.missions || [];
  renderStatus();
  renderResearch();
}
async function refreshCompany() {
  const [status, overview, agents, tickets] = await Promise.all([fetchJSON("/api/company/status"), fetchJSON("/api/company/overview"), fetchJSON("/api/company/agents"), fetchJSON("/api/company/tickets")]);
  appState.companyStatus = status;
  appState.companyOverview = overview;
  appState.companyAgents = agents.agents || [];
  appState.companyTickets = tickets.tickets || [];
  renderStatus();
  renderCompany();
}

async function handleCapture(candidateId, syncToLetta = false, discard = false) {
  const payload = await fetchJSON("/api/vault/capture", { method: "POST", body: JSON.stringify({ candidate_id: candidateId, sync_to_letta: syncToLetta, discard }) });
  appState.mission = payload.state || appState.mission;
  await refreshMemory();
  setSpeech(discard ? "Capture discarded." : syncToLetta ? "Capture saved to vault and staged for Letta." : "Capture saved to vault.", "Memory", true);
  toast("Memory Bay", discard ? "Capture removed from queue." : "Capture processed.");
}

async function handleApproval(ticketId, action) {
  await fetchJSON("/api/company/approve", { method: "POST", body: JSON.stringify({ ticket_id: ticketId, action }) });
  await refreshCompany();
  buzz(action === "approve" ? [12, 22, 12] : [16, 34, 16]);
  playUiSound(action === "approve" ? "receive" : "switch");
  setSpeech(`Company Ops ${action}d ticket ${ticketId}.`, "Operator", true);
}

function bindEvents() {
  document.addEventListener("pointerdown", unlockAudio, { once: true });
  document.addEventListener("pointermove", (event) => { appState.pointer.x = event.clientX / window.innerWidth - 0.5; appState.pointer.y = event.clientY / window.innerHeight - 0.5; });
  elements.navButtons.forEach((button) => button.addEventListener("click", () => { setPage(button.dataset.page); playUiSound("switch"); buzz(8); }));
  elements.workspaceButtons.forEach((button) => button.addEventListener("click", () => { appState.mission.workspace_mode = button.dataset.mode; setActive(elements.workspaceButtons, button.dataset.mode, "mode"); queuePatch({ workspace_mode: button.dataset.mode }); }));
  elements.boardButtons.forEach((button) => button.addEventListener("click", () => { appState.activeBoard = button.dataset.board; renderBoards(); setActive(elements.boardButtons, button.dataset.board, "board"); }));
  elements.skillsTabs.forEach((button) => button.addEventListener("click", () => { appState.activeSkillPanel = button.dataset.skillPanel; renderSkills(); setActive(elements.skillsTabs, button.dataset.skillPanel, "skillPanel"); }));
  elements.promptButtons.forEach((button) => button.addEventListener("click", () => { elements.chatInput.value = button.dataset.prompt; appState.avatar.typing = 1; setSpeech(trimText(button.dataset.prompt, 120), "Listening"); elements.chatInput.focus(); }));
  elements.modelSelect.addEventListener("change", () => queuePatch({ current_model: elements.modelSelect.value }));
  [elements.guardInternet, elements.guardBrowser, elements.guardTerminal, elements.guardFiles, elements.guardActions].forEach((input) => input.addEventListener("change", () => {
    appState.mission.guardrails = {
      internet_access_requested: elements.guardInternet.checked,
      browser_tools_requested: elements.guardBrowser.checked,
      terminal_tools_requested: elements.guardTerminal.checked,
      file_tools_requested: elements.guardFiles.checked,
      external_actions_requested: elements.guardActions.checked,
    };
    queuePatch({ guardrails: appState.mission.guardrails });
  }));
  elements.notesInput.addEventListener("input", (event) => { appState.mission.notes = event.target.value; queuePatch({ notes: appState.mission.notes }); });
  elements.skillSearch.addEventListener("input", renderSkills);
  elements.vaultSearch.addEventListener("input", renderMemory);
  elements.addCardButton.addEventListener("click", () => {
    appState.mission.boards[appState.activeBoard].push({ id: `card-${Date.now()}`, title: "New Mission", status: "Queued", detail: "Add a concrete next action or question." });
    renderBoards();
    queuePatch({ boards: appState.mission.boards });
  });
  elements.chatInput.addEventListener("input", () => { appState.avatar.typing = Math.min(1, elements.chatInput.value.trim().length / 80); setSpeech(elements.chatInput.value.trim() ? trimText(elements.chatInput.value, 120) : "Standing by in local mode.", elements.chatInput.value.trim() ? "Listening" : "Idle"); });
  elements.chatForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const message = elements.chatInput.value.trim();
    if (!message) return;
    unlockAudio();
    playUiSound("send");
    buzz([10, 20, 10]);
    elements.chatStatus.textContent = "Hermes is thinking in local mode...";
    setSpeech("Thinking in local mode...", "Thinking", true);
    appState.avatar.presence = "thinking";
    const chatPayload = await fetchJSON("/api/chat", { method: "POST", body: JSON.stringify({ message }) });
    appState.mission = chatPayload.state || appState.mission;
    applyStatus(await fetchJSON("/api/status"));
    elements.chatInput.value = "";
    appState.avatar.typing = 0;
    elements.chatStatus.textContent = "Hermes is standing by.";
    playUiSound("receive");
    setSpeech(trimText(chatPayload.response, 140), "Responding", true);
    appState.avatar.presence = "speaking";
    setTimeout(function() { appState.avatar.presence = "online"; }, 2000);
    await refreshMemory();
  });
  elements.saveStateButton.addEventListener("click", async () => { await flushPatch(); toast("Mission Control", "Layout and control state saved."); playUiSound("switch"); });
  elements.exportButton.addEventListener("click", async () => {
    const payload = await fetchJSON("/api/export");
    const blob = new Blob([JSON.stringify(payload.payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = payload.filename; link.click(); URL.revokeObjectURL(url);
    toast("Export", "Session log exported.");
  });
  elements.resetButton.addEventListener("click", async () => { runAce(); const payload = await fetchJSON("/api/reset", { method: "POST", body: JSON.stringify({ wipe_chat_log: true }) }); applyStatus(payload); renderChat(); toast("Session", "Chat session reset."); });
  elements.vaultPathInput.addEventListener("change", () => queuePatch({ vault_path: elements.vaultPathInput.value }));
  elements.memoryModeSelect.addEventListener("change", () => queuePatch({ memory_mode: elements.memoryModeSelect.value }));
  elements.captureModeSelect.addEventListener("change", () => queuePatch({ capture_mode: elements.captureModeSelect.value }));
  elements.vaultBootstrapButton.addEventListener("click", async () => { await fetchJSON("/api/vault/bootstrap", { method: "POST", body: JSON.stringify({}) }); await refreshMemory(); toast("Memory Bay", "Vault bootstrapped and indexed."); });
  elements.vaultRefreshButton.addEventListener("click", async () => { await refreshMemory(); toast("Memory Bay", "Vault index refreshed."); });
  elements.lettaBaseUrlInput.addEventListener("change", () => queuePatch({ letta_base_url: elements.lettaBaseUrlInput.value }));
  elements.lettaAgentIdInput.addEventListener("change", () => queuePatch({ letta_agent_id: elements.lettaAgentIdInput.value }));
  elements.lettaTestButton.addEventListener("click", async () => { const payload = await fetchJSON("/api/letta/test", { method: "POST", body: JSON.stringify({}) }); appState.memoryStatus.letta = payload.status; renderStatus(); toast("Letta Relay", payload.status.connected ? "Local Letta link is reachable." : "Using local MemFS staging mode."); });
  elements.lettaSyncButton.addEventListener("click", async () => { await fetchJSON("/api/letta/sync", { method: "POST", body: JSON.stringify({ note_ids: appState.mission.selected_context_note_ids || [] }) }); await refreshMemory(); toast("Letta Relay", "Approved memory synced to local MemFS staging."); });
  elements.createMissionButton.addEventListener("click", async () => {
    const outputTargets = elements.missionTargetsInput.value.split(",").map((item) => item.trim()).filter(Boolean);
    const payload = await fetchJSON("/api/research/missions", { method: "POST", body: JSON.stringify({ title: elements.missionTitleInput.value, objective: elements.missionObjectiveInput.value, scope: elements.missionScopeInput.value, network_policy: elements.missionNetworkSelect.value, schedule: elements.missionScheduleInput.value, output_targets: outputTargets }) });
    appState.selectedMissionId = payload.mission.id;
    elements.missionTitleInput.value = ""; elements.missionObjectiveInput.value = ""; elements.missionScopeInput.value = "";
    await refreshResearch(); toast("Research Ops", "Mission created.");
  });
  elements.runMissionButton.addEventListener("click", async () => { if (!appState.selectedMissionId) return; const payload = await fetchJSON("/api/research/run", { method: "POST", body: JSON.stringify({ mission_id: appState.selectedMissionId }) }); await refreshResearch(); elements.researchArtifactOutput.textContent = payload.artifact_text; setSpeech(`Research mission ${payload.mission.title} completed.`, "Research", true); toast("Research Ops", "Mission run finished."); });
  elements.promoteMissionButton.addEventListener("click", async () => { if (!appState.selectedMissionId) return; await fetchJSON("/api/research/promote", { method: "POST", body: JSON.stringify({ mission_id: appState.selectedMissionId, sync_to_letta: appState.mission.memory_mode === "vault_plus_letta" }) }); await refreshMemory(); toast("Research Ops", "Mission promoted to vault."); });
  elements.scheduleMissionButton.addEventListener("click", async () => { if (!appState.selectedMissionId) return; await fetchJSON("/api/research/schedule", { method: "POST", body: JSON.stringify({ mission_id: appState.selectedMissionId, schedule: elements.missionScheduleInput.value }) }); await refreshResearch(); toast("Research Ops", "Mission schedule saved."); });
  elements.paperclipBaseUrlInput.addEventListener("change", () => queuePatch({ paperclip_base_url: elements.paperclipBaseUrlInput.value }));
  elements.paperclipCompanyIdInput.addEventListener("change", () => queuePatch({ paperclip_company_id: elements.paperclipCompanyIdInput.value }));
  elements.companyTestButton.addEventListener("click", async () => { appState.companyStatus = await fetchJSON("/api/company/test", { method: "POST", body: JSON.stringify({}) }); renderStatus(); toast("Company Ops", appState.companyStatus.connected ? "Paperclip service is reachable." : "Using offline adapter mode."); });
  elements.companySyncButton.addEventListener("click", async () => { await refreshCompany(); toast("Company Ops", "Company status refreshed."); });
}

function resizeCanvasToDisplaySize(canvas) {
  const width = Math.floor(canvas.clientWidth * window.devicePixelRatio);
  const height = Math.floor(canvas.clientHeight * window.devicePixelRatio);
  if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; return true; }
  return false;
}
function drawAvatar(now) {
  const canvas = elements.avatarCanvas;
  if (!canvas) return;
  resizeCanvasToDisplaySize(canvas);
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  const t = now * 0.001;
  const bob = Math.sin(t * 1.8) * 10;
  const lookX = appState.pointer.x * 16;
  const lookY = appState.pointer.y * 10;
  const speaking = now < appState.avatar.speakingUntil;
  const mouth = speaking ? 6 + Math.sin(t * 18) * 4 : 2 + appState.avatar.typing * 4;
  const blinkSeed = (Math.sin(t * 0.8) + 1) * 0.5;
  const blink = blinkSeed > 0.96 ? 0.15 : 1;
  ctx.clearRect(0, 0, width, height);
  const bg = ctx.createLinearGradient(0, 0, 0, height);
  bg.addColorStop(0, "rgba(193,228,255,0.68)"); bg.addColorStop(1, "rgba(255,197,229,0.68)");
  ctx.fillStyle = bg; ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "rgba(255,255,255,0.34)";
  for (let i = 0; i < 24; i += 1) { const x = (i * 83 + t * 26) % (width + 80); const y = ((i * 47) % (height + 60)) - 40 + Math.sin(t + i) * 4; ctx.fillRect(x, y, 2, 2); }
  const cx = width * 0.5; const cy = height * 0.52 + bob;
  ctx.fillStyle = "rgba(110, 71, 152, 0.18)"; ctx.beginPath(); ctx.ellipse(cx, height * 0.86, width * 0.18, height * 0.05, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#f7aacb";
  ctx.beginPath(); ctx.moveTo(cx - 118, cy - 122); ctx.lineTo(cx - 72, cy - 210); ctx.lineTo(cx - 28, cy - 126); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(cx + 118, cy - 122); ctx.lineTo(cx + 72, cy - 210); ctx.lineTo(cx + 28, cy - 126); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#ffb8d4"; ctx.beginPath(); ctx.ellipse(cx, cy - 20, 126, 138, 0, Math.PI, 0); ctx.fill();
  ctx.fillStyle = "#f9d7e6"; ctx.beginPath(); ctx.ellipse(cx, cy + 18, 102, 112, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#f29fc7"; ctx.beginPath(); ctx.moveTo(cx - 118, cy - 10); ctx.quadraticCurveTo(cx - 146, cy + 70, cx - 82, cy + 130); ctx.quadraticCurveTo(cx - 28, cy + 112, cx - 22, cy + 32); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(cx + 118, cy - 10); ctx.quadraticCurveTo(cx + 146, cy + 70, cx + 82, cy + 130); ctx.quadraticCurveTo(cx + 28, cy + 112, cx + 22, cy + 32); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#ffd4e9"; ctx.beginPath(); ctx.ellipse(cx, cy + 92, 56, 40, 0, 0, Math.PI * 2); ctx.fill();
  const eyeY = cy + 4 + lookY; const eyeLX = cx - 42 + lookX; const eyeRX = cx + 42 + lookX;
  ctx.fillStyle = "#6b5fd6"; ctx.beginPath(); ctx.ellipse(eyeLX, eyeY, 18, 22 * blink, 0, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.ellipse(eyeRX, eyeY, 18, 22 * blink, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.88)"; if (blink > 0.2) { ctx.beginPath(); ctx.ellipse(eyeLX - 5, eyeY - 7, 5, 6, 0, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.ellipse(eyeRX - 5, eyeY - 7, 5, 6, 0, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = "#f59bb7"; ctx.beginPath(); ctx.ellipse(cx - 70, cy + 36, 18, 9, 0, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.ellipse(cx + 70, cy + 36, 18, 9, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "#71508d"; ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(cx - 12, cy + 28); ctx.lineTo(cx, cy + 32); ctx.lineTo(cx + 12, cy + 28); ctx.stroke();
  ctx.fillStyle = "#ff93b8"; ctx.beginPath(); ctx.ellipse(cx, cy + 54, 14, mouth, 0, 0, Math.PI * 2); ctx.fill();
  requestAnimationFrame(drawAvatar);
}

function drawHermesAvatar(time) {
  var canvas = document.getElementById("hermes-avatar");
  if (!canvas) return;
  var ctx = canvas.getContext("2d");
  var W = canvas.width, H = canvas.height;
  var cx = W / 2, cy = H / 2;
  var presence = appState.avatar?.presence || "boot";
  var t = time * 0.001;

  ctx.clearRect(0, 0, W, H);

  var colors = getCurrentPaletteColors();
  var primary = "#" + colors.primary.toString(16).padStart(6, "0");
  var secondary = "#" + colors.secondary.toString(16).padStart(6, "0");

  // Base glow ring
  var ringAlpha = (presence === "boot" || presence === "offline") ? 0.18 : 0.55;
  var ringRadius = 160 + Math.sin(t * 1.4) * (presence === "boot" ? 4 : 8);
  ctx.beginPath();
  ctx.arc(cx, cy, ringRadius, 0, Math.PI * 2);
  ctx.strokeStyle = primary + (ringAlpha > 0.5 ? "88" : "2e");
  ctx.lineWidth = 3;
  ctx.stroke();

  if (presence === "online") {
    // Spinning dashed ring + orbiting dots
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(t * 0.8);
    ctx.setLineDash([12, 6]);
    ctx.beginPath();
    ctx.arc(0, 0, 172, 0, Math.PI * 2);
    ctx.strokeStyle = secondary + "88";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
    ctx.setLineDash([]);
    for (var i = 0; i < 3; i++) {
      var angle = t * 1.2 + (i * Math.PI * 2) / 3;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(angle) * 178, cy + Math.sin(angle) * 178, 4, 0, Math.PI * 2);
      ctx.fillStyle = secondary;
      ctx.fill();
    }
  } else if (presence === "waking") {
    for (var i = 0; i < 20; i++) {
      var angle = (i / 20) * Math.PI * 2 + t * 2;
      var dist = Math.max(20, 180 - (t % 3) * 60);
      ctx.beginPath();
      ctx.arc(cx + Math.cos(angle) * dist, cy + Math.sin(angle) * dist, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = primary + "cc";
      ctx.fill();
    }
  } else if (presence === "thinking") {
    ctx.globalAlpha = 0.6;
    for (var i = 0; i < 4; i++) {
      var angle = t * 0.6 + (i * Math.PI * 2) / 4;
      ctx.font = "bold 16px sans-serif";
      ctx.fillStyle = secondary;
      ctx.fillText("?", cx + Math.cos(angle) * 175 - 5, cy + Math.sin(angle) * 175 + 5);
    }
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, 145 + Math.sin(t * 0.8) * 10, 0, Math.PI * 2);
    ctx.strokeStyle = secondary + "55";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  } else if (presence === "speaking") {
    for (var ring = 0; ring < 3; ring++) {
      var baseR = 155 + ring * 18;
      ctx.beginPath();
      for (var a = 0; a <= Math.PI * 2; a += 0.05) {
        var wave = Math.sin(a * 8 + t * 6 + ring * 1.2) * (10 * (1 - ring * 0.25));
        var x = cx + Math.cos(a) * (baseR + wave);
        var y = cy + Math.sin(a) * (baseR + wave);
        if (a === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.strokeStyle = primary + ["cc", "88", "44"][ring];
      ctx.lineWidth = 2 - ring * 0.4;
      ctx.stroke();
    }
  }

  // Center core glow
  var coreOp = presence === "speaking" ? 0.85 : presence === "online" ? 0.7 : 0.35;
  var coreR = 80 + Math.sin(t * 2) * (presence === "boot" ? 3 : 6);
  var coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
  coreGrad.addColorStop(0, primary + Math.round(coreOp * 255).toString(16).padStart(2, "0"));
  coreGrad.addColorStop(0.6, secondary + Math.round(coreOp * 0.4 * 255).toString(16).padStart(2, "0"));
  coreGrad.addColorStop(1, primary + "00");
  ctx.beginPath();
  ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
  ctx.fillStyle = coreGrad;
  ctx.fill();
}

function initScene() {
  const canvas = document.getElementById("mission-scene");
  if (!canvas) return;

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 200);
  camera.position.z = 28;

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
    colors[i * 3] = 1; colors[i * 3 + 1] = 0.43; colors[i * 3 + 2] = 0.71;
  }

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

  const warpState = { active: false, progress: 0 };

  appState.scene = { renderer, scene, camera, particles, clusters, particleMat, clusterMat, uniformsParticles, positions, speeds, PARTICLE_COUNT, warpState };
  updateNebulaColors();

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  requestAnimationFrame(animate);
}

function updateNebulaColors() {
  const s = appState.scene;
  if (!s || !s.particles) return;
  const { primary, secondary, accent } = getCurrentPaletteColors();
  const pc = new THREE.Color(primary);
  const sc = new THREE.Color(secondary);
  const ac = new THREE.Color(accent);
  const colAttr = s.particles.geometry.attributes.color;
  for (let i = 0; i < s.PARTICLE_COUNT; i++) {
    const mix = Math.random();
    const c = mix < 0.5 ? pc.clone().lerp(sc, mix * 2) : sc.clone().lerp(ac, (mix - 0.5) * 2);
    colAttr.setXYZ(i, c.r, c.g, c.b);
  }
  colAttr.needsUpdate = true;
  const cc = s.clusters.geometry.attributes.color;
  for (let i = 0; i < 800; i++) {
    cc.setXYZ(i, pc.r * 0.6, pc.g * 0.6, pc.b * 0.9);
  }
  cc.needsUpdate = true;
}

function animate(time) {
  const s = appState.scene;
  if (!s || !s.particles) return;
  const t = time * 0.0002;

  s.uniformsParticles.uTime.value = t;
  s.clusterMat.uniforms.uTime.value = t * 0.6;

  const pos = s.particles.geometry.attributes.position;
  for (let i = 0; i < s.PARTICLE_COUNT; i++) {
    pos.setY(i, pos.getY(i) + Math.sin(t * s.speeds[i] + i) * 0.0008);
    pos.setX(i, pos.getX(i) + Math.cos(t * s.speeds[i] * 0.7 + i * 0.3) * 0.0004);
  }
  pos.needsUpdate = true;

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

  s.particles.rotation.y = t * 0.05 + (appState.pointer?.x || 0) * 0.08;
  s.particles.rotation.x = t * 0.02 + (appState.pointer?.y || 0) * 0.04;
  s.clusters.rotation.y = t * 0.03;

  drawHermesAvatar(time);
  s.renderer.render(s.scene, s.camera);
  requestAnimationFrame(animate);
}

async function init() {
  bindEvents();
  initScene();
  initAce();
  initVaultEditor();
  initMicroAnimations();

  var disarmBtn = document.getElementById("disarm-all-btn");
  if (disarmBtn) {
    disarmBtn.addEventListener("click", function() {
      sessionStorage.removeItem("armed_skills");
      sessionStorage.removeItem("armed_workflows");
      fetchJSON("/api/state", {
        method: "POST",
        body: JSON.stringify({ armed_skills: [], armed_workflows: [], armed_scientific_skills: [] }),
      }).then(function(payload) {
        applyStatus(payload);
      }).catch(function() {});
      if (appState.mission) {
        appState.mission.armed_skills = [];
        appState.mission.armed_workflows = [];
      }
      renderSkills();
    });
  }

  requestAnimationFrame(drawAvatar);
  try {
    await loadApp();
    setSpeech("Mission shell online. Choose a lane and talk to Hermes.", "Online");
  } catch (error) {
    toast("Boot Error", error.message);
    setSpeech(`Boot error: ${error.message}`, "Error");
  }
}

init();



