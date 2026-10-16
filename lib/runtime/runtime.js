// État d'exécution de l'application émulée + interface "host" de l'évaluateur Power Fx.
import {
  parseFormula,
  evaluateAsync,
  evaluateSync,
  ev,
  FxControlRef,
  FxScreenRef,
  FxEnumNs,
  FxEnum,
  FxNamespaceRef,
  FxRuntimeError,
  FxUntyped,
  DS,
  isRecord,
  isBlank,
  copyRecord,
  NEW_RECORD,
  asTable,
  toText,
  jsonOf,
  fxEquals,
} from '../fx/index.js';
import { findEnum } from '../catalog/enums.js';
import { controlDef, APP_DEF, SCREEN_DEF } from '../catalog/controls.js';
import { DataRegistry } from '../data/datasource.js';
import { Inst, buildScreen } from '../render/build.js';
import { isInstanceSide, paramsOf } from '../project/customProps.js';
import { t, getLocale, onLocaleChange, INTL_LOCALES } from '../i18n/index.js';

const GEOM = new Set(['X', 'Y', 'Width', 'Height']);

const SAMPLE_IMAGE =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 150"><rect width="200" height="150" fill="#e8eef9"/><path d="M20 120 L70 60 L105 100 L130 75 L180 120 Z" fill="#9bb3e0"/><circle cx="150" cy="40" r="14" fill="#f2c94c"/></svg>',
  );

function toFxValue(v) {
  if (v === null || v === undefined) return null;
  if (Array.isArray(v)) return v.map((x) => (x && typeof x === 'object' && !Array.isArray(x) ? toFxValue(x) : { Value: toFxValue(x) }));
  if (typeof v === 'object') {
    const o = {};
    for (const [k, val] of Object.entries(v)) o[k] = toFxValue(val);
    return o;
  }
  return v;
}

