// Construction de l'arbre d'instances d'un écran : évaluation paresseuse des propriétés + mise en page.
import { parseFormula, evaluateSync, FxControlRef, FxEnum, FxRuntimeError, isBlank, isRecord, asTable, toBool } from '../fx/index.js';
import { controlDef, SCREEN_DEF, COMPONENT_DEF } from '../catalog/controls.js';
import { isInstanceSide } from '../project/customProps.js';
import { num, numOrNull, bool, enumKey, fontFamily, fontWeight, fontPx, text, MODERN_FONT, CLASSIC_FONT } from './style.js';
import { measureTextHeight } from './measure.js';
import { t } from '../i18n/index.js';

const GEOM = new Set(['X', 'Y', 'Width', 'Height']);
const MAX_GALLERY_ITEMS = 200;

// ---------------------------------------------------------------------------
// Instance
// ---------------------------------------------------------------------------

export class Inst {
  constructor(rt, node, def, parent, opts = {}) {
    this.rt = rt;
    this.node = node;
    this.def = def;
    this.parent = parent;
    this.name = node.name;
    this.kind = opts.kind || 'control';
    this.key = opts.key;
    this.screen = opts.screen;
    this.scopes = opts.scopes || parent?.scopes || [];
    this.galleryItem = opts.galleryItem || null;
    this.component = opts.component || parent?.component || null;
    this.template = !!opts.template;
    this.cache = new Map();
    this.cacheVersion = rt.version;
    this.evaluating = new Set();
    this.layout = null;
    this.children = [];
    this.items = null;
    this.visible = true;
    this.ref = new FxControlRef(this.name, this);
    this.errors = null;
  }

  get state() {
    return this.rt.controlState(this.key);
  }

  formula(prop) {
    const f = this.node.properties?.[prop];
    if (f !== undefined) return f;
    // Composant : valeur par défaut des propriétés personnalisées d'entrée / d'événement
    const comp = this.kind === 'componentRoot' ? this.componentDef : this.componentDefNode;
    if (comp) {
      const cp = comp.customProperties?.[prop];
      if (cp && typeof cp === 'object' && isInstanceSide(cp.PropertyKind) && cp.Default !== undefined && cp.Default !== null) return String(cp.Default);
      // la taille d'une instance est par défaut celle du composant
      if (this.kind !== 'componentRoot' && (prop === 'Width' || prop === 'Height') && comp.properties?.[prop] !== undefined) return comp.properties[prop];
    }
    return this.def.defaults?.[prop];
  }

  isExplicit(prop) {
    return this.node.properties?.[prop] !== undefined;
  }

  ctx(extra) {
    return {
      host: this.rt,
      scopes: this.scopes,
      self: this.ref,
      parent: this.parent ? this.parent.ref : null,
      behavior: false,
      screen: this.screen,
      inst: this,
      ...extra,
    };
  }

  checkCache() {
    if (this.cacheVersion !== this.rt.version) {
      this.cache.clear();
      this.cacheVersion = this.rt.version;
    }
  }

  get(prop) {
    if (this.layout && GEOM.has(prop)) {
      if (prop === 'X') return this.layout.x;
      if (prop === 'Y') return this.layout.y;
      if (prop === 'Width') return this.layout.w;
      return this.layout.h;
    }
    const out = OUTPUTS[this.def.id]?.[prop] || (this.kind === 'screen' ? SCREEN_OUTPUTS[prop] : null);
    if (out) return out(this);
    return this.evalFormula(prop);
  }

