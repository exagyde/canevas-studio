'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStudio } from './context';
import { Icon, toast, Spinner, Dialog } from '@/components/common/ui';
import { loadPrefs, updatePrefs } from '@/lib/storage/db';
import { buildSystemPrompt, buildContext, QUICK_PROMPTS } from '@/lib/ai/prompt';
import { splitBlocks, analyzeYamlBlock, applyScreenReplace, applyScreensAdd, applyControlsInsert, applyControlReplace, applyFormula, applyTableData, applyComponents, changePreview, formulaPreview, formulaTarget } from '@/lib/ai/apply';
import DiffView, { DiffStats, computeDiff } from './DiffView';
import { findByName } from '@/lib/project/model';
import { insertionTarget } from '@/lib/project/helpers';
import { copyText } from '@/lib/project/io';
import { REASONING_LEVELS, reasoningLabel, simplerLevel, keyFingerprint, azureEndpoint, azureDeploymentFromUrl } from '@/lib/ai/providers';
import { useI18n } from '@/components/common/i18n';

// keyHint(t) : exemple de clé affiché dans le champ (traduit quand ce n'est pas un préfixe de clé)
export const PROVIDERS = {
  anthropic: { label: 'Anthropic Claude', models: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-fable-5-1'], keyHint: () => 'sk-ant-…' },
  openai: { label: 'OpenAI ChatGPT', models: ['gpt-5', 'gpt-5-mini', 'gpt-4.1', 'gpt-4o'], keyHint: () => 'sk-…' },
  // Azure : « models » propose les noms de déploiement par défaut du portail (celui du modèle)
  azure: { label: 'Azure OpenAI', models: ['gpt-5', 'gpt-5-mini', 'gpt-4.1', 'gpt-4o', 'o4-mini'], keyHint: (t) => t('ai.keyHintAzure') },
  gemini: { label: 'Google Gemini', models: ['gemini-2.5-pro', 'gemini-2.5-flash'], keyHint: () => 'AIza…' },
  mistral: { label: 'Mistral AI', models: ['mistral-large-latest', 'mistral-medium-latest', 'magistral-medium-latest', 'mistral-small-latest', 'codestral-latest'], keyHint: (t) => t('ai.keyHintMistral') },
};

const DEFAULT_SETTINGS = {
  provider: 'anthropic',
  models: { anthropic: 'claude-sonnet-5-5', openai: 'gpt-5', azure: '', gemini: 'gemini-2.5-pro', mistral: 'mistral-large-latest' },
  keys: {},
  // Ressource Azure OpenAI (https://ma-ressource.openai.azure.com) ; le modèle est le nom du déploiement
  azureEndpoint: '',
  maxTokens: 16000,
  // Réflexion et délais (secondes) : sans réponse après slowAfter, nouvelle tentative avec une réflexion plus simple
  reasoning: 'medium',
  slowAfter: 60,
  maxDuration: 300,
  // Modèles vérifiés par fournisseur : { fp, at, models: [{id, label}], excluded: [{id, label, reason}] }
  verified: {},
};

// Une fois le texte commencé, plus rien reçu pendant ce délai : le fournisseur est considéré bloqué
const STALL_MS = 45000;
const VERIFY_TTL_MS = 24 * 3600 * 1000;
// requêtes de vérification simultanées (Mistral limite fortement le débit des comptes gratuits)
const PROBE_CONCURRENCY = { mistral: 1, default: 4 };

// Le contexte envoyé à l'assistant est toujours complet
const FULL_CONTEXT = { screen: true, selection: true, issues: true, app: true };

function loadAiSettings() {
  const p = { ...(loadPrefs().ai || {}) };
  // réglages d'anciennes versions : fournisseur « compatible OpenAI » et choix du contexte envoyé
  delete p.baseUrl;
  delete p.context;
  return {
    ...DEFAULT_SETTINGS,
    ...p,
    provider: PROVIDERS[p.provider] ? p.provider : DEFAULT_SETTINGS.provider,
    models: { ...DEFAULT_SETTINGS.models, ...(p.models || {}) },
    keys: { ...(p.keys || {}) },
    verified: { ...(p.verified || {}) },
  };
}

/** Fournisseur prêt à l'emploi : clé saisie (et, pour Azure, point de terminaison valide) */
function isConfigured(settings) {
  const provider = settings.provider;
  if (!settings.keys[provider]) return false;
  return provider !== 'azure' || !!azureEndpoint(settings.azureEndpoint);
}

const msgId = () => Math.random().toString(36).slice(2, 10);

const cleanStream = (t) => t.replace(/\u0001/g, '').replace(/\n*\u0000[\s\S]*$/, '');

/**
 * Vérifie, pour la clé saisie, quels modèles répondent réellement (une requête minimale par modèle).
 * Les modèles qui ne répondent pas sont retirés de la liste ; le résultat est conservé 24 h par clé.
 * Azure OpenAI : les déploiements ne se listent pas avec la clé, seul le déploiement saisi est vérifié.
 */
function useModelVerification(settings, saveSettings) {
  const { t } = useI18n();
  const [state, setState] = useState(null); // { running, done, total, error }
  const ctrlRef = useRef(null);
  const provider = settings.provider;
  const apiKey = settings.keys[provider] || '';
  const azure = provider === 'azure';
  const endpoint = azure ? azureEndpoint(settings.azureEndpoint) || '' : '';
  const deployment = azure ? settings.models.azure || '' : '';
  const fp = keyFingerprint(provider, apiKey, azure ? `${endpoint}|${deployment}` : '');
  const cached = settings.verified?.[provider];
  const valid = cached && cached.fp === fp ? cached : null;
  const canVerify = apiKey.length >= 20 && (!azure || (!!endpoint && !!deployment));

  const verify = useCallback(async () => {
    ctrlRef.current?.abort();
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;
    setState({ running: true, done: 0, total: 0 });
    const post = (url, body) =>
      fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: ctrl.signal }).then((r) => r.json());
    try {
      let list = [{ id: deployment, label: deployment }];
      if (!azure) {
        const listed = await post('/api/ai/models', { provider, apiKey });
        if (listed.error) throw new Error(listed.status === 401 || listed.status === 403 ? t('ai.keyRejectedStatus', { status: listed.status }) : t('ai.modelListUnavailable', { error: listed.error }));
        list = listed.models || [];
      }
      setState({ running: true, done: 0, total: list.length });
      const results = new Array(list.length);
      let next = 0;
      let done = 0;
      let authError = null;
      const worker = async () => {
        while (next < list.length && !authError && !ctrl.signal.aborted) {
          const i = next++;
          results[i] = await post('/api/ai/probe', { provider, apiKey, endpoint, model: list[i].id }).catch((e) => ({ status: 'unavailable', message: e.message }));
          if (results[i].status === 'auth') authError = results[i].message || t('ai.keyRejectedShort');
          done++;
          if (!ctrl.signal.aborted) setState((st) => ({ ...st, done }));
        }
      };
      await Promise.all(Array.from({ length: Math.min(PROBE_CONCURRENCY[provider] || PROBE_CONCURRENCY.default, list.length) }, worker));
      if (ctrl.signal.aborted) return;
      if (authError) throw new Error(t('ai.keyRejected', { reason: authError }));
      const usable = (r) => r?.status === 'ok' || r?.status === 'busy';
      const models = list.filter((m, i) => usable(results[i]));
      const excluded = list.map((m, i) => ({ ...m, reason: results[i]?.message || results[i]?.status || t('ai.notVerified') })).filter((m, i) => !usable(results[i]));
      saveSettings((cur) => ({
        verified: { ...(cur.verified || {}), [provider]: { fp, at: Date.now(), models, excluded } },
        // modèle choisi indisponible : premier modèle disponible
        models: models.length && !models.some((m) => m.id === cur.models[provider]) ? { ...cur.models, [provider]: models[0].id } : cur.models,
      }));
      setState({ running: false });
    } catch (e) {
      if (!ctrl.signal.aborted) setState({ running: false, error: e.message });
    }
  }, [provider, apiKey, azure, endpoint, deployment, fp, saveSettings, t]);

  // Vérification automatique après la saisie de la clé (ou au changement de fournisseur)
  useEffect(() => {
    setState(null);
    if (!canVerify) return undefined;
    if (valid && Date.now() - valid.at < VERIFY_TTL_MS) return undefined;
    const timer = setTimeout(verify, 900);
    return () => {
      clearTimeout(timer);
      ctrlRef.current?.abort();
    };
  }, [fp, canVerify]);

  return { state, valid, verify, canVerify };
}

