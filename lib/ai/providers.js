// Fournisseurs IA : requêtes de vérification des modèles, niveaux de réflexion, classement des erreurs.
// Module utilisé par les routes API (serveur) et par le volet de l'assistant (navigateur) :
// les libellés ne sont traduits qu'à l'affichage (getters), jamais au chargement du module.
import { t } from '../i18n/index.js';

export const ENV_KEYS = { anthropic: 'ANTHROPIC_API_KEY', openai: 'OPENAI_API_KEY', gemini: 'GEMINI_API_KEY', mistral: 'MISTRAL_API_KEY', azure: 'AZURE_OPENAI_API_KEY' };
// Point de terminaison Azure OpenAI utilisé par le serveur quand aucun n'est saisi dans les paramètres
export const AZURE_ENDPOINT_ENV = 'AZURE_OPENAI_ENDPOINT';

// Fournisseurs à l'API de type OpenAI (/chat/completions) ; Azure : API v1 de la ressource, le modèle est le nom du déploiement
export const OPENAI_LIKE = new Set(['openai', 'mistral', 'azure']);
export const FIXED_BASES = { openai: 'https://api.openai.com/v1', mistral: 'https://api.mistral.ai/v1' };

const AZURE_HOST = /\.(openai\.azure\.(com|us|cn)|cognitiveservices\.azure\.(com|us|cn)|services\.ai\.azure\.com)$/i;

/**
 * Point de terminaison d'une ressource Azure OpenAI (https://ma-ressource.openai.azure.com), ou null.
 * Accepte le nom seul de la ressource ou une URL copiée depuis le portail Azure (le chemin est ignoré).
 */
export function azureEndpoint(raw) {
  const v = String(raw || '').trim();
  if (!v) return null;
  if (/^[a-z0-9][a-z0-9-]{0,62}$/i.test(v)) return `https://${v.toLowerCase()}.openai.azure.com`;
  try {
    const u = new URL(/^[a-z]+:\/\//i.test(v) ? v : `https://${v}`);
    if (u.protocol !== 'https:' || u.port || !AZURE_HOST.test(u.hostname)) return null;
    return `https://${u.hostname.toLowerCase()}`;
  } catch {
    return null;
  }
}

/** Nom du déploiement contenu dans une URL Azure copiée depuis le portail (…/deployments/<nom>/…) */
export function azureDeploymentFromUrl(raw) {
  const m = /\/deployments\/([^/?#]+)/i.exec(String(raw || ''));
  return m ? decodeURIComponent(m[1]) : '';
}

/** URL de base et en-têtes d'authentification d'un fournisseur de type OpenAI (null : point de terminaison Azure invalide) */
export function openaiLikeTarget(provider, apiKey, endpoint) {
  if (provider === 'azure') {
    const origin = azureEndpoint(endpoint);
    return origin ? { base: `${origin}/openai/v1`, headers: { 'api-key': apiKey } } : null;
  }
  return { base: FIXED_BASES[provider], headers: apiKey ? { authorization: `Bearer ${apiKey}` } : {} };
}

/** Nom du paramètre de longueur maximale de réponse */
export const maxTokensParam = (provider) => (provider === 'openai' || provider === 'azure' ? 'max_completion_tokens' : 'max_tokens');

// Du plus approfondi au plus simple ; libellé dans la langue de l'interface
export const REASONING_LEVELS = [
  {
    id: 'high',
    get label() {
      return t('ai.reasoningHigh');
    },
  },
  {
    id: 'medium',
    get label() {
      return t('ai.reasoningMedium');
    },
  },
  {
    id: 'low',
    get label() {
      return t('ai.reasoningLow');
    },
  },
  {
    id: 'none',
    get label() {
      return t('ai.reasoningNone');
    },
  },
];

/** Libellé d'un niveau de réflexion (niveau inconnu : « Standard ») */
export function reasoningLabel(level) {
  return (REASONING_LEVELS.find((l) => l.id === level) || REASONING_LEVELS[1]).label;
}

/** Niveau de repli quand la réflexion est trop longue (null : plus de repli possible) */
export function simplerLevel(level) {
  if (level === 'high' || level === 'medium') return 'low';
  if (level === 'low') return 'none';
  return null;
}

/**
 * Paramètres de réflexion à fusionner dans le corps de la requête du fournisseur.
 * Les modèles qui ne les acceptent pas renvoient une erreur 400 : la route relance alors sans ces paramètres.
 */
export function reasoningParams(provider, model, level) {
  const m = String(model || '').toLowerCase();
  if (!level) return {};
  if (provider === 'anthropic') {
    // Réflexion adaptative : la profondeur se règle avec effort ; le résumé de la réflexion sert de signe d'activité.
    if (level === 'none') return { output_config: { effort: 'low' } };
    return { thinking: { type: 'adaptive', display: 'summarized' }, output_config: { effort: level } };
  }
  if (provider === 'openai' || provider === 'azure') {
    // Azure : le déploiement porte en général le nom du modèle (« gpt-5-mini », « prod-o4-mini »…)
    if (!(provider === 'azure' ? /(^|[^a-z0-9])(o\d|gpt-5)/ : /^(o\d|gpt-5)/).test(m)) return {};
    return { reasoning_effort: { high: 'high', medium: 'medium', low: 'low', none: 'minimal' }[level] };
  }
  if (provider === 'gemini') {
    if (/gemini-3/.test(m)) return { thinkingConfig: { thinkingLevel: level === 'high' || level === 'medium' ? 'high' : 'low' } };
    if (/gemini-2\.5/.test(m)) {
      const budget = { high: -1, medium: 8192, low: 1024, none: /pro/.test(m) ? 128 : 0 }[level];
      return { thinkingConfig: { thinkingBudget: budget } };
    }
    return {};
  }
  return {};
}

/** L'erreur 400 vient-elle des paramètres de réflexion (modèle qui ne les prend pas en charge) ? */
export function isReasoningParamError(status, message) {
  return status === 400 && /effort|reasoning|thinking|output_config|budget/i.test(String(message || ''));
}

// ---------------------------------------------------------------------------
// Liste et vérification des modèles
// ---------------------------------------------------------------------------

const OPENAI_EXCLUDE = /(audio|realtime|transcribe|tts|image|embedding|moderation|search|instruct|davinci|babbage|dall-e|whisper|sora|codex|computer-use|deep-research)/i;
const MISTRAL_EXCLUDE = /(embed|moderation|ocr|transcribe|tts)/i;
const GEMINI_EXCLUDE = /(embedding|aqa|tts|image|native-audio|live|robotics|computer-use|imagen|veo)/i;

/** Modèles de conversation parmi ceux renvoyés par l'API de liste du fournisseur */
export function chatModelsFromList(provider, json) {
  if (provider === 'anthropic') return (json.data || []).map((m) => ({ id: m.id, label: m.display_name || m.id }));
  if (provider === 'openai') {
    return (json.data || [])
      .map((m) => m.id)
      .filter((id) => /^(gpt|o\d|chatgpt)/i.test(id) && !OPENAI_EXCLUDE.test(id))
      .sort()
      .map((id) => ({ id, label: id }));
  }
  if (provider === 'mistral') {
    const seen = new Set();
    return (json.data || [])
      .filter((m) => m.capabilities?.completion_chat !== false && !MISTRAL_EXCLUDE.test(m.id) && !seen.has(m.id) && seen.add(m.id))
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((m) => ({ id: m.id, label: m.name && m.name !== m.id ? m.name : m.id }));
  }
  if (provider === 'gemini') {
    return (json.models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map((m) => ({ id: m.name.replace(/^models\//, ''), label: m.displayName || m.name }))
      .filter((m) => !GEMINI_EXCLUDE.test(m.id));
  }
  return [];
}

/** Requête minimale (1 réponse très courte) pour vérifier qu'un modèle répond avec cette clé */
export function probeRequest(provider, { model, apiKey, endpoint }) {
  const ping = 'Réponds « ok ».';
  if (provider === 'anthropic') {
    return {
      url: 'https://api.anthropic.com/v1/messages',
      init: {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model, max_tokens: 16, messages: [{ role: 'user', content: ping }] }),
      },
    };
  }
  if (OPENAI_LIKE.has(provider)) {
    const target = openaiLikeTarget(provider, apiKey, endpoint);
    if (!target) return null;
    const body = { model, messages: [{ role: 'user', content: ping }], [maxTokensParam(provider)]: 16 };
    return { url: `${target.base}/chat/completions`, init: { method: 'POST', headers: { 'content-type': 'application/json', ...target.headers }, body: JSON.stringify(body) } };
  }
  if (provider === 'gemini') {
    return {
      url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      init: {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: ping }] }], generationConfig: { maxOutputTokens: 16 } }),
      },
    };
  }
  return null;
}

