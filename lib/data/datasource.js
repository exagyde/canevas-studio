// Sources de données à l'exécution (tables simulées ou importées de Dataverse).
import { DS, FxOption, FxEnumNs, isBlank, isRecord } from '../fx/values.js';
import { parseDateText } from '../fx/format.js';
import { t } from '../i18n/index.js';

/*
 Définition persistée (projet) :
 {
   id, name,                      // nom utilisé dans les formules (ex: 'Comptes')
   kind: 'mock' | 'dataverse',
   logicalName, entitySetName,    // Dataverse
   primaryKey, primaryName,
   columns: [{ name, displayName, type, options?:[{value,label}], targets?:[logical], optionSetName?, required?, maxLength? }],
   rows: [ {...} ],
 }
 Types de colonnes : text, memo, number, money, bool, datetime, date, choice, multichoice, lookup, guid, image, url, email, phone
*/

// libellés traduits dans la langue courante au moment de la lecture
export const COLUMN_TYPES = [
  { id: 'text', get label() { return t('data.typeText'); } },
  { id: 'memo', get label() { return t('data.typeMemo'); } },
  { id: 'number', get label() { return t('data.typeNumber'); } },
  { id: 'money', get label() { return t('data.typeMoney'); } },
  { id: 'bool', get label() { return t('data.typeBool'); } },
  { id: 'datetime', get label() { return t('data.typeDatetime'); } },
  { id: 'date', get label() { return t('data.typeDate'); } },
  { id: 'choice', get label() { return t('data.typeChoice'); } },
  { id: 'multichoice', get label() { return t('data.typeMultichoice'); } },
  { id: 'lookup', get label() { return t('data.typeLookup'); } },
  { id: 'guid', get label() { return t('data.typeGuid'); } },
  { id: 'email', get label() { return t('data.typeEmail'); } },
  { id: 'url', get label() { return t('data.typeUrl'); } },
  { id: 'phone', get label() { return t('data.typePhone'); } },
  { id: 'image', get label() { return t('data.typeImage'); } },
];

function newGuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export class RtDataSource {
  constructor(def, registry) {
    this.def = def;
    this.registry = registry; // { byLogical: Map, byName: Map }
    this.name = def.name;
    this.logicalName = def.logicalName || null;
    this.primaryKey = def.primaryKey || null;
    this.primaryName = def.primaryName || null;
    this.columns = def.columns || [];
    this.index = new Map();
    for (const c of this.columns) {
      this.index.set(c.name, c);
      this.index.set(c.name.toLowerCase(), c);
      if (c.displayName) {
        if (!this.index.has(c.displayName)) this.index.set(c.displayName, c);
        if (!this.index.has(c.displayName.toLowerCase())) this.index.set(c.displayName.toLowerCase(), c);
      }
    }
    this.rows = [];
    this.setRows(def.rows || []);
    this.pkIndex = null;
  }

  setRows(rows) {
    this.rows = rows.map((r) => this.attach({ ...r }));
    Object.defineProperty(this.rows, DS, { value: this, enumerable: false, configurable: true });
    this.pkIndex = null;
  }

  attach(row) {
    Object.defineProperty(row, DS, { value: this, enumerable: false, writable: true, configurable: true });
    if (this.primaryKey && isBlank(row[this.primaryKey])) row[this.primaryKey] = newGuid();
    return row;
  }

  column(name) {
    return this.index.get(name) || this.index.get(String(name).toLowerCase()) || null;
  }

  hasField(name) {
    return !!this.column(name);
  }

  findByKey(id) {
    if (!this.primaryKey || isBlank(id)) return null;
    if (!this.pkIndex) {
      this.pkIndex = new Map();
      for (const r of this.rows) this.pkIndex.set(String(r[this.primaryKey]).toLowerCase(), r);
    }
    return this.pkIndex.get(String(id).toLowerCase()) || null;
  }

  getField(row, name) {
    const col = this.column(name);
    if (!col) {
      if (Object.prototype.hasOwnProperty.call(row, name)) return row[name] ?? null;
      return null;
    }
    const raw = row[col.name];
    return this.convertOut(col, raw);
  }

  convertOut(col, raw) {
    if (raw === undefined || raw === null) return null;
    switch (col.type) {
      case 'datetime':
      case 'date': {
        if (raw instanceof Date) return raw;
        const d = parseDateText(raw);
        return d || null;
      }
      case 'number':
      case 'money':
        return typeof raw === 'number' ? raw : raw === '' ? null : Number(raw);
      case 'bool':
        if (typeof raw === 'boolean') return raw;
        return raw === 'true' || raw === 1 || raw === '1' || raw === 'Oui' || raw === 'Yes';
      case 'choice':
        return this.optionOf(col, raw);
      case 'multichoice': {
        const vals = Array.isArray(raw) ? raw : String(raw).split(/[;,]/).filter(Boolean);
        return vals.map((v) => ({ Value: this.optionOf(col, isNaN(Number(v)) ? v : Number(v)) }));
      }
      case 'lookup':
        return this.resolveLookup(col, raw);
      default:
        return raw;
    }
  }

  optionOf(col, raw) {
    if (raw instanceof FxOption) return raw;
    const opts = col.options || [];
    const ns = col.optionSetName || col.displayName || col.name;
    const o = opts.find((x) => x.value === raw || String(x.value) === String(raw)) || opts.find((x) => x.label === raw);
    if (o) return new FxOption(ns, o.label, o.value);
    return new FxOption(ns, String(raw), raw);
  }

  resolveLookup(col, raw) {
    if (isRecord(raw) && raw[DS]) return raw;
    let id = raw;
    let entity = col.targets?.[0] || null;
    let name = null;
    if (isRecord(raw)) {
      id = raw.id ?? raw.Id ?? raw.ID;
      entity = raw.entity || entity;
      name = raw.name ?? null;
    }
    if (isBlank(id)) return null;
    const target = this.registry?.findTarget(entity, col);
    if (target) {
      const rec = target.findByKey(id) || (target.primaryName ? target.rows.find((r) => r[target.primaryName] === id) : null);
      if (rec) return rec;
      // enregistrement non chargé : stub
      const stub = { [target.primaryKey || 'id']: id };
      if (target.primaryName) stub[target.primaryName] = name ?? '';
      return target.attach(stub);
    }
    return { __lookup: true, id, entity, name, Name: name };
  }

  convertIn(col, v) {
    if (v === undefined) return undefined;
    if (v === null) return null;
    switch (col.type) {
      case 'choice':
        if (v instanceof FxOption) return v.value;
        if (isRecord(v) && 'Value' in v) return this.convertIn(col, v.Value);
        if (v && typeof v === 'object' && 'name' in v) {
          const o = (col.options || []).find((x) => x.label === v.name);
          return o ? o.value : v.name;
        }
        return v;
      case 'lookup': {
        if (isRecord(v) && v[DS]) {
          const ds = v[DS];
          return { __lookup: true, id: v[ds.primaryKey], entity: ds.logicalName || ds.name, name: ds.primaryName ? v[ds.primaryName] : null };
        }
        if (isRecord(v) && v.__lookup) return v;
        return v;
      }
      case 'datetime':
      case 'date':
        return v instanceof Date ? v.toISOString() : v;
      case 'multichoice':
        if (Array.isArray(v)) return v.map((r) => this.convertIn({ ...col, type: 'choice' }, isRecord(r) && 'Value' in r ? r.Value : r));
        return v;
      default:
        if (v instanceof FxOption) return v.label;
        return v;
    }
  }

  /** Applique un enregistrement de modifications (clés en noms d'affichage ou logiques) */
  applyChanges(row, changes) {
    for (const [k, v] of Object.entries(changes || {})) {
      if (k.startsWith('__')) continue;
      const col = this.column(k);
      if (col) row[col.name] = this.convertIn(col, v);
      else row[k] = v;
    }
    return row;
  }

  defaults() {
    const rec = {};
    for (const c of this.columns) {
      if (c.default !== undefined) rec[c.name] = c.default;
    }
    return this.attach(rec);
  }

  insert(changesList) {
    const row = this.defaults();
    if (this.primaryKey) row[this.primaryKey] = newGuid();
    for (const ch of changesList) this.applyChanges(row, ch);
    this.rows.push(row);
    this.pkIndex = null;
    return row;
  }

  find(rec) {
    if (!rec) return null;
    if (this.rows.includes(rec)) return rec;
    if (this.primaryKey && rec[this.primaryKey] !== undefined) return this.findByKey(rec[this.primaryKey]);
    return null;
  }

  remove(recs) {
    const set = new Set(recs.map((r) => this.find(r)).filter(Boolean));
    const kept = this.rows.filter((r) => !set.has(r));
    this.rows.length = 0;
    this.rows.push(...kept);
    this.pkIndex = null;
  }

  info(kind, colName) {
    const col = colName ? this.column(colName) : null;
    switch (kind) {
      case 'DisplayName':
        return col ? col.displayName || col.name : this.name;
      case 'MaxLength':
        return col?.maxLength ?? (col && (col.type === 'text' || col.type === 'email' || col.type === 'url' || col.type === 'phone') ? 100 : col?.type === 'memo' ? 2000 : null);
      case 'Required':
        return !!col?.required;
      case 'MinValue':
        return col?.min ?? null;
      case 'MaxValue':
        return col?.max ?? null;
      case 'AllowedValues':
        return (col?.options || []).map((o) => ({ Value: o.label }));
      case 'CreatePermission':
      case 'EditPermission':
      case 'DeletePermission':
      case 'ReadPermission':
        return true;
      default:
        return null;
    }
  }

  /** Espaces de noms d'énumérations exposés par les colonnes de choix */
  optionNamespaces() {
    const out = [];
    for (const c of this.columns) {
      if ((c.type !== 'choice' && c.type !== 'multichoice') || !c.options?.length) continue;
      const ns = c.optionSetName || c.displayName || c.name;
      const members = new Map();
      for (const o of c.options) {
        const opt = new FxOption(ns, o.label, o.value);
        members.set(o.label, opt);
        members.set(String(o.label).toLowerCase(), opt);
      }
      const names = new Set([ns, `${c.displayName || c.name} (${this.name})`]);
      if (c.optionSetName) names.add(c.optionSetName);
      for (const n of names) out.push({ name: n, ns: new FxEnumNs(n, members, 'option') });
    }
    return out;
  }
}