function shallowSame(a, b) {
  if (a === b) return true;
  if (!isRecord(a) || !isRecord(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => fxEquals(a[k], b[k]));
}

export class Runtime {
  constructor() {
    this.version = 0;
    this.listeners = new Set();
    this.size = { width: 1366, height: 768 };
    this.mode = 'edit';
    this.project = null;
    this.registry = new DataRegistry([]);
    this.reg = new Map();
    this.lastRoot = null;
    this.logs = [];
    this.runtimeErrors = new Map();
    this.unresolved = new Map();
    this.externalCalls = new Map();
    this.timers = new Map();
    this.busy = 0;
    this.hooks = {}; // { onNavigate, onRefresh, onExternalHttp }
    this.resetState();
  }

  /**
   * Nouveau rendu à chaque changement de langue de l'interface (messages d'erreur traduits, langue par défaut
   * de l'application). Renvoie la fonction de désabonnement, à appeler quand l'exécution n'est plus utilisée.
   */
  followLocale() {
    return onLocaleChange(() => this.bump());
  }

  // ------------------------------------------------------------------ état
  resetState() {
    this.globals = new Map();
    this.contextVars = new Map();
    this.collections = new Map();
    this.ctlState = new Map();
    this.navStack = [];
    this.notifications = [];
    this.formulaCache = new Map();
    this.formulaEvaluating = new Set();
    this.activeScreen = this.project?.screens?.[0]?.name ?? null;
    if (this.project) this.registry = new DataRegistry(this.project.dataSources || []);
    this.stopTimers();
    this.bump();
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  bump() {
    this.version++;
    this.formulaCache.clear();
    if (this._scheduled) return;
    this._scheduled = true;
    queueMicrotask(() => {
      this._scheduled = false;
      for (const l of this.listeners) l(this.version);
    });
  }

  log(type, message, detail) {
    this.logs.push({ t: new Date(), type, message, detail });
    if (this.logs.length > 500) this.logs.splice(0, this.logs.length - 500);
  }

  get locale() {
    return this.project?.settings?.locale || INTL_LOCALES[getLocale()];
  }

  setProject(project, { silent = false } = {}) {
    const prev = this.project;
    if (prev === project) return;
    this.project = project;
    this.formulaCache.clear();
    if (!prev || prev.dataSources !== project.dataSources) this.registry = new DataRegistry(project.dataSources || []);
    if (!prev || prev.app !== project.app) this.parseNamedFormulas();
    this.screensByName = new Map((project.screens || []).map((s) => [s.name, s]));
    this.componentsByName = new Map((project.components || []).map((c) => [c.name, c]));
    this.externalsByName = new Map();
    for (const f of project.flows || []) this.externalsByName.set(String(f.callName || '').toLowerCase(), f);
    this.size = { width: project.settings?.width || 1366, height: project.settings?.height || 768 };
    if (!this.activeScreen || !this.screensByName.has(this.activeScreen)) this.activeScreen = project.screens?.[0]?.name ?? null;
    if (!silent) this.bump();
  }

  parseNamedFormulas() {
    this.namedFormulas = new Map();
    const f = this.project?.app?.properties?.Formulas;
    if (!f || f === '=') return;
    const { ast } = parseFormula(f);
    if (!ast) return;
    const items = ast.type === 'Chain' ? ast.items : [ast];
    for (const it of items) {
      if (it.type === 'Binary' && it.op === '=' && it.left.type === 'Ident') this.namedFormulas.set(it.left.name, it.right);
    }
  }

  controlState(key) {
    let s = this.ctlState.get(key);
    if (!s) {
      s = {};
      this.ctlState.set(key, s);
    }
    return s;
  }

  setControlState(key, patch) {
    const s = this.controlState(key);
    Object.assign(s, patch);
    this.bump();
  }

  clearControlState(prefix) {
    for (const k of [...this.ctlState.keys()]) if (k === prefix || k.startsWith(prefix + '/') || k.startsWith(prefix + '#')) this.ctlState.delete(k);
    this.bump();
  }

  componentByName(name) {
    return this.componentsByName?.get(name) || null;
  }

  // ------------------------------------------------------------------ construction
  build(screenName) {
    const screen = this.screensByName?.get(screenName);
    if (!screen) return null;
    this.runtimeErrors = new Map();
    return buildScreen(this, screen);
  }

  beginBuild(reg) {
    this.reg = reg;
    this.detachedCache = new Map();
  }

  endBuild(root) {
    this.lastRoot = root;
  }

  reportRuntimeError(inst, prop, message) {
    if (inst.template) return;
    const k = `${inst.name}.${prop}`;
    if (!this.runtimeErrors.has(k)) this.runtimeErrors.set(k, { control: inst.name, nodeId: inst.node._id, prop, message });
  }

  reportUnresolved(name) {
    this.unresolved.set(name, (this.unresolved.get(name) || 0) + 1);
  }

  reportUnknownFunction(name) {
    this.unresolved.set(`${name}()`, (this.unresolved.get(`${name}()`) || 0) + 1);
  }

  // ------------------------------------------------------------------ résolution des noms
  findInstance(name, ctx) {
    let gi = ctx?.inst?.galleryItem;
    while (gi) {
      const loc = gi.item?.byName?.get(name);
      if (loc) return loc;
      gi = gi.gallery?.galleryItem;
    }
    const comp = ctx?.inst?.component;
    if (comp) {
      const loc = comp.byName?.get(name);
      if (loc) return loc;
    }
    const s = this.reg.get(name);
    if (s) return s;
    return this.detached(name);
  }

  detached(name) {
    if (!this.project) return null;
    if (this.detachedCache?.has(name)) return this.detachedCache.get(name);
    let found = null;
    for (const screen of this.project.screens || []) {
      const stack = [...(screen.children || [])];
      while (stack.length) {
        const n = stack.shift();
        if (n.name === name) {
          found = { node: n, screen };
          break;
        }
        if (n.children) stack.push(...n.children);
      }
      if (found) break;
    }
    let inst = null;
    if (found) {
      const screenInst = new Inst(this, found.screen, SCREEN_DEF, null, { kind: 'screen', key: found.screen.name, screen: found.screen.name });
      screenInst.layout = { x: 0, y: 0, w: this.size.width, h: this.size.height };
      inst = new Inst(this, found.node, controlDef(found.node), screenInst, { key: `${found.screen.name}/~${name}`, screen: found.screen.name });
    }
    if (!this.detachedCache) this.detachedCache = new Map();
    this.detachedCache.set(name, inst);
    return inst;
  }

  specialGlobal(name) {
    switch (name) {
      case 'App':
        return {
          ActiveScreen: new FxScreenRef(this.activeScreen),
          Width: this.size.width,
          Height: this.size.height,
          DesignWidth: this.project?.settings?.width || 1366,
          DesignHeight: this.project?.settings?.height || 768,
          MinScreenWidth: 320,
          MinScreenHeight: 320,
          SizeBreakpoints: [{ Value: 600 }, { Value: 900 }, { Value: 1200 }],
          StartScreen: new FxScreenRef(this.project?.screens?.[0]?.name),
        };
      case 'Host':
        return { BrowserUserAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'node', OSType: 'Windows', SessionID: 'local-session', TenantID: '00000000-0000-0000-0000-000000000000', OfflineEnabled: false, Version: 'Canevas Studio' };
      case 'Connection':
        return { Connected: true, Metered: false };
      case 'Location':
        return { Latitude: 48.8566, Longitude: 2.3522, Altitude: 35 };
      case 'Acceleration':
        return { X: 0, Y: 0, Z: 0 };
      case 'Compass':
        return { Heading: 0 };
      case 'SampleImage':
        return SAMPLE_IMAGE;
      case 'ModelDrivenFormIntegration': {
        const id = this.project?.settings?.mdfItemId || '';
        return { Data: id ? [{ ItemId: id }] : [], Item: null };
      }
      default:
        return undefined;
    }
  }

  resolveGlobal(name, ctx) {
    // Composant : nom du composant = accès aux propriétés personnalisées
    const comp = ctx?.inst?.component;
    if (comp && name === comp.name) return { value: comp.ref };
    // Variables de contexte
    const cv = this.contextVars.get(ctx?.screen);
    if (cv && cv.has(name)) return { value: cv.get(name) };
    // Contrôles
    const inst = this.findInstance(name, ctx);
    if (inst) return { value: inst.ref };
    if (this.globals.has(name)) return { value: this.globals.get(name) };
    if (this.collections.has(name)) return { value: this.collections.get(name) };
    if (this.screensByName?.has(name)) return { value: new FxScreenRef(name) };
    if (this.namedFormulas?.has(name)) return { value: this.evalNamedFormula(name) };
    const ds = this.registry.get(name);
    if (ds) return { value: ds.rows };
    const sp = this.specialGlobal(name);
    if (sp !== undefined) return { value: sp };
    const optNs = this.registry.optionNs.get(name);
    if (optNs) return { value: optNs };
    const e = findEnum(name);
    if (e) return { value: new FxEnumNs(e) };
    if (name === 'Color') return { value: new FxEnumNs('Color') };
    if (name === 'Environment') return { value: new FxNamespaceRef('Environment', 'env') };
    for (const f of this.project?.flows || []) {
      if ((f.callName || '').split('.')[0] === name) return { value: new FxNamespaceRef(name, 'external') };
    }
    return null;
  }

  evalNamedFormula(name) {
    if (this.formulaCache.has(name)) return this.formulaCache.get(name);
    if (this.formulaEvaluating.has(name)) return null;
    this.formulaEvaluating.add(name);
    let v = null;
    try {
      v = evaluateSync(this.namedFormulas.get(name), { host: this, scopes: [], screen: this.activeScreen, behavior: false });
    } catch (e) {
      this.log('error', t('runtime.namedFormulaError', { name, message: e.message }));
    } finally {
      this.formulaEvaluating.delete(name);
    }
    this.formulaCache.set(name, v);
    return v;
  }

  controlMember(ref, prop, ctx) {
    const inst = ref.inst || this.findInstance(ref.name, ctx);
    if (!inst) return null;
    if (inst.kind === 'componentRoot') return this.componentMember(inst, prop);
    if (inst.componentRoot) return this.instanceMember(inst, prop);
    if (prop === 'Name' && inst.node.properties?.Name === undefined) return inst.name;
    return inst.get(prop);
  }

  /** Dans un composant : NomDuComposant.Propriété (ou Parent.Propriété pour les contrôles de premier niveau) */
  componentMember(root, prop) {
    if (GEOM.has(prop) && root.layout) return root.get(prop);
    const outer = root.instance;
    const cp = root.componentDef?.customProperties?.[prop];
    if (cp) {
      // valeur fournie par l'instance (évaluée dans le contexte de l'application), sinon valeur par défaut
      if (outer && isInstanceSide(cp.PropertyKind) && outer.isExplicit(prop)) return outer.evalFormula(prop);
      return root.evalFormula(prop);
    }
    if (prop === 'DisplayMode') return outer ? outer.get('DisplayMode') : new FxEnum('DisplayMode', 'Edit');
    if (prop === 'Visible') return outer ? outer.get('Visible') : true;
    if (prop === 'Name') return root.name;
    return root.evalFormula(prop);
  }

  /** Depuis l'application : Instance.Propriété */
  instanceMember(inst, prop) {
    const root = inst.componentRoot;
    const cp = root.componentDef?.customProperties?.[prop];
    if (cp) {
      if (isInstanceSide(cp.PropertyKind) && inst.isExplicit(prop)) return inst.evalFormula(prop);
      return root.evalFormula(prop);
    }
    if (prop === 'Name' && !inst.isExplicit('Name')) return inst.name;
    if (!inst.isExplicit(prop) && !(prop in (inst.def.defaults || {})) && !GEOM.has(prop)) return root.evalFormula(prop);
    return inst.get(prop);
  }

  /**
   * Appel d'une propriété personnalisée sous forme de fonction (générateur pour l'évaluateur) :
   *  - Event / InputFunction : formule de l'instance (ou valeur par défaut), déclenchée par le composant ;
   *  - Action / OutputFunction : formule de la définition, appelée par l'application.
   * Les paramètres déclarés sont accessibles par leur nom dans la formule appelée.
   */
  *callComponentProperty(root, member, args, ctx) {
    const comp = root.componentDef;
    const raw = comp?.customProperties?.[member];
    const kind = raw?.PropertyKind || 'Input';
    const scopes = [];
    const params = paramsOf(raw);
    for (let i = 0; i < params.length; i++) {
      let v = args[i];
      if (v === undefined && params[i].default !== undefined && params[i].default !== null) {
        const { ast } = parseFormula(String(params[i].default));
        v = ast ? yield* ev(ast, { ...root.ctx(), behavior: false }) : null;
      }
      scopes.push({ kind: 'param', alias: params[i].name, implicit: false, rec: v ?? null });
    }
    const label = `${root.instance?.name || comp.name}.${member}`;
    if (kind === 'Event' || kind === 'InputFunction') {
      const host = root.instance || root;
      const formula = host.formula(member);
      if (!formula || formula === '=') return null;
      if (kind === 'Event') {
        if (!ctx.behavior) return null;
        return yield this.runFormulaFor(host, formula, label, scopes);
      }
      const { ast, error } = parseFormula(formula);
      if (error) throw new FxRuntimeError(t('runtime.syntaxErrorIn', { label, message: error.message }), 'InvalidArgument');
      return yield* ev(ast, { ...host.ctx(), scopes: [...host.scopes, ...scopes], behavior: ctx.behavior });
    }
    if (kind === 'Action' || kind === 'OutputFunction') {
      const formula = comp.properties?.[member];
      if (!formula || formula === '=') return null;
      if (kind === 'Action') {
        if (!ctx.behavior) return null;
        return yield this.runFormulaFor(root, formula, label, scopes);
      }
      const { ast, error } = parseFormula(formula);
      if (error) throw new FxRuntimeError(t('runtime.syntaxErrorIn', { label, message: error.message }), 'InvalidArgument');
      return yield* ev(ast, { ...root.ctx(), scopes, behavior: ctx.behavior });
    }
    return this.componentMember(root, member);
  }

  screenMember(ref, prop) {
    if (prop === 'Name') return ref.name;
    if (prop === 'Width') return this.size.width;
    if (prop === 'Height') return this.size.height;
    const screen = this.screensByName?.get(ref.name);
    if (screen?.properties?.[prop]) {
      const inst = new Inst(this, screen, SCREEN_DEF, null, { kind: 'screen', key: screen.name, screen: screen.name });
      inst.layout = { x: 0, y: 0, w: this.size.width, h: this.size.height };
      return inst.get(prop);
    }
    return null;
  }

  thisItemFallback() {
    return null;
  }

  isType(rec, typeNode) {
    if (isBlank(rec)) return false;
    const name = typeNode?.name;
    const ds = name ? this.registry.get(name) : null;
    if (!ds) return true;
    if (rec[DS]) return rec[DS] === ds || (rec[DS].logicalName && rec[DS].logicalName === ds.logicalName);
    if (rec.__lookup) return !rec.entity || String(rec.entity).toLowerCase() === String(ds.logicalName || ds.name).toLowerCase();
    return false;
  }

  asType(rec, typeNode) {
    if (isBlank(rec)) return null;
    const name = typeNode?.name;
    const ds = name ? this.registry.get(name) : null;
    if (!ds) return rec;
    if (rec[DS] === ds) return rec;
    const id = rec.__lookup ? rec.id : rec[DS] ? rec[rec[DS].primaryKey] : null;
    if (id !== null && id !== undefined) return ds.findByKey(id) || ds.attach({ [ds.primaryKey || 'id']: id });
    return rec;
  }

  // ------------------------------------------------------------------ appels externes (flux, API personnalisées, connecteurs)
  findExternal(callName) {
    return this.externalsByName?.get(String(callName).toLowerCase()) || null;
  }

  callNamespaced(name, node, ctx) {
    const dot = name.lastIndexOf('.');
    const prefix = name.slice(0, dot);
    const member = name.slice(dot + 1);
    const self = this;
    // Dans un composant : Modal.OnConfirm(), Modal.Formater(x)…
    const comp = ctx?.inst?.component;
    if (comp && prefix === comp.name) {
      return {
        *handler() {
          const args = [];
          for (const a of node.args) args.push(yield* ev(a, ctx));
          return yield* self.callComponentProperty(comp, member, args, ctx);
        },
      };
    }
    // Depuis l'application : Modal_1.Ouvrir(), Modal_1.Calculer(x)…
    const target = !prefix.includes('.') ? this.findInstance(prefix, ctx) : null;
    if (target?.componentRoot && target.componentRoot.componentDef?.customProperties?.[member]) {
      return {
        *handler() {
          const args = [];
          for (const a of node.args) args.push(yield* ev(a, ctx));
          return yield* self.callComponentProperty(target.componentRoot, member, args, ctx);
        },
      };
    }
    const def = this.findExternal(name);
    if (!def) {
      this.externalCalls.set(name, (this.externalCalls.get(name) || 0) + 1);
      return {
        *handler() {
          for (const a of node.args) yield* ev(a, ctx);
          if (ctx.behavior) self.log('warning', t('runtime.externalCallNotConfigured', { name }));
          return null;
        },
      };
    }
    return {
      *handler() {
        const args = [];
        for (const a of node.args) args.push(yield* ev(a, ctx));
        if (def.kind === 'flow' && !ctx.behavior) return null;
        const res = self.invokeExternal(def, args, ctx);
        if (res && typeof res.then === 'function') return yield res;
        return res;
      },
    };
  }

  externalArgsRecord(def, args) {
    if ((def.kind === 'customapi' || def.kind === 'connector') && args.length === 1 && isRecord(args[0])) return jsonOf(args[0]);
    const rec = {};
    (def.params || []).forEach((p, i) => (rec[p.name] = jsonOf(args[i])));
    if (!def.params?.length) args.forEach((a, i) => (rec[`arg${i + 1}`] = jsonOf(a)));
    return rec;
  }

  invokeExternal(def, args, ctx) {
    const input = this.externalArgsRecord(def, args);
    this.log('flow', t('runtime.callLog', { name: def.callName }), input);
    const finish = (out) => {
      this.log('flow', t('runtime.responseLog', { name: def.callName }), out);
      return toFxValue(out);
    };
    const mode = def.mode || 'mock';
    if (mode === 'script') {
      try {
        // Script de simulation saisi par l'utilisateur (exécuté localement)
        const fn = new Function('args', 'input', 'helpers', def.script || 'return null;');
        const r = fn(args.map((a) => jsonOf(a)), input, { now: () => new Date() });
        if (r && typeof r.then === 'function') return r.then(finish);
        return finish(r);
      } catch (e) {
        throw new FxRuntimeError(t('runtime.mockScriptError', { name: def.callName, message: e.message }), 'Unknown');
      }
    }
    if (mode === 'http' || mode === 'dataverse') {
      if (!this.hooks.onExternalHttp) throw new FxRuntimeError(t('runtime.httpUnavailable'), 'Network');
      return this.hooks.onExternalHttp(def, input).then(finish, (e) => {
        throw new FxRuntimeError(t('runtime.labelMessage', { label: def.callName, message: e.message || e }), 'Network');
      });
    }
    let out = null;
    try {
      out = def.mockResponse ? JSON.parse(def.mockResponse) : null;
    } catch (e) {
      throw new FxRuntimeError(t('runtime.invalidMockJson', { name: def.callName, message: e.message }), 'InvalidArgument');
    }
    const delay = Number(def.delayMs) || 0;
    if (delay > 0 && ctx?.behavior) return new Promise((resolve) => setTimeout(() => resolve(finish(out)), delay));
    return finish(out);
  }

  // ------------------------------------------------------------------ sources / collections
  tableTarget(name, ctx, create) {
    if (this.collections.has(name)) return { kind: 'collection', name, rows: this.collections.get(name) };
    const ds = this.registry.get(name);
    if (ds) return { kind: 'datasource', name, ds, rows: ds.rows };
    if (create && !this.globals.has(name) && !this.reg.has(name)) return { kind: 'collection', name, rows: [] };
    return null;
  }

  targetFromDs(ds) {
    return { kind: 'datasource', name: ds.name, ds, rows: ds.rows };
  }

  collect(target, items, clear) {
    if (target.kind === 'datasource') {
      for (const it of items) target.ds.insert([it]);
      this.bump();
      return target.ds.rows;
    }
    if (target.kind !== 'collection') throw new FxRuntimeError(t('runtime.collectInvalidTarget'), 'InvalidArgument');
    const rows = clear ? [] : [...(this.collections.get(target.name) || [])];
    for (const it of items) rows.push(copyRecord(it));
    this.collections.set(target.name, rows);
    this.bump();
    return rows;
  }

  patch(target, base, changes, ctx, replace = false) {
    if (target.kind === 'datasource') {
      const ds = target.ds;
      let row = null;
      if (isBlank(base) || base[NEW_RECORD]) {
        const init = isRecord(base) ? { ...base } : {};
        row = ds.insert([init, ...changes]);
      } else {
        row = ds.find(base);
        if (!row) {
          if (ds.primaryKey && !isBlank(base[ds.primaryKey])) throw new FxRuntimeError(t('runtime.recordNotFound', { name: ds.name }), 'NotFound');
          row = ds.insert([base, ...changes]);
        } else {
          if (replace) for (const k of Object.keys(row)) if (k !== ds.primaryKey) delete row[k];
          for (const ch of changes) ds.applyChanges(row, ch);
        }
      }
      this.log('data', `Patch ${ds.name}`, jsonOf(row));
      this.bump();
      return row;
    }
    if (target.kind === 'collection') {
      const rows = [...(this.collections.get(target.name) || [])];
      let merged;
      if (isBlank(base) || base[NEW_RECORD]) {
        merged = copyRecord(isRecord(base) ? base : {});
        for (const ch of changes) Object.assign(merged, ch);
        rows.push(merged);
      } else {
        let idx = rows.indexOf(base);
        if (idx < 0) idx = rows.findIndex((r) => shallowSame(r, base));
        merged = copyRecord(replace ? {} : idx >= 0 ? rows[idx] : base);
        for (const ch of changes) Object.assign(merged, ch);
        if (idx >= 0) rows[idx] = merged;
        else rows.push(merged);
      }
      this.collections.set(target.name, rows);
      this.bump();
      return merged;
    }
    throw new FxRuntimeError(t('runtime.patchInvalidTarget'), 'InvalidArgument');
  }

  remove(target, recs) {
    if (target.kind === 'datasource') {
      target.ds.remove(recs);
      this.bump();
      return;
    }
    if (target.kind === 'collection') {
      const rows = (this.collections.get(target.name) || []).filter((r) => !recs.some((x) => x === r || shallowSame(x, r)));
      this.collections.set(target.name, rows);
      this.bump();
    }
  }

  defaults(target) {
    if (target?.kind === 'datasource') return target.ds.defaults();
    return {};
  }

  dataSourceInfo(target, info, col) {
    if (target?.kind === 'datasource') return target.ds.info(info, col);
    if (info === 'DisplayName') return col || target?.name || null;
    return null;
  }

  choices(dsName, colName) {
    const ds = this.registry.get(dsName);
    if (!ds) return null;
    const col = ds.column(colName);
    if (!col) return null;
    if (col.type === 'choice' || col.type === 'multichoice') return (col.options || []).map((o) => ({ Value: ds.optionOf(col, o.value) }));
    if (col.type === 'lookup') {
      const target = this.registry.findTarget(col.targets?.[0], col);
      return target ? target.rows : [];
    }
    return null;
  }

  refresh(target) {
    if (target?.kind === 'datasource' && this.hooks.onRefresh) return this.hooks.onRefresh(target.ds);
    return null;
  }

  // ------------------------------------------------------------------ variables & navigation
  setGlobal(name, v) {
    this.globals.set(name, v);
    this.bump();
  }

  updateContext(rec, ctx) {
    const screen = ctx?.screen || this.activeScreen;
    let m = this.contextVars.get(screen);
    if (!m) {
      m = new Map();
      this.contextVars.set(screen, m);
    }
    for (const [k, v] of Object.entries(rec)) m.set(k, v);
    this.bump();
  }

  navigate(target, transition, rec) {
    const name = target instanceof FxScreenRef ? target.name : typeof target === 'string' ? target : target?.name;
    if (!name || !this.screensByName.has(name)) {
      this.notify(t('runtime.screenNotFound', { name: toText(name) || '?' }), 'Error');
      return;
    }
    const prev = this.activeScreen;
    if (rec) this.updateContext(rec, { screen: name });
    if (prev && prev !== name) this.navStack.push(prev);
    this.activeScreen = name;
    this.log('nav', t('runtime.navigatedTo', { name }));
    this.bump();
    this.hooks.onNavigate?.(name, prev);
    if (this.mode === 'preview' && prev !== name) this.enterScreen(name, prev);
  }

  back() {
    const prev = this.navStack.pop();
    if (!prev) return;
    const cur = this.activeScreen;
    this.activeScreen = prev;
    this.bump();
    this.hooks.onNavigate?.(prev, cur);
    if (this.mode === 'preview') this.enterScreen(prev, cur);
  }

  async enterScreen(name, prev) {
    if (prev) await this.runScreenBehavior(prev, 'OnHidden');
    await this.runScreenBehavior(name, 'OnVisible');
  }

  notify(message, type = 'Information', timeout = 10000) {
    const id = Math.random().toString(36).slice(2);
    this.notifications = [...this.notifications, { id, message, type }];
    this.log('notify', `[${type}] ${message}`);
    this.bump();
    if (timeout > 0 && typeof setTimeout !== 'undefined') {
      setTimeout(() => this.dismissNotification(id), Math.min(timeout, 60000));
    }
  }

  dismissNotification(id) {
    this.notifications = this.notifications.filter((n) => n.id !== id);
    this.bump();
  }

  // ------------------------------------------------------------------ contrôles
  select(ref, ctx) {
    const target = ref.inst || this.findInstance(ref.name, ctx);
    if (!target) return null;
    if (target.def.id === 'Gallery') {
      const gi = ctx?.inst?.galleryItem;
      let cur = gi;
      while (cur && cur.gallery !== target) cur = cur.gallery?.galleryItem;
      if (cur) this.setControlState(target.key, { selectedIndex: cur.index });
    }
    return this.runBehavior(target, 'OnSelect');
  }

  reset(ref, ctx) {
    const target = ref.inst || this.findInstance(ref.name, ctx);
    if (!target) return;
    this.clearControlState(target.key);
    // Reset d'une instance de composant : OnReset de la définition
    if (target.componentRoot) this.runBehavior(target.componentRoot, 'OnReset');
  }

  setFocus() {}

  async formAction(action, ref, ctx) {
    const form = ref instanceof FxControlRef ? ref.inst || this.findInstance(ref.name, ctx) : null;
    if (!form || form.def.id !== 'Form') throw new FxRuntimeError(t('runtime.formControlExpected', { action }), 'InvalidArgument');
    const key = form.key;
    if (action === 'new') {
      this.clearControlState(key);
      const target = this.formTarget(form);
      this.setControlState(key, { mode: 'new', newRecord: target ? this.defaults(target) : {} });
      return;
    }
    if (action === 'edit' || action === 'view') {
      const st = this.controlState(key);
      this.clearControlState(key);
      this.setControlState(key, { mode: action, lastSubmit: st.lastSubmit });
      return;
    }
    if (action === 'reset') {
      const st = this.controlState(key);
      this.clearControlState(key);
      if (st.lastSubmit) this.setControlState(key, { lastSubmit: st.lastSubmit });
      await this.runBehavior(form, 'OnReset');
      return;
    }
    if (action === 'submit') {
      const fresh = this.findInstance(form.name, ctx) || form;
      const valid = fresh.get('Valid');
      if (!valid) {
        this.setControlState(key, { error: t('runtime.requiredFieldsEmpty') });
        this.notify(t('runtime.formInvalid'), 'Error');
        await this.runBehavior(fresh, 'OnFailure');
        return;
      }
      const updates = fresh.get('Updates') || {};
      const target = this.formTarget(fresh);
      if (!target) {
        this.notify(t('runtime.formNoDataSource'), 'Error');
        await this.runBehavior(fresh, 'OnFailure');
        return;
      }
      const mode = fresh.get('Mode');
      const base = mode?.name === 'New' ? null : fresh.get('Item');
      try {
        const row = this.patch(target, base, [updates]);
        this.setControlState(key, { lastSubmit: row, error: undefined, mode: 'edit', item: row });
        await this.runBehavior(fresh, 'OnSuccess');
      } catch (e) {
        this.setControlState(key, { error: e.message });
        this.notify(t('runtime.saveFailed', { message: e.message }), 'Error');
        await this.runBehavior(fresh, 'OnFailure');
      }
    }
  }

  formTarget(form) {
    const ds = form.evalFormula('DataSource');
    if (Array.isArray(ds) && ds[DS]) return this.targetFromDs(ds[DS]);
    const f = form.node.properties?.DataSource;
    const m = f && /^=\s*(?:\[@)?'?([^'\]]+)'?\]?\s*$/.exec(f);
    if (m) return this.tableTarget(m[1], {}, false);
    return null;
  }

  launch(url) {
    if (typeof window !== 'undefined' && url) window.open(url, '_blank', 'noopener');
  }

  copy(text) {
    if (typeof navigator !== 'undefined' && navigator.clipboard) navigator.clipboard.writeText(text).catch(() => {});
  }

  exit() {
    this.notify(t('runtime.exitCalled'), 'Information');
  }

  trace(message) {
    this.log('trace', message);
  }

  saveData(name, value) {
    try {
      localStorage.setItem(`canevas-savedata:${this.project?.id}:${name}`, JSON.stringify(value));
    } catch {
      /* stockage indisponible */
    }
  }

  loadData(name) {
    try {
      const s = localStorage.getItem(`canevas-savedata:${this.project?.id}:${name}`);
      return s ? toFxValue(JSON.parse(s)) : null;
    } catch {
      return null;
    }
  }

  clearData(name) {
    try {
      if (name) localStorage.removeItem(`canevas-savedata:${this.project?.id}:${name}`);
    } catch {
      /* stockage indisponible */
    }
  }

  user() {
    const u = this.project?.settings?.user || {};
    return {
      FullName: u.FullName || t('project.demoUserName'),
      Email: u.Email || 'demo@contoso.com',
      Image: u.Image || '',
      EntraObjectId: u.EntraObjectId || '00000000-0000-0000-0000-000000000001',
    };
  }

  param(name) {
    return this.project?.settings?.params?.[name] ?? null;
  }

  // ------------------------------------------------------------------ exécution des comportements
  async runBehavior(inst, prop) {
    if (!inst) return null;
    const formula = inst.formula(prop);
    if (!formula || formula === '=') return null;
    return this.runFormulaFor(inst, formula, `${inst.name}.${prop}`);
  }

  async runFormulaFor(inst, formula, label, extraScopes = []) {
    const { ast, error } = parseFormula(formula);
    if (error) {
      this.notify(t('runtime.syntaxErrorIn', { label, message: error.message }), 'Error');
      return null;
    }
    const base = inst.ctx();
    const ctx = { ...base, scopes: extraScopes.length ? [...base.scopes, ...extraScopes] : base.scopes, behavior: true };
    this.busy++;
    this.log('behavior', `▶ ${label}`);
    try {
      return await evaluateAsync(ast, ctx);
    } catch (e) {
      const msg = e instanceof FxRuntimeError ? e.message : t('runtime.internalError', { message: e?.message || e });
      this.notify(t('runtime.labelMessage', { label, message: msg }), 'Error');
      this.log('error', t('runtime.labelMessage', { label, message: msg }));
      return null;
    } finally {
      this.busy--;
      this.bump();
    }
  }

  appInst() {
    const app = this.project?.app || { name: 'App', properties: {}, head: {} };
    return new Inst(this, app, APP_DEF, null, { kind: 'app', key: 'App', screen: this.activeScreen });
  }

  screenInst(name) {
    if (this.lastRoot && this.lastRoot.name === name) return this.lastRoot;
    const screen = this.screensByName?.get(name);
    if (!screen) return null;
    const inst = new Inst(this, screen, SCREEN_DEF, null, { kind: 'screen', key: screen.name, screen: screen.name });
    inst.layout = { x: 0, y: 0, w: this.size.width, h: this.size.height };
    return inst;
  }

  async runAppOnStart() {
    const app = this.appInst();
    return this.runBehavior(app, 'OnStart');
  }

  async runScreenBehavior(name, prop) {
    const inst = this.screenInst(name);
    if (!inst) return null;
    return this.runBehavior(inst, prop);
  }

  /** Démarre l'aperçu (F5) */
  async startPreview({ runOnStart = true, screen } = {}) {
    this.mode = 'preview';
    this.bump();
    if (runOnStart) await this.runAppOnStart();
    let start = screen || this.activeScreen;
    const sf = this.project?.app?.properties?.StartScreen;
    if (!screen && sf && sf !== '=') {
      try {
        const { ast } = parseFormula(sf);
        const v = ast ? evaluateSync(ast, { host: this, scopes: [], behavior: false, screen: start }) : null;
        if (v instanceof FxScreenRef) start = v.name;
      } catch {
        /* ignore */
      }
    }
    this.activeScreen = start;
    this.navStack = [];
    this.bump();
    this.hooks.onNavigate?.(start, null);
    await this.runScreenBehavior(start, 'OnVisible');
  }

  stopPreview() {
    this.mode = 'edit';
    this.stopTimers();
    this.bump();
  }

  // ------------------------------------------------------------------ minuteurs
  syncTimers(root) {
    if (this.mode !== 'preview' || !root) {
      if (this.timers.size) this.stopTimers();
      return;
    }
    const seen = new Set();
    const visit = (inst) => {
      if (!inst) return;
      if (inst.def.id === 'Timer' && inst.visible !== undefined) {
        const auto = !!inst.get('AutoStart') || !!inst.get('Start');
        seen.add(inst.key);
        if (auto && !this.timers.has(inst.key)) this.startTimer(inst);
      }
      for (const c of inst.children || []) visit(c);
      for (const it of inst.items || []) for (const c of it.children) visit(c);
      if (inst.componentRoot) visit(inst.componentRoot);
    };
    visit(root);
    for (const k of [...this.timers.keys()]) if (!seen.has(k)) this.stopTimer(k);
  }

  startTimer(inst) {
    const duration = Math.max(50, Number(inst.get('Duration')) || 60000);
    const key = inst.key;
    const repeat = !!inst.get('Repeat');
    this.runBehavior(inst, 'OnTimerStart');
    const handle = setTimeout(async () => {
      // marqué « terminé » avant d'exécuter OnTimerEnd pour éviter un redémarrage pendant l'exécution
      this.timers.set(key, 'done');
      const fresh = this.reg.get(inst.name) || inst;
      await this.runBehavior(fresh, 'OnTimerEnd');
      if (repeat && this.mode === 'preview' && this.timers.get(key) === 'done') {
        this.timers.delete(key);
        this.startTimer(fresh);
      }
    }, duration);
    this.timers.set(key, handle);
  }

  stopTimer(key) {
    const h = this.timers.get(key);
    if (h && h !== 'done') clearTimeout(h);
    this.timers.delete(key);
  }

  stopTimers() {
    for (const k of [...(this.timers?.keys() || [])]) this.stopTimer(k);
  }

  // ------------------------------------------------------------------ évaluation ponctuelle (barre de formule)
  evaluateFor(inst, formula) {
    const { ast, error } = parseFormula(formula);
    if (error) return { error: error.message };
    try {
      return { value: evaluateSync(ast, inst ? inst.ctx() : { host: this, scopes: [], screen: this.activeScreen }) };
    } catch (e) {
      return { error: e.message };
    }
  }

  /** Variables visibles (volet Variables) */
  snapshotVariables() {
    const ctx = [];
    for (const [screen, m] of this.contextVars) for (const [k, v] of m) ctx.push({ screen, name: k, value: v });
    return {
      globals: [...this.globals].map(([name, value]) => ({ name, value })),
      context: ctx,
      collections: [...this.collections].map(([name, rows]) => ({ name, rows })),
    };
  }
}

export { asTable, FxEnum, FxUntyped };
