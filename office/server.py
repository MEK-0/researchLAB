#!/usr/bin/env python3
"""researchLAB ofis sunucusu (yalnızca standart kütüphane).

  GET /         → office/index.html
  GET /static/* → office/static/ (ES modülleri)
  GET /api/layout → office/layout.json
  GET /api/agents → agents.json + .claude/agents/*.md frontmatter + masa atamaları
  GET /events   → Server-Sent Events: events/events.jsonl'e eklenen her satır
                  "data: <tek satırlık JSON>\\n\\n" olarak (varsayılan message event'i).
                  ?replay=N: son oturumun (bkz. replay_lines) en fazla son N olayı
                  da baştan gönderilir (varsayılan 0).
  GET /api/status → Manager çalışıyor mu, meşgul mü, aktif alt agent'lar (bkz. status_payload)
  POST /api/manager/start → Terminal 1'de Manager'ı (office/manager.sh) başlatır.
                  Host/Origin yalnızca localhost:<port>; X-Office-Token başlığı
                  index.html'e gömülen, her açılışta üretilen token olmalı.

Yalnızca 127.0.0.1'e bağlanır.
Kullanım: python3 office/server.py [--port 8765] [--tmux-session researchlab-manager]
"""
import argparse
import hmac
import json
import os
import secrets
import subprocess
import sys
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
INDEX = os.path.join(HERE, "index.html")
# OFFICE_EVENTS: testlerde gerçek olay günlüğü yerine başka bir dosya
EVENTS = os.environ.get("OFFICE_EVENTS") or os.path.join(ROOT, "events", "events.jsonl")
STATIC = os.path.realpath(os.path.join(HERE, "static"))
LAYOUT = os.path.join(HERE, "layout.json")
AGENTS = os.path.join(HERE, "agents.json")
AGENTS_DIR = os.path.join(ROOT, ".claude", "agents")
MIME = {".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
        ".json": "application/json; charset=utf-8", ".png": "image/png", ".svg": "image/svg+xml"}
OFFICE_SH = os.path.join(HERE, "office.sh")
MANAGER_SESSION = os.path.join(os.path.dirname(EVENTS), ".manager_session")
TMUX_SESSION = os.environ.get("OFFICE_S1", "researchlab-manager")
# Manager süreci adı (testlerde OFFICE_MANAGER_BIN ile sahte komut verilir)
MANAGER_PROC = os.path.basename(os.environ.get("OFFICE_MANAGER_BIN", "claude"))
PORT = 8765
TERM_PORTS = (int(os.environ.get("OFFICE_T1", 7681)), int(os.environ.get("OFFICE_T2", 7682)))
TOKEN = secrets.token_urlsafe(24)   # yazma uçları için; her açılışta yeni
STATUS_TAIL = 4 * 1024 * 1024       # /api/status events.jsonl'in son 4 MB'ına bakar
POLL = 0.25       # sn: dosya kontrol aralığı
KEEPALIVE = 15.0  # sn: bağlantıyı canlı tutan yorum satırı


def normalize(ev):
    """Hook kaydını sayfanın okuduğu alanlara düzleştirir (eski kayıtlar dahil)."""
    if not isinstance(ev, dict):
        return None
    agent = ev.get("agent") if isinstance(ev.get("agent"), dict) else {}
    if not ev.get("agent_type") and agent.get("agent_type"):
        ev["agent_type"] = agent["agent_type"]
    name = ev.get("hook_event_name")
    if name == "UserPromptSubmit" and not ev.get("prompt"):
        ev["prompt"] = ev.get("summary", "")
    if name == "SubagentStop" and not ev.get("last_assistant_message"):
        ev["last_assistant_message"] = ev.get("summary", "")
    if not ev.get("tool_input") and isinstance(ev.get("subagent"), dict):
        ev["tool_input"] = {k: v for k, v in ev["subagent"].items() if v is not None}
    return ev


