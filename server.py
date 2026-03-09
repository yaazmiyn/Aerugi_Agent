
from __future__ import annotations

import json
import os
import re
import sys
import threading
import traceback
from dataclasses import dataclass
from datetime import datetime
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent
STATIC_DIR = ROOT / "static"
DATA_DIR = ROOT / "data"
STATE_PATH = DATA_DIR / "mission_state.json"
LETTA_SYNC_PATH = DATA_DIR / "letta_sync_registry.json"
RESEARCH_DIR = DATA_DIR / "research-missions"
EXTERNAL_DIR = ROOT / "external"
GSD_ROOT = EXTERNAL_DIR / "get-shit-done"
OPENCLAW_ROOT = EXTERNAL_DIR / "awesome-openclaw-skills"
AUTORESEARCH_ROOT = EXTERNAL_DIR / "autoresearch"
LETTA_MEMFS_ROOT = ROOT / ".letta" / "memory"
HOST = "127.0.0.1"
PORT = int(os.getenv("MISSION_CONTROL_PORT", "8765"))
OLLAMA_BASE_URL = os.getenv("MISSION_CONTROL_OLLAMA_URL", "http://127.0.0.1:11434/v1")
OLLAMA_TAGS_URL = os.getenv("MISSION_CONTROL_OLLAMA_TAGS_URL", "http://127.0.0.1:11434/api/tags")
DEFAULT_MODEL = os.getenv("MISSION_CONTROL_MODEL", "qwen35-opus-4b-fast")
DEEP_MODEL = os.getenv("MISSION_CONTROL_DEEP_MODEL", "qwen35-opus-4b-deep")
DEFAULT_LETTA_BASE_URL = os.getenv("MISSION_CONTROL_LETTA_URL", "http://127.0.0.1:8283")
DEFAULT_PAPERCLIP_BASE_URL = os.getenv("MISSION_CONTROL_PAPERCLIP_URL", "http://127.0.0.1:3100")
LOCAL_HOSTS = {"127.0.0.1", "localhost", "::1"}
PAGE_IDS = {"command-bridge", "memory-bay", "research-ops", "company-ops"}
LOCAL_NETWORK_POLICIES = {"local-only", "approval-required", "web-enabled"}
MEMORY_MODES = {"local_only", "vault_only", "vault_plus_letta"}
CAPTURE_MODES = {"selective_auto", "manual_only"}
HERMES_ROOT = Path.home() / "AppData" / "Local" / "hermes" / "hermes-agent"
if str(HERMES_ROOT) not in sys.path:
    sys.path.insert(0, str(HERMES_ROOT))

# ACE self-improvement
ACE_CONTEXT_DELTA_PATH = ROOT / ".letta" / "memory" / "hermes_context_delta.md"
ACE_OLLAMA_BASE = OLLAMA_BASE_URL.replace("/v1", "")

try:
    from run_agent import AIAgent  # type: ignore  # noqa: E402
    from toolsets import get_toolset_names  # type: ignore  # noqa: E402
    AGENT_IMPORT_ERROR: str | None = None
except Exception as exc:  # pragma: no cover
    AIAgent = None  # type: ignore[assignment]
    def get_toolset_names() -> list[str]:
        return []
    AGENT_IMPORT_ERROR = str(exc)

WORKSPACE_MODES = {
    "research": {"label": "Research", "instruction": "Prioritize synthesis, source planning, experimental framing, and concise briefs. Highlight uncertainty, assumptions, and the next best investigative step."},
    "business": {"label": "Business Ops", "instruction": "Prioritize operations, delivery, prioritization, customer communication drafts, and execution plans with clear ownership and tradeoffs."},
    "strategy": {"label": "Decision Room", "instruction": "Prioritize high-signal tradeoff analysis, scenario planning, and structured recommendations. Be direct, concise, and explain why the recommendation wins."},
}
GSD_WORKFLOW_FILES = {"map-codebase": "Discovery", "new-project": "Planning", "discuss-phase": "Planning", "plan-phase": "Planning", "execute-phase": "Execution", "verify-work": "Execution", "progress": "Operations", "debug": "Recovery", "quick": "Quick Ops"}
OPENCLAW_CATEGORY_FILES = {
    "research": ("Search & Research", "search-and-research.md"),
    "tasks": ("Productivity & Tasks", "productivity-and-tasks.md"),
    "marketing": ("Marketing & Sales", "marketing-and-sales.md"),
    "notes": ("Notes & PKM", "notes-and-pkm.md"),
    "comms": ("Communication", "communication.md"),
    "analytics": ("Data & Analytics", "data-and-analytics.md"),
    "calendar": ("Calendar & Scheduling", "calendar-and-scheduling.md"),
}
OPENCLAW_INCLUDE_TERMS = {
    "research": ["research", "paper", "academic", "literature", "search", "analysis", "insight", "report", "knowledge", "brief"],
    "tasks": ["task", "todo", "planner", "planning", "project", "workflow", "productivity", "organize", "execution", "focus"],
    "marketing": ["marketing", "sales", "lead", "campaign", "seo", "customer", "crm", "ads", "brand", "outreach", "copy"],
    "notes": ["notes", "pkm", "knowledge", "memory", "capture", "obsidian", "notion", "journal", "zettel"],
    "comms": ["email", "slack", "discord", "telegram", "message", "communication", "meeting", "reply", "inbox", "call"],
    "analytics": ["analytics", "report", "dashboard", "metrics", "ga4", "search console", "data", "bi", "insight", "tracking"],
    "calendar": ["calendar", "scheduling", "appointment", "booking", "availability", "meeting", "datetime", "timezone", "time zone"],
}
OPENCLAW_EXCLUDE_TERMS = ["crypto", "blockchain", "on-chain", "onchain", "token", "wallet", "solana", "ethereum", "base mainnet", "casino", "betting", "nft", "church", "sanctuary", "vtuber", "prediction market"]
VAULT_FOLDERS = ["00 Inbox", "01 Daily", "10 Projects", "20 Entities", "30 Knowledge", "40 Research", "50 Decisions", "60 Meetings", "70 Memory", "90 Templates", "99 System"]
NOTE_TYPE_FOLDERS = {"project": "10 Projects", "entity": "20 Entities", "knowledge": "30 Knowledge", "research": "40 Research", "decision": "50 Decisions", "meeting": "60 Meetings", "memory": "70 Memory", "protocol": "30 Knowledge"}
CAPTURE_KEYWORDS = {
    "decision": ["decision", "tradeoff", "choose", "recommend", "option"],
    "meeting": ["meeting", "call", "follow-up", "agenda", "recap"],
    "project": ["project", "launch", "roadmap", "milestone", "deliverable"],
    "research": ["research", "analyze", "compare", "study", "market", "brief"],
    "memory": ["remember", "preference", "prefer", "always", "never"],
}

@dataclass
class RuntimeFlags:
    tools_supported: bool = False
    internet_available: bool = False
    browser_available: bool = False
    terminal_available: bool = False


def utc_now() -> str:
    return datetime.utcnow().replace(microsecond=0).isoformat() + "Z"


def slugify(value: str) -> str:
    normalized = re.sub(r"[^a-zA-Z0-9]+", "-", value.strip().lower())
    return normalized.strip("-") or "item"


def truncate(value: str, limit: int = 220) -> str:
    collapsed = " ".join(value.split())
    return collapsed if len(collapsed) <= limit else collapsed[: max(0, limit - 3)].rstrip() + "..."


def first_sentence(value: str, fallback: str) -> str:
    collapsed = " ".join(value.split())
    if not collapsed:
        return fallback
    return truncate(re.split(r"(?<=[.!?])\s+", collapsed, maxsplit=1)[0], 120)


def parse_simple_value(value: str) -> Any:
    stripped = value.strip()
    if stripped.startswith("[") and stripped.endswith("]"):
        inner = stripped[1:-1].strip()
        return [] if not inner else [item.strip().strip("'\"") for item in inner.split(",") if item.strip()]
    if stripped.lower() in {"true", "false"}:
        return stripped.lower() == "true"
    return stripped.strip("'\"")


def split_frontmatter(text: str) -> tuple[dict[str, Any], str]:
    if not text.startswith("---"):
        return {}, text
    lines = text.splitlines()
    meta_lines: list[str] = []
    for index in range(1, len(lines)):
        if lines[index].strip() == "---":
            return parse_frontmatter_block(meta_lines), "\n".join(lines[index + 1 :]).strip()
        meta_lines.append(lines[index])
    return {}, text


