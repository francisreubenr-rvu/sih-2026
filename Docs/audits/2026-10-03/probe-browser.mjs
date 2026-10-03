// Synthetic local Chromium fixtures only. No loaded extension or model provider.
import { startHarness } from "../../../extension/tests/helpers/content-harness.mjs";
import { mergeRegions } from "../../../Prototype/shared/privacy.mjs";
import { scoreLatency } from "../../../Prototype/shared/rubric-hooks.mjs";
import { createApp } from "../../../Prototype/server/app.mjs";
import { request } from "node:http";
import { randomUUID } from "node:crypto";
const h = await startHarness();
const out = {};
try {
  const p = await h.open('<button id="b" type="button" onclick="window.clicks=(window.clicks||0)+1">Next</button>');
  const s = await p.scan();
  await p.page.evaluate(() => document.querySelector("#b").disabled = true);
  out.disabledClick = { result: await p.execute({ action: "click", handle: s.elements[0].handle, plannedTier: s.elements[0].tier }), clicks: await p.page.evaluate(() => window.clicks || 0) };
  await p.close();
  const q = await h.open('<input id="i" aria-label="Search" value="original" readonly>');
  const t = await q.scan();
  out.readOnlyType = { result: await q.execute({ action: "type", handle: t.elements[0].handle, plannedTier: "state-changing", value: "synthetic replacement" }), value: await q.page.inputValue("#i") };
  await q.close();
  const r = await h.open('<input id="i" aria-label="Search">');
  const u = await r.scan();
  await r.page.evaluate(() => {
    window.detached = document.querySelector("#i");
    window.detached.addEventListener("focus", () => window.detached.remove());
  });
  out.focusDetach = { result: await r.execute({ action: "type", handle: u.elements[0].handle, plannedTier: "state-changing", value: "synthetic replacement" }), state: await r.page.evaluate(() => ({ connected: window.detached.isConnected, value: window.detached.value })) };
  await r.close();
  const boxes = Array.from({ length: 201 }, (_, i) => ({ kind: "private", rect: { x: i % 20 * 10, y: Math.floor(i / 20) * 10, width: 1, height: 1 } }));
  out.regionLimit = { input: boxes.length, output: mergeRegions(boxes).length };
  out.latencyBoundary = scoreLatency({ elapsedMs: 200 });
  const token = "synthetic-audit-token-not-a-real-secret";
  let concurrent = 0, peak = 0;
  const app = createApp({ token, infer: async () => {
    concurrent++;
    peak = Math.max(peak, concurrent);
    await new Promise((r2) => setTimeout(r2, 100));
    concurrent--;
    return { action: { type: "done" }, model: "synthetic-stub", mode: "test-only" };
  } });
  await new Promise((r2) => app.listen(0, "127.0.0.1", r2));
  try {
    const body = JSON.stringify({ task: "review-pending", scene: { scheme: "dhristi-semantic-v1", revision: randomUUID(), viewport: { width: 100, height: 100 }, controls: [], regions: [] } });
    const pending = [];
    const senders = [];
    for (let i = 0; i < 3; i++) {
      let sender;
      pending.push(new Promise((resolve, reject) => {
        sender = request({ hostname: "127.0.0.1", port: app.address().port, path: "/api/v1/plans", method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` } }, (res) => {
          res.resume();
          res.on("end", () => resolve(res.statusCode));
        });
        sender.on("error", reject);
        sender.setTimeout(3e3, () => sender.destroy(new Error("synthetic probe timed out")));
        sender.write(body.slice(0, 1));
      }));
      senders.push(sender);
    }
    await new Promise((r2) => setTimeout(r2, 80));
    for (const sender of senders) sender.end(body.slice(1));
    out.prototypeConcurrency = { configuredCap: 2, peak, statuses: await Promise.all(pending) };
    out.prototypeConcurrency.peak = peak;
  } finally {
    await new Promise((r2) => app.close(r2));
  }
  console.log(JSON.stringify(out, null, 2));
} finally {
  await h.close();
}
