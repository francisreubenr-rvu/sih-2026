# v5 end-to-end: device redaction, cloud planning

Drives the real unpacked `extension/` in Chromium against a real Warden (GLiNER loaded) and a fake
OpenAI-compatible cloud planner that records every request body it receives. Synthetic page only.

Pairing is required (since 2 October 2026, `warden/pairing.py`): start the Warden and the run with the
same `WARDEN_PAIRING_SECRET`. `run.mjs` saves it into the loaded extension before the first task.

```sh
export WARDEN_PAIRING_SECRET="$(cd warden && python pairing.py new)"
node scripts/e2e-v5/fake-cloud.mjs /tmp/cloud-received.jsonl 8799 &
cd warden && GROQ_API_KEY=test-not-real GROQ_BASE_URL=http://127.0.0.1:8799 \
  python -m uvicorn app:app --host 127.0.0.1 --port 8756 &   # wait for /health loaded:true
node scripts/e2e-v5/run.mjs            # answers each prompt: strip / proceed
grep -c "priya.r@example.com\|Raghunathan" /tmp/cloud-received.jsonl   # expect 0
```

The harness copy of the extension adds `<all_urls>` to `host_permissions` in place of the optional
grant the Send click requests; the shipped manifest is unchanged. The side panel is opened as a tab,
with the fixture tab brought to the front before each answer.

## Real cloud planner (v02)

To record what reaches a real planner, point the Warden at the loopback recording relay instead of
the fake. It logs each body and forwards it unchanged to Groq; the key stays in the Warden's
environment and is forwarded in the header, never logged. `NODE_USE_ENV_PROXY=1` is only needed
behind an egress proxy.

```sh
node scripts/e2e-v5/recording-relay.mjs /tmp/cloud-received.jsonl 8799 https://api.groq.com/openai/v1 &
cd warden && GROQ_BASE_URL=http://127.0.0.1:8799 python -m uvicorn app:app --host 127.0.0.1 --port 8756 &
node scripts/e2e-v5/run.mjs
grep -c "priya.r@example.com\|Raghunathan" /tmp/cloud-received.jsonl   # expect 0
```

Result: `Benchmarks/results/e2e-v5-boundary-v02.json`.
