// Application des blocs de code proposés par l'assistant IA au projet.
import { parsePaYaml } from '../pa/yaml.js';
import { findByName, findNode, allNames, cloneWithNewIds, applyRenames, insertControls, updateNode, walkNodes, mergeParsed, keepIds, screenYaml, controlsYaml, componentsYaml, appYaml } from '../project/model.js';
import { serializeScreens } from '../pa/yaml.js';
import { validateProject, summarize } from '../validation/validate.js';
import { createMockTable } from '../data/datasource.js';
import { t } from '../i18n/index.js';

/** Découpe un texte markdown en segments texte / code */
export function splitBlocks(text) {
  const out = [];
  const re = /```([^\n`]*)\n([\s\S]*?)(```|$)/g;
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ type: 'text', text: text.slice(last, m.index) });
    const info = m[1].trim();
    const [lang = '', ...rest] = info.split(/\s+/);
    const attrs = {};
    for (const r of rest) {
      const kv = /^(\w+)=(.+)$/.exec(r);
      if (kv) attrs[kv[1]] = kv[2].replace(/^["']|["']$/g, '');
    }
    out.push({ type: 'code', lang: lang.toLowerCase(), attrs, code: m[2].replace(/\n$/, ''), closed: m[3] === '```' });
    last = re.lastIndex;
    if (!m[3]) break;
  }
  if (last < text.length) out.push({ type: 'text', text: text.slice(last) });
  return out;
}

/** Directive en commentaire : # insert-into: X / # replace: X */
export function directiveOf(code) {
  const first = code.split('\n').find((l) => l.trim().startsWith('#'));
  if (!first) return null;
  const m = /^#\s*(insert-into|replace)\s*:\s*(.+)$/i.exec(first.trim());
  return m ? { kind: m[1].toLowerCase(), target: m[2].trim() } : null;
}

/** Analyse un bloc YAML : type de contenu + validation dans le contexte du projet */
export function analyzeYamlBlock(code, project, currentScreenId) {
  const parsed = parsePaYaml(code);
  if (parsed.errors.length) return { parsed, error: t('ai.yamlInvalidAt', { line: parsed.errors[0].line, message: parsed.errors[0].message }) };
  let temp = project;
  if (parsed.kind === 'screens') {
    // les écrans de même nom sont remplacés, les autres ajoutés (comme l'action principale du volet)
    const names = new Set(parsed.screens.map((s) => s.name));
    temp = { ...project, screens: [...project.screens.filter((s) => !names.has(s.name)), ...parsed.screens] };
  } else if (parsed.kind === 'controls') {
    const scr = project.screens.find((s) => s._id === currentScreenId);
    if (scr) {
      const fake = { ...scr, _id: '__tmp', name: `${scr.name}__tmp`, children: parsed.controls };
      temp = { ...project, screens: [...project.screens, fake] };
    }
  } else if (parsed.kind === 'app') temp = { ...project, app: parsed.app };
  else if (parsed.kind === 'components') {
    const names = new Set(parsed.components.map((c) => c.name));
    temp = { ...project, components: [...(project.components || []).filter((c) => !names.has(c.name)), ...parsed.components] };
  }
  const issues = validateProject(temp).filter((i) => {
    const ids = new Set();
    for (const s of parsed.screens) {
      ids.add(s._id);
      for (const { node } of walkNodes(s.children)) ids.add(node._id);
    }
    for (const c of [...parsed.controls, ...parsed.components]) {
      ids.add(c._id);
      for (const { node } of walkNodes(c.children)) ids.add(node._id);
    }
    return ids.has(i.nodeId) && i.code !== 'duplicate-name';
  });
  return { parsed, issues, summary: summarize(issues), directive: directiveOf(code) };
}

/** Remplace l'écran courant (ou l'écran de même nom) par l'écran du bloc */
export function applyScreenReplace(project, parsed, currentScreenId) {
  const s = parsed.screens[0];
  const byName = project.screens.find((x) => x.name === s.name);
  const target = byName || project.screens.find((x) => x._id === currentScreenId);
  if (!target) return { error: t('ai.targetScreenNotFound') };
  const clash = project.screens.some((x) => x._id !== target._id && x.name === s.name);
  if (clash) return { error: t('ai.screenNameTaken', { name: s.name }) };
  const ns = keepIds({ ...s, _id: target._id }, target);
  return { project: { ...project, screens: project.screens.map((x) => (x._id === target._id ? ns : x)) }, selectId: ns._id };
}