  evalFormula(prop, formulaOverride) {
    this.checkCache();
    const cacheKey = formulaOverride === undefined ? prop : `${prop}§${formulaOverride}`;
    if (this.cache.has(cacheKey)) return this.cache.get(cacheKey);
    let formula = formulaOverride === undefined ? this.formula(prop) : formulaOverride;
    if (formula === undefined) return null;
    if (this.evaluating.has(cacheKey)) return null; // référence circulaire
    if (formula === '=' || formula === '') {
      this.cache.set(cacheKey, null);
      return null;
    }
    if (typeof formula !== 'string') formula = String(formula);
    if (!formula.startsWith('=')) {
      // valeur sans "=" (invalide dans Power Apps) : on l'interprète comme texte
      this.cache.set(cacheKey, formula);
      return formula;
    }
    const { ast, error } = parseFormula(formula);
    let value = null;
    if (error) {
      this.addError(prop, error.message);
    } else {
      this.evaluating.add(cacheKey);
      try {
        value = evaluateSync(ast, this.ctx());
      } catch (e) {
        if (e instanceof FxRuntimeError) this.addError(prop, e.message);
        else this.addError(prop, t('catalog.internalError', { message: e?.message || e }));
        value = null;
      } finally {
        this.evaluating.delete(cacheKey);
      }
    }
    this.cache.set(cacheKey, value);
    return value;
  }

  addError(prop, message) {
    if (!this.errors) this.errors = {};
    this.errors[prop] = message;
    this.rt.reportRuntimeError?.(this, prop, message);
  }

  /** Recherche d'un descendant par nom (même élément de galerie) */
  findLocal(name) {
    return this.byName?.get(name) || null;
  }
}

// ---------------------------------------------------------------------------
// Sorties (propriétés calculées par l'état du contrôle)
// ---------------------------------------------------------------------------

function firstText(v) {
  if (isRecord(v)) {
    if ('Value' in v) return v.Value;
    const k = Object.keys(v)[0];
    return k ? v[k] : null;
  }
  return v;
}

function itemsOf(inst, prop = 'Items') {
  return asTable(inst.evalFormula(prop));
}

function selectedItems(inst) {
  const st = inst.state;
  if (st.selectedItems) return st.selectedItems;
  const def = inst.evalFormula('DefaultSelectedItems');
  if (!isBlank(def)) return asTable(def);
  const d = inst.evalFormula('Default');
  if (!isBlank(d)) {
    const items = itemsOf(inst);
    const match = items.find((r) => text(firstText(r)) === text(firstText(d)) || r === d);
    return match ? [match] : isRecord(d) ? [d] : [{ Value: d }];
  }
  return [];
}

const inputText = (inst) => {
  const st = inst.state;
  if (st.text !== undefined) return st.text;
  const v = inst.def.id === 'ClassicTextInput' ? inst.evalFormula('Default') : inst.isExplicit('Value') ? inst.evalFormula('Value') : inst.evalFormula('Default');
  return v === null || v === undefined ? '' : text(v, inst.rt.locale);
};

const checked = (inst) => {
  const st = inst.state;
  if (st.checked !== undefined) return st.checked;
  const p = inst.def.id.startsWith('Classic') ? 'Default' : 'Checked';
  return bool(inst.evalFormula(p), false);
};

const numericValue = (inst) => {
  const st = inst.state;
  if (st.value !== undefined) return st.value;
  return num(inst.evalFormula(inst.isExplicit('Value') ? 'Value' : 'Default'), 0);
};

const dateValue = (inst) => {
  const st = inst.state;
  if (st.date !== undefined) return st.date;
  const v = inst.evalFormula(inst.isExplicit('SelectedDate') ? 'SelectedDate' : 'DefaultDate');
  return v instanceof Date ? v : null;
};

function galleryItems(inst) {
  inst.checkCache();
  if (inst.cache.has('§AllItems')) return inst.cache.get('§AllItems');
  const items = itemsOf(inst);
  inst.cache.set('§AllItems', items);
  return items;
}

function gallerySelected(inst) {
  const items = galleryItems(inst);
  const st = inst.state;
  if (st.selectedIndex !== undefined && items[st.selectedIndex]) return items[st.selectedIndex];
  inst.checkCache();
  if (inst.cache.has('§Selected')) return inst.cache.get('§Selected');
  inst.cache.set('§Selected', items[0] ?? null); // garde anti-récursion
  let sel = null;
  if (inst.isExplicit('Default')) {
    const d = inst.evalFormula('Default');
    if (isRecord(d)) sel = items.find((r) => r === d) || d;
  }
  if (!sel) sel = items[0] ?? null;
  inst.cache.set('§Selected', sel);
  return sel;
}

function templateSize(inst) {
  return Math.max(1, num(inst.evalFormula('TemplateSize'), 160));
}

