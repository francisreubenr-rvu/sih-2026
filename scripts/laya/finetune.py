"""Fine-tune Laya on the Dhristi plan-review dataset.

Training loop adapted from NandhaKishorM/laya notebooks/laya_finetune_typed_decisions_mps.py
(Apache License 2.0, Convai Innovations): REINFORCE against a strictly proper
scoring rule plus cross-entropy, then one temperature per option-count bucket
fitted on a held-back calibration split. Changes: our JSONL rows instead of the
typed-decisions dataset, and every row is encoded through laya's own inference
path (Agent._to_internal + Agent._encode_state, laya==0.3.22) so a training
sequence is byte-identical to what predict() builds at run time.

Needs torch and laya (not Warden test dependencies). Writes a checkpoint
directory loadable with laya.load(<dir>) and by the Warden via
WARDEN_LAYA_MODEL=<dir>.

    python scripts/laya/finetune.py --base <dir with multilingual checkpoint> --out <dir>
"""

import argparse
import json
import math
import random
import shutil
import sys
import time
from pathlib import Path

import torch
from safetensors.torch import save_file

import laya
from laya.agent import Agent
from laya.common import proper_reward, temp_bucket

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "warden"))
import laya_review  # noqa: E402

DATA = ROOT / "Benchmarks" / "datasets" / "laya-plan-review-v01"


def load_rows(name):
    with open(DATA / f"{name}.jsonl", encoding="utf-8") as f:
        return [json.loads(line) for line in f]


def encode(agent, rows):
    items = []
    for r in rows:
        qdef = laya_review.QUESTIONS[r["question"]]
        keys = list(qdef["criteria"].keys())
        internal = {r["question"]: Agent._to_internal(qdef)}
        item = agent._encode_state(r["state"], [r["question"]], internal)[0]
        target = [0.0] * len(keys)
        target[keys.index(r["gold"])] = 1.0
        items.append({"ids": item["ids"], "markers": item["markers"], "qtype": item["qtype"], "target": target})
    return items


def collate(items, pad_id):
    b = len(items)
    seq_len = max(len(it["ids"]) for it in items)
    kmax = max(len(it["markers"]) for it in items)
    ids = torch.full((b, seq_len), pad_id, dtype=torch.long)
    att = torch.zeros((b, seq_len), dtype=torch.long)
    pos = torch.zeros((b, kmax), dtype=torch.long)
    mask = torch.zeros((b, kmax), dtype=torch.bool)
    target = torch.zeros((b, kmax), dtype=torch.float32)
    for i, it in enumerate(items):
        n = len(it["ids"])
        ids[i, :n] = torch.tensor(it["ids"])
        att[i, :n] = 1
        k = len(it["markers"])
        pos[i, :k] = torch.tensor(it["markers"])
        mask[i, :k] = True
        target[i, :k] = torch.tensor(it["target"])
    return ids, att, pos, mask, target, torch.tensor([it["qtype"] for it in items], dtype=torch.long)


