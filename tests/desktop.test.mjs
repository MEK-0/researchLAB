// desktop/src/logic.js: PATH, araç denetimi, repo doğrulama, açılış teşhisi, kapanış kararı.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { boundsVisible, describe, diagnose, exitDecision, mergePath, missingTools, parseMarked, validateRepo } from '../desktop/src/logic.js';

test('mergePath: sıra korunur, tekrar ve boşlar atılır', () => {
  assert.equal(mergePath('/usr/bin:/bin', '/opt/homebrew/bin::/usr/bin', '/x'), '/usr/bin:/bin:/opt/homebrew/bin:/x');
  assert.equal(parseMarked('rc gürültüsü\n__RESEARCHLAB__/a:/b__RESEARCHLAB__\n'), '/a:/b');
  assert.equal(parseMarked('işaret yok'), '');
});

test('missingTools: yalnızca PATH içindeki çalıştırılabilirler sayılır', () => {
  const d = mkdtempSync(join(tmpdir(), 'rl-'));
  for (const n of ['tmux', 'ttyd']) { writeFileSync(join(d, n), '#!/bin/sh\n'); chmodSync(join(d, n), 0o755); }
  writeFileSync(join(d, 'python3'), 'çalıştırılamaz'); // yürütme izni yok
  assert.deepEqual(missingTools(d).map(t => t.name), ['claude', 'python3']);
  assert.ok(missingTools(d).every(t => t.install));
});

test('validateRepo: office.sh yoksa ölümcül, CLAUDE.md/agents yoksa uyarı', () => {
  const d = mkdtempSync(join(tmpdir(), 'rl-'));
  assert.ok(validateRepo(join(d, 'yok')).fatal);
  assert.match(validateRepo(d).fatal, /office\.sh/);
  mkdirSync(join(d, 'office')); writeFileSync(join(d, 'office', 'office.sh'), '');
  assert.equal(validateRepo(d).warnings.length, 2);
  writeFileSync(join(d, 'CLAUDE.md'), ''); mkdirSync(join(d, '.claude', 'agents'), { recursive: true });
  assert.deepEqual(validateRepo(d), { fatal: null, warnings: [] });
  assert.deepEqual(validateRepo(new URL('..', import.meta.url).pathname), { fatal: null, warnings: [] }); // gerçek repo
});

const part = (alive, busy, owned) => ({ alive, port_busy: busy, owned });
test('diagnose: hangi parçanın başlamadığını söyler', () => {
  const st = { server: part(true, true, true), ttyd1: part(false, true, false), ttyd2: part(false, false, false), tmux: { 'researchlab-manager': true, 'researchlab-shell': false } };
  const d = diagnose(st, { server: true, ttyd1: true, ttyd2: false }, true);
  assert.equal(d.ready, false);
  const by = Object.fromEntries(d.parts.map(p => [p.key, p]));
  assert.ok(by.server.ok);
  assert.match(by.ttyd1.msg, /başka bir süreçte/);
  assert.match(by.ttyd2.msg, /çalışmıyor/);
  assert.equal(by['tmux:researchlab-shell'].ok, false);
  const ok = diagnose({ server: part(true, true, true), ttyd1: part(true, true, true), ttyd2: part(true, true, true) }, { server: true, ttyd1: true, ttyd2: true }, true);
  assert.equal(ok.ready, true);
  assert.equal(diagnose({ server: part(true, true, true), ttyd1: part(true, true, true), ttyd2: part(true, true, true) }, { server: true, ttyd1: true, ttyd2: true }, false).ready, false);
});

test('exitDecision: boştaysa kapat, çalışıyorsa ya da durum bilinmiyorsa sor', () => {
  assert.equal(exitDecision({ busy: false, manager_running: true }), 'stop');   // Manager boşta → kapat (onaylı)
  assert.equal(exitDecision({ busy: true }), 'ask');
  assert.equal(exitDecision(null, true), 'ask');
  assert.equal(exitDecision(null, false), 'stop');
  const d = describe({ busy: true, manager_running: true, manager_busy: false, active_subagents: [{ agent_type: 'referee' }] });
  assert.equal(d.short, 'çalışıyor');
  assert.ok(d.lines.some(l => l.includes('referee')));
});

test('boundsVisible: ekran dışı ya da çok küçük pencere reddedilir', () => {
  const disp = [{ x: 0, y: 25, width: 1512, height: 920 }];
  assert.ok(boundsVisible({ x: 100, y: 100, width: 1200, height: 800 }, disp));
  assert.ok(!boundsVisible({ x: 4000, y: 100, width: 1200, height: 800 }, disp));
  assert.ok(!boundsVisible({ x: 100, y: 100, width: 200, height: 100 }, disp));
  assert.ok(!boundsVisible(undefined, disp));
});
