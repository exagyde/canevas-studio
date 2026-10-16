// Liste des modèles de conversation proposés par le fournisseur IA (avant vérification un par un).
import { ENV_KEYS, FIXED_BASES, chatModelsFromList } from '@/lib/ai/providers';
import { translate, localeFromRequest } from '@/lib/i18n';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LIST_TIMEOUT_MS = 15000;

export async function POST(req) {
  const locale = localeFromRequest(req);
  const { provider = 'anthropic', apiKey: k } = await req.json().catch(() => ({}));
  const apiKey = k || process.env[ENV_KEYS[provider]] || '';
  const signal = AbortSignal.timeout(LIST_TIMEOUT_MS);
  try {
    let r;
    if (provider === 'anthropic') {
      r = await fetch('https://api.anthropic.com/v1/models?limit=100', { headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }, signal });
    } else if (FIXED_BASES[provider]) {
      r = await fetch(`${FIXED_BASES[provider]}/models`, { headers: apiKey ? { authorization: `Bearer ${apiKey}` } : {}, signal });
    } else if (provider === 'gemini') {
      r = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': apiKey }, signal });
    } else if (provider === 'azure') {
      // les déploiements d'une ressource Azure ne se listent pas avec la clé : le client vérifie celui qui est saisi
      throw new Error(translate(locale, 'ai.apiEnterAzureDeployment'));
    } else throw new Error(translate(locale, 'ai.apiUnknownProvider', { provider }));
    if (!r.ok) return Response.json({ error: `${r.status} ${(await r.text()).slice(0, 300)}`, status: r.status }, { status: 502 });
    return Response.json({ models: chatModelsFromList(provider, await r.json()) });
  } catch (e) {
    const timeout = e?.name === 'TimeoutError' || e?.name === 'AbortError';
    return Response.json({ error: timeout ? translate(locale, 'ai.apiListTimeout', { seconds: LIST_TIMEOUT_MS / 1000 }) : String(e.message || e).slice(0, 500) }, { status: 502 });
  }
}
