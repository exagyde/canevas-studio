'use client';
import { useMemo, useState } from 'react';
import { useStudio } from './context';
import { PanelHeader } from './LeftRail';
import { Icon } from '@/components/common/ui';
import { useI18n } from '@/components/common/i18n';

const SEV_ICON = { error: 'Error', warning: 'Warning', info: 'Info' };
const SEV_LABEL = { error: (t) => t('studio.filterErrors'), warning: (t) => t('studio.filterWarnings'), info: (t) => t('studio.filterInfos') };

export default function IssuesPanel() {
  const s = useStudio();
  const { t } = useI18n();
  const [filter, setFilter] = useState({ error: true, warning: true, info: false });
  const [scope, setScope] = useState('screen');
  const rootId = s.screen?._id;
  const runtime = [...s.rt.runtimeErrors.values()];
  void s.rtVersion;
  const list = useMemo(
    () => s.issues.filter((i) => filter[i.severity] && (scope === 'all' || i.screenId === rootId || i.screenName === 'App')),
    [s.issues, filter, scope, rootId],
  );
  const groups = useMemo(() => {
    const m = new Map();
    for (const i of list) {
      const k = i.screenName || t('studio.projectGroup');
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(i);
    }
    return [...m.entries()];
  }, [list, t]);
  const sum = s.issueSummary;

  const askAi = () => {
    s.setAiOpen(true);
    const lines = s.issues
      .filter((i) => i.screenId === s.screen?._id && i.severity !== 'info')
      .slice(0, 40)
      .map((i) => t('studio.fixIssuesLine', { target: `${i.controlName}${i.property ? `.${i.property}` : ''}`, message: i.message }))
      .join('\n');
    s.aiDraft?.(t('studio.fixIssuesPrompt', { name: s.screen?.name, list: lines }));
  };

  return (
    <div className="panel">
      <PanelHeader title={t('studio.appChecker')} />
      <div className="panel-tools">
        <div className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
          {['error', 'warning', 'info'].map((k) => (
            <button key={k} type="button" className={`chip-toggle${filter[k] ? ' is-on' : ''}`} onClick={() => setFilter((f) => ({ ...f, [k]: !f[k] }))}>
              <Icon name={SEV_ICON[k]} size={14} className={`sev-${k}`} />
              {SEV_LABEL[k](t)} ({sum[k]})
            </button>
          ))}
        </div>
        <div className="segmented" style={{ marginTop: 6 }}>
          <button type="button" className={scope === 'screen' ? 'is-active' : ''} onClick={() => setScope('screen')}>
            {t('studio.currentScreen')}
          </button>
          <button type="button" className={scope === 'all' ? 'is-active' : ''} onClick={() => setScope('all')}>
            {t('studio.wholeApp')}
          </button>
        </div>
        {sum.error + sum.warning > 0 ? (
          <button className="btn btn-sm" type="button" style={{ marginTop: 6 }} onClick={askAi}>
            <Icon name="Sparkle" size={14} /> {t('studio.fixWithAi')}
          </button>
        ) : null}
      </div>
      <div className="panel-scroll">
        {!list.length ? (
          <div className="empty-state">
            <Icon name="CheckmarkCircle" size={32} className="sev-ok" />
            {scope === 'screen' ? t('studio.noIssuesScreen') : t('studio.noIssuesApp')}
          </div>
        ) : null}
        {groups.map(([screenName, items]) => (
          <section key={screenName} className="data-section">
            <h3>
              {screenName} ({items.length})
            </h3>
            {items.map((i, k) => (
              <button key={k} type="button" className="issue-item" onClick={() => i.nodeId && s.select(i.nodeId, { property: i.property || null, reveal: true })}>
                <Icon name={SEV_ICON[i.severity]} size={16} className={`sev-${i.severity}`} />
                <div className="issue-body">
                  <div className="issue-where">
                    <b>{i.controlName}</b>
                    {i.property ? <span className="mono">.{i.property}</span> : null}
                  </div>
                  <div className="issue-msg">{i.message}</div>
                </div>
              </button>
            ))}
          </section>
        ))}
        {runtime.length ? (
          <section className="data-section">
            <h3>{t('studio.runtimeErrors', { count: runtime.length })}</h3>
            {runtime.slice(0, 100).map((e, k) => (
              <button key={k} type="button" className="issue-item" onClick={() => s.select(e.nodeId, { property: e.prop, reveal: true })}>
                <Icon name="Warning" size={16} className="sev-warning" />
                <div className="issue-body">
                  <div className="issue-where">
                    <b>{e.control}</b>
                    <span className="mono">.{e.prop}</span>
                  </div>
                  <div className="issue-msg">{e.message}</div>
                </div>
              </button>
            ))}
          </section>
        ) : null}
      </div>
    </div>
  );
}
