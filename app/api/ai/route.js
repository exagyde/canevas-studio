// Proxy de chat IA en streaming (Anthropic Claude, OpenAI, Azure OpenAI, Mistral, Google Gemini).
// La clé API est fournie par le navigateur (stockée localement) ou par les variables d'environnement du serveur.
// Flux renvoyé : texte brut ; « \u0001 » = signe d'activité (réflexion en cours, sans texte visible) ;
// « \u0000ERREUR: … » et « \u0000TRONQUÉ » = fin anormale. Les délais sont gérés par le navigateur.
import { ENV_KEYS, AZURE_ENDPOINT_ENV, OPENAI_LIKE, openaiLikeTarget, maxTokensParam, reasoningParams, isReasoningParamError } from '@/lib/ai/providers';
import { translate, localeFromRequest } from '@/lib/i18n';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HEARTBEAT = '\u0001';
const HEARTBEAT_EVERY_MS = 1500;

function bad(status, message) {
  return new Response(JSON.stringify({ error: message }), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
}

// ----------------------------------------------------------------- conversion des messages
function anthropicMessages(messages) {
  return messages.map((m) => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: (m.parts || [{ type: 'text', text: m.text || '' }]).map((p) =>
      p.type === 'image' ? { type: 'image', source: { type: 'base64', media_type: p.mediaType, data: p.data } } : { type: 'text', text: p.text || '' },
    ),
  }));
}

function openaiMessages(system, messages) {
  const out = [{ role: 'system', content: system }];
  for (const m of messages) {
    const parts = m.parts || [{ type: 'text', text: m.text || '' }];
    if (m.role === 'assistant') out.push({ role: 'assistant', content: parts.filter((p) => p.type === 'text').map((p) => p.text).join('\n') });
    else
      out.push({
        role: 'user',
        content: parts.map((p) => (p.type === 'image' ? { type: 'image_url', image_url: { url: `data:${p.mediaType};base64,${p.data}` } } : { type: 'text', text: p.text || '' })),
      });
  }
  return out;
}

function geminiContents(messages) {
  return messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: (m.parts || [{ type: 'text', text: m.text || '' }]).map((p) => (p.type === 'image' ? { inline_data: { mime_type: p.mediaType, data: p.data } } : { text: p.text || '' })),
  }));
}

// ----------------------------------------------------------------- lecture SSE
async function* sseEvents(body) {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx;
    while ((idx = buf.search(/\r?\n\r?\n/)) >= 0) {
      const raw = buf.slice(0, idx);
      buf = buf.slice(idx).replace(/^\r?\n\r?\n/, '');
      let event = 'message';
      const data = [];
      for (const line of raw.split(/\r?\n/)) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
      }
      if (data.length) yield { event, data: data.join('\n') };
    }
  }
}

async function upstreamError(res) {
  let text = '';
  try {
    text = await res.text();
    const j = JSON.parse(text);
    text = j.error?.message || j.message || j.error || text;
    if (typeof text !== 'string') text = JSON.stringify(text);
  } catch {
    /* texte brut */
  }
  return `${res.status} ${res.statusText} — ${String(text).slice(0, 600)}`;
}

