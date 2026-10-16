'use client';
// Prise en main : guide de l'outil (accessible à tout moment), accueil du premier lancement, suivi de ce qui a été vu.
import { Fragment, useState } from 'react';
import { Dialog, Icon } from '@/components/common/ui';
import { useI18n } from '@/components/common/i18n';
import { loadPrefs, updatePrefs } from '@/lib/storage/db';
import { GUIDE_TOPICS, WELCOME_STEPS } from '@/lib/help/tour';

const TAGS = {
  b: (c) => <strong>{c}</strong>,
  kbd: (c) => <kbd>{c}</kbd>,
  code: (c) => <code>{c}</code>,
};

/** Étapes de prise en main déjà vues dans ce navigateur : 'welcome' (accueil), 'tour' (visite du studio) */
export function onboardingSeen(key) {
  return !!loadPrefs().onboarding?.[key];
}

export function markOnboardingSeen(key) {
  updatePrefs({ onboarding: { ...(loadPrefs().onboarding || {}), [key]: true } });
}

/** Touches d'un raccourci : « Ctrl+Z / Ctrl+Y » → <kbd>Ctrl</kbd>+<kbd>Z</kbd> / … */
function Keys({ text }) {
  return text.split(/(\s*[/+]\s*)/).map((part, i) => {
    if (/^\s*\+\s*$/.test(part)) return <Fragment key={i}>+</Fragment>;
    if (/^\s*\/\s*$/.test(part)) return <Fragment key={i}> / </Fragment>;
    const m = /^(.*?)(\s*\(.*\))?$/.exec(part);
    return (
      <Fragment key={i}>
        <kbd>{m[1]}</kbd>
        {m[2] ? <span className="guide-keys-note">{m[2]}</span> : null}
      </Fragment>
    );
  });
}

/**
 * Guide de l'outil : sujets à gauche, contenu à droite.
 * onStartTour : relance la visite guidée (proposé seulement dans le studio).
 */
export function GuideDialog({ onClose, onStartTour, initialTopic = 'Start' }) {
  const { t, rich } = useI18n();
  const [topicKey, setTopicKey] = useState(initialTopic);
  const topic = GUIDE_TOPICS.find((g) => g.key === topicKey) || GUIDE_TOPICS[0];
  const List = topic.ordered ? 'ol' : 'ul';
  return (
    <Dialog
      title={t('help.guideTitle')}
      icon="QuestionMark"
      size="wide"
      onClose={onClose}
      footer={
        <>
          {onStartTour ? (
            <button className="btn" type="button" onClick={onStartTour}>
              <Icon name="Play" size={14} /> {t('help.restartTour')}
            </button>
          ) : (
            <span className="field-hint">{t('help.tourFromStudio')}</span>
          )}
          <span className="spacer" />
          <button className="btn btn-primary" type="button" onClick={onClose}>
            {t('common.close')}
          </button>
        </>
      }
    >
      <div className="guide">
        <nav className="guide-nav" aria-label={t('help.guideTitle')}>
          {GUIDE_TOPICS.map((g) => (
            <button key={g.key} type="button" className={`guide-topic${g.key === topic.key ? ' is-active' : ''}`} aria-current={g.key === topic.key ? 'true' : undefined} onClick={() => setTopicKey(g.key)}>
              <Icon name={g.icon} size={16} />
              <span>{t(`help.guide${g.key}`)}</span>
            </button>
          ))}
        </nav>
        <section className="guide-content" aria-live="polite">
          <h3>{t(`help.guide${topic.key}`)}</h3>
          {topic.items ? (
            <List className="guide-list">
              {topic.items.map((it) => (
                <li key={it}>{rich(`help.${it}`, null, TAGS)}</li>
              ))}
            </List>
          ) : null}
          {topic.shortcuts ? (
            <table className="guide-keys">
              <tbody>
                {topic.shortcuts.map((it) => (
                  <tr key={it}>
                    <td>
                      <Keys text={t(`help.${it}Keys`)} />
                    </td>
                    <td>{t(`help.${it}`)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </section>
      </div>
    </Dialog>
  );
}

/** Accueil du premier lancement : le principe de l'outil en trois temps */
export function WelcomeDialog({ onClose, onOpenGuide }) {
  const { t, rich } = useI18n();
  return (
    <Dialog
      title={t('help.welcomeTitle')}
      icon="Sparkle"
      onClose={onClose}
      footer={
        <>
          <span className="field-hint">
            <Icon name="Lock" size={12} /> {t('help.welcomePrivacy')}
          </span>
          <span className="spacer" />
          <button className="btn" type="button" onClick={onOpenGuide}>
            {t('help.welcomeGuide')}
          </button>
          <button className="btn btn-primary" type="button" onClick={onClose} autoFocus>
            {t('help.welcomeStart')}
          </button>
        </>
      }
    >
      <p className="welcome-intro">{t('help.welcomeIntro')}</p>
      <ol className="welcome-steps">
        {WELCOME_STEPS.map((s, i) => (
          <li key={s.key}>
            <span className="welcome-icon">
              <Icon name={s.icon} size={22} />
              <span className="welcome-num">{i + 1}</span>
            </span>
            <span>
              <strong>{t(`help.welcome${s.key}Title`)}</strong>
              <span className="welcome-text">{rich(`help.welcome${s.key}Text`, null, TAGS)}</span>
            </span>
          </li>
        ))}
      </ol>
    </Dialog>
  );
}
