// Évaluateur Power Fx basé sur des générateurs : le même code sert en mode synchrone
// (propriétés de données, rendu) et asynchrone (comportements : flux, appels réseau).
import {
  DS,
  FxColor,
  FxEnum,
  FxEnumNs,
  FxOption,
  FxControlRef,
  FxScreenRef,
  FxUntyped,
  FxNamespaceRef,
  FxRuntimeError,
  isBlank,
  isRecord,
  namedColor,
} from './values.js';
import { t, getLocale, INTL_LOCALES } from '../i18n/index.js';

export const FN = Object.create(null);

/** Langue de l'application émulée (Text, Language, dates…) ; à défaut, variante régionale de la langue de l'interface */
export function hostLocale(ctx) {
  return ctx?.host?.locale || INTL_LOCALES[getLocale()];
}

/** Enregistre des fonctions : { Nom: { min, max, impl: function*(args, ctx, node) , behavior?, kind? } } */
export function registerFunctions(map) {
  for (const [k, v] of Object.entries(map)) FN[k] = v;
}

export const PENDING = Symbol('pending');

// ---------------------------------------------------------------------------
// Conversions
// ---------------------------------------------------------------------------

export function unwrap(v) {
  return v instanceof FxUntyped ? v.v : v;
}

export function toNumber(v, node) {
  v = unwrap(v);
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v instanceof Date) return v.getTime() / 86400000 + 25569; // numéro de série (style Excel)
  if (typeof v === 'string') {
    const s = v.trim().replace(/ |\s/g, '');
    if (s === '') return 0;
    let n = Number(s);
    if (Number.isNaN(n)) n = Number(s.replace(',', '.'));
    if (Number.isNaN(n)) {
      if (/%$/.test(s)) {
        const p = Number(s.slice(0, -1).replace(',', '.'));
        if (!Number.isNaN(p)) return p / 100;
      }
      throw new FxRuntimeError(t('fx.cannotConvertToNumber', { value: v }), 'InvalidArgument', node);
    }
    return n;
  }
  if (v instanceof FxEnum) {
    const n = Number(v.value);
    return Number.isNaN(n) ? 0 : n;
  }
  if (v instanceof FxOption) return Number(v.value) || 0;
  throw new FxRuntimeError(t('fx.notANumber', { value: describe(v) }), 'InvalidArgument', node);
}

export function toBool(v) {
  v = unwrap(v);
  if (v === null || v === undefined || v === '') return false;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    if (s === 'true') return true;
    if (s === 'false' || s === '') return false;
    return true;
  }
  if (v instanceof FxEnum) return String(v.value).toLowerCase() === 'true';
  return true;
}

export function formatNumberDefault(n) {
  if (!Number.isFinite(n)) return String(n);
  if (Number.isInteger(n)) return String(n);
  return String(Number(n.toPrecision(15)));
}

