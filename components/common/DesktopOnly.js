'use client';
import { Icon } from './ui';
import { useI18n } from './i18n';

/**
 * Message affiché à la place de l'application sur mobile, tablette tactile, en mode portrait
 * ou dans une fenêtre trop petite. Visible uniquement par les règles @media de globals.css :
 * l'application reste montée (masquée), son état est retrouvé en revenant à une taille suffisante.
 */
export default function DesktopOnly() {
  const { t } = useI18n();
  return (
    <div className="desktop-only">
      <div className="desktop-only-card">
        <Icon name="Desktop" size={44} strokeWidth={1.3} />
        <h1>{t('common.desktopTitle')}</h1>
        <p>{t('common.desktopText')}</p>
        <p className="desktop-only-hint">{t('common.desktopHint')}</p>
      </div>
    </div>
  );
}
