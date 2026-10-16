// Types de valeurs Power Fx utilisés par l'évaluateur.
import { t } from '../i18n/index.js';

export const DS = Symbol('dataSource'); // enregistrement -> source de données d'origine

export class FxColor {
  constructor(r, g, b, a = 1) {
    this.r = clamp255(r);
    this.g = clamp255(g);
    this.b = clamp255(b);
    this.a = Math.max(0, Math.min(1, Number.isFinite(a) ? a : 1));
  }
  toCss() {
    return `rgba(${this.r}, ${this.g}, ${this.b}, ${+this.a.toFixed(4)})`;
  }
  toHex() {
    const h = (n) => n.toString(16).padStart(2, '0');
    return `#${h(this.r)}${h(this.g)}${h(this.b)}`;
  }
  toFormula() {
    return `RGBA(${this.r}, ${this.g}, ${this.b}, ${+this.a.toFixed(4)})`;
  }
}

function clamp255(v) {
  const n = Math.round(Number(v) || 0);
  return Math.max(0, Math.min(255, n));
}

/** Valeur d'énumération (DisplayMode.Edit, LayoutDirection.Horizontal, ...) */
export class FxEnum {
  constructor(ns, name, value) {
    this.ns = ns;
    this.name = name;
    this.value = value === undefined ? name : value;
  }
  toString() {
    return String(this.value);
  }
}

/** Espace de noms d'énumération (Color, DisplayMode, option sets Dataverse...) */
export class FxEnumNs {
  constructor(ns, members = null, kind = 'enum') {
    this.ns = ns;
    this.members = members; // Map nom -> valeur ou null (indulgent)
    this.kind = kind;
  }
}

/** Valeur de choix Dataverse */
export class FxOption {
  constructor(ns, label, value) {
    this.ns = ns;
    this.label = label;
    this.value = value;
  }
  toString() {
    return String(this.label ?? this.value ?? '');
  }
}

/** Référence à un contrôle (Self, Parent, NomDuControle) */
export class FxControlRef {
  constructor(name, inst = null) {
    this.name = name;
    this.inst = inst;
  }
}

export class FxScreenRef {
  constructor(name) {
    this.name = name;
  }
  toString() {
    return this.name;
  }
}

/** Objet non typé (ParseJSON) */
export class FxUntyped {
  constructor(v) {
    this.v = v;
  }
}

/** Référence vers une source de données / table nommée utilisée comme "type" (AsType, IsType) */
export class FxNamespaceRef {
  constructor(name, kind) {
    this.name = name;
    this.kind = kind;
  }
}

export class FxRuntimeError extends Error {
  constructor(message, kind = 'Unknown', node = null) {
    super(message);
    this.kind = kind;
    this.node = node;
  }
}

export function isBlank(v) {
  return v === null || v === undefined || v === '' || (v instanceof FxUntyped && (v.v === null || v.v === undefined));
}

export function isTable(v) {
  return Array.isArray(v);
}

export function isRecord(v) {
  return (
    v !== null &&
    typeof v === 'object' &&
    !Array.isArray(v) &&
    !(v instanceof Date) &&
    !(v instanceof FxColor) &&
    !(v instanceof FxEnum) &&
    !(v instanceof FxEnumNs) &&
    !(v instanceof FxOption) &&
    !(v instanceof FxControlRef) &&
    !(v instanceof FxScreenRef) &&
    !(v instanceof FxUntyped) &&
    !(v instanceof FxNamespaceRef)
  );
}

export function typeName(v) {
  if (v === null || v === undefined) return 'Blank';
  if (typeof v === 'number') return 'Number';
  if (typeof v === 'string') return 'Text';
  if (typeof v === 'boolean') return 'Boolean';
  if (v instanceof Date) return 'DateTime';
  if (v instanceof FxColor) return 'Color';
  if (v instanceof FxEnum) return `Enum (${v.ns})`;
  if (v instanceof FxOption) return t('fx.typeChoice', { ns: v.ns });
  if (v instanceof FxControlRef) return t('fx.typeControl');
  if (v instanceof FxScreenRef) return t('fx.typeScreen');
  if (v instanceof FxUntyped) return 'UntypedObject';
  if (Array.isArray(v)) return 'Table';
  if (v instanceof FxEnumNs) return t('fx.typeEnumeration');
  if (typeof v === 'object') return 'Record';
  return typeof v;
}

