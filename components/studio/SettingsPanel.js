'use client';
import { useState } from 'react';
import { useStudio } from './context';
import { PanelHeader } from './LeftRail';
import { Icon, Switch } from '@/components/common/ui';
import { useI18n } from '@/components/common/i18n';
import { INTL_LOCALES } from '@/lib/i18n';
import { TextInputCommit, NumberInput } from './editors';

export default function SettingsPanel() {
  const s = useStudio();
  const { t, rich, locale } = useI18n();
  const { project } = s;
  const st = project.settings || {};
  const kbd = { kbd: (c) => <kbd>{c}</kbd> };
  const set = (patch) => s.update((p) => ({ ...p, settings: { ...p.settings, ...patch } }), { coalesce: 'settings' });
  const [paramKey, setParamKey] = useState('');
  const [paramVal, setParamVal] = useState('');
  return (
    <div className="panel">
      <PanelHeader title={t('studio.settings')} />
      <div className="panel-scroll settings">
        <section className="data-section">
          <h3>{t('studio.application')}</h3>
          <div className="field pad">
            <label>{t('studio.projectName')}</label>
            <TextInputCommit value={project.name} onCommit={(v) => s.update((p) => ({ ...p, name: v || p.name }))} />
          </div>
          <div className="field-row pad">
            <div className="field" style={{ flex: 1 }}>
              <label>{t('studio.screenWidth')}</label>
              <NumberInput value={st.width} onCommit={(v) => v && set({ width: Math.max(200, Math.round(v)) })} />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>{t('studio.screenHeight')}</label>
              <NumberInput value={st.height} onCommit={(v) => v && set({ height: Math.max(200, Math.round(v)) })} />
            </div>
          </div>
          {/* langue de l'application émulée (Language(), Text()…), distincte de la langue de l'interface */}
          <div className="field pad" title={t('studio.appLocaleHint')}>
            <label>{t('studio.appLocale')}</label>
            <select className="select sm" value={st.locale || INTL_LOCALES[locale]} onChange={(e) => set({ locale: e.target.value })}>
              {['fr-FR', 'en-US', 'en-GB', 'de-DE', 'es-ES', 'it-IT', 'nl-NL', 'pt-BR'].map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div className="pad" style={{ marginBottom: 12 }}>
            <Switch checked={st.runOnStartInPreview !== false} onChange={(v) => set({ runOnStartInPreview: v })} label={t('studio.runOnStartInPreview')} />
          </div>
          <div className="pad" style={{ marginBottom: 12 }}>
            <button className="btn btn-sm" type="button" onClick={() => s.showYaml('app')}>
              <Icon name="Apps" size={14} /> {t('studio.showAppYaml')}
            </button>
          </div>
        </section>
        <section className="data-section">
          <h3>{t('studio.mockUser')}</h3>
          <div className="field pad">
            <label>{t('studio.fullName')}</label>
            <TextInputCommit value={st.user?.FullName || ''} onCommit={(v) => set({ user: { ...st.user, FullName: v } })} />
          </div>
          <div className="field pad">
            <label>{t('studio.email')}</label>
            <TextInputCommit value={st.user?.Email || ''} onCommit={(v) => set({ user: { ...st.user, Email: v } })} />
          </div>
        </section>
        <section className="data-section">
          <h3>{t('studio.mdfIntegration')}</h3>
          <p className="muted small pad">{rich('studio.mdfItemIdHint', { formula: 'First([@ModelDrivenFormIntegration].Data).ItemId' }, { code: (c) => <code>{c}</code> })}</p>
          <div className="field pad">
            <TextInputCommit className="input sm mono" value={st.mdfItemId || ''} placeholder="00000000-0000-0000-0000-000000000000" onCommit={(v) => set({ mdfItemId: v.trim() })} />
          </div>
        </section>
        <section className="data-section">
          <h3>{t('studio.urlParams')}</h3>
          {Object.entries(st.params || {}).map(([k, v]) => (
            <div key={k} className="var-row">
              <span className="var-name mono">{k}</span>
              <span className="mono small">{v}</span>
              <button
                className="icon-btn sm"
                type="button"
                onClick={() => {
                  const p = { ...(st.params || {}) };
                  delete p[k];
                  set({ params: p });
                }}
                aria-label={t('common.delete')}
              >
                <Icon name="Delete" size={12} />
              </button>
            </div>
          ))}
          <div className="row pad" style={{ marginBottom: 12 }}>
            <input className="input sm" placeholder={t('studio.paramName')} value={paramKey} onChange={(e) => setParamKey(e.target.value)} />
            <input className="input sm" placeholder={t('studio.paramValue')} value={paramVal} onChange={(e) => setParamVal(e.target.value)} />
            <button
              className="btn btn-sm"
              type="button"
              disabled={!paramKey}
              onClick={() => {
                set({ params: { ...(st.params || {}), [paramKey]: paramVal } });
                setParamKey('');
                setParamVal('');
              }}
            >
              {t('common.add')}
            </button>
          </div>
        </section>
        <section className="data-section">
          <h3>{t('studio.shortcuts')}</h3>
          <ul className="shortcuts small">
            <li>{rich('studio.shortcutPreview', null, kbd)}</li>
            <li>{rich('studio.shortcutAltClick', null, kbd)}</li>
            <li>{rich('studio.shortcutCopyPaste', null, kbd)}</li>
            <li>{rich('studio.shortcutDuplicateDelete', null, kbd)}</li>
            <li>{rich('studio.shortcutUndoRedo', null, kbd)}</li>
            <li>{rich('studio.shortcutArrows', null, kbd)}</li>
            <li>{rich('studio.shortcutCommitFormula', null, kbd)}</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
