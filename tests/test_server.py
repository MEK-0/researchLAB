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
        server.PORT = cls.port
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


class Api(ServerBase):
    def setUp(self):
        self.d = tempfile.TemporaryDirectory()
        self.saved = (server.LAYOUT, server.AGENTS, server.AGENTS_DIR)
        server.AGENTS_DIR = os.path.join(self.d.name, "agents")
        os.makedirs(server.AGENTS_DIR)
        server.LAYOUT = os.path.join(self.d.name, "layout.json")
        server.AGENTS = os.path.join(self.d.name, "agents.json")
        with open(server.LAYOUT, "w") as f:
            json.dump({"items": [{"id": "d1", "type": "desk", "x": 0, "y": 0}], "desks": {"d1": "referee"}}, f)
        with open(server.AGENTS, "w") as f:
            json.dump({"agents": [{"name": "referee", "shirt": "#c92a2a"},
                                  {"name": "eski-agent", "shirt": "#000"}]}, f)
        for name, body in (("referee", "---\nname: referee\ndescription: Hakem: karar verir\nmodel: opus\n---\n"),
                           ("grafik-tasarimci", "---\nname: grafik-tasarimci\ndescription: >\n  Figür ve\n  şemalar\n---\n")):
            with open(os.path.join(server.AGENTS_DIR, name + ".md"), "w") as f:
                f.write(body)

    def tearDown(self):
        server.LAYOUT, server.AGENTS, server.AGENTS_DIR = self.saved
        self.d.cleanup()

    def test_layout(self):
        st, h, body = self.get("/api/layout")
        self.assertIn("application/json", h["Content-Type"])
        self.assertEqual(json.loads(body)["desks"], {"d1": "referee"})

    def test_agents_merge(self):
        agents = {a["name"]: a for a in json.loads(self.get("/api/agents")[2])["agents"]}
        r = agents["referee"]
        self.assertEqual((r["description"], r["model"], r["desk"], r["unassigned"]), ("Hakem: karar verir", "opus", "d1", False))
        g = agents["grafik-tasarimci"]   # tanımlı ama görünüş/masa yok
        self.assertTrue(g["unassigned"])
        self.assertEqual(g["description"], "Figür ve şemalar")
        e = agents["eski-agent"]         # görünüşü var, masası yok, .md yok
        self.assertTrue(e["unassigned"])
        self.assertFalse(e["defined"])

    def test_real_files_parse(self):
        server.LAYOUT, server.AGENTS, server.AGENTS_DIR = self.saved
        layout = json.loads(self.get("/api/layout")[2])
        agents = json.loads(self.get("/api/agents")[2])["agents"]
        assigned = {a["name"] for a in agents if not a["unassigned"]}
        self.assertEqual(assigned, set(layout["desks"].values()))
        ids = {i["id"] for i in layout["items"]}
        self.assertEqual(len(ids), len(layout["items"]), "eşya id'leri benzersiz olmalı")
        self.assertTrue(set(layout["desks"]) <= ids)


class Activity(unittest.TestCase):
    """activity(): Manager meşgul mü, hangi alt agent'lar bitmedi."""
    def evs(self, *rows):
        return [json.loads(ev(*r[:2], **(r[2] if len(r) > 2 else {}))) for r in rows]

    def test_turn_and_subagents(self):
        sub = lambda i, t: {"agent": {"agent_id": i, "agent_type": t}, "agent_type": t}
        e = self.evs(("SessionStart", "M", {"source": "startup"}), ("UserPromptSubmit", "M"))
        self.assertTrue(server.activity(e, "M")["busy"])
        e += self.evs(("SubagentStart", "M", sub("a1", "referee")), ("SubagentStart", "M", sub("a2", "professor-lit")),
                      ("SubagentStop", "M", sub("a1", "referee")), ("Stop", "M"))
        a = server.activity(e, "M")
        self.assertFalse(a["busy"])
        self.assertEqual([s["agent_type"] for s in a["subagents"]], ["professor-lit"])  # arka planda sürüyor
        e += self.evs(("SubagentStop", "M", sub("a2", "professor-lit")))
        self.assertEqual(server.activity(e, "M")["subagents"], [])

    def test_other_sessions_and_reset(self):
        e = self.evs(("SessionStart", "M", {"source": "startup"}), ("UserPromptSubmit", "M"),
                     ("UserPromptSubmit", "DEV"),                       # geliştirme oturumu karışmaz
                     ("SessionStart", "M", {"source": "compact"}))       # sıkıştırma sınır değil
        self.assertTrue(server.activity(e, "M")["busy"])
        self.assertFalse(server.activity(e + self.evs(("Stop", "M")), "M")["busy"])
        e += self.evs(("SessionStart", "M", {"source": "resume"}))       # yeniden açılış sıfırlar
        self.assertFalse(server.activity(e, "M")["busy"])
        self.assertEqual(server.activity([], None), {"session_id": None, "busy": False, "subagents": []})

    def test_latest_session_fallback(self):
        e = self.evs(("SessionStart", "A", {"source": "startup"}), ("SessionStart", "B", {"source": "startup"}),
                     ("UserPromptSubmit", "B"))
        a = server.activity(e)
        self.assertEqual((a["session_id"], a["busy"]), ("B", True))


class Status(ServerBase):
    def setUp(self):
        self.saved = (server.manager_process, server.read_manager_session, server.start_manager)
        self.running = True
        server.manager_process = lambda *a: {"session": True, "running": self.running}
        server.read_manager_session = lambda *a: "M"
        self.calls = []
        server.start_manager = lambda: (self.calls.append(1), (200, {"ok": True, "action": "started"}))[1]

    def tearDown(self):
        server.manager_process, server.read_manager_session, server.start_manager = self.saved

    def status(self):
        return json.loads(self.get("/api/status")[2])

    def test_status(self):
        self.write_events([ev("SessionStart", "M", source="startup"), ev("UserPromptSubmit", "M")])
        st = self.status()
        self.assertTrue(st["manager_running"] and st["manager_busy"] and st["busy"])
        self.running = False                       # claude yoksa meşgul sayılmaz
        st = self.status()
        self.assertFalse(st["manager_running"] or st["busy"])

    def post(self, headers):
        req = urllib.request.Request(self.url("/api/manager/start"), data=b"", method="POST", headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=5) as r:
                return r.status
        except urllib.error.HTTPError as e:
            return e.code

    def test_write_guard(self):
        body = self.get("/")[2].decode()
        token = body.split('name="office-token" content="')[1].split('"')[0]
        self.assertEqual(token, server.TOKEN)
        host = "127.0.0.1:%d" % self.port
        good = {"Host": host, "Origin": "http://" + host, "X-Office-Token": token}
        for bad in ({**good, "X-Office-Token": "yanlis"}, {k: v for k, v in good.items() if k != "X-Office-Token"},
                    {**good, "Origin": "http://evil.example"}, {k: v for k, v in good.items() if k != "Origin"},
                    {**good, "Host": "evil.example:%d" % self.port}):
            self.assertEqual(self.post(bad), 403, bad)
        self.assertEqual(self.calls, [])
        self.assertEqual(self.post(good), 200)
        self.assertEqual(self.calls, [1])


if __name__ == "__main__":
    unittest.main()
