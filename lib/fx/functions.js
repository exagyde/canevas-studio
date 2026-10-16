// Bibliothèque de fonctions Power Fx de l'émulateur.
import {
  ev,
  evArgs,
  registerFunctions,
  toNumber,
  toText,
  toBool,
  fxEquals,
  fxCompare,
  getField,
  copyRecord,
  withScope,
  firstColumnValue,
  unwrap,
  formatNumberDefault,
  hostLocale,
} from './evaluator.js';
import { DS, FxColor, FxEnum, FxUntyped, FxRuntimeError, FxControlRef, FxScreenRef, isBlank, isRecord, parseColorString } from './values.js';
import { fxText, parseDateText, calendarNames } from './format.js';
import { t } from '../i18n/index.js';

export const NEW_RECORD = Symbol('newRecord');

// ---------------------------------------------------------------------------
// Aides
// ---------------------------------------------------------------------------

const eager = (fn, min = 0, max = Infinity, extra = {}) => ({
  min,
  max,
  ...extra,
  impl: function* (args, ctx, node) {
    const v = yield* evArgs(args, ctx);
    return fn(v, ctx, node);
  },
});

export function asTable(v) {
  v = v instanceof FxUntyped ? (Array.isArray(v.v) ? v.v.map((x) => new FxUntyped(x)) : v.v) : v;
  if (v === null || v === undefined) return [];
  if (Array.isArray(v)) return v;
  if (isRecord(v)) return [v];
  return [{ Value: v }];
}

function* tableArg(arg, ctx) {
  if (arg && arg.type === 'As') {
    const t = yield* ev(arg.expr, ctx);
    return { table: asTable(t), alias: arg.name };
  }
  const t = yield* ev(arg, ctx);
  return { table: asTable(t), alias: null };
}

function rowCtx(ctx, row, alias) {
  return withScope(ctx, row, alias, 'record');
}

function colName(argNode, ctx) {
  if (!argNode) return '';
  if (argNode.type === 'Ident') return argNode.name;
  if (argNode.type === 'Str') return argNode.value;
  return null;
}

function* colNameEval(argNode, ctx) {
  const n = colName(argNode, ctx);
  if (n !== null) return n;
  return toText(yield* ev(argNode, ctx), ctx);
}

function toDate(v, ctx) {
  v = unwrap(v);
  if (v instanceof Date) return v;
  if (isBlank(v)) return null;
  if (typeof v === 'number') return new Date((v - 25569) * 86400000);
  const d = parseDateText(v, hostLocale(ctx));
  return d;
}

function enumName(v, fallback) {
  if (v instanceof FxEnum) return v.name;
  if (typeof v === 'string' && v) return v;
  return fallback;
}

function round(n, d, mode) {
  const f = Math.pow(10, d);
  const x = n * f;
  let r;
  if (mode === 'up') r = x < 0 ? Math.floor(x) : Math.ceil(x);
  else if (mode === 'down') r = x < 0 ? Math.ceil(x) : Math.floor(x);
  else r = Math.sign(x) * Math.round(Math.abs(x) + 1e-9);
  return r / f;
}

function* reduceNumbers(args, ctx) {
  // Forme table : Sum(Table, Expr) ; forme scalaires : Sum(a, b, c)
  if (args.length === 2) {
    const first = yield* tableArgMaybe(args[0], ctx);
    if (first) {
      const out = [];
      for (const row of first.table) out.push(yield* ev(args[1], rowCtx(ctx, row, first.alias)));
      return out;
    }
  }
  const vals = [];
  for (const a of args) {
    const v = yield* ev(a, ctx);
    if (Array.isArray(v)) for (const r of v) vals.push(firstColumnValue(r));
    else vals.push(v);
  }
  return vals;
}

function* tableArgMaybe(arg, ctx) {
  if (arg.type === 'As') return yield* tableArg(arg, ctx);
  const v = yield* ev(arg, ctx);
  if (Array.isArray(unwrap(v))) return { table: asTable(v), alias: null };
  return null;
}

function numericOnly(vals) {
  return vals.filter((v) => !isBlank(v)).map((v) => toNumber(v));
}

function regexFrom(pattern, options) {
  const named = {
    Any: '.',
    Comma: ',',
    Digit: '\\d',
    Email: '[^@\\s]+@[^@\\s]+\\.[^@\\s]+',
    Hyphen: '-',
    LeftParen: '\\(',
    Letter: '\\p{L}',
    MultipleDigits: '\\d+',
    MultipleLetters: '\\p{L}+',
    MultipleNonSpaces: '\\S+',
    MultipleSpaces: '\\s+',
    NonSpace: '\\S',
    OptionalDigits: '\\d*',
    OptionalLetters: '\\p{L}*',
    OptionalNonSpaces: '\\S*',
    OptionalSpaces: '\\s*',
    Period: '\\.',
    RightParen: '\\)',
    Space: '\\s',
    Tab: '\\t',
  };
  let p = pattern instanceof FxEnum ? named[pattern.name] ?? pattern.name : String(pattern ?? '');
  let flags = 'u';
  let mode = 'Complete';
  const opts = Array.isArray(options) ? options : options ? [options] : [];
  for (const o of opts) {
    const n = o instanceof FxEnum ? o.name : String(o);
    if (n === 'IgnoreCase') flags += 'i';
    else if (n === 'Multiline') flags += 'm';
    else mode = n;
  }
  if (mode === 'Complete') p = `^(?:${p})$`;
  else if (mode === 'BeginsWith') p = `^(?:${p})`;
  else if (mode === 'EndsWith') p = `(?:${p})$`;
  try {
    return new RegExp(p, flags);
  } catch (e) {
    throw new FxRuntimeError(t('fx.invalidRegex', { details: e.message }), 'BadRegex');
  }
}

function jsonOf(v, ctx) {
  v = unwrap(v);
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  if (v instanceof FxColor) return v.toHex();
  if (v instanceof FxEnum) return v.value;
  if (Array.isArray(v)) return v.map((r) => (isRecord(r) && Object.keys(r).length === 1 && 'Value' in r ? jsonOf(r.Value, ctx) : jsonOf(r, ctx)));
  if (isRecord(v)) {
    const o = {};
    for (const k of Object.keys(v)) {
      if (k.startsWith('__')) continue;
      o[k] = jsonOf(v[k], ctx);
    }
    return o;
  }
  if (typeof v === 'object') return toText(v, ctx);
  return v;
}

function dateAdd(d, n, unit) {
  const r = new Date(d.getTime());
  switch (unit) {
    case 'Milliseconds':
      return new Date(d.getTime() + n);
    case 'Seconds':
      return new Date(d.getTime() + n * 1000);
    case 'Minutes':
      return new Date(d.getTime() + n * 60000);
    case 'Hours':
      return new Date(d.getTime() + n * 3600000);
    case 'Months':
      r.setMonth(r.getMonth() + n);
      return r;
    case 'Quarters':
      r.setMonth(r.getMonth() + n * 3);
      return r;
    case 'Years':
      r.setFullYear(r.getFullYear() + n);
      return r;
    default:
      r.setDate(r.getDate() + n);
      return r;
  }
}

