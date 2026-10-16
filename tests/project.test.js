import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parsePaYaml } from '../lib/pa/yaml.js';
import { createProject, findByName, renameInFormula, cloneWithNewIds, applyRenames, allNames } from '../lib/project/model.js';
import { analyzeYamlBlock, applyControlsInsert, applyControlReplace, applyTableData, splitBlocks, directiveOf, changePreview, formulaTarget } from '../lib/ai/apply.js';
import { inferMissingSources } from '../lib/data/infer.js';

test('assistant : cible d’une formule annoncée avant le bloc', () => {
  const p = sampleProject();
  // typographie française (espace avant les deux-points), gras, deux-points collés
  for (const line of ['`btnRafraichir.OnSelect` :', '**btnRafraichir.OnSelect**', 'Nouvelle formule de btnRafraichir.OnSelect:']) {
    assert.deepEqual(formulaTarget(`Voici la modification.\n${line}`, p), { control: 'btnRafraichir', prop: 'OnSelect' }, line);
  }
  assert.equal(formulaTarget('`inconnu.OnSelect` :', p), null);
});

test('assistant : un écran au nom nouveau est ajouté, pas substitué à l’écran courant', () => {
  const p = sampleProject();
  const a = analyzeYamlBlock('Screens:\n  Liste:\n    Children:\n      - lblListe:\n          Control: Text@0.0.51\n          Properties:\n            Text: ="Liste"\n', p, p.screens[0]._id);
  const preview = changePreview(p, a, p.screens[0]._id);
  assert.equal(preview.action, 'add-screen');
  assert.equal(preview.before, '');
  // la validation ne considère pas l'écran courant comme remplacé
  assert.ok(!a.issues.some((i) => /EcranDemandes/.test(i.message)));
  const same = analyzeYamlBlock(`Screens:\n  ${p.screens[0].name}:\n    Children: []\n`, p, p.screens[0]._id);
  assert.equal(changePreview(p, same, p.screens[0]._id).action, 'replace-screen');
});

function sampleProject() {
  const res = parsePaYaml(readFileSync('tests/fixtures/ecran-demandes.pa.yaml', 'utf8'));
  return createProject('test', { screens: res.screens });
}

test('collage : contrôles renommés et références mises à jour', () => {
  assert.equal(renameInFormula('=Select(btnCalculs); btnCalculs.Text & {btnCalculs: 1}.x', new Map([['btnCalculs', 'btnFn']])), '=Select(btnFn); btnFn.Text & {btnCalculs: 1}.x');
  const p = sampleProject();
  const src = findByName(p, 'btnCalculs').node;
  const map = new Map();
  const copy = applyRenames(cloneWithNewIds({ ...src, properties: { ...src.properties, OnSelect: '=Select(btnCalculs)' } }, allNames(p), map), map);
  assert.equal(copy.name, 'btnCalculs1');
  assert.equal(copy.properties.OnSelect, '=Select(btnCalculs1)');
});

test('application des blocs de l’assistant IA', () => {
  const p = sampleProject();
  const text = 'Voici :\n```yaml\n# insert-into: conDetails\n- btnNouveau:\n    Control: ModernButton@1.0.0\n    Properties:\n      Text: ="OK"\n```\nFin';
  const blocks = splitBlocks(text);
  assert.equal(blocks.length, 3);
  assert.deepEqual(directiveOf(blocks[1].code), { kind: 'insert-into', target: 'conDetails' });
  const a = analyzeYamlBlock(blocks[1].code, p, p.screens[0]._id);
  assert.equal(a.parsed.kind, 'controls');
  assert.equal(a.summary.error, 0);
  const target = findByName(p, 'conDetails').node._id;
  const r = applyControlsInsert(p, a.parsed, target);
  assert.ok(findByName(r.project, 'btnNouveau'));

  const rep = parsePaYaml('- lblAucuneDemande:\n    Control: ModernText@1.0.0\n    Properties:\n      Text: ="Remplacé"\n');
  const r2 = applyControlReplace(p, rep, 'lblAucuneDemande');
  assert.equal(findByName(r2.project, 'lblAucuneDemande').node.properties.Text, '="Remplacé"');

  const r3 = applyTableData(p, 'Pays', '[{"Nom":"France"},{"Nom":"Belgique"}]');
  assert.equal(r3.project.dataSources.find((d) => d.name === 'Pays').rows.length, 2);
});

test('déduction des sources de données manquantes', () => {
  const p = sampleProject();
  const missing = inferMissingSources(p);
  const contacts = missing.find((m) => m.name === 'Contacts');
  assert.ok(contacts);
  assert.ok(contacts.columns.some((c) => c.name === 'Nom complet'));
  const msgs = missing.find((m) => m.name === 'Messages électroniques');
  assert.ok(msgs.columns.find((c) => c.name === "Statut d'activité").options.length >= 1);
});
