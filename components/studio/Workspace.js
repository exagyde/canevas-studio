'use client';
// Espace de travail, en trois vues : Aperçu (rendu de l'écran), YAML (éditable) et Modifications
// (comparaison avec la version de référence importée depuis Power Apps).
// Le YAML est appliqué automatiquement dès qu'il est valide (petite pause de frappe) : l'aperçu est toujours à jour.
import { useEffect, useMemo, useRef, useState } from 'react';
import { EditorState, StateEffect, StateField, RangeSetBuilder } from '@codemirror/state';
import { EditorView, Decoration, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { foldGutter, foldKeymap, syntaxHighlighting, defaultHighlightStyle, bracketMatching, indentOnInput } from '@codemirror/language';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { linter, lintGutter, lintKeymap, forceLinting } from '@codemirror/lint';
import { yaml } from '@codemirror/lang-yaml';
import { useStudio } from './context';
import { Icon, toast } from '@/components/common/ui';
import { useI18n } from '@/components/common/i18n';
import { scopeYaml, findByName, keepIds, screenYaml, appYaml, componentsYaml, safeFileName } from '@/lib/project/model';
import { yamlDiagnostics } from '@/lib/validation/yamlDiagnostics';
import { findControlBlock, findPropertyLine, controlAtLine } from '@/lib/pa/yamlLocate';
import { copyText, downloadText } from '@/lib/project/io';
import DiffView, { DiffStats, computeDiff } from './DiffView';
import Canvas from './Canvas';
import StatusBar from './StatusBar';

const APPLY_DELAY_MS = 600;
/** Libellé d'une portée YAML autre qu'un écran ('app' ou 'components') */
const scopeLabel = (t, scope) => (scope === 'components' ? t('studio.components') : 'App');

// ---------------------------------------------------------------------------
// Mise en évidence du bloc sélectionné dans l'éditeur
// ---------------------------------------------------------------------------
const setHighlight = StateEffect.define();
const highlightField = StateField.define({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const e of tr.effects) {
      if (!e.is(setHighlight)) continue;
      if (!e.value) {
        deco = Decoration.none;
        continue;
      }
      const { from, to, prop } = e.value;
      const b = new RangeSetBuilder();
      const doc = tr.state.doc;
      for (let l = Math.max(1, from); l <= Math.min(to, doc.lines); l++) {
        const line = doc.line(l);
        b.add(line.from, line.from, Decoration.line({ class: l === prop ? 'cm-ws-block cm-ws-prop' : 'cm-ws-block' }));
      }
      deco = b.finish();
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

/** Remplace le texte en ne modifiant que la partie qui change (conserve défilement et curseur) */
function replaceDoc(view, text) {
  const cur = view.state.doc.toString();
  if (cur === text) return;
  let start = 0;
  while (start < cur.length && start < text.length && cur[start] === text[start]) start++;
  let endCur = cur.length;
  let endNew = text.length;
  while (endCur > start && endNew > start && cur[endCur - 1] === text[endNew - 1]) {
    endCur--;
    endNew--;
  }
  view.dispatch({ changes: { from: start, to: endCur, insert: text.slice(start, endNew) } });
}

/**
 * Applique le texte YAML à sa cible (écran, App ou composants).
 * @returns {{ error } | { project, source }} source : YAML normalisé correspondant au résultat
 */
function applyYaml(project, target, text, t) {
  const { parsed } = yamlDiagnostics(text, project, target.scope, target.screenId);
  if (parsed.errors.length) return { error: t('studio.lineError', { line: parsed.errors[0].line, message: parsed.errors[0].message }) };
  if (target.scope === 'screen') {
    if (parsed.screens.length !== 1) return { error: t('studio.yamlNeedsOneScreen') };
    const old = project.screens.find((x) => x._id === target.screenId);
    if (!old) return { error: t('studio.screenNotFound') };
    const ns = keepIds({ ...parsed.screens[0], _id: old._id }, old);
    if (project.screens.some((x) => x._id !== old._id && x.name === ns.name)) return { error: t('studio.screenNameTaken', { name: ns.name }) };
    return { project: { ...project, screens: project.screens.map((x) => (x._id === old._id ? ns : x)) }, source: screenYaml(ns) };
  }
  if (target.scope === 'app') {
    if (!parsed.app) return { error: t('studio.yamlNeedsApp') };
    const app = { ...parsed.app, _id: project.app?._id || parsed.app._id };
    return { project: { ...project, app }, source: appYaml(app) };
  }
  // composants : identifiants conservés par nom
  const components = parsed.components.map((c) => {
    const old = (project.components || []).find((x) => x.name === c.name);
    return old ? keepIds({ ...c, _id: old._id }, old) : c;
  });
  return { project: { ...project, components }, source: components.length ? componentsYaml(components) : 'ComponentDefinitions:\n' };
}

export default function Workspace() {
  const s = useStudio();
  const { t, rich, locale } = useI18n();
  const { project, screen, yamlScope: scope, view: tab } = s;
  // 'synced' (rendu à jour) | 'pending' (saisie en cours) | 'invalid' (YAML invalide, non appliqué)
  const [status, setStatus] = useState({ state: 'synced' });
  const [summary, setSummary] = useState({ error: 0, warning: 0, info: 0 });
  const hostRef = useRef(null);
  const viewRef = useRef(null);
  // cible des modifications en cours (fixée à la première frappe, jusqu'à ce qu'elles soient appliquées)
  const editTargetRef = useRef(null);
  // YAML produit par la dernière application automatique : le texte saisi n'est alors pas remplacé
  const selfAppliedRef = useRef(null);
  const applyTimer = useRef(null);
  const lastScrollRef = useRef(null);
  const stateRef = useRef({});

  const key = scope === 'screen' ? screen?._id : scope;
  const source = useMemo(() => {
    if (scope === 'app') return scopeYaml(project, 'app') || 'App:\n  Properties:\n    OnStart: =\n';
    if (scope === 'components') return scopeYaml(project, 'components') || 'ComponentDefinitions:\n';
    return screen ? scopeYaml(project, screen._id) : '';
  }, [scope, project, screen]);
  const currentTarget = { scope, screenId: screen?._id, key, label: scope === 'screen' ? screen?.name : scopeLabel(t, scope) };
  const target = editTargetRef.current || currentTarget;

  const baseline = key ? project.baselines?.[key] : null;
  const changes = useMemo(() => (baseline ? computeDiff(baseline.yaml, source) : null), [baseline, source]);

  /** Applique le texte de l'éditeur ; silent : erreurs affichées dans la barre (saisie) plutôt qu'en notification */
  const applyNow = (silent) => {
    clearTimeout(applyTimer.current);
    const view = viewRef.current;
    const { target: tg } = stateRef.current;
    if (!view || !tg.key) return;
    const text = view.state.doc.toString();
    const p = s.getProject();
    if (text === scopeYaml(p, tg.key)) {
      editTargetRef.current = null;
      setStatus({ state: 'synced' });
      return;
    }
    const r = applyYaml(p, tg, text, t);
    if (r.error) {
      setStatus({ state: 'invalid', error: r.error });
      if (!silent) toast(t('studio.yamlNotApplied', { error: r.error }), 'error');
      return;
    }
    selfAppliedRef.current = r.source;
    s.update(r.project, { coalesce: `yaml:${tg.key}` });
    editTargetRef.current = null;
    setStatus({ state: 'synced' });
  };
  stateRef.current = { project, target, source, select: s.select, selectedId: s.selectedId, applyNow };

  // ---------------------------------------------------------------- éditeur
  useEffect(() => {
    const lint = linter(
      (view) => {
        const { project: p, target: t } = stateRef.current;
        const r = yamlDiagnostics(view.state.doc.toString(), p, t.scope, t.screenId);
        const sum = { error: 0, warning: 0, info: 0 };
        for (const d of r.diagnostics) sum[d.severity] = (sum[d.severity] || 0) + 1;
        setSummary(sum);
        return r.diagnostics;
      },
      { delay: 400 },
    );
    let cursorTimer = null;
    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: stateRef.current.source,
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          foldGutter(),
          history(),
          drawSelection(),
          indentOnInput(),
          bracketMatching(),
          highlightActiveLine(),
          highlightSelectionMatches(),
          syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
          yaml(),
          lint,
          lintGutter(),
          highlightField,
          EditorState.tabSize.of(2),
          keymap.of([
            {
              key: 'Mod-s',
              run: () => {
                stateRef.current.applyNow(false);
                return true;
              },
            },
            ...defaultKeymap,
            ...historyKeymap,
            ...foldKeymap,
            ...searchKeymap,
            ...lintKeymap,
            indentWithTab,
          ]),
          EditorView.updateListener.of((u) => {
            // saisie : application automatique après une courte pause
            if (u.docChanged && u.transactions.some((tr) => tr.isUserEvent('input') || tr.isUserEvent('delete') || tr.isUserEvent('move') || tr.isUserEvent('undo') || tr.isUserEvent('redo'))) {
              if (!editTargetRef.current) editTargetRef.current = stateRef.current.target;
              setStatus({ state: 'pending' });
              clearTimeout(applyTimer.current);
              applyTimer.current = setTimeout(() => stateRef.current.applyNow(true), APPLY_DELAY_MS);
            }
            // le curseur dans le YAML sélectionne le contrôle correspondant dans le rendu
            if (u.selectionSet && u.view.hasFocus) {
              clearTimeout(cursorTimer);
              cursorTimer = setTimeout(() => {
                const st = u.view.state;
                const name = controlAtLine(st.doc.toString(), st.doc.lineAt(st.selection.main.head).number);
                const { project: p, select, selectedId } = stateRef.current;
                const f = name ? findByName(p, name) : null;
                if (f && f.node._id !== selectedId) select(f.node._id, { origin: 'yaml' });
              }, 150);
            }
          }),
          EditorView.theme({
            '&': { height: '100%', fontSize: '13px' },
            '.cm-scroller': { fontFamily: 'var(--mono)', lineHeight: '1.5' },
            '.cm-gutters': { backgroundColor: '#fafafa', borderRight: '1px solid #e0e0e0' },
          }),
        ],
      }),
    });
    viewRef.current = view;
    return () => {
      clearTimeout(cursorTimer);
      clearTimeout(applyTimer.current);
      view.destroy();
    };
  }, []);

  // Recharge le texte quand le projet change ailleurs (assistant IA, annulation, autre écran…)
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (selfAppliedRef.current !== null && source === selfAppliedRef.current) {
      // résultat de notre propre application : on garde le texte tel que saisi
      selfAppliedRef.current = null;
      forceLinting(view);
      return;
    }
    selfAppliedRef.current = null;
    if (!editTargetRef.current) {
      replaceDoc(view, source);
      setStatus({ state: 'synced' });
    }
    forceLinting(view);
  }, [source]);

  // Diagnostics traduits par lib/ : recalculés au changement de langue
  useEffect(() => {
    if (viewRef.current) forceLinting(viewRef.current);
  }, [locale]);

  // Bloc du contrôle sélectionné (aperçu, arborescence, vérificateur…) : surligné, et affiché
  // à l'ouverture de la vue YAML ou à chaque nouvelle sélection faite ailleurs que dans l'éditeur
  const fr = s.focusRequest;
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const f = fr && fr.id === s.selectedId ? fr : null;
    const text = view.state.doc.toString();
    const block = f?.kind === 'control' ? findControlBlock(text, f.name) : null;
    const propLine = f?.property ? findPropertyLine(text, f.kind === 'control' ? f.name : null, f.property) : null;
    view.dispatch({ effects: setHighlight.of(block ? { ...block, prop: propLine } : propLine ? { from: propLine, to: propLine, prop: propLine } : null) });
    const scrollKey = `${f?.tick}|${tab}`;
    if (tab !== 'yaml' || !f || f.origin === 'yaml' || lastScrollRef.current === scrollKey) return;
    lastScrollRef.current = scrollKey;
    const line = propLine || block?.from;
    if (!line) return;
    const pos = view.state.doc.line(line).from;
    // la vue vient peut-être d'être affichée : défilement après la mesure de l'éditeur
    requestAnimationFrame(() => view.dispatch({ selection: propLine ? { anchor: pos } : undefined, effects: EditorView.scrollIntoView(pos, { y: 'start', yMargin: 60 }) }));
  }, [fr?.tick, s.selectedId, source, tab]);

  /** Change de vue ; en quittant le YAML, les modifications en cours sont appliquées */
  const switchView = (v) => {
    if (tab === 'yaml' && v !== 'yaml' && editTargetRef.current) {
      applyNow(true);
      if (editTargetRef.current) toast(t('studio.yamlErrorNotApplied'), 'warning', { timeout: 6000 });
    }
    s.setView(v);
  };

  const revert = () => {
    clearTimeout(applyTimer.current);
    editTargetRef.current = null;
    selfAppliedRef.current = null;
    setStatus({ state: 'synced' });
    replaceDoc(viewRef.current, source);
  };

  const otherTarget = status.state !== 'synced' && editTargetRef.current && editTargetRef.current.key !== key ? editTargetRef.current : null;
  const scopeValue = scope === 'screen' ? `s:${screen?._id || ''}` : scope;
  const locked = status.state === 'invalid';

  return (
    <div className="workspace">
      <div className="ws-toolbar">
        <div className="segmented ws-views" data-tour="views">
          <button type="button" className={tab === 'preview' ? 'is-active' : ''} onClick={() => switchView('preview')} title={t('studio.previewTabTitle')}>
            <Icon name="Screen" size={14} /> {t('studio.preview')}
          </button>
          <button type="button" className={tab === 'yaml' ? 'is-active' : ''} onClick={() => switchView('yaml')} title={t('studio.yamlTabTitle')}>
            <Icon name="Code" size={14} /> YAML
          </button>
          <button type="button" className={tab === 'changes' ? 'is-active' : ''} onClick={() => switchView('changes')} title={t('studio.changesTabTitle')}>
            <Icon name="Columns" size={14} /> {t('studio.changes')} {changes?.stats.changed ? <DiffStats stats={changes.stats} /> : null}
          </button>
        </div>
        <select
          className="select sm ws-scope"
          value={scopeValue}
          disabled={locked}
          title={locked ? t('studio.fixOrRevertFirst') : t('studio.displayedScreen')}
          onChange={(e) => {
            const v = e.target.value;
            if (v.startsWith('s:')) s.select(v.slice(2));
            else s.showYaml(v);
          }}
        >
          <optgroup label={t('studio.screens')}>
            {project.screens.map((sc) => (
              <option key={sc._id} value={`s:${sc._id}`}>
                {sc.name}
              </option>
            ))}
          </optgroup>
          <optgroup label={t('studio.application')}>
            <option value="app">App (OnStart, Formulas…)</option>
            {project.components?.length ? <option value="components">{t('studio.componentsWithCount', { count: project.components.length })}</option> : null}
          </optgroup>
        </select>
        {tab === 'yaml' ? (
          <span className="yaml-summary">
            {status.state === 'invalid' ? (
              <span className="sev-error" title={status.error}>
                <Icon name="Error" size={14} /> {t('studio.notAppliedInvalid')}
              </span>
            ) : status.state === 'pending' ? (
              <span className="muted">
                <span className="spinner" /> {t('studio.updating')}
              </span>
            ) : summary.error ? (
              <span className="sev-error">
                <Icon name="Error" size={14} /> {t('studio.errorsCount', { count: summary.error })}
              </span>
            ) : summary.warning ? (
              <span className="sev-warning">
                <Icon name="Warning" size={14} /> {t('studio.warningsCount', { count: summary.warning })}
              </span>
            ) : (
              <span className="sev-ok">
                <Icon name="CheckmarkCircle" size={14} /> {t('studio.yamlValid')}
              </span>
            )}
          </span>
        ) : tab === 'preview' ? (
          <span className="muted small ws-hint">{t('studio.doubleClickHint')}</span>
        ) : null}
        <span className="spacer" />
        {tab === 'yaml' && status.state === 'invalid' ? (
          <button className="btn btn-sm" type="button" onClick={revert} title={t('studio.revertTitle')}>
            {t('studio.revert')}
          </button>
        ) : null}
        {tab !== 'preview' ? (
          <>
            <button className="icon-btn" type="button" title={t('studio.copyYaml')} onClick={async () => toast((await copyText(viewRef.current.state.doc.toString())) ? t('studio.yamlCopied') : t('common.copyFailed'), 'success')}>
              <Icon name="Copy" size={16} />
            </button>
            <button className="icon-btn" type="button" title={t('studio.downloadYaml')} onClick={() => downloadText(viewRef.current.state.doc.toString(), `${safeFileName(target.label || t('project.defaultFileName'))}.pa.yaml`)}>
              <Icon name="ArrowDownload" size={16} />
            </button>
          </>
        ) : null}
      </div>
      <div className="ws-body">
        <div className="ws-pane" hidden={tab !== 'yaml'}>
          {otherTarget ? (
            <div className="message-bar warning ws-banner">
              <Icon name="Warning" size={16} />
              <div>
                {rich(
                  'studio.otherTargetInvalid',
                  { label: otherTarget.label, target: scope === 'screen' ? t('studio.theScreen', { name: screen?.name }) : scopeLabel(t, scope) },
                  { b: (c) => <b>{c}</b> },
                )}
              </div>
            </div>
          ) : null}
          <div className="yaml-editor" ref={hostRef} />
        </div>
        {tab === 'changes' ? (
          <div className="ws-pane">
            <ChangesView label={scope === 'screen' ? t('studio.theScreen', { name: screen?.name }) : scopeLabel(t, scope)} baseline={baseline} changes={changes} onSetBaseline={() => key && s.setBaseline(key)} />
          </div>
        ) : null}
        {tab === 'preview' ? (
          <div className="ws-pane ws-render">
            <div className="center-main">{s.mode === 'preview' ? <div className="canvas-viewport" /> : <Canvas />}</div>
            <StatusBar />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ChangesView({ label, baseline, changes, onSetBaseline }) {
  const { t, rich, formatDate } = useI18n();
  const at = baseline ? formatDate(baseline.at, { dateStyle: 'short', timeStyle: 'short' }) : '';
  return (
    <div className="ws-changes">
      <div className="ws-changes-head">
        <div>
          {rich('studio.changesSince', { label, at }, { b: (c) => <b>{c}</b> })}
          {changes?.stats.changed ? (
            <>
              {' '}
              · <DiffStats stats={changes.stats} />
            </>
          ) : null}
        </div>
        <span className="spacer" />
        <button className="btn btn-sm" type="button" onClick={onSetBaseline} disabled={!changes?.stats.changed} title={t('studio.setBaselineTitle')}>
          <Icon name="CheckmarkCircle" size={14} /> {t('studio.setBaseline')}
        </button>
      </div>
      <p className="muted small ws-changes-hint">{t('studio.changesHint')}</p>
      <div className="ws-changes-body">
        {changes ? <DiffView ops={changes.ops} emptyText={t('studio.noChangesSinceBaseline')} /> : <div className="diff-empty">{t('studio.creatingBaseline')}</div>}
      </div>
    </div>
  );
}
