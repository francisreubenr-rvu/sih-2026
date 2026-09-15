import test from 'node:test';
import assert from 'node:assert/strict';
import {
  reasonHealthUrl,
  pingOllamaTags,
  interpretReasonHealth,
  checkReasonHealthBeforeSend,
} from '../shared/reason-health.mjs';
import { createApp } from '../server/app.mjs';

test('reasonHealthUrl adds planner probe query only when requested', () => {
  assert.equal(reasonHealthUrl('http://127.0.0.1:9041'), 'http://127.0.0.1:9041/api/v1/health');
  assert.equal(
    reasonHealthUrl('http://127.0.0.1:9041', { probePlanner: true }),
    'http://127.0.0.1:9041/api/v1/health?planner=1',
  );
});

test('pingOllamaTags reports unreachable without inventing models', async () => {
  const result = await pingOllamaTags({
    baseUrl: 'http://127.0.0.1:9',
    timeoutMs: 200,
    expectedModel: 'qwen2.5:7b-instruct',
  });
  assert.equal(result.reachable, false);
  assert.equal(result.modelsListed, 0);
  assert.equal(result.expectedModelPresent, false);
  assert.ok(result.error);
});

test('pingOllamaTags lists models from a fake /api/tags', async () => {
  const result = await pingOllamaTags({
    baseUrl: 'http://ollama.test',
    expectedModel: 'qwen2.5:7b-instruct',
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ models: [{ name: 'qwen2.5:7b-instruct' }, { name: 'other' }] }),
    }),
  });
  assert.equal(result.reachable, true);
  assert.equal(result.modelsListed, 2);
  assert.equal(result.expectedModelPresent, true);
  assert.deepEqual(result.sampleModels, ['qwen2.5:7b-instruct', 'other']);
});

test('interpretReasonHealth requires planner.reachable for ok path', () => {
  assert.equal(interpretReasonHealth({ data: { status: 'ready' } }).plannerReachable, false);
  const ok = interpretReasonHealth({
    data: { status: 'ready', planner: { reachable: true, latencyMs: 12 } },
  });
  assert.equal(ok.serverReady, true);
  assert.equal(ok.plannerReachable, true);
});

test('GET /api/v1/health?planner=1 uses plannerProbe without auth', async () => {
  const token = 'synthetic-test-token-not-a-real-secret';
  const app = createApp({
    token,
    infer: async () => ({ action: { type: 'done' }, model: 'test', mode: 'test' }),
    plannerProbe: async () => ({
      reachable: true,
      latencyMs: 5,
      modelsListed: 1,
      sampleModels: ['qwen2.5:7b-instruct'],
      expectedModelPresent: true,
      error: null,
    }),
  });
  await new Promise((r) => app.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${app.address().port}`;
  try {
    const plain = await (await fetch(`${url}/api/v1/health`)).json();
    assert.equal(plain.data.status, 'ready');
    assert.equal(plain.data.planner, undefined);
    assert.equal(plain.data.modelConnection, 'checked-on-request');

    const probed = await (await fetch(`${url}/api/v1/health?planner=1`)).json();
    assert.equal(probed.data.modelConnection, 'probed');
    assert.equal(probed.data.planner.reachable, true);
    assert.equal(probed.data.planner.modelsListed, 1);

    const downApp = createApp({
      token,
      infer: async () => ({ action: { type: 'done' }, model: 'test', mode: 'test' }),
      plannerProbe: async () => ({
        reachable: false,
        latencyMs: 1,
        modelsListed: 0,
        sampleModels: [],
        expectedModelPresent: false,
        error: 'ECONNREFUSED',
      }),
    });
    await new Promise((r) => downApp.listen(0, '127.0.0.1', r));
    const downUrl = `http://127.0.0.1:${downApp.address().port}`;
    try {
      const health = await checkReasonHealthBeforeSend({ origin: downUrl, timeoutMs: 1000 });
      assert.equal(health.ok, false);
      assert.equal(health.plannerReachable, false);
    } finally {
      await new Promise((r) => downApp.close(r));
    }
  } finally {
    await new Promise((r) => app.close(r));
  }
});
