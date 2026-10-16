import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chatModelsFromList, probeRequest, classifyProbe, reasoningParams, simplerLevel, isReasoningParamError, azureEndpoint, azureDeploymentFromUrl } from '../lib/ai/providers.js';

test('Mistral : modèles de conversation uniquement, sans doublons', () => {
  const list = chatModelsFromList('mistral', {
    data: [
      { id: 'mistral-large-latest', name: 'Mistral Large', capabilities: { completion_chat: true } },
      { id: 'mistral-embed', capabilities: { completion_chat: false } },
      { id: 'mistral-ocr-latest', capabilities: { completion_chat: true } },
      { id: 'magistral-medium-latest', capabilities: { completion_chat: true } },
      { id: 'mistral-large-latest', capabilities: { completion_chat: true } },
    ],
  });
  assert.deepEqual(
    list.map((m) => m.id),
    ['magistral-medium-latest', 'mistral-large-latest'],
  );
  assert.equal(list[1].label, 'Mistral Large');
});

test('Mistral : requête de vérification sur l’API Mistral', () => {
  const rq = probeRequest('mistral', { model: 'mistral-small-latest', apiKey: 'k' });
  assert.equal(rq.url, 'https://api.mistral.ai/v1/chat/completions');
  const body = JSON.parse(rq.init.body);
  assert.equal(body.max_tokens, 16);
  assert.equal(body.max_completion_tokens, undefined);
  assert.equal(rq.init.headers.authorization, 'Bearer k');
  assert.deepEqual(reasoningParams('mistral', 'magistral-medium-latest', 'high'), {});
});

test('Azure OpenAI : point de terminaison de la ressource', () => {
  assert.equal(azureEndpoint('ma-ressource'), 'https://ma-ressource.openai.azure.com');
  assert.equal(azureEndpoint('https://Ma-Ressource.openai.azure.com/'), 'https://ma-ressource.openai.azure.com');
  assert.equal(azureEndpoint('ma-ressource.cognitiveservices.azure.com'), 'https://ma-ressource.cognitiveservices.azure.com');
  const target = 'https://ma-ressource.openai.azure.com/openai/deployments/gpt-5-mini/chat/completions?api-version=2025-01-01-preview';
  assert.equal(azureEndpoint(target), 'https://ma-ressource.openai.azure.com');
  assert.equal(azureDeploymentFromUrl(target), 'gpt-5-mini');
  // autres hôtes, http ou port explicite refusés
  for (const bad of ['https://exemple.com', 'http://ma-ressource.openai.azure.com', 'https://ma-ressource.openai.azure.com:8443', 'https://openai.azure.com.exemple.com', 'localhost:11434']) {
    assert.equal(azureEndpoint(bad), null, bad);
  }
});

test('Azure OpenAI : requête de vérification sur l’API v1 de la ressource', () => {
  const rq = probeRequest('azure', { model: 'prod-gpt-5', apiKey: 'cle', endpoint: 'ma-ressource' });
  assert.equal(rq.url, 'https://ma-ressource.openai.azure.com/openai/v1/chat/completions');
  assert.equal(rq.init.headers['api-key'], 'cle');
  assert.equal(rq.init.headers.authorization, undefined);
  const body = JSON.parse(rq.init.body);
  assert.equal(body.model, 'prod-gpt-5');
  assert.equal(body.max_completion_tokens, 16);
  assert.equal(probeRequest('azure', { model: 'gpt-4o', apiKey: 'cle', endpoint: 'https://exemple.com' }), null);
  // réflexion selon le nom du déploiement
  assert.deepEqual(reasoningParams('azure', 'prod-gpt-5', 'high'), { reasoning_effort: 'high' });
  assert.deepEqual(reasoningParams('azure', 'o4-mini', 'low'), { reasoning_effort: 'low' });
  assert.deepEqual(reasoningParams('azure', 'gpt-4o', 'high'), {});
});

test('classement des réponses de vérification', () => {
  assert.equal(classifyProbe(200, ''), 'ok');
  assert.equal(classifyProbe(404, 'model not found'), 'unavailable');
  assert.equal(classifyProbe(401, 'Unauthorized'), 'auth');
  assert.equal(classifyProbe(429, 'Requests rate limit exceeded'), 'busy');
  assert.equal(classifyProbe(429, 'Quota exceeded, limit: 0'), 'unavailable');
  assert.equal(classifyProbe(400, 'max_tokens is too small'), 'ok');
  assert.equal(classifyProbe(400, 'Invalid model: foo'), 'unavailable');
});

test('niveaux de réflexion', () => {
  assert.equal(simplerLevel('high'), 'low');
  assert.equal(simplerLevel('low'), 'none');
  assert.equal(simplerLevel('none'), null);
  assert.deepEqual(reasoningParams('openai', 'gpt-4o', 'high'), {});
  assert.deepEqual(reasoningParams('openai', 'gpt-5-mini', 'none'), { reasoning_effort: 'minimal' });
  assert.ok(isReasoningParamError(400, 'output_config.effort is not supported'));
  assert.ok(!isReasoningParamError(400, 'messages: invalid'));
});
