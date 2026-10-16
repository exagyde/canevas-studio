// Opérations sur le modèle de projet (immuables : chaque modification renvoie de nouveaux objets).
import { newId } from '../pa/ids.js';
import { parsePaYaml, serializeScreens, serializeControls, serializeApp, serializeComponents } from '../pa/yaml.js';
import { tokenize, TK } from '../fx/lexer.js';
import { t, getLocale, INTL_LOCALES } from '../i18n/index.js';

export const PROJECT_FORMAT = 1;

/** Nouveau projet : langue de l'application émulée et utilisateur fictif dans la langue de l'interface */
export function createProject(name = t('project.newAppName'), opts = {}) {
  const now = new Date().toISOString();
  return {
    id: `p_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    format: PROJECT_FORMAT,
    name,
    createdAt: now,
    updatedAt: now,
    settings: { width: 1366, height: 768, locale: INTL_LOCALES[getLocale()], user: { FullName: t('project.demoUserName'), Email: 'demo@contoso.com' }, params: {}, mdfItemId: '' },
    app: { _id: newId('a'), name: 'App', head: {}, properties: {} },
    screens: opts.screens || [newScreen('Screen1')],
    components: opts.components || [],
    dataSources: opts.dataSources || [],
    flows: opts.flows || [],
    chat: { messages: [] },
    files: {},
  };
}

export function newScreen(name) {
  return { _id: newId('s'), name, head: {}, properties: { Fill: '=RGBA(255, 255, 255, 1)' }, children: [] };
}

// ---------------------------------------------------------------------------
// Parcours
// ---------------------------------------------------------------------------

export function* walkNodes(nodes, parent = null, depth = 0) {
  for (const n of nodes || []) {
    yield { node: n, parent, depth };
    if (n.children?.length) yield* walkNodes(n.children, n, depth + 1);
  }
}

/** Trouve un nœud (écran, composant ou contrôle) par identifiant */
export function findNode(project, id) {
  if (!id) return null;
  if (project.app?._id === id) return { node: project.app, screen: null, parent: null, kind: 'app' };
  for (const list of [project.screens || [], project.components || []]) {
    for (const s of list) {
      if (s._id === id) return { node: s, screen: s, parent: null, kind: list === project.screens ? 'screen' : 'component' };
      for (const { node, parent } of walkNodes(s.children, s)) {
        if (node._id === id) return { node, screen: s, parent, kind: 'control' };
      }
    }
  }
  return null;
}

export function findByName(project, name) {
  for (const s of [...(project.screens || []), ...(project.components || [])]) {
    if (s.name === name) return { node: s, screen: s, parent: null };
    for (const { node, parent } of walkNodes(s.children, s)) if (node.name === name) return { node, screen: s, parent };
  }
  return null;
}

export function allNames(project) {
  const set = new Set();
  for (const s of [...(project.screens || []), ...(project.components || [])]) {
    set.add(s.name);
    for (const { node } of walkNodes(s.children)) set.add(node.name);
  }
  return set;
}

export function uniqueName(base, taken) {
  if (!taken.has(base)) return base;
  const m = /^(.*?)(\d+)$/.exec(base);
  const stem = m ? m[1] : base;
  let i = m ? Number(m[2]) + 1 : 1;
  while (taken.has(`${stem}${i}`)) i++;
  return `${stem}${i}`;
}

// ---------------------------------------------------------------------------
// Mise à jour immuable
// ---------------------------------------------------------------------------

function mapChildren(children, id, fn) {
  if (!children) return children;
  let changed = false;
  const out = children.map((c) => {
    if (c._id === id) {
      changed = true;
      return fn(c);
    }
    if (c.children?.length) {
      const nc = mapChildren(c.children, id, fn);
      if (nc !== c.children) {
        changed = true;
        return { ...c, children: nc };
      }
    }
    return c;
  });
  return changed ? out.filter(Boolean) : children;
}

/** Applique fn(node) -> nouveau nœud (ou null pour supprimer) */
export function updateNode(project, id, fn) {
  if (project.app?._id === id) return { ...project, app: fn(project.app) };
  const upd = (list) => {
    let changed = false;
    const out = list.map((s) => {
      if (s._id === id) {
        changed = true;
        return fn(s);
      }
      const nc = mapChildren(s.children, id, fn);
      if (nc !== s.children) {
        changed = true;
        return { ...s, children: nc };
      }
      return s;
    });
    return changed ? out.filter(Boolean) : list;
  };
  const screens = upd(project.screens || []);
  const components = screens === project.screens ? upd(project.components || []) : project.components;
  if (screens === project.screens && components === project.components) return project;
  return { ...project, screens, components };
}

/** Clone profond avec nouveaux identifiants et noms uniques */
export function cloneWithNewIds(node, taken, renameMap = new Map()) {
  const name = taken ? uniqueName(node.name, taken) : node.name;
  if (taken) taken.add(name);
  if (name !== node.name) renameMap.set(node.name, name);
  const copy = { ...node, _id: newId(node._id?.[0] || 'c'), name, head: { ...(node.head || {}) }, properties: { ...(node.properties || {}) } };
  if (node.children) copy.children = node.children.map((c) => cloneWithNewIds(c, taken, renameMap));
  return copy;
}

/** Applique les renommages internes (références entre contrôles copiés) */
export function applyRenames(node, renameMap) {
  if (!renameMap.size) return node;
  const props = {};
  for (const [k, v] of Object.entries(node.properties || {})) props[k] = renameInFormula(v, renameMap);
  return { ...node, properties: props, children: node.children ? node.children.map((c) => applyRenames(c, renameMap)) : node.children };
}

/**
 * Reprend les identifiants de l'ancienne version des nœuds de même nom (sélection et état conservés
 * quand un écran ou un contrôle est remplacé par une version modifiée de son YAML).
 */
export function keepIds(next, prev) {
  const ids = new Map();
  for (const { node } of walkNodes([prev])) ids.set(node.name, node._id);
  const visit = (n) => ({ ...n, _id: ids.get(n.name) || n._id, children: n.children ? n.children.map(visit) : n.children });
  return visit(next);
}

/** Insère des contrôles dans un parent (écran ou conteneur) à un index */
export function insertControls(project, parentId, controls, index = -1) {
  return updateNode(project, parentId, (p) => {
    const children = [...(p.children || [])];
    if (index < 0 || index > children.length) children.push(...controls);
    else children.splice(index, 0, ...controls);
    return { ...p, children };
  });
}

// ---------------------------------------------------------------------------
// Renommage des références (copier-coller de contrôles)
// ---------------------------------------------------------------------------

function needsQuote(name) {
  return !/^[\p{L}_][\p{L}\p{N}_]*$/u.test(name);
}

export function quoteName(name) {
  return needsQuote(name) ? `'${name.replace(/'/g, "''")}'` : name;
}