def parse_frontmatter(text):
    """.md başındaki YAML frontmatter'ın basit alt kümesini okur: `key: value`,
    tırnaklı değerler ve çok satırlı `>` / `|` blokları. Bağımlılık eklememek
    için tam YAML ayrıştırıcısı değildir."""
    lines = text.splitlines()
    if not lines or lines[0].strip() != "---":
        return {}
    out, blocks = {}, {}
    key = kind = None
    for line in lines[1:]:
        if line.strip() == "---":
            break
        if kind and (line[:1] in (" ", "\t") or not line.strip()):
            blocks[key].append(line.strip())
            continue
        kind = None
        if line[:1] in (" ", "\t", "#") or ":" not in line:
            continue
        key, _, val = line.partition(":")
        key, val = key.strip(), val.strip()
        if val in (">", "|", ">-", "|-"):
            kind = val[0]
            blocks[key] = []
            out[key] = (kind, blocks[key])
            continue
        if len(val) >= 2 and val[0] == val[-1] and val[0] in "\"'":
            val = val[1:-1]
        out[key] = val
    for k, v in out.items():
        if isinstance(v, tuple):
            kind, parts = v
            out[k] = " ".join(x for x in parts if x) if kind == ">" else "\n".join(parts).strip()
    return out


def load_json(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def agents_payload():
    """agents.json görünüşleri + .claude/agents/*.md frontmatter (name, description,
    model) + layout masa atamaları. Görünüşü ya da masası olmayan agent'lar
    unassigned: true döner."""
    looks = {a.get("name"): a for a in load_json(AGENTS, {}).get("agents", []) if a.get("name")}
    desks = load_json(LAYOUT, {}).get("desks", {}) or {}
    desk_of = {name: desk for desk, name in desks.items()}
    defs = {}
    try:
        names = sorted(os.listdir(AGENTS_DIR))
    except OSError:
        names = []
    for fn in names:
        if not fn.endswith(".md"):
            continue
        try:
            with open(os.path.join(AGENTS_DIR, fn), encoding="utf-8") as f:
                fm = parse_frontmatter(f.read())
        except OSError:
            continue
        name = fm.get("name") or fn[:-3]
        defs[name] = {k: fm[k] for k in ("description", "model") if fm.get(k)}
    out = []
    for name in list(looks) + [n for n in defs if n not in looks]:
        a = {"name": name}
        a.update(looks.get(name, {}))
        a.update(defs.get(name, {}))
        if name == "manager":
            a.setdefault("description", "Ana oturum (CLAUDE.md): planlama, delegasyon, kalite kontrol, rapor.")
        a["desk"] = desk_of.get(name)
        a["defined"] = name in defs or name == "manager"
        a["unassigned"] = name not in looks or a["desk"] is None
        out.append(a)
    return {"agents": out}


def sse_line(raw):
    try:
        ev = normalize(json.loads(raw))
    except ValueError:
        return None
    if ev is None:
        return None
    # json.dumps tek satır üretir (string içindeki \n kaçışlanır)
    return ("data: %s\n\n" % json.dumps(ev, ensure_ascii=False)).encode("utf-8")


def _session_start(ev):
    """Oturum sınırı sayılan SessionStart mı? Bağlam sıkıştırma (compact) sayılmaz."""
    if not isinstance(ev, dict) or ev.get("hook_event_name") != "SessionStart":
        return False
    source = ev.get("source") or str(ev.get("summary") or "").replace("session start:", "").strip()
    return source != "compact"


def replay_lines(path, n):
    """Son oturumun (sıkıştırma hariç en son SessionStart) olaylarından en fazla
    son n tanesini döner. Yalnızca o oturumun session_id'sine ait olaylar gelir;
    aynı anda çalışan başka oturumlar karışmaz."""
    if n <= 0 or not os.path.exists(path):
        return []
    with open(path, "rb") as f:
        raw = f.read().decode("utf-8", "replace").splitlines()
    parsed = []
    for line in raw:
        try:
            ev = json.loads(line)
        except ValueError:
            continue
        if isinstance(ev, dict):
            parsed.append((line, ev))
    start = None
    for i in range(len(parsed) - 1, -1, -1):
        if _session_start(parsed[i][1]):
            start = i
            break
    if start is None:
        return []
    sid = parsed[start][1].get("session_id")
    out = [line for line, ev in parsed[start:] if ev.get("session_id") == sid]
    return out[-n:]


# --- /api/status -----------------------------------------------------------

def _read_tail(path, limit=STATUS_TAIL):
    try:
        with open(path, "rb") as f:
            f.seek(0, os.SEEK_END)
            size = f.tell()
            f.seek(max(0, size - limit))
            data = f.read()
    except OSError:
        return []
    lines = data.decode("utf-8", "replace").splitlines()
    if size > limit:
        lines = lines[1:]  # yarım kalan ilk satır
    out = []
    for line in lines:
        try:
            ev = json.loads(line)
        except ValueError:
            continue
        if isinstance(ev, dict):
            out.append(ev)
    return out


def read_manager_session(path=None):
    try:
        with open(path or MANAGER_SESSION, encoding="utf-8") as f:
            sid = f.read().strip()
    except OSError:
        return None
    return sid or None


def activity(events, sid=None):
    """Bir oturumun durumunu olaylardan çıkarır. sid verilmezse son oturum
    (sıkıştırma hariç en son SessionStart) alınır.
    Döner: {session_id, busy, subagents:[{agent_id, agent_type}]}
      busy: son UserPromptSubmit'ten sonra Stop gelmemiş (tur sürüyor).
      subagents: SubagentStart'ı olup SubagentStop'u gelmemiş alt agent'lar.
    Sayım, o oturumun son (sıkıştırma hariç) SessionStart'ından başlar."""
    if sid is None:
        for ev in reversed(events):
            if _session_start(ev):
                sid = ev.get("session_id")
                break
    if not sid:
        return {"session_id": None, "busy": False, "subagents": []}
    busy, active = False, {}
    for ev in events:
        if ev.get("session_id") != sid:
            continue
        name = ev.get("hook_event_name")
        agent = ev.get("agent") if isinstance(ev.get("agent"), dict) else {}
        if _session_start(ev):
            busy, active = False, {}
        elif name == "UserPromptSubmit":
            busy = True
        elif name == "Stop":
            busy = False
        elif name == "SubagentStart":
            key = agent.get("agent_id") or ev.get("agent_type") or "?"
            active[key] = {"agent_id": agent.get("agent_id"), "agent_type": ev.get("agent_type") or agent.get("agent_type")}
        elif name == "SubagentStop":
            key = agent.get("agent_id") or ev.get("agent_type") or "?"
            if key not in active and not agent.get("agent_id"):
                # kimliksiz eski kayıt: aynı tipten birini kapat
                key = next((k for k, v in active.items() if v["agent_type"] == ev.get("agent_type")), key)
            active.pop(key, None)
    return {"session_id": sid, "busy": busy, "subagents": list(active.values())}


def _tmux(*args):
    try:
        r = subprocess.run(["tmux", *args], capture_output=True, text=True, timeout=3)
    except (OSError, subprocess.TimeoutExpired):
        return None
    return r.stdout if r.returncode == 0 else None


def manager_process(session=None, proc=None):
    """tmux oturumu var mı ve pane'lerinin süreç ağacında Manager (claude) süreci
    çalışıyor mu? pane_current_command güvenilir değil (claude'un süreç adı
    sürüm numarası görünebilir), bu yüzden ps ağacına bakılır."""
    session, proc = session or TMUX_SESSION, proc or MANAGER_PROC
    panes = _tmux("list-panes", "-s", "-t", "=" + session, "-F", "#{pane_pid}")
    if panes is None:
        return {"session": False, "running": False}
    roots = {int(p) for p in panes.split() if p.isdigit()}
    try:
        ps = subprocess.run(["ps", "-A", "-o", "pid=,ppid=,comm="], capture_output=True, text=True, timeout=3).stdout
    except (OSError, subprocess.TimeoutExpired):
        return {"session": True, "running": False}
    children, names = {}, {}
    for line in ps.splitlines():
        parts = line.split(None, 2)
        if len(parts) < 3 or not parts[0].isdigit() or not parts[1].isdigit():
            continue
        pid, ppid = int(parts[0]), int(parts[1])
        children.setdefault(ppid, []).append(pid)
        names[pid] = os.path.basename(parts[2].strip())
    stack, seen = list(roots), set()
    while stack:
        pid = stack.pop()
        if pid in seen:
            continue
        seen.add(pid)
        if names.get(pid) == proc:
            return {"session": True, "running": True}
        stack.extend(children.get(pid, []))
    return {"session": True, "running": False}


def status_payload():
    """GET /api/status.
      manager_running: Terminal 1'in tmux oturumunda claude süreci var.
      manager_busy: Manager'ın turu sürüyor (son istemden sonra Stop gelmedi).
      active_subagents: bitmemiş alt agent'lar.
      busy: Manager çalışıyor ve (meşgul ya da aktif alt agent var); kapanışta
            uyarı gerekip gerekmediğini bu belirler.
    Manager oturumu, hook'un yazdığı events/.manager_session'dan bilinir; yoksa son oturum."""
    proc = manager_process()
    sid = read_manager_session()
    act = activity(_read_tail(EVENTS), sid) if proc["running"] else {"session_id": sid, "busy": False, "subagents": []}
    busy = proc["running"] and (act["busy"] or bool(act["subagents"]))
    return {
        "tmux_session": TMUX_SESSION,
        "session_exists": proc["session"],
        "manager_running": proc["running"],
        "manager_session_id": act["session_id"],
        "manager_busy": act["busy"],
        "active_subagents": act["subagents"],
        "busy": busy,
    }


def start_manager():
    """Manager'ı office.sh üzerinden başlatır (süreç mantığı tek yerde)."""
    if manager_process()["running"]:
        return 200, {"ok": True, "action": "already_running"}
    env = dict(os.environ, OFFICE_S1=TMUX_SESSION)
    try:
        r = subprocess.run([OFFICE_SH, "manager-start"], capture_output=True, text=True, timeout=10, env=env)
    except (OSError, subprocess.TimeoutExpired) as e:
        return 500, {"ok": False, "error": str(e)}
    msg = (r.stdout + r.stderr).strip()
    if r.returncode == 0:
        return 200, {"ok": True, "action": msg or "started"}
    return 409, {"ok": False, "error": msg or "başlatılamadı"}


class Handler(BaseHTTPRequestHandler):
    server_version = "researchLAB-office"

    def log_message(self, fmt, *args):
        pass

    def do_GET(self):
        url = urlparse(self.path)
        if url.path in ("/", "/index.html"):
            return self._index()
        if url.path.startswith("/static/"):
            return self._static(url.path[len("/static/"):])
        if url.path == "/api/layout":
            data = load_json(LAYOUT, None)
            if data is None:
                return self.send_error(500, "layout.json okunamadı")
            return self._json(data)
        if url.path == "/api/agents":
            return self._json(agents_payload())
        if url.path == "/api/status":
            return self._json(status_payload())
        if url.path == "/events":
            q = parse_qs(url.query)
            try:
                replay = max(0, min(5000, int(q.get("replay", ["0"])[0])))
            except ValueError:
                replay = 0
            return self._events(replay)
        self.send_error(404)

    def _write_allowed(self):
        """Yazma uçları: Host ve Origin yalnızca bu sunucu (DNS rebinding ve başka
        sitelerden istek engeli), X-Office-Token sayfaya gömülen token."""
        ok_hosts = {"localhost:%d" % PORT, "127.0.0.1:%d" % PORT}
        if self.headers.get("Host") not in ok_hosts:
            return False
        if self.headers.get("Origin") not in {"http://" + h for h in ok_hosts}:
            return False
        return hmac.compare_digest(self.headers.get("X-Office-Token", ""), TOKEN)

    def do_POST(self):
        url = urlparse(self.path)
        if url.path != "/api/manager/start":
            return self.send_error(404)
        if not self._write_allowed():
            return self._json({"ok": False, "error": "izin yok"}, 403)
        code, data = start_manager()
        return self._json(data, code)

    def _index(self):
        try:
            with open(INDEX, "rb") as f:
                body = f.read()
        except OSError:
            return self.send_error(500, "index.html okunamadı")
        meta = ('<meta name="office-token" content="%s">\n<meta name="office-terminals" content="%d,%d">\n</head>'
                % ((TOKEN,) + TERM_PORTS)).encode()
        body = body.replace(b"</head>", meta, 1)
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _json(self, data, code=200):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _static(self, rel):
        """office/static/ altından dosya servis eder; dışarı çıkmaya izin vermez."""
        path = os.path.realpath(os.path.join(STATIC, rel))
        if not path.startswith(STATIC + os.sep) or not os.path.isfile(path):
            return self.send_error(404)
        ctype = MIME.get(os.path.splitext(path)[1].lower())
        if not ctype:
            return self.send_error(404)
        with open(path, "rb") as f:
            body = f.read()
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _events(self, replay):
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "keep-alive")
        self.end_headers()
        self.close_connection = True
        try:
            self.wfile.write(b"retry: 2000\n\n")
            for raw in replay_lines(EVENTS, replay):
                chunk = sse_line(raw)
                if chunk:
                    self.wfile.write(chunk)
            self.wfile.flush()
            self._tail()
        except (BrokenPipeError, ConnectionResetError):
            pass

    def _tail(self):
        pos, ino, buf = 0, None, b""
        if os.path.exists(EVENTS):
            st = os.stat(EVENTS)
            pos, ino = st.st_size, st.st_ino
        last_write = time.time()
        while True:
            try:
                st = os.stat(EVENTS)
            except FileNotFoundError:
                st = None
            if st is not None:
                if st.st_ino != ino or st.st_size < pos:  # yeni dosya / kırpıldı
                    pos, ino, buf = 0, st.st_ino, b""
                if st.st_size > pos:
                    with open(EVENTS, "rb") as f:
                        f.seek(pos)
                        data = f.read()
                    pos += len(data)
                    buf += data
                    *done, buf = buf.split(b"\n")
                    out = b"".join(filter(None, (sse_line(l.decode("utf-8", "replace")) for l in done if l.strip())))
                    if out:
                        self.wfile.write(out)
                        self.wfile.flush()
                        last_write = time.time()
            if time.time() - last_write > KEEPALIVE:
                self.wfile.write(b": ping\n\n")
                self.wfile.flush()
                last_write = time.time()
            time.sleep(POLL)


class OfficeServer(ThreadingHTTPServer):
    daemon_threads = True

    def handle_error(self, request, client_address):
        # İstemcinin bağlantıyı koparması (sekme kapandı, SSE yeniden bağlandı) olağandır.
        exc = sys.exc_info()[1]
        if isinstance(exc, (ConnectionResetError, BrokenPipeError, TimeoutError)):
            return
        super().handle_error(request, client_address)


def main():
    global PORT, TMUX_SESSION
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=int(os.environ.get("OFFICE_PORT", 8765)))
    ap.add_argument("--tmux-session", default=TMUX_SESSION, help="Manager'ın tmux oturumu")
    args = ap.parse_args()
    PORT, TMUX_SESSION = args.port, args.tmux_session
    srv = OfficeServer(("127.0.0.1", args.port), Handler)
    print("researchLAB ofisi: http://localhost:%d" % args.port, flush=True)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
