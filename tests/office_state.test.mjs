// office/static/state.js: agent kimliği, bilinmeyen agent, sessiz replay.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AG, KEYS, S, hooks, ingest, initAgents, resetAll, itemOn, upd } from '../office/static/state.js';
import { setGrid } from '../office/static/scene/pathfind.js';

const layout = JSON.parse(readFileSync(new URL('../office/layout.json', import.meta.url)));
const looks = JSON.parse(readFileSync(new URL('../office/agents.json', import.meta.url))).agents;
const fed = [];
hooks.feed = (a, ev, msg) => fed.push({ a, n: ev.hook_event_name, msg });
const warnings = [];
console.warn = m => warnings.push(String(m));

beforeEach(() => {
  setGrid(layout); initAgents(layout, looks); resetAll(); fed.length = 0; warnings.length = 0; S.live = false;
});

test('masası olan agentlar kurulur, Manager ilk sırada', () => {
  assert.deepEqual(KEYS, ['manager', 'software-researcher', 'professor-lit', 'professor-writer', 'referee']);
  const near = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 1e-9);
  assert.ok(near(AG['professor-lit'].seat, [1.4, 8.3]));   // masadan türetilen oturma noktası
  assert.ok(near(AG.manager.seat, [2.5, 0.95]));
});

test('agent_type tam adla eşleşir; alt dize eşleşmesi yok', () => {
  ingest({ hook_event_name: 'SubagentStart', agent_type: 'referee' });
  assert.equal(AG.referee.q.at(-1).v, 'working');
  ingest({ hook_event_name: 'PreToolUse', agent_type: 'my-referee-helper', tool_name: 'Read', tool_input: { file_path: 'a' } });
  assert.equal(fed.at(-1).a, 'my-referee-helper');         // akışta görünür
  assert.equal(AG['my-referee-helper'], undefined);        // ofiste yok
  assert.ok(warnings.some(w => w.includes('my-referee-helper')));
});

test("agent_type olmayan olay Manager'a ait (alt agent çalışırken bile)", () => {
  ingest({ hook_event_name: 'SubagentStart', agent_type: 'software-researcher' });
  ingest({ hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: { file_path: 'x' } });
  assert.equal(fed.at(-1).a, 'manager');
});

test("bilinmeyen alt agent'a delegasyon panoya düşer, animasyon yok", () => {
  ingest({ hook_event_name: 'PreToolUse', tool_name: 'Agent', tool_input: { subagent_type: 'Explore', description: 'ara' } });
  assert.equal(S.tasks.at(-1).a, 'Explore');
  assert.equal(AG.manager.q.length, 0);
});

test('eski olaylar sessiz işlenir: kuyruk yok, durum doğrudan', () => {
  S.live = true;
  const old = new Date(Date.now() - 60000).toISOString();
  ingest({ hook_event_name: 'PreToolUse', tool_name: 'Agent', timestamp: old, tool_input: { subagent_type: 'referee', description: 'hakem' } });
  ingest({ hook_event_name: 'SubagentStart', agent_type: 'referee', timestamp: old });
  assert.equal(AG.manager.q.length, 0);
  assert.equal(AG.referee.state, 'working');
  assert.equal(S.tasks.at(-1).st, 'çalışıyor');
});

test('masa ışığı atanan agent çalışınca yanar; server rack bağlı masayı izler', () => {
  const items = Object.fromEntries(layout.items.map(i => [i.id, i]));
  assert.equal(itemOn(items['desk-sr']), false);
  AG['software-researcher'].state = 'working';
  assert.equal(itemOn(items['desk-sr']), true);
  assert.equal(itemOn(items['server-rack']), true);
  assert.equal(itemOn(items['desk-lit']), false);
});

test('canlı modda token tahmini yok', () => {
  S.estimateTokens = false;
  ingest({ hook_event_name: 'PreToolUse', agent_type: 'referee', tool_name: 'Read' });
  assert.equal(AG.referee.tok, 0);
  ingest({ hook_event_name: 'SubagentStop', agent_type: 'referee', tokens: 1234 });
  assert.equal(AG.referee.tok, 1234);
});

test('demo akışı baştan sona: herkes masasına döner, hedefler eşya içinde değil', async () => {
  const { DEMO_EVENTS } = await import('../office/static/demo.js');
  const { obstaclesOf } = await import('../office/static/scene/furniture.js');
  const rects = layout.items.flatMap(obstaclesOf);
  for (const k of KEYS) AG[k].bub = { textContent: '' };
  const visited = [];
  const step = dt => KEYS.forEach(k => { const a = AG[k]; if (a.q[0]?.t === 'walk') visited.push([a.q[0].x, a.q[0].y, k]); upd(a, dt); });
  for (const [d, ev] of DEMO_EVENTS) { for (let t = 0; t < d / 1000; t += 0.05) step(0.05); ingest({ ...ev }); }
  for (let t = 0; t < 30; t += 0.05) step(0.05);
  for (const k of KEYS) {
    const a = AG[k];
    assert.equal(a.q.length, 0, `${k} kuyruğu boşalmalı`);
    assert.ok(Math.hypot(a.x - a.seat[0], a.y - a.seat[1]) < 1e-6, `${k} masasında olmalı`);
    assert.equal(a.state, 'idle');
  }
  assert.ok(visited.length > 10, 'yürüyüş olmalı');
  const seats = KEYS.map(k => AG[k].seat);
  for (const [x, y, k] of visited) {
    if (seats.some(s => Math.hypot(x - s[0], y - s[1]) < 0.5)) continue; // kendi sandalyesi
    for (const [rx, ry, rw, rd] of rects) assert.ok(!(x > rx && x < rx + rw && y > ry && y < ry + rd), `${k} hedefi (${x}, ${y}) eşya içinde`);
  }
  assert.deepEqual(S.tasks.map(t => t.st), ['bitti', 'bitti', 'bitti', 'bitti', 'bitti']);
});
