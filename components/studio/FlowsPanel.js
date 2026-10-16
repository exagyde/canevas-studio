'use client';
import { useEffect, useMemo, useState } from 'react';
import { useStudio } from './context';
import { PanelHeader } from './LeftRail';
import { Icon, Dialog, toast, Spinner, useMenu } from '@/components/common/ui';
import { parseFormula, walk } from '@/lib/fx/parser';
import { walkNodes } from '@/lib/project/model';
import { isConnected, listCloudFlows } from '@/lib/dataverse/client';
import { useI18n } from '@/components/common/i18n';
import { INTL_LOCALES } from '@/lib/i18n';

const newFlowId = () => `fl_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const kindLabels = (t) => ({ flow: t('data.kindFlow'), customapi: t('data.kindCustomApi'), connector: t('data.kindConnector') });
const modeLabels = (t) => ({ mock: t('data.modeMock'), script: t('data.modeScript'), http: t('data.modeHttp'), dataverse: t('data.modeDataverse') });

function guessKind(callName) {
  if (/\.Run$/i.test(callName)) return 'flow';
  if (/^Environment\./.test(callName)) return 'customapi';
  return 'connector';
}

/** Recense les appels préfixés (X.Run(…), Environment.Y(…)) et le nombre d'arguments */
function scanCalls(project) {
  const calls = new Map();
  const visit = (f, where) => {
    if (typeof f !== 'string' || !f.startsWith('=')) return;
    const { ast } = parseFormula(f);
    if (!ast) return;
    walk(ast, (n) => {
      if (n.type === 'Call' && n.name.includes('.') && !/^(Calendar|Clock)\./.test(n.name)) {
        const c = calls.get(n.name) || { name: n.name, args: 0, where: new Set(), recordArg: null };
        c.args = Math.max(c.args, n.args.length);
        c.where.add(where);
        if (n.args.length === 1 && n.args[0].type === 'Record') c.recordArg = n.args[0].fields.map((x) => x.name);
        calls.set(n.name, c);
      }
    });
  };
  for (const s of project.screens || []) {
    for (const [p, f] of Object.entries(s.properties || {})) visit(f, `${s.name}.${p}`);
    for (const { node } of walkNodes(s.children)) for (const [p, f] of Object.entries(node.properties || {})) visit(f, `${node.name}.${p}`);
  }
  for (const [p, f] of Object.entries(project.app?.properties || {})) visit(f, `App.${p}`);
  return calls;
}

export default function FlowsPanel() {
  const s = useStudio();
  const { t, rich } = useI18n();
  const { project } = s;
  const [editing, setEditing] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [openMenu, menuEl] = useMenu();
  const calls = useMemo(() => scanCalls(project), [project]);
  const defs = project.flows || [];
  const configured = new Set(defs.map((d) => String(d.callName).toLowerCase()));
  const compNames = new Set((project.components || []).map((c) => c.name));
  const missing = [...calls.values()].filter((c) => !configured.has(c.name.toLowerCase()) && !compNames.has(c.name.split('.')[0]));
  const env = project.settings?.dataverseUrl;

  const saveDef = (def) => {
    s.update((p) => {
      const list = p.flows || [];
      const exists = list.some((x) => x.id === def.id);
      return { ...p, flows: exists ? list.map((x) => (x.id === def.id ? def : x)) : [...list, def] };
    });
  };

  const configure = (c) => {
    const kind = guessKind(c.name);
    const params = c.recordArg ? c.recordArg.map((n) => ({ name: n, type: 'string' })) : Array.from({ length: c.args }, (_, i) => ({ name: `param${i + 1}`, type: 'string' }));
    setEditing({
      id: newFlowId(),
      callName: c.name,
      kind,
      description: '',
      params,
      mode: 'mock',
      mockResponse: kind === 'customapi' ? JSON.stringify({ Result: t('data.mockValue') }, null, 2) : JSON.stringify({ [t('data.mockResultKey')]: 'OK' }, null, 2),
      delayMs: 400,
      _new: true,
    });
  };

  return (
    <div className="panel">
      <PanelHeader title={t('data.flowsPanelTitle')} />
      <div className="panel-tools">
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          <button
            className="btn btn-primary btn-sm"
            type="button"
            onClick={() => setEditing({ id: newFlowId(), callName: t('data.defaultFlowName'), kind: 'flow', params: [], mode: 'mock', mockResponse: JSON.stringify({ [t('data.mockResultKey')]: 'OK' }, null, 2), delayMs: 400, _new: true })}
          >
            <Icon name="Add" size={14} /> {t('data.newSimulation')}
          </button>
          <button className="btn btn-sm" type="button" disabled={!env || !isConnected(env)} title={env ? '' : t('data.connectDataverseHint')} onClick={() => setImportOpen(true)}>
            <Icon name="Flow" size={14} /> {t('data.environmentFlows')}
          </button>
        </div>
      </div>
      <div className="panel-scroll">
        <p className="muted small" style={{ margin: '4px 12px 8px' }}>
          {rich('data.flowsIntro', null, { code: (c) => <code>{c}</code> })}
        </p>
        {missing.length ? (
          <section className="data-section">
            <h3>{t('data.detectedCalls', { count: missing.length })}</h3>
            {missing.map((c) => (
              <div key={c.name} className="missing-item">
                <div className="missing-head">
                  <Icon name={guessKind(c.name) === 'flow' ? 'Flow' : 'Plug'} size={14} className="sev-warning" />
                  <span className="ds-name mono" title={[...c.where].join(', ')}>
                    {c.name}
                  </span>
                </div>
                <div className="muted small">
                  {t('data.argCount', { count: c.args })} · {[...c.where].slice(0, 2).join(', ')}
                  {c.where.size > 2 ? '…' : ''}
                </div>
                <button className="btn btn-sm" type="button" onClick={() => configure(c)}>
                  {t('data.configureSimulation')}
                </button>
              </div>
            ))}
          </section>
        ) : null}
        <section className="data-section">
          <h3>{t('data.configuredSimulations', { count: defs.length })}</h3>
          {!defs.length ? (
            <div className="empty-state small">
              <Icon name="Flow" size={28} />
              {t('data.noSimulations')}
            </div>
          ) : null}
          {defs.map((d) => (
            <div key={d.id} className="ds-item">
              <div className="ds-row" onClick={() => setEditing(structuredClone(d))}>
                <Icon name={d.kind === 'flow' ? 'Flow' : d.kind === 'customapi' ? 'Database' : 'Plug'} size={16} className="ds-dv" />
                <span className="ds-name mono" title={d.callName}>
                  {d.callName}
                </span>
                <span className="badge outline">{modeLabels(t)[d.mode] || d.mode}</span>
                <button
                  className="icon-btn sm"
                  type="button"
                  onClick={(e) =>
                    openMenu(e, [
                      { label: t('data.edit'), icon: 'Edit', onClick: () => setEditing(structuredClone(d)) },
                      { label: t('common.duplicate'), icon: 'Copy', onClick: () => saveDef({ ...structuredClone(d), id: newFlowId(), callName: `${d.callName}_${t('data.copySuffix')}` }) },
                      { label: t('common.delete'), icon: 'Delete', danger: true, onClick: () => s.update((p) => ({ ...p, flows: p.flows.filter((x) => x.id !== d.id) })) },
                    ])
                  }
                  aria-label={t('data.actions')}
                >
                  <Icon name="More" size={14} />
                </button>
              </div>
            </div>
          ))}
        </section>
        <section className="data-section">
          <h3>{t('data.runLog')}</h3>
          <RunLog />
        </section>
      </div>
      {editing ? (
        <FlowEditor
          def={editing}
          onClose={() => setEditing(null)}
          onSave={(d) => {
            const { _new, ...clean } = d;
            void _new;
            saveDef(clean);
            setEditing(null);
            toast(t('data.simulationSaved', { name: d.callName }), 'success');
          }}
        />
      ) : null}
      {importOpen ? <ImportFlowsDialog env={env} onClose={() => setImportOpen(false)} onAdd={(d) => saveDef(d)} /> : null}
      {menuEl}
    </div>
  );
}

function RunLog() {
  const s = useStudio();
  const { t, locale } = useI18n();
  const logs = s.rt.logs.filter((l) => ['flow', 'error', 'behavior', 'notify', 'trace', 'data', 'nav', 'warning'].includes(l.type)).slice(-60).reverse();
  void s.rtVersion;
  if (!logs.length) return <div className="muted small" style={{ padding: '0 12px 12px' }}>{t('data.noRuns')}</div>;
  return (
    <div className="run-log">
      {logs.map((l, i) => (
        <div key={i} className={`log-line log-${l.type}`} title={l.detail ? JSON.stringify(l.detail, null, 2).slice(0, 2000) : undefined}>
          <span className="log-time">{l.t.toLocaleTimeString(INTL_LOCALES[locale])}</span>
          <span className="log-msg">{l.message}</span>
        </div>
      ))}
      <button className="btn btn-sm btn-subtle" type="button" onClick={() => (s.rt.logs.length = 0) || s.rt.bump()}>
        {t('data.clearLog')}
      </button>
    </div>
  );
}

function FlowEditor({ def, onClose, onSave }) {
  const s = useStudio();
  const { t, rich } = useI18n();
  const [d, setD] = useState(def);
  const [test, setTest] = useState(null);
  const [busy, setBusy] = useState(false);
  const jsonErr = useMemo(() => {
    if (d.mode !== 'mock' || !d.mockResponse?.trim()) return null;
    try {
      JSON.parse(d.mockResponse);
      return null;
    } catch (e) {
      return e.message;
    }
  }, [d.mode, d.mockResponse]);
  const set = (patch) => setD((x) => ({ ...x, ...patch }));
  const runTest = async () => {
    setBusy(true);
    setTest(null);
    try {
      const args = (d.params || []).map((p) => (p.type === 'number' ? 1 : p.type === 'boolean' ? true : `test ${p.name}`));
      const prev = s.rt.externalsByName;
      const r = await Promise.resolve(s.rt.invokeExternal({ ...d }, d.kind === 'customapi' ? [Object.fromEntries((d.params || []).map((p, i) => [p.name, args[i]]))] : args, { behavior: true }));
      void prev;
      setTest({ ok: true, value: JSON.stringify(r, null, 2) });
    } catch (e) {
      setTest({ ok: false, value: e.message });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      title={t('data.flowEditorTitle')}
      icon="Flow"
      size="wide"
      onClose={onClose}
      footer={
        <>
          <button className="btn" type="button" onClick={runTest} disabled={busy || !!jsonErr}>
            {busy ? <Spinner /> : <Icon name="Play" size={14} />} {t('data.test')}
          </button>
          <span className="spacer" />
          <button className="btn" type="button" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn btn-primary" type="button" onClick={() => onSave(d)} disabled={!d.callName?.includes('.') || !!jsonErr}>
            {t('data.save')}
          </button>
        </>
      }
    >
      <div className="field-row">
        <div className="field" style={{ flex: 2 }}>
          <label>{t('data.callNameLabel')}</label>
          <input className="input mono" value={d.callName} onChange={(e) => set({ callName: e.target.value.trim() })} placeholder={t('data.defaultFlowName')} />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>{t('data.type')}</label>
          <select className="select" value={d.kind} onChange={(e) => set({ kind: e.target.value })}>
            {Object.entries(kindLabels(t)).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="field">
        <label>{d.kind === 'customapi' ? t('data.inputParamsRecord') : t('data.inputParamsOrdered')}</label>
        {(d.params || []).map((p, i) => (
          <div key={i} className="row" style={{ marginBottom: 4 }}>
            <input className="input sm mono" value={p.name} onChange={(e) => set({ params: d.params.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
            <select className="select sm" value={p.type} onChange={(e) => set({ params: d.params.map((x, j) => (j === i ? { ...x, type: e.target.value } : x)) })} style={{ maxWidth: 140 }}>
              <option value="string">{t('data.paramText')}</option>
              <option value="number">{t('data.paramNumber')}</option>
              <option value="boolean">{t('data.paramBoolean')}</option>
              <option value="object">{t('data.paramObject')}</option>
            </select>
            <button className="icon-btn sm" type="button" onClick={() => set({ params: d.params.filter((_, j) => j !== i) })} aria-label={t('common.delete')}>
              <Icon name="Delete" size={14} />
            </button>
          </div>
        ))}
        <button className="btn btn-sm btn-subtle" type="button" onClick={() => set({ params: [...(d.params || []), { name: `param${(d.params || []).length + 1}`, type: 'string' }] })}>
          <Icon name="Add" size={14} /> {t('data.parameter')}
        </button>
      </div>
      <div className="field">
        <label>{t('data.runMode')}</label>
        <div className="segmented">
          {Object.entries(modeLabels(t))
            .filter(([k]) => k !== 'dataverse' || d.kind === 'customapi')
            .filter(([k]) => k !== 'http' || d.kind !== 'customapi')
            .map(([k, v]) => (
              <button key={k} type="button" className={d.mode === k ? 'is-active' : ''} onClick={() => set({ mode: k })}>
                {v}
              </button>
            ))}
        </div>
      </div>
      {d.mode === 'mock' ? (
        <>
          <div className="field">
            <label>{t('data.jsonResponseLabel')}</label>
            <textarea className={`textarea mono${jsonErr ? ' is-invalid' : ''}`} rows={8} value={d.mockResponse || ''} onChange={(e) => set({ mockResponse: e.target.value })} />
            {jsonErr ? <div className="adv-err">{jsonErr}</div> : null}
          </div>
          <div className="field">
            <label>{t('data.mockDelay')}</label>
            <input className="input sm" type="number" min={0} max={30000} value={d.delayMs ?? 0} onChange={(e) => set({ delayMs: Number(e.target.value) || 0 })} style={{ maxWidth: 140 }} />
          </div>
        </>
      ) : null}
      {d.mode === 'script' ? (
        <div className="field">
          <label>{rich('data.scriptLabel', null, { code: (c) => <code>{c}</code> })}</label>
          <textarea
            className="textarea mono"
            rows={10}
            value={d.script || ''}
            onChange={(e) => set({ script: e.target.value })}
            placeholder={`// ${t('data.scriptExampleComment')}\n` + 'const vars = JSON.parse(input.Variables || "[]");\nlet text = input.Text || "";\nfor (const v of vars) text = text.split("{" + v.Key + "}").join(v.Value);\nreturn { Result: text };'}
          />
          <div className="field-hint">{t('data.scriptHint')}</div>
        </div>
      ) : null}
      {d.mode === 'http' ? (
        <div className="field">
          <label>{t('data.httpTriggerUrl')}</label>
          <input className="input mono" value={d.url || ''} onChange={(e) => set({ url: e.target.value.trim() })} placeholder="https://prod-00.westeurope.logic.azure.com:443/workflows/…" />
          <div className="field-hint">{t('data.httpHint')}</div>
        </div>
      ) : null}
      {d.mode === 'dataverse' ? (
        <div className="field">
          <label>{t('data.unboundActionName')}</label>
          <input className="input mono" value={d.actionName || String(d.callName || '').split('.').pop()} onChange={(e) => set({ actionName: e.target.value.trim() })} />
          <div className="field-hint">{t('data.unboundActionHint')}</div>
        </div>
      ) : null}
      {test ? (
        <div className={`message-bar ${test.ok ? 'success' : 'error'}`}>
          <pre className="mono small" style={{ margin: 0, whiteSpace: 'pre-wrap', maxHeight: 200, overflow: 'auto' }}>
            {test.value}
          </pre>
        </div>
      ) : null}
    </Dialog>
  );
}