function galleryOrientation(inst) {
  const v = String(inst.node.head?.Variant || '');
  return /horizontal/i.test(v) ? 'horizontal' : 'vertical';
}

function formMode(inst) {
  const st = inst.state;
  if (st.mode) return st.mode;
  const m = inst.evalFormula('DefaultMode');
  return enumKey(m, 'edit') || 'edit';
}

function formItem(inst) {
  const st = inst.state;
  if (formMode(inst) === 'new') return st.newRecord || {};
  if (st.item !== undefined) return st.item;
  const it = inst.evalFormula('Item');
  return isRecord(it) ? it : it ?? null;
}

function cardsOf(formInst) {
  const out = [];
  const visit = (i) => {
    for (const c of i.children) {
      if (c.def.id === 'TypedDataCard') out.push(c);
      else visit(c);
    }
  };
  visit(formInst);
  return out;
}

function formUpdates(inst) {
  const rec = {};
  for (const card of cardsOf(inst)) {
    const field = text(card.evalFormula('DataField'));
    if (!field) continue;
    rec[field] = card.evalFormula('Update');
  }
  return rec;
}

export const OUTPUTS = {
  ModernTextInput: { Value: inputText, Text: inputText },
  ClassicTextInput: { Text: inputText, Value: inputText },
  ModernNumberInput: { Value: numericValue },
  ModernCombobox: {
    Selected: (i) => selectedItems(i)[0] ?? null,
    SelectedItems: (i) => selectedItems(i),
    SearchText: (i) => i.state.search ?? '',
  },
  ClassicComboBox: {
    Selected: (i) => selectedItems(i)[0] ?? null,
    SelectedItems: (i) => selectedItems(i),
    SearchText: (i) => i.state.search ?? '',
  },
  ModernDropdown: {
    Selected: (i) => selectedItems(i)[0] ?? itemsOf(i)[0] ?? null,
    SelectedItems: (i) => (selectedItems(i).length ? selectedItems(i) : itemsOf(i).slice(0, 1)),
  },
  ClassicDropDown: {
    Selected: (i) => selectedItems(i)[0] ?? (bool(i.evalFormula('AllowEmptySelection')) ? null : itemsOf(i)[0] ?? null),
    SelectedText: (i) => {
      const s = selectedItems(i)[0] ?? itemsOf(i)[0];
      return s ? { Value: text(firstText(s)) } : null;
    },
  },
  ModernTabList: { Selected: (i) => selectedItems(i)[0] ?? itemsOf(i)[0] ?? null },
  ClassicListBox: { Selected: (i) => selectedItems(i)[0] ?? null, SelectedItems: (i) => selectedItems(i) },
  ModernRadio: { Selected: (i) => selectedItems(i)[0] ?? null },
  ClassicRadio: { Selected: (i) => selectedItems(i)[0] ?? null },
  ModernCheckbox: { Checked: checked, Value: checked },
  ModernToggle: { Checked: checked, Value: checked },
  ClassicCheckBox: { Value: checked },
  ClassicToggle: { Value: checked },
  ClassicSlider: { Value: numericValue },
  ClassicRating: { Value: numericValue },
  ModernDatePicker: { SelectedDate: dateValue, Value: dateValue },
  ClassicDatePicker: { SelectedDate: dateValue, Value: dateValue },
  ModernTable: { Selected: (i) => (i.state.selectedIndex !== undefined ? itemsOf(i)[i.state.selectedIndex] : itemsOf(i)[0]) ?? null },
  RichTextEditor: { HtmlText: (i) => (i.state.text !== undefined ? i.state.text : text(i.evalFormula('Default'), i.rt.locale)) },
  Timer: { Value: (i) => i.state.elapsed ?? 0 },
  Gallery: {
    AllItems: galleryItems,
    AllItemsCount: (i) => galleryItems(i).length,
    Selected: gallerySelected,
    TemplateHeight: (i) => (galleryOrientation(i) === 'horizontal' ? Math.max(0, num(i.get('Height')) - 2 * num(i.evalFormula('TemplatePadding'))) : templateSize(i)),
    TemplateWidth: (i) => {
      if (galleryOrientation(i) === 'horizontal') return templateSize(i);
      const wrap = Math.max(1, Math.floor(num(i.evalFormula('WrapCount'), 1)));
      const pad = num(i.evalFormula('TemplatePadding'));
      return Math.max(0, (num(i.get('Width')) - pad * (wrap + 1)) / wrap);
    },
    VisibleIndex: () => 1,
  },
  Form: {
    Item: formItem,
    Mode: (i) => new FxEnum('FormMode', { new: 'New', view: 'View' }[formMode(i)] || 'Edit'),
    DisplayMode: (i) => {
      if (i.isExplicit('DisplayMode')) return i.evalFormula('DisplayMode');
      return new FxEnum('DisplayMode', formMode(i) === 'view' ? 'View' : 'Edit');
    },
    LastSubmit: (i) => i.state.lastSubmit ?? null,
    Unsaved: (i) => !!i.state.dirty,
    Updates: formUpdates,
    Valid: (i) => cardsOf(i).every((c) => !bool(c.evalFormula('Required')) || !isBlank(c.evalFormula('Update'))),
    Error: (i) => i.state.error ?? '',
    ErrorKind: (i) => new FxEnum('ErrorKind', i.state.error ? 'Validation' : 'None'),
  },
  TypedDataCard: {
    Error: (i) => i.state.error ?? '',
    Valid: (i) => !bool(i.evalFormula('Required')) || !isBlank(i.evalFormula('Update')),
  },
};

