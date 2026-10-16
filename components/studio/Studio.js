'use client';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { StudioContext, useProjectStore } from './context';
import { Toasts, toast, Icon } from '@/components/common/ui';
import { useI18n } from '@/components/common/i18n';
import { INTL_LOCALES } from '@/lib/i18n';
import { loadProject, saveProject } from '@/lib/storage/db';
import { Runtime } from '@/lib/runtime/runtime';
import { validateProject, summarize } from '@/lib/validation/validate';
import { findNode, insertControls, cloneWithNewIds, applyRenames, allNames, uniqueName, newScreen, screenYaml, controlsYaml, componentsYaml, appYaml, scopeYaml, mergeParsed } from '@/lib/project/model';
import { parsePaYaml } from '@/lib/pa/yaml';
import { insertionTarget, parentLayout } from '@/lib/project/helpers';
import { copyText } from '@/lib/project/io';
import CommandBar from './CommandBar';
import LeftRail from './LeftRail';
import Canvas from './Canvas';
import AiPanel from './AiPanel';
import Workspace from './Workspace';
import { callExternalHttp, refreshDataverseSource } from './externals';
import Tour from '@/components/help/Tour';
import { GuideDialog, onboardingSeen, markOnboardingSeen } from '@/components/help/Guide';
import { STUDIO_TOUR } from '@/lib/help/tour';

export default function Studio({ projectId }) {
  const { t } = useI18n();
  const [initial, setInitial] = useState(undefined);
  useEffect(() => {
    let alive = true;
    loadProject(projectId)
      .then((p) => alive && setInitial(p || null))
      .catch(() => alive && setInitial(null));
    return () => {
      alive = false;
    };
  }, [projectId]);
  if (initial === undefined)
    return (
      <div className="studio-loading">
        <span className="spinner" /> {t('studio.loadingProject')}
      </div>
    );
  if (initial === null)
    return (
      <div className="studio-loading">
        <Icon name="Warning" size={24} /> {t('studio.projectNotFound')}{' '}
        <a href="/" className="btn">
          {t('studio.backToApps')}
        </a>
      </div>
    );
  return <StudioInner initial={initial} />;
}