const NAMED_COLORS = {
  AliceBlue: [240, 248, 255], AntiqueWhite: [250, 235, 215], Aqua: [0, 255, 255], Aquamarine: [127, 255, 212], Azure: [240, 255, 255],
  Beige: [245, 245, 220], Bisque: [255, 228, 196], Black: [0, 0, 0], BlanchedAlmond: [255, 235, 205], Blue: [0, 0, 255],
  BlueViolet: [138, 43, 226], Brown: [165, 42, 42], BurlyWood: [222, 184, 135], CadetBlue: [95, 158, 160], Chartreuse: [127, 255, 0],
  Chocolate: [210, 105, 30], Coral: [255, 127, 80], CornflowerBlue: [100, 149, 237], Cornsilk: [255, 248, 220], Crimson: [220, 20, 60],
  Cyan: [0, 255, 255], DarkBlue: [0, 0, 139], DarkCyan: [0, 139, 139], DarkGoldenRod: [184, 134, 11], DarkGray: [169, 169, 169],
  DarkGreen: [0, 100, 0], DarkGrey: [169, 169, 169], DarkKhaki: [189, 183, 107], DarkMagenta: [139, 0, 139], DarkOliveGreen: [85, 107, 47],
  DarkOrange: [255, 140, 0], DarkOrchid: [153, 50, 204], DarkRed: [139, 0, 0], DarkSalmon: [233, 150, 122], DarkSeaGreen: [143, 188, 143],
  DarkSlateBlue: [72, 61, 139], DarkSlateGray: [47, 79, 79], DarkSlateGrey: [47, 79, 79], DarkTurquoise: [0, 206, 209], DarkViolet: [148, 0, 211],
  DeepPink: [255, 20, 147], DeepSkyBlue: [0, 191, 255], DimGray: [105, 105, 105], DimGrey: [105, 105, 105], DodgerBlue: [30, 144, 255],
  FireBrick: [178, 34, 34], FloralWhite: [255, 250, 240], ForestGreen: [34, 139, 34], Fuchsia: [255, 0, 255], Gainsboro: [220, 220, 220],
  GhostWhite: [248, 248, 255], Gold: [255, 215, 0], GoldenRod: [218, 165, 32], Gray: [128, 128, 128], Green: [0, 128, 0],
  GreenYellow: [173, 255, 47], Grey: [128, 128, 128], HoneyDew: [240, 255, 240], HotPink: [255, 105, 180], IndianRed: [205, 92, 92],
  Indigo: [75, 0, 130], Ivory: [255, 255, 240], Khaki: [240, 230, 140], Lavender: [230, 230, 250], LavenderBlush: [255, 240, 245],
  LawnGreen: [124, 252, 0], LemonChiffon: [255, 250, 205], LightBlue: [173, 216, 230], LightCoral: [240, 128, 128], LightCyan: [224, 255, 255],
  LightGoldenRodYellow: [250, 250, 210], LightGray: [211, 211, 211], LightGreen: [144, 238, 144], LightGrey: [211, 211, 211], LightPink: [255, 182, 193],
  LightSalmon: [255, 160, 122], LightSeaGreen: [32, 178, 170], LightSkyBlue: [135, 206, 250], LightSlateGray: [119, 136, 153], LightSlateGrey: [119, 136, 153],
  LightSteelBlue: [176, 196, 222], LightYellow: [255, 255, 224], Lime: [0, 255, 0], LimeGreen: [50, 205, 50], Linen: [250, 240, 230],
  Magenta: [255, 0, 255], Maroon: [128, 0, 0], MediumAquamarine: [102, 205, 170], MediumBlue: [0, 0, 205], MediumOrchid: [186, 85, 211],
  MediumPurple: [147, 112, 219], MediumSeaGreen: [60, 179, 113], MediumSlateBlue: [123, 104, 238], MediumSpringGreen: [0, 250, 154], MediumTurquoise: [72, 209, 204],
  MediumVioletRed: [199, 21, 133], MidnightBlue: [25, 25, 112], MintCream: [245, 255, 250], MistyRose: [255, 228, 225], Moccasin: [255, 228, 181],
  NavajoWhite: [255, 222, 173], Navy: [0, 0, 128], OldLace: [253, 245, 230], Olive: [128, 128, 0], OliveDrab: [107, 142, 35],
  Orange: [255, 165, 0], OrangeRed: [255, 69, 0], Orchid: [218, 112, 214], PaleGoldenRod: [238, 232, 170], PaleGreen: [152, 251, 152],
  PaleTurquoise: [175, 238, 238], PaleVioletRed: [219, 112, 147], PapayaWhip: [255, 239, 213], PeachPuff: [255, 218, 185], Peru: [205, 133, 63],
  Pink: [255, 192, 203], Plum: [221, 160, 221], PowderBlue: [176, 224, 230], Purple: [128, 0, 128], Red: [255, 0, 0],
  RosyBrown: [188, 143, 143], RoyalBlue: [65, 105, 225], SaddleBrown: [139, 69, 19], Salmon: [250, 128, 114], SandyBrown: [244, 164, 96],
  SeaGreen: [46, 139, 87], SeaShell: [255, 245, 238], Sienna: [160, 82, 45], Silver: [192, 192, 192], SkyBlue: [135, 206, 235],
  SlateBlue: [106, 90, 205], SlateGray: [112, 128, 144], SlateGrey: [112, 128, 144], Snow: [255, 250, 250], SpringGreen: [0, 255, 127],
  SteelBlue: [70, 130, 180], Tan: [210, 180, 140], Teal: [0, 128, 128], Thistle: [216, 191, 216], Tomato: [255, 99, 71],
  Turquoise: [64, 224, 208], Violet: [238, 130, 238], Wheat: [245, 222, 179], White: [255, 255, 255], WhiteSmoke: [245, 245, 245],
  Yellow: [255, 255, 0], YellowGreen: [154, 205, 50],
};

const COLOR_INDEX = new Map(Object.entries(NAMED_COLORS).map(([k, v]) => [k.toLowerCase(), v]));


export function namedColor(name) {
  const k = String(name).toLowerCase();
  if (k === 'transparent') return new FxColor(0, 0, 0, 0);
  const c = COLOR_INDEX.get(k);
  return c ? new FxColor(c[0], c[1], c[2], 1) : null;
}

/** ColorValue("#RRGGBB" | "#RRGGBBAA" | "Red") */
export function parseColorString(s) {
  if (s == null) return null;
  const str = String(s).trim();
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(str);
  if (m && (str.startsWith('#') || m[1].length !== 3)) {
    let h = m[1];
    if (h.length === 3) h = h.split('').map((x) => x + x).join('');
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
    return new FxColor(r, g, b, a);
  }
  const rgba = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(str);
  if (rgba) return new FxColor(+rgba[1], +rgba[2], +rgba[3], rgba[4] != null ? +rgba[4] : 1);
  return namedColor(str);
}
