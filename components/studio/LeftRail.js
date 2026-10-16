'use client';
import { useStudio } from './context';
import { Icon } from '@/components/common/ui';
import { useI18n } from '@/components/common/i18n';
import TreePanel from './TreePanel';
import DataPanel from './DataPanel';
import FlowsPanel from './FlowsPanel';
import VariablesPanel from './VariablesPanel';
import IssuesPanel from './IssuesPanel';
import SettingsPanel from './SettingsPanel';

// libellés traduits au rendu
const ITEMS = [
  { id: 'tree', icon: 'Layers', label: (t) => t('studio.treeView') },
  { id: 'data', icon: 'Database', label: (t) => t('studio.data') },
  { id: 'flows', icon: 'Flow', label: (t) => t('studio.flowsAndActions') },
  { id: 'variables', icon: 'Variable', label: (t) => t('studio.variables') },
  { id: 'issues', icon: 'Stethoscope', label: (t) => t('studio.appChecker') },
];

const PANELS = {
  tree: TreePanel,
  data: DataPanel,
  flows: FlowsPanel,
  variables: VariablesPanel,
  issues: IssuesPanel,
  settings: SettingsPanel,
};

export default function LeftRail() {
  const s = useStudio();
  const { t } = useI18n();
  const Panel = s.leftPanel ? PANELS[s.leftPanel] : null;
  const errors = s.issueSummary.error;
  return (
    <>
      <nav className="rail" aria-label={t('studio.panes')}>
        {ITEMS.map((it) => (
          <button
            key={it.id}
            type="button"
            className={`rail-btn${s.leftPanel === it.id ? ' is-active' : ''}`}
            title={it.label(t)}
            aria-label={it.label(t)}
            onClick={() => s.setLeftPanel(s.leftPanel === it.id ? null : it.id)}
          >
            <Icon name={it.icon} size={20} />
            {it.id === 'issues' && errors ? <span className="rail-dot" /> : null}
          </button>
        ))}
        <span className="spacer" />
        <button type="button" className={`rail-btn${s.leftPanel === 'settings' ? ' is-active' : ''}`} title={t('studio.settings')} aria-label={t('studio.settings')} onClick={() => s.setLeftPanel(s.leftPanel === 'settings' ? null : 'settings')}>
          <Icon name="Settings" size={20} />
        </button>
      </nav>
      {Panel ? (
        <aside className="left-panel">
          <Panel />
        </aside>
      ) : null}
    </>
  );
}

export function PanelHeader({ title, children, onClose }) {
  const s = useStudio();
  const { t } = useI18n();
  return (
    <div className="panel-header">
      <h2>{title}</h2>
      <span className="spacer" />
      {children}
      <button className="icon-btn" type="button" onClick={onClose || (() => s.setLeftPanel(null))} aria-label={t('studio.closePane')}>
        <Icon name="Cancel" />
      </button>
    </div>
  );
}
