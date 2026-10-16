// Vérificateur d'application : structure YAML, types de contrôles, formules Power Fx, références.
import { parseFormula, walk, FN } from '../fx/index.js';
import { controlDef, isKnownControlType, splitControlType, SCREEN_DEF, APP_DEF, COMPONENT_DEF } from '../catalog/controls.js';
import { findEnum, enumHasMember, ENUMS } from '../catalog/enums.js';
import { defOf } from '../project/helpers.js';
import { customPropertyList, isInstanceSide, isBehaviorKind, kindInfo, DATA_TYPES } from '../project/customProps.js';
import { t } from '../i18n/index.js';

// Membres toujours valides sur un composant ou une instance (en plus des propriétés personnalisées)
const COMPONENT_MEMBERS = new Set(['X', 'Y', 'Width', 'Height', 'Visible', 'DisplayMode', 'Name', ...COMPONENT_DEF.props.map((p) => p.name)]);

const ALLOWED_HEAD = new Set(['Control', 'Variant', 'MetadataKey', 'IsLocked', 'Layout', 'ComponentName', 'ComponentLibraryUniqueName', 'Group', 'Properties', 'Children', 'Description', 'AccessAppScope', 'DefinitionType', 'CustomProperties']);

const SPECIAL_NAMES = new Set(['Self', 'Parent', 'ThisItem', 'ThisRecord', 'App', 'Host', 'Connection', 'Location', 'Acceleration', 'Compass', 'SampleImage', 'ModelDrivenFormIntegration', 'Environment', 'Color', 'Param', 'SharePointIntegration', 'TeamsIntegration', 'Theme', 'Screen']);

// Fonctions à portée d'enregistrement : indices des arguments évalués par ligne
const LAMBDA_ARGS = {
  Filter: (i) => i >= 1,
  LookUp: (i) => i >= 1,
  CountIf: (i) => i >= 1,
  Concat: (i) => i === 1,
  Sort: (i) => i % 2 === 1,
  AddColumns: (i) => i >= 2 && i % 2 === 0,
  ForAll: (i) => i === 1,
  Distinct: (i) => i === 1,
  With: (i) => i === 1,
  Sum: (i, n) => n === 2 && i === 1,
  Average: (i, n) => n === 2 && i === 1,
  Max: (i, n) => n === 2 && i === 1,
  Min: (i, n) => n === 2 && i === 1,
  StdevP: (i, n) => n === 2 && i === 1,
  VarP: (i, n) => n === 2 && i === 1,
  RemoveIf: (i) => i >= 1,
  UpdateIf: (i) => i >= 1,
  IfError: () => true,
};

// Arguments contenant des noms de colonnes (identifiants non résolus attendus)
const COLUMN_NAME_ARGS = {
  AddColumns: (i) => i >= 1 && i % 2 === 1,
  DropColumns: (i) => i >= 1,
  ShowColumns: (i) => i >= 1,
  RenameColumns: (i) => i >= 1,
  SortByColumns: (i) => i % 2 === 1,
  Search: (i) => i >= 2,
  GroupBy: (i) => i >= 1,
  Ungroup: (i) => i >= 1,
  DataSourceInfo: (i) => i === 2,
  Set: (i) => i === 0,
  Collect: (i) => i === 0,
  ClearCollect: (i) => i === 0,
  Clear: (i) => i === 0,
  LoadData: (i) => i === 0,
  Distinct: () => false,
};

export function isBehaviorProperty(prop) {
  return /^On[A-Z]/.test(prop) || prop === 'OnStart' || prop === 'OnSelect';
}

function* iterNodes(nodes, parents = []) {
  for (const n of nodes || []) {
    yield { node: n, parents };
    if (n.children?.length) yield* iterNodes(n.children, [...parents, n]);
  }
}

