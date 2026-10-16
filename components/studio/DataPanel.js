'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useStudio } from './context';
import { PanelHeader } from './LeftRail';
import { Icon, Dialog, toast, useMenu, Spinner } from '@/components/common/ui';
import { COLUMN_TYPES, createMockTable } from '@/lib/data/datasource';
import { inferMissingSources, sampleRows } from '@/lib/data/infer';
import {
  normalizeEnvUrl,
  getConnection,
  isConnected,
  connectWithToken,
  connectWithClientSecret,
  startDeviceLogin,
  pollDeviceLogin,
  clearConnection,
  listTables,
  tableMetadata,
  fetchRows,
  SAMPLE_CLIENT_ID,
} from '@/lib/dataverse/client';
import { useI18n } from '@/components/common/i18n';

const newDsId = () => `ds_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export default function DataPanel() {
  const s = useStudio();
  const { t } = useI18n();
  const { project } = s;
  const [dialog, setDialog] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [openMenu, menuEl] = useMenu();
  const env = project.settings?.dataverseUrl || '';
  const connected = env && isConnected(env);
  const missing = useMemo(() => inferMissingSources(project), [project]);

  const setSources = (fn) => s.update((p) => ({ ...p, dataSources: fn(p.dataSources || []) }));
  const addSource = (def) => {
    setSources((list) => {
      const others = list.filter((d) => d.name !== def.name);
      return [...others, { id: newDsId(), ...def }];
    });

    toast(t('data.sourceAdded', { name: def.name, count: def.rows?.length || 0 }), 'success');
  };

  const refresh = async (ds) => {
    if (!connected) {
      toast(t('data.connectFirst'), 'warning');
      return;
    }
    try {
      const rows = await fetchRows(env, ds, ds.rowLimit || 200);
      setSources((list) => list.map((d) => (d.id === ds.id ? { ...d, rows, fetchedAt: new Date().toISOString() } : d)));
      toast(t('data.rowsLoaded', { count: rows.length, name: ds.name }), 'success');
    } catch (e) {
      toast(t('data.refreshFailed', { message: e.message }), 'error');
    }
  };

  const createMissing = (m, withRows = true) => {
    const def = createMockTable(m.name, m.columns);
    if (withRows) def.rows = sampleRows(m.columns, 5);
    addSource(def);
  };

  return (
    <div className="panel">
      <PanelHeader title={t('data.panelTitle')} />
      <div className="panel-tools">
        <button className="btn btn-primary" type="button" onClick={() => setDialog({ type: 'add' })}>
          <Icon name="Add" size={16} /> {t('data.addData')}
        </button>
      </div>
      <div className="panel-scroll">
        <section className="data-section">
          <h3>{t('data.dataverseEnvironment')}</h3>
          <div className="env-card">
            <span className={`env-dot${connected ? ' on' : ''}`} />
            <div className="env-info">
              <div className="env-url" title={env}>
                {env || t('data.notConfigured')}
              </div>
              <div className="muted small">{connected ? t('data.connected') : env ? t('data.notConnected') : t('data.dataStaysLocal')}</div>
            </div>
            <button className="btn btn-sm" type="button" onClick={() => setDialog({ type: 'connect' })}>
              {connected ? t('data.manage') : t('data.connect')}
            </button>
          </div>
        </section>

        <section className="data-section">
          <h3>{t('data.dataSourcesCount', { count: (project.dataSources || []).length })}</h3>
          {(project.dataSources || []).length === 0 ? (
            <div className="empty-state small">
              <Icon name="Database" size={28} />
              {t('data.noSources')}
            </div>
          ) : null}
          {(project.dataSources || []).map((ds) => (
            <div key={ds.id} className="ds-item">
              <div className="ds-row" onClick={() => setExpanded(expanded === ds.id ? null : ds.id)}>
                <Icon name={expanded === ds.id ? 'ChevronDown' : 'ChevronRight'} size={12} />
                <Icon name={ds.kind === 'dataverse' ? 'Database' : 'Table'} size={16} className={ds.kind === 'dataverse' ? 'ds-dv' : 'ds-mock'} />
                <span className="ds-name">{ds.name}</span>
                <span className="badge">{(ds.rows || []).length}</span>
                <button
                  className="icon-btn sm"
                  type="button"
                  onClick={(e) =>
                    openMenu(e, [
                      { label: t('data.viewEditData'), icon: 'Table', onClick: () => setDialog({ type: 'edit', id: ds.id }) },
                      ds.kind === 'dataverse' ? { label: t('data.refreshFromDataverse'), icon: 'ArrowSync', onClick: () => refresh(ds) } : null,
                      { label: t('data.generateSampleData'), icon: 'Sparkle', onClick: () => setSources((list) => list.map((d) => (d.id === ds.id ? { ...d, rows: [...(d.rows || []), ...sampleRows(d.columns.filter((c) => c.name !== d.primaryKey), 5)] } : d))) },
                      { sep: true },
                      { label: t('common.delete'), icon: 'Delete', danger: true, onClick: () => setSources((list) => list.filter((d) => d.id !== ds.id)) },
                    ])
                  }
                  aria-label={t('data.actions')}
                >
                  <Icon name="More" size={14} />
                </button>
              </div>
              {expanded === ds.id ? (
                <div className="ds-cols">
                  {ds.logicalName ? <div className="muted small mono">{ds.logicalName} · {ds.entitySetName}</div> : null}
                  {ds.columns.slice(0, 200).map((c) => (
                    <div key={c.name} className="ds-col" title={`${c.name} (${c.type})`}>
                      <span>{c.displayName || c.name}</span>
                      <span className="muted small">{COLUMN_TYPES.find((ct) => ct.id === c.type)?.label || c.type}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </section>

        {missing.length ? (
          <section className="data-section">
            <h3>{t('data.undeclaredSources', { count: missing.length })}</h3>
            <p className="muted small" style={{ margin: '0 12px 8px' }}>
              {t('data.undeclaredHint')}
            </p>
            {missing.map((m) => (
              <div key={m.name} className="missing-item">
                <div className="missing-head">
                  <Icon name="Warning" size={14} className="sev-warning" />
                  <span className="ds-name" title={m.name}>
                    {m.name}
                  </span>
                  <span className="muted small">{t('data.columnsShort', { count: m.columns.length })}</span>
                </div>
                <div className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
                  <button className="btn btn-sm" type="button" onClick={() => createMissing(m)}>
                    {t('data.mockTable')}
                  </button>
                  <button className="btn btn-sm" type="button" onClick={() => setDialog({ type: 'add', tab: 'dataverse', search: m.name })} disabled={!connected} title={connected ? '' : t('data.connectToDataverse')}>
                    Dataverse…
                  </button>
                </div>
              </div>
            ))}
            <div style={{ padding: '4px 12px 12px' }}>
              <button className="btn btn-sm btn-subtle" type="button" onClick={() => missing.forEach((m) => createMissing(m))}>
                <Icon name="Sparkle" size={14} /> {t('data.createAllMock')}
              </button>
            </div>
          </section>
        ) : null}
      </div>
      {dialog?.type === 'connect' ? <ConnectDialog onClose={() => setDialog(null)} /> : null}
      {dialog?.type === 'add' ? <AddDataDialog initialTab={dialog.tab} initialSearch={dialog.search} onClose={() => setDialog(null)} onAdd={addSource} /> : null}
      {dialog?.type === 'edit' ? <DataEditorDialog id={dialog.id} onClose={() => setDialog(null)} /> : null}
      {menuEl}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Connexion Dataverse
// ---------------------------------------------------------------------------
function ConnectDialog({ onClose }) {
  const s = useStudio();
  const { t, rich } = useI18n();
  const [envUrl, setEnvUrl] = useState(s.project.settings?.dataverseUrl || '');
  const conn = getConnection(envUrl) || {};
  const [mode, setMode] = useState(conn.authMode || 'device');
  const [tenantId, setTenantId] = useState(conn.tenantId || '');
  const [clientId, setClientId] = useState(conn.clientId || '');
  const [clientSecret, setClientSecret] = useState('');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [device, setDevice] = useState(null);
  const [status, setStatus] = useState(null);
  const pollRef = useRef(null);

  useEffect(() => () => clearTimeout(pollRef.current), []);

  const saveEnv = () => {
    const env = normalizeEnvUrl(envUrl);
    s.update((p) => ({ ...p, settings: { ...p.settings, dataverseUrl: env } }));
    return env;
  };

  const ok = (who) => {
    setStatus({ ok: true, text: t('data.connectedAs', { userId: who?.UserId || '?' }) });
    toast(t('data.connectionEstablished'), 'success');
  };

  const connect = async () => {
    const env = saveEnv();
    if (!env) {
      setStatus({ ok: false, text: t('data.invalidUrlExample') });
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      if (mode === 'token') ok(await connectWithToken(env, token));
      else if (mode === 'client') ok(await connectWithClientSecret(env, { tenantId, clientId, clientSecret }));
      else {
        const d = await startDeviceLogin(env, { tenantId: tenantId || undefined, clientId: clientId || undefined });
        setDevice(d);
        const poll = async () => {
          try {
            const r = await pollDeviceLogin(env, { tenantId: tenantId || undefined, clientId: clientId || undefined, deviceCode: d.deviceCode });
            if (r) {
              setDevice(null);
              setBusy(false);
              ok({ UserId: t('data.userSession') });
              return;
            }
            pollRef.current = setTimeout(poll, (d.interval || 5) * 1000);
          } catch (e) {
            setDevice(null);
            setBusy(false);
            setStatus({ ok: false, text: e.message });
          }
        };
        pollRef.current = setTimeout(poll, (d.interval || 5) * 1000);
        return;
      }
    } catch (e) {
      setStatus({ ok: false, text: e.message });
    }
    setBusy(false);
  };

  return (
    <Dialog
      title={t('data.connectDialogTitle')}
      icon="Database"
      onClose={onClose}
      footer={
        <>
          {isConnected(envUrl) ? (
            <button
              className="btn btn-subtle btn-danger"
              type="button"
              onClick={() => {
                clearConnection(envUrl);
                setStatus({ ok: false, text: t('data.disconnected') });
              }}
            >
              {t('data.disconnect')}
            </button>
          ) : null}
          <span className="spacer" />
          <button className="btn" type="button" onClick={onClose}>
            {t('common.close')}
          </button>
          <button className="btn btn-primary" type="button" onClick={connect} disabled={busy || !envUrl}>
            {busy ? <Spinner /> : null} {t('data.signIn')}
          </button>
        </>
      }
    >
      <div className="field">
        <label>{t('data.environmentUrl')}</label>
        <input className="input" placeholder="https://contoso.crm4.dynamics.com" value={envUrl} onChange={(e) => setEnvUrl(e.target.value)} />
      </div>
      <div className="field">
        <label>{t('data.authMethod')}</label>
        <div className="segmented">
          <button type="button" className={mode === 'device' ? 'is-active' : ''} onClick={() => setMode('device')}>
            {t('data.authDevice')}
          </button>
          <button type="button" className={mode === 'client' ? 'is-active' : ''} onClick={() => setMode('client')}>
            {t('data.authClient')}
          </button>
          <button type="button" className={mode === 'token' ? 'is-active' : ''} onClick={() => setMode('token')}>
            {t('data.authToken')}
          </button>
        </div>
      </div>
      {mode === 'device' ? (
        <>
          <p className="muted small">{t('data.deviceHint', { clientId: SAMPLE_CLIENT_ID })}</p>
          <div className="field-row">
            <div className="field" style={{ flex: 1 }}>
              <label>{t('data.tenantOptional')}</label>
              <input className="input" placeholder={t('data.tenantPlaceholder')} value={tenantId} onChange={(e) => setTenantId(e.target.value)} />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>{t('data.clientIdOptional')}</label>
              <input className="input mono" placeholder={SAMPLE_CLIENT_ID} value={clientId} onChange={(e) => setClientId(e.target.value)} />
            </div>
          </div>
          {device ? (
            <div className="message-bar info">
              <Icon name="Key" size={16} />
              <div>
                {rich(
                  'data.deviceCodePrompt',
                  { uri: device.verificationUri, code: device.userCode },
                  {
                    a: (c) => (
                      <a href={device.verificationUri} target="_blank" rel="noreferrer">
                        {c}
                      </a>
                    ),
                    b: (c) => (
                      <b className="mono" style={{ fontSize: 16 }}>
                        {c}
                      </b>
                    ),
                  },
                )}
              </div>
            </div>
          ) : null}
        </>
      ) : null}
      {mode === 'client' ? (
        <>
          <p className="muted small">{t('data.clientHint')}</p>
          <div className="field">
            <label>{t('data.tenantId')}</label>
            <input className="input mono" value={tenantId} onChange={(e) => setTenantId(e.target.value)} />
          </div>
          <div className="field">
            <label>{t('data.clientId')}</label>
            <input className="input mono" value={clientId} onChange={(e) => setClientId(e.target.value)} />
          </div>
          <div className="field">
            <label>{t('data.clientSecret')}</label>
            <input className="input mono" type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} />
          </div>
        </>
      ) : null}
      {mode === 'token' ? (
        <>
          <p className="muted small">
            {rich(
              'data.tokenHint',
              { command: `az account get-access-token --resource ${normalizeEnvUrl(envUrl) || 'https://contoso.crm4.dynamics.com'} --query accessToken -o tsv` },
              { code: (c) => <code className="mono">{c}</code> },
            )}
          </p>
          <textarea className="textarea mono" rows={5} value={token} onChange={(e) => setToken(e.target.value)} placeholder="eyJ0eXAiOiJKV1Qi…" />
        </>
      ) : null}
      {status ? (
        <div className={`message-bar ${status.ok ? 'success' : 'error'}`} style={{ marginTop: 12 }}>
          <Icon name={status.ok ? 'CheckmarkCircle' : 'Error'} size={16} />
          <div>{status.text}</div>
        </div>
      ) : null}
      <p className="muted small" style={{ marginTop: 12 }}>
        {t('data.writesStayLocal')}
      </p>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Ajout de données
// ---------------------------------------------------------------------------
function AddDataDialog({ onClose, onAdd, initialTab, initialSearch }) {
  const s = useStudio();
  const { t } = useI18n();
  const env = s.project.settings?.dataverseUrl || '';
  const connected = env && isConnected(env);
  const [tab, setTab] = useState(initialTab || (connected ? 'dataverse' : 'mock'));
  return (
    <Dialog title={t('data.addData')} icon="Database" size="wide" onClose={onClose}>
      <div className="tabs" style={{ padding: 0, marginBottom: 12 }}>
        <button className={`tab${tab === 'dataverse' ? ' is-active' : ''}`} type="button" onClick={() => setTab('dataverse')}>
          {t('data.dataverseTables')}
        </button>
        <button className={`tab${tab === 'mock' ? ' is-active' : ''}`} type="button" onClick={() => setTab('mock')}>
          {t('data.mockTable')}
        </button>
        <button className={`tab${tab === 'import' ? ' is-active' : ''}`} type="button" onClick={() => setTab('import')}>
          {t('data.importCsvJson')}
        </button>
      </div>
      {tab === 'dataverse' ? <DataverseTab env={env} connected={connected} onAdd={onAdd} initialSearch={initialSearch} /> : null}
      {tab === 'mock' ? <MockTab onAdd={(d) => { onAdd(d); onClose(); }} /> : null}
      {tab === 'import' ? <ImportTab onAdd={(d) => { onAdd(d); onClose(); }} /> : null}
    </Dialog>
  );
}

function DataverseTab({ env, connected, onAdd, initialSearch }) {
  const { t } = useI18n();
  const [tables, setTables] = useState(null);
  const [q, setQ] = useState(initialSearch || '');
  const [busy, setBusy] = useState(null);
  const [top, setTop] = useState(200);
  const [err, setErr] = useState(null);
  useEffect(() => {
    if (!connected) return;
    listTables(env)
      .then(setTables)
      .catch((e) => setErr(e.message));
  }, [env, connected]);
  if (!connected)
    return (
      <div className="empty-state">
        <Icon name="Plug" size={32} />
        {t('data.connectEnvFirst')}
      </div>
    );
  const ql = q.trim().toLowerCase();
  const list = (tables || []).filter((tb) => !ql || tb.collectionName.toLowerCase().includes(ql) || tb.displayName.toLowerCase().includes(ql) || tb.logicalName.includes(ql));
  const add = async (tb) => {
    setBusy(tb.logicalName);
    try {
      const meta = await tableMetadata(env, tb.logicalName);
      const rows = await fetchRows(env, meta, top);
      onAdd({ ...meta, rows, rowLimit: top, fetchedAt: new Date().toISOString() });
    } catch (e) {
      toast(t('data.importFailed', { name: tb.collectionName, message: e.message }), 'error');
    } finally {
      setBusy(null);
    }
  };
  return (
    <>
      <div className="row" style={{ marginBottom: 8 }}>
        <input className="input" placeholder={t('data.searchTablePlaceholder')} value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        <label className="row small" style={{ whiteSpace: 'nowrap' }}>
          {t('data.rowsLabel')}
          <input className="input sm" type="number" min={1} max={5000} value={top} onChange={(e) => setTop(Number(e.target.value) || 200)} style={{ width: 80 }} />
        </label>
      </div>
      {err ? <div className="message-bar error">{err}</div> : null}
      {!tables && !err ? (
        <div className="empty-state">
          <Spinner /> {t('data.loadingTables')}
        </div>
      ) : null}
      <div className="dv-table-list">
        {list.slice(0, 300).map((tb) => (
          <div key={tb.logicalName} className="dv-table">
            <Icon name="Table" size={16} />
            <div className="dv-table-names">
              <b>{tb.collectionName}</b>
              <span className="muted small mono">{tb.logicalName}</span>
            </div>
            <button className="btn btn-sm" type="button" onClick={() => add(tb)} disabled={!!busy}>
              {busy === tb.logicalName ? <Spinner /> : <Icon name="Add" size={14} />} {t('common.add')}
            </button>
          </div>
        ))}
      </div>
    </>
  );
}

function ColumnsEditor({ columns, setColumns }) {
  const { t } = useI18n();
  return (
    <div className="cols-editor">
      {columns.map((c, i) => (
        <div key={i} className="col-edit-row">
          <input className="input sm" placeholder={t('data.columnName')} value={c.name} onChange={(e) => setColumns(columns.map((x, j) => (j === i ? { ...x, name: e.target.value, displayName: e.target.value } : x)))} />
          <select className="select sm" value={c.type} onChange={(e) => setColumns(columns.map((x, j) => (j === i ? { ...x, type: e.target.value } : x)))}>
            {COLUMN_TYPES.map((ct) => (
              <option key={ct.id} value={ct.id}>
                {ct.label}
              </option>
            ))}
          </select>
          {c.type === 'choice' || c.type === 'multichoice' ? (
            <input
              className="input sm"
              placeholder={t('data.optionsPlaceholder')}
              value={(c.options || []).map((o) => o.label).join(';')}
              onChange={(e) =>
                setColumns(
                  columns.map((x, j) =>
                    j === i
                      ? {
                          ...x,
                          options: e.target.value
                            .split(';')
                            .map((l) => l.trim())
                            .filter(Boolean)
                            .map((label, k) => ({ value: k + 1, label })),
                        }
                      : x,
                  ),
                )
              }
            />
          ) : c.type === 'lookup' ? (
            <input className="input sm" placeholder={t('data.targetTable')} value={c.targetName || ''} onChange={(e) => setColumns(columns.map((x, j) => (j === i ? { ...x, targetName: e.target.value } : x)))} />
          ) : (
            <span />
          )}
          <button className="icon-btn sm" type="button" onClick={() => setColumns(columns.filter((_, j) => j !== i))} aria-label={t('data.deleteColumn')}>
            <Icon name="Delete" size={14} />
          </button>
        </div>
      ))}
      <button className="btn btn-sm btn-subtle" type="button" onClick={() => setColumns([...columns, { name: '', displayName: '', type: 'text' }])}>
        <Icon name="Add" size={14} /> {t('data.addColumn')}
      </button>
    </div>
  );
}

function MockTab({ onAdd }) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  // colonnes proposées par défaut, nommées dans la langue de l’interface
  const [columns, setColumns] = useState(() => [
    { name: t('data.defaultColTitle'), displayName: t('data.defaultColTitle'), type: 'text' },
    { name: t('data.defaultColAmount'), displayName: t('data.defaultColAmount'), type: 'number' },
    { name: t('data.defaultColDate'), displayName: t('data.defaultColDate'), type: 'datetime' },
  ]);
  const [rows, setRows] = useState(5);
  return (
    <>
      <div className="field">
        <label>{t('data.tableNameLabel')}</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('data.tableNamePlaceholder')} autoFocus />
      </div>
      <div className="field">
        <label>{t('data.columns')}</label>
        <ColumnsEditor columns={columns} setColumns={setColumns} />
      </div>
      <div className="row">
        <label className="row small">
          {t('data.sampleRowsLabel')} <input className="input sm" type="number" min={0} max={500} value={rows} onChange={(e) => setRows(Number(e.target.value) || 0)} style={{ width: 80 }} />
        </label>
        <span className="spacer" />
        <button
          className="btn btn-primary"
          type="button"
          disabled={!name.trim() || columns.some((c) => !c.name.trim())}
          onClick={() => {
            const def = createMockTable(name.trim(), columns);
            def.rows = sampleRows(columns, rows);
            onAdd(def);
          }}
        >
          {t('data.createTable')}
        </button>
      </div>
    </>
  );
}

function parseCsv(text) {
  const sep = (text.split('\n')[0].match(/;/g) || []).length > (text.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
  const rows = [];
  let cur = [''];
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') {
        cur[cur.length - 1] += '"';
        i++;
      } else if (c === '"') inQ = false;
      else cur[cur.length - 1] += c;
    } else if (c === '"') inQ = true;
    else if (c === sep) cur.push('');
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      if (cur.some((x) => x !== '')) rows.push(cur);
      cur = [''];
    } else cur[cur.length - 1] += c;
  }
  if (cur.some((x) => x !== '')) rows.push(cur);
  const [head, ...body] = rows;
  return (body || []).map((r) => Object.fromEntries((head || []).map((h, i) => [h.trim(), r[i] ?? ''])));
}

function inferColumns(records) {
  const keys = [...new Set(records.flatMap((r) => Object.keys(r)))];
  return keys.map((k) => {
    const vals = records.map((r) => r[k]).filter((v) => v !== '' && v !== null && v !== undefined);
    let type = 'text';
    if (vals.length && vals.every((v) => typeof v === 'number' || (/^-?\d+([.,]\d+)?$/.test(String(v)) && !/^0\d/.test(String(v))))) type = 'number';
    else if (vals.length && vals.every((v) => typeof v === 'boolean' || /^(true|false|oui|non)$/i.test(String(v)))) type = 'bool';
    else if (vals.length && vals.every((v) => /^\d{4}-\d{2}-\d{2}/.test(String(v)) || /^\d{2}\/\d{2}\/\d{4}/.test(String(v)))) type = 'datetime';
    return { name: k, displayName: k, type };
  });
}

function ImportTab({ onAdd }) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const fileRef = useRef(null);
  const parsed = useMemo(() => {
    const src = text.trim();
    if (!src) return null;
    try {
      if (src.startsWith('[') || src.startsWith('{')) {
        const j = JSON.parse(src);
        const arr = Array.isArray(j) ? j : j.value || j.data || [j];
        return { records: arr.filter((x) => x && typeof x === 'object') };
      }
      return { records: parseCsv(src) };
    } catch (e) {
      return { error: e.message };
    }
  }, [text]);
  const cols = parsed?.records ? inferColumns(parsed.records) : [];
  return (
    <>
      <div className="row" style={{ marginBottom: 8 }}>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('data.tableName')} />
        <button className="btn" type="button" onClick={() => fileRef.current?.click()}>
          <Icon name="ArrowImport" size={16} /> {t('data.file')}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.json,.txt"
          style={{ display: 'none' }}
          onChange={async (e) => {
            const f = e.target.files[0];
            if (!f) return;
            setText(await f.text());
            if (!name) setName(f.name.replace(/\.(csv|json|txt)$/i, ''));
            e.target.value = '';
          }}
        />
      </div>
      <textarea className="textarea mono" rows={10} value={text} onChange={(e) => setText(e.target.value)} placeholder={t('data.importPlaceholder')} />
      {parsed?.error ? <div className="message-bar error">{parsed.error}</div> : null}
      {parsed?.records ? (
        <p className="muted small">
          {t('data.importSummary', { count: parsed.records.length, columns: cols.map((c) => `${c.name} (${c.type})`).join(', ') })}
        </p>
      ) : null}
      <div className="row">
        <span className="spacer" />
        <button
          className="btn btn-primary"
          type="button"
          disabled={!name.trim() || !parsed?.records?.length}
          onClick={() => {
            const def = createMockTable(name.trim(), cols);
            def.rows = parsed.records.map((r) => {
              const o = {};
              for (const c of cols) {
                let v = r[c.name];
                if (c.type === 'number' && v !== '' && v !== undefined) v = Number(String(v).replace(',', '.'));
                if (c.type === 'bool') v = /^(true|oui)$/i.test(String(v));
                o[c.name] = v;
              }
              return o;
            });
            onAdd(def);
          }}
        >
          {t('data.import')}
        </button>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Éditeur de données
// ---------------------------------------------------------------------------
function cellText(v, col) {
  if (v === null || v === undefined) return '';
  if (col.type === 'lookup' && typeof v === 'object') return v.name || v.id || '';
  if (col.type === 'choice') return col.options?.find((o) => String(o.value) === String(v))?.label ?? String(v);
  if (Array.isArray(v)) return v.join(';');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function DataEditorDialog({ id, onClose }) {
  const s = useStudio();
  const { t } = useI18n();
  const ds = (s.project.dataSources || []).find((d) => d.id === id);
  const [def, setDef] = useState(() => (ds ? structuredClone(ds) : null));
  const [tab, setTab] = useState('data');
  const [filter, setFilter] = useState('');
  if (!def) return null;
  const cols = def.columns;
  const setCell = (ri, col, raw) => {
    let v = raw;
    if (col.type === 'number' || col.type === 'money') v = raw === '' ? null : Number(String(raw).replace(',', '.'));
    if (col.type === 'bool') v = !!raw;
    if (col.type === 'lookup') v = raw ? { __lookup: true, id: raw, entity: col.targets?.[0] || col.targetName || null, name: raw } : null;
    if (col.type === 'choice') v = raw === '' ? null : col.options?.find((o) => String(o.value) === String(raw))?.value ?? raw;
    setDef((d) => ({ ...d, rows: d.rows.map((r, i) => (i === ri ? { ...r, [col.name]: v } : r)) }));
  };
  const fl = filter.toLowerCase();
  const rowsShown = def.rows.map((r, i) => ({ r, i })).filter(({ r }) => !fl || cols.some((c) => cellText(r[c.name], c).toLowerCase().includes(fl)));
  const visibleCols = cols.filter((c) => c.type !== 'image').slice(0, 60);
  const save = () => {
    s.update((p) => ({ ...p, dataSources: p.dataSources.map((d) => (d.id === id ? { ...def, name: def.name.trim() || d.name } : d)) }));

    toast(t('data.sourceSaved', { name: def.name }), 'success');
    onClose();
  };
  return (
    <Dialog
      title={t('data.editorTitle', { name: def.name })}
      icon="Table"
      size="xwide"
      onClose={onClose}
      footer={
        <>
          <span className="muted small">
            {t('data.rowCount', { count: def.rows.length })} · {t('data.columnCount', { count: cols.length })}
            {def.kind === 'dataverse' ? ` · ${t('data.localCopy')}` : ''}
          </span>
          <span className="spacer" />
          <button className="btn" type="button" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn btn-primary" type="button" onClick={save}>
            {t('data.save')}
          </button>
        </>
      }
    >
      <div className="tabs" style={{ padding: 0, marginBottom: 8 }}>
        <button className={`tab${tab === 'data' ? ' is-active' : ''}`} type="button" onClick={() => setTab('data')}>
          {t('data.rows')}
        </button>
        <button className={`tab${tab === 'schema' ? ' is-active' : ''}`} type="button" onClick={() => setTab('schema')}>
          {t('data.columns')}
        </button>
        <button className={`tab${tab === 'json' ? ' is-active' : ''}`} type="button" onClick={() => setTab('json')}>
          JSON
        </button>
      </div>
      {tab === 'data' ? (
        <>
          <div className="row" style={{ marginBottom: 8 }}>
            <input className="input sm" placeholder={t('data.filter')} value={filter} onChange={(e) => setFilter(e.target.value)} style={{ maxWidth: 280 }} />
            <button className="btn btn-sm" type="button" onClick={() => setDef((d) => ({ ...d, rows: [...d.rows, d.primaryKey ? { [d.primaryKey]: crypto.randomUUID() } : {}] }))}>
              <Icon name="Add" size={14} /> {t('data.row')}
            </button>
            <button className="btn btn-sm" type="button" onClick={() => setDef((d) => ({ ...d, rows: [...d.rows, ...sampleRows(d.columns.filter((c) => c.name !== d.primaryKey), 5)] }))}>
              <Icon name="Sparkle" size={14} /> {t('data.fiveSampleRows')}
            </button>
          </div>
          <div className="grid-wrap">
            <table className="data-grid">
              <thead>
                <tr>
                  <th />
                  {visibleCols.map((c) => (
                    <th key={c.name} title={`${c.name} · ${c.type}`}>
                      {c.displayName || c.name}
                      <span className="col-sub">
                        {c.name !== (c.displayName || c.name) ? `${c.name} · ` : ''}
                        {c.type}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rowsShown.slice(0, 500).map(({ r, i }) => (
                  <tr key={i}>
                    <td>
                      <button className="icon-btn sm" type="button" onClick={() => setDef((d) => ({ ...d, rows: d.rows.filter((_, j) => j !== i) }))} aria-label={t('data.deleteRow')}>
                        <Icon name="Delete" size={12} />
                      </button>
                    </td>
                    {visibleCols.map((c) => (
                      <td key={c.name} className="edit">
                        {c.type === 'bool' ? (
                          <input type="checkbox" checked={!!r[c.name]} onChange={(e) => setCell(i, c, e.target.checked)} style={{ width: 'auto', margin: '0 8px' }} />
                        ) : c.type === 'choice' && c.options?.length ? (
                          <select value={r[c.name] ?? ''} onChange={(e) => setCell(i, c, e.target.value)} className="grid-select">
                            <option value="">—</option>
                            {c.options.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input value={cellText(r[c.name], c)} onChange={(e) => setCell(i, c, e.target.value)} readOnly={c.name === def.primaryKey} />
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
      {tab === 'schema' ? (
        <>
          <div className="field">
            <label>{t('data.nameLabel')}</label>
            <input className="input" value={def.name} onChange={(e) => setDef((d) => ({ ...d, name: e.target.value }))} />
          </div>
          <ColumnsEditor columns={def.columns} setColumns={(c) => setDef((d) => ({ ...d, columns: c }))} />
        </>
      ) : null}
      {tab === 'json' ? <JsonRows def={def} setDef={setDef} /> : null}
    </Dialog>
  );
}

function JsonRows({ def, setDef }) {
  const { t } = useI18n();
  const [text, setText] = useState(() => JSON.stringify(def.rows, null, 2));
  const [err, setErr] = useState(null);
  return (
    <>
      <textarea
        className={`textarea mono${err ? ' is-invalid' : ''}`}
        rows={22}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          try {
            const rows = JSON.parse(e.target.value);
            if (!Array.isArray(rows)) throw new Error(t('data.arrayExpected'));
            setErr(null);
            setDef((d) => ({ ...d, rows }));
          } catch (x) {
            setErr(x.message);
          }
        }}
      />
      {err ? <div className="adv-err">{err}</div> : null}
    </>
  );
}
