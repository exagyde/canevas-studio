import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { diffLines, diffStats, foldDiff } from '../lib/diff/lineDiff.js';
import { findControlBlock, findPropertyLine, controlAtLine } from '../lib/pa/yamlLocate.js';
import { parsePaYaml, serializeScreens } from '../lib/pa/yaml.js';

const sign = (ops) => ops.map((o) => (o.type === 'eq' ? ' ' : o.type === 'add' ? '+' : '-') + o.text);

test('comparaison ligne à ligne', () => {
  assert.deepEqual(sign(diffLines('a\nb\nc\nd', 'a\nx\nc\nd\ne')), [' a', '-b', '+x', ' c', ' d', '+e']);
  assert.deepEqual(sign(diffLines('', 'a\nb')), ['+a', '+b']);
  assert.deepEqual(diffStats(diffLines('a\nb\n', 'a\nb')), { added: 0, removed: 0, changed: false });
  // reconstruction des deux textes sur des cas aléatoires
  for (let t = 0; t < 200; t++) {
    const r = () => Array.from({ length: Math.floor(Math.random() * 25) }, () => `l${Math.floor(Math.random() * 5)}`).join('\n');
    const a = r();
    const b = r();
    const ops = diffLines(a, b);
    assert.equal(ops.filter((o) => o.type !== 'add').map((o) => o.text).join('\n'), a);
    assert.equal(ops.filter((o) => o.type !== 'del').map((o) => o.text).join('\n'), b);
  }
});

test('modification d’une formule dans un écran : diff minimal et contexte replié', () => {
  const screens = parsePaYaml(readFileSync('tests/fixtures/ecran-fiche.pa.yaml', 'utf8')).screens;
  const before = serializeScreens(screens);
  const after = before.replace('Text: ="Fiche compte"', 'Text: ="Fiche du compte"');
  assert.notEqual(before, after);
  const ops = diffLines(before, after);
  assert.deepEqual(diffStats(ops), { added: 1, removed: 1, changed: true });
  const rows = foldDiff(ops, 3);
  assert.ok(rows.some((r) => r.type === 'skip'));
  assert.ok(rows.length < 20);
});

test('repérage des contrôles dans le YAML', () => {
  const text = readFileSync('tests/fixtures/ecran-demandes.pa.yaml', 'utf8').replace(/\r\n/g, '\n');
  const lines = text.split('\n');
  const block = findControlBlock(text, 'cmpConfirmation');
  assert.match(lines[block.from - 1], /- cmpConfirmation:$/);
  assert.equal(block.to, lines.length - (text.endsWith('\n') ? 1 : 0));
  assert.match(lines[findPropertyLine(text, 'cmpConfirmation', 'OnConfirm') - 1], /^\s+OnConfirm: \|-$/);
  assert.equal(controlAtLine(text, block.from + 5), 'cmpConfirmation');
  assert.equal(controlAtLine(text, 1), null);
  assert.equal(findControlBlock(text, 'inexistant'), null);
});