/** Collecte les noms déclarés dynamiquement (variables, collections, contextes) */
export function collectDeclaredNames(project) {
  const globals = new Set();
  const contexts = new Set();
  const collections = new Set();
  const visitFormula = (f) => {
    if (typeof f !== 'string' || !f.startsWith('=')) return;
    const { ast } = parseFormula(f);
    if (!ast) return;
    walk(ast, (n) => {
      if (n.type !== 'Call') return;
      const a0 = n.args[0];
      if (n.name === 'Set' && a0?.type === 'Ident') globals.add(a0.name);
      else if ((n.name === 'Collect' || n.name === 'ClearCollect' || n.name === 'LoadData') && a0?.type === 'Ident') collections.add(a0.name);
      else if (n.name === 'UpdateContext' && a0?.type === 'Record') a0.fields.forEach((fl) => contexts.add(fl.name));
      else if (n.name === 'Navigate' && n.args[2]?.type === 'Record') n.args[2].fields.forEach((fl) => contexts.add(fl.name));
    });
  };
  const all = [project.app, ...(project.screens || []), ...(project.components || [])].filter(Boolean);
  for (const s of all) {
    for (const v of Object.values(s.properties || {})) visitFormula(v);
    for (const { node } of iterNodes(s.children)) for (const v of Object.values(node.properties || {})) visitFormula(v);
  }
  const named = new Set();
  const f = project.app?.properties?.Formulas;
  if (f && f !== '=') {
    const { ast } = parseFormula(f);
    const items = ast ? (ast.type === 'Chain' ? ast.items : [ast]) : [];
    for (const it of items) if (it.type === 'Binary' && it.op === '=' && it.left.type === 'Ident') named.add(it.left.name);
  }
  return { globals, contexts, collections, named };
}

/** Index des noms connus du projet (pour la validation et l'autocomplétion) */
export function buildNameIndex(project) {
  const controls = new Map(); // nom -> { node, screen }
  const screens = new Set((project.screens || []).map((s) => s.name));
  for (const s of project.screens || []) for (const { node } of iterNodes(s.children)) if (!controls.has(node.name)) controls.set(node.name, { node, screen: s });
  const declared = collectDeclaredNames(project);
  const dataSources = new Map((project.dataSources || []).map((d) => [d.name, d]));
  const optionSets = new Set();
  for (const d of project.dataSources || []) {
    for (const c of d.columns || []) {
      if ((c.type === 'choice' || c.type === 'multichoice') && c.options?.length) {
        optionSets.add(c.optionSetName || c.displayName || c.name);
        optionSets.add(`${c.displayName || c.name} (${d.name})`);
      }
    }
  }
  const externals = new Set((project.flows || []).map((f) => String(f.callName || '').split('.')[0]));
  const components = new Set((project.components || []).map((c) => c.name));
  const componentsByName = new Map((project.components || []).map((c) => [c.name, c]));
  return { controls, screens, ...declared, dataSources, optionSets, externals, components, componentsByName };
}

function issue(list, severity, code, message, where, extra = {}) {
  list.push({ severity, code, message, ...where, ...extra });
}

/**
 * Valide un projet complet.
 * @returns {Array<{severity:'error'|'warning'|'info', code, message, screenId?, screenName?, nodeId?, controlName?, property?, start?, end?}>}
 */
