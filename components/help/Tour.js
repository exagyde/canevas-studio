'use client';
// Visite guidée : met en évidence un élément de l'interface et affiche une bulle d'explication à côté.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@/components/common/ui';
import { useI18n } from '@/components/common/i18n';
import { placeCard } from '@/lib/help/tour';

const PAD = 6; // marge autour de l'élément mis en évidence

const KBD = { b: (c) => <strong>{c}</strong>, kbd: (c) => <kbd>{c}</kbd> };

/**
 * @param steps étapes { key, target, open } (lib/help/tour.js)
 * @param onEnterStep appelé à l'affichage d'une étape (ex. ouvrir le volet ciblé)
 * @param onClose appelé à la fin ou à l'abandon de la visite
 */
export default function Tour({ steps, onEnterStep, onClose }) {
  const { t, rich } = useI18n();
  const [index, setIndex] = useState(0);
  const [spot, setSpot] = useState(null);
  const [pos, setPos] = useState(null);
  const cardRef = useRef(null);
  const nextRef = useRef(null);
  const step = steps[index];
  const last = index === steps.length - 1;

  const measure = useCallback(() => {
    const el = step.target ? document.querySelector(`[data-tour="${step.target}"]`) : null;
    const r = el?.getBoundingClientRect();
    const target = r && r.width > 0 && r.height > 0 ? { left: r.left - PAD, top: r.top - PAD, right: r.right + PAD, bottom: r.bottom + PAD } : null;
    setSpot(target);
    const card = cardRef.current;
    setPos(placeCard(target, { width: card?.offsetWidth || 340, height: card?.offsetHeight || 200 }, { width: window.innerWidth, height: window.innerHeight }));
  }, [step]);

  // Nouvelle étape : préparation (volet à ouvrir), mesure, puis nouvelle mesure une fois la mise en page stabilisée
  useLayoutEffect(() => {
    onEnterStep?.(step);
    measure();
    const raf = requestAnimationFrame(measure);
    const late = setTimeout(measure, 250);
    nextRef.current?.focus();
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(late);
    };
  }, [step]);

  // la bulle change de taille avec la langue
  useLayoutEffect(measure, [measure, t]);

  useEffect(() => {
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure]);

  const next = useCallback(() => (last ? onClose(true) : setIndex((i) => i + 1)), [last, onClose]);
  const prev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  // Clavier : Échap pour quitter, flèches pour naviguer (sans déclencher les raccourcis du studio)
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose(false);
      else if (e.key === 'ArrowRight') next();
      else if (e.key === 'ArrowLeft') prev();
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [next, prev, onClose]);

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="tour" role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-text">
      {spot ? (
        <>
          {/* quatre bandes sombres autour de l'élément mis en évidence */}
          <div className="tour-dim" style={{ left: 0, top: 0, right: 0, height: Math.max(0, spot.top) }} />
          <div className="tour-dim" style={{ left: 0, top: spot.bottom, right: 0, bottom: 0 }} />
          <div className="tour-dim" style={{ left: 0, top: spot.top, width: Math.max(0, spot.left), height: spot.bottom - spot.top }} />
          <div className="tour-dim" style={{ left: spot.right, top: spot.top, right: 0, height: spot.bottom - spot.top }} />
          <div className="tour-spot" style={{ left: spot.left, top: spot.top, width: spot.right - spot.left, height: spot.bottom - spot.top }} />
        </>
      ) : (
        <div className="tour-dim" style={{ inset: 0 }} />
      )}
      <div ref={cardRef} className={`tour-card side-${pos?.side || 'center'}`} style={pos ? { left: pos.left, top: pos.top } : { visibility: 'hidden' }}>
        <div className="tour-head">
          <span className="tour-count">{t('help.tourStep', { n: index + 1, total: steps.length })}</span>
          <button className="icon-btn sm" type="button" onClick={() => onClose(false)} title={t('help.tourSkip')} aria-label={t('help.tourSkip')}>
            <Icon name="Cancel" size={14} />
          </button>
        </div>
        <h2 id="tour-title">{t(`help.tour${step.key}Title`)}</h2>
        <p id="tour-text">{rich(`help.tour${step.key}Text`, null, KBD)}</p>
        <div className="tour-foot">
          <div className="tour-dots" aria-hidden="true">
            {steps.map((s, i) => (
              <span key={s.key} className={i === index ? 'on' : ''} />
            ))}
          </div>
          <span className="spacer" />
          {index > 0 ? (
            <button className="btn btn-sm" type="button" onClick={prev}>
              {t('help.tourPrev')}
            </button>
          ) : (
            <button className="btn btn-sm btn-subtle" type="button" onClick={() => onClose(false)}>
              {t('help.tourSkip')}
            </button>
          )}
          <button ref={nextRef} className="btn btn-sm btn-primary" type="button" onClick={next}>
            {last ? t('help.tourDone') : t('help.tourNext')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