function dateDiff(a, b, unit) {
  switch (unit) {
    case 'Milliseconds':
      return b - a;
    case 'Seconds':
      return Math.trunc((b - a) / 1000);
    case 'Minutes':
      return Math.trunc((b - a) / 60000);
    case 'Hours':
      return Math.trunc((b - a) / 3600000);
    case 'Months':
      return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
    case 'Quarters':
      return Math.trunc(((b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth())) / 3);
    case 'Years':
      return b.getFullYear() - a.getFullYear();
    default: {
      const da = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
      const db = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
      return Math.round((db - da) / 86400000);
    }
  }
}

function isoWeek(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t - y0) / 86400000 + 1) / 7);
}

function sortRows(rows, keys) {
  // keys : [{ get: row => value, desc: bool }]
  return rows
    .map((r, i) => ({ r, i, k: keys.map((k) => k.values[i]) }))
    .sort((x, y) => {
      for (let j = 0; j < keys.length; j++) {
        const a = x.k[j];
        const b = y.k[j];
        let c;
        if (isBlank(a) && isBlank(b)) c = 0;
        else if (isBlank(a)) c = -1;
        else if (isBlank(b)) c = 1;
        else c = fxCompare(a, b);
        if (c !== 0) return keys[j].desc ? -c : c;
      }
      return x.i - y.i;
    })
    .map((x) => x.r);
}

function isDesc(v) {
  const n = v instanceof FxEnum ? v.name : String(v ?? '');
  return n.toLowerCase() === 'descending';
}

function* lambdaRows(args, ctx) {
  const { table, alias } = yield* tableArg(args[0], ctx);
  return { table, alias };
}

function* targetOf(argNode, ctx, create = false) {
  if (argNode.type === 'Ident') {
    const t = ctx.host.tableTarget(argNode.name, ctx, create);
    if (t) return t;
  }
  const v = yield* ev(argNode, ctx);
  if (Array.isArray(v) && v[DS]) return ctx.host.targetFromDs(v[DS]);
  return { kind: 'value', rows: asTable(v), name: null };
}