const SCREEN_OUTPUTS = {
  Width: (i) => i.rt.size.width,
  Height: (i) => i.rt.size.height,
  X: () => 0,
  Y: () => 0,
  DisplayMode: () => new FxEnum('DisplayMode', 'Edit'),
  Size: (i) => {
    const w = i.rt.size.width;
    return w < 600 ? 1 : w < 900 ? 2 : w < 1200 ? 3 : 4;
  },
  Orientation: (i) => new FxEnum('Layout', i.rt.size.width >= i.rt.size.height ? 'Horizontal' : 'Vertical'),
  Name: (i) => i.name,
};

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

/**
 * Construit l'arbre d'instances d'un écran et calcule sa mise en page.
 * @returns {Inst} instance racine (écran)
 */
export function buildScreen(rt, screenNode) {
  const reg = new Map();
  rt.beginBuild(reg);
  const root = new Inst(rt, screenNode, SCREEN_DEF, null, { kind: 'screen', key: screenNode.name, screen: screenNode.name, scopes: [] });
  root.layout = { x: 0, y: 0, w: rt.size.width, h: rt.size.height };
  root.children = createChildren(rt, root, screenNode.children || [], reg, screenNode.name);
  layoutAbsolute(root);
  rt.endBuild(root);
  return root;
}

function createInst(rt, node, parent, reg, screen, opts = {}) {
  const def = controlDef(node);
  const key = opts.key || `${parent.key}/${node.name}`;
  const inst = new Inst(rt, node, def, parent, { key, screen, scopes: opts.scopes, galleryItem: opts.galleryItem, template: opts.template, component: opts.component });
  if (reg && !reg.has(node.name)) reg.set(node.name, inst);
  if (opts.localReg && !opts.localReg.has(node.name)) opts.localReg.set(node.name, inst);
  if (def.id === 'CanvasComponent') setupComponent(rt, inst);
  else if (def.id === 'Gallery') {
    // modèle statique (représente l'élément sélectionné pour les références externes)
    const scopes = [...inst.scopes, { kind: 'item', implicit: true, alias: null, get rec() { return gallerySelected(inst); } }];
    inst.templateChildren = (node.children || []).map((ch) =>
      createInst(rt, ch, inst, reg, screen, { key: `${key}/§t/${ch.name}`, scopes, template: true, galleryItem: opts.galleryItem }),
    );
  } else if (node.children?.length) {
    let childScopes = opts.scopes;
    if (def.id === 'Form') {
      childScopes = [...inst.scopes, { kind: 'item', implicit: true, alias: null, get rec() { return formItem(inst); } }];
    }
    inst.children = node.children.map((ch) => createInst(rt, ch, inst, reg, screen, { scopes: childScopes, galleryItem: opts.galleryItem, localReg: opts.localReg, template: opts.template }));
  }
  return inst;
}