export function validateProject(project, opts = {}) {
  const issues = [];
  const index = buildNameIndex(project);

  // Noms en double (écrans + contrôles + composants)
  const seen = new Map();
  const addName = (name, where) => {
    if (!seen.has(name)) seen.set(name, []);
    seen.get(name).push(where);
  };
  for (const s of project.screens || []) {
    addName(s.name, { screenId: s._id, screenName: s.name, nodeId: s._id, controlName: s.name });
    for (const { node } of iterNodes(s.children)) addName(node.name, { screenId: s._id, screenName: s.name, nodeId: node._id, controlName: node.name });
  }
  for (const [name, wheres] of seen) {
    if (wheres.length > 1) {
      for (const w of wheres) issue(issues, 'error', 'duplicate-name', t('validation.duplicateName', { name, count: wheres.length }), w);
    }
  }

  if (project.app) validateFormulas(project.app, APP_DEF, { screenName: 'App', nodeId: project.app._id, controlName: 'App' }, issues, index, { kind: 'app' });

  for (const s of project.screens || []) {
    const where = { screenId: s._id, screenName: s.name };
    if (!s.name || !s.name.trim()) issue(issues, 'error', 'empty-name', t('validation.screenNoName'), where);
    validateFormulas(s, SCREEN_DEF, { ...where, nodeId: s._id, controlName: s.name }, issues, index, { kind: 'screen' });
    for (const { node, parents } of iterNodes(s.children)) validateControl(node, parents, { ...where, nodeId: node._id, controlName: node.name }, issues, index, project);
  }

  for (const c of project.components || []) {
    const where = { screenId: c._id, screenName: t('validation.componentGroup', { name: c.name }) };
    const cWhere = { ...where, nodeId: c._id, controlName: c.name };
    const componentNames = new Set();
    const counts = new Map();
    for (const { node } of iterNodes(c.children)) {
      componentNames.add(node.name);
      counts.set(node.name, (counts.get(node.name) || 0) + 1);
    }
    for (const { node } of iterNodes(c.children)) {
      if (counts.get(node.name) > 1) issue(issues, 'error', 'duplicate-name', t('validation.duplicateNameInComponent', { name: node.name, component: c.name }), { ...where, nodeId: node._id, controlName: node.name });
    }
    if (dependsOnItself(project, c.name)) issue(issues, 'error', 'component-cycle', t('validation.componentCycle', { name: c.name }), cWhere);
    validateCustomProperties(c, cWhere, issues, index, componentNames);
    validateFormulas(c, defOf(c, 'component'), cWhere, issues, index, { kind: 'component', component: c, componentNames, ...customFormulaOptions(c, 'definition') });
    for (const { node, parents } of iterNodes(c.children)) validateControl(node, parents, { ...where, nodeId: node._id, controlName: node.name }, issues, index, project, c, componentNames);
  }
  if (opts.sort !== false) {
    const rank = { error: 0, warning: 1, info: 2 };
    issues.sort((a, b) => rank[a.severity] - rank[b.severity]);
  }
  return issues;
}

function dependsOnItself(project, name) {
  const seen = new Set();
  const visit = (compName) => {
    const comp = (project.components || []).find((c) => c.name === compName);
    for (const { node } of iterNodes(comp?.children)) {
      const dep = /^CanvasComponent(@|$)/i.test(String(node.head?.Control || '')) ? node.head?.ComponentName : null;
      if (!dep) continue;
      if (dep === name) return true;
      if (!seen.has(dep)) {
        seen.add(dep);
        if (visit(dep)) return true;
      }
    }
    return false;
  };
  return visit(name);
}

/**
 * Options d'analyse des formules liées aux propriétés personnalisées d'un composant :
 * paramètres accessibles par propriété, propriétés de comportement (événements, actions).
 * side : 'instance' (formules d'une instance) ou 'definition' (formules de la définition)
 */
function customFormulaOptions(comp, side) {
  const paramsByProp = new Map();
  const behaviorProps = new Set();
  for (const cp of customPropertyList(comp)) {
    const onThisSide = side === 'instance' ? isInstanceSide(cp.kind) : !isInstanceSide(cp.kind);
    if (!onThisSide) continue;
    if (cp.params.length) paramsByProp.set(cp.name, new Set(cp.params.map((p) => p.name)));
    if (isBehaviorKind(cp.kind)) behaviorProps.add(cp.name);
  }
  return { paramsByProp, behaviorProps };
}

