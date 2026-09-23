# ARCH — G11 Option C harness interface (Worker sketch)

**Task:** GATE-VERIFY-001 follow-up · design-only  
**Date:** 2026-09-23  
**Consumers:** The Brain → Worker (implement) · Tester (run) · Verifier (ledger)  
**Pairs with:** `Docs/decisions/brain-arch-g11-option-c-measure.md`  
**Non-claims:** No production code here. Does not flip G11 or `submission_ready`.

---

## 1. Purpose

A **measurement harness** that times the frozen Option C core flow and writes one JSON artifact. It does not optimize latency, weaken the 200 ms budget, or treat L0/L1 as a pass.

**Frozen core (L2 only may affect G11):**  
root `extension/` ↔ Warden `127.0.0.1:8756` · **PERCEIVE → STRIP → PLAN → VALIDATE → EXECUTE**  
(F17: client `opTierLocal` before unattended EXECUTE.)

---

## 2. Harness interface (contract)

### 2.1 Inputs (config object)

| Field | Type | Required | Notes |
|---|---|---|---|
| `suiteId` | string | yes | e.g. `"g11-warden-option-c-v1"` |
| `lane` | enum | yes | `"L0_strip_local"` \| `"L1_plan_validate"` \| `"L2_full_core"` |
| `wardenBaseUrl` | string | yes | must be `http://127.0.0.1:8756` (reject other hosts/ports) |
| `planner` | object | yes | see §4 |
| `extensionId` / load path | string | yes | root `extension/` only — refuse if Prototype extension |
| `pages` | string[] | yes | fixed absolute URLs; list written into artifact; no invented pages |
| `warmups` | int | yes | default **10**; discarded from aggregates |
| `sampleCount` | int | yes | default **100** minimum for L2 gate eligibility |
| `budgetMs` | int | yes | **200** — harness must refuse config that raises this |
| `f17` | object | yes | `{ requireOpTierLocal: true, trustServerRequiresConfirmation: false }` |
| `executePolicy` | enum | L2 | `"confirm_auto_safe_only"` \| `"scripted_confirm"` — never skip local tier gate |
| `outPath` | string | yes | `Benchmarks/results/core-latency-warden-option-c.json` |

### 2.2 Outputs

1. **Artifact file** at `outPath` (schema §3).  
2. **Stdout summary** (for Tester): `lane`, `planner.label`, `n`, `p95Ms`, `gate.status`, `f17.ok`.  
3. **Exit code:** `0` = suite ran and wrote valid JSON (even if gate **fail**); non-zero = harness/precondition error (do not write a fake pass).

Gate **fail** is a successful measurement, not a harness error.

### 2.3 Preconditions (fail closed)

Harness aborts before timing if any fail:

1. `GET {wardenBaseUrl}/health` ok.  
2. `wardenBaseUrl` host is loopback and port **8756**.  
3. Root extension is the loaded build under test.  
4. `budgetMs === 200`.  
5. `f17.requireOpTierLocal === true`.  
6. For L2: planner label present (§4).  
7. `pages.length ≥ 1` and every URL is recorded.

---

## 3. Stage timers

Wall-clock **per attempt**, milliseconds, float ok. Start/stop around real work only (no invented placeholders).

| Stage key | Boundary | Present in |
|---|---|---|
| `perceive` | Capture / DOM+scene collect on page → payload ready for strip | L0, L1, L2 |
| `strip` | `POST /strip` round-trip (request sent → response) | L0, L1, L2 |
| `plan` | `POST /plan` round-trip | L1, L2 (absent/0 on L0) |
| `validate` | `POST /validate` round-trip | L1, L2 |
| `f17_local_tier` | Time to compute `opTierLocal(plan, elements)` + agreement check vs Warden tier | L1, L2 |
| `execute` | Client execute path after local tier permits (or scripted confirm) | **L2 only** |
| `total` | `perceive` start → attempt terminal (success or blocked/reject) | all |

**Rules**

- Sum of stages need not equal `total` if overlap exists; prefer exclusive spans and document `timingModel: "exclusive" | "wall_overlaps_ok"`.  
- Prefer reusing extension `noteStage` / real clocks over synthetic Node microbenches for L2 claims.  
- Missing stage → `null` + reason string; never a guessed number.

---

## 4. Planner labeling (`ollama` vs `groq`)

```json
"planner": {
  "label": "ollama",
  "detail": "ollama@127.0.0.1:11434",
  "endpointRole": "plan",
  "phase1DefaultLock": true
}
```

| `label` | `detail` (canonical) | When allowed |
|---|---|---|
| `ollama` | `ollama@127.0.0.1:11434` | `/plan` actually served by local Ollama (Phase 1 lock) |
| `groq` | `groq` (no host fantasy) | Import-as-is stack where `POST /plan` still uses Groq |
| `unknown` | omit or `"unverified"` | Harness could not verify — **L2 not gate-eligible** |

**Verification (design intent for Worker):**

- Before suite: probe which backend `/plan` uses (config/env or controlled request).  
- If code path is still Groq → force `label: "groq"` even if Ollama is up for `/validate`.  
- Ollama on **validate-only** must **not** set `label: "ollama"` for the suite.  
- Artifact top-level `planner` must match every attempt’s `plannerLabel` (or suite splits files per planner).

Gate-claim narrative for Francis/Brain: prefer **`ollama@127.0.0.1:11434`** after Worker swaps `/plan`. Groq-labeled L2 = evidence only for import stack.

