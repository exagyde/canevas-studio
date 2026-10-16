// Proxy Dataverse (Web API v9.2) : authentification Microsoft Entra ID + requêtes.
import { checkDataverseUrl } from '@/lib/server/net';
import { translate, localeFromRequest } from '@/lib/i18n';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TENANT = /^[A-Za-z0-9.-]{2,100}$/;
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(data, status = 200) {
  return Response.json(data, { status });
}

async function tokenRequest(tenant, params) {
  const r = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, j };
}

function tokenResult(j) {
  return { accessToken: j.access_token, refreshToken: j.refresh_token || null, expiresAt: Date.now() + (Number(j.expires_in) || 3600) * 1000 - 60000 };
}

export async function POST(req) {
  const locale = localeFromRequest(req);
  let b;
  try {
    b = await req.json();
  } catch {
    return json({ error: translate(locale, 'data.invalidJsonBody') }, 400);
  }
  const op = b.op;
  const env = b.envUrl ? checkDataverseUrl(b.envUrl) : null;
  const tenant = b.tenantId && TENANT.test(b.tenantId) ? b.tenantId : 'organizations';
  const clientId = b.clientId && GUID.test(b.clientId) ? b.clientId : null;

  try {
    if (op === 'token-client') {
      if (!env) return json({ error: translate(locale, 'data.invalidEnvUrlExample') }, 400);
      if (!clientId || !b.clientSecret || tenant === 'organizations') return json({ error: translate(locale, 'data.clientCredentialsRequired') }, 400);
      const { ok, j } = await tokenRequest(tenant, { grant_type: 'client_credentials', client_id: clientId, client_secret: b.clientSecret, scope: `${env}/.default` });
      if (!ok) return json({ error: j.error_description || j.error || translate(locale, 'data.authFailed') }, 401);
      return json(tokenResult(j));
    }
    if (op === 'device-start') {
      if (!env) return json({ error: translate(locale, 'data.invalidEnvUrl') }, 400);
      if (!clientId) return json({ error: translate(locale, 'data.clientIdRequired') }, 400);
      const r = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/devicecode`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: clientId, scope: `${env}/user_impersonation offline_access` }).toString(),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return json({ error: j.error_description || j.error || translate(locale, 'data.failed') }, 400);
      return json({ userCode: j.user_code, verificationUri: j.verification_uri, deviceCode: j.device_code, interval: j.interval || 5, expiresIn: j.expires_in, message: j.message });
    }
    if (op === 'device-poll') {
      if (!clientId || !b.deviceCode) return json({ error: translate(locale, 'data.missingParams') }, 400);
      const { ok, j } = await tokenRequest(tenant, { grant_type: 'urn:ietf:params:oauth:grant-type:device_code', client_id: clientId, device_code: b.deviceCode });
      if (!ok) {
        if (j.error === 'authorization_pending' || j.error === 'slow_down') return json({ pending: true });
        return json({ error: j.error_description || j.error || translate(locale, 'data.failed') }, 401);
      }
      return json(tokenResult(j));
    }
    if (op === 'refresh') {
      if (!env || !clientId || !b.refreshToken) return json({ error: translate(locale, 'data.missingParams') }, 400);
      const { ok, j } = await tokenRequest(tenant, { grant_type: 'refresh_token', client_id: clientId, refresh_token: b.refreshToken, scope: `${env}/user_impersonation offline_access` });
      if (!ok) return json({ error: j.error_description || j.error || translate(locale, 'data.failed') }, 401);
      return json(tokenResult(j));
    }
    if (op === 'api') {
      if (!env) return json({ error: translate(locale, 'data.invalidEnvUrl') }, 400);
      if (!b.token) return json({ error: translate(locale, 'data.notConnectedNoToken') }, 401);
      const path = String(b.path || '');
      if (!path || path.startsWith('/') || /:\/\//.test(path) || path.includes('..')) return json({ error: translate(locale, 'data.invalidPath') }, 400);
      const method = ['GET', 'POST', 'PATCH', 'DELETE'].includes(b.method) ? b.method : 'GET';
      const headers = {
        authorization: `Bearer ${b.token}`,
        accept: 'application/json',
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0',
        Prefer: `odata.include-annotations="*"${b.maxPageSize ? `,odata.maxpagesize=${Number(b.maxPageSize)}` : ''}`,
      };
      if (b.body !== undefined) headers['content-type'] = 'application/json; charset=utf-8';
      const r = await fetch(`${env}/api/data/v9.2/${path}`, { method, headers, body: b.body !== undefined ? JSON.stringify(b.body) : undefined });
      const text = await r.text();
      let data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = text;
      }
      if (!r.ok) return json({ error: data?.error?.message || `${r.status} ${r.statusText}`, status: r.status }, r.status === 401 ? 401 : 502);
      return json({ data });
    }
    return json({ error: translate(locale, 'data.unknownOp', { op }) }, 400);
  } catch (e) {
    return json({ error: translate(locale, 'data.networkError', { message: e.message }) }, 502);
  }
}
