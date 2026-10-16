import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parsePaYaml, serializeScreens, serializeControls } from '../lib/pa/yaml.js';
import { parseFormula } from '../lib/fx/parser.js';

const fixtures = ['tests/fixtures/ecran-demandes.pa.yaml', 'tests/fixtures/ecran-fiche.pa.yaml'];

function* allNodes(nodes) {
  for (const n of nodes || []) {
    yield n;
    yield* allNodes(n.children);
  }
}

for (const file of fixtures) {
  test(`aller-retour YAML identique : ${file}`, () => {
    const text = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
    const res = parsePaYaml(text);
    assert.equal(res.errors.length, 0, JSON.stringify(res.errors));
    assert.equal(res.screens.length, 1);
    const out = serializeScreens(res.screens);
    const a = text.trimEnd().split('\n');
    const b = out.trimEnd().split('\n');
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      if (a[i] !== b[i]) assert.fail(`Différence ligne ${i + 1}:\n  attendu: ${JSON.stringify(a[i])}\n  obtenu : ${JSON.stringify(b[i])}`);
    }
  });

  test(`toutes les formules se parsent : ${file}`, () => {
    const text = readFileSync(file, 'utf8');
    const res = parsePaYaml(text);
    const failures = [];
    for (const s of res.screens) {
      for (const n of [s, ...allNodes(s.children)]) {
        for (const [k, v] of Object.entries(n.properties)) {
          const r = parseFormula(v);
          if (r.error) failures.push(`${n.name}.${k}: ${r.error.message} @${r.error.start} :: ${v.slice(Math.max(0, r.error.start - 20), r.error.end + 20)}`);
        }
      }
    }
    assert.deepEqual(failures, []);
  });
}

test('extrait de contrôles', () => {
  const snippet = `- btn_Test:\n    Control: Button@0.0.45\n    Properties:\n      OnSelect: |-\n        =UpdateContext({ a: 1 })\n      Text: ="Ok"\n`;
  const res = parsePaYaml(snippet);
  assert.equal(res.kind, 'controls');
  assert.equal(res.controls[0].name, 'btn_Test');
  assert.equal(serializeControls(res.controls), snippet);
});