/** Remplace les identifiants (hors accès membre et noms de champs) selon renameMap */
export function renameInFormula(formula, renameMap) {
  if (typeof formula !== 'string' || !formula.startsWith('=') || !renameMap.size) return formula;
  const body = formula.slice(1);
  let toks;
  try {
    toks = tokenize(body, { keepTrivia: true });
  } catch {
    return formula;
  }
  let out = '';
  let last = 0;
  let prevSig = null;
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.type === TK.EOF) break;
    if ((t.type === TK.IDENT || t.type === TK.QIDENT) && renameMap.has(t.value)) {
      const isMember = prevSig && prevSig.type === TK.OP && prevSig.value === '.';
      let nextSig = null;
      for (let j = i + 1; j < toks.length; j++) {
        if (toks[j].type !== TK.WS && toks[j].type !== TK.COMMENT) {
          nextSig = toks[j];
          break;
        }
      }
      const isFieldDef = nextSig && nextSig.type === TK.OP && nextSig.value === ':' && prevSig && prevSig.type === TK.OP && (prevSig.value === '{' || prevSig.value === ',');
      if (!isMember && !isFieldDef) {
        out += body.slice(last, t.start) + quoteName(renameMap.get(t.value));
        last = t.end;
      }
    }
    if (t.type !== TK.WS && t.type !== TK.COMMENT) prevSig = t;
  }
  out += body.slice(last);
  return '=' + out;
}

// ---------------------------------------------------------------------------
// Import / export YAML
// ---------------------------------------------------------------------------

/**
 * Fusionne le résultat d'un YAML collé/importé dans le projet.
 * mode: 'add' (nouveaux écrans, noms rendus uniques) | 'replace' (remplace les écrans de même nom)
 */
export function mergeParsed(project, parsed, { mode = 'replace', fileName } = {}) {
  let p = { ...project };
  const added = [];
  for (const s of parsed.screens) {
    const idx = p.screens.findIndex((x) => x.name === s.name);
    if (idx >= 0 && mode === 'replace') {
      const screens = [...p.screens];
      screens[idx] = { ...s, _id: p.screens[idx]._id };
      p.screens = screens;
      added.push(screens[idx]);
    } else {
      const taken = new Set(p.screens.map((x) => x.name));
      const ns = { ...s, name: uniqueName(s.name, taken) };
      p.screens = [...p.screens, ns];
      added.push(ns);
    }
    if (fileName) p.files = { ...(p.files || {}), [added[added.length - 1].name]: fileName };
  }
  if (parsed.app) {
    p.app = { ...(p.app || {}), _id: p.app?._id || parsed.app._id, name: 'App', head: { ...(p.app?.head || {}), ...parsed.app.head }, properties: { ...(p.app?.properties || {}), ...parsed.app.properties } };
  }
  for (const c of parsed.components || []) {
    const idx = (p.components || []).findIndex((x) => x.name === c.name);
    const comps = [...(p.components || [])];
    if (idx >= 0) comps[idx] = { ...c, _id: comps[idx]._id };
    else comps.push(c);
    p.components = comps;
  }
  return { project: p, added };
}

export function screenYaml(screen) {
  return serializeScreens([screen]);
}

export function controlsYaml(controls) {
  return serializeControls(controls);
}

export function appYaml(app) {
  return serializeApp(app);
}

export function componentsYaml(components) {
  return serializeComponents(components);
}

/** YAML d'une portée de l'éditeur : identifiant d'écran, 'app' ou 'components' */
export function scopeYaml(project, key) {
  if (key === 'app') {
    const app = project.app || { properties: {} };
    // App vide : modèle prêt à compléter plutôt que « App: {} »
    return Object.keys(app.properties || {}).length || Object.keys(app.head || {}).length ? appYaml(app) : 'App:\n  Properties:\n    OnStart: =\n';
  }
  if (key === 'components') return project.components?.length ? componentsYaml(project.components) : '';
  const screen = project.screens.find((s) => s._id === key);
  return screen ? screenYaml(screen) : '';
}

export function safeFileName(name) {
  return String(name)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9_.-]+/g, '_')
    .replace(/^_+|_+$/g, '') || t('project.defaultFileName');
}

/** Projet sérialisable (métadonnées sans le YAML) */
export function projectMeta(project) {
  const { screens, components, app, ...rest } = project;
  void screens;
  void components;
  void app;
  return rest;
}

export { parsePaYaml };