/** Durée écoulée, rafraîchie chaque seconde */
function Elapsed({ since }) {
  const { t } = useI18n();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return <>{t('ai.elapsed', { seconds: Math.max(0, Math.round((now - new Date(since).getTime()) / 1000)) })}</>;
}

function readImage(file, t) {
  return new Promise((resolve, reject) => {
    if (file.size > 4 * 1024 * 1024) {
      reject(new Error(t('ai.imageTooLarge')));
      return;
    }
    const r = new FileReader();
    r.onload = () => {
      const m = /^data:([^;]+);base64,(.*)$/.exec(r.result);
      if (!m) reject(new Error(t('ai.unsupportedFormat')));
      else resolve({ type: 'image', mediaType: m[1], data: m[2], name: file.name });
    };
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

export default function AiPanel({ hidden = false }) {
  const s = useStudio();
  const { t } = useI18n();
  const [settings, setSettings] = useState(loadAiSettings);
  const [showSettings, setShowSettings] = useState(false);
  const [input, setInput] = useState('');
  const [images, setImages] = useState([]);
  const [busy, setBusy] = useState(false);
  const abortRef = useRef(null);
  const listRef = useRef(null);
  const fileRef = useRef(null);
  const { chat, setChat } = s;

  const provider = settings.provider;
  const model = settings.models[provider] || '';
  const configured = isConfigured(settings);

  const saveSettings = useCallback((patch) => {
    setSettings((cur) => {
      const next = { ...cur, ...(typeof patch === 'function' ? patch(cur) : patch) };
      updatePrefs({ ai: next });
      return next;
    });
  }, []);
  const verification = useModelVerification(settings, saveSettings);

  // Texte proposé depuis un autre volet (ex. vérificateur)
  useEffect(() => {
    if (s.aiPending) {
      setInput(s.aiPending);
      s.clearAiPending();
    }
  }, [s.aiPending, s]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat]);

  const send = async (textOverride) => {
    const text = (textOverride ?? input).trim();
    if (!text && !images.length) return;
    if (!model) {
      toast(provider === 'azure' ? t('ai.deploymentMissing') : t('ai.modelMissing'), 'warning');
      setShowSettings(true);
      return;
    }
    const level0 = REASONING_LEVELS.some((l) => l.id === settings.reasoning) ? settings.reasoning : 'medium';
    const now = new Date().toISOString();
    const userMsg = { id: msgId(), role: 'user', parts: [...images, { type: 'text', text }], createdAt: now };
    const assistantMsg = { id: msgId(), role: 'assistant', parts: [{ type: 'text', text: '' }], createdAt: now, attemptAt: now, model: `${provider}/${model}`, level: level0, pending: true };
    const history = [...chat, userMsg];
    setChat([...history, assistantMsg]);
    setInput('');
    setImages([]);
    setBusy(true);

    const project = s.getProject();
    const contextText = buildContext(project, { screen: s.screen, selection: s.selection, issues: s.issues, opts: FULL_CONTEXT });
    // Historique : 20 derniers messages, images uniquement pour le dernier
    const recent = history.slice(-20).map((m, i, arr) => ({
      role: m.role,
      parts: m.parts
        .filter((p) => p.type === 'text' || (p.type === 'image' && i === arr.length - 1))
        .map((p) => (p.type === 'text' ? { type: 'text', text: p.text || ' ' } : p)),
    }));
    const last = recent[recent.length - 1];
    if (contextText) last.parts = [{ type: 'text', text: `# Contexte actuel du projet (généré automatiquement)\n${contextText}\n\n# Demande\n` }, ...last.parts];

    const update = (patch) => setChat((list) => list.map((m) => (m.id === assistantMsg.id ? { ...m, ...patch } : m)));
    const payload = {
      provider,
      model,
      apiKey: settings.keys[provider] || '',
      endpoint: provider === 'azure' ? settings.azureEndpoint : undefined,
      maxTokens: settings.maxTokens,
      system: buildSystemPrompt(project),
      messages: recent,
    };
    const slowAfter = Math.max(0, Number(settings.slowAfter) || 0);
    const maxDuration = Math.max(30, Number(settings.maxDuration) || 300);
    let level = level0;
    const notices = [];
    try {
      for (;;) {
        const r = await streamOnce({ ...payload, reasoning: level }, { slowMs: slowAfter * 1000, maxMs: maxDuration * 1000 }, update);
        const next = simplerLevel(level);
        // Réflexion trop longue (aucun texte reçu) : nouvelle tentative avec une réflexion plus simple
        if (next && (r.reason === 'slow' || (r.reason === 'stall' && !r.text))) {
          notices.push(
            r.reason === 'slow'
              ? t('ai.noticeSlow', { seconds: slowAfter, from: reasoningLabel(level), to: reasoningLabel(next) })
              : t('ai.noticeStalled', { to: reasoningLabel(next) }),
          );
          level = next;
          update({ parts: [{ type: 'text', text: '' }], notices: [...notices], level, attemptAt: new Date().toISOString() });
          continue;
        }
        const patch = { parts: [{ type: 'text', text: r.text }], pending: false, level, notices: notices.length ? [...notices] : undefined, error: r.error || null, truncated: !!r.truncated };
        if (r.reason === 'user') patch.stopped = true;
        else if (r.reason === 'max') patch.error = `${t('ai.maxDurationReached', { seconds: maxDuration })}${r.text ? ` ${t('ai.partialKept')}` : ''}`;
        else if (r.reason === 'stall') patch.error = `${t('ai.providerStalled', { seconds: STALL_MS / 1000 })}${r.text ? ` ${t('ai.partialKept')}` : ''}`;
        update(patch);
        break;
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  };

  /**
   * Une tentative de génération en flux, surveillée par trois délais :
   *  - slowMs : toujours aucun texte (réflexion trop longue) → 'slow', seulement si une réflexion plus simple existe ;
   *  - STALL_MS : plus rien ne parvient une fois le texte commencé → 'stall' ;
   *  - maxMs : durée totale maximale → 'max'.
   */
  const streamOnce = async (body, { slowMs, maxMs }, update) => {
    const controller = new AbortController();
    let reason = null;
    const abort = (why) => {
      if (!reason) reason = why;
      controller.abort();
    };
    abortRef.current = { abort: () => abort('user') };
    const t0 = Date.now();
    let lastActivity = t0;
    let gotText = false;
    let acc = '';
    const canSimplify = !!simplerLevel(body.reasoning);
    const watchdog = setInterval(() => {
      const now = Date.now();
      if (now - t0 > maxMs) abort('max');
      else if (!gotText && slowMs > 0 && canSimplify && now - t0 > slowMs) abort('slow');
      else if (gotText && now - lastActivity > STALL_MS) abort('stall');
    }, 500);
    try {
      const res = await fetch('/api/ai', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        return { text: '', error: j.error || t('ai.errorStatus', { status: res.status }) };
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let lastFlush = 0;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        lastActivity = Date.now();
        acc += dec.decode(value, { stream: true });
        if (!gotText && /\S/.test(cleanStream(acc))) gotText = true;
        const tick = performance.now();
        if (gotText && tick - lastFlush > 60) {
          lastFlush = tick;
          update({ parts: [{ type: 'text', text: cleanStream(acc) }] });
        }
      }
      const errM = /\u0000ERREUR: ([\s\S]*)$/.exec(acc);
      return { text: cleanStream(acc), error: errM ? errM[1] : null, truncated: acc.includes('\u0000TRONQUÉ') };
    } catch (e) {
      if (e.name === 'AbortError') return { text: cleanStream(acc), reason: reason || 'user' };
      return { text: cleanStream(acc), error: e.message };
    } finally {
      clearInterval(watchdog);
    }
  };

  const stop = () => abortRef.current?.abort();

  const onPaste = async (e) => {
    const files = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;
    e.preventDefault();
    try {
      const imgs = await Promise.all(files.map((f) => readImage(f, t)));
      setImages((cur) => [...cur, ...imgs]);
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  return (
    <aside className="ai-panel" hidden={hidden} aria-hidden={hidden} data-tour="ai">
      <div className="panel-header">
        <Icon name="Sparkle" size={18} className="ai-mark" />
        <h2>{t('ai.title')}</h2>
        <span className="spacer" />
        <button
          className="icon-btn"
          type="button"
          title={`${t('ai.settingsButton')} — ${PROVIDERS[provider].label}${model ? ` · ${model}` : ''}`}
          aria-label={t('ai.settingsButton')}
          onClick={() => setShowSettings(true)}
        >
          <Icon name="Settings" size={16} />
        </button>
        <button
          className="icon-btn"
          type="button"
          title={t('ai.newChat')}
          onClick={() => {
            if (busy) stop();
            setChat([]);
          }}
        >
          <Icon name="Compose" size={16} />
        </button>
        <button className="icon-btn" type="button" onClick={() => s.setAiOpen(false)} aria-label={t('common.close')}>
          <Icon name="Cancel" />
        </button>
      </div>
      {showSettings ? <AiSettings settings={settings} save={saveSettings} verification={verification} onClose={() => setShowSettings(false)} /> : null}

      <div className="ai-messages" ref={listRef}>
        {!chat.length ? (
          <div className="ai-welcome">
            <Icon name="Bot" size={32} />
            <p>{t('ai.welcome')}</p>
            {!configured ? (
              <button className="btn btn-primary btn-sm" type="button" onClick={() => setShowSettings(true)}>
                <Icon name="Key" size={14} /> {t('ai.configure')}
              </button>
            ) : null}
            <div className="ai-quick">
              {QUICK_PROMPTS.map((q) => (
                <button key={q.id} type="button" className="chip-toggle" onClick={() => (q.fill ? setInput(q.text) : send(q.text))}>
                  <Icon name={q.icon} size={14} /> {q.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {chat.map((m) => (
          <MessageView key={m.id} msg={m} />
        ))}
      </div>

      <div className="ai-composer">
        {images.length ? (
          <div className="ai-attachments">
            {images.map((im, i) => (
              <span key={i} className="ai-thumb">
                <img src={`data:${im.mediaType};base64,${im.data}`} alt={im.name || t('ai.imageAlt')} />
                <button type="button" onClick={() => setImages(images.filter((_, j) => j !== i))} aria-label={t('common.remove')}>
                  ×
                </button>
              </span>
            ))}
          </div>
        ) : null}
        <div className="ai-input-row">
          <textarea
            className="ai-input"
            rows={3}
            value={input}
            placeholder={t('ai.inputPlaceholder')}
            onChange={(e) => setInput(e.target.value)}
            onPaste={onPaste}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                if (!busy) send();
              }
            }}
          />
          <div className="ai-input-actions">
            <button className="icon-btn" type="button" title={t('ai.attachImage')} onClick={() => fileRef.current?.click()}>
              <Icon name="Image" size={18} />
            </button>
            {busy ? (
              <button className="icon-btn ai-stop" type="button" onClick={stop} title={t('ai.stop')}>
                <Icon name="Stop" size={18} />
              </button>
            ) : (
              <button className="icon-btn ai-send" type="button" onClick={() => send()} disabled={!input.trim() && !images.length} title={t('ai.send')}>
                <Icon name="Send" size={18} />
              </button>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: 'none' }}
            onChange={async (e) => {
              try {
                const imgs = await Promise.all([...e.target.files].map((f) => readImage(f, t)));
                setImages((cur) => [...cur, ...imgs]);
              } catch (err) {
                toast(err.message, 'error');
              }
              e.target.value = '';
            }}
          />
        </div>
      </div>
    </aside>
  );
}

function AiSettings({ settings, save, verification, onClose }) {
  const { t } = useI18n();
  const provider = settings.provider;
  const azure = provider === 'azure';
  const [showKey, setShowKey] = useState(false);
  const { state, valid, verify, canVerify } = verification;
  const running = !!state?.running;
  const current = settings.models[provider] || '';
  const verifiedList = azure ? null : valid?.models || null;
  const endpoint = azureEndpoint(settings.azureEndpoint);
  const setModel = (v) => save({ models: { ...settings.models, [provider]: v } });
  return (
    <Dialog
      title={t('ai.settingsDialogTitle')}
      icon="Sparkle"
      onClose={onClose}
      footer={
        <>
          <span className="field-hint">{t('ai.savedLocally')}</span>
          <span className="spacer" />
          <button className="btn btn-primary" type="button" onClick={onClose}>
            {t('common.done')}
          </button>
        </>
      }
    >
      <div className="ai-settings">
        <h3 className="ai-settings-title">{t('ai.providerSection')}</h3>
        <div className="field">
          <label htmlFor="ai-provider">{t('ai.service')}</label>
          <select id="ai-provider" className="select" value={provider} onChange={(e) => save({ provider: e.target.value })}>
            {Object.entries(PROVIDERS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
        </div>
        {azure ? (
          <div className="field">
            <label htmlFor="ai-endpoint">{t('ai.endpoint')}</label>
            <input
              id="ai-endpoint"
              className={`input mono${settings.azureEndpoint && !endpoint ? ' is-invalid' : ''}`}
              placeholder={t('ai.endpointPlaceholder')}
              value={settings.azureEndpoint || ''}
              onChange={(e) => {
                const v = e.target.value.trim();
                // URL complète copiée depuis le portail : le déploiement qu'elle contient est repris
                const dep = azureDeploymentFromUrl(v);
                save(dep && !current ? { azureEndpoint: v, models: { ...settings.models, azure: dep } } : { azureEndpoint: v });
              }}
              autoComplete="off"
              spellCheck={false}
            />
            {settings.azureEndpoint && !endpoint ? (
              <div className="field-hint sev-error">{t('ai.endpointInvalid')}</div>
            ) : (
              <div className="field-hint">
                {endpoint && endpoint !== settings.azureEndpoint ? <span className="mono">{endpoint} · </span> : null}
                {t('ai.endpointHint')}
              </div>
            )}
          </div>
        ) : null}
        <div className="field">
          <label htmlFor="ai-key">{t('ai.apiKey')}</label>
          <div className="row">
            <input
              id="ai-key"
              className="input mono"
              type={showKey ? 'text' : 'password'}
              placeholder={PROVIDERS[provider].keyHint(t)}
              value={settings.keys[provider] || ''}
              onChange={(e) => save({ keys: { ...settings.keys, [provider]: e.target.value.trim() } })}
              autoComplete="off"
            />
            <button className="icon-btn" type="button" onClick={() => setShowKey(!showKey)} title={showKey ? t('ai.hideKey') : t('ai.showKey')}>
              <Icon name={showKey ? 'EyeOff' : 'Eye'} size={16} />
            </button>
          </div>
          <div className="field-hint">{t('ai.apiKeyHint')}</div>
        </div>
        <div className="field">
          <label htmlFor="ai-model">{azure ? t('ai.deployment') : t('ai.model')}</label>
          <div className="row">
            {verifiedList?.length ? (
              <select id="ai-model" className="select mono" value={current} onChange={(e) => setModel(e.target.value)}>
                {!verifiedList.some((m) => m.id === current) ? <option value={current}>{current || '—'}</option> : null}
                {verifiedList.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label && m.label !== m.id ? `${m.label} — ${m.id}` : m.id}
                  </option>
                ))}
              </select>
            ) : (
              <>
                <input
                  id="ai-model"
                  className="input mono"
                  list="ai-models"
                  placeholder={azure ? t('ai.deploymentPlaceholder') : ''}
                  value={current}
                  onChange={(e) => setModel(e.target.value.trim())}
                  autoComplete="off"
                  spellCheck={false}
                />
                <datalist id="ai-models">
                  {PROVIDERS[provider].models.map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              </>
            )}
            <button className="btn" type="button" onClick={verify} disabled={running || !canVerify} title={azure ? t('ai.verifyDeploymentTitle') : t('ai.verifyModelsTitle')}>
              {running ? <Spinner size={12} /> : <Icon name="ArrowSync" size={14} />} {t('ai.verify')}
            </button>
          </div>
          <ModelCheckStatus state={state} valid={valid} canVerify={canVerify} provider={provider} />
        </div>

        <h3 className="ai-settings-title">{t('ai.generationSection')}</h3>
        <div className="field">
          <label htmlFor="ai-reasoning">{t('ai.reasoning')}</label>
          <select id="ai-reasoning" className="select" value={settings.reasoning || 'medium'} onChange={(e) => save({ reasoning: e.target.value })}>
            {REASONING_LEVELS.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
          <div className="field-hint">{t('ai.reasoningHint')}</div>
        </div>
        <div className="ai-settings-grid">
          <div className="field">
            <label htmlFor="ai-slow" title={t('ai.slowAfterTitle')}>
              {t('ai.slowAfter')}
            </label>
            <input id="ai-slow" className="input" type="number" min={0} max={600} step={10} value={settings.slowAfter ?? 60} onChange={(e) => save({ slowAfter: Math.max(0, Number(e.target.value) || 0) })} />
          </div>
          <div className="field">
            <label htmlFor="ai-max">{t('ai.maxDuration')}</label>
            <input id="ai-max" className="input" type="number" min={30} max={1800} step={30} value={settings.maxDuration ?? 300} onChange={(e) => save({ maxDuration: Math.max(30, Number(e.target.value) || 300) })} />
          </div>
          <div className="field">
            <label htmlFor="ai-tokens">{t('ai.maxTokens')}</label>
            <input id="ai-tokens" className="input" type="number" min={1000} max={64000} step={1000} value={settings.maxTokens} onChange={(e) => save({ maxTokens: Number(e.target.value) || 16000 })} />
          </div>
        </div>
        <div className="field-hint">{t('ai.timingHint')}</div>
      </div>
    </Dialog>
  );
}

function ModelCheckStatus({ state, valid, canVerify, provider }) {
  const { t, formatDate } = useI18n();
  const azure = provider === 'azure';
  if (state?.running) {
    return (
      <div className="field-hint ai-check">
        <Spinner size={12} />{' '}
        {azure ? t('ai.checkingDeployment') : state.total ? t('ai.checkingModels', { done: state.done, total: state.total }) : t('ai.fetchingModels')}
      </div>
    );
  }
  if (state?.error) {
    return (
      <div className="field-hint ai-check sev-error">
        <Icon name="Error" size={12} /> {state.error}
      </div>
    );
  }
  if (valid) {
    const at = formatDate(valid.at, { dateStyle: 'short', timeStyle: 'short' });
    if (azure) {
      const failed = valid.excluded?.[0];
      return (
        <div className="field-hint ai-check">
          {valid.models.length ? (
            <span className="sev-ok">
              <Icon name="CheckmarkCircle" size={12} /> {t('ai.deploymentOk')}
            </span>
          ) : (
            <span className="sev-error">
              <Icon name="Error" size={12} /> {failed ? t('ai.deploymentFailedReason', { reason: failed.reason }) : t('ai.deploymentFailed')}
            </span>
          )}
          <span> · {t('ai.verifiedOn', { date: at })}</span>
        </div>
      );
    }
    return (
      <div className="field-hint ai-check">
        {valid.models.length ? (
          <span className="sev-ok">
            <Icon name="CheckmarkCircle" size={12} /> {t('ai.modelsAvailable', { count: valid.models.length })}
          </span>
        ) : (
          <span className="sev-error">
            <Icon name="Error" size={12} /> {t('ai.noModelResponds')}
          </span>
        )}
        <span> · {t('ai.verifiedOn', { date: at })}</span>
        {valid.excluded?.length ? (
          <details className="ai-excluded">
            <summary>{t('ai.modelsExcluded', { count: valid.excluded.length })}</summary>
            <ul>
              {valid.excluded.map((m) => (
                <li key={m.id}>
                  <span className="mono">{m.id}</span> — {m.reason}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>
    );
  }
  return (
    <div className="field-hint ai-check">
      {canVerify ? t('ai.checkPending') : azure ? t('ai.azureCheckHint') : t('ai.keyCheckHint')}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Affichage des messages
// ---------------------------------------------------------------------------
function MessageView({ msg }) {
  const { t } = useI18n();
  const text = msg.parts.filter((p) => p.type === 'text').map((p) => p.text).join('\n');
  const imgs = msg.parts.filter((p) => p.type === 'image');
  if (msg.role === 'user') {
    return (
      <div className="ai-msg user">
        {imgs.length ? (
          <div className="ai-attachments">
            {imgs.map((im, i) => (
              <span key={i} className="ai-thumb">
                <img src={`data:${im.mediaType};base64,${im.data}`} alt="" />
              </span>
            ))}
          </div>
        ) : null}
        <div className="ai-bubble">{text}</div>
      </div>
    );
  }
  const blocks = splitBlocks(text);
  return (
    <div className="ai-msg assistant">
      <div className="ai-meta">
        <Icon name="Sparkle" size={12} /> {msg.model || t('ai.assistant')}
        {msg.level ? <span className="muted"> · {t('ai.reasoningMeta', { level: reasoningLabel(msg.level).toLowerCase() })}</span> : null}
        {msg.pending ? <Spinner size={12} /> : null}
      </div>
      {(msg.notices || []).map((n, i) => (
        <div key={i} className="message-bar info ai-notice">
          <Icon name="Clock" size={14} /> {n}
        </div>
      ))}
      {blocks.map((b, i) => (b.type === 'text' ? <Markdown key={i} text={b.text} /> : <CodeBlock key={i} block={b} prevText={blocks[i - 1]?.type === 'text' ? blocks[i - 1].text : ''} pending={msg.pending} />))}
      {msg.pending && !text ? (
        <div className="muted small">
          {t('ai.thinking')} <Elapsed since={msg.attemptAt || msg.createdAt} />
        </div>
      ) : null}
      {msg.error ? (
        <div className="message-bar error">
          <Icon name="Error" size={14} /> {msg.error}
        </div>
      ) : null}
      {msg.truncated ? <div className="message-bar warning">{t('ai.truncated')}</div> : null}
      {msg.stopped ? <div className="muted small">{t('ai.stopped')}</div> : null}
    </div>
  );
}

function inline(text, keyBase) {
  const out = [];
  const re = /(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\((https?:[^)]+)\))/g;
  let last = 0;
  let m;
  let k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    if (t.startsWith('`')) out.push(<code key={`${keyBase}-${k++}`}>{t.slice(1, -1)}</code>);
    else if (t.startsWith('**')) out.push(<b key={`${keyBase}-${k++}`}>{t.slice(2, -2)}</b>);
    else {
      const lm = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(t);
      out.push(
        <a key={`${keyBase}-${k++}`} href={lm[2]} target="_blank" rel="noreferrer">
          {lm[1]}
        </a>,
      );
    }
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function Markdown({ text }) {
  const lines = text.replace(/^\n+|\n+$/g, '').split('\n');
  const out = [];
  let list = null;
  const flush = () => {
    if (list) {
      out.push(
        list.ordered ? (
          <ol key={out.length}>{list.items.map((it, i) => <li key={i}>{inline(it, `li${out.length}-${i}`)}</li>)}</ol>
        ) : (
          <ul key={out.length}>{list.items.map((it, i) => <li key={i}>{inline(it, `li${out.length}-${i}`)}</li>)}</ul>
        ),
      );
      list = null;
    }
  };
  lines.forEach((l, i) => {
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(l);
    const num = /^\s*\d+[.)]\s+(.*)$/.exec(l);
    const head = /^(#{1,4})\s+(.*)$/.exec(l);
    if (bullet || num) {
      const ordered = !!num;
      if (!list || list.ordered !== ordered) {
        flush();
        list = { ordered, items: [] };
      }
      list.items.push((bullet || num)[1]);
      return;
    }
    flush();
    if (head) out.push(<div key={i} className={`ai-h${head[1].length}`}>{inline(head[2], `h${i}`)}</div>);
    else if (l.trim()) out.push(<p key={i}>{inline(l, `p${i}`)}</p>);
  });
  flush();
  return <div className="ai-md">{out}</div>;
}

function CodeBlock({ block, prevText, pending }) {
  const s = useStudio();
  const { t, locale } = useI18n();
  // libellé de la dernière action appliquée : (t) => texte, traduit à l'affichage
  const [done, setDone] = useState(null);
  // aperçu figé au moment de l'application (sinon il comparerait au projet déjà modifié)
  const [frozen, setFrozen] = useState(null);
  const [showCode, setShowCode] = useState(false);
  const { lang, code, closed, attrs } = block;
  const isYaml = lang === 'yaml' || lang === 'yml' || (!lang && /^(Screens:|- [\p{L}_][\p{L}\p{N}_ ]*:|App:|ComponentDefinitions:)/mu.test(code));
  // locale : messages de validation et titres de l'aperçu traduits
  const analysis = useMemo(() => (isYaml && closed ? analyzeYamlBlock(code, s.getProject(), s.screenId) : null), [isYaml, closed, code, s, locale]);
  const isFx = lang === 'powerfx' || lang === 'fx' || lang === 'power-fx';
  const fxTarget = useMemo(() => (isFx ? formulaTarget(prevText, s.project) : null), [isFx, prevText, s.project]);
  const preview = useMemo(() => {
    if (frozen) return frozen;
    const p = analysis ? changePreview(s.project, analysis, s.screenId) : isFx && closed && fxTarget ? formulaPreview(s.project, fxTarget.control, fxTarget.prop, code) : null;
    return p ? { ...p, ...computeDiff(p.before, p.after) } : null;
  }, [frozen, analysis, s.project, s.screenId, isFx, closed, fxTarget, code, locale]);

  // label : (t) => texte de confirmation, retraduit si la langue change
  const run = (fn, label) => {
    const r = fn(s.getProject());
    if (r.error) {
      toast(r.error, 'error');
      return;
    }
    setFrozen(preview);
    s.update(r.project);
    if (r.selectId) setTimeout(() => s.select(r.selectId), 0);
    setDone(() => label);
    const renamed = r.renamed?.size ? ` ${t('ai.renamed', { list: [...r.renamed].map(([a, b]) => `${a}→${b}`).join(', ') })}` : '';
    toast(`${label(t)}${renamed} — ${t('ai.undoHint')}`, 'success');
  };

  const actions = [];
  if (analysis && !analysis.error) {
    const p = analysis.parsed;
    if (p.kind === 'screens' && p.screens.length) {
      // écran existant (même nom) : remplacement ; nouveau nom : ajout, le remplacement de l'écran courant restant possible
      const replaces = p.screens.length === 1 && s.project.screens.some((x) => x.name === p.screens[0].name);
      if (replaces) actions.push({ label: t('ai.applyToScreen', { name: p.screens[0].name }), icon: 'Check', primary: true, onClick: () => run((pr) => applyScreenReplace(pr, p, s.screenId), (t) => t('ai.screenUpdated')) });
      actions.push({ label: p.screens.length > 1 ? t('ai.addScreens', { count: p.screens.length }) : t('ai.addAsNewScreen'), icon: 'Add', primary: !replaces, onClick: () => run((pr) => applyScreensAdd(pr, p), (t) => t('ai.screenAdded')) });
      if (p.screens.length === 1 && !replaces) actions.push({ label: t('ai.replaceCurrentScreen'), icon: 'Check', onClick: () => run((pr) => applyScreenReplace(pr, p, s.screenId), (t) => t('ai.screenUpdated')) });
    }
    if (p.kind === 'controls' && p.controls.length) {
      const dir = analysis.directive;
      // remplacement : directive explicite, ou contrôle unique portant le nom d'un contrôle existant
      const replaceName = preview?.action === 'replace' ? preview.target : null;
      if (replaceName) {
        actions.push({ label: t('ai.replaceControl', { name: replaceName }), icon: 'Check', primary: true, onClick: () => run((pr) => applyControlReplace(pr, p, replaceName), (t) => t('ai.controlReplaced', { name: replaceName })) });
      } else if (dir?.kind === 'insert-into') {
        actions.push({
          label: t('ai.insertInto', { name: dir.target }),
          icon: 'Add',
          primary: true,
          onClick: () =>
            run((pr) => {
              const target = findByName(pr, dir.target);
              if (!target) return { error: t('ai.targetNotFound', { name: dir.target }) };
              return applyControlsInsert(pr, p, target.node._id);
            }, (t) => t('ai.controlsInserted')),
        });
      }
      actions.push({
        label: t('ai.insertIntoSelection'),
        icon: 'Add',
        primary: !dir && !replaceName,
        onClick: () => run((pr) => applyControlsInsert(pr, p, insertionTarget(pr, s.selectedId, s.screenId)), (t) => t('ai.controlsInserted')),
      });
    }
    if (p.components.length) {
      const existing = p.components.filter((c) => (s.project.components || []).some((x) => x.name === c.name)).length;
      actions.push({
        label:
          p.components.length > 1
            ? t(existing ? 'ai.updateComponents' : 'ai.addComponents', { count: p.components.length })
            : existing
              ? t('ai.updateComponent', { name: p.components[0].name })
              : t('ai.addComponent', { name: p.components[0].name }),
        icon: 'Component',
        primary: p.kind === 'components',
        onClick: () => run((pr) => applyComponents(pr, p), (t) => t('ai.componentsApplied')),
      });
    }
    if (p.kind === 'app' || p.app) {
      actions.push({ label: t('ai.applyToApp'), icon: 'Check', primary: true, onClick: () => run((pr) => ({ project: { ...pr, app: { ...p.app, _id: pr.app?._id || p.app._id } } }), (t) => t('ai.appUpdated')) });
    }
  }
  if (isFx && closed && fxTarget) {
    actions.push({ label: t('ai.applyToProperty', { target: `${fxTarget.control}.${fxTarget.prop}` }), icon: 'Check', primary: true, onClick: () => run((pr) => applyFormula(pr, fxTarget.control, fxTarget.prop, code), (t) => t('ai.formulaApplied')) });
  }
  if (lang === 'json' && closed) {
    const table = attrs.table;
    if (table) {
      actions.push({ label: t('ai.loadInto', { table }), icon: 'Table', primary: true, onClick: () => run((pr) => applyTableData(pr, table, code), (t) => t('ai.dataLoaded', { table })) });
      actions.push({ label: t('ai.appendRows'), icon: 'Add', onClick: () => run((pr) => applyTableData(pr, table, code, 'append'), (t) => t('ai.rowsAppended', { table })) });
    }
  }

  return (
    <div className="ai-code">
      <div className="ai-code-head">
        <span className="mono small">{lang || t('ai.code')}{attrs.table ? ` · ${attrs.table}` : ''}</span>
        {analysis?.error ? (
          <span className="sev-error small" title={analysis.error}>
            <Icon name="Error" size={12} /> {t('ai.invalidYaml')}
          </span>
        ) : analysis?.summary ? (
          analysis.summary.error ? (
            <span className="sev-error small">
              <Icon name="Error" size={12} /> {t('ai.errorCount', { count: analysis.summary.error })}
            </span>
          ) : analysis.summary.warning ? (
            <span className="sev-warning small" title={analysis.issues.slice(0, 8).map((i) => t('ai.issueLine', { target: `${i.controlName}.${i.property || ''}`, message: i.message })).join('\n')}>
              <Icon name="Warning" size={12} /> {t('ai.warningCount', { count: analysis.summary.warning })}
            </span>
          ) : (
            <span className="sev-ok small">
              <Icon name="CheckmarkCircle" size={12} /> {t('ai.valid')}
            </span>
          )
        ) : null}
        <span className="spacer" />
        {preview ? (
          <button className={`icon-btn sm${showCode ? ' is-active' : ''}`} type="button" title={showCode ? t('ai.showChanges') : t('ai.showCode')} onClick={() => setShowCode(!showCode)}>
            <Icon name="Code" size={12} />
          </button>
        ) : null}
        <button className="icon-btn sm" type="button" title={t('common.copy')} onClick={async () => toast((await copyText(code)) ? t('common.copied') : t('common.copyFailed'), 'success')}>
          <Icon name="Copy" size={12} />
        </button>
      </div>
      {preview && !showCode && !pending ? (
        <div className="ai-change">
          <div className="ai-change-head">
            {t('ai.changesHead', { title: preview.title })} {preview.stats.changed ? <DiffStats stats={preview.stats} /> : null}
          </div>
          <DiffView ops={preview.ops} maxHeight={340} emptyText={t('ai.noDifference')} />
        </div>
      ) : (
        <pre className="ai-code-body">
          <code>{code}</code>
        </pre>
      )}
      {analysis?.error ? <div className="adv-err">{analysis.error}</div> : null}
      {analysis?.issues?.some((i) => i.severity === 'error') ? (
        <ul className="ai-issues">
          {analysis.issues
            .filter((i) => i.severity === 'error')
            .slice(0, 5)
            .map((i, k) => (
              <li key={k}>{t('ai.issueLine', { target: `${i.controlName}${i.property ? `.${i.property}` : ''}`, message: i.message })}</li>
            ))}
        </ul>
      ) : null}
      {actions.length && !pending ? (
        <div className="ai-code-actions">
          {actions.map((a, i) => (
            <button key={i} type="button" className={`btn btn-sm${a.primary ? ' btn-primary' : ''}`} onClick={a.onClick}>
              <Icon name={a.icon} size={14} /> {a.label}
            </button>
          ))}
          {done ? (
            <span className="sev-ok small">
              <Icon name="CheckmarkCircle" size={12} /> {done(t)}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