/**
 * Avant / après de l'action principale proposée pour un bloc YAML, en YAML normalisé
 * (même mise en forme que « Copier pour Power Apps ») pour ne montrer que les vrais changements.
 * @returns {{ title, before, after, action?, target? } | null}
 */
export function changePreview(project, analysis, currentScreenId) {
  if (!analysis || analysis.error) return null;
  const p = analysis.parsed;
  const dir = analysis.directive;
  if (p.kind === 'screens' && p.screens.length === 1) {
    // écran de même nom : remplacement ; nom inconnu : nouvel écran (jamais l'écran courant écrasé par défaut)
    const s = p.screens[0];
    const target = project.screens.find((x) => x.name === s.name);
    if (target) return { title: t('ai.previewScreen', { name: target.name }), before: screenYaml(target), after: serializeScreens([s]), action: 'replace-screen' };
    return { title: t('ai.previewNewScreen', { name: s.name }), before: '', after: serializeScreens([s]), action: 'add-screen' };
  }
  if (p.kind === 'screens' && p.screens.length) return { title: t('ai.previewNewScreens', { count: p.screens.length }), before: '', after: serializeScreens(p.screens) };
  if (p.kind === 'controls' && p.controls.length) {
    const replaceName = dir?.kind === 'replace' ? dir.target : !dir && p.controls.length === 1 && findByName(project, p.controls[0].name)?.parent ? p.controls[0].name : null;
    if (replaceName) {
      const f = findByName(project, replaceName);
      return { title: t('ai.previewReplace', { name: replaceName }), before: f ? controlsYaml([f.node]) : '', after: controlsYaml(p.controls), action: 'replace', target: replaceName };
    }
    return { title: dir?.kind === 'insert-into' ? t('ai.previewInsertInto', { name: dir.target }) : t('ai.previewInsert'), before: '', after: controlsYaml(p.controls), action: 'insert' };
  }
  if (p.components.length) {
    const existing = p.components.map((c) => (project.components || []).find((x) => x.name === c.name)).filter(Boolean);
    return { title: p.components.length > 1 ? t('ai.previewComponents', { count: p.components.length }) : t('ai.previewComponent', { name: p.components[0].name }), before: existing.length ? componentsYaml(existing) : '', after: componentsYaml(p.components) };
  }
  if (p.app) return { title: 'App', before: appYaml(project.app || { properties: {} }), after: appYaml(p.app) };
  return null;
}

/**
 * Cible « Contrôle.Propriété » annoncée juste avant un bloc powerfx : dernière mention, sur la dernière
 * ligne non vide, d'un contrôle existant (ou App). Tolère la mise en forme : `btn.OnSelect` :, **btn.OnSelect**…
 */
export function formulaTarget(prevText, project) {
  const line = String(prevText || '').trim().split('\n').pop() || '';
  let found = null;
  for (const m of line.matchAll(/('(?:[^']|'')+'|[\p{L}_][\p{L}\p{N}_]*)\.([A-Z][\p{L}\p{N}_]*)/gu)) {
    const control = m[1].startsWith("'") ? m[1].slice(1, -1).replace(/''/g, "'") : m[1];
    if (control === 'App' ? project?.app : findByName(project, control)) found = { control, prop: m[2] };
  }
  return found;
}

/** Avant / après d'une formule Power Fx proposée pour Contrôle.Propriété */
export function formulaPreview(project, controlName, prop, formula) {
  const found = controlName === 'App' ? { node: project.app } : findByName(project, controlName);
  const before = found?.node?.properties?.[prop];
  const after = formula.trim().startsWith('=') ? formula.trim() : `=${formula.trim()}`;
  return { title: `${controlName}.${prop}`, before: before ? `${prop}: ${before}` : '', after: `${prop}: ${after}` };
}

export function applyScreensAdd(project, parsed) {
  const r = mergeParsed(project, { ...parsed, app: null, components: [] }, { mode: 'add' });
  const first = r.added[0] ? r.project.screens.find((x) => x.name === r.added[0].name) : null;
  return { project: r.project, selectId: first?._id };
}

