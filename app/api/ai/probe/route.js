// Vérifie qu'un modèle répond avec la clé fournie (requête minimale, avec délai maximal).
import { ENV_KEYS, AZURE_ENDPOINT_ENV, probeRequest, classifyProbe } from '@/lib/ai/providers';
import { translate, localeFromRequest } from '@/lib/i18n';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PROBE_TIMEOUT_MS = 20000;

function errorText(text) {
  try {
    const j = JSON.parse(text);
    const m = j.error?.message || j.message || j.error;
    return typeof m === 'string' ? m : JSON.stringify(m);
  } catch {
    return text;
  }
}

export async function POST(req) {
  const locale = localeFromRequest(req);
  const { provider = 'anthropic', apiKey: k, endpoint, model } = await req.json().catch(() => ({}));
  const apiKey = k || process.env[ENV_KEYS[provider]] || '';
  if (!model) return Response.json({ status: 'unavailable', message: translate(locale, 'ai.apiModelMissing') }, { status: 400 });
  const rq = probeRequest(provider, { model, apiKey, endpoint: endpoint || process.env[AZURE_ENDPOINT_ENV] });
  if (!rq) return Response.json({ status: 'unavailable', message: provider === 'azure' ? translate(locale, 'ai.apiAzureEndpointInvalidShort') : translate(locale, 'ai.apiUnknownProvider', { provider }) });
  const started = Date.now();
  try {
    const r = await fetch(rq.url, { ...rq.init, signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
    const message = r.ok ? '' : errorText(await r.text()).slice(0, 300);
    if (r.ok) await r.body?.cancel().catch(() => {});
    return Response.json({ status: classifyProbe(r.status, message), httpStatus: r.status, message, ms: Date.now() - started });
  } catch (e) {
    const timeout = e?.name === 'TimeoutError' || e?.name === 'AbortError';
    return Response.json({ status: timeout ? 'timeout' : 'unavailable', message: timeout ? translate(locale, 'ai.apiProbeTimeout', { seconds: PROBE_TIMEOUT_MS / 1000 }) : String(e.message || e).slice(0, 300), ms: Date.now() - started });
  }
}
