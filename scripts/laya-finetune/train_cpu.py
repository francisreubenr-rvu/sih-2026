"""Fine-tune Laya on Dhristi's fast-path decisions (CPU by default; uses CUDA when present).

A single-process port of the authors' DDP notebook
(github.com/NandhaKishorM/laya, notebooks/laya_finetune_typed_decisions_2xT4_kaggle.ipynb):
the same objective (RLCD policy gradient against a proper scoring rule plus soft cross-entropy),
the same held-out calibration slice and per-type temperature fit. Differences, all for a 4-core
CPU with no GPU: fp32 instead of fp16 autocast, no DDP, and only the top TRAIN_TOP_LAYERS encoder
layers plus the decision head are trained (the lower layers stay frozen).

    python scripts/laya-finetune/train_cpu.py <base_model_dir> scripts/laya-finetune/train.jsonl <out_dir>

Environment: EPOCHS (2), TRAIN_TOP_LAYERS (6; 28 or more trains the whole encoder, as the
authors' recipe does), MAX_LEN / HEAD_MAX_LEN (default: the checkpoint's; the authors trained at
1024 / 256). On CUDA it uses fp16 autocast and gradient checkpointing, as the notebook does.
The lengths used are written into the output config, so inference reads the same ones.
"""

import json
import math
import os
import random
import sys
import time
from pathlib import Path

import torch
from safetensors.torch import load_file, save_file
from transformers import AutoTokenizer

from laya.agent import _fix_tokenizer_config
from laya.common import QTYPES, build_model, build_sequence, proper_reward

SEED = 20260930
EPOCHS = int(os.environ.get("EPOCHS", "2"))
TRAIN_TOP_LAYERS = int(os.environ.get("TRAIN_TOP_LAYERS", "6"))
MICRO_BATCH = 4
GRAD_ACCUM = 4
GROUP_SIZE = 4
LR_ENCODER = 2.5e-5
LR_HEAD = 1.0e-4
SIGMA_START, SIGMA_END = 0.4, 0.1
CALIB_FRACTION = 0.1


def items_from(path, tok, cfg):
    sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "warden"))
    import fastpath

    out = []
    for line in open(path):
        row = json.loads(line)
        body, gold = row["body"], row["gold"]
        # Compact keys, exactly as the Warden asks Laya at run time (fastpath.option_table).
        state, qs = fastpath.state_for(body), fastpath.questions(body, compact=True)
        to_action = {key: action for key, action, _ in fastpath.option_table(body, compact=True)}
        for qid, q in qs.items():
            t = q["type"]
            crit = q.get("criteria", {})
            if t == "choice":
                target = [gold[qid][to_action[k]] for k in crit]
            else:
                target = [gold[qid]["false"], gold[qid]["true"]]
            s = sum(target)
            target = [v / s for v in target]
            seq, markers = build_sequence(tok, state, {"t": t, "ins": q["instructions"], "crit": crit}, cfg["max_len"], cfg["head_max_len"])
            if len(markers) != len(target):
                continue  # an option lost its marker to the length budget; skip rather than mislabel
            out.append({"ids": seq, "markers": markers, "qtype": QTYPES[t], "target": target, "label": target.index(max(target))})
    return out


def collate(items, pad_id):
    n, L = len(items), max(len(it["ids"]) for it in items)
    kmax = max(len(it["markers"]) for it in items)
    b = {"input_ids": torch.full((n, L), pad_id, dtype=torch.long), "attention_mask": torch.zeros((n, L), dtype=torch.long),
         "marker_pos": torch.zeros((n, kmax), dtype=torch.long), "marker_mask": torch.zeros((n, kmax), dtype=torch.bool),
         "target": torch.zeros((n, kmax)), "qtype": torch.tensor([it["qtype"] for it in items])}
    for i, it in enumerate(items):
        b["input_ids"][i, : len(it["ids"])] = torch.tensor(it["ids"])
        b["attention_mask"][i, : len(it["ids"])] = 1
        k = len(it["markers"])
        b["marker_pos"][i, :k] = torch.tensor(it["markers"])
        b["marker_mask"][i, :k] = True
        b["target"][i, : len(it["target"])] = torch.tensor(it["target"])
    return b