/** Ajoute les composants du bloc (ceux de même nom sont remplacés) */
export function applyComponents(project, parsed) {
  const r = mergeParsed(project, { screens: [], app: null, components: parsed.components }, { mode: 'add' });
  const first = r.project.components.find((c) => c.name === parsed.components[0]?.name);
  return { project: r.project, selectId: first?._id };
}

/** Insère des contrôles dans un conteneur / écran (par nom) */
export function applyControlsInsert(project, parsed, targetId) {
  const taken = allNames(project);
  const map = new Map();
  let nodes = parsed.controls.map((c) => cloneWithNewIds(c, taken, map));
  nodes = nodes.map((n) => applyRenames(n, map));
  const p = insertControls(project, targetId, nodes);
  return { project: p, selectId: nodes[nodes.length - 1]?._id, renamed: map };
}

/** Remplace un contrôle existant par la définition du bloc */
export function applyControlReplace(project, parsed, targetName) {
  const found = findByName(project, targetName);
  if (!found || found.node === found.screen) return { error: t('ai.controlNotFound', { name: targetName }) };
  const old = found.node;
  const freed = new Set([old.name]);
  for (const { node } of walkNodes(old.children)) freed.add(node.name);
  const taken = new Set([...allNames(project)].filter((n) => !freed.has(n)));
  const map = new Map();
  const replacement = parsed.controls.map((c) => cloneWithNewIds(c, taken, map)).map((n) => applyRenames(n, map));
  if (!replacement.length) return { error: t('ai.emptyBlock') };
  replacement[0] = { ...replacement[0], _id: old._id };
  const parent = found.parent;
  const p = updateNode(project, parent._id, (par) => {
    const children = [];
    for (const c of par.children || []) {
      if (c._id === old._id) children.push(...replacement);
      else children.push(c);
    }
    return { ...par, children };
  });
  return { project: p, selectId: old._id, renamed: map };
}

export function applyFormula(project, controlName, prop, formula) {
  const found = controlName === 'App' ? { node: project.app } : findByName(project, controlName);
  if (!found) return { error: t('ai.controlNotFound', { name: controlName }) };
  const f = formula.trim().startsWith('=') ? formula.trim() : `=${formula.trim()}`;
  return { project: updateNode(project, found.node._id, (n) => ({ ...n, properties: { ...(n.properties || {}), [prop]: f } })), selectId: found.node._id };
}

/** Charge des lignes JSON dans une table (créée si besoin) */
export function applyTableData(project, tableName, json, mode = 'replace') {
  let rows;
  try {
    rows = JSON.parse(json);
  } catch (e) {
    return { error: t('ai.invalidJson', { message: e.message }) };
  }
  if (!Array.isArray(rows)) rows = rows?.value || rows?.data || null;
  if (!Array.isArray(rows)) return { error: t('ai.arrayExpected') };
  const list = project.dataSources || [];
  const existing = list.find((d) => d.name === tableName);
  if (existing) {
    // mappe noms d'affichage -> noms logiques
    const idx = new Map();
    for (const c of existing.columns) {
      idx.set(c.name.toLowerCase(), c.name);
      if (c.displayName) idx.set(c.displayName.toLowerCase(), c.name);
    }
    const mapped = rows.map((r) => {
      const o = {};
      for (const [k, v] of Object.entries(r)) {
        const col = existing.columns.find((c) => c.name === (idx.get(k.toLowerCase()) || k));
        let val = v;
        if (col?.type === 'choice' && typeof v === 'string') val = col.options?.find((op) => op.label === v)?.value ?? v;
        o[idx.get(k.toLowerCase()) || k] = val;
      }
      return o;
    });
    return { project: { ...project, dataSources: list.map((d) => (d.id === existing.id ? { ...d, rows: mode === 'append' ? [...(d.rows || []), ...mapped] : mapped } : d)) } };
  }
  const keys = [...new Set(rows.flatMap((r) => Object.keys(r || {})))];
  const columns = keys.map((k) => {
    const v = rows.find((r) => r[k] !== null && r[k] !== undefined)?.[k];
    const type = typeof v === 'number' ? 'number' : typeof v === 'boolean' ? 'bool' : typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? 'datetime' : 'text';
    return { name: k, displayName: k, type };
  });
  const def = createMockTable(tableName, columns);
  def.rows = rows;
  return { project: { ...project, dataSources: [...list, def] } };
}

export { findNode };
