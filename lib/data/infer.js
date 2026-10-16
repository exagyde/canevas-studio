// Déduction des sources de données manquantes à partir des formules (pour créer des tables simulées).
import { parseFormula, walk } from '../fx/parser.js';
import { walkNodes } from '../project/model.js';
import { controlDef } from '../catalog/controls.js';
import { buildNameIndex } from '../validation/validate.js';
import { findEnum } from '../catalog/enums.js';
import { FN } from '../fx/evaluator.js';
import '../fx/functions.js';

const TABLE_FIRST_ARG = new Set([
  'Filter', 'LookUp', 'Search', 'Sort', 'SortByColumns', 'CountRows', 'CountIf', 'First', 'Last', 'FirstN', 'LastN', 'AddColumns', 'Distinct',
  'ForAll', 'Patch', 'Remove', 'RemoveIf', 'UpdateIf', 'Defaults', 'Refresh', 'DataSourceInfo', 'Concat', 'Sum', 'Average', 'Max', 'Min', 'ShowColumns', 'DropColumns', 'GroupBy',
]);
const LAMBDA_FROM_1 = new Set(['Filter', 'LookUp', 'CountIf', 'Concat', 'Sort', 'AddColumns', 'ForAll', 'Distinct', 'Sum', 'Average', 'Max', 'Min', 'RemoveIf', 'UpdateIf']);

function guessType(name, hints) {
  if (hints.has('choice')) return 'choice';
  if (hints.has('lookup')) return 'lookup';
  if (hints.has('bool')) return 'bool';
  if (hints.has('number')) return 'number';
  if (hints.has('date')) return 'datetime';
  const n = name.toLowerCase();
  if (/^(id|guid)$|(^| )id( |$)/.test(n)) return 'text';
  if (/date|échéance|naissance|décès|created|modified|createdon|modifiedon/.test(n)) return 'datetime';
  if (/(montant|total|solde|nombre|count|amount|prix|price|quantit|volume|rate|taux|capital|score|âge|age)/.test(n)) return 'number';
  if (/^(est|is|has|présence|actif|active)|\?$/.test(n)) return 'bool';
  if (/e-?mail|courriel/.test(n)) return 'email';
  return 'text';
}

/**
 * @returns {Array<{ name, columns: [{name, type, options?}], usages: number }>}
 */