def fit_one_temp(sel):
    if len(sel) < 10:
        return 1.0
    kmax = max(len(z) for z, _ in sel)
    Z = torch.full((len(sel), kmax), -1e4)
    T = torch.zeros((len(sel), kmax))
    for i, (z, t) in enumerate(sel):
        Z[i, : len(z)] = torch.tensor(z)
        T[i, : len(t)] = torch.tensor(t)
    log_t = torch.zeros(1, requires_grad=True)
    opt = torch.optim.LBFGS([log_t], lr=0.1, max_iter=100)

    def closure():
        opt.zero_grad()
        loss = -(T * torch.log_softmax(Z / log_t.exp(), -1)).sum(-1).mean()
        loss.backward()
        return loss

    opt.step(closure)
    return float(torch.clamp(log_t.exp(), 0.1, 10.0).item())


def batches(items, rng):
    """Length-bucketed micro-batches: sort by length, chunk, shuffle the chunks."""
    order = sorted(items, key=lambda it: len(it["ids"]))
    chunks = [order[i : i + MICRO_BATCH] for i in range(0, len(order), MICRO_BATCH)]
    rng.shuffle(chunks)
    return chunks


def main():
    base, data, out_dir = sys.argv[1], sys.argv[2], sys.argv[3]
    torch.manual_seed(SEED)
    torch.set_num_threads(os.cpu_count() or 4)
    device = torch.device("cuda" if torch.cuda.is_available() and not os.environ.get("FORCE_CPU") else "cpu")
    use_amp = device.type == "cuda"
    _fix_tokenizer_config(base)
    cfg = json.load(open(os.path.join(base, "rl_agent_config.json")))
    for key, env in (("max_len", "MAX_LEN"), ("head_max_len", "HEAD_MAX_LEN")):
        if os.environ.get(env):
            cfg[key] = int(os.environ[env])
    tok = AutoTokenizer.from_pretrained(os.path.join(base, "tokenizer"))
    model = build_model(cfg, encoder_dir=os.path.join(base, "encoder"))
    model.load_state_dict(load_file(os.path.join(base, "model.safetensors")), strict=True)
    n_layers = model.encoder.config.num_hidden_layers
    keep = {f"layers.{k}." for k in range(n_layers - TRAIN_TOP_LAYERS, n_layers)}
    for name, p in model.named_parameters():
        p.requires_grad = (not name.startswith("encoder.")) or any(k in name for k in keep) or "final_norm" in name
    if use_amp:
        model.encoder.gradient_checkpointing_enable(gradient_checkpointing_kwargs={"use_reentrant": False})
    model.to(device)
    model.train()
    scaler = torch.amp.GradScaler("cuda", enabled=use_amp)

    all_items = items_from(data, tok, cfg)
    order = list(range(len(all_items)))
    random.Random(SEED).shuffle(order)
    n_calib = max(10, int(len(all_items) * CALIB_FRACTION))
    calib = [all_items[i] for i in sorted(order[:n_calib])]
    train = [all_items[i] for i in sorted(order[n_calib:])]

    enc = [p for n, p in model.named_parameters() if p.requires_grad and n.startswith("encoder.")]
    head = [p for n, p in model.named_parameters() if p.requires_grad and not n.startswith("encoder.")]
    opt = torch.optim.AdamW([{"params": enc, "lr": LR_ENCODER}, {"params": head, "lr": LR_HEAD}], weight_decay=0.01)
    steps_per_epoch = math.ceil(len(train) / MICRO_BATCH)
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=max(1, steps_per_epoch * EPOCHS // GRAD_ACCUM), eta_min=1e-6)
    trainable = sum(p.numel() for p in model.parameters() if p.requires_grad)
    print(f"items {len(all_items)} (train {len(train)}, calibration {len(calib)}) | trainable {trainable / 1e6:.0f}M "
          f"of {sum(p.numel() for p in model.parameters()) / 1e6:.0f}M | epochs {EPOCHS} | {device} | "
          f"max_len {cfg['max_len']} head_max_len {cfg['head_max_len']}", flush=True)

    rng = random.Random(SEED)
    t0 = time.time()
    log = []
    for epoch in range(EPOCHS):
        sigma = SIGMA_START + (SIGMA_END - SIGMA_START) * (epoch / max(1, EPOCHS - 1))
        tot, n = 0.0, 0
        opt.zero_grad(set_to_none=True)
        for step, chunk in enumerate(batches(train, rng), 1):
            b = {k: v.to(device) for k, v in collate(chunk, tok.pad_token_id).items()}
            with torch.autocast(device.type, dtype=torch.float16, enabled=use_amp):
                logits, act = model(b["input_ids"], b["attention_mask"], b["marker_pos"], b["marker_mask"], b["qtype"])
            logits = logits.float()
            mask = b["marker_mask"]
            k = mask.sum(-1, keepdim=True).float()
            target = b["target"]
            eps = torch.randn((GROUP_SIZE,) + logits.shape, device=device) * sigma * mask
            eps = (eps - eps.sum(-1, keepdim=True) / k) * mask
            z = logits.detach().unsqueeze(0) + eps
            q = torch.softmax(z.masked_fill(~mask, -1e4), -1)
            with torch.no_grad():
                r = proper_reward(q, target.unsqueeze(0), b["qtype"], mask, w_sph=0.75, w_rps=1.0)
                adv = (r - r.mean(0, keepdim=True)) / (r.std() + 1e-6)
            logp = -(((z - logits.unsqueeze(0)) ** 2) * mask).sum(-1) / (2 * sigma ** 2)
            loss_rl = -(adv * logp).mean()
            loss_ce = -(target * torch.log_softmax(logits.masked_fill(~mask, -1e4), -1)).sum(-1).mean()
            loss = (loss_rl + loss_ce) / GRAD_ACCUM + 0.0 * act.sum()
            scaler.scale(loss).backward()
            if step % GRAD_ACCUM == 0 or step == steps_per_epoch:
                scaler.unscale_(opt)
                torch.nn.utils.clip_grad_norm_([p for p in model.parameters() if p.requires_grad], 1.0)
                scaler.step(opt)
                scaler.update()
                sched.step()
                opt.zero_grad(set_to_none=True)
            tot += loss_ce.item()
            n += 1
            if step % 25 == 0:
                print(f"  epoch {epoch + 1} step {step}/{steps_per_epoch} ce {loss_ce.item():.4f} "
                      f"reward {r.mean().item():.3f} {time.time() - t0:.0f}s", flush=True)
        log.append({"epoch": epoch + 1, "mean_ce": round(tot / max(1, n), 4), "elapsed_s": round(time.time() - t0)})
        print(f"=== epoch {epoch + 1} mean ce {tot / max(1, n):.4f} at {time.time() - t0:.0f}s", flush=True)

    model.eval()
    preds = []
    with torch.no_grad():
        for i in range(0, len(calib), 8):
            chunk = calib[i : i + 8]
            b = {k: v.to(device) for k, v in collate(chunk, tok.pad_token_id).items()}
            with torch.autocast(device.type, dtype=torch.float16, enabled=use_amp):
                lg, _ = model(b["input_ids"], b["attention_mask"], b["marker_pos"], b["marker_mask"], b["qtype"])
            for j, it in enumerate(chunk):
                preds.append((it["qtype"], lg[j, : len(it["markers"])].float().tolist(), it["target"]))
    temps = list(cfg.get("temperature", [1.2, 1.2, 1.2]))
    for qt in range(3):
        sel = [(z, t) for q_t, z, t in preds if q_t == qt]
        if len(sel) >= 10:
            temps[qt] = fit_one_temp(sel)
    print("calibration temperatures (choice, score, noul):", [round(t, 3) for t in temps], flush=True)

    os.makedirs(out_dir, exist_ok=True)
    save_file({k: v.half().contiguous().cpu() for k, v in model.state_dict().items()}, os.path.join(out_dir, "model.safetensors"))
    model.encoder.config.save_pretrained(os.path.join(out_dir, "encoder"))
    tok.save_pretrained(os.path.join(out_dir, "tokenizer"))
    cfg.update({"fine_tuned": True, "model_name": "laya-dhristi-fastpath", "temperature": temps})
    cfg.pop("temperature_by_options", None)
    json.dump(cfg, open(os.path.join(out_dir, "rl_agent_config.json"), "w"), indent=2)
    json.dump({"seed": SEED, "epochs": EPOCHS, "train_top_layers": TRAIN_TOP_LAYERS, "device": device.type,
               "max_len": cfg["max_len"], "head_max_len": cfg["head_max_len"], "items": len(all_items),
               "train_items": len(train), "calibration_items": len(calib), "trainable_params": trainable,
               "epochs_log": log, "temperatures": temps, "data": os.path.basename(data)},
              open(os.path.join(out_dir, "training_meta.json"), "w"), indent=2)
    print("saved", out_dir, flush=True)


if __name__ == "__main__":
    main()
