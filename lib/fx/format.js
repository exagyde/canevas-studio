// Formatage Text() / analyse de dates pour l'émulateur Power Fx.
import { FxEnum } from './values.js';

const MONTHS_CACHE = new Map();
function monthNames(locale, style) {
  const key = `${locale}|${style}`;
  if (!MONTHS_CACHE.has(key)) {
    const arr = [];
    for (let m = 0; m < 12; m++) {
      try {
        arr.push(new Date(2020, m, 1).toLocaleDateString(locale, { month: style }));
      } catch {
        arr.push(new Date(2020, m, 1).toLocaleDateString('en-US', { month: style }));
      }
    }
    MONTHS_CACHE.set(key, arr);
  }
  return MONTHS_CACHE.get(key);
}

function dayNames(locale, style) {
  const key = `d|${locale}|${style}`;
  if (!MONTHS_CACHE.has(key)) {
    const arr = [];
    // 2020-03-01 est un dimanche
    for (let d = 0; d < 7; d++) {
      try {
        arr.push(new Date(2020, 2, 1 + d).toLocaleDateString(locale, { weekday: style }));
      } catch {
        arr.push(new Date(2020, 2, 1 + d).toLocaleDateString('en-US', { weekday: style }));
      }
    }
    MONTHS_CACHE.set(key, arr);
  }
  return MONTHS_CACHE.get(key);
}

export function calendarNames(locale) {
  return {
    monthsLong: monthNames(locale, 'long'),
    monthsShort: monthNames(locale, 'short'),
    weekdaysLong: dayNames(locale, 'long'),
    weekdaysShort: dayNames(locale, 'short'),
  };
}

const pad = (n, w = 2) => String(n).padStart(w, '0');

function extractLocale(fmt, fallback) {
  const m = /^\[\$-([A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,4})?)\]/.exec(fmt);
  if (m) return { fmt: fmt.slice(m[0].length), locale: m[1] };
  return { fmt, locale: fallback };
}

