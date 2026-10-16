'use client';
// Rendu de l'écran (lecture seule) : cliquer sur un contrôle le sélectionne et met en évidence son YAML.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useStudio } from './context';
import { InstView } from '@/components/controls/ControlView';
import { Icon, useMenu } from '@/components/common/ui';
import { useI18n } from '@/components/common/i18n';
import { INTL_LOCALES } from '@/lib/i18n';
import { cssColor, imageUrl, enumKey } from '@/lib/render/style';
import { findNode } from '@/lib/project/model';

export default function Canvas({ preview = false }) {
  const s = useStudio();
  const { t, locale } = useI18n();
  const { rt, rtVersion, project, screen, selectedId, select, zoom, setZoom } = s;
  const vpRef = useRef(null);
  const stageRef = useRef(null);
  const screenRef = useRef(null);
  const [vpSize, setVpSize] = useState({ w: 800, h: 600 });
  const [alt, setAlt] = useState(false);
  const [overlay, setOverlay] = useState(null);
  const [hover, setHover] = useState(null);
  const [openMenu, menuEl] = useMenu();

  const W = project.settings?.width || 1366;
  const H = project.settings?.height || 768;
  const screenName = preview ? rt.activeScreen : screen?.name;
  const rootId = screen?._id;

  // Construction de l'arbre (dépend du projet, de l'état d'exécution et de l'écran)
  const root = useMemo(() => {
    if (!screenName) return null;
    try {
      return rt.build(screenName);
    } catch (e) {
      console.error(e);
      return null;
    }
  }, [project, screenName, rtVersion, rt]);

  useEffect(() => {
    rt.syncTimers(preview ? root : null);
  }, [root, preview, rt]);

  // Taille de la zone d'affichage
  useLayoutEffect(() => {
    const el = vpRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setVpSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setVpSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const margin = preview ? 24 : 32;
  const fit = Math.max(0.1, Math.min((vpSize.w - margin * 2) / W, (vpSize.h - margin * 2) / H, preview ? 4 : 1));
  const z = preview ? fit : zoom ?? fit;
  const setFitZoom = s.setFitZoom;
  useEffect(() => {
    if (!preview) setFitZoom(fit);
  }, [fit, preview, setFitZoom]);

  // Touche Alt : interaction en mode conception
  useEffect(() => {
    if (preview) return;
    const down = (e) => e.key === 'Alt' && setAlt(true);
    const up = (e) => e.key === 'Alt' && setAlt(false);
    const blur = () => setAlt(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, [preview]);

  // Contexte de rendu
  const rc = useMemo(
    () => ({
      mode: preview ? 'preview' : 'edit',
      interactive: preview || alt,
      selectedId: preview ? null : selectedId,
      // langue de l'application émulée (Paramètres), distincte de la langue de l'interface
      locale: project.settings?.locale || INTL_LOCALES[locale],
      userName: project.settings?.user?.FullName || t('project.demoUserName'),
      run: (inst, prop) => rt.runBehavior(inst, prop),
      setState: (inst, patch, eventProp, extra) => {
        rt.setControlState(inst.key, patch);
        if (eventProp) rt.runBehavior(inst, eventProp);
        for (const p of extra || []) rt.runBehavior(inst, p);
      },
      setSelection: (inst, items, eventProp) => {
        rt.setControlState(inst.key, { selectedItems: items });
        if (eventProp) rt.runBehavior(inst, eventProp);
      },
      fireChange: (inst) => {
        const st = rt.controlState(inst.key);
        if (st.text === undefined || st.text === st.lastFired) return;
        st.lastFired = st.text;
        rt.runBehavior(inst, 'OnChange');
      },
      selectGalleryItem: (gallery, index, runOnSelect) => {
        rt.setControlState(gallery.key, { selectedIndex: index });
        if (runOnSelect) rt.runBehavior(gallery, 'OnSelect');
      },
      timerRunning: (inst) => rt.timers.has(inst.key) && rt.timers.get(inst.key) !== 'done',
    }),
    [preview, alt, selectedId, rt, project.settings, locale, t],
  );

  // ---------------------------------------------------------------- superposition de sélection
  const measure = useCallback(
    (id) => {
      const scr = screenRef.current;
      const stage = stageRef.current;
      if (!scr || !stage || !id || id === rootId) return null;
      let el = null;
      try {
        el = scr.querySelector(`[data-node-id="${CSS.escape(id)}"]`);
      } catch {
        el = null;
      }
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const sr = stage.getBoundingClientRect();
      return { left: r.left - sr.left, top: r.top - sr.top, width: r.width, height: r.height };
    },
    [rootId],
  );

  useLayoutEffect(() => {
    if (preview) return;
    setOverlay(measure(selectedId));
  }, [preview, selectedId, root, z, measure]);

  useEffect(() => {
    if (preview) return;
    const scr = screenRef.current;
    if (!scr) return;
    const onScroll = () => setOverlay(measure(selectedId));
    scr.addEventListener('scroll', onScroll, true);
    return () => scr.removeEventListener('scroll', onScroll, true);
  }, [preview, selectedId, measure]);

  // ---------------------------------------------------------------- souris
  const nodeIdFromEvent = (e) => {
    const scr = screenRef.current;
    let el = e.target.closest?.('[data-node-id]');
    if (!el || !scr?.contains(el)) return null;
    // Dans une instance de composant, c'est l'instance (la plus extérieure) qui est visée
    let outer = el.closest('.pa-component');
    while (outer) {
      const up = outer.parentElement?.closest('.pa-component');
      if (!up || !scr.contains(up)) break;
      outer = up;
    }
    if (outer && scr.contains(outer)) el = outer;
    return el.dataset.nodeId;
  };

  const onScreenMouseDown = (e) => {
    if (preview || e.button !== 0 || alt) return;
    e.stopPropagation();
    select(nodeIdFromEvent(e) || rootId);
  };

  // Double-clic : affiche le YAML du contrôle
  const onDoubleClick = (e) => {
    if (preview) return;
    const id = nodeIdFromEvent(e);
    if (id) select(id, { reveal: true });
  };

  const onMouseMoveScreen = (e) => {
    if (preview) return;
    const id = nodeIdFromEvent(e);
    if (id === hover?.id) return;
    setHover(id && id !== selectedId ? { id, rect: measure(id) } : null);
  };

  const onContextMenu = (e) => {
    if (preview) return;
    const id = nodeIdFromEvent(e) || rootId;
    select(id);
    const f = findNode(project, id);
    openMenu(
      e,
      [
        { label: t('studio.showYaml'), icon: 'Code', onClick: () => select(id, { reveal: true }) },
        { label: t('studio.copyYaml'), icon: 'Copy', shortcut: 'Ctrl+C', onClick: () => s.copySelection() },
        {
          label: t('studio.askAi'),
          icon: 'Sparkle',
          onClick: () => s.aiDraft(f?.kind === 'control' ? t('studio.aboutControl', { name: f.node.name }) : t('studio.aboutScreen', { name: f?.node?.name })),
        },
      ],
      { atPointer: true },
    );
  };

  // ---------------------------------------------------------------- zoom à la molette
  useEffect(() => {
    const el = vpRef.current;
    if (!el || preview) return;
    const onWheel = (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const next = Math.max(0.1, Math.min(4, (zoom ?? fit) * (e.deltaY < 0 ? 1.1 : 1 / 1.1)));
      setZoom(Math.round(next * 100) / 100);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoom, fit, preview, setZoom]);

  if (!screen && !preview) {
    return (
      <div className="canvas-viewport">
        <div className="empty-state">
          <Icon name="Screen" size={40} />
          {t('studio.noScreen')}
        </div>
      </div>
    );
  }

  const screenFill = root ? cssColor(root.get('Fill'), '#fff') : '#fff';
  const bgImg = root ? imageUrl(root.get('BackgroundImage')) : null;
  const imgPos = root ? enumKey(root.get('ImagePosition'), 'fit') : 'fit';
  const stageW = W * z + margin * 2;
  const stageH = H * z + margin * 2;

  const content = (
    <div className={`canvas-viewport${preview ? ' preview' : ''}${alt ? ' alt-mode' : ''}`} ref={vpRef} onMouseDown={() => !preview && rootId && select(rootId)}>
      <div className="canvas-stage" ref={stageRef} style={{ width: Math.max(stageW, vpSize.w), height: Math.max(stageH, vpSize.h) }}>
        <div className="canvas-screen-frame" style={{ left: Math.max(margin, (vpSize.w - W * z) / 2), top: Math.max(margin, (vpSize.h - H * z) / 2), width: W * z, height: H * z }}>
          <div
            ref={screenRef}
            className={`pa-screen-root mode-${preview || alt ? 'preview' : 'edit'}`}
            style={{
              width: W,
              height: H,
              transform: `scale(${z})`,
              transformOrigin: '0 0',
              background: bgImg ? `${screenFill} center / ${imgPos === 'fill' ? 'cover' : imgPos === 'stretch' ? '100% 100%' : 'contain'} no-repeat url("${bgImg}")` : screenFill,
            }}
            onMouseDown={onScreenMouseDown}
            onMouseMove={onMouseMoveScreen}
            onMouseLeave={() => setHover(null)}
            onDoubleClick={onDoubleClick}
            onContextMenu={onContextMenu}
          >
            {root ? root.children.map((c) => <InstView key={c.key} inst={c} rc={rc} />) : null}
            {rt.notifications.length ? (
              <div className="pa-notifications">
                {rt.notifications.map((n) => (
                  <div key={n.id} className={`pa-notification ${String(n.type).toLowerCase()}`}>
                    <Icon name={n.type === 'Error' ? 'Error' : n.type === 'Warning' ? 'Warning' : n.type === 'Success' ? 'CheckmarkCircle' : 'Info'} size={18} />
                    <span>{n.message}</span>
                    <button type="button" onClick={() => rt.dismissNotification(n.id)} aria-label={t('common.close')}>
                      <Icon name="Cancel" size={14} />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        {!preview && hover?.rect ? <div className="sel-hover" style={hover.rect} /> : null}
        {!preview && overlay ? (
          <div className="sel-box" style={overlay}>
            <span className="sel-label">{findNode(project, selectedId)?.node?.name}</span>
          </div>
        ) : null}
      </div>
      {alt && !preview ? <div className="alt-hint">{t('studio.altModeHint')}</div> : null}
      {menuEl}
    </div>
  );

  if (!preview) return content;
  return (
    <div className="preview-overlay">
      <div className="preview-bar">
        <Icon name="Play" size={16} />
        <span className="preview-title">{t('studio.previewTitle', { name: screenName })}</span>
        <span className="muted small">{t('studio.previewHint')}</span>
        <span className="spacer" />
        {rt.navStack.length ? (
          <button className="btn btn-subtle btn-sm" type="button" onClick={() => rt.back()}>
            <Icon name="ArrowLeft" size={14} /> {t('studio.navBack')}
          </button>
        ) : null}
        <button className="icon-btn" type="button" onClick={s.stopPreview} aria-label={t('studio.closePreview')} title={t('studio.closeEsc')}>
          <Icon name="Cancel" />
        </button>
      </div>
      <div className="preview-body">{content}</div>
    </div>
  );
}
