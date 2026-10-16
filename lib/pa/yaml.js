// Lecture / écriture du format YAML des Canvas Apps (pa.yaml / "Copier le code" de Power Apps Studio).
import { parseDocument, isMap, isSeq, isScalar, isPair, LineCounter } from 'yaml';
import { newId } from './ids.js';
import { t } from '../i18n/index.js';

/*
 Modèle interne :
  Screen  = { _id, name, head: {...clés hors Properties/Children}, properties: {Prop: "=..."}, children: Control[] }
  Control = { _id, name, head: { Control: "Button@0.0.45", Variant?, MetadataKey?, ... }, properties, children: Control[] | null }
  Component = { _id, name, head: {...}, customProperties: object|null, properties, children }
*/

const NODE_KEYS_ORDER = ['Control', 'Variant', 'MetadataKey', 'IsLocked', 'Layout', 'ComponentName', 'ComponentLibraryUniqueName', 'Group'];

// ---------------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------------

/**
 * Parse un texte YAML Power Apps.
 * Retourne { screens, controls, app, components, unknownRoots, errors, warnings, positions }
 *  - positions : Map(objet modèle -> { line, col, props: {Prop: {line, col, block, valueLine, valueCol, indent}} })
 */
export function parsePaYaml(text, opts = {}) {
  const lineCounter = new LineCounter();
  const result = {
    screens: [],
    controls: [],
    app: null,
    components: [],
    unknownRoots: [],
    errors: [],
    warnings: [],
    positions: new Map(),
    kind: 'empty',
  };
  let doc;
  try {
    doc = parseDocument(text ?? '', { lineCounter, prettyErrors: false, uniqueKeys: true, strict: false });
  } catch (e) {
    result.errors.push({ message: t('validation.yamlUnreadable', { error: e.message }), line: 1, col: 1 });
    return result;
  }
  const posOf = (offset) => {
    if (offset == null) return { line: 1, col: 1 };
    const p = lineCounter.linePos(offset);
    return { line: p.line, col: p.col };
  };
  for (const err of doc.errors) {
    const p = posOf(err.pos?.[0]);
    result.errors.push({ message: translateYamlError(err), line: p.line, col: p.col, endOffset: err.pos?.[1], offset: err.pos?.[0] });
  }
  for (const w of doc.warnings) {
    const p = posOf(w.pos?.[0]);
    result.warnings.push({ message: w.message, line: p.line, col: p.col });
  }
  if (result.errors.length) return result;

  const root = doc.contents;
  if (root == null) return result;
  const ctx = { posOf, positions: result.positions, errors: result.errors, warnings: result.warnings, text };

  if (isSeq(root)) {
    // Extrait de contrôles : "- Nom:\n    Control: ..."
    result.kind = 'controls';
    result.controls = readChildren(root, ctx);
    return result;
  }
  if (!isMap(root)) {
    result.errors.push({ message: t('validation.documentNotObject'), ...posOf(root.range?.[0]) });
    return result;
  }

  const kinds = [];
  for (const pair of root.items) {
    const key = scalarKey(pair.key);
    const p = posOf(pair.key?.range?.[0]);
    if (key === 'Screens') {
      kinds.push('screens');
      if (pair.value == null) continue;
      if (!isMap(pair.value)) {
        ctx.errors.push({ message: t('validation.screensNotMap'), ...p });
        continue;
      }
      for (const sp of pair.value.items) {
        const screen = readScreenLike(scalarKey(sp.key), sp, ctx, 'screen');
        if (screen) result.screens.push(screen);
      }
    } else if (key === 'App') {
      kinds.push('app');
      result.app = readScreenLike('App', pair, ctx, 'app');
    } else if (key === 'ComponentDefinitions') {
      kinds.push('components');
      if (pair.value && isMap(pair.value)) {
        for (const cp of pair.value.items) {
          const comp = readScreenLike(scalarKey(cp.key), cp, ctx, 'component');
          if (comp) result.components.push(comp);
        }
      }
    } else if (key === 'Control' || key === 'Properties') {
      // Un contrôle seul sans nom
      ctx.errors.push({ message: t('validation.rootControlNoName'), ...p });
    } else if (pair.value && isMap(pair.value) && pair.value.items.some((it) => scalarKey(it.key) === 'Control')) {
      // Forme "Nom:\n  Control: ..." (sans tiret)
      kinds.push('controls');
      const c = readControl(key, pair, ctx);
      if (c) result.controls.push(c);
    } else {
      result.unknownRoots.push(key);
      ctx.warnings.push({ message: t('validation.unknownRootKey', { key }), ...p });
    }
  }
  result.kind = kinds.length === 0 ? 'empty' : kinds.length === 1 ? kinds[0] : 'mixed';
  return result;
}

