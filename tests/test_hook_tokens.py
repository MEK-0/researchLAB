"""log_event.py token sayımı: alt agent toplamı, tekrarlı mesajlar, Stop offset'i."""
import json
import os
import subprocess
import sys
import tempfile
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HOOK = os.path.join(ROOT, ".claude", "hooks", "log_event.py")


def asst(mid, inp, out, cc=0, cr=0, side=False):
    return json.dumps({"type": "assistant", "isSidechain": side, "message": {"id": mid, "usage": {
        "input_tokens": inp, "output_tokens": out,
        "cache_creation_input_tokens": cc, "cache_read_input_tokens": cr}}})


class HookTokens(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = self.tmp.name

    def tearDown(self):
        self.tmp.cleanup()

    def run_hook(self, payload):
        env = dict(os.environ, CLAUDE_PROJECT_DIR=self.root)
        subprocess.run([sys.executable, HOOK], input=json.dumps(payload), text=True, env=env, check=True)
        with open(os.path.join(self.root, "events", "events.jsonl")) as f:
            return json.loads(f.read().splitlines()[-1])

    def write(self, name, lines, mode="w"):
        p = os.path.join(self.root, name)
        with open(p, mode) as f:
            f.write("".join(l + "\n" for l in lines))
        return p

    def test_subagent_dedup(self):
        p = self.write("agent.jsonl", [
            json.dumps({"type": "user", "message": {"content": "x"}}),
            asst("m1", 10, 5, cc=100, cr=1000, side=True),
            asst("m1", 10, 5, cc=100, cr=1000, side=True),   # aynı mesajın ikinci satırı
            asst("m2", 3, 7, cr=50, side=True),
        ])
        ev = self.run_hook({"hook_event_name": "SubagentStop", "agent_type": "referee",
                            "agent_transcript_path": p})
        self.assertEqual(ev["tokens"], 10 + 5 + 100 + 3 + 7)
        self.assertEqual(ev["tokens_cache_read"], 1050)

    def test_stop_counts_only_new_part(self):
        p = self.write("main.jsonl", [asst("a", 1, 1), asst("b", 2, 2), asst("s", 50, 50, side=True)])
        ev = self.run_hook({"hook_event_name": "Stop", "transcript_path": p})
        self.assertEqual(ev["tokens"], 6)
        # ikinci tur: 'b'nin tekrar satırı + yeni 'c' + yarım satır
        self.write("main.jsonl", [asst("b", 2, 2), asst("c", 4, 4)], mode="a")
        with open(p, "a") as f:
            f.write(asst("d", 100, 100)[:20])  # henüz tamamlanmamış satır
        ev = self.run_hook({"hook_event_name": "Stop", "transcript_path": p})
        self.assertEqual(ev["tokens"], 8)
        # yarım satır tamamlanınca sayılır
        with open(p, "a") as f:
            f.write(asst("d", 100, 100)[20:] + "\n")
        ev = self.run_hook({"hook_event_name": "Stop", "transcript_path": p})
        self.assertEqual(ev["tokens"], 200)
        ev = self.run_hook({"hook_event_name": "Stop", "transcript_path": p})
        self.assertEqual(ev["tokens"], 0)

    def test_no_transcript_no_tokens(self):
        ev = self.run_hook({"hook_event_name": "PreToolUse", "tool_name": "Read"})
        self.assertNotIn("tokens", ev)
        ev = self.run_hook({"hook_event_name": "Stop", "transcript_path": "/yok.jsonl"})
        self.assertNotIn("tokens", ev)


if __name__ == "__main__":
    unittest.main()
