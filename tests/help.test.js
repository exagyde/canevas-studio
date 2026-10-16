import { test } from 'node:test';
import assert from 'node:assert/strict';
import { placeCard, helpKeys, STUDIO_TOUR } from '../lib/help/tour.js';
import { MESSAGES, LOCALES } from '../lib/i18n/index.js';

const VIEW = { width: 1280, height: 720 };
const CARD = { width: 340, height: 180 };

test('prise en main : chaque texte existe dans toutes les langues', () => {
  const keys = helpKeys();
  assert.ok(keys.length > 30);
  for (const locale of LOCALES) {
    const missing = keys.filter((k) => typeof MESSAGES[locale].help?.[k] !== 'string');
    assert.deepEqual(missing, [], locale);
  }
  assert.deepEqual(
    STUDIO_TOUR.map((s) => s.target),
    ['paste', 'views', 'ai', 'copy', 'help'],
  );
});

test('visite guidée : bulle sous un bouton de la barre de commandes, recadrée dans la fenêtre', () => {
  // bouton en haut à droite : en dessous, sans dépasser du bord droit
  const p = placeCard({ left: 1180, top: 6, right: 1270, bottom: 40 }, CARD, VIEW);
  assert.equal(p.side, 'bottom');
  assert.equal(p.top, 52);
  assert.equal(p.left, VIEW.width - 12 - CARD.width);
  // bouton en haut à gauche : en dessous, centré sur le bouton puis recadré à gauche
  assert.deepEqual(placeCard({ left: 0, top: 0, right: 60, bottom: 40 }, CARD, VIEW), { left: 12, top: 52, side: 'bottom' });
});

test('visite guidée : volet pleine hauteur à droite → bulle à gauche ; sans cible → centrée', () => {
  const p = placeCard({ left: 900, top: 48, right: 1280, bottom: 720 }, CARD, VIEW);
  assert.equal(p.side, 'left');
  assert.equal(p.left, 900 - 12 - CARD.width);
  assert.equal(p.top, (48 + 720) / 2 - CARD.height / 2);
  assert.equal(placeCard(null, CARD, VIEW).side, 'center');
  // cible occupant tout l'écran : aucune place autour
  assert.equal(placeCard({ left: 0, top: 0, right: 1280, bottom: 720 }, CARD, VIEW).side, 'center');
});
