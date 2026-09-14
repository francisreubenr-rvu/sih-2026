import test from 'node:test';
import assert from 'node:assert/strict';
import {
  readJsHeap,
  readClientEnvironment,
  measureStage,
  summarizeClientResources,
} from '../shared/client-resources.mjs';
import {
  scoreClientResources,
  FULL_FLOW_LATENCY_MS,
  scoreLatency,
} from '../shared/rubric-hooks.mjs';

test('readJsHeap fails closed when performance.memory is absent', () => {
  const heap = readJsHeap({});
  assert.equal(heap.available, false);
  assert.equal(heap.usedJSHeapSize, null);
  assert.match(heap.note, /unavailable/i);
});

test('readJsHeap reports Chromium-shaped memory when present', () => {
  const heap = readJsHeap({
    memory: { usedJSHeapSize: 10, totalJSHeapSize: 20, jsHeapSizeLimit: 100 },
  });
  assert.equal(heap.available, true);
  assert.equal(heap.usedJSHeapSize, 10);
  assert.match(heap.note, /JS heap only/i);
});

test('measureStage records elapsed time and rethrows with resource record', async () => {
  const { result, record } = await measureStage('noop', async () => 42, { includeHeap: false });
  assert.equal(result, 42);
  assert.equal(record.stage, 'noop');
  assert.ok(record.elapsedMs >= 0);
  assert.equal(record.ok, true);
  assert.equal(record.status, 'partial_diagnostic_only');

  await assert.rejects(
    () => measureStage('boom', async () => { throw new Error('nope'); }, { includeHeap: false }),
    err => {
      assert.equal(err.message, 'nope');
      assert.equal(err.clientResourceRecord.ok, false);
      assert.equal(err.clientResourceRecord.stage, 'boom');
      return true;
    }
  );
});

test('summarizeClientResources and scoreClientResources keep observed null', () => {
  const stages = [
    { stage: 'a', elapsedMs: 10, heapAfter: { available: true, usedJSHeapSize: 100 } },
    { stage: 'b', elapsedMs: 30, heapAfter: { available: true, usedJSHeapSize: 250 } },
  ];
  const summary = summarizeClientResources(stages, readClientEnvironment({ hardwareConcurrency: 4 }));
  assert.equal(summary.metric, 'client-resources');
  assert.equal(summary.observed, null);
  assert.equal(summary.status, 'partial_diagnostic_only');
  assert.equal(summary.peakUsedJsHeapSize, 250);
  assert.equal(summary.stageElapsedMs.max, 30);

  const scored = scoreClientResources({ stages });
  assert.equal(scored.observed, null);
  assert.equal(scored.weightPercent, 20);
});

test('resource hooks must not weaken the 200ms latency gate', () => {
  assert.equal(FULL_FLOW_LATENCY_MS, 200);
  assert.equal(scoreLatency({ elapsedMs: 201 }).status, 'fail');
});
