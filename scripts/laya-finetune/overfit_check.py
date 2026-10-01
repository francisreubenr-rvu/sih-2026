"""Can a Laya checkpoint fit N of its own training choice steps at all? CE loss only, top TOP layers.

Separates "the pipeline or targets cannot be learned" from "not enough training". On 1 October 2026
the v1/v2 targets reached 26/64 after 4 epochs; the v3 targets reached 63/64 after 6.

    DATA=scripts/laya-finetune/train_v3.jsonl EP=6 python scripts/laya-finetune/overfit_check.py <laya snapshot dir>

Environment: DATA, N (64), EP (8), LRE (1e-4), LRH (5e-4), TOP (6).
"""
import json, os, random, sys, time
import torch
from safetensors.torch import load_file
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import train_cpu
from laya.common import build_model
from transformers import AutoTokenizer
base = sys.argv[1]; N = int(os.environ.get("N", 64)); EP = int(os.environ.get("EP", 8))
LRE = float(os.environ.get("LRE", 1e-4)); LRH = float(os.environ.get("LRH", 5e-4)); TOP = int(os.environ.get("TOP", 6))
torch.manual_seed(0); torch.set_num_threads(4)
cfg = json.load(open(os.path.join(base, "rl_agent_config.json")))
tok = AutoTokenizer.from_pretrained(os.path.join(base, "tokenizer"))
items = [it for it in train_cpu.items_from(os.environ.get("DATA") or os.path.join(os.path.dirname(os.path.abspath(__file__)), "train_v3.jsonl"), tok, cfg) if it["qtype"] == 0]
random.Random(1).shuffle(items); items = items[:N]
model = build_model(cfg, encoder_dir=os.path.join(base, "encoder"))
model.load_state_dict({k: v.float() for k, v in load_file(os.path.join(base, "model.safetensors")).items()}, strict=True)
L = model.encoder.config.num_hidden_layers
keep = {f"layers.{k}." for k in range(L - TOP, L)}
for n, p in model.named_parameters():
    p.requires_grad = (not n.startswith("encoder.")) or any(k in n for k in keep) or "final_norm" in n
enc = [p for n, p in model.named_parameters() if p.requires_grad and n.startswith("encoder.")]
head = [p for n, p in model.named_parameters() if p.requires_grad and not n.startswith("encoder.")]
opt = torch.optim.AdamW([{"params": enc, "lr": LRE}, {"params": head, "lr": LRH}], weight_decay=0.0)
def acc():
    model.eval(); ok = 0
    with torch.no_grad():
        for i in range(0, len(items), 8):
            ch = items[i:i+8]; b = train_cpu.collate(ch, tok.pad_token_id)
            lg, _ = model(b["input_ids"], b["attention_mask"], b["marker_pos"], b["marker_mask"], b["qtype"])
            for j, it in enumerate(ch):
                ok += it["target"][int(lg[j, :len(it["markers"])].argmax())] == max(it["target"])
    model.train(); return ok
t0 = time.time(); print("before", acc(), "/", N, flush=True)
rng = random.Random(0)
for ep in range(EP):
    order = items[:]; rng.shuffle(order); tot = 0
    for i in range(0, N, 4):
        b = train_cpu.collate(order[i:i+4], tok.pad_token_id)
        lg, act = model(b["input_ids"], b["attention_mask"], b["marker_pos"], b["marker_mask"], b["qtype"])
        m = b["marker_mask"]
        loss = -(b["target"] * torch.log_softmax(lg.float().masked_fill(~m, -1e4), -1)).sum(-1).mean() + 0.0 * act.sum()
        opt.zero_grad(); loss.backward(); torch.nn.utils.clip_grad_norm_([p for p in model.parameters() if p.requires_grad], 1.0); opt.step()
        tot += loss.item()
    print(f"epoch {ep+1} ce {tot/(N/4):.3f} acc {acc()}/{N} {time.time()-t0:.0f}s", flush=True)
