// Client Dataverse (navigateur) : passe par /api/dataverse.
import { loadPrefs, updatePrefs } from '../storage/db.js';
import { t } from '../i18n/index.js';

/** Identifiant d'application public documenté par Microsoft pour le prototypage Dataverse */
export const SAMPLE_CLIENT_ID = '51f81489-12ee-4a9e-aaae-a2591f45987d';

export function normalizeEnvUrl(url) {
  try {
    const u = new URL(String(url).trim());
    return `https://${u.hostname}`;
  } catch {
    return '';
  }
}

export function getConnection(envUrl) {
  const prefs = loadPrefs();
  return prefs.dataverse?.[normalizeEnvUrl(envUrl)] || null;
}

export function saveConnection(envUrl, patch) {
  const env = normalizeEnvUrl(envUrl);
  const prefs = loadPrefs();
  const all = { ...(prefs.dataverse || {}) };
  all[env] = { ...(all[env] || {}), ...patch };
  updatePrefs({ dataverse: all });
  return all[env];
}

export function clearConnection(envUrl) {
  const env = normalizeEnvUrl(envUrl);
  const prefs = loadPrefs();
  const all = { ...(prefs.dataverse || {}) };
  delete all[env];
  updatePrefs({ dataverse: all });
}

async function post(body) {
  const r = await fetch('/api/dataverse', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({ error: t('data.invalidResponse', { status: r.status }) }));
  if (!r.ok || j.error) {
    const e = new Error(j.error || t('data.errorStatus', { status: r.status }));
    e.status = r.status;
    throw e;
  }
  return j;
}

export function isConnected(envUrl) {
  const c = getConnection(envUrl);
  return !!(c && (c.accessToken || (c.authMode === 'client' && c.clientSecret)));
}

/** Obtient un jeton valide (rafraîchit si nécessaire) */
export async function getToken(envUrl, force = false) {
  const env = normalizeEnvUrl(envUrl);
  const c = getConnection(env);
  if (!c) throw new Error(t('data.envNotConnected'));
  if (!force && c.accessToken && (!c.expiresAt || c.expiresAt > Date.now())) return c.accessToken;
  if (c.authMode === 'client' && c.clientSecret) {
    const tok = await post({ op: 'token-client', envUrl: env, tenantId: c.tenantId, clientId: c.clientId, clientSecret: c.clientSecret });
    saveConnection(env, tok);
    return tok.accessToken;
  }
  if (c.refreshToken) {
    const tok = await post({ op: 'refresh', envUrl: env, tenantId: c.tenantId, clientId: c.clientId || SAMPLE_CLIENT_ID, refreshToken: c.refreshToken });
    saveConnection(env, tok);
    return tok.accessToken;
  }
  if (c.accessToken && c.authMode === 'token') return c.accessToken; // jeton collé : on tente quand même
  throw new Error(t('data.tokenExpired'));
}

export async function api(envUrl, path, { method = 'GET', body, maxPageSize } = {}) {
  const env = normalizeEnvUrl(envUrl);
  let token = await getToken(env);
  try {
    return (await post({ op: 'api', envUrl: env, token, path, method, body, maxPageSize })).data;
  } catch (e) {
    if (e.status === 401) {
      token = await getToken(env, true);
      return (await post({ op: 'api', envUrl: env, token, path, method, body, maxPageSize })).data;
    }
    throw e;
  }
}

export async function connectWithClientSecret(envUrl, { tenantId, clientId, clientSecret }) {
  const env = normalizeEnvUrl(envUrl);
  const tok = await post({ op: 'token-client', envUrl: env, tenantId, clientId, clientSecret });
  saveConnection(env, { authMode: 'client', tenantId, clientId, clientSecret, ...tok });
  return whoAmI(env);
}

export async function connectWithToken(envUrl, token) {
  const env = normalizeEnvUrl(envUrl);
  saveConnection(env, { authMode: 'token', accessToken: token.trim().replace(/^Bearer\s+/i, ''), refreshToken: null, expiresAt: Date.now() + 55 * 60000 });
  return whoAmI(env);
}

export async function startDeviceLogin(envUrl, { tenantId, clientId }) {
  return post({ op: 'device-start', envUrl: normalizeEnvUrl(envUrl), tenantId, clientId: clientId || SAMPLE_CLIENT_ID });
}

export async function pollDeviceLogin(envUrl, { tenantId, clientId, deviceCode }) {
  const r = await post({ op: 'device-poll', envUrl: normalizeEnvUrl(envUrl), tenantId, clientId: clientId || SAMPLE_CLIENT_ID, deviceCode });
  if (r.pending) return null;
  saveConnection(envUrl, { authMode: 'device', tenantId, clientId: clientId || SAMPLE_CLIENT_ID, ...r });
  return r;
}