function translateYamlError(err) {
  const msg = err.message || String(err);
  const code = err.code;
  const map = {
    DUPLICATE_KEY: () => t('validation.yamlDuplicateKey'),
    BAD_INDENT: () => t('validation.yamlBadIndent'),
    MISSING_CHAR: () => t('validation.yamlMissingChar'),
    BLOCK_AS_IMPLICIT_KEY: () => t('validation.yamlBlockAsImplicitKey'),
    MULTILINE_IMPLICIT_KEY: () => t('validation.yamlMultilineImplicitKey'),
    UNEXPECTED_TOKEN: () => t('validation.yamlUnexpectedToken'),
    TAB_AS_INDENT: () => t('validation.yamlTabAsIndent'),
  };
  const first = msg.split('\n')[0];
  // message traduit, suivi du message d'origine de la bibliothèque yaml (en anglais)
  return Object.hasOwn(map, code) ? `${map[code]()} (${first})` : first;
}

function scalarKey(keyNode) {
  if (keyNode == null) return '';
  if (isScalar(keyNode)) return String(keyNode.value ?? '');
  return String(keyNode);
}

function scalarValue(node) {
  if (node == null) return null;
  if (isScalar(node)) return node.value;
  return undefined;
}

function readScreenLike(name, pair, ctx, kind) {
  const p = ctx.posOf(pair.key?.range?.[0]);
  const node = { _id: newId(kind === 'screen' ? 's' : kind === 'component' ? 'k' : 'a'), name, head: {}, properties: {}, children: [] };
  if (kind === 'component') node.customProperties = null;
  const pos = { line: p.line, col: p.col, props: {} };
  ctx.positions.set(node, pos);
  const val = pair.value;
  if (val == null) return node;
  if (!isMap(val)) {
    ctx.errors.push({ message: t('validation.nodeNotMap', { name }), ...p });
    return node;
  }
  for (const it of val.items) {
    const k = scalarKey(it.key);
    if (k === 'Properties') readProperties(it.value, node, pos, ctx);
    else if (k === 'Children') node.children = readChildren(it.value, ctx);
    else if (k === 'CustomProperties' && kind === 'component') node.customProperties = it.value ? it.value.toJSON() : null;
    else node.head[k] = it.value && !isScalar(it.value) ? it.value.toJSON() : scalarValue(it.value);
  }
  return node;
}

function readProperties(mapNode, node, pos, ctx) {
  if (mapNode == null) return;
  if (!isMap(mapNode)) {
    ctx.errors.push({ message: t('validation.propertiesNotMap'), ...ctx.posOf(mapNode.range?.[0]) });
    return;
  }
  for (const it of mapNode.items) {
    const k = scalarKey(it.key);
    const kp = ctx.posOf(it.key?.range?.[0]);
    const v = it.value;
    let value;
    if (v == null) value = '';
    else if (isScalar(v)) value = v.value == null ? '' : typeof v.value === 'string' ? v.value : String(v.source ?? v.value);
    else {
      ctx.errors.push({ message: t('validation.propertyNotScalar', { property: k }), ...kp });
      value = '';
    }
    node.properties[k] = value;
    let block = false;
    let valueOffset = v?.range?.[0];
    if (v && isScalar(v) && (v.type === 'BLOCK_LITERAL' || v.type === 'BLOCK_FOLDED')) block = true;
    const vp = ctx.posOf(valueOffset);
    pos.props[k] = { line: kp.line, col: kp.col, block, valueLine: vp.line, valueCol: vp.col, scalarType: v?.type, rawSource: v && isScalar(v) ? v.source : undefined };
    if (block) {
      // la première ligne du contenu suit l'indicateur |-
      const lineText = lineAt(ctx.text, vp.line + 0);
      pos.props[k].contentLine = vp.line + 1;
      pos.props[k].contentIndent = detectBlockIndent(ctx.text, vp.line + 1, lineText);
    }
  }
}

function lineAt(text, line) {
  const lines = text.split('\n');
  return lines[line - 1] ?? '';
}

function detectBlockIndent(text, line) {
  const lines = text.split('\n');
  for (let i = line - 1; i < lines.length; i++) {
    const l = lines[i];
    if (l.trim() === '') continue;
    return l.length - l.trimStart().length;
  }
  return 0;
}