function createChildren(rt, parent, nodes, reg, screen) {
  return nodes.map((n) => createInst(rt, n, parent, reg, screen));
}

function setupComponent(rt, inst) {
  const compName = inst.node.head?.ComponentName;
  const comp = rt.componentByName(compName);
  inst.componentDefNode = comp || null;
  if (!comp) return;
  // Composant qui s'inclut lui-même (directement ou non) : rendu en espace réservé
  const path = inst.component?.componentPath || [];
  if (path.includes(comp.name)) {
    inst.componentDefNode = null;
    inst.componentCycle = [...path, comp.name];
    return;
  }
  const root = new Inst(rt, comp, COMPONENT_DEF, inst, {
    kind: 'componentRoot',
    key: `${inst.key}/§c`,
    screen: inst.screen,
    scopes: [],
    component: null,
  });
  root.componentDef = comp;
  root.instance = inst;
  root.component = root;
  root.componentPath = [...path, comp.name];
  root.name = comp.name;
  root.ref = new FxControlRef(comp.name, root);
  inst.componentRoot = root;
  const localReg = new Map();
  root.byName = localReg;
  root.children = (comp.children || []).map((ch) => createInst(rt, ch, root, null, inst.screen, { key: `${root.key}/${ch.name}`, component: root, localReg }));
}

// ---------------------------------------------------------------------------
// Mise en page
// ---------------------------------------------------------------------------

function visibleOf(inst) {
  // Une formule Visible qui renvoie Blank masque le contrôle (comme dans Power Apps)
  if (inst.formula('Visible') === undefined) {
    inst.visible = true;
    return true;
  }
  inst.visible = toBool(inst.evalFormula('Visible'));
  return inst.visible;
}

function autoHeight(inst, width) {
  const id = inst.def.id;
  if (!['Label', 'ModernText', 'HtmlViewer'].includes(id)) return null;
  if (!bool(inst.evalFormula('AutoHeight'), false)) return null;
  const family = inst.def.family === 'classic' ? 'classic' : 'modern';
  const fam = fontFamily(inst.evalFormula('Font'), family === 'classic' ? CLASSIC_FONT : MODERN_FONT);
  const size = fontPx(inst.evalFormula('Size'), family, family === 'classic' ? 13 : 14);
  const weight = fontWeight(inst.evalFormula(id === 'ModernText' && inst.isExplicit('Weight') ? 'Weight' : 'FontWeight'));
  const padT = num(inst.evalFormula('PaddingTop'));
  const padB = num(inst.evalFormula('PaddingBottom'));
  const padL = num(inst.evalFormula('PaddingLeft'));
  const padR = num(inst.evalFormula('PaddingRight'));
  const raw = id === 'HtmlViewer' ? text(inst.evalFormula('HtmlText'), inst.rt.locale).replace(/<[^>]+>/g, ' ') : text(inst.evalFormula('Text'), inst.rt.locale);
  const h = measureTextHeight(raw, {
    fontFamily: fam,
    fontSizePx: size,
    fontWeight: weight,
    lineHeight: num(inst.evalFormula('LineHeight'), 1.3) || 1.3,
    width: Math.max(1, width - padL - padR),
    wrap: bool(inst.evalFormula('Wrap'), true),
  });
  return h + padT + padB;
}

/** Positionnement absolu (écran, conteneur manuel, groupe, carte, composant) */
function layoutAbsolute(parent) {
  for (const ch of parent.children) {
    if (!visibleOf(ch)) continue;
    if (ch.def.id === 'Group') {
      ch.layout = { x: 0, y: 0, w: parent.layout.w, h: parent.layout.h };
      ch.flatGroup = true;
      layoutAbsolute(ch);
      continue;
    }
    const x = num(ch.evalFormula('X'));
    const y = num(ch.evalFormula('Y'));
    const w = Math.max(0, num(ch.evalFormula('Width')));
    let h = Math.max(0, num(ch.evalFormula('Height')));
    const ah = autoHeight(ch, w);
    if (ah !== null) h = ah;
    ch.layout = { x, y, w, h };
    layoutInside(ch);
  }
}