export function toText(v, ctx) {
  v = unwrap(v);
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return formatNumberDefault(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (v instanceof Date) return formatDefaultDate(v, ctx);
  if (v instanceof FxEnum) return String(v.value);
  if (v instanceof FxOption) return String(v.label ?? v.value ?? '');
  if (v instanceof FxScreenRef) return v.name;
  if (v instanceof FxColor) return v.toCss();
  if (v instanceof FxControlRef) return v.name;
  if (Array.isArray(v)) return '';
  if (typeof v === 'object') return '';
  return String(v);
}

export function formatDefaultDate(d, ctx) {
  const locale = hostLocale(ctx);
  if (Number.isNaN(d.getTime())) return '';
  const hasTime = d.getHours() || d.getMinutes() || d.getSeconds();
  try {
    return hasTime
      ? d.toLocaleString(locale, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString(locale, { year: 'numeric', month: '2-digit', day: '2-digit' });
  } catch {
    return d.toISOString();
  }
}

export function describe(v) {
  if (v === null || v === undefined) return t('fx.valueBlank');
  if (Array.isArray(v)) return t('fx.valueTable', { count: v.length });
  if (v instanceof Date) return t('fx.valueDate');
  if (v instanceof FxColor) return t('fx.valueColor');
  if (v instanceof FxEnum) return `${v.ns}.${v.name}`;
  if (v instanceof FxControlRef) return t('fx.valueControl', { name: v.name });
  if (typeof v === 'object') return t('fx.valueRecord');
  return typeof v;
}

// ---------------------------------------------------------------------------
// Égalité / comparaison
// ---------------------------------------------------------------------------

function primaryKeyOf(rec) {
  const ds = rec?.[DS];
  if (!ds || !ds.primaryKey) return undefined;
  return rec[ds.primaryKey];
}

export function fxEquals(a, b) {
  a = unwrap(a);
  b = unwrap(b);
  const ba = a === null || a === undefined || a === '';
  const bb = b === null || b === undefined || b === '';
  if (ba || bb) {
    if (ba && bb) return true;
    // Blank() = "" est vrai ; Blank() = 0 est faux
    return false;
  }
  if (a === b) return true;
  if (typeof a === 'number' || typeof b === 'number') {
    if (typeof a === 'number' && typeof b === 'number') return a === b;
    if (typeof a === 'boolean' || typeof b === 'boolean') return Number(a) === Number(b);
    if (a instanceof FxOption || b instanceof FxOption) return String(optionValue(a)) === String(optionValue(b)) || optionLabel(a) === optionLabel(b);
    return String(a) === String(b);
  }
  if (a instanceof Date || b instanceof Date) {
    const ta = a instanceof Date ? a.getTime() : new Date(a).getTime();
    const tb = b instanceof Date ? b.getTime() : new Date(b).getTime();
    return ta === tb;
  }
  if (a instanceof FxColor && b instanceof FxColor) return a.r === b.r && a.g === b.g && a.b === b.b && Math.abs(a.a - b.a) < 0.001;
  if (a instanceof FxEnum || b instanceof FxEnum || a instanceof FxOption || b instanceof FxOption) {
    const la = optionLabel(a);
    const lb = optionLabel(b);
    if (la != null && lb != null && String(la).toLowerCase() === String(lb).toLowerCase()) return true;
    const va = optionValue(a);
    const vb = optionValue(b);
    return va != null && vb != null && String(va).toLowerCase() === String(vb).toLowerCase();
  }
  if (a instanceof FxScreenRef || b instanceof FxScreenRef) {
    const na = a instanceof FxScreenRef ? a.name : typeof a === 'string' ? a : a?.name;
    const nb = b instanceof FxScreenRef ? b.name : typeof b === 'string' ? b : b?.name;
    return na != null && na === nb;
  }
  if (a instanceof FxControlRef && b instanceof FxControlRef) return a.name === b.name;
  if (typeof a === 'object' && typeof b === 'object') {
    const ka = primaryKeyOf(a);
    const kb = primaryKeyOf(b);
    if (ka !== undefined && kb !== undefined) return String(ka).toLowerCase() === String(kb).toLowerCase();
    if (a.__lookup && b.__lookup) return a.id === b.id;
    if (a.__lookup && kb !== undefined) return String(a.id).toLowerCase() === String(kb).toLowerCase();
    if (b.__lookup && ka !== undefined) return String(b.id).toLowerCase() === String(ka).toLowerCase();
    return false;
  }
  if (typeof a === 'string' && typeof b === 'string') return a === b;
  if (typeof a === 'boolean' || typeof b === 'boolean') return toBool(a) === toBool(b);
  return String(a) === String(b);
}

function optionLabel(v) {
  if (v instanceof FxOption) return v.label;
  if (v instanceof FxEnum) return v.name;
  if (typeof v === 'string') return v;
  return null;
}
function optionValue(v) {
  if (v instanceof FxOption) return v.value;
  if (v instanceof FxEnum) return v.value;
  return v;
}

export function fxCompare(a, b) {
  a = unwrap(a);
  b = unwrap(b);
  if (a instanceof Date || b instanceof Date) {
    const ta = a instanceof Date ? a.getTime() : isBlank(a) ? 0 : new Date(a).getTime();
    const tb = b instanceof Date ? b.getTime() : isBlank(b) ? 0 : new Date(b).getTime();
    return ta - tb;
  }
  if (typeof a === 'string' && typeof b === 'string') return a.localeCompare(b);
  if (typeof a === 'string' && isBlank(b)) return a === '' ? 0 : 1;
  if (typeof b === 'string' && isBlank(a)) return b === '' ? 0 : -1;
  return toNumber(a) - toNumber(b);
}

// ---------------------------------------------------------------------------
// Accès aux champs
// ---------------------------------------------------------------------------

export function hasField(rec, name) {
  if (!rec || typeof rec !== 'object') return false;
  const ds = rec[DS];
  if (ds && ds.hasField(name)) return true;
  if (Object.prototype.hasOwnProperty.call(rec, name)) return true;
  return false;
}

export function getField(rec, name) {
  if (rec === null || rec === undefined) return null;
  if (rec instanceof FxUntyped) {
    const inner = rec.v;
    return new FxUntyped(inner && typeof inner === 'object' ? inner[name] : undefined);
  }
  if (typeof rec !== 'object') return null;
  const ds = rec[DS];
  if (ds) return ds.getField(rec, name);
  if (Object.prototype.hasOwnProperty.call(rec, name)) {
    const v = rec[name];
    return v === undefined ? null : v;
  }
  const lower = String(name).toLowerCase();
  for (const k of Object.keys(rec)) if (k.toLowerCase() === lower) return rec[k] ?? null;
  return null;
}

export function copyRecord(rec, extra) {
  const o = Object.assign({}, rec, extra || {});
  if (rec && rec[DS]) Object.defineProperty(o, DS, { value: rec[DS], enumerable: false, writable: true, configurable: true });
  return o;
}

export function firstColumnValue(rec) {
  if (rec === null || rec === undefined) return null;
  if (!isRecord(rec)) return rec;
  if ('Value' in rec) return rec.Value;
  const keys = Object.keys(rec);
  return keys.length ? rec[keys[0]] : null;
}

export function getMember(obj, name, ctx, node) {
  if (obj === null || obj === undefined) return null;
  if (obj instanceof FxControlRef) return ctx.host.controlMember(obj, name, ctx, node);
  if (obj instanceof FxEnumNs) return enumMember(obj, name, ctx);
  if (obj instanceof FxScreenRef) return ctx.host.screenMember ? ctx.host.screenMember(obj, name, ctx) : null;
  if (obj instanceof FxUntyped) return getField(obj, name);
  if (obj instanceof FxNamespaceRef) return new FxEnum(obj.name, name);
  if (obj instanceof FxOption) {
    if (name === 'Value' || name === 'Label') return obj.label;
    return null;
  }
  if (obj instanceof FxEnum) return new FxEnum(`${obj.ns}.${obj.name}`, name);
  if (Array.isArray(obj)) {
    // projection de colonne
    return obj.map((r) => ({ [name]: getField(r, name) }));
  }
  if (typeof obj === 'object' && !(obj instanceof Date) && !(obj instanceof FxColor)) {
    if (name === 'IsSelected' && !hasField(obj, name)) {
      const info = ctx?.itemInfo || ctx?.inst?.galleryItem;
      if (info?.gallery) return info.gallery.get('Selected') === obj;
    }
    return getField(obj, name);
  }
  return null;
}

function enumMember(ns, name, ctx) {
  if (ns.ns === 'Color') {
    const c = namedColor(name);
    if (c) return c;
    return new FxColor(0, 0, 0, 1);
  }
  if (ns.members) {
    const m = ns.members.get(name) ?? ns.members.get(String(name).toLowerCase());
    if (m !== undefined) return m;
    if (ns.kind === 'option') return new FxOption(ns.ns, name, name);
  }
  if (ns.resolve) {
    const r = ns.resolve(name, ctx);
    if (r !== undefined) return r;
  }
  return new FxEnum(ns.ns, name);
}

// ---------------------------------------------------------------------------
// Portée
// ---------------------------------------------------------------------------

export function withScope(ctx, rec, alias = null, kind = 'record') {
  return { ...ctx, scopes: [...(ctx.scopes || []), { rec, alias, implicit: !alias, kind }] };
}

function* resolveIdent(node, ctx) {
  const name = node.name;
  if (!node.global) {
    switch (name) {
      case 'Self':
        return ctx.self ?? null;
      case 'Parent':
        return ctx.parent ?? null;
      case 'ThisItem': {
        for (let i = (ctx.scopes?.length ?? 0) - 1; i >= 0; i--) if (ctx.scopes[i].kind === 'item') return ctx.scopes[i].rec;
        return ctx.host.thisItemFallback ? ctx.host.thisItemFallback(ctx) : null;
      }
      case 'ThisRecord': {
        const s = ctx.scopes?.[ctx.scopes.length - 1];
        return s ? s.rec : null;
      }
      default:
        break;
    }
    const scopes = ctx.scopes || [];
    for (let i = scopes.length - 1; i >= 0; i--) {
      const s = scopes[i];
      if (s.alias) {
        if (s.alias === name) return s.rec;
        continue;
      }
      if (s.implicit && s.rec && typeof s.rec === 'object' && hasField(s.rec, name)) return getField(s.rec, name);
    }
  }
  const g = ctx.host.resolveGlobal(name, ctx, node);
  if (g && g.pending) {
    const v = yield g.pending;
    return v;
  }
  if (g) return g.value;
  ctx.host.reportUnresolved?.(name, node, ctx);
  return null;
}

// ---------------------------------------------------------------------------
// Évaluation
// ---------------------------------------------------------------------------

export function* ev(node, ctx) {
  switch (node.type) {
    case 'Num':
    case 'Str':
    case 'Bool':
      return node.value;
    case 'Blank':
    case 'Placeholder':
      return null;
    case 'Interp': {
      let s = '';
      for (const p of node.parts) s += toText(yield* ev(p, ctx), ctx);
      return s;
    }
    case 'Paren':
      return yield* ev(node.expr, ctx);
    case 'Chain': {
      let v = null;
      for (const it of node.items) v = yield* ev(it, ctx);
      return v;
    }
    case 'Ident':
      return yield* resolveIdent(node, ctx);
    case 'Member': {
      const obj = yield* ev(node.obj, ctx);
      return getMember(obj, node.name, ctx, node);
    }
    case 'Call':
      return yield* callFunction(node, ctx);
    case 'Unary': {
      const v = yield* ev(node.expr, ctx);
      if (node.op === 'Not') return !toBool(v);
      if (node.op === '-') return -toNumber(v, node);
      return toNumber(v, node);
    }
    case 'Percent':
      return toNumber(yield* ev(node.expr, ctx), node) / 100;
    case 'Binary':
      return yield* evBinary(node, ctx);
    case 'Record': {
      const o = {};
      for (const f of node.fields) o[f.name] = yield* ev(f.value, ctx);
      return o;
    }
    case 'Table': {
      const out = [];
      for (const it of node.items) {
        const v = yield* ev(it, ctx);
        if ((v === null || v === undefined) && looksLikeRecord(it)) out.push(null);
        else out.push(isRecord(v) ? v : { Value: v });
      }
      return out;
    }
    case 'As':
      return yield* ev(node.expr, ctx);
    default:
      throw new FxRuntimeError(t('fx.unknownNode', { type: node.type }), 'Internal', node);
  }
}

const RECORD_FUNCS = new Set(['LookUp', 'First', 'Last', 'Index', 'Defaults', 'Patch', 'AsType', 'Coalesce']);

/** Inférence statique simple : l'expression produit-elle un enregistrement ? */
function looksLikeRecord(node) {
  if (!node) return false;
  switch (node.type) {
    case 'Record':
      return true;
    case 'Paren':
      return looksLikeRecord(node.expr);
    case 'Call':
      if (RECORD_FUNCS.has(node.name)) return true;
      if (node.name === 'If') return node.args.some((a, i) => (i % 2 === 1 || i === node.args.length - 1) && looksLikeRecord(a));
      if (node.name === 'Switch') return node.args.some((a, i) => i > 1 && i % 2 === 0 && looksLikeRecord(a));
      return false;
    default:
      return false;
  }
}

function* evBinary(node, ctx) {
  const op = node.op;
  if (op === 'And') {
    const l = yield* ev(node.left, ctx);
    if (!toBool(l)) return false;
    return toBool(yield* ev(node.right, ctx));
  }
  if (op === 'Or') {
    const l = yield* ev(node.left, ctx);
    if (toBool(l)) return true;
    return toBool(yield* ev(node.right, ctx));
  }
  const l = yield* ev(node.left, ctx);
  const r = yield* ev(node.right, ctx);
  switch (op) {
    case '+': {
      if (l instanceof Date && !(r instanceof Date)) return new Date(l.getTime() + toNumber(r, node) * 86400000);
      if (r instanceof Date && !(l instanceof Date)) return new Date(r.getTime() + toNumber(l, node) * 86400000);
      return toNumber(l, node) + toNumber(r, node);
    }
    case '-': {
      if (l instanceof Date && r instanceof Date) return (l.getTime() - r.getTime()) / 86400000;
      if (l instanceof Date) return new Date(l.getTime() - toNumber(r, node) * 86400000);
      return toNumber(l, node) - toNumber(r, node);
    }
    case '*':
      return toNumber(l, node) * toNumber(r, node);
    case '/': {
      const d = toNumber(r, node);
      if (d === 0) throw new FxRuntimeError(t('fx.divisionByZero'), 'Div0', node);
      return toNumber(l, node) / d;
    }
    case '^':
      return Math.pow(toNumber(l, node), toNumber(r, node));
    case '&':
      return toText(l, ctx) + toText(r, ctx);
    case '=':
      return fxEquals(l, r);
    case '<>':
      return !fxEquals(l, r);
    case '<':
      return fxCompare(l, r) < 0;
    case '>':
      return fxCompare(l, r) > 0;
    case '<=':
      return fxCompare(l, r) <= 0;
    case '>=':
      return fxCompare(l, r) >= 0;
    case 'in':
    case 'exactin': {
      const exact = op === 'exactin';
      const rv = unwrap(r);
      if (Array.isArray(rv)) {
        return rv.some((row) => {
          const v = firstColumnValue(row);
          if (!exact && typeof v === 'string' && typeof l === 'string') return v.toLowerCase() === l.toLowerCase();
          if (isRecord(l) && isRecord(row)) return fxEquals(l, row);
          return fxEquals(l, v);
        });
      }
      const hay = toText(rv, ctx);
      const needle = toText(l, ctx);
      return exact ? hay.includes(needle) : hay.toLowerCase().includes(needle.toLowerCase());
    }
    default:
      throw new FxRuntimeError(t('fx.unknownOperator', { operator: op }), 'Internal', node);
  }
}

function* callFunction(node, ctx) {
  const name = node.name;
  const def = FN[name];
  if (def) {
    if (def.behavior && !ctx.behavior) {
      // Fonction de comportement dans une propriété de données : ignorée
      ctx.host.reportBehaviorInData?.(name, node, ctx);
      return null;
    }
    return yield* def.impl(node.args, ctx, node);
  }
  // Appel préfixé : Flux.Run(...), Environment.Action(...), Connecteur.Operation(...)
  if (name.includes('.')) {
    const res = ctx.host.callNamespaced ? ctx.host.callNamespaced(name, node, ctx) : null;
    if (res && res.handler) return yield* res.handler();
    if (res && 'value' in res) return res.value;
  }
  ctx.host.reportUnknownFunction?.(name, node, ctx);
  return null;
}

/** Évalue une liste d'arguments AST */
export function* evArgs(args, ctx) {
  const out = [];
  for (const a of args) out.push(yield* ev(a, ctx));
  return out;
}

// ---------------------------------------------------------------------------
// Pilotes synchrone / asynchrone
// ---------------------------------------------------------------------------

/** Évaluation synchrone (rendu). Les opérations asynchrones produisent Blank. */
export function evaluateSync(ast, ctx) {
  if (!ast) return null;
  const gen = ev(ast, ctx);
  let r = gen.next();
  let guard = 0;
  while (!r.done) {
    // Une promesse a été demandée en contexte synchrone : on renvoie PENDING
    if (r.value && typeof r.value.then === 'function') r.value.catch(() => {});
    r = gen.next(null);
    if (++guard > 1e6) throw new FxRuntimeError(t('fx.infiniteLoop'), 'Internal');
  }
  return r.value;
}

/** Évaluation asynchrone (comportements) : attend les promesses produites. */
export async function evaluateAsync(ast, ctx) {
  if (!ast) return null;
  const gen = ev(ast, ctx);
  let r = gen.next();
  while (!r.done) {
    let input;
    try {
      input = await r.value;
    } catch (e) {
      r = gen.throw(e instanceof FxRuntimeError ? e : new FxRuntimeError(e?.message || String(e), 'Network'));
      continue;
    }
    r = gen.next(input);
  }
  return r.value;
}