/** Déclaration des propriétés personnalisées et formules par défaut (CustomProperties) */
function validateCustomProperties(comp, where, issues, index, componentNames) {
  const defaults = {};
  for (const cp of customPropertyList(comp)) {
    const w = { ...where, property: cp.name };
    const raw = cp.raw;
    if (!raw.PropertyKind) issue(issues, 'error', 'custom-kind', t('validation.customKindMissing', { name: cp.name }), w);
    else if (raw.PropertyKind !== cp.kind) issue(issues, 'error', 'custom-kind', t('validation.customKindUnknown', { kind: raw.PropertyKind, name: cp.name }), w);
    const info = kindInfo(cp.kind);
    if (info.typed === 'data' && !DATA_TYPES.includes(raw.DataType)) {
      const msg = raw.DataType ? t('validation.dataTypeUnknown', { type: raw.DataType, name: cp.name }) : t('validation.dataTypeMissing', { name: cp.name });
      issue(issues, 'warning', 'custom-type', msg, w);
    }
    if (info.typed === 'return' && raw.ReturnType !== 'None' && !DATA_TYPES.includes(raw.ReturnType)) {
      const msg = raw.ReturnType ? t('validation.returnTypeUnknown', { type: raw.ReturnType, name: cp.name }) : t('validation.returnTypeMissing', { name: cp.name });
      issue(issues, 'warning', 'custom-type', msg, w);
    }
    if (isInstanceSide(cp.kind)) {
      if (cp.default !== undefined) defaults[cp.name] = cp.default;
    } else if (comp.properties?.[cp.name] === undefined) {
      issue(issues, 'info', 'custom-no-formula', t('validation.customNoFormula', { name: cp.name, kind: info.label.toLowerCase() }), w);
    }
  }
  // les valeurs par défaut sont évaluées dans le contexte de l'instance
  validateFormulas({ properties: defaults }, COMPONENT_DEF, where, issues, index, { kind: 'component', component: comp, componentNames, ...customFormulaOptions(comp, 'instance') });
}

function validateControl(node, parents, where, issues, index, project, component, componentNames) {
  const type = node.head?.Control;
  if (!node.name || !String(node.name).trim()) issue(issues, 'error', 'empty-name', t('validation.controlNoName'), where);
  else if (/^\s|\s$/.test(node.name)) issue(issues, 'warning', 'name-spaces', t('validation.nameSpaces', { name: node.name }), where);
  if (!type) {
    issue(issues, 'error', 'missing-control', t('validation.missingControl', { name: node.name }), where);
  } else {
    const { base, version } = splitControlType(type);
    if (!version && base !== 'CanvasComponent') issue(issues, 'warning', 'missing-version', t('validation.missingVersion', { type, base }), where);
    else if (version && !/^\d+(\.\d+){1,3}$/.test(version)) issue(issues, 'error', 'bad-version', t('validation.badVersion', { version, name: node.name }), where);
    if (!isKnownControlType(type)) issue(issues, 'warning', 'unknown-control', t('validation.unknownControl', { type: base }), where);
    if (base === 'CanvasComponent') {
      if (!node.head.ComponentName) issue(issues, 'error', 'component-name', t('validation.componentNameMissing', { name: node.name }), where);
      else if (!index.components.has(node.head.ComponentName))
        issue(issues, 'info', 'component-missing', t('validation.componentMissing', { component: node.head.ComponentName }), where);
    }
  }
  for (const k of Object.keys(node.head || {})) {
    if (!ALLOWED_HEAD.has(k)) issue(issues, 'warning', 'unknown-key', t('validation.unknownKey', { key: k, name: node.name }), where);
  }
  const def = defOf(node, 'control', project);
  if (node.children?.length && !def.container && !def.allowsChildren && !def.unknown) {
    issue(issues, 'error', 'children-not-allowed', t('validation.childrenNotAllowed', { name: node.name, type: def.label }), where);
  }
  if (def.variants && node.head?.Variant && def.id === 'GroupContainer' && !def.variants.includes(node.head.Variant)) {
    issue(issues, 'warning', 'unknown-variant', t('validation.unknownVariant', { variant: node.head.Variant }), where);
  }
  if (def.id === 'TypedDataCard' && !parents.some((p) => controlDef(p).id === 'Form')) {
    issue(issues, 'warning', 'card-outside-form', t('validation.cardOutsideForm', { name: node.name }), where);
  }
  if (def.id === 'Form' && !node.properties?.DataSource) issue(issues, 'warning', 'form-no-ds', t('validation.formNoDataSource', { name: node.name }), where);
  if (def.id === 'Gallery' && !node.properties?.Items) issue(issues, 'info', 'gallery-no-items', t('validation.galleryNoItems', { name: node.name }), where);
  const inTemplate = parents.some((p) => ['Gallery', 'Form'].includes(controlDef(p).id));
  validateFormulas(node, def, where, issues, index, { kind: 'control', inTemplate, component, componentNames, ...(def.component ? customFormulaOptions(def.component, 'instance') : {}) });
}

