'use client';
// Arborescence (navigation) : cliquer sur un élément le sélectionne dans le rendu et dans le YAML.
import { useEffect, useMemo, useState } from 'react';
import { useStudio } from './context';
import { PanelHeader } from './LeftRail';
import { Icon, useMenu, toast } from '@/components/common/ui';
import { useI18n } from '@/components/common/i18n';
import { controlDef } from '@/lib/catalog/controls';
import { parentLayout } from '@/lib/project/helpers';
import { findNode, controlsYaml, screenYaml, componentsYaml } from '@/lib/project/model';
import { copyText } from '@/lib/project/io';
import { iconForInsert } from './CommandBar';

/** Ordre d'affichage : les parents à disposition manuelle listent le premier plan en haut */
function displayChildren(node, isRoot) {
  const kids = node.children || [];
  if (isRoot) return [...kids].reverse();
  return parentLayout(node) === 'manual' ? [...kids].reverse() : kids;
}

function nodeIcon(node, kind) {
  if (kind === 'app') return 'Apps';
  if (kind === 'screen') return 'Screen';
  if (kind === 'component') return 'Component';
  const def = controlDef(node);
  if (def.id === 'GroupContainer') return /auto/i.test(node.head?.Variant || '') ? (String(node.properties?.LayoutDirection || '').includes('Vertical') ? 'VerticalContainer' : 'HorizontalContainer') : 'Container';
  if (def.id === 'CanvasComponent') return 'Component';
  return iconForInsert(def.icon);
}

function matches(node, q) {
  if (!q) return true;
  if (node.name.toLowerCase().includes(q)) return true;
  return (node.children || []).some((c) => matches(c, q));
}

