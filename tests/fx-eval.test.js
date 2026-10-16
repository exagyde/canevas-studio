import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFormula, evaluateSync, evaluateAsync, FxColor, FxEnum, FxEnumNs, toText } from '../lib/fx/index.js';
import { findEnum } from '../lib/catalog/enums.js';

function makeHost(vars = {}) {
  const globals = new Map(Object.entries(vars));
  const collections = new Map();
  return {
    locale: 'fr-FR',
    resolveGlobal(name) {
      if (globals.has(name)) return { value: globals.get(name) };
      if (collections.has(name)) return { value: collections.get(name) };
      const e = findEnum(name);
      if (e || name === 'Color') return { value: new FxEnumNs(e || 'Color') };
      return null;
    },
    controlMember() {
      return null;
    },
    tableTarget(name, ctx, create) {
      if (collections.has(name) || create) return { kind: 'collection', name, rows: collections.get(name) || [] };
      return null;
    },
    collect(target, items, clear) {
      const rows = clear ? [] : [...(collections.get(target.name) || [])];
      rows.push(...items);
      collections.set(target.name, rows);
      return rows;
    },
    setGlobal(n, v) {
      globals.set(n, v);
    },
    globals,
    collections,
  };
}

const run = (f, vars, behavior = false) => {
  const host = makeHost(vars);
  const { ast, error } = parseFormula(f);
  if (error) throw new Error(error.message);
  return { value: evaluateSync(ast, { host, scopes: [], behavior }), host };
};

test('arithmétique et texte', () => {
  assert.equal(run('=1 + 2 * 3').value, 7);
  assert.equal(run('=-2^2').value, 4);
  assert.equal(run('="a" & 1.5 & true').value, 'a1.5true');
  assert.equal(run('=50%').value, 0.5);
  assert.equal(run('=Max(250, 1366 / 4)').value, 341.5);
  assert.equal(run('=If(false, 1, true, 2, 3)').value, 2);
  assert.equal(run('=Switch(2, 1, "un", 2, "deux", "autre")').value, 'deux');
  assert.equal(run('=$"Bonjour {Upper("x")} !"').value, 'Bonjour X !');
  assert.equal(run('=Substitute("SUF - Titre-A", "SUF - ", "")').value, 'Titre-A');
  assert.equal(run('=First(Split(Substitute("SUF - Titre-A", "SUF - ", ""), "-")).Value').value, 'Titre');
});

test('tables et portée', () => {
  assert.equal(run('=CountRows(Filter([1,2,3,4], Value > 2))').value, 2);
  assert.equal(run('=LookUp([{a:1,b:"x"},{a:2,b:"y"}], a = 2).b').value, 'y');
  assert.equal(run('=Concat(Filter([{n:"a"},{n:"b"}] As T, T.n <> "z") As R, R.n, ",")').value, 'a,b');
  assert.equal(run('=Sum([1,2,3], Value * 2)').value, 12);
  assert.equal(run('=With({x: 2}, x * 10)').value, 20);
  assert.equal(run('=CountRows(Sequence(Year(Date(2026,1,1)) - 2017, 2018))').value, 9);
  assert.equal(run('="b" in ["a","b"]').value, true);
  assert.equal(run('=First(Sort([3,1,2], Value, SortOrder.Descending)).Value').value, 3);
  assert.equal(run('=Text(1234.5, "#,##0.00", "en-US")').value, '1,234.50');
  assert.equal(run('=Text(Date(2026,3,5), "dd/mm/yyyy")').value, '05/03/2026');
  assert.equal(run('=IfError(1/0, -1)').value, -1);
  assert.equal(run('=IsBlank("")').value, true);
  assert.equal(run('=Coalesce(Blank(), "", "z")').value, 'z');
});

test('couleurs et énumérations', () => {
  const c = run('=RGBA(0, 72, 75, 0.9)').value;
  assert.ok(c instanceof FxColor);
  assert.equal(c.toCss(), 'rgba(0, 72, 75, 0.9)');
  assert.equal(run('=Color.White').value.toHex(), '#ffffff');
  const e = run('=LayoutDirection.Horizontal').value;
  assert.ok(e instanceof FxEnum);
  assert.equal(e.name, 'Horizontal');
  assert.equal(run("='TextCanvas.Weight'.Semibold = 'TextCanvas.Weight'.Semibold").value, true);
});

test('comportements', async () => {
  const host = makeHost();
  const { ast } = parseFormula('=Set(x, 5); ClearCollect(col, {a: 1}, {a: 2}); Collect(col, {a: x})');
  await evaluateAsync(ast, { host, scopes: [], behavior: true });
  assert.equal(host.globals.get('x'), 5);
  assert.equal(host.collections.get('col').length, 3);
  assert.equal(toText(host.collections.get('col')[2].a), '5');
});
