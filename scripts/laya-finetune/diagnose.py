"""Does a Laya checkpoint fit its own training data? Scores the choice question by argmax over the
model's logits, through exactly the input path train_cpu.py trains on, so a low score here means
the model did not learn (underfit), not that inference builds its input differently.

    python scripts/laya-finetune/diagnose.py <checkpoint_dir> [<checkpoint_dir> ...]
"""

import json
import os
import random
import sys
from pathlib import Path

import torch
from safetensors.torch import load_file
from transformers import AutoTokenizer

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "warden"))

from laya.common import build_model  # noqa: E402

import train_cpu  # noqa: E402

DATA = str(Path(__file__).resolve().parent / "train.jsonl")


def fit(model_dir, n=120):
    cfg = json.load(open(os.path.join(model_dir, "rl_agent_config.json")))
    tok = AutoTokenizer.from_pretrained(os.path.join(model_dir, "tokenizer"))
    items = train_cpu.items_from(DATA, tok, cfg)
    random.Random(1).shuffle(items)
    items = [it for it in items if it["qtype"] == 0][:n]
    model = build_model(cfg, encoder_dir=os.path.join(model_dir, "encoder"))
    model.load_state_dict({k: v.float() for k, v in load_file(os.path.join(model_dir, "model.safetensors")).items()}, strict=True)
    model.eval()
    ok = 0
    with torch.no_grad():
        for i in range(0, len(items), 8):
            chunk = items[i : i + 8]
            b = train_cpu.collate(chunk, tok.pad_token_id)
            logits, _ = model(b["input_ids"], b["attention_mask"], b["marker_pos"], b["marker_mask"], b["qtype"])
            for j, it in enumerate(chunk):
                pred = int(logits[j, : len(it["markers"])].argmax())
                ok += it["target"][pred] == max(it["target"])
    return ok, len(items)


if __name__ == "__main__":
    torch.set_num_threads(os.cpu_count() or 4)
    for d in sys.argv[1:]:
        ok, n = fit(d)
        print(f"{d}: choice argmax on training items {ok}/{n}", flush=True)
