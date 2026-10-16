// Conversion des valeurs Power Fx en styles CSS.
import { FxColor, FxEnum, FxOption, FxUntyped, parseColorString } from '../fx/values.js';
import { SHADOWS } from '../catalog/enums.js';
import { INTL_LOCALES, getLocale } from '../i18n/index.js';

export function cssColor(v, fallback) {
  if (v instanceof FxColor) return v.toCss();
  if (v instanceof FxUntyped) v = v.v;
  if (typeof v === 'string' && v) {
    const c = parseColorString(v);
    if (c) return c.toCss();
  }
  return fallback;
}

export function isTransparent(v) {
  return v instanceof FxColor && v.a === 0;
}

export function num(v, fallback = 0) {
  if (v instanceof FxUntyped) v = v.v;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
  if (typeof v === 'boolean') return v ? 1 : 0;
  return fallback;
}

/** Nombre ou null si vide (pour Layout*Max) */
export function numOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = num(v, NaN);
  return Number.isNaN(n) ? null : n;
}

export function bool(v, fallback = false) {
  if (v === null || v === undefined) return fallback;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') return v.toLowerCase() === 'true';
  if (v instanceof FxEnum) return String(v.name).toLowerCase() === 'true';
  return !!v;
}

/** Nom d'énumération normalisé en minuscules, sans espaces (ex: "iconbefore") */
export function enumKey(v, fallback = '') {
  if (v instanceof FxEnum) return String(v.name).toLowerCase().replace(/[\s_-]/g, '');
  if (v instanceof FxOption) return String(v.label).toLowerCase().replace(/[\s_-]/g, '');
  if (typeof v === 'string' && v) return v.toLowerCase().replace(/[\s_-]/g, '');
  return fallback;
}

/**
 * Valeur affichée en texte.
 * @param {string} [locale] langue de l'application émulée (ex. 'fr-FR') pour les dates ; à défaut, celle de l'interface
 */
export function text(v, locale) {
  if (v === null || v === undefined) return '';
  if (v instanceof FxUntyped) return text(v.v, locale);
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Number(v.toPrecision(15)));
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (v instanceof Date) return v.toLocaleString(locale || INTL_LOCALES[getLocale()]);
  if (v instanceof FxOption) return String(v.label ?? '');
  if (v instanceof FxEnum) return String(v.value ?? v.name);
  if (Array.isArray(v)) return '';
  if (typeof v === 'object') return '';
  return String(v);
}

const FONT_STACKS = {
  'open sans': "'Open Sans', 'Segoe UI', sans-serif",
  'open sans condensed': "'Open Sans Condensed', 'Open Sans', sans-serif",
  'segoe ui': "'Segoe UI', 'Segoe UI Web (West European)', -apple-system, BlinkMacSystemFont, Roboto, 'Helvetica Neue', sans-serif",
  lato: "'Lato', 'Segoe UI', sans-serif",
  'lato black': "'Lato', 'Segoe UI', sans-serif",
  'lato light': "'Lato', 'Segoe UI', sans-serif",
  'lato hairline': "'Lato', 'Segoe UI', sans-serif",
  montserrat: "'Montserrat', 'Segoe UI', sans-serif",
  arial: 'Arial, Helvetica, sans-serif',
  'courier new': "'Courier New', monospace",
  georgia: 'Georgia, serif',
  verdana: 'Verdana, sans-serif',
  helvetica: 'Helvetica, Arial, sans-serif',
  'times new roman': "'Times New Roman', serif",
  'trebuchet ms': "'Trebuchet MS', sans-serif",
  'dancing script': "'Dancing Script', cursive",
  'great vibes': "'Great Vibes', cursive",
  'patrick hand': "'Patrick Hand', cursive",
};

export const MODERN_FONT = FONT_STACKS['segoe ui'];
export const CLASSIC_FONT = FONT_STACKS['open sans'];

export function fontFamily(v, fallback) {
  let name = '';
  if (v instanceof FxEnum) name = v.name;
  else if (typeof v === 'string') name = v;
  name = name.replace(/^'|'$/g, '').trim().toLowerCase();
  if (!name) return fallback;
  return FONT_STACKS[name] || `'${name}', ${fallback}`;
}

export function fontWeight(v, fallback = 400) {
  const k = enumKey(v);
  switch (k) {
    case 'lighter':
    case 'light':
      return 300;
    case 'normal':
    case 'regular':
      return 400;
    case 'medium':
      return 500;
    case 'semibold':
      return 600;
    case 'bold':
      return 700;
    case 'extrabold':
    case 'black':
      return 800;
    default:
      return fallback;
  }
}

export function textAlign(v, fallback = 'left') {
  const k = enumKey(v);
  if (k === 'center') return 'center';
  if (k === 'right' || k === 'end') return 'right';
  if (k === 'justify') return 'justify';
  if (k === 'left' || k === 'start') return 'left';
  return fallback;
}

export function justifyFromAlign(v, fallback = 'flex-start') {
  const k = enumKey(v);
  if (k === 'center' || k === 'justify') return 'center';
  if (k === 'right' || k === 'end') return 'flex-end';
  if (k === 'left' || k === 'start') return 'flex-start';
  return fallback;
}

export function verticalAlign(v, fallback = 'center') {
  const k = enumKey(v);
  if (k === 'top') return 'flex-start';
  if (k === 'bottom') return 'flex-end';
  if (k === 'middle' || k === 'center') return 'center';
  return fallback;
}

export function shadow(v) {
  const k = enumKey(v, 'none');
  return SHADOWS[k] || 'none';
}

export function borderStyle(v, fallback = 'solid') {
  const k = enumKey(v);
  if (k === 'none') return 'none';
  if (k === 'dashed') return 'dashed';
  if (k === 'dotted') return 'dotted';
  if (k === 'solid') return 'solid';
  return fallback;
}

export function displayMode(v) {
  const k = enumKey(v, 'edit');
  return k === 'disabled' ? 'disabled' : k === 'view' ? 'view' : 'edit';
}

/** Taille de police en px : les contrôles classiques utilisent des points */
export function fontPx(size, family, fallback) {
  const n = num(size, NaN);
  const s = Number.isNaN(n) || n <= 0 ? fallback : n;
  return family === 'classic' ? (s * 4) / 3 : s;
}

/** Arrondis CSS à partir des 4 propriétés Radius* */
export function radius(inst, scale = 1) {
  const g = (p) => Math.max(0, num(inst.get(p), 0)) * scale;
  return `${g('RadiusTopLeft')}px ${g('RadiusTopRight')}px ${g('RadiusBottomRight')}px ${g('RadiusBottomLeft')}px`;
}

export function padding(inst) {
  const g = (p) => Math.max(0, num(inst.get(p), 0));
  return { top: g('PaddingTop'), right: g('PaddingRight'), bottom: g('PaddingBottom'), left: g('PaddingLeft') };
}

/** URL d'image Power Apps (texte, data URI, enregistrement de fichier) */
export function imageUrl(v) {
  if (v === null || v === undefined) return null;
  if (v instanceof FxUntyped) v = v.v;
  if (typeof v === 'string') {
    if (!v) return null;
    if (/^(https?:|data:|blob:|\/)/i.test(v)) return v;
    if (/^<svg/i.test(v)) return `data:image/svg+xml;utf8,${encodeURIComponent(v)}`;
    return null;
  }
  if (typeof v === 'object') {
    const u = v.Full ?? v.Url ?? v.url ?? v.Value ?? v.Thumbnail?.Large ?? null;
    return typeof u === 'string' ? imageUrl(u) : null;
  }
  return null;
}