def parse_frontmatter_block(lines: list[str]) -> dict[str, Any]:
    fields: dict[str, Any] = {}
    for line in lines:
        if ":" in line:
            key, value = line.split(":", 1)
            fields[key.strip()] = parse_simple_value(value)
    return fields


def extract_summary(body: str) -> str:
    match = re.search(r"## Summary\s+(.*?)(?:\n## |\Z)", body, re.S)
    if match:
        return truncate(match.group(1).strip(), 280)
    paragraphs = [chunk.strip() for chunk in re.split(r"\n\s*\n", body) if chunk.strip()]
    return truncate(re.sub(r"^#+\s+", "", paragraphs[0]), 280) if paragraphs else ""


def ensure_loopback_url(url: str, fallback: str) -> str:
    candidate = (url or fallback).strip() or fallback
    parsed = urlparse(candidate)
    if parsed.scheme not in {"http", "https"}:
        raise ValueError("Only http:// and https:// loopback URLs are allowed.")
    if (parsed.hostname or "").lower() not in LOCAL_HOSTS:
        raise ValueError("Only loopback services are allowed. Use localhost or 127.0.0.1.")
    return candidate.rstrip("/")


def request_local_json(url: str, payload: dict[str, Any] | None = None, timeout: float = 1.5) -> dict[str, Any]:
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    headers = {"Accept": "application/json", **({"Content-Type": "application/json"} if payload is not None else {})}
    request = Request(url, data=data, headers=headers, method="POST" if payload is not None else "GET")
    with urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8") or "{}")


def default_vault_path() -> Path:
    for candidate in [Path.home() / "OneDrive" / "Documents" / "Hermes Vault", Path.home() / "Documents" / "Hermes Vault"]:
        if candidate.parent.exists():
            return candidate
    return ROOT / "Hermes Vault"


def make_card(card_id: str, title: str, status: str, detail: str) -> dict[str, str]:
    return {"id": card_id, "title": title, "status": status, "detail": detail}