def fit_temperature(samples):
    if len(samples) < 10:
        return 1.0
    kmax = max(len(lg) for lg, _ in samples)
    logits = torch.full((len(samples), kmax), -1e4)
    targets = torch.zeros((len(samples), kmax))
    for i, (lg, t) in enumerate(samples):
        logits[i, :len(lg)] = torch.as_tensor(lg)
        targets[i, :len(t)] = torch.as_tensor(t)
    log_t = torch.zeros(1, requires_grad=True)
    opt = torch.optim.LBFGS([log_t], lr=0.1, max_iter=100)

    def closure():
        opt.zero_grad()
        loss = -(targets * torch.log_softmax(logits / log_t.exp(), -1)).sum(-1).mean()
        loss.backward()
        return loss

    opt.step(closure)
    return float(torch.clamp(log_t.exp(), 0.1, 10.0).item())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", required=True, help="directory holding the base checkpoint (model.safetensors, encoder/, tokenizer/)")
    ap.add_argument("--out", required=True)
    ap.add_argument("--epochs", type=int, default=3)
    ap.add_argument("--micro-batch", type=int, default=8)
    ap.add_argument("--grad-accum", type=int, default=2)
    ap.add_argument("--threads", type=int, default=0)
    ap.add_argument("--seed", type=int, default=20260930)
    args = ap.parse_args()

    if args.threads:
        torch.set_num_threads(args.threads)
    torch.manual_seed(args.seed)
    base = Path(args.base)
    out = Path(args.out)
    agent = laya.load(str(base), device="cpu")
    tok, cfg = agent.tok, dict(agent.cfg)
    model = agent.model.float().train()

    train_items = encode(agent, load_rows("train"))
    calib_items = encode(agent, load_rows("calib"))
    print(f"train items {len(train_items)}  calib items {len(calib_items)}", flush=True)

    enc = [p for n, p in model.named_parameters() if "encoder." in n]
    head = [p for n, p in model.named_parameters() if "encoder." not in n]
    opt = torch.optim.AdamW([{"params": enc, "lr": 2.5e-5}, {"params": head, "lr": 1e-4}], weight_decay=0.01)
    updates = max(1, math.ceil(len(train_items) / args.micro_batch / args.grad_accum) * args.epochs)
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=updates, eta_min=1e-6)

    log = []
    t0 = time.time()
    for epoch in range(args.epochs):
        random.Random(args.seed + epoch).shuffle(train_items)
        opt.zero_grad(set_to_none=True)
        total, n = 0.0, 0
        sigma = 0.4 + (0.1 - 0.4) * epoch / max(1, args.epochs - 1)
        for start in range(0, len(train_items), args.micro_batch):
            ids, att, pos, mask, target, qtype = collate(train_items[start:start + args.micro_batch], tok.pad_token_id)
            logits, act = model(ids, att, pos, mask, qtype)
            logits = logits.float()
            k = mask.sum(-1, keepdim=True).float()
            eps = torch.randn((4,) + logits.shape) * sigma * mask
            eps = (eps - eps.sum(-1, keepdim=True) / k) * mask
            noisy = logits.detach().unsqueeze(0) + eps
            probs = torch.softmax(noisy.masked_fill(~mask, -1e4), -1)
            with torch.no_grad():
                reward = proper_reward(probs, target.unsqueeze(0), qtype, mask, w_sph=0.75, w_rps=1.0)
                adv = reward - reward.mean(0, keepdim=True)
                adv = adv / (adv.std() + 1e-6)
            logp = -(((noisy - logits.unsqueeze(0)) ** 2) * mask).sum(-1) / (2 * sigma ** 2)
            loss_rl = -(adv * logp).mean()
            loss_ce = -(target * torch.log_softmax(logits.masked_fill(~mask, -1e4), -1)).sum(-1).mean()
            loss = (loss_rl + loss_ce + 0.0 * act.sum()) / args.grad_accum
            loss.backward()
            n += 1
            if n % args.grad_accum == 0 or start + args.micro_batch >= len(train_items):
                torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
                opt.step()
                sched.step()
                opt.zero_grad(set_to_none=True)
            total += loss_ce.item()
            if n % 25 == 0:
                print(f"epoch {epoch + 1} step {n} ce={loss_ce.item():.4f} elapsed={time.time() - t0:.0f}s", flush=True)
        log.append({"epoch": epoch + 1, "mean_ce": round(total / max(1, n), 4), "elapsed_s": round(time.time() - t0, 1)})
        print(log[-1], flush=True)

    model.eval()
    buckets = {}
    with torch.no_grad():
        for start in range(0, len(calib_items), args.micro_batch):
            chunk = calib_items[start:start + args.micro_batch]
            ids, att, pos, mask, target, qtype = collate(chunk, tok.pad_token_id)
            logits, _ = model(ids, att, pos, mask, qtype)
            for i, it in enumerate(chunk):
                k = len(it["markers"])
                buckets.setdefault(temp_bucket(it["qtype"], k), []).append((logits[i, :k].float(), it["target"]))
    temps = {b: fit_temperature(s) for b, s in buckets.items()}
    print("temperatures", temps, flush=True)

    out.mkdir(parents=True, exist_ok=True)
    save_file({n: v.detach().half().cpu().contiguous() for n, v in model.state_dict().items()},
              str(out / "model.safetensors"))
    for sub in ("encoder", "tokenizer"):
        shutil.copytree(base / sub, out / sub, dirs_exist_ok=True)
    cfg.update({
        "model_name": "laya-dhristi-plan-review",
        "fine_tuned": True,
        "temperature_by_options": temps,
        "dhristi": {
            "dataset": "Benchmarks/datasets/laya-plan-review-v01",
            "base": "convaiinnovations/laya (multilingual)",
            "epochs": args.epochs, "micro_batch": args.micro_batch, "grad_accum": args.grad_accum,
            "seed": args.seed, "train_items": len(train_items), "calib_items": len(calib_items),
            "log": log, "device": "cpu", "torch_threads": torch.get_num_threads(),
        },
    })
    cfg.pop("training", None)
    (out / "rl_agent_config.json").write_text(json.dumps(cfg, indent=2) + "\n")
    print(f"saved {out}", flush=True)


if __name__ == "__main__":
    main()