/** Mise en page du contenu d'une instance dont la taille est connue */
export function layoutInside(inst) {
  const id = inst.def.id;
  if (id === 'GroupContainer') {
    const variant = String(inst.node.head?.Variant || 'ManualLayout');
    if (/auto/i.test(variant)) layoutFlex(inst);
    else layoutAbsolute(inst);
  } else if (id === 'Gallery') layoutGallery(inst);
  else if (id === 'Form') layoutForm(inst);
  else if (id === 'TypedDataCard') layoutAbsolute(inst);
  else if (id === 'CanvasComponent') {
    const root = inst.componentRoot;
    if (root) {
      root.layout = { x: 0, y: 0, w: inst.layout.w, h: inst.layout.h };
      layoutAbsolute(root);
    }
  } else if (inst.children?.length) layoutAbsolute(inst);
}

function layoutFlex(inst) {
  const W = inst.layout.w;
  const H = inst.layout.h;
  const pad = {
    t: num(inst.evalFormula('PaddingTop')),
    b: num(inst.evalFormula('PaddingBottom')),
    l: num(inst.evalFormula('PaddingLeft')),
    r: num(inst.evalFormula('PaddingRight')),
  };
  const horizontal = enumKey(inst.evalFormula('LayoutDirection'), 'horizontal') !== 'vertical';
  const justify = enumKey(inst.evalFormula('LayoutJustifyContent'), 'start');
  const alignItems = enumKey(inst.evalFormula('LayoutAlignItems'), 'start');
  const gap = num(inst.evalFormula('LayoutGap'));
  const wrap = bool(inst.evalFormula('LayoutWrap'), false);
  const innerMain = Math.max(0, (horizontal ? W - pad.l - pad.r : H - pad.t - pad.b));
  const innerCross = Math.max(0, (horizontal ? H - pad.t - pad.b : W - pad.l - pad.r));
  const mainP = horizontal ? 'Width' : 'Height';
  const crossP = horizontal ? 'Height' : 'Width';
  const minMainP = horizontal ? 'LayoutMinWidth' : 'LayoutMinHeight';
  const maxMainP = horizontal ? 'LayoutMaxWidth' : 'LayoutMaxHeight';
  const minCrossP = horizontal ? 'LayoutMinHeight' : 'LayoutMinWidth';
  const maxCrossP = horizontal ? 'LayoutMaxHeight' : 'LayoutMaxWidth';

  const kids = [];
  for (const ch of inst.children) {
    if (!visibleOf(ch)) continue;
    const fp = Math.max(0, num(ch.evalFormula('FillPortions'), 0));
    const minMain = Math.max(0, num(ch.evalFormula(minMainP), 0));
    const maxMainRaw = numOrNull(ch.evalFormula(maxMainP));
    const maxMain = maxMainRaw === null ? Infinity : Math.max(minMain, maxMainRaw);
    let align = enumKey(ch.evalFormula('AlignInContainer'), 'setbycontainer');
    if (align === 'setbycontainer' || align === '') align = alignItems;
    const k = { ch, fp, minMain, maxMain, align, main: 0, cross: 0 };
    if (fp <= 0) {
      let base = Math.max(0, num(ch.evalFormula(mainP)));
      if (!horizontal) {
        const width = align === 'stretch' ? innerCross : Math.max(0, num(ch.evalFormula('Width')));
        const ah = autoHeight(ch, width);
        if (ah !== null) base = ah;
      }
      // taille fixe : les limites min/max ne s'appliquent qu'aux enfants flexibles
      k.main = base;
    } else k.main = minMain;
    kids.push(k);
  }

  // Lignes (retour à la ligne éventuel)
  const lines = [];
  if (wrap) {
    let cur = [];
    let used = 0;
    for (const k of kids) {
      const add = (cur.length ? gap : 0) + k.main;
      if (cur.length && used + add > innerMain) {
        lines.push(cur);
        cur = [];
        used = 0;
      }
      cur.push(k);
      used += (cur.length > 1 ? gap : 0) + k.main;
    }
    if (cur.length) lines.push(cur);
  } else lines.push(kids);

  // Taille transverse par ligne
  const crossOf = (k, lineCross) => {
    const minC = Math.max(0, num(k.ch.evalFormula(minCrossP), 0));
    const maxCRaw = numOrNull(k.ch.evalFormula(maxCrossP));
    if (k.align === 'stretch') {
      let c = lineCross;
      if (maxCRaw !== null && maxCRaw > 0) c = Math.min(c, Math.max(minC, maxCRaw));
      return Math.max(minC, c);
    }
    let c = Math.max(0, num(k.ch.evalFormula(crossP)));
    if (horizontal) {
      const ah = autoHeight(k.ch, k.main);
      if (ah !== null) c = ah;
    }
    return c;
  };

  let crossOffset = 0;
  const lineCrossSize = wrap ? null : innerCross;
  for (const line of lines) {
    // distribution de l'espace libre
    const fixed = line.reduce((s, k) => s + k.main, 0) + gap * Math.max(0, line.length - 1);
    let free = innerMain - fixed;
    let flex = line.filter((k) => k.fp > 0);
    while (free > 0.5 && flex.length) {
      const totalFp = flex.reduce((s, k) => s + k.fp, 0);
      let consumed = 0;
      const still = [];
      for (const k of flex) {
        const share = (free * k.fp) / totalFp;
        const target = k.main + share;
        if (target > k.maxMain) {
          consumed += k.maxMain - k.main;
          k.main = k.maxMain;
        } else {
          consumed += share;
          k.main = target;
          still.push(k);
        }
      }
      free -= consumed;
      if (still.length === flex.length) {
        free = 0;
        break;
      }
      flex = still;
    }
    if (free < 0) free = 0;

    // taille transverse
    let lineCross = lineCrossSize;
    if (lineCross === null) {
      lineCross = 0;
      for (const k of line) lineCross = Math.max(lineCross, k.align === 'stretch' ? 0 : crossOf(k, 0));
    }
    for (const k of line) k.cross = crossOf(k, lineCross);
    if (wrap && lineCross === 0) lineCross = Math.max(...line.map((k) => k.cross), 0);

    // justification
    let pos = 0;
    let between = gap;
    const n = line.length;
    const remaining = Math.max(0, free);
    if (remaining > 0) {
      if (justify === 'center') pos = remaining / 2;
      else if (justify === 'end') pos = remaining;
      else if (justify === 'spacebetween' && n > 1) between = gap + remaining / (n - 1);
      else if (justify === 'spacearound' && n > 0) {
        pos = remaining / n / 2;
        between = gap + remaining / n;
      } else if (justify === 'spaceevenly' && n > 0) {
        pos = remaining / (n + 1);
        between = gap + remaining / (n + 1);
      }
    }
    for (const k of line) {
      let c = 0;
      if (k.align === 'center') c = (lineCross - k.cross) / 2;
      else if (k.align === 'end') c = lineCross - k.cross;
      const main = Math.max(0, k.main);
      if (horizontal) k.ch.layout = { x: pad.l + pos, y: pad.t + crossOffset + c, w: main, h: Math.max(0, k.cross) };
      else k.ch.layout = { x: pad.l + crossOffset + c, y: pad.t + pos, w: Math.max(0, k.cross), h: main };
      pos += main + between;
      layoutInside(k.ch);
    }
    crossOffset += lineCross + gap;
  }
  // taille du contenu (défilement)
  let contentW = 0;
  let contentH = 0;
  for (const k of kids) {
    contentW = Math.max(contentW, k.ch.layout.x + k.ch.layout.w + pad.r);
    contentH = Math.max(contentH, k.ch.layout.y + k.ch.layout.h + pad.b);
  }
  inst.content = { w: contentW, h: contentH };
}

