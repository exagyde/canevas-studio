import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parsePaYaml, serializeComponents } from '../lib/pa/yaml.js';
import { Runtime } from '../lib/runtime/runtime.js';
import { findByName } from '../lib/project/model.js';
import { defOf } from '../lib/project/helpers.js';
import { validateProject } from '../lib/validation/validate.js';

const FIXTURE = 'tests/fixtures/composant-modal.pa.yaml';

const SCREEN = `Screens:
  Ecran:
    Properties:
      Fill: =RGBA(255, 255, 255, 1)
    Children:
      - Modal_1:
          Control: CanvasComponent
          ComponentName: Modal
          Properties:
            Height: =Parent.Height
            OnConfirm: =Set(confirme, true)
            Title: ="Supprimer la demande ?"
            Width: =Parent.Width
      - lblResultat:
          Control: Text@0.0.51
          Properties:
            Text: =Modal_1.Title & " / " & Modal_1.Message
`;

function makeProject(extraComponentYaml) {
  const comps = parsePaYaml(readFileSync(FIXTURE, 'utf8')).components;
  if (extraComponentYaml) comps.push(...parsePaYaml(extraComponentYaml).components);
  const screens = parsePaYaml(SCREEN).screens;
  return { id: 'p', name: 'test', settings: { width: 1366, height: 768 }, app: { _id: 'a1', name: 'App', head: {}, properties: {} }, screens, components: comps, dataSources: [], flows: [] };
}

function build(project) {
  const rt = new Runtime();
  rt.setProject(project);
  const root = rt.build(project.screens[0].name);
  return { rt, root, inst: rt.reg.get('Modal_1') };
}

test('composant : lecture et aller-retour YAML identique', () => {
  const text = readFileSync(FIXTURE, 'utf8').replace(/\r\n/g, '\n');
  const res = parsePaYaml(text);
  assert.equal(res.errors.length, 0, JSON.stringify(res.errors));
  assert.equal(res.components.length, 1);
  assert.deepEqual(Object.keys(res.components[0].customProperties), ['Description', 'Message', 'OnCancel', 'OnConfirm', 'Title']);
  assert.equal(serializeComponents(res.components), text);
});

test('instance : rendu avec les valeurs de l’instance et les valeurs par défaut', () => {
  const { rt, inst } = build(makeProject());
  assert.equal(rt.runtimeErrors.size, 0, JSON.stringify([...rt.runtimeErrors.values()]));
  assert.ok(inst.componentRoot, 'la définition est résolue');
  assert.deepEqual([inst.layout.w, inst.layout.h], [1366, 768]);
  const inner = inst.componentRoot.byName;
  assert.equal(inner.get('lbl_ModalTitle').get('Text'), 'Supprimer la demande ?');
  assert.equal(inner.get('lbl_ModalDescription').get('Text'), 'Texte', 'Message garde sa valeur par défaut');
  // Parent.Width à l'intérieur du composant = largeur de l'instance
  assert.equal(inner.get('con_Modal').layout.w, 1366);
  assert.equal(inner.get('con_ModalContent').layout.x, 1366 / 2 - 550 / 2);
  // lecture depuis l'application
  assert.equal(rt.reg.get('lblResultat').get('Text'), 'Supprimer la demande ? / Texte');
});

test('instance : un événement du composant exécute la formule de l’instance', async () => {
  const { rt, inst } = build(makeProject());
  await rt.runBehavior(inst.componentRoot.byName.get('btn_ModalConfirm'), 'OnSelect');
  assert.equal(rt.globals.get('confirme'), true);
  // OnCancel non défini sur l'instance : valeur par défaut vide, sans erreur
  await rt.runBehavior(inst.componentRoot.byName.get('btn_ModalCancel'), 'OnSelect');
  assert.equal(rt.notifications.length, 0);
});

const EXTRA = `ComponentDefinitions:
  Compteur:
    DefinitionType: CanvasComponent
    CustomProperties:
      Total:
        PropertyKind: Output
        DisplayName: Total
        Description: Propriété personnalisée
        DataType: Number
      Double:
        PropertyKind: OutputFunction
        DisplayName: Double
        Description: Propriété personnalisée
        ReturnType: Number
        Parameters:
          - Valeur:
              DataType: Number
      OnChoix:
        PropertyKind: Event
        DisplayName: OnChoix
        Description: Propriété personnalisée
        ReturnType: None
        Parameters:
          - Choix:
              DataType: Text
        Default: =
    Properties:
      Double: =Valeur * 2
      Height: =100
      Total: =2 + 3
      Width: =200
    Children:
      - btnChoisir:
          Control: Button@0.0.45
          Properties:
            OnSelect: =Compteur.OnChoix("bleu")
`;

test('propriétés de sortie, fonctions et événements avec paramètres', async () => {
  const p = makeProject(EXTRA);
  p.screens[0].children.push(
    parsePaYaml(`- Compteur_1:
    Control: CanvasComponent
    ComponentName: Compteur
    Properties:
      OnChoix: =Set(couleur, Choix)
`).controls[0],
  );
  const { rt } = build(p);
  const c = rt.reg.get('Compteur_1');
  assert.deepEqual([c.layout.w, c.layout.h], [200, 100], 'taille par défaut = taille du composant');
  assert.equal(rt.evaluateFor(rt.reg.get('lblResultat'), '=Compteur_1.Total').value, 5);
  assert.equal(rt.evaluateFor(rt.reg.get('lblResultat'), '=Compteur_1.Double(21)').value, 42);
  await rt.runBehavior(c.componentRoot.byName.get('btnChoisir'), 'OnSelect');
  assert.equal(rt.globals.get('couleur'), 'bleu');
  assert.deepEqual(
    validateProject(p).filter((i) => i.severity !== 'info'),
    [],
    'paramètres reconnus dans les formules',
  );
});

test('un composant qui s’inclut lui-même est rendu en espace réservé', () => {
  const p = makeProject();
  const comp = p.components[0];
  comp.children = [...comp.children, { _id: 'x', name: 'Modal_boucle', head: { Control: 'CanvasComponent', ComponentName: 'Modal' }, properties: {}, children: null }];
  const { inst } = build(p);
  assert.ok(inst.componentRoot.byName.get('Modal_boucle').componentCycle);
  assert.ok(validateProject(p).some((i) => i.code === 'component-cycle'));
});

test('validation d’une instance', () => {
  const p = makeProject();
  const inst = findByName(p, 'Modal_1').node;
  assert.equal(defOf(inst, 'control', p).defaults.Message, '="Texte"');
  assert.deepEqual(
    validateProject(p).filter((i) => i.severity !== 'info'),
    [],
  );
  // propriété inconnue sur une instance, membre inexistant
  inst.properties.Titre = '="x"';
  p.screens[0].children[1].properties.Text = '=Modal_1.Titre';
  const issues = validateProject(p);
  assert.ok(issues.some((i) => i.code === 'unknown-property' && i.property === 'Titre'));
  assert.ok(issues.some((i) => i.code === 'unknown-member'));
});
