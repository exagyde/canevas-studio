'use client';
// Traductions dans l'interface : langue courante, traduction, formats et choix de la langue.
import { createContext, Fragment, useCallback, useContext, useMemo, useState } from 'react';
import { Icon, useMenu } from './ui';
import { translate, setLocale as setLibLocale, getLocale, isLocale, LOCALES, LOCALE_NAMES, LOCALE_COOKIE, formatDate, formatNumber } from '@/lib/i18n';

const I18nContext = createContext(null);

function makeValue(locale, setLocale) {
  const t = (key, params) => translate(locale, key, params);
  return {
    locale,
    setLocale,
    t,
    /**
     * Texte avec balises : « Cliquez sur <b>Copier</b> » → éléments React.
     * tags : { b: (contenu) => <strong>{contenu}</strong> } ; balises non imbriquées.
     */
    rich: (key, params, tags = {}) => {
      const parts = t(key, params).split(/(<(\w+)>[\s\S]*?<\/\2>)/g);
      const out = [];
      for (let i = 0; i < parts.length; i++) {
        const m = /^<(\w+)>([\s\S]*?)<\/\1>$/.exec(parts[i]);
        if (m) {
          out.push(<Fragment key={i}>{tags[m[1]] ? tags[m[1]](m[2]) : m[2]}</Fragment>);
          i++; // groupe capturé (nom de la balise)
        } else if (parts[i]) out.push(<Fragment key={i}>{parts[i]}</Fragment>);
      }
      return out;
    },
    formatDate: (value, options) => formatDate(value, options, locale),
    formatNumber: (value, options) => formatNumber(value, options, locale),
  };
}

/** Fournit la langue à l'interface ; initialLocale vient du serveur (cookie ou langue du navigateur) */
export function I18nProvider({ initialLocale, children }) {
  const [locale, setLocaleState] = useState(isLocale(initialLocale) ? initialLocale : getLocale());
  // les modules lib/ (vérificateur, émulateur…) traduisent dans la même langue que l'interface
  if (typeof window !== 'undefined') setLibLocale(locale);
  const setLocale = useCallback((next) => {
    if (!isLocale(next)) return;
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    document.documentElement.lang = next;
    setLibLocale(next);
    setLocaleState(next);
  }, []);
  const value = useMemo(() => makeValue(locale, setLocale), [locale, setLocale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/**
 * Langue et fonctions de traduction : { locale, setLocale, t, rich, formatDate, formatNumber }.
 * Tout composant qui affiche du texte traduit l'utilise, pour être redessiné au changement de langue.
 */
export function useI18n() {
  return useContext(I18nContext) || makeValue(getLocale(), () => {});
}

/** Entrées de menu pour choisir la langue (avec la langue courante cochée) */
export function languageMenuItems(locale, setLocale, title) {
  return [{ title }, ...LOCALES.map((l) => ({ label: LOCALE_NAMES[l], checked: l === locale, onClick: () => setLocale(l) }))];
}

/** Bouton de choix de la langue : globe + nom de la langue courante */
export function LanguageButton({ className = 'btn btn-subtle btn-sm' }) {
  const { locale, setLocale, t } = useI18n();
  const [openMenu, menuEl] = useMenu();
  const choose = useCallback((e) => openMenu(e, languageMenuItems(locale, setLocale, t('common.language')), { align: 'end' }), [openMenu, locale, setLocale, t]);
  return (
    <>
      <button className={className} type="button" onClick={choose} title={t('common.changeLanguage')} aria-label={t('common.changeLanguage')}>
        <Icon name="Globe" size={16} /> {LOCALE_NAMES[locale]} <Icon name="ChevronDown" size={12} />
      </button>
      {menuEl}
    </>
  );
}
