// Appel d'un flux Power Automate déclenché par requête HTTP (When an HTTP request is received).
import { checkFlowUrl } from '@/lib/server/net';
import { translate, localeFromRequest } from '@/lib/i18n';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req) {
  const locale = localeFromRequest(req);
  const b = await req.json().catch(() => null);
  if (!b) return Response.json({ error: translate(locale, 'data.invalidJsonBody') }, { status: 400 });
  const url = checkFlowUrl(b.url || '');
  if (!url) return Response.json({ error: translate(locale, 'data.flowUrlRejected') }, { status: 400 });
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(b.headers && typeof b.headers === 'object' ? b.headers : {}) },
      body: JSON.stringify(b.body ?? {}),
    });
    const text = await r.text();
    let data;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    if (!r.ok) return Response.json({ error: translate(locale, 'data.flowResponded', { status: r.status, statusText: r.statusText }), data }, { status: 502 });
    return Response.json({ data });
  } catch (e) {
    return Response.json({ error: translate(locale, 'data.networkError', { message: e.message }) }, { status: 502 });
  }
}
