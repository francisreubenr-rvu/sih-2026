"""Synthetic audit probes. Run in a separate process; never loads weights or calls a provider."""

import sys, json, asyncio, time, os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "warden"))
os.environ["WARDEN_FAST_PATH_MIN_CONFIDENCE"] = "0.9"
import entities, strip, fastpath, app, config, ollama_client
from fastapi.testclient import TestClient
import httpx

out = {}


class Stub:
    label = "person name"
    score = 0.4

    def predict_entities(self, text, labels, threshold):
        return [
            {"start": 0, "end": len(text), "label": self.label, "score": self.score}
        ]


m = Stub()
entities.STATE.model = m
# Clear the text cache so the synthetic confidence is deterministic.
entities._CHUNK_CACHE.clear()
a = strip.strip("", "Priya Example", [], {})
b = strip.strip("", "Arjun Sample", [], {"PERSONNAME#1": "keep"})
out["staleKeep"] = {
    "firstUncertain": a["uncertain"],
    "secondSanitizedDom": b["sanitizedDom"],
    "secondUncertain": b["uncertain"],
}
m.label = "password"
m.score = 0.99
entities._CHUNK_CACHE.clear()
out["descriptorSuppression"] = {}
for value, label in [("secret123!", "password"), ("123 street", "address")]:
    m.label = label
    out["descriptorSuppression"][value] = strip.strip("", value, [], {})
body = {
    "tokenizedTask": "Find results",
    "sanitizedDom": "Search",
    "elements": [
        {"selector": "#s", "fieldType": "text", "label": "Search", "x": 1, "y": 1}
    ],
    "history": [],
}
out["fastpath"] = []
for confidence, free in [(0.99, None), (float("nan"), 0.1), (0.99, float("nan"))]:
    key = fastpath.option_table(body, True)[0][0]
    fastpath.BACKENDS["laya"] = lambda *_: (
        {
            "next": {"choice": key, "probabilities": {key: confidence}},
            "free_text": {"noul": free},
        },
        "synthetic-stub",
    )
    rec = fastpath.decide(body, "laya")
    out["fastpath"].append(
        {
            "confidence": str(confidence),
            "free": str(free),
            "used": rec["used"],
            "plan": rec.get("plan"),
        }
    )
config.pairing_state = lambda: "disabled"
c = TestClient(app.app, raise_server_exceptions=False)
out["malformedValidate"] = [
    {"body": v, "status": c.post("/validate", json=v).status_code}
    for v in [[], "invalid"]
]
out["invalidJsonStatus"] = c.post(
    "/validate", content="{", headers={"content-type": "application/json"}
).status_code
app.dispatch_plan = lambda _: time.sleep(0.25) or {"plan": {"action": "finish"}}


async def concurrency():
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app.app), base_url="http://synthetic"
    ) as c:
        t = time.perf_counter()
        res = await asyncio.gather(c.post("/plan", json={}), c.post("/plan", json={}))
        return {
            "statuses": [r.status_code for r in res],
            "elapsedMs": round((time.perf_counter() - t) * 1000, 1),
            "perCallStubMs": 250,
        }


out["blockingPlan"] = asyncio.run(concurrency())
# Stub the transport: no remote connection or model inference.
config.OLLAMA_HOST = "https://synthetic.invalid"
config.OLLAMA_MODEL = "synthetic:cloud"
seen = []


class Reply:
    status_code = 200

    def json(self):
        return {"response": '{"downgrade_to_ask": false,"question":null}'}


def post(url, **kwargs):
    seen.append(url)
    return Reply()


ollama_client.httpx.post = post
ollama_client.review("synthetic task", {"action": "finish"}, "navigational")
out["reviewRemoteHost"] = {"transportInvoked": seen}
import importlib.util

spec = importlib.util.spec_from_file_location(
    "synthetic_g20_probe", ROOT / "scripts/g20_summarize.py"
)
g20 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(g20)
participant = {
    "id": "P_SYNTHETIC_REPEATED_FIXTURE",
    "non_author": True,
    "date_utc": "synthetic fixture",
    "tasks": {t: {"result": "unaided"} for t in g20.TASKS},
}
reviewer = {
    "id": "R_SYNTHETIC_REPEATED_FIXTURE",
    "rubric_score": 3,
    "date_utc": "synthetic fixture",
}
participants = [participant] * 5
reviewers = [reviewer] * 3
out["g20DuplicateIdentity"] = {
    "acceptedParticipantRows": sum(
        not g20.problems_with_participant(p) for p in participants
    ),
    "uniqueParticipantIds": len({p["id"] for p in participants}),
    "acceptedReviewerRows": sum(not g20.problems_with_reviewer(r) for r in reviewers),
    "uniqueReviewerIds": len({r["id"] for r in reviewers}),
    "ledgerWritten": False,
}
print(json.dumps(out, indent=2, allow_nan=False))