function readChildren(seqNode, ctx) {
  const out = [];
  if (seqNode == null) return out;
  if (!isSeq(seqNode)) {
    ctx.errors.push({ message: t('validation.childrenNotSeq'), ...ctx.posOf(seqNode.range?.[0]) });
    return out;
  }
  for (const item of seqNode.items) {
    const ip = ctx.posOf(item?.range?.[0]);
    if (!isMap(item)) {
      ctx.errors.push({ message: t('validation.childrenItemNotMap'), ...ip });
      continue;
    }
    if (item.items.length !== 1) {
      ctx.errors.push({
        message: t('validation.childrenItemKeys', { count: item.items.length, keys: item.items.map((i) => scalarKey(i.key)).join(', ') }),
        ...ip,
      });
    }
    for (const pair of item.items) {
      const c = readControl(scalarKey(pair.key), pair, ctx);
      if (c) out.push(c);
    }
  }
  return out;
}

function readControl(name, pair, ctx) {
  const p = ctx.posOf(pair.key?.range?.[0]);
  const node = { _id: newId('c'), name, head: {}, properties: {}, children: null };
  const pos = { line: p.line, col: p.col, props: {} };
  ctx.positions.set(node, pos);
  const val = pair.value;
  if (val == null || !isMap(val)) {
    ctx.errors.push({ message: t('validation.controlNotMap', { name }), ...p });
    return node;
  }
  for (const it of val.items) {
    const k = scalarKey(it.key);
    if (k === 'Properties') readProperties(it.value, node, pos, ctx);
    else if (k === 'Children') node.children = readChildren(it.value, ctx);
    else node.head[k] = it.value && !isScalar(it.value) ? it.value.toJSON() : scalarValue(it.value);
  }
  return node;
}

// ---------------------------------------------------------------------------
// Écriture
// ---------------------------------------------------------------------------

const INDENT = '  ';

