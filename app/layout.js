import './globals.css';
import './home.css';
import './studio.css';
import './controls.css';
import './help.css';
import { cookies, headers } from 'next/headers';
import DesktopOnly from '@/components/common/DesktopOnly';
import { I18nProvider } from '@/components/common/i18n';
import { LOCALE_COOKIE, isLocale, matchLocale, translate } from '@/lib/i18n';

/** Langue de la page : choix enregistré (cookie), sinon langue préférée du navigateur */
async function requestLocale() {
  const saved = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(saved)) return saved;
  return matchLocale((await headers()).get('accept-language'));
}

export async function generateMetadata() {
  const locale = await requestLocale();
  return { title: 'Canevas Studio', description: translate(locale, 'common.appDescription') };
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default async function RootLayout({ children }) {
  const locale = await requestLocale();
  return (
    <html lang={locale}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Lato:wght@300;400;700;900&family=Montserrat:wght@400;600;700&family=Open+Sans:wght@300;400;600;700&display=swap"
        />
      </head>
      <body>
        {/* le fournisseur ne crée pas d'élément : DesktopOnly et la page restent des enfants directs de body (voir globals.css) */}
        <I18nProvider initialLocale={locale}>
          <DesktopOnly />
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