---

## 5. F17 `opTierLocal` check (harness)

Per L1/L2 attempt, record:

```json
"f17": {
  "opTierLocalComputed": true,
  "localTier": "read|fill|navigate|submit|destructive|…",
  "wardenTier": "…",
  "tiersAgree": true,
  "trustedServerRequiresConfirmationAlone": false,
  "unattendedExecuteAllowed": false,
  "gatePath": "local_confirm_required|unattended_ok|reject|ask"
}
```

**Pass conditions for harness integrity (not G11):**

1. `opTierLocal` ran on the client (`opTierLocalComputed: true`).  
2. `trustedServerRequiresConfirmationAlone` is always **false** in config and in recorded path.  
3. If Warden verdict is `accept` but local tier does not permit unattended → execute must not run without confirm (`gatePath` ≠ silent unattended).  
4. Attempt that bypasses local tier → mark `f17.ok: false` and **exclude** from L2 gate aggregate (still log in `rejectedAttempts`).

G11 aggregate uses only attempts with `f17.ok: true`.

---

## 6. Artifact schema — `Benchmarks/results/core-latency-warden-option-c.json`

```json
{
  "name": "core-latency-warden-option-c",
  "schemaVersion": 1,
  "generatedAt": "ISO-8601",
  "suiteId": "g11-warden-option-c-v1",
  "frozenCore": {
    "surface": "root-extension+warden",
    "loop": ["PERCEIVE", "STRIP", "PLAN", "VALIDATE", "EXECUTE"],
    "warden": "http://127.0.0.1:8756",
    "notCore": ["prototype:9041", "Prototype/extension", "privacy-only"]
  },
  "planner": {
    "label": "ollama|groq|unknown",
    "detail": "ollama@127.0.0.1:11434|groq|unverified",
    "endpointRole": "plan",
    "phase1DefaultLock": true
  },
  "budgetMs": 200,
  "warmups": 10,
  "sampleCount": 100,
  "pages": ["https://…"],
  "timingModel": "exclusive",
  "lanes": {
    "L0_strip_local": { "mayFlipG11": false, "aggregates": { "n": 0, "p50Ms": null, "p95Ms": null }, "gate": null },
    "L1_plan_validate": { "mayFlipG11": false, "aggregates": { "n": 0, "p50Ms": null, "p95Ms": null }, "gate": null },
    "L2_full_core": {
      "mayFlipG11": true,
      "aggregates": {
        "n": 0,
        "minMs": null,
        "maxMs": null,
        "p50Ms": null,
        "p95Ms": null,
        "meanMs": null,
        "stageP95Ms": {
          "perceive": null,
          "strip": null,
          "plan": null,
          "validate": null,
          "f17_local_tier": null,
          "execute": null,
          "total": null
        }
      },
      "gate": {
        "metric": "task-latency",
        "rule": "G11",
        "required": "p95 end-to-end <200ms, n≥100 after 10 warmups, frozen core, f17.ok",
        "budgetMs": 200,
        "elapsedMs": null,
        "status": "fail|pass",
        "budget_weakened": false,
        "note": ""
      }
    }
  },
  "f17": {
    "requireOpTierLocal": true,
    "attemptsOk": 0,
    "attemptsExcluded": 0
  },
  "attempts": [
    {
      "i": 0,
      "warmup": false,
      "page": "https://…",
      "lane": "L2_full_core",
      "plannerLabel": "ollama",
      "stagesMs": {
        "perceive": 0,
        "strip": 0,
        "plan": 0,
        "validate": 0,
        "f17_local_tier": 0,
        "execute": 0,
        "total": 0
      },
      "f17": { },
      "terminal": "ok|reject|ask|blocked|error",
      "includeInGate": true
    }
  ],
  "honesty": [
    "Privacy-only and Prototype:9041 timings must not be copied into L2 gate.",
    "Validate-only Ollama is not planner label ollama.",
    "Do not weaken budgetMs below or redefine full-flow without Brain+Francis."
  ],
  "status": "fail|pass",
  "acceptance": {
    "rule": "G11",
    "required": "p95 end-to-end <200ms, n≥100 after 10 warmups per frozen core flow",
    "status": "fail|pass",
    "budget_weakened": false,
    "eligible": true
  }
}
```

**Defaults on first write / incomplete run:** `status` and L2 `gate.status` = **`fail`**; `budget_weakened` = **false**; never omit `honesty`.

**Historical link (optional field):**  
`"predecessor": "Benchmarks/results/core-latency.json"` — read-only reference; do not overwrite predecessor.

---

## 7. Worker milestones (sketch only)

| ID | Deliverable | Tag |
|---|---|---|
| W-G11-H-1 | Config validation + health/precondition checks | design→code |
| W-G11-H-2 | Stage timers + attempt log → schema v1 file | evidence-gated by Tester dry-run n=3 |
| W-G11-H-3 | Planner probe + forced label | evidence-gated |
| W-G11-H-4 | F17 recording + exclude-from-gate path | evidence-gated |
| W-G11-H-5 | Full L2 n≥100 after Brain/Francis go | evidence-gated · Verifier adopts |

Architect stops at this interface. No harness implementation in this note.

---

## 8. Handoff

Brain briefs Worker with this file + measure one-pager. Tester runs; Verifier updates ledger only if L2 gate object qualifies. Architect available for schema conflicts only.