function needsQuotesKey(k) {
  if (k === '') return true;
  if (/^[\s]|[\s]$/.test(k)) return true;
  if (/^[-?:,[\]{}#&*!|>'"%@`]/.test(k)) return true;
  if (/: |:$| #|[\n\t]/.test(k)) return true;
  if (/^(true|false|null|~|yes|no|on|off)$/i.test(k)) return true;
  if (/^[-+]?(\d[\d_]*(\.\d*)?([eE][-+]?\d+)?|\.\d+|0x[0-9a-fA-F]+|0o[0-7]+|\.inf|\.nan)$/i.test(k)) return true;
  return false;
}

function fmtKey(k) {
  k = String(k);
  return needsQuotesKey(k) ? `'${k.replace(/'/g, "''")}'` : k;
}

function isPlainSafe(s) {
  if (s === '') return false;
  if (/[\n\r\t]/.test(s)) return false;
  if (/^\s|\s$/.test(s)) return false;
  if (/^[[\]{},#&*!|>'"%@`]/.test(s)) return false;
  if (/^[-?:](\s|$)/.test(s)) return false;
  if (/: | #|:$/.test(s)) return false;
  if (/^(true|false|null|~|yes|no|on|off|y|n)$/i.test(s)) return false;
  if (/^[-+]?(\d[\d_]*(\.\d*)?([eE][-+]?\d+)?|\.\d+|0x[0-9a-fA-F]+|0o[0-7]+|\.inf|\.nan)$/i.test(s)) return false;
  // caractères de contrôle / BOM
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f﻿]/.test(s)) return false;
  return true;
}

function writeString(lines, prefix, value, indent) {
  // prefix = "    Key:" ou "  -" ...
  if (isPlainSafe(value)) {
    lines.push(`${prefix} ${value}`);
    return;
  }
  if (value === '') {
    lines.push(`${prefix} ""`);
    return;
  }
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f﻿\r]/.test(value)) {
    lines.push(`${prefix} ${JSON.stringify(value)}`);
    return;
  }
  // Bloc littéral
  let chomp = '-';
  let body = value;
  if (body.endsWith('\n')) {
    // Power Apps (YamlDotNet) écrit « |+ » dès que le texte se termine par un saut de ligne
    chomp = '+';
    body = body.slice(0, -1);
  }
  const contentIndent = indent + INDENT;
  const firstContent = body.split('\n').find((l) => l.length > 0) ?? '';
  const indicator = /^\s/.test(firstContent) ? String(INDENT.length) : '';
  lines.push(`${prefix} |${indicator}${chomp}`);
  for (const l of body.split('\n')) lines.push(l.length ? contentIndent + l : '');
}

function writeScalar(lines, prefix, value, indent) {
  if (value === null || value === undefined) {
    lines.push(prefix);
    return;
  }
  if (typeof value === 'boolean' || typeof value === 'number') {
    lines.push(`${prefix} ${String(value)}`);
    return;
  }
  writeString(lines, prefix, String(value), indent);
}

/** Écrit une valeur JS générique (objets ordonnés, listes, scalaires) */
function writeGeneric(lines, indent, key, value) {
  const prefix = `${indent}${fmtKey(key)}:`;
  if (Array.isArray(value)) {
    if (value.length === 0) {
      lines.push(`${prefix} []`);
      return;
    }
    lines.push(prefix);
    writeList(lines, indent + INDENT, value);
    return;
  }
  if (value && typeof value === 'object') {
    const keys = Object.keys(value);
    if (keys.length === 0) {
      lines.push(`${prefix} {}`);
      return;
    }
    lines.push(prefix);
    for (const k of keys) writeGeneric(lines, indent + INDENT, k, value[k]);
    return;
  }
  writeScalar(lines, prefix, value, indent);
}

function writeList(lines, indent, arr) {
  for (const item of arr) {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      const keys = Object.keys(item);
      if (keys.length === 0) {
        lines.push(`${indent}- {}`);
        continue;
      }
      const sub = [];
      for (const k of keys) writeGeneric(sub, indent + INDENT, k, item[k]);
      // remplace l'indentation de la première ligne par "- "
      sub[0] = `${indent}- ` + sub[0].slice(indent.length + INDENT.length);
      lines.push(...sub);
    } else if (Array.isArray(item)) {
      lines.push(`${indent}-`);
      writeList(lines, indent + INDENT, item);
    } else {
      writeScalar(lines, `${indent}-`, item, indent);
    }
  }
}

export function sortPropertyKeys(props) {
  return Object.keys(props).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

function orderedHead(head) {
  const out = {};
  for (const k of NODE_KEYS_ORDER) if (k in head) out[k] = head[k];
  for (const k of Object.keys(head)) if (!(k in out)) out[k] = head[k];
  return out;
}

function propsObject(props, sort = true) {
  const keys = sort ? sortPropertyKeys(props) : Object.keys(props);
  const o = {};
  for (const k of keys) o[k] = props[k];
  return o;
}

/** Convertit un contrôle du modèle en objet JS ordonné */
export function controlToJs(c, opts = {}) {
  const body = orderedHead(c.head || {});
  if (c.properties && Object.keys(c.properties).length) body.Properties = propsObject(c.properties, opts.sort !== false);
  if (c.children && c.children.length) body.Children = c.children.map((ch) => controlToJs(ch, opts));
  return { [c.name]: body };
}

function screenBodyToJs(s, opts = {}) {
  const body = { ...(s.head || {}) };
  if (s.customProperties && Object.keys(s.customProperties).length) body.CustomProperties = s.customProperties;
  if (s.properties && Object.keys(s.properties).length) body.Properties = propsObject(s.properties, opts.sort !== false);
  if (s.children && s.children.length) body.Children = s.children.map((ch) => controlToJs(ch, opts));
  return body;
}

function emit(rootObj) {
  const lines = [];
  for (const k of Object.keys(rootObj)) writeGeneric(lines, '', k, rootObj[k]);
  return lines.join('\n') + '\n';
}

/** YAML d'un ou plusieurs écrans (format "Copier le code" d'un écran). */
export function serializeScreens(screens, opts = {}) {
  const obj = {};
  for (const s of screens) obj[s.name] = screenBodyToJs(s, opts);
  return emit({ Screens: obj });
}

/** YAML d'une liste de contrôles (format "Copier le code" d'un contrôle). */
export function serializeControls(controls, opts = {}) {
  const lines = [];
  writeList(lines, '', controls.map((c) => controlToJs(c, opts)));
  return lines.join('\n') + '\n';
}

export function serializeApp(app, opts = {}) {
  if (!app) return '';
  return emit({ App: screenBodyToJs(app, opts) });
}

export function serializeComponents(components, opts = {}) {
  const obj = {};
  for (const c of components) obj[c.name] = screenBodyToJs(c, opts);
  return emit({ ComponentDefinitions: obj });
}