def parse_frontmatter_from_file(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    return split_frontmatter(path.read_text(encoding="utf-8", errors="ignore"))[0]


def load_gsd_catalog() -> list[dict[str, str]]:
    items: list[dict[str, str]] = []
    for slug, lane in GSD_WORKFLOW_FILES.items():
        path = GSD_ROOT / "commands" / "gsd" / f"{slug}.md"
        meta = parse_frontmatter_from_file(path)
        if not meta:
            continue
        workflow_id = str(meta.get("name", f"gsd:{slug}"))
        items.append({"id": workflow_id, "name": workflow_id, "title": workflow_id.replace("gsd:", "").replace("-", " ").title(), "lane": lane, "description": str(meta.get("description", "")), "source": "get-shit-done", "path": str(path)})
    return items


def load_openclaw_catalog() -> dict[str, list[dict[str, str]]]:
    catalog: dict[str, list[dict[str, str]]] = {}
    pattern = re.compile(r"^- \[(?P<title>[^\]]+)\]\((?P<url>[^)]+)\) - (?P<description>.+)$")
    for category_id, (label, filename) in OPENCLAW_CATEGORY_FILES.items():
        path = OPENCLAW_ROOT / "categories" / filename
        entries: list[dict[str, str]] = []
        include_terms = OPENCLAW_INCLUDE_TERMS.get(category_id, [])
        if path.exists():
            for line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
                match = pattern.match(line.strip())
                if not match:
                    continue
                title = match.group("title").strip()
                description = match.group("description").strip()
                blob = f"{title} {description}".lower()
                if len(title) < 3 or any(term in blob for term in OPENCLAW_EXCLUDE_TERMS):
                    continue
                if include_terms and not any(term in blob for term in include_terms):
                    continue
                entries.append({"id": f"{category_id}:{slugify(title)}", "title": title, "description": description, "url": match.group("url").strip(), "category": category_id, "category_label": label, "source": "awesome-openclaw-skills"})
        catalog[category_id] = entries
    return catalog


def load_catalog() -> dict[str, Any]:
    return {"gsd": load_gsd_catalog(), "openclaw": load_openclaw_catalog(), "meta": {"gsd_source": str(GSD_ROOT), "openclaw_source": str(OPENCLAW_ROOT), "openclaw_category_labels": {key: label for key, (label, _) in OPENCLAW_CATEGORY_FILES.items()}}}


def note_template_content(note_type: str) -> str:
    title = note_type.replace("-", " ").title()
    return "---\nid: sample-id\ntype: %s\ntitle: %s\nstatus: active\ncreated: 2026-03-08T00:00:00Z\nupdated: 2026-03-08T00:00:00Z\ntags: [%s, hermes]\naliases: []\nrelated: []\nsource: manual\nconfidence: medium\n---\n\n## Summary\n\nShort description of the %s.\n\n## Key Facts\n\n- \n\n## Context\n\n- \n\n## Related Notes\n\n- \n\n## Next Actions\n\n- \n" % (note_type, title, note_type, note_type)


def default_research_missions() -> list[dict[str, Any]]:
    now = utc_now()
    return [{"id": "mission-local-knowledge-stack", "title": "Local Knowledge Stack", "objective": "Design a local-first research flow that moves approved findings into the Hermes vault.", "scope": "Focus on vault structure, promotion rules, and operator review steps.", "network_policy": "local-only", "status": "ready", "schedule": "manual", "output_targets": ["vault-note", "operating-brief"], "artifacts": [], "created_at": now, "updated_at": now, "last_run_at": None, "summary": "Seed mission for designing a structured local research loop."}]


def default_company_workspace() -> dict[str, Any]:
    tickets = [
        {"id": "T-101", "title": "Prospect intake pipeline", "priority": "High", "assignee": "Growth Operator", "approval_status": "awaiting", "internet_required": True, "spend_risk": False, "status": "queued", "log": ["Drafted a local workflow for capture, qualification, and follow-up.", "Waiting on operator approval before any outbound actions."]},
        {"id": "T-102", "title": "Weekly research digest", "priority": "Medium", "assignee": "Research Operator", "approval_status": "approved", "internet_required": False, "spend_risk": False, "status": "active", "log": ["Digest template prepared.", "Awaiting the next promoted research mission artifact."]},
        {"id": "T-103", "title": "Customer experience map", "priority": "Medium", "assignee": "Operations Steward", "approval_status": "awaiting", "internet_required": False, "spend_risk": True, "status": "review", "log": ["Drafted service blueprint with approval gate on budget-bearing actions."]},
    ]
    return {"overview": {"company_name": "Aerugi", "status": "offline-adapter", "run_health": "contained", "mission": "Run a local-first research and operations company with explicit approval gates.", "active_objectives": ["Keep Hermes productive without uncontrolled autonomy.", "Promote durable knowledge into the vault and Letta memory.", "Gate any internet or spend-bearing action behind approval."]}, "agents": [{"id": "agent-growth", "name": "Growth Operator", "role": "Growth", "status": "awaiting approval", "ownership": "Lead intake and outbound plans", "assigned_work": "Design a non-spam intake and nurture loop.", "blocked_state": "Outbound channels remain locked."}, {"id": "agent-research", "name": "Research Operator", "role": "Research", "status": "ready", "ownership": "Research missions and synthesis", "assigned_work": "Turn local mission artifacts into concise briefings.", "blocked_state": "Needs promoted artifacts from Research Ops."}, {"id": "agent-ops", "name": "Operations Steward", "role": "Operations", "status": "reviewing", "ownership": "Delivery systems and workflows", "assigned_work": "Map weekly rhythms and operating cadences.", "blocked_state": "Budget-impacting changes require approval."}], "tickets": tickets}


def default_approval_queue(workspace: dict[str, Any]) -> list[dict[str, Any]]:
    queue = []
    for ticket in workspace.get("tickets", []):
        if ticket.get("approval_status") == "awaiting":
            queue.append({"id": f"approval-{ticket['id']}", "ticket_id": ticket["id"], "title": ticket["title"], "reason": "Internet access required" if ticket.get("internet_required") else "Operator approval required", "risk": "spend" if ticket.get("spend_risk") else "control", "status": "pending"})
    return queue


def default_state() -> dict[str, Any]:
    company = default_company_workspace()
    return {"active_page": "command-bridge", "current_model": DEFAULT_MODEL, "workspace_mode": "research", "armed_workflows": ["gsd:quick"], "armed_skills": [], "guardrails": {"internet_access_requested": False, "browser_tools_requested": False, "terminal_tools_requested": False, "external_actions_requested": False, "file_tools_requested": False}, "notes": "Session scratchpad:\n- Use Hermes as a local research and business copilot.\n- Promote durable knowledge into the Obsidian vault.\n- Keep internet access disabled unless you explicitly approve it.", "boards": {"research": [make_card("scan", "Signal Scan", "Queued", "Collect questions, assumptions, and leads before asking Hermes for synthesis."), make_card("brief", "Brief Draft", "Ready", "Turn active findings into a concise memo or operating note.")], "business": [make_card("ops", "Ops Watch", "Active", "Track the next few actions that move revenue, customer work, or delivery."), make_card("clients", "Client Queue", "Queued", "Use Hermes for reply drafts, meeting prep, and follow-up copy.")], "strategy": [make_card("decide", "Decision Stack", "Standby", "When a choice matters, ask for options, downside risk, and a recommendation.")]}, "chat_log": [], "vault_path": str(default_vault_path()), "letta_base_url": DEFAULT_LETTA_BASE_URL, "letta_agent_id": "hermes-memory", "memory_mode": "vault_plus_letta", "capture_mode": "selective_auto", "capture_queue": [], "selected_context_note_ids": [], "last_vault_sync_at": None, "last_letta_sync_at": None, "research_missions": default_research_missions(), "paperclip_base_url": DEFAULT_PAPERCLIP_BASE_URL, "paperclip_company_id": "aerugi-hq", "paperclip_approval_queue": default_approval_queue(company), "company_workspace": company, "updated_at": utc_now()}


class HermesDataProcessor:
    """ACE DataProcessor for Hermes chat transcripts."""

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
        p = (prediction or "").strip()
        return bool(p) and not p.lower().startswith("error") and len(p) > 20

    def evaluate_accuracy(self, tasks: list[dict], predictions: list[str]) -> float:
        if not tasks:
            return 0.0
        correct = sum(1 for t, p in zip(tasks, predictions) if self.answer_is_correct(t, p))
        return correct / len(tasks)


class MissionControlService:
    def __init__(self) -> None:
        self.lock = threading.RLock()
        self.flags = RuntimeFlags()
        self.disabled_toolsets = sorted(get_toolset_names())
        self.catalog = load_catalog()
        self.state = self._load_state()
        self.letta_registry = self._load_letta_registry()
        self.agent = self._build_agent()

    def _load_letta_registry(self) -> dict[str, Any]:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        if LETTA_SYNC_PATH.exists():
            try:
                return json.loads(LETTA_SYNC_PATH.read_text(encoding="utf-8"))
            except Exception:
                pass
        registry = {"agent_id": self.state.get("letta_agent_id"), "notes": {}, "updated_at": utc_now()}
        LETTA_SYNC_PATH.write_text(json.dumps(registry, indent=2), encoding="utf-8")
        return registry

    def _save_letta_registry(self) -> None:
        self.letta_registry["agent_id"] = self.state.get("letta_agent_id")
        self.letta_registry["updated_at"] = utc_now()
        LETTA_SYNC_PATH.write_text(json.dumps(self.letta_registry, indent=2), encoding="utf-8")

    def _load_state(self) -> dict[str, Any]:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        base = default_state()
        if not STATE_PATH.exists():
            self._save_state(base)
            return base
        try:
            data = json.loads(STATE_PATH.read_text(encoding="utf-8"))
        except Exception:
            self._save_state(base)
            return base
        for key in ["active_page", "current_model", "workspace_mode", "notes", "vault_path", "letta_base_url", "letta_agent_id", "memory_mode", "capture_mode", "last_vault_sync_at", "last_letta_sync_at", "paperclip_base_url", "paperclip_company_id", "updated_at"]:
            if key in data:
                base[key] = data[key]
        if isinstance(data.get("guardrails"), dict):
            base["guardrails"].update(data["guardrails"])
        if isinstance(data.get("boards"), dict):
            for board_key, board_value in data["boards"].items():
                if board_key in base["boards"] and isinstance(board_value, list):
                    base["boards"][board_key] = board_value
        if isinstance(data.get("chat_log"), list):
            base["chat_log"] = data["chat_log"][-40:]
        if isinstance(data.get("armed_workflows"), list):
            base["armed_workflows"] = [item for item in data["armed_workflows"] if isinstance(item, str)]
        if isinstance(data.get("armed_skills"), list):
            base["armed_skills"] = [item for item in data["armed_skills"] if isinstance(item, str)]
        if isinstance(data.get("capture_queue"), list):
            base["capture_queue"] = data["capture_queue"][-16:]
        if isinstance(data.get("selected_context_note_ids"), list):
            base["selected_context_note_ids"] = [item for item in data["selected_context_note_ids"] if isinstance(item, str)]
        if isinstance(data.get("research_missions"), list) and data["research_missions"]:
            base["research_missions"] = data["research_missions"]
        if isinstance(data.get("paperclip_approval_queue"), list):
            base["paperclip_approval_queue"] = data["paperclip_approval_queue"]
        if isinstance(data.get("company_workspace"), dict):
            base["company_workspace"] = data["company_workspace"]
        if base.get("active_page") not in PAGE_IDS:
            base["active_page"] = "command-bridge"
        if base.get("workspace_mode") not in WORKSPACE_MODES:
            base["workspace_mode"] = "research"
        if base.get("memory_mode") not in MEMORY_MODES:
            base["memory_mode"] = "vault_plus_letta"
        if base.get("capture_mode") not in CAPTURE_MODES:
            base["capture_mode"] = "selective_auto"
        self._save_state(base)
        return base

    def _save_state(self, state: dict[str, Any] | None = None) -> None:
        payload = state or self.state
        payload["updated_at"] = utc_now()
        STATE_PATH.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    def _workspace_instruction(self) -> str:
        mode = self.state.get("workspace_mode", "research")
        return WORKSPACE_MODES.get(mode, WORKSPACE_MODES["research"])["instruction"]

    def _active_workflows(self) -> list[dict[str, str]]:
        armed = set(self.state.get("armed_workflows", []))
        return [item for item in self.catalog["gsd"] if item["id"] in armed]

    def _active_skills(self) -> list[dict[str, str]]:
        armed = set(self.state.get("armed_skills", []))
        active: list[dict[str, str]] = []
        for entries in self.catalog["openclaw"].values():
            active.extend(item for item in entries if item["id"] in armed)
        return active

    def _selected_context_summary(self) -> str:
        selected = self.state.get("selected_context_note_ids", [])
        if not selected:
            return "No Obsidian vault notes are currently pinned into context."
        try:
            notes = self._vault_index(write_files=False).get("notes", [])
        except Exception:
            return "Vault context selection is configured but the vault is not available."
        lookup = {note["id"]: note for note in notes}
        parts = []
        for note_id in selected[:8]:
            note = lookup.get(note_id)
            if note:
                parts.append(f"{note['title']} [{note['type']}]: {truncate(note['summary'], 180)}")
        return "Pinned vault context: " + " | ".join(parts) if parts else "Selected vault note ids no longer resolve to current notes."

    def _build_system_prompt(self) -> str:
        requested = self.state.get("guardrails", {})
        workflows = "; ".join(f"{item['name']}: {item['description']}" for item in self._active_workflows()) or "none armed"
        skills = "; ".join(f"{item['title']} ({item['category_label']})" for item in self._active_skills()[:10]) or "none armed"
        request_summary = ", ".join([
            f"internet={'requested' if requested.get('internet_access_requested') else 'locked'}",
            f"browser={'requested' if requested.get('browser_tools_requested') else 'locked'}",
            f"terminal={'requested' if requested.get('terminal_tools_requested') else 'locked'}",
            f"files={'requested' if requested.get('file_tools_requested') else 'locked'}",
            f"external_actions={'requested' if requested.get('external_actions_requested') else 'locked'}",
        ])
        base_prompt = (
            "You are Hermes Mission Control, a local-first operator for research, planning, and business execution. "
            f"{self._workspace_instruction()} "
            "Current runtime restrictions: no internet access, no browser automation, no terminal execution, no file mutation outside approved local flows, and no external actions. "
            "Do not claim to browse, search, open websites, or take actions outside this chat. Only use user-armed workflows and skill packs, never unarmed ones. "
            "Treat armed OpenClaw skills as playbooks, not executable capabilities. When useful, format answers as a brief, action list, memo, meeting draft, or operating plan. "
            f"Guardrail request panel state: {request_summary}. Armed GSD workflows: {workflows}. Armed OpenClaw skills: {skills}. {self._selected_context_summary()}"
        )
        # Inject ACE delta if available
        if ACE_CONTEXT_DELTA_PATH.exists():
            try:
                delta_text = ACE_CONTEXT_DELTA_PATH.read_text(encoding="utf-8").strip()
                if delta_text:
                    base_prompt += f"\n\nAdaptive context (ACE delta — accumulated strategies):\n{delta_text[-1200:]}"
            except Exception:
                pass
        return base_prompt

    def _prefill_messages(self) -> list[dict[str, str]]:
        valid = []
        for message in self.state.get("chat_log", [])[-24:]:
            if message.get("role") in {"user", "assistant"} and isinstance(message.get("content"), str) and message["content"].strip():
                valid.append({"role": message["role"], "content": message["content"]})
        return valid

    def _max_tokens_for_model(self, model_name: str) -> int:
        return 896 if "deep" in model_name.lower() else 448

    def _create_agent(self, model_name: str | None = None, system_prompt: str | None = None, prefill_messages: list[dict[str, str]] | None = None) -> Any:
        if AIAgent is None:
            return None
        model = model_name or str(self.state.get("current_model", DEFAULT_MODEL))
        return AIAgent(base_url=OLLAMA_BASE_URL, api_key="ollama", provider="custom", model=model, max_iterations=4, disabled_toolsets=self.disabled_toolsets, save_trajectories=False, verbose_logging=False, quiet_mode=True, ephemeral_system_prompt=system_prompt or self._build_system_prompt(), prefill_messages=prefill_messages if prefill_messages is not None else self._prefill_messages(), platform="cli", skip_context_files=True, skip_memory=True, max_tokens=self._max_tokens_for_model(model))

    def _build_agent(self) -> Any:
        return self._create_agent()

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

    def run_ace_loop(self, transcript: list[dict] | None = None) -> dict[str, Any]:
        """Run an ACE self-improvement cycle on the current (or provided) chat transcript."""
        with self.lock:
            log = transcript if transcript is not None else list(self.state.get("chat_log", []))

        if len(log) < 4:
            return {"ok": True, "skipped": True, "reason": "Transcript too short for ACE (need >= 4 turns)."}

        timestamp = utc_now()

        # Try ACE package first, fall back to direct Ollama call
        delta = None
        try:
            from ace import ACE
            import openai
            client = openai.OpenAI(base_url=OLLAMA_BASE_URL, api_key="ollama")
            processor = HermesDataProcessor(log)
            ace_instance = ACE(client=client, model=DEFAULT_MODEL)
            result = ace_instance.run(mode="offline", data_processor=processor)
            delta = result.get("context_delta") or result.get("curator_output") or str(result)
        except Exception:
            # Fallback: ask Ollama directly to extract strategies
            try:
                pairs = HermesDataProcessor(log).process_task_data()
                if not pairs:
                    return {"ok": True, "skipped": True, "reason": "No usable exchange pairs in transcript."}
                snippet = "\n".join(f"User: {p['input'][:300]}\nHermes: {p['output'][:300]}" for p in pairs[:8])
                prompt = (
                    "You are a context curator. Analyze this conversation between a user and Hermes. "
                    "Extract 3-5 concrete strategy notes or lessons: what worked, what failed, "
                    "how to approach similar tasks better next time. "
                    "Be specific and actionable. Use bullet points. Keep each point under 2 sentences.\n\n"
                    f"Conversation:\n{snippet}\n\nStrategies:"
                )
                payload = json.dumps({"model": DEFAULT_MODEL, "messages": [{"role": "user", "content": prompt}], "stream": False})
                req = Request(f"{OLLAMA_BASE_URL}/chat/completions", data=payload.encode(), headers={"Content-Type": "application/json"})
                with urlopen(req, timeout=60) as resp:
                    body = json.loads(resp.read())
                    delta = body["choices"][0]["message"]["content"].strip()
            except Exception as exc:
                return {"ok": False, "error": f"ACE fallback also failed: {exc}", "trace": traceback.format_exc(limit=4)}

        if not delta:
            return {"ok": True, "skipped": True, "reason": "ACE produced no delta."}

        # Write delta to .letta/memory folder
        ACE_CONTEXT_DELTA_PATH.parent.mkdir(parents=True, exist_ok=True)
        existing = ACE_CONTEXT_DELTA_PATH.read_text(encoding="utf-8") if ACE_CONTEXT_DELTA_PATH.exists() else ""
        entry = f"\n\n---\n## ACE Delta — {timestamp}\n\n{delta.strip()}\n"
        ACE_CONTEXT_DELTA_PATH.write_text(existing + entry, encoding="utf-8")

        with self.lock:
            self.state["last_ace_run_at"] = timestamp
            self.state["last_ace_delta_summary"] = delta[:200].strip()
            self._save_state()

        return {"ok": True, "delta_summary": delta[:200], "timestamp": timestamp}

    def _ollama_status(self) -> dict[str, Any]:
        try:
            with urlopen(OLLAMA_TAGS_URL, timeout=2) as response:
                payload = json.loads(response.read().decode("utf-8"))
            names = [model.get("name", "") for model in payload.get("models", []) if isinstance(model, dict)]
            return {"online": True, "models": names, "current_model_available": any(name.split(":", 1)[0] == self.state.get("current_model") for name in names)}
        except Exception as exc:
            return {"online": False, "models": [], "current_model_available": False, "error": str(exc)}

    def _vault_root(self) -> Path:
        return Path(str(self.state.get("vault_path") or default_vault_path()))

    def _bootstrap_vault(self) -> dict[str, Any]:
        vault_root = self._vault_root()
        for folder in VAULT_FOLDERS:
            (vault_root / folder).mkdir(parents=True, exist_ok=True)
        for note_type, filename in {"project": "project-template.md", "entity": "entity-template.md", "research": "research-template.md", "meeting": "meeting-template.md", "decision": "decision-template.md", "memory": "memory-template.md", "protocol": "protocol-template.md"}.items():
            template_path = vault_root / "90 Templates" / filename
            if not template_path.exists():
                template_path.write_text(note_template_content(note_type), encoding="utf-8")
        index = self._vault_index(write_files=True)
        self.state["last_vault_sync_at"] = utc_now()
        self._save_state()
        return {"ok": True, "vault_path": str(vault_root), "index": index}

    def _vault_index(self, write_files: bool = True) -> dict[str, Any]:
        root = self._vault_root()
        if not root.exists():
            return {"vault_path": str(root), "exists": False, "notes": [], "counts": {}}
        notes, counts = [], {}
        for path in sorted(root.rglob("*.md")):
            if any(part.startswith(".") for part in path.parts) or "90 Templates" in path.parts or "99 System" in path.parts:
                continue
            meta, body = split_frontmatter(path.read_text(encoding="utf-8", errors="ignore"))
            note_type = str(meta.get("type") or "note")
            note = {"id": str(meta.get("id") or slugify(path.stem)), "title": str(meta.get("title") or path.stem.replace("-", " ").title()), "type": note_type, "status": str(meta.get("status") or "active"), "tags": meta.get("tags") if isinstance(meta.get("tags"), list) else [], "aliases": meta.get("aliases") if isinstance(meta.get("aliases"), list) else [], "related": meta.get("related") if isinstance(meta.get("related"), list) else [], "source": str(meta.get("source") or "manual"), "confidence": str(meta.get("confidence") or "medium"), "summary": str(meta.get("summary") or "") or extract_summary(body), "path": str(path), "relative_path": str(path.relative_to(root)), "updated": str(meta.get("updated") or utc_now())}
            notes.append(note)
            counts[note_type] = counts.get(note_type, 0) + 1
        if write_files:
            system_root = root / "99 System"
            system_root.mkdir(parents=True, exist_ok=True)
            (system_root / "vault-index.json").write_text(json.dumps({"generated_at": utc_now(), "notes": notes}, indent=2), encoding="utf-8")
            lines = ["# Hermes Vault Map", "", f"Generated: {utc_now()}", ""]
            lines.extend(f"- [{note['type']}] {note['title']} :: {note['relative_path']} :: {truncate(note['summary'], 140)}" for note in notes)
            (system_root / "vault-map.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
        return {"vault_path": str(root), "exists": True, "notes": notes, "counts": counts}

    def get_vault_tree(self) -> dict[str, Any]:
        """Return the vault folder/file tree for the in-app editor sidebar."""
        root = self._vault_root()
        if not root.exists():
            return {"ok": True, "tree": [], "vault_path": str(root), "exists": False}
        tree = []
        for folder in sorted(root.iterdir()):
            if folder.is_dir() and not folder.name.startswith(".") and folder.name not in ("90 Templates", "99 System"):
                notes = []
                for md in sorted(folder.rglob("*.md")):
                    meta, _ = split_frontmatter(md.read_text(encoding="utf-8", errors="ignore"))
                    notes.append({
                        "title": str(meta.get("title") or md.stem.replace("-", " ").title()),
                        "type": str(meta.get("type") or "note"),
                        "relative_path": str(md.relative_to(root)).replace("\\", "/"),
                        "updated": str(meta.get("updated") or ""),
                    })
                tree.append({"folder": folder.name, "notes": notes})
        return {"ok": True, "tree": tree, "vault_path": str(root), "exists": True}

    def get_vault_note(self, relative_path: str) -> dict[str, Any]:
        """Return the raw content and frontmatter of a vault note by relative path."""
        root = self._vault_root()
        path = (root / relative_path).resolve()
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
        self._vault_index(write_files=True)
        return {"ok": True, "relative_path": relative_path, "saved_at": utc_now()}

    def _memory_status(self) -> dict[str, Any]:
        index = self._vault_index(write_files=False)
        return {"ok": True, "vault_path": index["vault_path"], "vault_exists": index["exists"], "note_count": len(index["notes"]), "counts": index["counts"], "capture_queue_count": len(self.state.get("capture_queue", [])), "selected_context_count": len(self.state.get("selected_context_note_ids", [])), "memory_mode": self.state.get("memory_mode"), "capture_mode": self.state.get("capture_mode"), "letta": self._letta_status(), "last_vault_sync_at": self.state.get("last_vault_sync_at"), "last_letta_sync_at": self.state.get("last_letta_sync_at")}

    def _append_chat(self, role: str, content: str) -> None:
        self.state.setdefault("chat_log", []).append({"role": role, "content": content, "timestamp": utc_now()})
        self.state["chat_log"] = self.state["chat_log"][-40:]

    def _candidate_from_chat(self, user_message: str, reply: str) -> dict[str, Any] | None:
        if self.state.get("capture_mode") != "selective_auto":
            return None
        combined, note_type = f"{user_message}\n{reply}".lower(), ""
        for candidate_type, keywords in CAPTURE_KEYWORDS.items():
            if any(keyword in combined for keyword in keywords):
                note_type = candidate_type
                break
        if not note_type and len(reply.strip()) > 320:
            note_type = "research"
        if not note_type:
            return None
        title = first_sentence(user_message, "Captured memory")
        if any(item.get("title") == title and item.get("type") == note_type for item in self.state.get("capture_queue", [])):
            return None
        summary = first_sentence(reply, truncate(reply, 160))
        return {"id": f"capture-{slugify(title)}-{datetime.utcnow().strftime('%H%M%S')}", "title": title, "type": note_type, "summary": summary, "body": "## Summary\n\n%s\n\n## Key Facts\n\n- Prompt: %s\n- Reply: %s\n\n## Context\n\nGenerated from a Hermes chat session for later operator review.\n\n## Related Notes\n\n- \n\n## Next Actions\n\n- Review and refine before relying on this note.\n" % (summary, truncate(user_message, 220), truncate(reply, 260)), "source": "chat", "sync_recommended": note_type in {"memory", "project", "decision"}, "created_at": utc_now(), "status": "pending"}

    def chat(self, message: str) -> dict[str, Any]:
        clean = message.strip()
        if not clean:
            raise ValueError("Message cannot be empty.")
        with self.lock:
            self._append_chat("user", clean)
            self._save_state()
            if self.agent is None:
                raise RuntimeError("Hermes runtime is not available. Check the local Hermes install before using chat.")
            try:
                reply = self.agent.chat(clean)
            except Exception as exc:
                self.state["chat_log"].pop()
                self._save_state()
                raise RuntimeError(str(exc)) from exc
            self._append_chat("assistant", reply)
            candidate = self._candidate_from_chat(clean, reply)
            if candidate is not None:
                self.state.setdefault("capture_queue", []).insert(0, candidate)
                self.state["capture_queue"] = self.state["capture_queue"][:16]
            self.agent = self._build_agent()
            self._save_state()
            return {"ok": True, "response": reply, "state": self.state, "capture_candidate": candidate}

    def _write_note(self, note_type: str, title: str, summary: str, body: str, source: str, related: list[str] | None = None) -> dict[str, Any]:
        note_type = note_type if note_type in NOTE_TYPE_FOLDERS else "knowledge"
        root = self._vault_root()
        if not root.exists():
            self._bootstrap_vault()
        timestamp = utc_now()
        note_id = f"{slugify(title)}-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}"
        folder = root / NOTE_TYPE_FOLDERS[note_type]
        folder.mkdir(parents=True, exist_ok=True)
        path = folder / f"{note_id}.md"
        markdown = "---\nid: %s\ntype: %s\ntitle: %s\nstatus: active\ncreated: %s\nupdated: %s\ntags: [%s, hermes]\naliases: []\nrelated: [%s]\nsource: %s\nconfidence: medium\n---\n\n## Summary\n\n%s\n\n%s\n" % (note_id, note_type, title, timestamp, timestamp, note_type, ", ".join(related or []), source, summary, body.strip())
        path.write_text(markdown, encoding="utf-8")
        index = self._vault_index(write_files=True)
        self.state["last_vault_sync_at"] = utc_now()
        self._save_state()
        return {"id": note_id, "path": str(path), "index": index}

    def _letta_status(self) -> dict[str, Any]:
        memfs_exists = LETTA_MEMFS_ROOT.exists()
        note_count = len(list(LETTA_MEMFS_ROOT.rglob("*.md"))) if memfs_exists else 0
        base_url = str(self.state.get("letta_base_url") or DEFAULT_LETTA_BASE_URL)
        try:
            loopback_url = ensure_loopback_url(base_url, DEFAULT_LETTA_BASE_URL)
        except ValueError as exc:
            return {"mode": "blocked", "connected": False, "base_url": base_url, "error": str(exc), "memfs_root": str(LETTA_MEMFS_ROOT), "memfs_note_count": note_count, "agent_id": self.state.get("letta_agent_id")}
        connected, error = False, ""
        try:
            request_local_json(loopback_url, timeout=1.2)
            connected = True
        except (HTTPError, URLError, TimeoutError, ValueError) as exc:
            error = str(exc)
        except Exception as exc:
            error = str(exc)
        return {"mode": "memfs+server" if connected else "memfs", "connected": connected, "base_url": loopback_url, "error": error, "memfs_root": str(LETTA_MEMFS_ROOT), "memfs_note_count": note_count, "agent_id": self.state.get("letta_agent_id")}

    def _sync_note_to_memfs(self, note: dict[str, Any]) -> dict[str, Any]:
        root = LETTA_MEMFS_ROOT / "vault" / str(note.get("type") or "memory")
        root.mkdir(parents=True, exist_ok=True)
        file_path = root / f"{note['id']}.md"
        content = "---\ndescription: Approved Hermes vault note for %s\nlimit: 12000\nsource_note_id: %s\nvault_path: %s\nagent: %s\n---\n\n# %s\n\n%s\n\nSource: %s\n" % (note.get("title", "memory"), note["id"], note["path"], slugify(str(self.state.get("letta_agent_id") or "hermes-memory")), note["title"], note["summary"], note["path"])
        file_path.write_text(content, encoding="utf-8")
        return {"id": note["id"], "memfs_path": str(file_path)}

    def _sync_selected_context_file(self, notes: list[dict[str, Any]]) -> str:
        system_root = LETTA_MEMFS_ROOT / "system"
        system_root.mkdir(parents=True, exist_ok=True)
        lines = ["---", "description: Pinned Hermes operator context promoted from the Obsidian vault", "limit: 32000", "---", "", "# Hermes Operator Context", ""]
        if not notes:
            lines.append("No vault notes are currently pinned into Hermes context.")
        else:
            for note in notes:
                lines.extend([f"## {note['title']} [{note['type']}]", "", note["summary"] or "No summary available.", "", f"Source: {note['path']}", ""])
        target = system_root / "hermes_context.md"
        target.write_text("\n".join(lines) + "\n", encoding="utf-8")
        return str(target)

    def sync_letta(self, note_ids: list[str] | None = None) -> dict[str, Any]:
        with self.lock:
            index = self._vault_index(write_files=False)
            lookup = {note["id"]: note for note in index["notes"]}
            synced = []
            for note_id in (note_ids or list(lookup.keys())):
                note = lookup.get(note_id)
                if not note:
                    continue
                result = self._sync_note_to_memfs(note)
                self.letta_registry.setdefault("notes", {})[note_id] = {"memfs_path": result["memfs_path"], "title": note["title"], "updated_at": utc_now()}
                synced.append(result)
            selected_notes = [lookup[note_id] for note_id in self.state.get("selected_context_note_ids", []) if note_id in lookup]
            context_path = self._sync_selected_context_file(selected_notes)
            self.state["last_letta_sync_at"] = utc_now()
            self._save_letta_registry()
            self._save_state()
            return {"ok": True, "synced": synced, "context_path": context_path, "status": self._letta_status()}

    def capture_to_vault(self, payload: dict[str, Any]) -> dict[str, Any]:
        with self.lock:
            candidate_id, discard = str(payload.get("candidate_id", "")).strip(), bool(payload.get("discard"))
            queue = self.state.get("capture_queue", [])
            candidate = next((item for item in queue if item.get("id") == candidate_id), None)
            if discard:
                self.state["capture_queue"] = [item for item in queue if item.get("id") != candidate_id]
                self._save_state()
                return {"ok": True, "discarded": candidate_id, "state": self.state}
            if candidate is None and candidate_id:
                raise ValueError("Capture candidate not found.")
            note_type = str(payload.get("type") or candidate.get("type") if candidate else "knowledge")
            title = str(payload.get("title") or candidate.get("title") if candidate else "Captured Note").strip()
            summary = str(payload.get("summary") or candidate.get("summary") if candidate else "").strip()
            body = str(payload.get("body") or candidate.get("body") if candidate else "").strip()
            note = self._write_note(note_type, title or "Captured Note", summary or first_sentence(body, "Captured from Mission Control"), body or "## Key Facts\n\n- \n\n## Context\n\n- \n\n## Related Notes\n\n- \n\n## Next Actions\n\n- \n", str(payload.get("source") or candidate.get("source") if candidate else "manual"))
            self.state["capture_queue"] = [item for item in queue if item.get("id") != candidate_id]
            sync_result = self.sync_letta([note["id"]]) if bool(payload.get("sync_to_letta")) and self.state.get("memory_mode") == "vault_plus_letta" else None
            return {"ok": True, "note": note, "state": self.state, "sync_result": sync_result}

    def update_context_notes(self, note_ids: list[str]) -> dict[str, Any]:
        with self.lock:
            valid_ids = {note["id"] for note in self._vault_index(write_files=False)["notes"]}
            self.state["selected_context_note_ids"] = [note_id for note_id in note_ids if isinstance(note_id, str) and note_id in valid_ids]
            self.agent = self._build_agent()
            self._save_state()
            return {"ok": True, "selected_context_note_ids": self.state["selected_context_note_ids"], "count": len(self.state["selected_context_note_ids"])}

    def _research_status(self) -> dict[str, Any]:
        missions = self.state.get("research_missions", [])
        return {"ok": True, "runner_mode": "autoresearch-adapter", "external_repo_installed": AUTORESEARCH_ROOT.exists(), "mission_count": len(missions), "active_count": sum(1 for mission in missions if mission.get("status") == "running"), "completed_count": sum(1 for mission in missions if mission.get("status") == "completed"), "artifact_root": str(RESEARCH_DIR)}

    def list_research_missions(self) -> dict[str, Any]:
        return {"ok": True, "missions": self.state.get("research_missions", [])}

    def create_research_mission(self, payload: dict[str, Any]) -> dict[str, Any]:
        with self.lock:
            title, objective = str(payload.get("title", "")).strip(), str(payload.get("objective", "")).strip()
            if not title or not objective:
                raise ValueError("Mission title and objective are required.")
            network_policy = str(payload.get("network_policy") or "local-only")
            if network_policy not in LOCAL_NETWORK_POLICIES:
                network_policy = "local-only"
            mission = {"id": f"mission-{slugify(title)}-{datetime.utcnow().strftime('%H%M%S')}", "title": title, "objective": objective, "scope": str(payload.get("scope", "")).strip(), "network_policy": network_policy, "status": "ready", "schedule": str(payload.get("schedule") or "manual"), "output_targets": payload.get("output_targets") if isinstance(payload.get("output_targets"), list) else ["vault-note", "brief"], "artifacts": [], "created_at": utc_now(), "updated_at": utc_now(), "last_run_at": None, "summary": str(payload.get("summary") or "Mission queued in Research Ops.")}
            self.state.setdefault("research_missions", []).insert(0, mission)
            self._save_state()
            return {"ok": True, "mission": mission, "state": self.state}

    def _research_context_payload(self) -> str:
        index = self._vault_index(write_files=False)
        selected = set(self.state.get("selected_context_note_ids", []))
        snippets = [f"- {note['title']} [{note['type']}]: {truncate(note['summary'], 220)}" for note in index["notes"] if note["id"] in selected]
        return "\n".join(snippets) if snippets else "- No additional vault context selected."

    def run_research_mission(self, mission_id: str) -> dict[str, Any]:
        with self.lock:
            mission = next((item for item in self.state.get("research_missions", []) if item.get("id") == mission_id), None)
            if mission is None:
                raise ValueError("Mission not found.")
            if mission.get("network_policy") != "local-only" and not self.state.get("guardrails", {}).get("internet_access_requested"):
                raise ValueError("This mission is not local-only. Request internet access before running it.")
            mission["status"], mission["updated_at"] = "running", utc_now()
            self._save_state()
            artifact_root = RESEARCH_DIR / mission_id
            artifact_root.mkdir(parents=True, exist_ok=True)
            (artifact_root / "spec.json").write_text(json.dumps(mission, indent=2), encoding="utf-8")
            prompt = "You are Hermes Research Ops running in local-only mode. Produce a concise mission output with sections for mission brief, constraints, working assumptions, proposed experiments, risks and unknowns, and recommended next actions.\n\nMission title: %s\nObjective: %s\nScope: %s\nOutput targets: %s\nContext notes:\n%s\n" % (mission["title"], mission["objective"], mission.get("scope", ""), ", ".join(mission.get("output_targets", [])), self._research_context_payload())
            artifact_text, error = "", ""
            if AIAgent is not None:
                try:
                    temp_agent = self._create_agent(system_prompt="You are a local-only research operator. Do not claim web access. Work from the supplied mission spec and selected local vault context only.", prefill_messages=[])
                    artifact_text = temp_agent.chat(prompt) if temp_agent is not None else ""
                except Exception as exc:
                    error = str(exc)
            if not artifact_text:
                artifact_text = "# %s\n\n## Mission Brief\n\n%s\n\n## Constraints\n\n- Local-only mode\n- No external browsing\n- Approval required for internet-enabled missions\n\n## Working Assumptions\n\n- Use the selected vault context as the source of truth.\n- Promote only durable findings into memory.\n\n## Proposed Experiments\n\n- Convert the objective into a stepwise local research workflow.\n- Identify what evidence can be gathered from existing vault notes and business records.\n\n## Risks and Unknowns\n\n- Live model runner unavailable or returned an error: %s\n\n## Recommended Next Actions\n\n- Review the mission in Research Ops.\n- Promote only the durable summary into the vault.\n" % (mission["title"], mission["objective"], error or "no local generation available")
            artifact_id = f"artifact-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}"
            artifact_path = artifact_root / f"{artifact_id}.md"
            artifact_path.write_text(artifact_text, encoding="utf-8")
            run_log = {"id": artifact_id, "path": str(artifact_path), "created_at": utc_now(), "summary": first_sentence(artifact_text, mission["title"])}
            mission.setdefault("artifacts", []).insert(0, run_log)
            mission["status"], mission["last_run_at"], mission["updated_at"], mission["summary"] = "completed", utc_now(), utc_now(), first_sentence(artifact_text, mission["summary"])
            self._save_state()
            return {"ok": True, "mission": mission, "artifact": run_log, "artifact_text": artifact_text}

    def schedule_research_mission(self, payload: dict[str, Any]) -> dict[str, Any]:
        with self.lock:
            mission = next((item for item in self.state.get("research_missions", []) if item.get("id") == str(payload.get("mission_id", "")).strip()), None)
            if mission is None:
                raise ValueError("Mission not found.")
            mission["schedule"], mission["updated_at"] = str(payload.get("schedule", "")).strip() or "manual", utc_now()
            self._save_state()
            return {"ok": True, "mission": mission}

    def promote_research_mission(self, payload: dict[str, Any]) -> dict[str, Any]:
        with self.lock:
            mission = next((item for item in self.state.get("research_missions", []) if item.get("id") == str(payload.get("mission_id", "")).strip()), None)
            if mission is None:
                raise ValueError("Mission not found.")
            artifacts = mission.get("artifacts", [])
            if not artifacts:
                raise ValueError("Mission has no artifacts to promote.")
            latest = artifacts[0]
            body = Path(str(latest["path"])).read_text(encoding="utf-8", errors="ignore") if Path(str(latest["path"])).exists() else ""
            note = self._write_note("research", mission["title"], mission.get("summary") or latest.get("summary") or mission["objective"], "## Key Facts\n\n- Objective: %s\n- Network policy: %s\n- Latest artifact: %s\n\n## Context\n\n%s\n\n## Related Notes\n\n- \n\n## Next Actions\n\n- Review and refine this promoted research note.\n" % (mission["objective"], mission["network_policy"], latest["id"], truncate(body, 2200)), "research-ops")
            sync_result = self.sync_letta([note["id"]]) if bool(payload.get("sync_to_letta")) and self.state.get("memory_mode") == "vault_plus_letta" else None
            return {"ok": True, "note": note, "sync_result": sync_result}

    def _paperclip_status(self) -> dict[str, Any]:
        base_url = str(self.state.get("paperclip_base_url") or DEFAULT_PAPERCLIP_BASE_URL)
        try:
            loopback_url = ensure_loopback_url(base_url, DEFAULT_PAPERCLIP_BASE_URL)
        except ValueError as exc:
            return {"ok": True, "connected": False, "mode": "blocked", "base_url": base_url, "error": str(exc), "queued_approvals": len(self.state.get("paperclip_approval_queue", []))}
        connected, error = False, ""
        try:
            request_local_json(loopback_url, timeout=1.2)
            connected = True
        except Exception as exc:
            error = str(exc)
        return {"ok": True, "connected": connected, "mode": "native-service" if connected else "offline-adapter", "base_url": loopback_url, "error": error, "queued_approvals": len(self.state.get("paperclip_approval_queue", [])), "company_id": self.state.get("paperclip_company_id")}

    def company_overview(self) -> dict[str, Any]:
        overview = self.state.get("company_workspace", {}).get("overview", {})
        return {"ok": True, "overview": {**overview, "queued_approvals": len(self.state.get("paperclip_approval_queue", []))}, "approval_queue": self.state.get("paperclip_approval_queue", []), "status": self._paperclip_status()}

    def company_agents(self) -> dict[str, Any]:
        return {"ok": True, "agents": self.state.get("company_workspace", {}).get("agents", [])}

    def company_tickets(self) -> dict[str, Any]:
        return {"ok": True, "tickets": self.state.get("company_workspace", {}).get("tickets", []), "approval_queue": self.state.get("paperclip_approval_queue", [])}

    def company_approve(self, payload: dict[str, Any]) -> dict[str, Any]:
        with self.lock:
            action, ticket_id = str(payload.get("action", "approve")).strip().lower(), str(payload.get("ticket_id", "")).strip()
            if action not in {"approve", "reject"}:
                raise ValueError("Approval action must be approve or reject.")
            tickets = self.state.get("company_workspace", {}).get("tickets", [])
            ticket = next((item for item in tickets if item.get("id") == ticket_id), None)
            if ticket is None:
                raise ValueError("Ticket not found.")
            ticket["approval_status"], ticket["status"] = ("approved", "active") if action == "approve" else ("rejected", "blocked")
            ticket.setdefault("log", []).insert(0, f"{utc_now()}: Operator {action}d this action inside Hermes Company Ops.")
            self.state["paperclip_approval_queue"] = [item for item in self.state.get("paperclip_approval_queue", []) if item.get("ticket_id") != ticket_id]
            self._save_state()
            return {"ok": True, "ticket": ticket, "approval_queue": self.state.get("paperclip_approval_queue", [])}

    def company_sync(self) -> dict[str, Any]:
        return {"ok": True, "status": self._paperclip_status(), "overview": self.company_overview()}

    def update_state(self, patch: dict[str, Any]) -> dict[str, Any]:
        with self.lock:
            changed_runtime = False
            if isinstance(patch.get("active_page"), str) and patch["active_page"] in PAGE_IDS:
                self.state["active_page"] = patch["active_page"]
            if isinstance(patch.get("current_model"), str):
                self.state["current_model"] = patch["current_model"].strip() or DEFAULT_MODEL
                changed_runtime = True
            if isinstance(patch.get("workspace_mode"), str) and patch["workspace_mode"] in WORKSPACE_MODES:
                self.state["workspace_mode"] = patch["workspace_mode"]
                changed_runtime = True
            if isinstance(patch.get("notes"), str):
                self.state["notes"] = patch["notes"]
            if isinstance(patch.get("boards"), dict):
                self.state["boards"] = patch["boards"]
            if isinstance(patch.get("armed_workflows"), list):
                valid_ids = {item["id"] for item in self.catalog["gsd"]}
                self.state["armed_workflows"] = [item for item in patch["armed_workflows"] if isinstance(item, str) and item in valid_ids]
                changed_runtime = True
            if isinstance(patch.get("armed_skills"), list):
                valid_skill_ids = {item["id"] for items in self.catalog["openclaw"].values() for item in items}
                self.state["armed_skills"] = [item for item in patch["armed_skills"] if isinstance(item, str) and item in valid_skill_ids]
                changed_runtime = True
            if isinstance(patch.get("guardrails"), dict):
                for key, value in patch["guardrails"].items():
                    if key in self.state["guardrails"]:
                        self.state["guardrails"][key] = bool(value)
                        changed_runtime = True
            if isinstance(patch.get("vault_path"), str) and patch["vault_path"].strip():
                self.state["vault_path"] = patch["vault_path"].strip()
                changed_runtime = True
            if isinstance(patch.get("letta_base_url"), str):
                self.state["letta_base_url"] = patch["letta_base_url"].strip() or DEFAULT_LETTA_BASE_URL
            if isinstance(patch.get("letta_agent_id"), str):
                self.state["letta_agent_id"] = patch["letta_agent_id"].strip() or "hermes-memory"
            if isinstance(patch.get("memory_mode"), str) and patch["memory_mode"] in MEMORY_MODES:
                self.state["memory_mode"] = patch["memory_mode"]
            if isinstance(patch.get("capture_mode"), str) and patch["capture_mode"] in CAPTURE_MODES:
                self.state["capture_mode"] = patch["capture_mode"]
            if isinstance(patch.get("paperclip_base_url"), str):
                self.state["paperclip_base_url"] = patch["paperclip_base_url"].strip() or DEFAULT_PAPERCLIP_BASE_URL
            if isinstance(patch.get("paperclip_company_id"), str):
                self.state["paperclip_company_id"] = patch["paperclip_company_id"].strip() or "aerugi-hq"
            if changed_runtime:
                self.agent = self._build_agent()
            self._save_state()
            return self.get_status()

    def export_state(self) -> dict[str, Any]:
        return {"ok": True, "filename": f"hermes-mission-control-{datetime.now().strftime('%Y%m%d-%H%M%S')}.json", "payload": self.state}

    def get_status(self) -> dict[str, Any]:
        with self.lock:
            mode_key = self.state.get("workspace_mode", "research")
            return {"ok": True, "host": HOST, "port": PORT, "state": self.state, "workspace_modes": WORKSPACE_MODES, "runtime": {"flags": self.flags.__dict__, "current_model": self.state.get("current_model"), "available_models": [DEFAULT_MODEL, DEEP_MODEL], "catalog_summary": {"gsd_count": len(self.catalog["gsd"]), "openclaw_count": sum(len(items) for items in self.catalog["openclaw"].values()), "armed_workflows": len(self.state.get("armed_workflows", [])), "armed_skills": len(self.state.get("armed_skills", []))}, "ollama": self._ollama_status(), "base_url": OLLAMA_BASE_URL, "workspace_mode_label": WORKSPACE_MODES.get(mode_key, WORKSPACE_MODES["research"])["label"], "hermes_path": str(HERMES_ROOT), "agent_available": AIAgent is not None, "agent_import_error": AGENT_IMPORT_ERROR}, "subsystems": {"memory": self._memory_status(), "research": self._research_status(), "company": self._paperclip_status()}}

    def get_catalog(self) -> dict[str, Any]:
        return {"ok": True, "catalog": self.catalog, "armed_workflows": self.state.get("armed_workflows", []), "armed_skills": self.state.get("armed_skills", [])}


SERVICE = MissionControlService()


class MissionRequestHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, directory=str(STATIC_DIR), **kwargs)

    def log_message(self, format: str, *args: Any) -> None:
        print(f"[mission-control] {self.address_string()} - {format % args}")

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/status":
            self._write_json(HTTPStatus.OK, SERVICE.get_status())
            return
        if parsed.path == "/api/catalog":
            self._write_json(HTTPStatus.OK, SERVICE.get_catalog())
            return
        if parsed.path == "/api/export":
            self._write_json(HTTPStatus.OK, SERVICE.export_state())
            return
        if parsed.path == "/api/memory/status":
            self._write_json(HTTPStatus.OK, SERVICE._memory_status())
            return
        if parsed.path == "/api/vault/index":
            self._write_json(HTTPStatus.OK, {"ok": True, **SERVICE._vault_index(write_files=False)})
            return
        if parsed.path == "/api/vault/tree":
            self._write_json(HTTPStatus.OK, SERVICE.get_vault_tree())
            return
        if parsed.path == "/api/vault/note":
            from urllib.parse import parse_qs
            qs = parse_qs(parsed.query)
            rel = qs.get("path", [""])[0]
            if not rel:
                self._write_json(HTTPStatus.BAD_REQUEST, {"ok": False, "error": "path param required"})
            else:
                self._write_json(HTTPStatus.OK, SERVICE.get_vault_note(rel))
            return
        if parsed.path == "/api/research/status":
            self._write_json(HTTPStatus.OK, SERVICE._research_status())
            return
        if parsed.path == "/api/research/missions":
            self._write_json(HTTPStatus.OK, SERVICE.list_research_missions())
            return
        if parsed.path == "/api/company/status":
            self._write_json(HTTPStatus.OK, SERVICE._paperclip_status())
            return
        if parsed.path == "/api/company/overview":
            self._write_json(HTTPStatus.OK, SERVICE.company_overview())
            return
        if parsed.path == "/api/company/agents":
            self._write_json(HTTPStatus.OK, SERVICE.company_agents())
            return
        if parsed.path == "/api/company/tickets":
            self._write_json(HTTPStatus.OK, SERVICE.company_tickets())
            return
        if parsed.path == "/api/ace/status":
            self._write_json(HTTPStatus.OK, {
                "ok": True,
                "last_run_at": SERVICE.state.get("last_ace_run_at"),
                "last_delta_summary": SERVICE.state.get("last_ace_delta_summary"),
                "delta_file_exists": ACE_CONTEXT_DELTA_PATH.exists(),
            })
            return
        if parsed.path == "/favicon.ico":
            self.send_response(HTTPStatus.NO_CONTENT)
            self.end_headers()
            return
        super().do_GET()

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        body = self._read_json()
        try:
            if parsed.path == "/api/chat":
                self._write_json(HTTPStatus.OK, SERVICE.chat(str(body.get("message", ""))))
                return
            if parsed.path == "/api/state":
                self._write_json(HTTPStatus.OK, SERVICE.update_state(body))
                return
            if parsed.path == "/api/reset":
                self._write_json(HTTPStatus.OK, SERVICE.reset_session(wipe_chat_log=bool(body.get("wipe_chat_log"))))
                return
            if parsed.path == "/api/vault/bootstrap":
                self._write_json(HTTPStatus.OK, SERVICE._bootstrap_vault())
                return
            if parsed.path == "/api/vault/capture":
                self._write_json(HTTPStatus.OK, SERVICE.capture_to_vault(body))
                return
            if parsed.path == "/api/vault/note":
                rel_path = body.get("path", "")
                content = body.get("content", "")
                if not rel_path or not content:
                    self._write_json(HTTPStatus.BAD_REQUEST, {"ok": False, "error": "path and content required"})
                else:
                    self._write_json(HTTPStatus.OK, SERVICE.update_vault_note(rel_path, content))
                return
            if parsed.path == "/api/vault/note/new":
                result = SERVICE._write_note(
                    note_type=body.get("type", "knowledge"),
                    title=body.get("title", "Untitled"),
                    summary=body.get("summary", ""),
                    body=body.get("body", ""),
                    source="mission-control",
                )
                self._write_json(HTTPStatus.OK, {"ok": True, **result})
                return
            if parsed.path == "/api/vault/context":
                self._write_json(HTTPStatus.OK, SERVICE.update_context_notes(body.get("note_ids", []) if isinstance(body.get("note_ids", []), list) else []))
                return
            if parsed.path == "/api/letta/test":
                self._write_json(HTTPStatus.OK, {"ok": True, "status": SERVICE._letta_status()})
                return
            if parsed.path == "/api/letta/sync":
                note_ids = body.get("note_ids", [])
                self._write_json(HTTPStatus.OK, SERVICE.sync_letta(note_ids if isinstance(note_ids, list) else None))
                return
            if parsed.path == "/api/research/missions":
                self._write_json(HTTPStatus.OK, SERVICE.create_research_mission(body))
                return
            if parsed.path == "/api/research/run":
                self._write_json(HTTPStatus.OK, SERVICE.run_research_mission(str(body.get("mission_id", ""))))
                return
            if parsed.path == "/api/research/schedule":
                self._write_json(HTTPStatus.OK, SERVICE.schedule_research_mission(body))
                return
            if parsed.path == "/api/research/promote":
                self._write_json(HTTPStatus.OK, SERVICE.promote_research_mission(body))
                return
            if parsed.path == "/api/company/approve":
                self._write_json(HTTPStatus.OK, SERVICE.company_approve(body))
                return
            if parsed.path == "/api/company/sync":
                self._write_json(HTTPStatus.OK, SERVICE.company_sync())
                return
            if parsed.path == "/api/company/test":
                self._write_json(HTTPStatus.OK, SERVICE._paperclip_status())
                return
            if parsed.path == "/api/ace/run":
                transcript = body.get("transcript")
                self._write_json(HTTPStatus.OK, SERVICE.run_ace_loop(transcript))
                return
            self._write_json(HTTPStatus.NOT_FOUND, {"ok": False, "error": "Route not found."})
        except Exception as exc:
            self._write_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"ok": False, "error": str(exc), "trace": traceback.format_exc(limit=6)})

    def _read_json(self) -> dict[str, Any]:
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length).decode("utf-8") if length > 0 else ""
        return json.loads(raw) if raw.strip() else {}

    def _write_json(self, status: HTTPStatus, payload: dict[str, Any]) -> None:
        data = json.dumps(payload).encode("utf-8")
        self.send_response(status.value)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)


def main() -> None:
    STATIC_DIR.mkdir(parents=True, exist_ok=True)
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    server = ThreadingHTTPServer((HOST, PORT), MissionRequestHandler)
    print(f"Hermes Mission Control running on http://{HOST}:{PORT}")
    server.serve_forever()


if __name__ == "__main__":
    main()

