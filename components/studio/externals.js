'use client';
// Appels réseau déclenchés par le runtime (flux HTTP, API personnalisées Dataverse, actualisation).
import { callUnboundAction, fetchRows, isConnected } from '@/lib/dataverse/client';
import { toast } from '@/components/common/ui';
import { t } from '@/lib/i18n';

export async function callExternalHttp(project, def, input) {
  if (def.mode === 'dataverse') {
    const env = project.settings?.dataverseUrl;
    if (!env) throw new Error(t('data.noEnvConfigured'));
    const action = def.actionName || String(def.callName || '').split('.').pop();
    return callUnboundAction(env, action, input);
  }
  const r = await fetch('/api/flow', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: def.url, body: input }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j.error || `HTTP ${r.status}`);
  return j.data;
}

/** Refresh(Source) : recharge les lignes depuis Dataverse si connecté */
export async function refreshDataverseSource(project, ds, rt) {
  const def = (project.dataSources || []).find((d) => d.name === ds.name);
  const env = project.settings?.dataverseUrl;
  if (!def || def.kind !== 'dataverse' || !env || !isConnected(env)) return null;
  try {
    const rows = await fetchRows(env, def, def.rowLimit || 200);
    ds.setRows(rows);
    rt.bump();
  } catch (e) {
    toast(t('data.refreshError', { name: ds.name, message: e.message }), 'error');
  }
  return null;
}
