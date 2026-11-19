#!/usr/bin/env python3
"""researchLAB olay günlüğü hook'u.

Claude Code hook JSON'unu stdin'den okur ve events/events.jsonl dosyasına
tek satırlık bir JSON kaydı ekler. 3B ofis arayüzünün veri kaynağıdır.

Kurallar: yalnızca standart kütüphane; asla hata fırlatmaz; her durumda exit 0.
"""
import json
import os
import re
import shutil
import sys
from datetime import datetime, timezone

SUMMARY_MAX = 200
AGENT_TOOLS = {"Task", "Agent"}
# Hook girdisinde agent kimliğine dair olabilecek alanlar
AGENT_ID_KEYS = (
    "agent_id",
    "agent_type",
    "agent_name",
    "subagent_type",
    "agent_transcript_path",
    "parent_session_id",
    "parent_tool_use_id",
)


def _short(value, limit=SUMMARY_MAX):
    try:
        if value is None:
            return ""
        if not isinstance(value, str):
            value = json.dumps(value, ensure_ascii=False)
        value = " ".join(value.split())
        return value if len(value) <= limit else value[: limit - 1] + "…"
    except Exception:
        return ""


def _summary(data):
    event = data.get("hook_event_name", "")
    tool = data.get("tool_name")
    ti = data.get("tool_input") if isinstance(data.get("tool_input"), dict) else {}

    if event == "UserPromptSubmit":
        return _short(data.get("prompt"))
    if event == "SessionStart":
        return "session start: " + _short(data.get("source") or "")
    if event == "Notification":
        return _short(data.get("message"))
    if event in ("Stop", "SubagentStop"):
        return _short(data.get("last_assistant_message") or event)
    if tool:
        if tool in AGENT_TOOLS:
            return _short("%s → %s" % (ti.get("subagent_type", "?"), ti.get("description", "")))
        for key in ("description", "command", "file_path", "pattern", "url", "query", "path"):
            if ti.get(key):
                return _short("%s: %s" % (tool, ti[key]))
        return tool
    return _short(event)


def _project_dir():
    d = os.environ.get("CLAUDE_PROJECT_DIR")
    if d:
        return d
    # .claude/hooks/log_event.py → proje kökü
    return os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def _safe(name, default="unknown"):
    name = re.sub(r"[^A-Za-z0-9._-]+", "-", str(name or "")).strip("-.")
    return name or default


def _active_project(root):
    """workspace/.active_project içindeki proje adını döner; yoksa None."""
    try:
        with open(os.path.join(root, "workspace", ".active_project"), encoding="utf-8") as f:
            name = f.read().strip()
        if name and name not in ("_template", "_unassigned") and "/" not in name and ".." not in name:
            if os.path.isdir(os.path.join(root, "workspace", name)):
                return name
    except Exception:
        pass
    return None


def _subagent_transcript(data):
    """Alt agent transcript yolunu bulur. Önce agent_transcript_path,
    boşsa <ana transcript>/subagents/agent-<agent_id>.jsonl denenir."""
    p = data.get("agent_transcript_path")
    if p and os.path.isfile(p):
        return p
    tp, aid = data.get("transcript_path"), data.get("agent_id")
    if tp and aid:
        base = tp[:-6] if tp.endswith(".jsonl") else tp
        cand = os.path.join(base, "subagents", "agent-%s.jsonl" % aid)
        if os.path.isfile(cand):
            return cand
    return None


def _copy_raw_transcript(data, root):
    """SubagentStop'ta transcript'i agent_logs/raw/ altına kopyalar.
    Hedef yolu (veya hata bilgisini) dict olarak döner; asla fırlatmaz."""
    try:
        src = _subagent_transcript(data)
        if not src:
            return {"copied": False, "reason": "transcript yok"}
        project = _active_project(root)
        if project:
            dest_dir = os.path.join(root, "workspace", project, "agent_logs", "raw")
        else:
            dest_dir = os.path.join(root, "workspace", "_unassigned", "raw")
        os.makedirs(dest_dir, exist_ok=True)
        ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
        agent = _safe(data.get("agent_type") or data.get("agent_id"))
        dest = os.path.join(dest_dir, "%s-%s.jsonl" % (ts, agent))
        shutil.copyfile(src, dest)
        return {"copied": True, "dest": os.path.relpath(dest, root), "project": project}
    except Exception as e:
        return {"copied": False, "reason": _short(repr(e))}


def main():
    try:
        raw = sys.stdin.read()
    except Exception:
        raw = ""
    try:
        data = json.loads(raw) if raw.strip() else {}
        if not isinstance(data, dict):
            data = {"raw": data}
    except Exception:
        data = {"raw": _short(raw, 500), "parse_error": True}

    try:
        record = {
            "timestamp": datetime.now(timezone.utc).isoformat(timespec="milliseconds"),
            "hook_event_name": data.get("hook_event_name"),
            "session_id": data.get("session_id"),
        }
        if data.get("tool_name"):
            record["tool_name"] = data.get("tool_name")
        if data.get("tool_use_id"):
            record["tool_use_id"] = data.get("tool_use_id")
        record["summary"] = _summary(data)

        # Agent kimliği (alt agent içinden tetiklenen hook'larda bulunur)
        agent = {k: data[k] for k in AGENT_ID_KEYS if data.get(k) is not None}
        if agent:
            record["agent"] = agent

        # Alt agent çağrıları
        if data.get("tool_name") in AGENT_TOOLS and isinstance(data.get("tool_input"), dict):
            ti = data["tool_input"]
            record["subagent"] = {
                "subagent_type": ti.get("subagent_type"),
                "description": ti.get("description"),
            }
            for extra in ("name", "model", "run_in_background"):
                if ti.get(extra) is not None:
                    record["subagent"][extra] = ti.get(extra)

        if data.get("parse_error"):
            record["parse_error"] = True
            record["raw"] = data.get("raw")

        root = _project_dir()
        if data.get("hook_event_name") == "SubagentStop":
            record["raw_transcript"] = _copy_raw_transcript(data, root)

        events_dir = os.path.join(root, "events")
        os.makedirs(events_dir, exist_ok=True)
        with open(os.path.join(events_dir, "events.jsonl"), "a", encoding="utf-8") as f:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")
    except Exception:
        pass


if __name__ == "__main__":
    try:
        main()
    except BaseException:
        pass
    sys.exit(0)
