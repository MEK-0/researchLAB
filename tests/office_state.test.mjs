// office/static/state.js: agent kimliği, bilinmeyen agent, sessiz replay.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AG, KEYS, S, hooks, ingest, initAgents, resetAll, itemOn } from '../office/static/state.js';
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