/**
 * Classe la réponse d'une requête de vérification.
 * @returns {'ok'|'unavailable'|'auth'|'busy'}
 *  - ok : le modèle répond ; busy : il existe mais est momentanément saturé (conservé) ;
 *  - unavailable : modèle inconnu, non autorisé, sans quota ou incompatible (retiré) ;
 *  - auth : clé refusée (aucun modèle utilisable).
 */
export function classifyProbe(status, message) {
  const msg = String(message || '');
  if (status >= 200 && status < 300) return 'ok';
  if (status === 401) return 'auth';
  if (status === 403) return /api key|apikey|credential|permission_denied.*key/i.test(msg) && !/model/i.test(msg) ? 'auth' : 'unavailable';
  if (status === 404) return 'unavailable';
  if (status === 429) {
    // quota nul ou crédits épuisés : le modèle n'est pas utilisable avec cette clé
    if (/limit:\s*0\b|insufficient_quota|quota exceeded|exceeded your current quota|billing|credit/i.test(msg)) return 'unavailable';
    return 'busy';
  }
  if (status === 400 || status === 422) {
    if (/max_tokens|max_completion_tokens|output limit|maxOutputTokens|token limit/i.test(msg)) return 'ok';
    return 'unavailable';
  }
  if (status === 408 || status === 409 || status === 529 || status >= 500) return 'busy';
  return 'unavailable';
}

/** Empreinte (non réversible) de la clé, pour savoir si la vérification en cache correspond encore */
export function keyFingerprint(provider, apiKey, scope = '') {
  const s = `${provider}|${scope}|${apiKey || ''}`;
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return `${(h >>> 0).toString(36)}-${(apiKey || '').length}`;
}
