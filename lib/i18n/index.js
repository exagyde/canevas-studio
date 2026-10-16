// Traductions : langues disponibles, choix de la langue, traduction et formats.
// Module sans dépendance, utilisé par l'interface (navigateur), les modules lib/ et les routes API (serveur).
// Les textes sont rangés par domaine dans messages/<langue>/<domaine>.js ; une clé s'écrit « domaine.clé ».
import fr from './messages/fr/index.js';
import en from './messages/en/index.js';
import es from './messages/es/index.js';

export const LOCALES = ['fr', 'en', 'es'];
/** Langue de rédaction des textes : repli quand une clé manque dans une autre langue */
export const SOURCE_LOCALE = 'fr';
/** Langue proposée quand aucune langue préférée du navigateur n'est disponible */
export const DEFAULT_LOCALE = 'en';
export const LOCALE_NAMES = { fr: 'Français', en: 'English', es: 'Español' };
export const LOCALE_COOKIE = 'lang';
/** Variante régionale : formats de date et de nombre, langue par défaut des applications émulées */
export const INTL_LOCALES = { fr: 'fr-FR', en: 'en-US', es: 'es-ES' };

export const MESSAGES = { fr, en, es };

export const isLocale = (l) => LOCALES.includes(l);

/** Meilleure langue disponible pour des préférences (en-tête Accept-Language ou navigator.languages) */
export function matchLocale(prefs) {
  const list = Array.isArray(prefs) ? prefs : String(prefs || '').split(',');
  for (const p of list) {
    const base = String(p).split(';')[0].trim().toLowerCase().split('-')[0];
    if (isLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}

/** Langue choisie dans un en-tête Cookie (null si absente) */
export function localeFromCookie(cookieHeader) {
  const m = new RegExp(`(?:^|;\\s*)${LOCALE_COOKIE}=([a-z]{2})(?:;|$)`).exec(String(cookieHeader || ''));
  return m && isLocale(m[1]) ? m[1] : null;
}

/** Langue d'une requête HTTP (routes API) : cookie de langue, sinon en-tête Accept-Language */
export function localeFromRequest(req) {
  return localeFromCookie(req.headers.get('cookie')) || matchLocale(req.headers.get('accept-language'));
}

function lookup(locale, key) {
  const i = key.indexOf('.');
  return MESSAGES[locale]?.[key.slice(0, i)]?.[key.slice(i + 1)];
}

const pluralRules = {};
function pluralForm(locale, n) {
  pluralRules[locale] ||= new Intl.PluralRules(INTL_LOCALES[locale] || locale);
  return pluralRules[locale].select(n);
}

/**
 * Texte d'une clé « domaine.clé » dans une langue.
 *  - paramètres : « {nom} » remplacé par params.nom (laissé tel quel si le paramètre est absent) ;
 *  - pluriels : valeur { zero?, one, other } choisie selon params.count.
 * Clé absente : texte de la langue source, sinon la clé elle-même.
 */
export function translate(locale, key, params) {
  let msg = lookup(locale, key) ?? lookup(SOURCE_LOCALE, key);
  if (msg == null) return key;
  if (typeof msg === 'object') {
    const n = Number(params?.count) || 0;
    msg = (n === 0 && msg.zero != null ? msg.zero : msg[pluralForm(locale, n)]) ?? msg.other;
  }
  if (!params) return msg;
  return msg.replace(/\{(\w+)\}/g, (m, name) => (params[name] != null ? String(params[name]) : m));
}

// ---------------------------------------------------------------------------
// Langue courante des modules lib/ (vérificateur, émulateur Power Fx, assistant…), réglée par l'interface.
// Côté serveur (routes API), ne pas l'utiliser : appeler translate(localeFromRequest(req), …).
// ---------------------------------------------------------------------------
let current = SOURCE_LOCALE;
const listeners = new Set();

export const getLocale = () => current;

export function setLocale(locale) {
  if (!isLocale(locale) || locale === current) return;
  current = locale;
  for (const fn of listeners) fn(locale);
}

/** Abonnement aux changements de langue (ex. vider un cache de messages) ; renvoie la fonction de désabonnement */
export function onLocaleChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Traduction dans la langue courante */
export const t = (key, params) => translate(current, key, params);

/** Date et heure dans la langue (par défaut la langue courante) */
export function formatDate(value, options = { dateStyle: 'medium', timeStyle: 'short' }, locale = current) {
  return new Date(value).toLocaleString(INTL_LOCALES[locale], options);
}

export function formatNumber(value, options, locale = current) {
  return Number(value).toLocaleString(INTL_LOCALES[locale], options);
}