function layoutGallery(inst) {
  const rt = inst.rt;
  const all = galleryItems(inst);
  const items = all.slice(0, MAX_GALLERY_ITEMS);
  const horizontal = galleryOrientation(inst) === 'horizontal';
  const flexible = /flexible|socialfeed/i.test(String(inst.node.head?.Variant || ''));
  const pad = num(inst.evalFormula('TemplatePadding'));
  const wrap = Math.max(1, Math.floor(num(inst.evalFormula('WrapCount'), 1)));
  const tW = num(inst.get('TemplateWidth'));
  const tH = num(inst.get('TemplateHeight'));
  inst.items = [];
  let y = pad;
  let rowH = 0;
  let maxBottom = 0;
  items.forEach((record, index) => {
    const localReg = new Map();
    const item = { index, record, children: [], byName: localReg, key: `${inst.key}#${index}` };
    const scopes = [...inst.scopes, { kind: 'item', implicit: true, alias: null, rec: record }];
    const galleryItem = { gallery: inst, index, record, item };
    item.children = (inst.node.children || []).map((ch) =>
      createInst(rt, ch, inst, null, inst.screen, { key: `${item.key}/${ch.name}`, scopes, galleryItem, localReg }),
    );
    // mise en page du modèle (positions absolues relatives à l'élément)
    const pseudo = { children: item.children, layout: { w: tW, h: tH } };
    layoutAbsolute(pseudo);
    let h = tH;
    if (flexible) {
      let bottom = 0;
      for (const c of item.children) if (c.visible && c.layout) bottom = Math.max(bottom, c.layout.y + c.layout.h);
      h = Math.max(tH, bottom);
    }
    if (horizontal) {
      item.layout = { x: pad + index * (tW + pad), y: pad, w: tW, h: tH };
      maxBottom = Math.max(maxBottom, item.layout.x + tW + pad);
    } else {
      const col = index % wrap;
      if (col === 0 && index > 0) {
        y += rowH + pad;
        rowH = 0;
      }
      item.layout = { x: pad + col * (tW + pad), y, w: tW, h };
      rowH = Math.max(rowH, h);
      maxBottom = Math.max(maxBottom, y + rowH + pad);
    }
    inst.items.push(item);
  });
  inst.itemsTruncated = all.length > items.length ? all.length : 0;
  inst.content = horizontal ? { w: maxBottom, h: inst.layout.h } : { w: inst.layout.w, h: maxBottom };
  // les modèles statiques ont la taille d'un élément
  for (const t of inst.templateChildren || []) {
    if (!visibleOf(t)) continue;
    t.layout = { x: num(t.evalFormula('X')), y: num(t.evalFormula('Y')), w: num(t.evalFormula('Width')), h: num(t.evalFormula('Height')) };
  }
}