function normalizeItems(values) {
  const out = [];
  for (const v of values) {
    if (Array.isArray(v)) for (const r of v) out.push(isRecord(r) ? copyRecord(r) : { Value: r });
    else if (isRecord(v)) out.push(copyRecord(v));
    else if (!isBlank(v) || v === '') out.push({ Value: v });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Logique
// ---------------------------------------------------------------------------

registerFunctions({
  If: {
    min: 2,
    max: Infinity,
    *impl(args, ctx) {
      let i = 0;
      for (; i + 1 < args.length; i += 2) {
        if (toBool(yield* ev(args[i], ctx))) return yield* ev(args[i + 1], ctx);
      }
      if (i < args.length) return yield* ev(args[i], ctx);
      return null;
    },
  },
  Switch: {
    min: 3,
    max: Infinity,
    *impl(args, ctx) {
      const v = yield* ev(args[0], ctx);
      let i = 1;
      for (; i + 1 < args.length; i += 2) {
        const m = yield* ev(args[i], ctx);
        if (fxEquals(v, m)) return yield* ev(args[i + 1], ctx);
      }
      if (i < args.length) return yield* ev(args[i], ctx);
      return null;
    },
  },
  And: {
    min: 1,
    max: Infinity,
    *impl(args, ctx) {
      for (const a of args) if (!toBool(yield* ev(a, ctx))) return false;
      return true;
    },
  },
  Or: {
    min: 1,
    max: Infinity,
    *impl(args, ctx) {
      for (const a of args) if (toBool(yield* ev(a, ctx))) return true;
      return false;
    },
  },
  Not: eager(([v]) => !toBool(v), 1, 1),
  IsBlank: eager(([v]) => isBlank(v) || (Array.isArray(v) && false), 1, 1),
  IsEmpty: eager(([v]) => isBlank(v) || (Array.isArray(unwrap(v)) && unwrap(v).length === 0), 1, 1),
  Blank: eager(() => null, 0, 0),
  Coalesce: {
    min: 1,
    max: Infinity,
    *impl(args, ctx) {
      for (const a of args) {
        const v = yield* ev(a, ctx);
        if (!isBlank(v)) return v;
      }
      return null;
    },
  },
  IfError: {
    min: 2,
    max: Infinity,
    *impl(args, ctx) {
      let last = null;
      for (let i = 0; i + 1 < args.length; i += 2) {
        try {
          last = yield* ev(args[i], ctx);
        } catch (e) {
          if (!(e instanceof FxRuntimeError)) throw e;
          const errRec = { Kind: new FxEnum('ErrorKind', e.kind), Message: e.message };
          return yield* ev(args[i + 1], withScope(ctx, { FirstError: errRec, AllErrors: [errRec] }, null));
        }
      }
      if (args.length % 2 === 1) return yield* ev(args[args.length - 1], ctx);
      return last;
    },
  },
  IsError: {
    min: 1,
    max: 1,
    *impl(args, ctx) {
      try {
        yield* ev(args[0], ctx);
        return false;
      } catch (e) {
        if (e instanceof FxRuntimeError) return true;
        throw e;
      }
    },
  },
  IsBlankOrError: {
    min: 1,
    max: 1,
    *impl(args, ctx) {
      try {
        return isBlank(yield* ev(args[0], ctx));
      } catch (e) {
        if (e instanceof FxRuntimeError) return true;
        throw e;
      }
    },
  },
  Error: eager(([v]) => {
    const msg = isRecord(v) ? toText(v.Message ?? v.message ?? t('fx.errorDefault')) : toText(v);
    const kind = isRecord(v) && v.Kind instanceof FxEnum ? v.Kind.name : 'Custom';
    throw new FxRuntimeError(msg, kind);
  }, 1, 1),
  IsNumeric: eager(([v]) => {
    v = unwrap(v);
    if (typeof v === 'number') return true;
    if (typeof v === 'string') return v.trim() !== '' && !Number.isNaN(Number(v.replace(',', '.')));
    return false;
  }, 1, 1),
  IsToday: eager(([v], ctx) => {
    const d = toDate(v, ctx);
    const n = new Date();
    return !!d && d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
  }, 1, 1),
  IsUTCToday: eager(([v], ctx) => {
    const d = toDate(v, ctx);
    const n = new Date();
    return !!d && d.getUTCFullYear() === n.getUTCFullYear() && d.getUTCMonth() === n.getUTCMonth() && d.getUTCDate() === n.getUTCDate();
  }, 1, 1),
  IsMatch: eager(([text, pattern, opts]) => regexFrom(pattern, opts ?? 'Complete').test(toText(text)), 2, 3),
  Match: eager(([text, pattern, opts]) => {
    const re = regexFrom(pattern, opts ?? 'Contains');
    const m = re.exec(toText(text));
    if (!m) return null;
    return { FullMatch: m[0], StartMatch: m.index + 1, SubMatches: m.slice(1).map((x) => ({ Value: x })), ...(m.groups || {}) };
  }, 2, 3),
  MatchAll: eager(([text, pattern, opts]) => {
    const re = regexFrom(pattern, opts ?? 'Contains');
    const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
    return [...toText(text).matchAll(g)].map((m) => ({ FullMatch: m[0], StartMatch: m.index + 1, SubMatches: m.slice(1).map((x) => ({ Value: x })), ...(m.groups || {}) }));
  }, 2, 3),
  IsType: {
    min: 2,
    max: 2,
    *impl(args, ctx) {
      const rec = yield* ev(args[0], ctx);
      return ctx.host.isType ? ctx.host.isType(rec, args[1], ctx) : !isBlank(rec);
    },
  },
  AsType: {
    min: 2,
    max: 2,
    *impl(args, ctx) {
      const rec = yield* ev(args[0], ctx);
      return ctx.host.asType ? ctx.host.asType(rec, args[1], ctx) : rec;
    },
  },
  With: {
    min: 2,
    max: 2,
    *impl(args, ctx) {
      const rec = yield* ev(args[0], ctx);
      return yield* ev(args[1], withScope(ctx, isRecord(rec) ? rec : {}, null, 'with'));
    },
  },
  Boolean: eager(([v]) => {
    v = unwrap(v);
    if (isBlank(v)) return null;
    if (typeof v === 'string') {
      const s = v.trim().toLowerCase();
      if (s === 'true') return true;
      if (s === 'false') return false;
      throw new FxRuntimeError(t('fx.notABoolean', { value: v }), 'InvalidArgument');
    }
    return toBool(v);
  }, 1, 1),
});

// ---------------------------------------------------------------------------
// Mathématiques
// ---------------------------------------------------------------------------

registerFunctions({
  Abs: eager(([v]) => Math.abs(toNumber(v)), 1, 1),
  Round: eager(([v, d]) => round(toNumber(v), toNumber(d ?? 0)), 1, 2),
  RoundUp: eager(([v, d]) => round(toNumber(v), toNumber(d ?? 0), 'up'), 1, 2),
  RoundDown: eager(([v, d]) => round(toNumber(v), toNumber(d ?? 0), 'down'), 1, 2),
  Int: eager(([v]) => Math.floor(toNumber(v)), 1, 1),
  Trunc: eager(([v, d]) => round(toNumber(v), toNumber(d ?? 0), 'down'), 1, 2),
  Mod: eager(([a, b]) => {
    const d = toNumber(b);
    if (d === 0) throw new FxRuntimeError(t('fx.divisionByZero'), 'Div0');
    const n = toNumber(a);
    return n - d * Math.floor(n / d);
  }, 2, 2),
  Power: eager(([a, b]) => Math.pow(toNumber(a), toNumber(b)), 2, 2),
  Sqrt: eager(([v]) => Math.sqrt(toNumber(v)), 1, 1),
  Exp: eager(([v]) => Math.exp(toNumber(v)), 1, 1),
  Ln: eager(([v]) => Math.log(toNumber(v)), 1, 1),
  Log: eager(([v, b]) => Math.log(toNumber(v)) / Math.log(toNumber(b ?? 10)), 1, 2),
  Pi: eager(() => Math.PI, 0, 0),
  Rand: eager(() => Math.random(), 0, 0),
  RandBetween: eager(([a, b]) => {
    const lo = Math.ceil(toNumber(a));
    const hi = Math.floor(toNumber(b));
    return lo + Math.floor(Math.random() * (hi - lo + 1));
  }, 2, 2),
  Sum: {
    min: 1,
    max: Infinity,
    *impl(args, ctx) {
      const vals = numericOnly(yield* reduceNumbers(args, ctx));
      return vals.reduce((a, b) => a + b, 0);
    },
  },
  Average: {
    min: 1,
    max: Infinity,
    *impl(args, ctx) {
      const vals = numericOnly(yield* reduceNumbers(args, ctx));
      if (!vals.length) throw new FxRuntimeError(t('fx.averageOfEmptyTable'), 'Div0');
      return vals.reduce((a, b) => a + b, 0) / vals.length;
    },
  },
  Max: {
    min: 1,
    max: Infinity,
    *impl(args, ctx) {
      const raw = (yield* reduceNumbers(args, ctx)).filter((v) => !isBlank(v));
      if (!raw.length) return null;
      if (raw.every((v) => v instanceof Date)) return new Date(Math.max(...raw.map((d) => d.getTime())));
      return Math.max(...raw.map((v) => toNumber(v)));
    },
  },
  Min: {
    min: 1,
    max: Infinity,
    *impl(args, ctx) {
      const raw = (yield* reduceNumbers(args, ctx)).filter((v) => !isBlank(v));
      if (!raw.length) return null;
      if (raw.every((v) => v instanceof Date)) return new Date(Math.min(...raw.map((d) => d.getTime())));
      return Math.min(...raw.map((v) => toNumber(v)));
    },
  },
  StdevP: {
    min: 1,
    max: Infinity,
    *impl(args, ctx) {
      const v = numericOnly(yield* reduceNumbers(args, ctx));
      if (!v.length) return null;
      const m = v.reduce((a, b) => a + b, 0) / v.length;
      return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length);
    },
  },
  VarP: {
    min: 1,
    max: Infinity,
    *impl(args, ctx) {
      const v = numericOnly(yield* reduceNumbers(args, ctx));
      if (!v.length) return null;
      const m = v.reduce((a, b) => a + b, 0) / v.length;
      return v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length;
    },
  },
  Count: eager(([t]) => asTable(t).filter((r) => typeof unwrap(firstColumnValue(r)) === 'number').length, 1, 1),
  CountA: eager(([t]) => asTable(t).filter((r) => !isBlank(firstColumnValue(r))).length, 1, 1),
  CountRows: eager(([t]) => asTable(t).length, 1, 1),
  CountIf: {
    min: 2,
    max: Infinity,
    *impl(args, ctx) {
      const { table, alias } = yield* lambdaRows(args, ctx);
      let n = 0;
      for (const row of table) {
        let ok = true;
        for (let i = 1; i < args.length && ok; i++) ok = toBool(yield* ev(args[i], rowCtx(ctx, row, alias)));
        if (ok) n++;
      }
      return n;
    },
  },
  Sequence: eager(([n, start, step]) => {
    const count = Math.max(0, Math.min(50000, Math.floor(toNumber(n))));
    const s = isBlank(start) ? 1 : toNumber(start);
    const st = isBlank(step) ? 1 : toNumber(step);
    return Array.from({ length: count }, (_, i) => ({ Value: s + i * st }));
  }, 1, 3),
  Dec2Hex: eager(([v, p]) => {
    let s = Math.trunc(toNumber(v)).toString(16).toUpperCase();
    if (!isBlank(p)) s = s.padStart(toNumber(p), '0');
    return s;
  }, 1, 2),
  Hex2Dec: eager(([v]) => parseInt(toText(v), 16), 1, 1),
  Value: eager(([v, locale], ctx) => {
    v = unwrap(v);
    if (isBlank(v)) return null;
    if (typeof v === 'number') return v;
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (v instanceof Date) return toNumber(v);
    let s = String(v).trim();
    const loc = toText(locale) || hostLocale(ctx);
    if (/^(fr|de|es|it|pt|nl)/i.test(loc) && /,\d*$/.test(s)) s = s.replace(/\s| | |\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
    s = s.replace(/[€$£\s  ]/g, '');
    let pct = false;
    if (s.endsWith('%')) {
      pct = true;
      s = s.slice(0, -1);
    }
    const n = Number(s);
    if (Number.isNaN(n)) throw new FxRuntimeError(t('fx.cannotConvertToNumber', { value: v }), 'InvalidArgument');
    return pct ? n / 100 : n;
  }, 1, 2),
  Float: eager(([v]) => (isBlank(v) ? null : toNumber(v)), 1, 1),
  Decimal: eager(([v]) => (isBlank(v) ? null : toNumber(v)), 1, 1),
});

// ---------------------------------------------------------------------------
// Texte
// ---------------------------------------------------------------------------

registerFunctions({
  Text: eager(([v, fmt, locale], ctx) => {
    v = unwrap(v);
    if (isBlank(v)) return '';
    const loc = !isBlank(locale) ? toText(locale) : hostLocale(ctx);
    if (!isBlank(fmt)) {
      const r = fxText(v, fmt, loc);
      if (r !== null) return r;
    }
    return toText(v, ctx);
  }, 1, 3),
  Concatenate: eager((vals, ctx) => vals.map((v) => toText(v, ctx)).join(''), 1, Infinity),
  Concat: {
    min: 2,
    max: 3,
    *impl(args, ctx) {
      const { table, alias } = yield* lambdaRows(args, ctx);
      const sep = args[2] ? toText(yield* ev(args[2], ctx), ctx) : '';
      const parts = [];
      for (const row of table) parts.push(toText(yield* ev(args[1], rowCtx(ctx, row, alias)), ctx));
      return parts.join(sep);
    },
  },
  Len: eager(([v], ctx) => (Array.isArray(v) ? v.map((r) => ({ Value: toText(firstColumnValue(r), ctx).length })) : toText(v, ctx).length), 1, 1),
  Left: eager(([v, n], ctx) => toText(v, ctx).slice(0, Math.max(0, toNumber(n))), 2, 2),
  Right: eager(([v, n], ctx) => {
    const s = toText(v, ctx);
    const k = Math.max(0, toNumber(n));
    return k === 0 ? '' : s.slice(-k);
  }, 2, 2),
  Mid: eager(([v, start, n], ctx) => {
    const s = toText(v, ctx);
    const st = Math.max(1, toNumber(start)) - 1;
    return isBlank(n) ? s.slice(st) : s.substr(st, Math.max(0, toNumber(n)));
  }, 2, 3),
  Upper: eager(([v], ctx) => toText(v, ctx).toUpperCase(), 1, 1),
  Lower: eager(([v], ctx) => toText(v, ctx).toLowerCase(), 1, 1),
  Proper: eager(([v], ctx) => toText(v, ctx).toLowerCase().replace(/(^|[^\p{L}])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()), 1, 1),
  Trim: eager(([v], ctx) => toText(v, ctx).replace(/\s+/g, ' ').trim(), 1, 1),
  TrimEnds: eager(([v], ctx) => toText(v, ctx).trim(), 1, 1),
  Substitute: eager(([v, oldT, newT, inst], ctx) => {
    const s = toText(v, ctx);
    const o = toText(oldT, ctx);
    const nw = toText(newT, ctx);
    if (!o) return s;
    if (isBlank(inst)) return s.split(o).join(nw);
    const k = toNumber(inst);
    let idx = -1;
    for (let i = 0; i < k; i++) {
      idx = s.indexOf(o, idx + 1);
      if (idx < 0) return s;
    }
    return s.slice(0, idx) + nw + s.slice(idx + o.length);
  }, 3, 4),
  Replace: eager(([v, start, count, newT], ctx) => {
    const s = toText(v, ctx);
    const st = Math.max(1, toNumber(start)) - 1;
    return s.slice(0, st) + toText(newT, ctx) + s.slice(st + Math.max(0, toNumber(count)));
  }, 4, 4),
  Find: eager(([find, within, start], ctx) => {
    const i = toText(within, ctx).indexOf(toText(find, ctx), isBlank(start) ? 0 : toNumber(start) - 1);
    return i < 0 ? null : i + 1;
  }, 2, 3),
  StartsWith: eager(([v, p], ctx) => toText(v, ctx).toLowerCase().startsWith(toText(p, ctx).toLowerCase()), 2, 2),
  EndsWith: eager(([v, p], ctx) => toText(v, ctx).toLowerCase().endsWith(toText(p, ctx).toLowerCase()), 2, 2),
  Split: eager(([v, sep], ctx) => {
    const s = toText(v, ctx);
    const d = toText(sep, ctx);
    if (s === '') return [];
    return (d === '' ? [...s] : s.split(d)).map((x) => ({ Value: x }));
  }, 2, 2),
  Char: eager(([n]) => String.fromCharCode(toNumber(n)), 1, 1),
  UniChar: eager(([n]) => String.fromCodePoint(toNumber(n)), 1, 1),
  EncodeUrl: eager(([v], ctx) => encodeURIComponent(toText(v, ctx)), 1, 1),
  EncodeHTML: eager(([v], ctx) => toText(v, ctx).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'), 1, 1),
  PlainText: eager(([v], ctx) =>
    toText(v, ctx)
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .trim(), 1, 1),
  GUID: eager(([v], ctx) => {
    if (!isBlank(v)) {
      const s = toText(v, ctx).trim().replace(/^\{|\}$/g, '').toLowerCase();
      if (!/^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/.test(s)) throw new FxRuntimeError(t('fx.invalidGuid', { value: s }), 'InvalidArgument');
      return s.length === 32 ? `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}` : s;
    }
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }, 0, 1),
  JSON: eager(([v, fmt], ctx) => {
    const indent = fmt instanceof FxEnum && fmt.name === 'IndentFour' ? 4 : 0;
    return JSON.stringify(jsonOf(v, ctx), null, indent);
  }, 1, 2),
  ParseJSON: eager(([v], ctx) => {
    const s = toText(v, ctx);
    if (!s) return null;
    try {
      return new FxUntyped(JSON.parse(s));
    } catch (e) {
      throw new FxRuntimeError(t('fx.invalidJson', { details: e.message }), 'InvalidArgument');
    }
  }, 1, 2),
  Language: eager((_, ctx) => hostLocale(ctx), 0, 0),
  HashTags: eager(([v], ctx) => (toText(v, ctx).match(/#[\p{L}\p{N}_]+/gu) || []).map((x) => ({ Value: x })), 1, 1),
});

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

registerFunctions({
  Now: eager((_, ctx) => (ctx.host.now ? ctx.host.now() : new Date()), 0, 0),
  UTCNow: eager(() => new Date(), 0, 0),
  Today: eager(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }, 0, 0),
  UTCToday: eager(() => {
    const d = new Date();
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }, 0, 0),
  Date: eager(([y, m, d]) => new Date(toNumber(y), toNumber(m) - 1, toNumber(d)), 3, 3),
  DateTime: eager(([y, mo, d, h, mi, s, ms]) => new Date(toNumber(y), toNumber(mo) - 1, toNumber(d), toNumber(h), toNumber(mi), toNumber(s ?? 0), toNumber(ms ?? 0)), 5, 7),
  Time: eager(([h, mi, s, ms]) => new Date(1970, 0, 1, toNumber(h), toNumber(mi), toNumber(s ?? 0), toNumber(ms ?? 0)), 3, 4),
  DateValue: eager(([v, loc], ctx) => {
    const d = toDate(v, { host: { locale: isBlank(loc) ? ctx.host.locale : toText(loc) } });
    return d ? new Date(d.getFullYear(), d.getMonth(), d.getDate()) : null;
  }, 1, 2),
  DateTimeValue: eager(([v, loc], ctx) => toDate(v, { host: { locale: isBlank(loc) ? ctx.host.locale : toText(loc) } }), 1, 2),
  TimeValue: eager(([v]) => {
    const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(toText(v));
    return m ? new Date(1970, 0, 1, +m[1], +m[2], +(m[3] || 0)) : null;
  }, 1, 2),
  Year: eager(([v], ctx) => toDate(v, ctx)?.getFullYear() ?? null, 1, 1),
  Month: eager(([v], ctx) => (toDate(v, ctx) ? toDate(v, ctx).getMonth() + 1 : null), 1, 1),
  Day: eager(([v], ctx) => toDate(v, ctx)?.getDate() ?? null, 1, 1),
  Hour: eager(([v], ctx) => toDate(v, ctx)?.getHours() ?? null, 1, 1),
  Minute: eager(([v], ctx) => toDate(v, ctx)?.getMinutes() ?? null, 1, 1),
  Second: eager(([v], ctx) => toDate(v, ctx)?.getSeconds() ?? null, 1, 1),
  Weekday: eager(([v, sow], ctx) => {
    const d = toDate(v, ctx);
    if (!d) return null;
    const day = d.getDay();
    const mode = sow instanceof FxEnum ? sow.name : isBlank(sow) ? 'Sunday' : toNumber(sow);
    if (mode === 'Monday' || mode === 2) return ((day + 6) % 7) + 1;
    if (mode === 'MondayZero' || mode === 3) return (day + 6) % 7;
    return day + 1;
  }, 1, 2),
  WeekNum: eager(([v], ctx) => {
    const d = toDate(v, ctx);
    if (!d) return null;
    const jan1 = new Date(d.getFullYear(), 0, 1);
    return Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7);
  }, 1, 2),
  ISOWeekNum: eager(([v], ctx) => {
    const d = toDate(v, ctx);
    return d ? isoWeek(d) : null;
  }, 1, 1),
  DateAdd: eager(([v, n, unit], ctx) => {
    const d = toDate(v, ctx);
    if (!d) return null;
    return dateAdd(d, toNumber(n), enumName(unit, 'Days'));
  }, 2, 3),
  DateDiff: eager(([a, b, unit], ctx) => {
    const da = toDate(a, ctx);
    const db = toDate(b, ctx);
    if (!da || !db) return null;
    return dateDiff(da, db, enumName(unit, 'Days'));
  }, 2, 3),
  EDate: eager(([v, n], ctx) => {
    const d = toDate(v, ctx);
    return d ? dateAdd(d, toNumber(n), 'Months') : null;
  }, 2, 2),
  EOMonth: eager(([v, n], ctx) => {
    const d = toDate(v, ctx);
    if (!d) return null;
    return new Date(d.getFullYear(), d.getMonth() + toNumber(n) + 1, 0);
  }, 2, 2),
  TimeZoneOffset: eager(([v], ctx) => (toDate(v, ctx) || new Date()).getTimezoneOffset(), 0, 1),
  'Calendar.MonthsLong': eager((_, ctx) => calendarNames(hostLocale(ctx)).monthsLong.map((Value) => ({ Value })), 0, 0),
  'Calendar.MonthsShort': eager((_, ctx) => calendarNames(hostLocale(ctx)).monthsShort.map((Value) => ({ Value })), 0, 0),
  'Calendar.WeekdaysLong': eager((_, ctx) => calendarNames(hostLocale(ctx)).weekdaysLong.map((Value) => ({ Value })), 0, 0),
  'Calendar.WeekdaysShort': eager((_, ctx) => calendarNames(hostLocale(ctx)).weekdaysShort.map((Value) => ({ Value })), 0, 0),
  'Clock.AmPm': eager(() => [{ Value: 'AM' }, { Value: 'PM' }], 0, 0),
  'Clock.AmPmShort': eager(() => [{ Value: 'A' }, { Value: 'P' }], 0, 0),
  'Clock.IsClock24': eager(() => true, 0, 0),
});

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

registerFunctions({
  Filter: {
    min: 2,
    max: Infinity,
    *impl(args, ctx) {
      const { table, alias } = yield* lambdaRows(args, ctx);
      const out = [];
      for (const row of table) {
        let ok = true;
        for (let i = 1; i < args.length && ok; i++) ok = toBool(yield* ev(args[i], rowCtx(ctx, row, alias)));
        if (ok) out.push(row);
      }
      if (table[DS]) Object.defineProperty(out, DS, { value: table[DS], enumerable: false });
      return out;
    },
  },
  LookUp: {
    min: 2,
    max: 3,
    *impl(args, ctx) {
      const { table, alias } = yield* lambdaRows(args, ctx);
      for (const row of table) {
        if (toBool(yield* ev(args[1], rowCtx(ctx, row, alias)))) {
          if (args[2]) return yield* ev(args[2], rowCtx(ctx, row, alias));
          return row;
        }
      }
      return null;
    },
  },
  Search: {
    min: 3,
    max: Infinity,
    *impl(args, ctx) {
      const { table } = yield* lambdaRows(args, ctx);
      const term = toText(yield* ev(args[1], ctx), ctx).toLowerCase();
      if (!term) return table;
      const cols = [];
      for (let i = 2; i < args.length; i++) cols.push(yield* colNameEval(args[i], ctx));
      return table.filter((row) => cols.some((c) => toText(getField(row, c), ctx).toLowerCase().includes(term)));
    },
  },
  Sort: {
    min: 2,
    max: Infinity,
    *impl(args, ctx) {
      const { table, alias } = yield* lambdaRows(args, ctx);
      const keys = [];
      for (let i = 1; i < args.length; i += 2) {
        const values = [];
        for (const row of table) values.push(yield* ev(args[i], rowCtx(ctx, row, alias)));
        const desc = args[i + 1] ? isDesc(yield* ev(args[i + 1], ctx)) : false;
        keys.push({ values, desc });
      }
      return sortRows(table, keys);
    },
  },
  SortByColumns: {
    min: 2,
    max: Infinity,
    *impl(args, ctx) {
      const { table } = yield* lambdaRows(args, ctx);
      const keys = [];
      for (let i = 1; i < args.length; i += 2) {
        const col = yield* colNameEval(args[i], ctx);
        let desc = false;
        if (args[i + 1]) {
          const o = yield* ev(args[i + 1], ctx);
          desc = isDesc(o);
        }
        keys.push({ values: table.map((r) => getField(r, col)), desc });
      }
      return sortRows(table, keys);
    },
  },
  First: eager(([t]) => asTable(t)[0] ?? null, 1, 1),
  Last: eager(([t]) => {
    const a = asTable(t);
    return a[a.length - 1] ?? null;
  }, 1, 1),
  FirstN: eager(([t, n]) => asTable(t).slice(0, isBlank(n) ? 1 : Math.max(0, toNumber(n))), 1, 2),
  LastN: eager(([t, n]) => {
    const a = asTable(t);
    const k = isBlank(n) ? 1 : Math.max(0, toNumber(n));
    return k === 0 ? [] : a.slice(-k);
  }, 1, 2),
  Index: eager(([tbl, n]) => {
    const a = asTable(tbl);
    const i = toNumber(n);
    if (i < 1 || i > a.length) throw new FxRuntimeError(t('fx.indexOutOfRange', { index: i, max: a.length }), 'InvalidArgument');
    return a[i - 1];
  }, 2, 2),
  AddColumns: {
    min: 3,
    max: Infinity,
    *impl(args, ctx) {
      const { table, alias } = yield* lambdaRows(args, ctx);
      const specs = [];
      for (let i = 1; i + 1 < args.length; i += 2) specs.push({ name: yield* colNameEval(args[i], ctx), expr: args[i + 1] });
      const out = [];
      for (const row of table) {
        const extra = {};
        for (const s of specs) extra[s.name] = yield* ev(s.expr, rowCtx(ctx, row, alias));
        out.push(copyRecord(row, extra));
      }
      return out;
    },
  },
  DropColumns: {
    min: 2,
    max: Infinity,
    *impl(args, ctx) {
      const { table } = yield* lambdaRows(args, ctx);
      const cols = [];
      for (let i = 1; i < args.length; i++) cols.push(yield* colNameEval(args[i], ctx));
      return table.map((r) => {
        const o = copyRecord(r);
        for (const c of cols) delete o[c];
        return o;
      });
    },
  },
  ShowColumns: {
    min: 2,
    max: Infinity,
    *impl(args, ctx) {
      const { table } = yield* lambdaRows(args, ctx);
      const cols = [];
      for (let i = 1; i < args.length; i++) cols.push(yield* colNameEval(args[i], ctx));
      return table.map((r) => {
        const o = {};
        for (const c of cols) o[c] = getField(r, c);
        return o;
      });
    },
  },
  RenameColumns: {
    min: 3,
    max: Infinity,
    *impl(args, ctx) {
      const { table } = yield* lambdaRows(args, ctx);
      const pairs = [];
      for (let i = 1; i + 1 < args.length; i += 2) pairs.push([yield* colNameEval(args[i], ctx), yield* colNameEval(args[i + 1], ctx)]);
      return table.map((r) => {
        const o = {};
        for (const k of Object.keys(r)) {
          const p = pairs.find((x) => x[0] === k);
          o[p ? p[1] : k] = r[k];
        }
        for (const [from, to] of pairs) if (!(to in o)) o[to] = getField(r, from);
        return o;
      });
    },
  },
  Distinct: {
    min: 2,
    max: 2,
    *impl(args, ctx) {
      const { table, alias } = yield* lambdaRows(args, ctx);
      const out = [];
      for (const row of table) {
        const v = yield* ev(args[1], rowCtx(ctx, row, alias));
        if (!out.some((x) => fxEquals(x.Value, v))) out.push({ Value: v });
      }
      return out;
    },
  },
  GroupBy: {
    min: 3,
    max: Infinity,
    *impl(args, ctx) {
      const { table } = yield* lambdaRows(args, ctx);
      const names = [];
      for (let i = 1; i < args.length; i++) names.push(yield* colNameEval(args[i], ctx));
      const groupName = names.pop();
      const groups = [];
      for (const row of table) {
        const key = names.map((n) => getField(row, n));
        let g = groups.find((x) => x.key.every((k, i) => fxEquals(k, key[i])));
        if (!g) {
          g = { key, rows: [] };
          groups.push(g);
        }
        const rest = {};
        for (const k of Object.keys(row)) if (!names.includes(k)) rest[k] = row[k];
        g.rows.push(rest);
      }
      return groups.map((g) => {
        const o = {};
        names.forEach((n, i) => (o[n] = g.key[i]));
        o[groupName] = g.rows;
        return o;
      });
    },
  },
  Ungroup: {
    min: 2,
    max: 2,
    *impl(args, ctx) {
      const { table } = yield* lambdaRows(args, ctx);
      const name = yield* colNameEval(args[1], ctx);
      const out = [];
      for (const row of table) {
        const inner = asTable(getField(row, name));
        const base = {};
        for (const k of Object.keys(row)) if (k !== name) base[k] = row[k];
        for (const r of inner) out.push({ ...base, ...r });
      }
      return out;
    },
  },
  Table: eager((vals) => normalizeItems(vals), 0, Infinity),
  ForAll: {
    min: 2,
    max: 2,
    *impl(args, ctx) {
      const { table, alias } = yield* lambdaRows(args, ctx);
      const out = [];
      for (const row of [...table]) {
        const v = yield* ev(args[1], rowCtx(ctx, row, alias));
        out.push(isRecord(v) ? v : { Value: v });
      }
      return out;
    },
  },
  Shuffle: eager(([t]) => {
    const a = [...asTable(t)];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }, 1, 1),
  Defaults: {
    min: 1,
    max: 1,
    *impl(args, ctx) {
      const target = yield* targetOf(args[0], ctx);
      const rec = ctx.host.defaults ? ctx.host.defaults(target) : {};
      Object.defineProperty(rec, NEW_RECORD, { value: true, enumerable: false });
      return rec;
    },
  },
  DataSourceInfo: {
    min: 2,
    max: 3,
    *impl(args, ctx) {
      const target = yield* targetOf(args[0], ctx);
      const info = yield* ev(args[1], ctx);
      const col = args[2] ? yield* colNameEval(args[2], ctx) : null;
      return ctx.host.dataSourceInfo ? ctx.host.dataSourceInfo(target, enumName(info, ''), col) : null;
    },
  },
  Choices: {
    min: 1,
    max: 2,
    *impl(args, ctx) {
      const a = args[0];
      // Choices(Source.Colonne) ou Choices([@Source].Colonne)
      if (a.type === 'Member' && a.obj.type === 'Ident' && ctx.host.choices) {
        const r = ctx.host.choices(a.obj.name, a.name, ctx);
        if (r) return r;
      }
      const v = yield* ev(a, ctx);
      if (v && v.members instanceof Map) {
        const seen = new Set();
        const out = [];
        for (const m of v.members.values()) {
          if (seen.has(m)) continue;
          seen.add(m);
          out.push({ Value: m });
        }
        return out;
      }
      return Array.isArray(v) ? v : [];
    },
  },
  RecordInfo: eager(() => true, 2, 2),
  Errors: eager(() => [], 1, 2),
  Column: eager(([rec, name]) => getField(rec, toText(name)), 2, 2),
  ColumnNames: eager(([rec]) => (isRecord(unwrap(rec)) ? Object.keys(unwrap(rec)).map((Value) => ({ Value })) : []), 1, 1),
  // Patch(Record, Changes...) est pur ; Patch(Source, ...) est un comportement (voir plus bas)
});

// ---------------------------------------------------------------------------
// Couleurs
// ---------------------------------------------------------------------------

registerFunctions({
  RGBA: eager(([r, g, b, a]) => new FxColor(toNumber(r), toNumber(g), toNumber(b), isBlank(a) ? 1 : toNumber(a)), 4, 4),
  ColorValue: eager(([s]) => {
    const c = parseColorString(toText(s));
    if (!c) throw new FxRuntimeError(t('fx.invalidColor', { value: toText(s) }), 'InvalidArgument');
    return c;
  }, 1, 1),
  ColorFade: eager(([c, p]) => {
    if (!(c instanceof FxColor)) return c;
    const f = toNumber(p);
    const t = f < 0 ? 0 : 255;
    const k = Math.abs(f);
    return new FxColor(c.r + (t - c.r) * k, c.g + (t - c.g) * k, c.b + (t - c.b) * k, c.a);
  }, 2, 2),
});

// ---------------------------------------------------------------------------
// Fonctions liées à l'environnement
// ---------------------------------------------------------------------------

registerFunctions({
  User: eager((_, ctx) => (ctx.host.user ? ctx.host.user() : { FullName: t('fx.defaultUserName'), Email: 'user@contoso.com', Image: '' }), 0, 0),
  Param: eager(([n], ctx) => (ctx.host.param ? ctx.host.param(toText(n)) : null), 1, 1),
  Trace: eager(([m, sev, rec], ctx) => {
    ctx.host.trace?.(toText(m, ctx), sev, rec);
    return true;
  }, 1, 3),
});

// ---------------------------------------------------------------------------
// Comportements
// ---------------------------------------------------------------------------

function behavior(impl, min, max) {
  return { min, max, behavior: true, impl };
}

registerFunctions({
  Set: behavior(function* (args, ctx) {
    if (args[0]?.type !== 'Ident') throw new FxRuntimeError(t('fx.setNeedsVariable'), 'InvalidArgument');
    const v = yield* ev(args[1], ctx);
    ctx.host.setGlobal(args[0].name, v, ctx);
    return true;
  }, 2, 2),
  UpdateContext: behavior(function* (args, ctx) {
    const rec = yield* ev(args[0], ctx);
    if (isRecord(rec)) ctx.host.updateContext(rec, ctx);
    return true;
  }, 1, 1),
  Navigate: behavior(function* (args, ctx) {
    const target = yield* ev(args[0], ctx);
    const transition = args[1] ? yield* ev(args[1], ctx) : null;
    const rec = args[2] ? yield* ev(args[2], ctx) : null;
    ctx.host.navigate(target, transition, isRecord(rec) ? rec : null, ctx);
    return true;
  }, 1, 3),
  Back: behavior(function* (args, ctx) {
    ctx.host.back(ctx);
    return true;
  }, 0, 1),
  Collect: behavior(function* (args, ctx) {
    const target = yield* targetOf(args[0], ctx, true);
    const vals = [];
    for (let i = 1; i < args.length; i++) vals.push(yield* ev(args[i], ctx));
    const items = normalizeItems(vals);
    return ctx.host.collect(target, items, false, ctx);
  }, 2, Infinity),
  ClearCollect: behavior(function* (args, ctx) {
    const target = yield* targetOf(args[0], ctx, true);
    const vals = [];
    for (let i = 1; i < args.length; i++) vals.push(yield* ev(args[i], ctx));
    const items = normalizeItems(vals);
    return ctx.host.collect(target, items, true, ctx);
  }, 1, Infinity),
  Clear: behavior(function* (args, ctx) {
    const target = yield* targetOf(args[0], ctx, true);
    ctx.host.collect(target, [], true, ctx);
    return true;
  }, 1, 1),
  Patch: {
    min: 1,
    max: Infinity,
    *impl(args, ctx) {
      // Patch(record, changes...) : fusion pure
      const first = args[0];
      const isTargetIdent = first.type === 'Ident' && ctx.host.tableTarget(first.name, ctx, false);
      if (!isTargetIdent) {
        const base = yield* ev(first, ctx);
        if (isRecord(base) || isBlank(base)) {
          let out = copyRecord(base || {});
          for (let i = 1; i < args.length; i++) {
            const c = yield* ev(args[i], ctx);
            if (isRecord(c)) out = copyRecord(out, c);
          }
          return out;
        }
      }
      if (!ctx.behavior) {
        ctx.host.reportBehaviorInData?.('Patch', null, ctx);
        return null;
      }
      const target = yield* targetOf(first, ctx, true);
      const base = args[1] ? yield* ev(args[1], ctx) : null;
      const changes = [];
      for (let i = 2; i < args.length; i++) {
        const c = yield* ev(args[i], ctx);
        if (isRecord(c)) changes.push(c);
      }
      if (Array.isArray(base)) {
        const res = [];
        const chTable = changes.length && Array.isArray(changes[0]) ? changes[0] : null;
        for (let i = 0; i < base.length; i++) {
          const r = ctx.host.patch(target, base[i], chTable ? [chTable[i]] : changes, ctx);
          res.push(r && typeof r.then === 'function' ? yield r : r);
        }
        return res;
      }
      const r = ctx.host.patch(target, base, changes, ctx);
      if (r && typeof r.then === 'function') return yield r;
      return r;
    },
  },
  Remove: behavior(function* (args, ctx) {
    const target = yield* targetOf(args[0], ctx, false);
    const recs = [];
    for (let i = 1; i < args.length; i++) {
      const v = yield* ev(args[i], ctx);
      if (v instanceof FxEnum) continue; // RemoveFlags.All
      if (Array.isArray(v)) recs.push(...v);
      else if (isRecord(v)) recs.push(v);
    }
    const r = ctx.host.remove(target, recs, ctx);
    if (r && typeof r.then === 'function') yield r;
    return true;
  }, 2, Infinity),
  RemoveIf: behavior(function* (args, ctx) {
    const target = yield* targetOf(args[0], ctx, false);
    const rows = [...(target.rows || [])];
    const toRemove = [];
    for (const row of rows) {
      let ok = true;
      for (let i = 1; i < args.length && ok; i++) ok = toBool(yield* ev(args[i], rowCtx(ctx, row, null)));
      if (ok) toRemove.push(row);
    }
    ctx.host.remove(target, toRemove, ctx);
    return true;
  }, 2, Infinity),
  UpdateIf: behavior(function* (args, ctx) {
    const target = yield* targetOf(args[0], ctx, false);
    for (const row of [...(target.rows || [])]) {
      let matched = true;
      let i = 1;
      for (; i + 1 < args.length; i += 2) {
        if (toBool(yield* ev(args[i], rowCtx(ctx, row, null)))) {
          const ch = yield* ev(args[i + 1], rowCtx(ctx, row, null));
          if (isRecord(ch)) ctx.host.patch(target, row, [ch], ctx);
          break;
        }
        matched = false;
      }
      void matched;
    }
    return true;
  }, 3, Infinity),
  Update: behavior(function* (args, ctx) {
    const target = yield* targetOf(args[0], ctx, false);
    const old = yield* ev(args[1], ctx);
    const nw = yield* ev(args[2], ctx);
    ctx.host.patch(target, old, [nw], ctx, true);
    return true;
  }, 3, 4),
  Notify: behavior(function* (args, ctx) {
    const msg = toText(yield* ev(args[0], ctx), ctx);
    const type = args[1] ? yield* ev(args[1], ctx) : null;
    const timeout = args[2] ? toNumber(yield* ev(args[2], ctx)) : 10000;
    ctx.host.notify(msg, enumName(type, 'Information'), timeout);
    return true;
  }, 1, 3),
  Select: behavior(function* (args, ctx) {
    const ref = yield* ev(args[0], ctx);
    if (ref instanceof FxControlRef) {
      const r = ctx.host.select(ref, ctx);
      if (r && typeof r.then === 'function') yield r;
    }
    return true;
  }, 1, 3),
  Reset: behavior(function* (args, ctx) {
    const ref = yield* ev(args[0], ctx);
    if (ref instanceof FxControlRef) ctx.host.reset(ref, ctx);
    return true;
  }, 1, 1),
  SetFocus: behavior(function* (args, ctx) {
    const ref = yield* ev(args[0], ctx);
    if (ref instanceof FxControlRef) ctx.host.setFocus?.(ref, ctx);
    return true;
  }, 1, 1),
  SubmitForm: behavior(function* (args, ctx) {
    const ref = yield* ev(args[0], ctx);
    const r = ctx.host.formAction('submit', ref, ctx);
    if (r && typeof r.then === 'function') yield r;
    return true;
  }, 1, 1),
  ResetForm: behavior(function* (args, ctx) {
    ctx.host.formAction('reset', yield* ev(args[0], ctx), ctx);
    return true;
  }, 1, 1),
  NewForm: behavior(function* (args, ctx) {
    ctx.host.formAction('new', yield* ev(args[0], ctx), ctx);
    return true;
  }, 1, 1),
  EditForm: behavior(function* (args, ctx) {
    ctx.host.formAction('edit', yield* ev(args[0], ctx), ctx);
    return true;
  }, 1, 1),
  ViewForm: behavior(function* (args, ctx) {
    ctx.host.formAction('view', yield* ev(args[0], ctx), ctx);
    return true;
  }, 1, 1),
  Refresh: behavior(function* (args, ctx) {
    const target = yield* targetOf(args[0], ctx, false);
    const r = ctx.host.refresh?.(target, ctx);
    if (r && typeof r.then === 'function') yield r;
    return true;
  }, 1, 1),
  Revert: behavior(function* () {
    return true;
  }, 1, 2),
  Launch: behavior(function* (args, ctx) {
    const vals = yield* evArgs(args, ctx);
    ctx.host.launch?.(toText(vals[0], ctx), vals.slice(1));
    return true;
  }, 1, Infinity),
  Download: behavior(function* (args, ctx) {
    ctx.host.launch?.(toText(yield* ev(args[0], ctx), ctx), []);
    return true;
  }, 1, 1),
  Copy: behavior(function* (args, ctx) {
    ctx.host.copy?.(toText(yield* ev(args[0], ctx), ctx));
    return true;
  }, 1, 1),
  Exit: behavior(function* (args, ctx) {
    ctx.host.exit?.();
    return true;
  }, 0, 1),
  Concurrent: behavior(function* (args, ctx) {
    for (const a of args) yield* ev(a, ctx);
    return true;
  }, 1, Infinity),
  SaveData: behavior(function* (args, ctx) {
    const v = yield* ev(args[0], ctx);
    const name = toText(yield* ev(args[1], ctx), ctx);
    ctx.host.saveData?.(name, jsonOf(v, ctx));
    return true;
  }, 2, 2),
  LoadData: behavior(function* (args, ctx) {
    const target = yield* targetOf(args[0], ctx, true);
    const name = toText(yield* ev(args[1], ctx), ctx);
    const data = ctx.host.loadData?.(name);
    if (Array.isArray(data)) ctx.host.collect(target, data.map((r) => (isRecord(r) ? r : { Value: r })), true, ctx);
    return true;
  }, 2, 3),
  ClearData: behavior(function* (args, ctx) {
    const name = args[0] ? toText(yield* ev(args[0], ctx), ctx) : null;
    ctx.host.clearData?.(name);
    return true;
  }, 0, 1),
  'Clipboard.Copy': behavior(function* (args, ctx) {
    ctx.host.copy?.(toText(yield* ev(args[0], ctx), ctx));
    return true;
  }, 1, 1),
});

export { jsonOf, formatNumberDefault, FxScreenRef };
