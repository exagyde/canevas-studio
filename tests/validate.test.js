import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parsePaYaml } from '../lib/pa/yaml.js';
import { validateProject, summarize } from '../lib/validation/validate.js';

for (const file of ['tests/fixtures/ecran-demandes.pa.yaml', 'tests/fixtures/ecran-fiche.pa.yaml']) {
  test(`validation ${file}`, () => {
    const res = parsePaYaml(readFileSync(file, 'utf8'));
    const project = { screens: res.screens, components: [], dataSources: [], flows: [], app: { name: 'App', head: {}, properties: {} } };
    const issues = validateProject(project);
    const s = summarize(issues);
    console.log(file, s);
    const byCode = {};
    for (const i of issues) (byCode[i.code] ||= []).push(`${i.controlName}.${i.property ?? ''}: ${i.message}`);
    for (const [k, v] of Object.entries(byCode)) console.log(`  ${k} (${v.length})`, v.slice(0, 6));
    assert.equal(s.error, 0);
  });
}

test('détection des erreurs', () => {
  const yaml = `Screens:\n  S1:\n    Children:\n      - btn:\n          Control: Classic/Button@2.2.0\n          Properties:\n            Text: "Bonjour"\n            OnSelect: =Set(x, 1\n            Fill: =If(true)\n            Visible: =Navigate(S1)\n      - btn:\n          Control: Classic/Button@2.2.0\n`;
  const res = parsePaYaml(yaml);
  const issues = validateProject({ screens: res.screens, components: [], dataSources: [], flows: [] });
  const codes = issues.map((i) => i.code);
  assert.ok(codes.includes('missing-equals'));
  assert.ok(codes.includes('syntax'));
  assert.ok(codes.includes('arity'));
  assert.ok(codes.includes('behavior-in-data'));
  assert.ok(codes.includes('duplicate-name'));
});
