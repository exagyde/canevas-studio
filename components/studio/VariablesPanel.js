'use client';
import { useState } from 'react';
import { useStudio } from './context';
import { PanelHeader } from './LeftRail';
import { Icon, Dialog } from '@/components/common/ui';
import { useI18n } from '@/components/common/i18n';
import { INTL_LOCALES } from '@/lib/i18n';
import { isRecord, FxColor, FxEnum, FxOption, FxControlRef, FxScreenRef } from '@/lib/fx/values';
import { describe as describeValue } from '@/lib/fx/evaluator';
import { text } from '@/lib/render/style';

/** Texte et type affichés pour une valeur Power Fx (t, locale : langue de l'interface) */
function previewValue(v, t, locale) {
  if (v === null || v === undefined) return { text: t('studio.blankValue'), type: 'Blank' };
  if (typeof v === 'string') return { text: JSON.stringify(v.length > 400 ? v.slice(0, 400) + '…' : v), type: t('studio.typeText') };
  if (typeof v === 'number') return { text: String(v), type: t('studio.typeNumber') };
  if (typeof v === 'boolean') return { text: String(v), type: t('studio.typeBoolean') };
  if (v instanceof Date) return { text: v.toLocaleString(INTL_LOCALES[locale]), type: t('studio.typeDateTime') };
  if (v instanceof FxColor) return { text: v.toFormula(), type: t('studio.typeColor'), color: v.toCss() };
  if (v instanceof FxEnum) return { text: `${v.ns}.${v.name}`, type: t('studio.typeEnum') };
  if (v instanceof FxOption) return { text: String(v.label), type: t('studio.typeChoice', { ns: v.ns }) };
  if (v instanceof FxControlRef) return { text: v.name, type: t('studio.typeControl') };
  if (v instanceof FxScreenRef) return { text: v.name, type: t('studio.typeScreen') };
  if (Array.isArray(v)) return { text: t('studio.rowsCount', { count: v.length }), type: t('studio.typeTable') };
  if (typeof v === 'object') return { text: `{ ${Object.keys(v).slice(0, 8).join(', ')} }`, type: t('studio.typeRecord') };
  return { text: describeValue(v), type: typeof v };
}

function ValueView({ value, onOpenTable }) {
  const { t, locale } = useI18n();
  const pv = previewValue(value, t, locale);
  return (
    <span className="var-value" title={pv.text}>
      {pv.color ? <span className="color-chip sm" style={{ background: pv.color }} /> : null}
      <span className="var-type">{pv.type}</span>
      {Array.isArray(value) ? (
        <button className="btn btn-sm btn-subtle" type="button" onClick={() => onOpenTable(value)}>
          {t('studio.rowsCount', { count: value.length })} <Icon name="Open" size={12} />
        </button>
      ) : isRecord(value) ? (
        <button className="btn btn-sm btn-subtle" type="button" onClick={() => onOpenTable([value])}>
          {t('studio.typeRecord')} <Icon name="Open" size={12} />
        </button>
      ) : (
        <span className="mono var-text">{pv.text}</span>
      )}
    </span>
  );
}

export function TableView({ rows }) {
  const cols = [...new Set(rows.slice(0, 200).flatMap((r) => (isRecord(r) ? Object.keys(r) : ['Value'])))].slice(0, 40);
  return (
    <div className="grid-wrap">
      <table className="data-grid">
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 500).map((r, i) => (
            <tr key={i}>
              {cols.map((c) => {
                const v = isRecord(r) ? r[c] : r;
                return <td key={c}>{Array.isArray(v) ? `[${v.length}]` : isRecord(v) ? (v.__lookup ? v.name || v.id : '{…}') : text(v)}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function VariablesPanel() {
  const s = useStudio();
  const { t } = useI18n();
  const { rt } = s;
  void s.rtVersion;
  const snap = rt.snapshotVariables();
  const [table, setTable] = useState(null);
  return (
    <div className="panel">
      <PanelHeader title={t('studio.variables')} />
      <div className="panel-tools">
        <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
          <button className="btn btn-sm" type="button" onClick={() => rt.runAppOnStart()}>
            <Icon name="Play" size={14} /> App.OnStart
          </button>
          <button className="btn btn-sm" type="button" onClick={() => s.screen && rt.runScreenBehavior(s.screen.name, 'OnVisible')}>
            <Icon name="Play" size={14} /> OnVisible
          </button>
          <button className="btn btn-sm" type="button" onClick={() => rt.resetState()}>
            <Icon name="ArrowSync" size={14} /> {t('studio.reset')}
          </button>
        </div>
      </div>
      <div className="panel-scroll">
        <section className="data-section">
          <h3>{t('studio.globalVariables', { count: snap.globals.length })}</h3>
          {snap.globals.map((g) => (
            <div key={g.name} className="var-row">
              <span className="var-name mono">{g.name}</span>
              <ValueView value={g.value} onOpenTable={(rows) => setTable({ title: g.name, rows })} />
            </div>
          ))}
          {!snap.globals.length ? <div className="muted small var-empty">{t('studio.noneSet')}</div> : null}
        </section>
        <section className="data-section">
          <h3>{t('studio.contextVariables', { count: snap.context.length })}</h3>
          {snap.context.map((g) => (
            <div key={`${g.screen}.${g.name}`} className="var-row">
              <span className="var-name mono" title={t('studio.screenTitle', { name: g.screen })}>
                {g.name}
                <span className="muted small"> · {g.screen}</span>
              </span>
              <ValueView value={g.value} onOpenTable={(rows) => setTable({ title: g.name, rows })} />
            </div>
          ))}
          {!snap.context.length ? <div className="muted small var-empty">{t('studio.noneUpdateContext')}</div> : null}
        </section>
        <section className="data-section">
          <h3>{t('studio.collections', { count: snap.collections.length })}</h3>
          {snap.collections.map((c) => (
            <div key={c.name} className="var-row">
              <span className="var-name mono">{c.name}</span>
              <ValueView value={c.rows} onOpenTable={(rows) => setTable({ title: c.name, rows })} />
            </div>
          ))}
          {!snap.collections.length ? <div className="muted small var-empty">{t('studio.noneCollect')}</div> : null}
        </section>
        <section className="data-section">
          <h3>{t('studio.runtimeDataSources')}</h3>
          {[...rt.registry.byName.values()].map((ds) => (
            <div key={ds.name} className="var-row">
              <span className="var-name mono">{ds.name}</span>
              <ValueView value={ds.rows} onOpenTable={(rows) => setTable({ title: ds.name, rows })} />
            </div>
          ))}
        </section>
      </div>
      {table ? (
        <Dialog title={table.title} size="xwide" onClose={() => setTable(null)}>
          <TableView rows={table.rows} />
        </Dialog>
      ) : null}
    </div>
  );
}
