# Fine-tuning Laya for the Warden fast path

Laya (`convaiinnovations/laya`, Apache-2.0) is a local decision model with the same interface as
TypeSafe Jev. Zero-shot it was not usable as Dhristi's fast path (see
`Docs/decisions/brain-cloud-models-jev.md`), so this folder fine-tunes it on the fast path's own
questions.

| File | What it is |
|---|---|
| `gen_data.py` | Synthetic training steps, rendered exactly as `warden/fastpath.py` renders them at run time. Domains and labels are kept disjoint from the evaluation sets; it prints the overlap, which must be empty. |
| `train.jsonl` | The committed training set: `--n 900 --seed 20260930`. |
| `train_cpu.py` | Single-process CPU port of the authors' fine-tuning notebook (same objective, calibration slice and temperature fit). Trains the top 6 of 28 encoder layers plus the head. |

Reproduce (about 80 minutes on 4 CPU cores; the output is about 0.8 GB and is not committed):

```sh
pip install laya
python scripts/laya-finetune/gen_data.py --n 900 --seed 20260930 --out scripts/laya-finetune/train.jsonl
python scripts/laya-finetune/train_cpu.py <laya snapshot dir> scripts/laya-finetune/train.jsonl ./laya-dhristi
python scripts/cloud-models/fastpath_bench.py --backends laya --laya-model ./laya-dhristi \
    --llm-from Benchmarks/results/fastpath-bench-v01.json --out Benchmarks/results/fastpath-bench-laya-ft-v01.json
```

Use it in the Warden with `WARDEN_FAST_PATH=laya WARDEN_LAYA_MODEL=./laya-dhristi`.

The training data is synthetic and written by us, like the evaluation cases. A good score here
shows the model learned this task's format on synthetic pages; it is not evidence about real sites.