function StudioInner({ initial }) {
  const { t, locale } = useI18n();
  // traduction à jour dans les rappels différés (sauvegarde auto) sans relancer leurs effets
  const tRef = useRef(t);
  tRef.current = t;
  const router = useRouter();
  const store = useProjectStore(initial);
  const { project, update } = store;
  const [chat, setChat] = useState(initial.chat?.messages || []);

  // ---------------------------------------------------------------- runtime
  const rtRef = useRef(null);
  if (!rtRef.current) {
    rtRef.current = new Runtime();
    rtRef.current.setProject(initial, { silent: true });
  }
  const rt = rtRef.current;
  rt.setProject(project, { silent: true });
  useEffect(() => rt.followLocale(), [rt]);
  const rtVersion = useSyncExternalStore(
    useCallback((cb) => rt.subscribe(cb), [rt]),
    () => rt.version,
    () => 0,
  );

  // ---------------------------------------------------------------- sélection & vues
  const [screenId, setScreenId] = useState(initial.screens[0]?._id || null);
  const [selectedId, setSelectedId] = useState(initial.screens[0]?._id || null);
  // Contenu de l'éditeur YAML : 'screen' (écran courant), 'app' ou 'components'
  const [yamlScope, setYamlScope] = useState('screen');
  // Dernière demande de mise en évidence dans le YAML : { id, property, origin, tick }
  const [focusRequest, setFocusRequest] = useState(null);
  // Vue centrale : 'preview' (aperçu de l'écran), 'yaml' ou 'changes' (comparaison avec la référence)
  const [view, setView] = useState('preview');
  const [leftPanel, setLeftPanel] = useState(null);
  const [aiOpen, setAiOpen] = useState(true);
  // Prise en main : guide (bouton « ? ») et visite guidée (lancée à la première ouverture d'un projet)
  const [guideOpen, setGuideOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  useEffect(() => {
    if (onboardingSeen('tour')) return undefined;
    const timer = setTimeout(() => setTourOpen(true), 600);
    return () => clearTimeout(timer);
  }, []);
  const [aiPending, setAiPending] = useState(null);
  const [mode, setMode] = useState('edit');
  const [zoom, setZoom] = useState(null); // null = ajuster
  const [fitZoom, setFitZoom] = useState(1);
  const [saveState, setSaveState] = useState('saved');

  const screen = project.screens.find((s) => s._id === screenId) || project.screens[0] || null;
  const selection = useMemo(() => findNode(project, selectedId) || (screen ? { node: screen, screen, kind: 'screen' } : null), [project, selectedId, screen]);

  // écran actif du runtime (mode conception)
  useEffect(() => {
    if (mode === 'edit' && screen && rt.activeScreen !== screen.name) {
      rt.activeScreen = screen.name;
      rt.bump();
    }
  }, [mode, screen, rt]);

  // Si l'écran courant disparaît
  useEffect(() => {
    if (!project.screens.some((s) => s._id === screenId) && project.screens[0]) {
      setScreenId(project.screens[0]._id);
      setSelectedId(project.screens[0]._id);
    }
  }, [project.screens, screenId]);

  // Version de référence de chaque écran, de l'App et des composants (pour l'onglet Modifications)
  useEffect(() => {
    const now = new Date().toISOString();
    const missing = {};
    for (const key of [...project.screens.map((s) => s._id), 'app', 'components']) {
      if (!project.baselines?.[key]) missing[key] = { yaml: scopeYaml(project, key), at: now };
    }
    if (Object.keys(missing).length) update((p) => ({ ...p, baselines: { ...(p.baselines || {}), ...missing } }), { history: false });
  }, [project, update]);

  const setBaseline = useCallback(
    (key) => update((p) => ({ ...p, baselines: { ...(p.baselines || {}), [key]: { yaml: scopeYaml(p, key), at: new Date().toISOString() } } })),
    [update],
  );

  /**
   * Sélectionne un élément : écran affiché, contenu du YAML et mise en évidence de son bloc.
   * opts.property : ligne de propriété à viser ; opts.origin : 'yaml' quand la sélection vient de l'éditeur ;
   * opts.reveal : affiche la vue YAML sur ce bloc.
   */
  const select = useCallback(
    (id, opts = {}) => {
      const p = store.getProject();
      const f = findNode(p, id);
      if (!f) return;
      setSelectedId(id);
      if (f.kind === 'app') setYamlScope('app');
      else if ((p.components || []).some((c) => c._id === f.screen?._id)) setYamlScope('components');
      else if (f.screen) {
        setScreenId(f.screen._id);
        setYamlScope('screen');
      }
      setFocusRequest({ id, name: f.node.name, kind: f.kind, property: opts.property || null, origin: opts.origin || null, tick: Date.now() });
      if (opts.reveal) setView('yaml');
    },
    [store],
  );

  // ---------------------------------------------------------------- crochets du runtime
  useEffect(() => {
    rt.hooks.onNavigate = (name) => {
      const s = store.getProject().screens.find((x) => x.name === name);
      if (s) {
        setScreenId(s._id);
        if (rt.mode === 'edit') setSelectedId(s._id);
      }
    };
    rt.hooks.onExternalHttp = (def, input) => callExternalHttp(store.getProject(), def, input);
    rt.hooks.onRefresh = (ds) => refreshDataverseSource(store.getProject(), ds, rt);
  }, [rt, store]);

  // ---------------------------------------------------------------- validation
  const deferredProject = useDeferredValue(project);
  // messages traduits par le vérificateur : recalculés au changement de langue
  const issues = useMemo(() => validateProject(deferredProject), [deferredProject, locale]);
  const issueSummary = useMemo(() => summarize(issues), [issues]);

  // ---------------------------------------------------------------- sauvegarde auto
  const firstSave = useRef(true);
  useEffect(() => {
    if (firstSave.current) {
      firstSave.current = false;
      return;
    }
    setSaveState('dirty');
    const timer = setTimeout(() => {
      setSaveState('saving');
      saveProject({ ...project, chat: { messages: chat } })
        .then(() => setSaveState('saved'))
        .catch((e) => {
          const t = tRef.current;
          setSaveState('error');
          toast(t('studio.saveFailed', { message: e.message }), 'error');
        });
    }, 700);
    return () => clearTimeout(timer);
  }, [project, chat]);

  // ---------------------------------------------------------------- écrans
  const addScreen = useCallback(
    (opts = {}) => {
      const p = store.getProject();
      const taken = allNames(p);
      let s;
      if (opts.duplicateOf) {
        const src = p.screens.find((x) => x._id === opts.duplicateOf);
        const map = new Map();
        s = cloneWithNewIds(src, taken, map);
        s = applyRenames(s, map);
      } else {
        s = newScreen(uniqueName(opts.name || 'Screen1', taken));
      }
      update((pp) => {
        const idx = pp.screens.findIndex((x) => x._id === screenId);
        const screens = [...pp.screens];
        screens.splice(idx + 1, 0, s);
        return { ...pp, screens };
      });
      setScreenId(s._id);
      setSelectedId(s._id);
      setYamlScope('screen');
      return s;
    },
    [store, update, screenId],
  );

  const deleteScreen = useCallback(
    (id) => {
      const p = store.getProject();
      if (p.screens.length <= 1) {
        toast(t('studio.cannotDeleteLastScreen'), 'warning');
        return;
      }
      update((pp) => {
        const baselines = { ...(pp.baselines || {}) };
        delete baselines[id];
        return { ...pp, screens: pp.screens.filter((s) => s._id !== id), baselines };
      });
      const other = p.screens.find((s) => s._id !== id);
      setScreenId(other._id);
      setSelectedId(other._id);
    },
    [store, update, t],
  );

  // ---------------------------------------------------------------- presse-papiers
  const copySelection = useCallback(async () => {
    const f = findNode(store.getProject(), selectedId);
    if (!f) return;
    const text = f.kind === 'screen' ? screenYaml(f.node) : f.kind === 'control' ? controlsYaml([f.node]) : f.kind === 'component' ? componentsYaml([f.node]) : appYaml(f.node);
    const ok = await copyText(text);
    toast(ok ? t('studio.yamlOfCopied', { name: f.node.name }) : t('studio.copyImpossible'), ok ? 'success' : 'error');
  }, [store, selectedId, t]);

  /** Colle du YAML Power Apps : contrôles insérés dans la sélection, écrans / App / composants importés */
  const pasteText = useCallback(
    (text, opts = {}) => {
      if (!text || !text.trim()) return false;
      const parsed = parsePaYaml(text);
      if (parsed.errors.length) {
        if (opts.silent) return false;
        toast(t('studio.invalidYamlLine', { message: parsed.errors[0].message, line: parsed.errors[0].line }), 'error');
        return false;
      }
      const p = store.getProject();
      if (parsed.controls.length) {
        const targetId = opts.parentId || insertionTarget(p, selectedId, screen?._id);
        const taken = allNames(p);
        const map = new Map();
        let nodes = parsed.controls.map((c) => cloneWithNewIds(c, taken, map));
        nodes = nodes.map((n) => applyRenames(n, map));
        const target = findNode(p, targetId);
        if (parentLayout(target?.kind === 'control' ? target.node : null) === 'manual' && map.size) {
          // collé deux fois : léger décalage
          nodes = nodes.map((n) => {
            const x = /^=\s*(-?\d+(\.\d+)?)\s*$/.exec(n.properties?.X || '');
            const y = /^=\s*(-?\d+(\.\d+)?)\s*$/.exec(n.properties?.Y || '');
            return { ...n, properties: { ...n.properties, ...(x ? { X: `=${Number(x[1]) + 20}` } : {}), ...(y ? { Y: `=${Number(y[1]) + 20}` } : {}) } };
          });
        }
        update((pp) => insertControls(pp, targetId, nodes));
        setSelectedId(nodes[nodes.length - 1]._id);
        const renamed = map.size ? t('studio.pastedRenamed', { list: [...map].map(([a, b]) => `${a}→${b}`).join(', ') }) : '';
        toast(t('studio.controlsPasted', { count: nodes.length, renamed }), 'success');
        return true;
      }
      if (parsed.screens.length || parsed.app || parsed.components.length) {
        const r = mergeParsed(p, parsed, { mode: opts.replace ? 'replace' : 'add' });
        // le YAML collé depuis Power Apps devient la nouvelle référence de comparaison
        const baselines = { ...(r.project.baselines || {}) };
        for (const s of r.added) delete baselines[s._id];
        if (parsed.app) delete baselines.app;
        if (parsed.components.length) delete baselines.components;
        update({ ...r.project, baselines });
        if (r.added[0]) {
          const s = r.project.screens.find((x) => x.name === r.added[0].name);
          setScreenId(s._id);
          setSelectedId(s._id);
          setYamlScope('screen');
        } else if (parsed.components.length) setYamlScope('components');
        else if (parsed.app) setYamlScope('app');
        const parts = [
          r.added.length ? t('studio.screensCount', { count: r.added.length }) : '',
          parsed.app ? 'App' : '',
          parsed.components.length ? t('studio.componentsCount', { count: parsed.components.length }) : '',
        ].filter(Boolean);
        // « 2 écran(s) App 1 composant(s) » (séparés par des espaces) en français, liste avec virgules ailleurs
        const items = new Intl.ListFormat(INTL_LOCALES[locale], { type: 'unit', style: locale === 'fr' ? 'narrow' : 'long' }).format(parts);
        toast(t('studio.importedSummary', { items }), 'success');
        return true;
      }
      if (!opts.silent) toast(t('studio.noPaYamlInPaste'), 'warning');
      return false;
    },
    [store, selectedId, screen, update, t, locale],
  );

  // ---------------------------------------------------------------- aperçu
  const startPreview = useCallback(async () => {
    if (mode === 'preview') return;
    setMode('preview');
    await rt.startPreview({ runOnStart: project.settings?.runOnStartInPreview !== false, screen: screen?.name });
  }, [mode, rt, project.settings, screen]);

  const stopPreview = useCallback(() => {
    rt.stopPreview();
    setMode('edit');
  }, [rt]);

  // ---------------------------------------------------------------- clavier
  useEffect(() => {
    const isEditable = (el) => el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.closest?.('.cm-editor'));
    const onKey = (e) => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (e.key === 'F5') {
        e.preventDefault();
        if (mode === 'edit') startPreview();
        return;
      }
      if (e.key === 'Escape' && mode === 'preview') {
        stopPreview();
        return;
      }
      if (mode === 'preview') return;
      if (isEditable(document.activeElement)) return;
      if (ctrl && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        store.undo();
      } else if (ctrl && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
        e.preventDefault();
        store.redo();
      } else if (ctrl && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        copySelection();
      } else if (ctrl && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveProject({ ...store.getProject(), chat: { messages: chat } }).then(() => {
          setSaveState('saved');
          toast(t('studio.projectSaved'), 'success');
        });
      }
    };
    const onPaste = (e) => {
      if (mode === 'preview' || isEditable(document.activeElement)) return;
      const text = e.clipboardData?.getData('text/plain');
      if (text) {
        e.preventDefault();
        pasteText(text);
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('paste', onPaste);
    };
  }, [mode, store, copySelection, pasteText, startPreview, stopPreview, chat, t]);

  // ---------------------------------------------------------------- contexte
  const ctx = {
    project,
    update,
    undo: store.undo,
    redo: store.redo,
    canUndo: store.canUndo,
    canRedo: store.canRedo,
    getProject: store.getProject,
    rt,
    rtVersion,
    screen,
    screenId,
    selection,
    selectedId,
    select,
    focusRequest,
    yamlScope,
    setYamlScope,
    view,
    setView,
    /** Affiche le YAML (d'une portée donnée : 'app', 'components' ou l'écran courant) */
    showYaml: (scopeName) => {
      if (scopeName) setYamlScope(scopeName);
      setView('yaml');
    },
    setBaseline,
    addScreen,
    deleteScreen,
    copySelection,
    pasteText,
    leftPanel,
    setLeftPanel,
    aiOpen,
    setAiOpen,
    openGuide: () => setGuideOpen(true),
    aiPending,
    clearAiPending: () => setAiPending(null),
    aiDraft: (text) => {
      setAiOpen(true);
      setAiPending(text);
    },
    mode,
    startPreview,
    stopPreview,
    zoom,
    setZoom,
    fitZoom,
    setFitZoom,
    issues,
    issueSummary,
    saveState,
    chat,
    setChat,
    goHome: () => {
      saveProject({ ...store.getProject(), chat: { messages: chat } }).finally(() => router.push('/'));
    },
  };

  return (
    <StudioContext.Provider value={ctx}>
      <div className={`studio${mode === 'preview' ? ' is-preview' : ''}`}>
        <CommandBar />
        <div className="studio-body">
          <LeftRail />
          <div className="studio-center">
            <Workspace />
          </div>
          <AiPanel hidden={!aiOpen} />
        </div>
        {mode === 'preview' ? <Canvas preview /> : null}
        {guideOpen ? (
          <GuideDialog
            onClose={() => setGuideOpen(false)}
            onStartTour={() => {
              setGuideOpen(false);
              setTourOpen(true);
            }}
          />
        ) : null}
        {tourOpen && mode !== 'preview' ? (
          <Tour
            steps={STUDIO_TOUR}
            onEnterStep={(step) => step.open === 'ai' && setAiOpen(true)}
            onClose={() => {
              markOnboardingSeen('tour');
              setTourOpen(false);
            }}
          />
        ) : null}
        <Toasts />
      </div>
    </StudioContext.Provider>
  );
}
