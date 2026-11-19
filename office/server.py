#!/usr/bin/env python3
"""researchLAB ofis sunucusu (yalnızca standart kütüphane).

  GET /         → office/index.html
  GET /events   → Server-Sent Events: events/events.jsonl'e eklenen her satır
                  "data: <tek satırlık JSON>\\n\\n" olarak (varsayılan message event'i).
                  ?replay=N ile son N olay da baştan gönderilir (varsayılan 0).

Yalnızca 127.0.0.1'e bağlanır. Kullanım: python3 office/server.py [--port 8765]
"""
import argparse
import json
import os
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
INDEX = os.path.join(HERE, "index.html")
EVENTS = os.path.join(ROOT, "events", "events.jsonl")
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


def sse_line(raw):
    try:
        ev = normalize(json.loads(raw))
    except ValueError:
        return None
    if ev is None:
        return None
    # json.dumps tek satır üretir (string içindeki \n kaçışlanır)
    return ("data: %s\n\n" % json.dumps(ev, ensure_ascii=False)).encode("utf-8")


def last_lines(path, n):
    if n <= 0 or not os.path.exists(path):
        return []
    with open(path, "rb") as f:
        lines = f.read().splitlines()
    return [l.decode("utf-8", "replace") for l in lines[-n:]]


class Handler(BaseHTTPRequestHandler):
    server_version = "researchLAB-office"

    def log_message(self, fmt, *args):
        pass

    def do_GET(self):
        url = urlparse(self.path)
        if url.path in ("/", "/index.html"):
            return self._index()
        if url.path == "/events":
            q = parse_qs(url.query)
            try:
                replay = max(0, min(5000, int(q.get("replay", ["0"])[0])))
            except ValueError:
                replay = 0
            return self._events(replay)
        self.send_error(404)

    def _index(self):
        try:
            with open(INDEX, "rb") as f:
                body = f.read()
        except OSError:
            return self.send_error(500, "index.html okunamadı")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
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
        try:
            self.wfile.write(b"retry: 2000\n\n")
            for raw in last_lines(EVENTS, replay):
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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=int(os.environ.get("OFFICE_PORT", 8765)))
    args = ap.parse_args()
    srv = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    srv.daemon_threads = True
    print("researchLAB ofisi: http://localhost:%d" % args.port, flush=True)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