export async function POST(req) {
  // messages d'erreur dans la langue de l'interface (cookie de langue, sinon Accept-Language)
  const locale = localeFromRequest(req);
  let input;
  try {
    input = await req.json();
  } catch {
    return bad(400, translate(locale, 'ai.apiInvalidJson'));
  }
  const provider = String(input.provider || 'anthropic');
  const apiKey = input.apiKey || process.env[ENV_KEYS[provider]] || '';
  const model = String(input.model || '').trim();
  const system = String(input.system || '');
  const messages = Array.isArray(input.messages) ? input.messages : [];
  const maxTokens = Math.max(256, Math.min(64000, Number(input.maxTokens) || 8000));
  if (!model) return bad(400, translate(locale, 'ai.apiModelMissing'));
  if (!apiKey) return bad(401, translate(locale, 'ai.apiKeyMissing', { provider, envVar: ENV_KEYS[provider] }));

  const reasoning = ['high', 'medium', 'low', 'none'].includes(input.reasoning) ? input.reasoning : null;
  let kind;
  let target = null;
  if (provider === 'anthropic') kind = 'anthropic';
  else if (OPENAI_LIKE.has(provider)) {
    kind = 'openai';
    target = openaiLikeTarget(provider, apiKey, input.endpoint || process.env[AZURE_ENDPOINT_ENV]);
    if (!target) return bad(400, translate(locale, 'ai.apiAzureEndpointInvalid'));
  } else if (provider === 'gemini') kind = 'gemini';
  else return bad(400, translate(locale, 'ai.apiUnknownProvider', { provider }));

  const call = (withReasoning) => {
    const extra = withReasoning ? reasoningParams(provider, model, reasoning) : {};
    if (kind === 'anthropic') {
      return fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: anthropicMessages(messages), stream: true, ...extra }),
        signal: req.signal,
      });
    }
    if (kind === 'openai') {
      const body = { model, messages: openaiMessages(system, messages), stream: true, [maxTokensParam(provider)]: maxTokens, ...extra };
      return fetch(`${target.base}/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json', ...target.headers }, body: JSON.stringify(body), signal: req.signal });
    }
    return fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: geminiContents(messages),
        generationConfig: { maxOutputTokens: maxTokens, ...extra },
      }),
      signal: req.signal,
    });
  };

  let res;
  try {
    res = await call(!!reasoning);
    // Modèle qui ne prend pas en charge le réglage de réflexion : nouvelle tentative sans ce réglage
    if (reasoning && res.status === 400) {
      const detail = await upstreamError(res);
      if (!isReasoningParamError(400, detail)) return bad(400, detail);
      res = await call(false);
    }
  } catch (e) {
    if (e?.name === 'AbortError') return bad(499, translate(locale, 'ai.apiRequestCanceled'));
    return bad(502, translate(locale, 'ai.apiProviderCallFailed', { message: e.message }));
  }
  if (!res.ok || !res.body) return bad(res.status || 502, await upstreamError(res));

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const push = (t) => t && controller.enqueue(enc.encode(t));
      let lastBeat = 0;
      const beat = () => {
        const now = Date.now();
        if (now - lastBeat < HEARTBEAT_EVERY_MS) return;
        lastBeat = now;
        push(HEARTBEAT);
      };
      try {
        for await (const ev of sseEvents(res.body)) {
          if (ev.data === '[DONE]') break;
          beat();
          let j;
          try {
            j = JSON.parse(ev.data);
          } catch {
            continue;
          }
          if (kind === 'anthropic') {
            if (j.type === 'content_block_delta' && j.delta?.type === 'text_delta') push(j.delta.text);
            else if (j.type === 'error') push(`\n\n\u0000ERREUR: ${j.error?.message || translate(locale, 'ai.apiStreamError')}`);
            else if (j.type === 'message_delta' && j.delta?.stop_reason === 'max_tokens') push('\n\n\u0000TRONQUÉ');
            else if (j.type === 'message_delta' && j.delta?.stop_reason === 'refusal') push(`\n\n\u0000ERREUR: ${translate(locale, 'ai.apiRefusal')}`);
          } else if (kind === 'openai') {
            const c = j.choices?.[0];
            const content = c?.delta?.content;
            if (typeof content === 'string') push(content);
            // Mistral (Magistral) : contenu en morceaux, la réflexion (« thinking ») n'est pas affichée
            else if (Array.isArray(content)) for (const part of content) if (part?.type === 'text' && part.text) push(part.text);
            if (c?.finish_reason === 'length') push('\n\n\u0000TRONQUÉ');
            else if (c?.finish_reason === 'content_filter') push(`\n\n\u0000ERREUR: ${translate(locale, 'ai.apiContentFilter')}`);
            if (j.error) push(`\n\n\u0000ERREUR: ${j.error.message || translate(locale, 'ai.apiStreamError')}`);
          } else {
            const parts = j.candidates?.[0]?.content?.parts || [];
            for (const p of parts) if (p.text && !p.thought) push(p.text);
            if (j.candidates?.[0]?.finishReason === 'MAX_TOKENS') push('\n\n\u0000TRONQUÉ');
            if (j.error) push(`\n\n\u0000ERREUR: ${j.error.message || translate(locale, 'ai.apiStreamError')}`);
          }
        }
      } catch (e) {
        if (e?.name !== 'AbortError') push(`\n\n\u0000ERREUR: ${e.message}`);
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
}
