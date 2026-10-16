import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { MESSAGES, LOCALES, SOURCE_LOCALE, translate, matchLocale, localeFromCookie } from '../lib/i18n/index.js';

const placeholders = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
const forms = (v) => (v && typeof v === 'object' ? Object.values(v) : [v]);
// paramètres d'un texte (pluriels : réunion des formes, sans « count » que la forme « one » peut omettre)
const params = (v) => [...new Set(forms(v).flatMap(placeholders))].filter((p) => typeof v !== 'object' || p !== 'count').sort();

test('traductions : mêmes clés, mêmes paramètres et aucun texte vide dans chaque langue', () => {
  const src = MESSAGES[SOURCE_LOCALE];
  for (const locale of LOCALES) {
    const msgs = MESSAGES[locale];
    assert.deepEqual(Object.keys(msgs).sort(), Object.keys(src).sort(), `${locale} : domaines`);
    for (const ns of Object.keys(src)) {
      const want = Object.keys(src[ns]);
      const have = Object.keys(msgs[ns]);
      assert.deepEqual(have.filter((k) => !want.includes(k)), [], `${locale}.${ns} : clés absentes du français`);
      assert.deepEqual(want.filter((k) => !have.includes(k)), [], `${locale}.${ns} : clés non traduites`);
      for (const k of want) {
        const sv = src[ns][k];
        const tv = msgs[ns][k];
        assert.equal(typeof tv, typeof sv, `${locale}.${ns}.${k} : texte simple ou pluriel`);
        if (typeof sv === 'object') assert.ok(typeof tv.other === 'string', `${locale}.${ns}.${k} : forme « other » manquante`);
        for (const f of forms(tv)) assert.ok(typeof f === 'string' && f.trim(), `${locale}.${ns}.${k} : texte vide`);
        assert.deepEqual(params(tv), params(sv), `${locale}.${ns}.${k} : paramètres différents du français`);
      }
    }
  }
});

test('traductions : chaque clé écrite dans le code existe', () => {
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) {
        if (name !== 'messages') walk(p);
      } else if (name.endsWith('.js')) files.push(p);
    }
  };
  ['app', 'components', 'lib'].forEach(walk);
  const missing = [];
  let count = 0;
  // t('domaine.clé'…), rich('domaine.clé'…), translate(langue, 'domaine.clé'…)
  const re = /(?:\b(?:t|rich)\(\s*|\btranslate\([^,()]+,\s*)['"]([a-z]+\.[A-Za-z0-9_.]+)['"]/g;
  for (const f of files) {
    const text = readFileSync(f, 'utf8');
    for (const m of text.matchAll(re)) {
      count++;
      const [ns, ...rest] = m[1].split('.');
      if (MESSAGES[SOURCE_LOCALE][ns]?.[rest.join('.')] === undefined) missing.push(`${f} : ${m[1]}`);
    }
  }
  assert.ok(count > 0);
  assert.deepEqual(missing, []);
});

test('traductions : paramètres, pluriels, repli et choix de la langue', () => {
  assert.equal(translate('en', 'common.close'), 'Close');
  assert.equal(translate('es', 'common.close'), 'Cerrar');
  assert.equal(translate('en', 'inconnu.cle'), 'inconnu.cle');
  assert.equal(matchLocale('es-MX,es;q=0.9,en;q=0.8'), 'es');
  assert.equal(matchLocale(['de-DE', 'fr-CA']), 'fr');
  assert.equal(matchLocale('de-DE,ja'), 'en');
  assert.equal(localeFromCookie('a=1; lang=es; b=2'), 'es');
  assert.equal(localeFromCookie('lang=de'), null);
});