function isDateFormat(fmt) {
  const stripped = fmt.replace(/"[^"]*"|\\./g, '');
  if (/[#0]/.test(stripped)) return false;
  return /[ydhmsYDHMS]/.test(stripped);
}

export function formatDateEnum(d, enumName, locale) {
  const opts = {
    ShortDate: { year: 'numeric', month: '2-digit', day: '2-digit' },
    LongDate: { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' },
    ShortTime: { hour: '2-digit', minute: '2-digit' },
    ShortTime24: { hour: '2-digit', minute: '2-digit', hour12: false },
    LongTime: { hour: '2-digit', minute: '2-digit', second: '2-digit' },
    LongTime24: { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false },
    ShortDateTime: { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' },
    ShortDateTime24: { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false },
    LongDateTime: { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' },
    LongDateTime24: { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false },
  };
  if (enumName === 'UTC') return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
  try {
    return d.toLocaleString(locale, opts[enumName] || opts.ShortDateTime);
  } catch {
    return d.toISOString();
  }
}

export function formatDate(d, fmtIn, localeIn) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return '';
  const { fmt, locale } = extractLocale(fmtIn, localeIn);
  const names = calendarNames(locale);
  let out = '';
  let i = 0;
  const tokens = [];
  while (i < fmt.length) {
    const c = fmt[i];
    if (c === '"') {
      const j = fmt.indexOf('"', i + 1);
      const lit = j < 0 ? fmt.slice(i + 1) : fmt.slice(i + 1, j);
      tokens.push({ lit });
      i = j < 0 ? fmt.length : j + 1;
      continue;
    }
    if (c === '\\') {
      tokens.push({ lit: fmt[i + 1] ?? '' });
      i += 2;
      continue;
    }
    if (/^(AM\/PM|am\/pm|A\/P|a\/p)/.test(fmt.slice(i))) {
      const m = /^(AM\/PM|am\/pm|A\/P|a\/p)/.exec(fmt.slice(i))[0];
      tokens.push({ ampm: m });
      i += m.length;
      continue;
    }
    const lc = c.toLowerCase();
    if ('ydhmsf'.includes(lc)) {
      let j = i;
      while (j < fmt.length && fmt[j].toLowerCase() === lc) j++;
      tokens.push({ tok: lc, len: j - i, raw: fmt.slice(i, j) });
      i = j;
      continue;
    }
    tokens.push({ lit: c });
    i++;
  }
  const hasAmPm = tokens.some((t) => t.ampm);
  for (let k = 0; k < tokens.length; k++) {
    const t = tokens[k];
    if (t.lit !== undefined) {
      out += t.lit;
      continue;
    }
    if (t.ampm) {
      const pm = d.getHours() >= 12;
      let s = t.ampm.length > 3 ? (pm ? 'PM' : 'AM') : pm ? 'P' : 'A';
      if (t.ampm[0] === 'a') s = s.toLowerCase();
      out += s;
      continue;
    }
    const { tok, len } = t;
    if (tok === 'y') out += len <= 2 ? pad(d.getFullYear() % 100) : String(d.getFullYear());
    else if (tok === 'd') {
      if (len === 1) out += d.getDate();
      else if (len === 2) out += pad(d.getDate());
      else if (len === 3) out += names.weekdaysShort[d.getDay()];
      else out += names.weekdaysLong[d.getDay()];
    } else if (tok === 'h') {
      let h = d.getHours();
      if (hasAmPm) h = h % 12 || 12;
      out += len >= 2 ? pad(h) : String(h);
    } else if (tok === 's') out += len >= 2 ? pad(d.getSeconds()) : String(d.getSeconds());
    else if (tok === 'f') out += String(d.getMilliseconds()).padStart(3, '0').slice(0, len);
    else if (tok === 'm') {
      // minutes si précédé d'heures ou suivi de secondes
      const prev = tokens.slice(0, k).reverse().find((x) => x.tok);
      const next = tokens.slice(k + 1).find((x) => x.tok);
      const isMinute = (prev && prev.tok === 'h') || (next && next.tok === 's');
      if (isMinute && len <= 2) out += len === 2 ? pad(d.getMinutes()) : String(d.getMinutes());
      else if (len === 1) out += d.getMonth() + 1;
      else if (len === 2) out += pad(d.getMonth() + 1);
      else if (len === 3) out += names.monthsShort[d.getMonth()];
      else out += names.monthsLong[d.getMonth()];
    }
  }
  return out;
}

export function formatNumber(n, fmtIn, localeIn) {
  const { fmt, locale } = extractLocale(fmtIn, localeIn);
  if (!Number.isFinite(n)) return String(n);
  // sections ; positif;négatif;zéro
  const sections = splitSections(fmt);
  let section = sections[0];
  let value = n;
  if (n < 0 && sections[1] !== undefined) {
    section = sections[1];
    value = Math.abs(n);
  } else if (n === 0 && sections[2] !== undefined) section = sections[2];

  // repère la partie numérique
  let prefix = '';
  let suffix = '';
  let numPart = '';
  let i = 0;
  let state = 'prefix';
  let percent = false;
  while (i < section.length) {
    const c = section[i];
    if (c === '"') {
      const j = section.indexOf('"', i + 1);
      const lit = j < 0 ? section.slice(i + 1) : section.slice(i + 1, j);
      if (state === 'prefix') prefix += lit;
      else {
        state = 'suffix';
        suffix += lit;
      }
      i = j < 0 ? section.length : j + 1;
      continue;
    }
    if (c === '\\') {
      const lit = section[i + 1] ?? '';
      if (state === 'prefix') prefix += lit;
      else {
        state = 'suffix';
        suffix += lit;
      }
      i += 2;
      continue;
    }
    if ('#0,.'.includes(c) && state !== 'suffix') {
      state = 'num';
      numPart += c;
      i++;
      continue;
    }
    if (c === '%') percent = true;
    if (state === 'prefix') prefix += c;
    else {
      state = 'suffix';
      suffix += c;
    }
    i++;
  }
  if (percent) value *= 100;
  const [intPat, decPat = ''] = numPart.split('.');
  const grouping = intPat.includes(',');
  // virgules finales = division par 1000
  let scale = 0;
  const trailing = /,+$/.exec(intPat);
  if (trailing && numPart.indexOf('.') < 0) scale = trailing[0].length;
  if (scale) value = value / Math.pow(1000, scale);
  const minInt = (intPat.replace(/,/g, '').match(/0/g) || []).length;
  const minDec = (decPat.match(/0/g) || []).length;
  const maxDec = (decPat.match(/[0#]/g) || []).length;
  let body;
  try {
    body = new Intl.NumberFormat(locale, {
      minimumIntegerDigits: Math.max(1, minInt),
      minimumFractionDigits: minDec,
      maximumFractionDigits: maxDec,
      useGrouping: grouping,
    }).format(value);
    if (minInt === 0 && Math.abs(value) < 1 && numPart) body = body.replace(/^(-?)0(?=\D)/, '$1');
  } catch {
    body = value.toFixed(maxDec);
  }
  if (!numPart) body = '';
  return prefix + body + suffix;
}

function splitSections(fmt) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < fmt.length; i++) {
    const c = fmt[i];
    if (c === '"') inQ = !inQ;
    if (c === ';' && !inQ) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += c;
  }
  out.push(cur);
  return out;
}

export function fxText(value, format, locale) {
  if (format instanceof FxEnum) {
    if (value instanceof Date) return formatDateEnum(value, format.name, locale);
    return String(value ?? '');
  }
  if (format === null || format === undefined || format === '') return null;
  const f = String(format);
  if (value instanceof Date) return formatDate(value, f, locale);
  if (typeof value === 'number') {
    if (isDateFormat(f.replace(/^\[\$-[^\]]+\]/, ''))) {
      // nombre interprété comme date (numéro de série)
      return formatDate(new Date((value - 25569) * 86400000), f, locale);
    }
    return formatNumber(value, f, locale);
  }
  if (typeof value === 'string') {
    const num = Number(value);
    if (value.trim() !== '' && !Number.isNaN(num) && !isDateFormat(f)) return formatNumber(num, f, locale);
    if (isDateFormat(f)) {
      const d = parseDateText(value, locale);
      if (d) return formatDate(d, f, locale);
    }
    return value;
  }
  return null;
}

/** Analyse une date texte (ISO, jj/mm/aaaa, mm/jj/aaaa selon la langue) */
export function parseDateText(s, locale = 'fr-FR') {
  if (s instanceof Date) return s;
  if (s === null || s === undefined) return null;
  const str = String(s).trim();
  if (!str) return null;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?(Z|[+-]\d{2}:?\d{2})?$/.exec(str);
  if (m) {
    if (m[7]) return new Date(str);
    return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  }
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(str);
  if (m) {
    const us = /^en-US/i.test(locale);
    const day = us ? +m[2] : +m[1];
    const month = us ? +m[1] : +m[2];
    let year = +m[3];
    if (year < 100) year += 2000;
    return new Date(year, month - 1, day, +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  }
  const t = Date.parse(str);
  return Number.isNaN(t) ? null : new Date(t);
}