export async function whoAmI(envUrl) {
  return api(envUrl, 'WhoAmI');
}

const label = (l) => l?.UserLocalizedLabel?.Label || l?.LocalizedLabels?.[0]?.Label || null;

export async function listTables(envUrl) {
  const d = await api(envUrl, 'EntityDefinitions?$select=LogicalName,DisplayName,DisplayCollectionName,EntitySetName,PrimaryIdAttribute,PrimaryNameAttribute,IsCustomEntity,IsActivity&$filter=IsPrivate eq false');
  return (d.value || [])
    .map((e) => ({
      logicalName: e.LogicalName,
      displayName: label(e.DisplayName) || e.LogicalName,
      collectionName: label(e.DisplayCollectionName) || label(e.DisplayName) || e.LogicalName,
      entitySetName: e.EntitySetName,
      primaryId: e.PrimaryIdAttribute,
      primaryName: e.PrimaryNameAttribute,
      custom: e.IsCustomEntity,
    }))
    .filter((e) => e.entitySetName)
    .sort((a, b) => a.collectionName.localeCompare(b.collectionName));
}

function mapType(a) {
  const t = a.AttributeType;
  const tn = a.AttributeTypeName?.Value;
  if (tn === 'MultiSelectPicklistType') return 'multichoice';
  if (tn === 'ImageType' || tn === 'FileType') return 'image';
  switch (t) {
    case 'String':
      return 'text';
    case 'Memo':
      return 'memo';
    case 'Integer':
    case 'BigInt':
    case 'Decimal':
    case 'Double':
      return 'number';
    case 'Money':
      return 'money';
    case 'Boolean':
      return 'bool';
    case 'DateTime':
      return 'datetime';
    case 'Picklist':
    case 'State':
    case 'Status':
      return 'choice';
    case 'Lookup':
    case 'Customer':
    case 'Owner':
      return 'lookup';
    case 'Uniqueidentifier':
      return 'guid';
    default:
      return null;
  }
}

/** Métadonnées complètes d'une table -> définition de source de données */
export async function tableMetadata(envUrl, logicalName) {
  const base = `EntityDefinitions(LogicalName='${logicalName}')`;
  const [ent, pick, state, status, multi, lookups] = await Promise.all([
    api(envUrl, `${base}?$select=LogicalName,EntitySetName,PrimaryIdAttribute,PrimaryNameAttribute,DisplayName,DisplayCollectionName&$expand=Attributes($select=LogicalName,DisplayName,AttributeType,AttributeTypeName,IsValidForRead,AttributeOf,RequiredLevel)`),
    api(envUrl, `${base}/Attributes/Microsoft.Dynamics.CRM.PicklistAttributeMetadata?$select=LogicalName&$expand=OptionSet($select=Options),GlobalOptionSet($select=Name,DisplayName,Options)`).catch(() => ({ value: [] })),
    api(envUrl, `${base}/Attributes/Microsoft.Dynamics.CRM.StateAttributeMetadata?$select=LogicalName&$expand=OptionSet($select=Options)`).catch(() => ({ value: [] })),
    api(envUrl, `${base}/Attributes/Microsoft.Dynamics.CRM.StatusAttributeMetadata?$select=LogicalName&$expand=OptionSet($select=Options)`).catch(() => ({ value: [] })),
    api(envUrl, `${base}/Attributes/Microsoft.Dynamics.CRM.MultiSelectPicklistAttributeMetadata?$select=LogicalName&$expand=OptionSet($select=Options),GlobalOptionSet($select=Name,DisplayName,Options)`).catch(() => ({ value: [] })),
    api(envUrl, `${base}/Attributes/Microsoft.Dynamics.CRM.LookupAttributeMetadata?$select=LogicalName,Targets`).catch(() => ({ value: [] })),
  ]);
  const options = new Map();
  for (const list of [pick, state, status, multi]) {
    for (const a of list.value || []) {
      const os = a.GlobalOptionSet || a.OptionSet;
      const opts = (os?.Options || []).map((o) => ({ value: o.Value, label: label(o.Label) || String(o.Value) }));
      options.set(a.LogicalName, { opts, globalName: a.GlobalOptionSet ? label(a.GlobalOptionSet.DisplayName) || a.GlobalOptionSet.Name : null });
    }
  }
  const targets = new Map((lookups.value || []).map((a) => [a.LogicalName, a.Targets || []]));
  const columns = [];
  for (const a of ent.Attributes || []) {
    if (a.AttributeOf || a.IsValidForRead === false) continue;
    const type = mapType(a);
    if (!type) continue;
    const col = { name: a.LogicalName, displayName: label(a.DisplayName) || a.LogicalName, type };
    if (a.RequiredLevel?.Value === 'ApplicationRequired' || a.RequiredLevel?.Value === 'SystemRequired') col.required = true;
    if (type === 'choice' || type === 'multichoice') {
      const o = options.get(a.LogicalName);
      col.options = o?.opts || [];
      if (o?.globalName) col.optionSetName = o.globalName;
    }
    if (type === 'lookup') col.targets = targets.get(a.LogicalName) || [];
    columns.push(col);
  }
  columns.sort((x, y) => (x.name === ent.PrimaryIdAttribute ? -1 : y.name === ent.PrimaryIdAttribute ? 1 : x.displayName.localeCompare(y.displayName)));
  return {
    name: label(ent.DisplayCollectionName) || label(ent.DisplayName) || ent.LogicalName,
    kind: 'dataverse',
    logicalName: ent.LogicalName,
    entitySetName: ent.EntitySetName,
    primaryKey: ent.PrimaryIdAttribute,
    primaryName: ent.PrimaryNameAttribute,
    columns,
  };
}