export default function TreePanel() {
  const s = useStudio();
  const { t } = useI18n();
  const { project } = s;
  const [q, setQ] = useState('');
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [openMenu, menuEl] = useMenu();

  // Développe les ancêtres de la sélection
  useEffect(() => {
    if (!findNode(project, s.selectedId)) return;
    setCollapsed((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const id of ancestors(project, s.selectedId)) if (next.delete(id)) changed = true;
      return changed ? next : prev;
    });
    const el = document.querySelector(`.tree-row[data-id="${CSS.escape(s.selectedId)}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [s.selectedId, project]);

  const toggle = (id) =>
    setCollapsed((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const moveScreen = (id, dir) => {
    s.update((p) => {
      const i = p.screens.findIndex((x) => x._id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= p.screens.length) return p;
      const screens = [...p.screens];
      [screens[i], screens[j]] = [screens[j], screens[i]];
      return { ...p, screens };
    });
  };

  const nodeMenu = (e, node, kind) => {
    s.select(node._id);
    const yamlOf = () => (kind === 'screen' ? screenYaml(node) : kind === 'component' ? componentsYaml([node]) : controlsYaml([node]));
    openMenu(
      e,
      [
        { label: t('studio.showYaml'), icon: 'Code', onClick: () => s.select(node._id, { reveal: true }) },
        kind !== 'app' ? { label: t('studio.copyYaml'), icon: 'Copy', onClick: async () => toast((await copyText(yamlOf())) ? t('studio.yamlCopied') : t('common.copyFailed'), 'success') } : null,
        kind === 'control' || kind === 'screen'
          ? { label: t('studio.askAi'), icon: 'Sparkle', onClick: () => s.aiDraft(kind === 'screen' ? t('studio.aboutScreen', { name: node.name }) : t('studio.aboutControl', { name: node.name })) }
          : null,
        kind === 'screen' ? { sep: true } : null,
        kind === 'screen' ? { label: t('studio.duplicateScreen'), icon: 'Copy', onClick: () => s.addScreen({ duplicateOf: node._id }) } : null,
        kind === 'screen' ? { label: t('studio.moveScreenUp'), icon: 'ArrowUp', onClick: () => moveScreen(node._id, -1) } : null,
        kind === 'screen' ? { label: t('studio.moveScreenDown'), icon: 'ArrowDown', onClick: () => moveScreen(node._id, 1) } : null,
        kind === 'screen' ? { label: t('studio.deleteScreen'), icon: 'Delete', danger: true, onClick: () => s.deleteScreen(node._id) } : null,
      ],
      { atPointer: e.type === 'contextmenu' },
    );
  };

  const ql = q.trim().toLowerCase();

  const renderNode = (node, kind, depth) => {
    if (!matches(node, ql) && kind === 'control') return null;
    const kids = kind === 'app' ? [] : displayChildren(node, kind === 'screen' || kind === 'component');
    const hasKids = kids.length > 0;
    const open = !collapsed.has(node._id) || !!ql;
    const selected = s.selectedId === node._id;
    const hidden = node.properties?.Visible === '=false';
    const issues = s.issues.filter((i) => i.nodeId === node._id && i.severity === 'error').length;
    return (
      <div key={node._id} role="treeitem" aria-expanded={hasKids ? open : undefined} aria-selected={selected}>
        <div className={`tree-row${selected ? ' is-selected' : ''}`} data-id={node._id} style={{ paddingLeft: 8 + depth * 16 }} onClick={() => s.select(node._id)} onContextMenu={(e) => nodeMenu(e, node, kind)}>
          <button
            type="button"
            className={`tree-chevron${hasKids ? '' : ' invisible'}`}
            onClick={(e) => {
              e.stopPropagation();
              toggle(node._id);
            }}
            tabIndex={-1}
            aria-label={open ? t('studio.collapse') : t('studio.expand')}
          >
            <Icon name={open ? 'ChevronDown' : 'ChevronRight'} size={12} />
          </button>
          <Icon name={nodeIcon(node, kind)} size={16} className="tree-icon" />
          <span className={`tree-name${hidden ? ' is-hidden' : ''}`}>{node.name}</span>
          {kind === 'control' && node.head?.ComponentName ? <span className="tree-sub">{node.head.ComponentName}</span> : null}
          {issues ? <span className="badge error tree-badge">{issues}</span> : null}
          {hidden ? <Icon name="EyeOff" size={12} className="tree-hidden" /> : null}
          {kind !== 'app' ? (
            <button
              type="button"
              className="tree-more"
              onClick={(e) => {
                e.stopPropagation();
                nodeMenu(e, node, kind);
              }}
              aria-label={t('studio.moreActions')}
              tabIndex={-1}
            >
              <Icon name="More" size={14} />
            </button>
          ) : null}
        </div>
        {hasKids && open ? <div role="group">{kids.map((c) => renderNode(c, 'control', depth + 1))}</div> : null}
      </div>
    );
  };

  const screens = useMemo(() => project.screens.filter((sc) => matches(sc, ql)), [project.screens, ql]);
  const components = useMemo(() => (project.components || []).filter((c) => matches(c, ql)), [project.components, ql]);

  return (
    <div className="panel">
      <PanelHeader title={t('studio.treeView')} />
      <div className="panel-tools">
        <div className="search-box">
          <Icon name="Search" size={14} />
          <input placeholder={t('studio.searchControl')} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      <div className="tree" role="tree">
        {project.app ? renderNode(project.app, 'app', 0) : null}
        {screens.map((sc) => renderNode(sc, 'screen', 0))}
        {components.length ? <div className="tree-group">{t('studio.components')}</div> : null}
        {components.map((c) => renderNode(c, 'component', 0))}
      </div>
      {menuEl}
    </div>
  );
}

function ancestors(project, id) {
  const out = [];
  const visit = (nodes, path) => {
    for (const n of nodes || []) {
      if (n._id === id) {
        out.push(...path);
        return true;
      }
      if (visit(n.children, [...path, n._id])) return true;
    }
    return false;
  };
  for (const sc of [...project.screens, ...(project.components || [])]) if (visit(sc.children, [sc._id])) break;
  return out;
}