function validateFormulas(node, def, where, issues, index, opts) {
  for (const [prop, formula] of Object.entries(node.properties || {})) {
    const w = { ...where, property: prop };
    if (typeof formula !== 'string') {
      issue(issues, 'error', 'not-formula', t('validation.notFormula', { property: prop }), w);
      continue;
    }
    if (!formula.startsWith('=')) {
      issue(issues, 'error', 'missing-equals', t('validation.missingEquals', { property: prop, value: /^-?\d/.test(formula) ? formula : JSON.stringify(formula) }), w);
      continue;
    }
    if (!def.unknown && def.propIndex && def.propIndex.size && !def.propIndex.has(prop) && !(def.defaults && prop in def.defaults) && opts.kind === 'control' && (def.id !== 'CanvasComponent' || def.component)) {
      if (def.component) issue(issues, 'warning', 'unknown-property', t('validation.unknownComponentProperty', { component: def.component.name, property: prop }), w);
      else issue(issues, 'info', 'unknown-property', t('validation.unlistedProperty', { property: prop, type: def.label }), w);
    }
    const { ast, error } = parseFormula(formula);
    if (error) {
      issue(issues, 'error', 'syntax', t('validation.syntaxError', { property: prop, error: error.message }), w, { start: error.start, end: error.end });
      continue;
    }
    if (prop === 'Formulas' && opts.kind === 'app') continue;
    analyzeFormula(ast, prop, w, issues, index, opts);
  }
}

function analyzeFormula(ast, prop, where, issues, index, opts) {
  const behaviorProp = isBehaviorProperty(prop) || opts.kind === 'app' || !!opts.behaviorProps?.has(prop);
  const reported = new Set();
  const params = opts.paramsByProp?.get(prop);
  // portée : liste des alias / champs connus
  const visit = (node, scope) => {
    if (!node) return;
    switch (node.type) {
      case 'Call': {
        const fn = FN[node.name];
        const dotted = node.name.includes('.');
        if (!fn && !dotted) {
          const key = `fn:${node.name}`;
          if (!reported.has(key)) {
            reported.add(key);
            issue(issues, 'warning', 'unknown-function', t('validation.unknownFunction', { name: node.name }), where, { start: node.start, end: node.nameEnd });
          }
        }
        if (fn) {
          const n = node.args.length;
          if (n < fn.min || n > fn.max) {
            const p = { name: node.name, given: n, expected: fn.min, min: fn.min, max: fn.max };
            const msg =
              fn.min === fn.max ? t('validation.arityExact', p) : fn.max === Infinity ? t('validation.arityAtLeast', p) : t('validation.arityRange', p);
            issue(issues, 'error', 'arity', msg, where, { start: node.start, end: node.end });
          }
          if (fn.behavior && !behaviorProp) {
            issue(issues, 'warning', 'behavior-in-data', t('validation.behaviorInData', { name: node.name, property: prop }), where, {
              start: node.start,
              end: node.nameEnd,
            });
          }
        }
        if (dotted) {
          const root = node.name.split('.')[0];
          const member = node.name.slice(root.length + 1);
          const compTarget = componentTarget(root, index, opts);
          if (compTarget && !member.includes('.')) {
            if (!compTarget.custom.has(member)) {
              const key = `cm:${node.name}`;
              if (!reported.has(key)) {
                reported.add(key);
                issue(issues, 'warning', 'unknown-member', t('validation.unknownCallableMember', { component: compTarget.comp.name, member }), where, { start: node.start, end: node.nameEnd });
              }
            }
          } else if (!index.externals.has(root) && root !== 'Calendar' && root !== 'Clock' && root !== 'Environment' && !index.components.has(root) && !index.controls.has(root) && !(opts.component && opts.component.name === root)) {
            const key = `ext:${node.name}`;
            if (!reported.has(key)) {
              reported.add(key);
              issue(issues, 'info', 'external-call', t('validation.externalCall', { name: node.name }), where, { start: node.start, end: node.nameEnd, external: node.name });
            }
          }
        }
        const lambda = LAMBDA_ARGS[node.name];
        const colArgs = COLUMN_NAME_ARGS[node.name];
        node.args.forEach((a, i) => {
          if (colArgs && colArgs(i) && a.type === 'Ident') return;
          let s = scope;
          if (lambda && lambda(i, node.args.length)) {
            const first = node.args[0];
            s = { ...scope, lambda: true, aliases: new Set(scope.aliases) };
            if (first?.type === 'As') s.aliases.add(first.name);
            if (node.name === 'With' && first?.type === 'Record') first.fields.forEach((f) => s.aliases.add(f.name));
          }
          visit(a, s);
        });
        return;
      }
      case 'Ident':
        if (params?.has(node.name)) return;
        checkIdent(node, scope, where, issues, index, opts, reported);
        return;
      case 'Member': {
        // On ne vérifie que la racine ; les membres d'énumérations connues et des composants sont contrôlés
        if (node.obj.type === 'Ident' && !node.obj.global) {
          const compTarget = componentTarget(node.obj.name, index, opts);
          if (compTarget && !compTarget.custom.has(node.name) && !compTarget.members.has(node.name)) {
            const key = `cm:${node.obj.name}.${node.name}`;
            if (!reported.has(key)) {
              reported.add(key);
              issue(issues, 'warning', 'unknown-member', t('validation.unknownComponentMember', { member: node.name, component: compTarget.comp.name }), where, { start: node.nameStart, end: node.end });
            }
          }
          const en = findEnum(node.obj.name);
          if (en && ENUMS[en]?.length && !enumHasMember(en, node.name) && !index.controls.has(node.obj.name)) {
            issue(issues, 'warning', 'enum-member', t('validation.enumMember', { member: node.name, enum: en }), where, { start: node.nameStart, end: node.end });
          }
        }
        visit(node.obj, scope);
        return;
      }
      case 'As':
        visit(node.expr, scope);
        return;
      default: {
        const kids = [];
        walk(node, (n, parent) => {
          if (parent === node) kids.push(n);
          return n === node;
        });
        kids.forEach((k) => visit(k, scope));
      }
    }
  };
  visit(ast, { lambda: false, aliases: new Set() });
}