function ImportFlowsDialog({ env, onClose, onAdd }) {
  const { t } = useI18n();
  const [flows, setFlows] = useState(null);
  const [err, setErr] = useState(null);
  const [q, setQ] = useState('');
  useEffect(() => {
    listCloudFlows(env)
      .then(setFlows)
      .catch((e) => setErr(e.message));
  }, [env]);
  const add = (f) => {
    const sample = {};
    for (const o of f.outputs) sample[o.name] = o.type === 'number' || o.type === 'integer' ? 0 : o.type === 'boolean' ? true : t('data.sampleValue', { name: o.name });
    onAdd({
      id: newFlowId(),
      callName: f.callName,
      kind: 'flow',
      description: f.description || f.displayName,
      params: f.params.map((p) => ({ name: p.name, type: p.type === 'integer' ? 'number' : p.type })),
      mode: 'mock',
      mockResponse: JSON.stringify(sample, null, 2),
      delayMs: 600,
      source: { workflowId: f.id },
    });
    toast(t('data.flowAdded', { name: f.displayName }), 'success');
  };
  const list = (flows || []).filter((f) => !q || f.displayName.toLowerCase().includes(q.toLowerCase()));
  return (
    <Dialog title={t('data.envCloudFlows')} icon="Flow" size="wide" onClose={onClose}>
      <input className="input" placeholder={t('common.search')} value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 8 }} />
      {err ? <div className="message-bar error">{err}</div> : null}
      {!flows && !err ? (
        <div className="empty-state">
          <Spinner /> {t('data.loadingFlows')}
        </div>
      ) : null}
      <div className="dv-table-list">
        {list.map((f) => (
          <div key={f.id} className="dv-table">
            <Icon name="Flow" size={16} />
            <div className="dv-table-names">
              <b>{f.displayName}</b>
              <span className="muted small">
                <span className="mono">{f.callName}</span> · {f.isPowerApps ? t('data.powerAppsTrigger') : t('data.httpTrigger')} · {t('data.inputsList', { list: f.params.map((p) => p.name).join(', ') || t('data.none') })} ·{' '}
                {t('data.outputsList', { list: f.outputs.map((o) => o.name).join(', ') || t('data.none') })}
                {!f.active ? ` · ${t('data.flowDisabled')}` : ''}
              </span>
            </div>
            <button className="btn btn-sm" type="button" onClick={() => add(f)}>
              <Icon name="Add" size={14} /> {t('common.add')}
            </button>
          </div>
        ))}
        {flows && !list.length ? <div className="muted">{t('data.noFlowsFound')}</div> : null}
      </div>
    </Dialog>
  );
}