/** Registre de toutes les sources d'un projet */
export class DataRegistry {
  constructor(defs) {
    this.byName = new Map();
    this.byLogical = new Map();
    this.optionNs = new Map();
    for (const def of defs || []) this.add(def);
  }
  add(def) {
    const ds = new RtDataSource(def, this);
    this.byName.set(def.name, ds);
    if (def.logicalName) this.byLogical.set(def.logicalName.toLowerCase(), ds);
    for (const { name, ns } of ds.optionNamespaces()) if (!this.optionNs.has(name)) this.optionNs.set(name, ns);
    return ds;
  }
  get(name) {
    return this.byName.get(name) || null;
  }
  findTarget(entity, col) {
    if (entity) {
      const byL = this.byLogical.get(String(entity).toLowerCase());
      if (byL) return byL;
      const byN = this.byName.get(entity);
      if (byN) return byN;
    }
    if (col?.targetName) return this.byName.get(col.targetName) || null;
    return null;
  }
  /** Copie des lignes pour persistance */
  snapshot() {
    const out = {};
    for (const [name, ds] of this.byName) out[name] = ds.rows.map((r) => ({ ...r }));
    return out;
  }
}

/** Crée une définition de table simulée vide */
export function createMockTable(name, columns = []) {
  const pk = 'ID';
  return {
    id: `ds_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    name,
    kind: 'mock',
    primaryKey: pk,
    primaryName: columns.find((c) => c.type === 'text')?.name || null,
    columns: [{ name: pk, displayName: pk, type: 'guid' }, ...columns],
    rows: [],
  };
}
