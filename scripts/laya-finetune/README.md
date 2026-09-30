# Fine-tuning Laya for the Warden fast path

Laya (`convaiinnovations/laya`, Apache-2.0) is a local decision model with the same interface as
TypeSafe Jev. Zero-shot it was not usable as Dhristi's fast path (see
`Docs/decisions/brain-cloud-models-jev.md`), so this folder fine-tunes it on the fast path's own
questions.

| File | What it is |
|---|---|
| `gen_data.py` | Synthetic training steps, rendered exactly as `warden/fastpath.py` renders them at run time. Domains and labels are kept disjoint from the evaluation sets; it prints the overlap, which must be empty. |
| `train.jsonl` | The committed training set: `--n 900 --seed 20260930`. |
| `train_cpu.py` | Single-process port of the authors' fine-tuning notebook (same objective, calibration slice and temperature fit). CPU by default, CUDA with fp16 when present. `TRAIN_TOP_LAYERS` (6; 28 = whole encoder), `EPOCHS`, `MAX_LEN`, `HEAD_MAX_LEN`. |
| `diagnose.py` | Does a checkpoint fit its own training steps? Scores the choice question through the training input path. |
| `kaggle_train.ipynb` | The authors' full recipe on a free Kaggle GPU: 3,000 steps, whole encoder, 4 epochs, then `diagnose.py` and the benchmark. |

Reproduce (about 80 minutes on 4 CPU cores; the output is about 0.8 GB and is not committed):

```sh
pip install laya
python scripts/laya-finetune/gen_data.py --n 900 --seed 20260930 --out scripts/laya-finetune/train.jsonl
python scripts/laya-finetune/train_cpu.py <laya snapshot dir> scripts/laya-finetune/train.jsonl ./laya-dhristi
python scripts/cloud-models/fastpath_bench.py --backends laya --laya-model ./laya-dhristi \
    --llm-from Benchmarks/results/fastpath-bench-v01.json --out Benchmarks/results/fastpath-bench-laya-ft-v01.json
```

Use it in the Warden with `WARDEN_FAST_PATH=laya WARDEN_LAYA_MODEL=./laya-dhristi`.

## Results so far (30 September 2026)

Two CPU runs (top 6 layers, 2 epochs) underfit: v2 chose right on 29 of 120 of its own training steps (untrained: 24). v2 also lost the free-text gate (it answers "no free text" everywhere), so it is less safe than the untrained model below the default 0.9 threshold. Details: `Docs/decisions/brain-cloud-models-jev.md`. The GPU notebook is the next attempt.

The training data is synthetic and written by us, like the evaluation cases. A good score here
shows the model learned this task's format on synthetic pages; it is not evidence about real sites.
