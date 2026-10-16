'use client';
import { useStudio } from './context';
import { Icon, useMenu } from '@/components/common/ui';
import { useI18n } from '@/components/common/i18n';

// libellés traduits au rendu (paramètres w et h : taille de l'appareil)
const DEVICES = [
  { id: 'desktop', icon: 'Desktop', label: (t, d) => t('studio.deviceDesktop', d), w: 1920, h: 1080 },
  { id: 'tablet', icon: 'Tablet', label: (t, d) => t('studio.deviceTablet', d), w: 1366, h: 768 },
  { id: 'custom', icon: 'Screen', label: (t, d) => t('studio.devicePage', d), w: 1366, h: 480 },
  { id: 'phone', icon: 'Mobile', label: (t, d) => t('studio.devicePhone', d), w: 640, h: 1136 },
];

export default function StatusBar() {
  const s = useStudio();
  const { t } = useI18n();
  const [openMenu, menuEl] = useMenu();
  const { project, screen } = s;
  const W = project.settings?.width;
  const H = project.settings?.height;
  const z = s.zoom ?? s.fitZoom;
  const pct = Math.round(z * 100);

  const setSize = (w, h) => s.update((p) => ({ ...p, settings: { ...p.settings, width: w, height: h } }));

  return (
    <div className="statusbar">
      <button
        className="sb-screen"
        type="button"
        onClick={(e) =>
          openMenu(
            e,
            project.screens.map((sc) => ({ label: sc.name, icon: 'Screen', checked: sc._id === screen?._id, onClick: () => s.select(sc._id) })),
          )
        }
      >
        <Icon name="Screen" size={16} />
        <span>{screen?.name || '—'}</span>
        <Icon name="ChevronDown" size={12} />
      </button>
      {s.rt.busy ? (
        <span className="sb-busy">
          <span className="spinner" /> {t('studio.running')}
        </span>
      ) : null}
      <span className="spacer" />
      <span className="sb-size muted small" title={t('studio.screenSizeTitle')}>
        {W} × {H}
      </span>
      {DEVICES.map((d) => (
        <button key={d.id} className={`icon-btn sb-device${W === d.w && H === d.h ? ' is-active' : ''}`} type="button" title={d.label(t, d)} onClick={() => setSize(d.w, d.h)}>
          <Icon name={d.icon} size={16} />
        </button>
      ))}
      <span className="cmd-sep" />
      <button className="icon-btn" type="button" title={t('studio.zoomOut')} onClick={() => s.setZoom(Math.max(0.1, Math.round((z - 0.1) * 10) / 10))}>
        <Icon name="Subtract" size={16} />
      </button>
      <input className="sb-zoom" type="range" min={10} max={200} value={Math.min(200, pct)} onChange={(e) => s.setZoom(Number(e.target.value) / 100)} aria-label={t('studio.zoom')} />
      <button className="icon-btn" type="button" title={t('studio.zoomIn')} onClick={() => s.setZoom(Math.min(4, Math.round((z + 0.1) * 10) / 10))}>
        <Icon name="Add" size={16} />
      </button>
      <span className="sb-pct">{t('studio.percent', { value: pct })}</span>
      <button className={`icon-btn${s.zoom === null ? ' is-active' : ''}`} type="button" title={t('studio.fitToWindow')} onClick={() => s.setZoom(null)}>
        <Icon name="Expand" size={16} />
      </button>
      {menuEl}
    </div>
  );
}