function layoutForm(inst) {
  const W = inst.layout.w;
  const columns = Math.max(1, Math.floor(num(inst.evalFormula('Columns'), 1)));
  const horizontalLayout = String(inst.node.head?.Layout || 'Vertical').toLowerCase() === 'horizontal';
  const cards = inst.children.filter((c) => visibleOf(c));
  // tri par Y (ligne) puis X (colonne)
  const sorted = cards
    .map((c, i) => ({ c, i, row: num(c.evalFormula('Y')), col: num(c.evalFormula('X')) }))
    .sort((a, b) => a.row - b.row || a.col - b.col || a.i - b.i);
  const colW = W / columns;
  let y = 0;
  let curRow = null;
  let rowH = 0;
  let colIdx = 0;
  for (const { c, row } of sorted) {
    if (curRow === null) curRow = row;
    if (row !== curRow || colIdx >= columns) {
      y += rowH;
      rowH = 0;
      colIdx = 0;
      curRow = row;
    }
    let w = num(c.evalFormula('Width'), colW);
    if (columns === 1 || w > W) w = W;
    else w = Math.min(Math.max(colW, Math.round(w / colW) * colW), W);
    c.layout = { x: colIdx * colW, y, w, h: 0 };
    // hauteur : explicite ou contenu
    const explicitH = numOrNull(c.evalFormula('Height'));
    layoutAbsolute(c);
    let bottom = 0;
    for (const k of c.children) if (k.visible && k.layout) bottom = Math.max(bottom, k.layout.y + k.layout.h);
    void horizontalLayout;
    const h = explicitH !== null && explicitH > 0 ? explicitH : bottom + 6;
    c.layout.h = h;
    rowH = Math.max(rowH, h);
    colIdx += Math.max(1, Math.round(w / colW));
  }
  inst.content = { w: W, h: y + rowH };
}
