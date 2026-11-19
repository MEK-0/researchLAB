"""office/server.py: SSE replay ve API uçları."""
import json
import os
import sys
import tempfile
import threading
import unittest
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "office"))
import server  # noqa: E402


def ev(name, sid, **kw):
    d = {"hook_event_name": name, "session_id": sid, "timestamp": "2026-11-19T10:00:00+00:00"}
    d.update(kw)
    return json.dumps(d)


class ServerBase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.events = os.path.join(cls.tmp.name, "events.jsonl")
        open(cls.events, "w").close()
        server.EVENTS = cls.events
        cls.httpd = server.OfficeServer(("127.0.0.1", 0), server.Handler)
        cls.port = cls.httpd.server_address[1]
        threading.Thread(target=cls.httpd.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()
        cls.tmp.cleanup()

    def url(self, path):
        return "http://127.0.0.1:%d%s" % (self.port, path)

    def get(self, path):
        with urllib.request.urlopen(self.url(path), timeout=5) as r:
            return r.status, r.headers, r.read()

    def write_events(self, lines):
        with open(self.events, "w") as f:
            f.write("".join(l + "\n" for l in lines))

    def sse(self, path):
        """İlk replay paketini okur (canlı tail başlamadan önce gelenler)."""
        r = urllib.request.urlopen(self.url(path), timeout=5)
        r.fp.raw._sock.settimeout(1.0)
        buf = b""
        try:
            while True:
                chunk = r.fp.read1(65536)
                if not chunk:
                    break
                buf += chunk
        except OSError:
            pass
        r.close()
        return [json.loads(l[6:]) for l in buf.decode().splitlines() if l.startswith("data: ")]


class Replay(ServerBase):
    def test_only_last_session(self):
        self.write_events([
            ev("SessionStart", "A", summary="session start: startup"),
            ev("UserPromptSubmit", "A", prompt="eski"),
            ev("SessionStart", "B", summary="session start: startup"),
            ev("UserPromptSubmit", "B", prompt="yeni"),
            ev("PreToolUse", "C", tool_name="Read"),          # eşzamanlı başka oturum
            ev("SessionStart", "B", summary="session start: compact"),  # sınır değil
            ev("Stop", "B"),
        ])
        got = self.sse("/events?replay=300")
        self.assertEqual([e["hook_event_name"] for e in got],
                         ["SessionStart", "UserPromptSubmit", "SessionStart", "Stop"])
        self.assertTrue(all(e["session_id"] == "B" for e in got))
        self.assertEqual(got[1]["prompt"], "yeni")

    def test_limit_and_zero(self):
        self.write_events([ev("SessionStart", "A", source="startup")] +
                          [ev("PreToolUse", "A", tool_name="Read") for _ in range(10)])
        self.assertEqual(len(self.sse("/events?replay=3")), 3)
        self.assertEqual(self.sse("/events"), [])

    def test_no_session_start(self):
        self.write_events([ev("PreToolUse", "A", tool_name="Read")])
        self.assertEqual(self.sse("/events?replay=50"), [])

    def test_normalize_legacy(self):
        self.write_events([ev("SessionStart", "A", source="startup"),
                           ev("SubagentStop", "A", agent={"agent_type": "referee"}, summary="KABUL")])
        got = self.sse("/events?replay=5")[-1]
        self.assertEqual(got["agent_type"], "referee")
        self.assertEqual(got["last_assistant_message"], "KABUL")


class Basic(ServerBase):
    def test_static(self):
        st, h, body = self.get("/static/main.js")
        self.assertEqual(st, 200)
        self.assertIn("javascript", h["Content-Type"])
        for bad in ("/static/../server.py", "/static/%2e%2e/server.py", "/static/..%2fserver.py",
                    "/static/../../.claude/hooks/log_event.py", "/static/scene/../../index.html"):
            with self.assertRaises(urllib.error.HTTPError, msg=bad) as cm:
                self.get(bad)
            self.assertEqual(cm.exception.code, 404, bad)

    def test_index_and_404(self):
        st, h, body = self.get("/")
        self.assertEqual(st, 200)
        self.assertIn(b"<html", body)
        with self.assertRaises(urllib.error.HTTPError) as cm:
            self.get("/yok")
        self.assertEqual(cm.exception.code, 404)


if __name__ == "__main__":
    unittest.main()