export function inferMissingSources(project) {
  const index = buildNameIndex(project);
  const known = (name) =>
    index.controls.has(name) ||
    index.screens.has(name) ||
    index.globals.has(name) ||
    index.contexts.has(name) ||
    index.collections.has(name) ||
    index.named.has(name) ||
    index.dataSources.has(name) ||
    index.optionSets.has(name) ||
    !!findEnum(name) ||
    !!FN[name] ||
    ['Self', 'Parent', 'ThisItem', 'ThisRecord', 'App', 'Host', 'Color', 'User', 'Environment', 'ModelDrivenFormIntegration'].includes(name);

  const tables = new Map(); // nom -> { fields: Map(name -> Set(hints)), usages }
  const optionNs = new Map(); // espace de noms inconnu -> Set(membres)
  const table = (name) => {
    if (!tables.has(name)) tables.set(name, { fields: new Map(), usages: 0 });
    return tables.get(name);
  };
  const field = (t, f, hint) => {
    if (!f || f.startsWith('%')) return;
    if (!t.fields.has(f)) t.fields.set(f, new Set());
    if (hint) t.fields.get(f).add(hint);
  };

  const literalHint = (n) => {
    if (!n) return null;
    if (n.type === 'Str' || n.type === 'Interp') return 'text';
    if (n.type === 'Num') return 'number';
    if (n.type === 'Bool') return 'bool';
    if (n.type === 'Member' && n.obj.type === 'Ident' && !known(n.obj.name)) return 'choice';
    if (n.type === 'Call' && ['Today', 'Now', 'Date', 'DateValue', 'DateAdd'].includes(n.name)) return 'date';
    return null;
  };

  const analyze = (ast, itemTable) => {
    // alias -> table
    const visit = (node, aliases, implicitTable) => {
      if (!node) return;
      if (node.type === 'Call') {
        const a0 = node.args[0];
        let tName = null;
        let alias = null;
        if (TABLE_FIRST_ARG.has(node.name) && a0) {
          const inner = a0.type === 'As' ? a0.expr : a0;
          if (a0.type === 'As') alias = a0.name;
          if (inner.type === 'Ident' && !known(inner.name)) tName = inner.name;
          else if (inner.type === 'Ident' && aliases.has(inner.name)) tName = aliases.get(inner.name);
        }
        if ((node.name === 'AsType' || node.name === 'IsType') && node.args[1]?.type === 'Ident' && !known(node.args[1].name)) table(node.args[1].name).usages++;
        if (tName) {
          const t = table(tName);
          t.usages++;
          if (node.name === 'Patch') {
            for (let i = 1; i < node.args.length; i++) if (node.args[i].type === 'Record') for (const f of node.args[i].fields) field(t, f.name, literalHint(f.value));
          }
        }
        node.args.forEach((a, i) => {
          if (tName && LAMBDA_FROM_1.has(node.name) && i >= 1) {
            const al = new Map(aliases);
            if (alias) al.set(alias, tName);
            visit(a, al, alias ? null : tName);
          } else visit(a, aliases, implicitTable);
        });
        return;
      }
      if (node.type === 'Member') {
        // Alias.Champ
        if (node.obj.type === 'Ident' && aliases.has(node.obj.name)) {
          field(table(aliases.get(node.obj.name)), node.name);
          return;
        }
        // ThisItem.Champ
        if (node.obj.type === 'Ident' && (node.obj.name === 'ThisItem' || node.obj.name === 'ThisRecord') && itemTable) {
          field(table(itemTable), node.name);
          return;
        }
        // LookUp(T, …).Champ / First(T).Champ / AsType(x, T).Champ
        if (node.obj.type === 'Call') {
          const c = node.obj;
          const a0 = c.args[0]?.type === 'As' ? c.args[0].expr : c.args[0];
          if (['LookUp', 'First', 'Last', 'Defaults'].includes(c.name) && a0?.type === 'Ident' && !known(a0.name)) field(table(a0.name), node.name);
          if (c.name === 'AsType' && c.args[1]?.type === 'Ident' && !known(c.args[1].name)) field(table(c.args[1].name), node.name);
        }
        // Espace de noms d'option inconnu : 'Statut'.Ouvert
        if (node.obj.type === 'Ident' && !known(node.obj.name) && !node.obj.global && /[\s(']|^[A-ZÀ-Ý]/.test(node.obj.name)) {
          if (!optionNs.has(node.obj.name)) optionNs.set(node.obj.name, new Set());
          optionNs.get(node.obj.name).add(node.name);
        }
        visit(node.obj, aliases, implicitTable);
        return;
      }
      if (node.type === 'Ident') {
        if (node.global && !known(node.name)) table(node.name).usages++;
        else if (implicitTable && !known(node.name) && !aliases.has(node.name)) field(table(implicitTable), node.name);
        return;
      }
      if (node.type === 'Binary' && ['=', '<>', '<', '>', '<=', '>='].includes(node.op)) {
        // Hints de type par comparaison
        const tryHint = (side, other) => {
          const h = literalHint(other);
          if (!h) return;
          if (side.type === 'Member' && side.obj.type === 'Ident' && aliases.has(side.obj.name)) field(table(aliases.get(side.obj.name)), side.name, h);
          else if (side.type === 'Ident' && implicitTable && !known(side.name)) field(table(implicitTable), side.name, h);
        };
        tryHint(node.left, node.right);
        tryHint(node.right, node.left);
      }
      const kids = [];
      walk(node, (n, p) => {
        if (p === node) kids.push(n);
        return n === node;
      });
      kids.forEach((k) => visit(k, aliases, implicitTable));
    };
    visit(ast, new Map(), null);
  };

  const formulas = (node) => Object.entries(node.properties || {});
  const scan = (nodes, itemTable) => {
    for (const n of nodes || []) {
      const def = controlDef(n);
      let childItem = itemTable;
      if (def.id === 'Gallery' || def.id === 'Form' || def.id === 'ModernCombobox' || def.id === 'ModernDropdown') {
        const f = n.properties?.[def.id === 'Form' ? 'DataSource' : 'Items'];
        const { ast } = f ? parseFormula(f) : { ast: null };
        let root = ast;
        while (root && root.type === 'Call' && root.args[0]) root = root.args[0].type === 'As' ? root.args[0].expr : root.args[0];
        if (root?.type === 'Ident' && !known(root.name)) {
          childItem = root.name;
          table(root.name).usages++;
        }
      }
      if (def.id === 'TypedDataCard' && itemTable) {
        const df = n.properties?.DataField;
        const m = df && /^="([^"]+)"$/.exec(df);
        if (m) field(table(itemTable), m[1]);
      }
      for (const [, f] of formulas(n)) {
        if (typeof f !== 'string' || !f.startsWith('=')) continue;
        const { ast } = parseFormula(f);
        if (ast) analyze(ast, def.id === 'Gallery' || def.id === 'Form' ? itemTable : itemTable);
      }
      scan(n.children, childItem);
    }
  };
  for (const s of project.screens || []) {
    for (const [, f] of formulas(s)) {
      const { ast } = typeof f === 'string' ? parseFormula(f) : { ast: null };
      if (ast) analyze(ast, null);
    }
    scan(s.children, null);
  }
  if (project.app) for (const [, f] of formulas(project.app)) {
    const { ast } = typeof f === 'string' ? parseFormula(f) : { ast: null };
    if (ast) analyze(ast, null);
  }

  const out = [];
  for (const [name, t] of tables) {
    if (known(name) || !t.usages) continue;
    const columns = [];
    for (const [f, hints] of t.fields) {
      const type = guessType(f, hints);
      const col = { name: f, displayName: f, type };
      if (type === 'choice') {
        const ns = optionNs.get(f) || optionNs.get(`${f} (${name})`);
        col.options = ns ? [...ns].map((label, i) => ({ value: i + 1, label })) : [];
        if (optionNs.has(f)) col.optionSetName = f;
      }
      columns.push(col);
    }
    out.push({ name, columns, usages: t.usages });
  }
  out.sort((a, b) => b.usages - a.usages);
  return out;
}

/** Données d'exemple simples pour une table simulée */
export function sampleRows(columns, n = 5) {
  const rows = [];
  for (let i = 1; i <= n; i++) {
    const r = {};
    for (const c of columns) {
      switch (c.type) {
        case 'guid':
          break;
        case 'number':
        case 'money':
          r[c.name] = Math.round(Math.random() * 1000 * 100) / 100;
          break;
        case 'bool':
          r[c.name] = i % 2 === 0;
          break;
        case 'datetime':
        case 'date':
          r[c.name] = new Date(2026, (i * 2) % 12, 1 + i * 3).toISOString();
          break;
        case 'choice':
          r[c.name] = c.options?.length ? c.options[(i - 1) % c.options.length].value : null;
          break;
        case 'email':
          r[c.name] = `contact${i}@exemple.fr`;
          break;
        default:
          r[c.name] = `${c.displayName || c.name} ${i}`;
      }
    }
    rows.push(r);
  }
  return rows;
}