/**
 * Composant visé par « Nom.Membre » : le composant courant (dans sa définition) ou une instance (dans l'application).
 * Renvoie { comp, custom: noms des propriétés personnalisées, members: autres membres valides } ou null.
 */
function componentTarget(name, index, opts) {
  let comp = null;
  if (opts.component && name === opts.component.name) comp = opts.component;
  else if (!opts.componentNames?.has(name)) {
    const c = index.controls.get(name)?.node;
    if (c && /^CanvasComponent(@|$)/i.test(String(c.head?.Control || ''))) comp = index.componentsByName.get(c.head?.ComponentName) || null;
  }
  if (!comp) return null;
  const custom = new Set(customPropertyList(comp).map((cp) => cp.name));
  const members = new Set([...COMPONENT_MEMBERS, ...(controlDef({ head: { Control: 'CanvasComponent' } }).props || []).map((p) => p.name)]);
  return { comp, custom, members };
}

function checkIdent(node, scope, where, issues, index, opts, reported) {
  const name = node.name;
  if (SPECIAL_NAMES.has(name)) return;
  if (scope.aliases.has(name)) return;
  if (index.controls.has(name) || index.screens.has(name)) return;
  if (index.globals.has(name) || index.contexts.has(name) || index.collections.has(name) || index.named.has(name)) return;
  if (index.dataSources.has(name) || index.optionSets.has(name) || index.externals.has(name) || index.components.has(name)) return;
  if (findEnum(name)) return;
  if (opts.component) {
    if (name === opts.component.name) return;
    if (opts.componentNames?.has(name)) return;
    if (opts.component.customProperties && name in opts.component.customProperties) return;
  }
  if (FN[name]) return;
  if (scope.lambda || opts.inTemplate) return; // probablement un champ d'enregistrement
  const key = `id:${name}`;
  if (reported.has(key)) return;
  reported.add(key);
  issue(issues, 'warning', 'unknown-name', t('validation.unknownName', { name }), where, { start: node.start, end: node.end, unknownName: name });
}

/** Résumé par sévérité */
export function summarize(issues) {
  const s = { error: 0, warning: 0, info: 0 };
  for (const i of issues) s[i.severity]++;
  return s;
}