/** Récupère des lignes (top N) au format de l'émulateur */
export async function fetchRows(envUrl, def, top = 200, filter = '') {
  const cols = def.columns.filter((c) => c.type !== 'image').slice(0, 120);
  const select = cols.map((c) => (c.type === 'lookup' ? `_${c.name}_value` : c.name)).join(',');
  const q = `${def.entitySetName}?$select=${select}&$top=${Math.max(1, Math.min(5000, top))}${filter ? `&$filter=${encodeURIComponent(filter)}` : ''}`;
  const d = await api(envUrl, q);
  return (d.value || []).map((r) => {
    const row = {};
    for (const c of cols) {
      if (c.type === 'lookup') {
        const id = r[`_${c.name}_value`];
        row[c.name] = id
          ? { __lookup: true, id, entity: r[`_${c.name}_value@Microsoft.Dynamics.CRM.lookuplogicalname`] || c.targets?.[0] || null, name: r[`_${c.name}_value@OData.Community.Display.V1.FormattedValue`] || null }
          : null;
      } else if (c.type === 'multichoice') {
        const v = r[c.name];
        row[c.name] = v === null || v === undefined ? null : String(v).split(',').map(Number);
      } else row[c.name] = r[c.name] ?? null;
    }
    return row;
  });
}

/** Flux cloud avec déclencheur Power Apps (table workflow, catégorie 5) */
export async function listCloudFlows(envUrl) {
  const d = await api(envUrl, 'workflows?$select=name,workflowid,clientdata,description,statecode&$filter=category eq 5', { maxPageSize: 500 });
  const out = [];
  for (const w of d.value || []) {
    let def;
    try {
      def = JSON.parse(w.clientdata || '{}')?.properties?.definition;
    } catch {
      def = null;
    }
    if (!def) continue;
    const triggers = Object.values(def.triggers || {});
    const trig = triggers.find((t) => /PowerApp/i.test(t.kind || '') || t.type === 'Request');
    if (!trig) continue;
    const isPowerApps = /PowerApp/i.test(trig.kind || '');
    const props = trig.inputs?.schema?.properties || {};
    const required = new Set(trig.inputs?.schema?.required || []);
    const params = Object.entries(props).map(([key, p]) => ({ name: p.title || key, key, type: p.type || 'string', required: required.has(key), description: p.description || '' }));
    // action « Répondre à une application ou à un flux »
    let outputs = [];
    const scan = (actions) => {
      for (const a of Object.values(actions || {})) {
        if (a.type === 'Response' && a.inputs?.schema?.properties) outputs = Object.entries(a.inputs.schema.properties).map(([k, p]) => ({ name: p.title || k, key: k, type: p.type || 'string' }));
        if (a.actions) scan(a.actions);
        if (a.else?.actions) scan(a.else.actions);
        if (a.cases) for (const c of Object.values(a.cases)) scan(c.actions);
      }
    };
    scan(def.actions);
    out.push({ id: w.workflowid, displayName: w.name, callName: `${w.name.replace(/[^\p{L}\p{N}_-]/gu, '')}.Run`, description: w.description || '', isPowerApps, active: w.statecode === 1, params, outputs });
  }
  return out.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export async function callUnboundAction(envUrl, name, body) {
  return api(envUrl, name, { method: 'POST', body: body || {} });
}
