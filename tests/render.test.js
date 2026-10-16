import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parsePaYaml } from '../lib/pa/yaml.js';
import { Runtime } from '../lib/runtime/runtime.js';

function projectFrom(file) {
  const res = parsePaYaml(readFileSync(file, 'utf8'));
  return { id: 'p', name: 'test', settings: { width: 1366, height: 768 }, app: { name: 'App', head: {}, properties: {} }, screens: res.screens, components: [], dataSources: [], flows: [] };
}

function build(file) {
  const rt = new Runtime();
  const p = projectFrom(file);
  rt.setProject(p);
  const root = rt.build(p.screens[0].name);
  return { rt, root };
}

test('disposition automatique : écran des demandes', () => {
  const { rt, root } = build('tests/fixtures/ecran-demandes.pa.yaml');
  assert.equal(rt.runtimeErrors.size, 0, JSON.stringify([...rt.runtimeErrors.values()]));
  // largeur fixe Max(250, Parent.Width / 4), hauteur étirée par défaut dans un conteneur horizontal
  const liste = rt.reg.get('conListe');
  assert.equal(Math.round(liste.layout.w), 342);
  assert.equal(Math.round(liste.layout.h), 768);
  // un conteneur enfant s'étire en largeur malgré LayoutAlignItems.Center du parent
  assert.equal(Math.round(rt.reg.get('conAutres').layout.w), 342);
  // LayoutMinHeight ne s'applique pas à un enfant de taille fixe
  assert.equal(rt.reg.get('shpSeparateur').layout.h, 1);
  // le conteneur de détails prend l'espace restant (FillPortions par défaut)
  assert.equal(rt.reg.get('conDetails').layout.w, 1366 - 1366 / 4);
  // la galerie ne garde pas les LookUp vides de sa table littérale
  assert.equal(rt.reg.get('galModeles').items.length, 0);
  // Visible renvoyant Blank masque le composant
  assert.equal(root.children.find((c) => c.name === 'cmpConfirmation').visible, false);
});

test('disposition et formulaire : écran fiche compte', () => {
  const { rt, root } = build('tests/fixtures/ecran-fiche.pa.yaml');
  assert.ok(root.children.length > 0);
  assert.equal(rt.reg.get('conMenu').layout.w, 200);
  const form = rt.reg.get('frmCompte');
  assert.equal(form.children.length, 2);
  // cartes empilées (Y = ligne 0 puis 1)
  assert.equal(rt.reg.get('dcNom').layout.y, 0);
  assert.ok(rt.reg.get('dcContact').layout.y > 0);
  // Parent.DisplayName dans une carte
  assert.equal(rt.reg.get('lblContactTitre').get('Text'), 'Nom et prénom du contact');
  // bouton désactivé tant que les champs sont vides (Or() en forme fonction)
  assert.equal(rt.reg.get('btnEnregistrer').get('DisplayMode').name, 'Disabled');
});
