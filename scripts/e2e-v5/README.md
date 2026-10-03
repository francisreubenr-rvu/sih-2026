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

## Pairing, Laya release and negative checks (v04)

Start the relay as above. Then start the Warden with `WARDEN_PAIRING_SECRET`, `WARDEN_REVIEWER=laya` and
`WARDEN_LAYA_MODEL=francisreubenr/dhristi-laya-plan-review`, which needs an `HF_TOKEN` that can read it.
`run.mjs` pairs through the side panel's Settings field and writes `summary.json` into `E2E_OUT`.

| Variable | Meaning |
|---|---|
| `E2E_FIXTURE` | `fixture.html` (default, profile) or `fixture-statements.html` (bank: statements, help, Hindi delete link) |
| `E2E_TASK` | task text; the default is the profile email update |
| `E2E_KEEP` | comma-separated previews the harness answers "keep" for, e.g. `Account statements`; everything else is stripped |
| `E2E_EXPECT_UNPROVEN=1` | negative check: the code does not match the Warden's; records the refusal and sends no task |

`python3 scripts/e2e-v5/compose_v04.py --runs <E2E_OUT parent> --cloud <relay log> --out <json>` assembles
the results file and counts the fixtures' synthetic values in what reached the cloud.

Result: `Benchmarks/results/e2e-v5-boundary-v04.json`.

## Submission demo video

`record-demo.mjs` records the page and side-panel tabs through pairing, a protected run, a released navigation step and a destructive step that asks. It writes the two videos and `marks.json` (caption cues). `compose-demo.py` lays them side by side with captions, a title card and an end card, and speeds up idle stretches 4x with an on-screen label. Use a one-off pairing code for recordings. Record of the 3 October run: `Benchmarks/results/demo-video-v01.json`.

`voiceover-demo.py` (needs `kokoro`, `soundfile`, `espeak-ng`) narrates the cut with Kokoro run locally: a blend of its British female voice with a share of its Hindi female voice (`--hindi`, default 0.25), British pronunciation. It writes `voiceover.wav` and `plan.json`; pass the plan's lengths to `compose-demo.py --title-s --end-s --audio voiceover.wav`. The voice is synthetic; say so wherever the video is published.
