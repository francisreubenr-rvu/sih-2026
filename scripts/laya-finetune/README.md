# Fine-tuning Laya for the Warden fast path

Laya (`convaiinnovations/laya`, Apache-2.0) is a local decision model with the same interface as
TypeSafe Jev. Zero-shot it was not usable as Dhristi's fast path (see
`Docs/decisions/brain-cloud-models-jev.md`), so this folder fine-tunes it on the fast path's own
questions.

| File | What it is |
|---|---|
| `gen_data.py` | Synthetic training steps, rendered exactly as `warden/fastpath.py` renders them at run time. Domains and labels are kept disjoint from the evaluation sets; it prints the overlap, which must be empty. |
| `train.jsonl` | The v1/v2 training set (`--n 900 --seed 20260930`, made by `gen_data.py` at commit `99c3e30`). Its targets were too flat to train a confident model; see below. |
| `train_v3.jsonl` | The current training set: `--n 900 --seed 20261001`, one right answer per step and 2% total mass on wrong options. |
| `train_cpu.py` | Single-process port of the authors' fine-tuning notebook (same objective, calibration slice and temperature fit). CPU by default, CUDA with fp16 when present. `TRAIN_TOP_LAYERS` (6; 28 = whole encoder), `EPOCHS`, `MAX_LEN`, `HEAD_MAX_LEN`; for a large GPU also `MICRO_BATCH`, `AMP_DTYPE=bf16`, `GRAD_CKPT=0`, `SEED`, `SAVE_EPOCHS` (extra calibrated checkpoints at those epochs). Logs the choice and free-text losses separately each epoch. |
| `diagnose.py` | Does a checkpoint fit its own training steps? Scores the choice question through the training input path. |
| `validate.py` | Scores a checkpoint through `warden/fastpath.decide` (the Warden's own path) on generated validation steps, after dropping any identical to a training step: precision, coverage and free-text steps acted on at each threshold, plus free-text AUROC. Used to choose between checkpoints so the benchmark is not. |
| `colab_train.ipynb` | Colab on an A100/H100 (replaces the Kaggle notebook, 1 October): 20,000 training steps, 4 whole-encoder runs x 6 epochs (checkpoints at 2/4/6, so 12 candidates), each scored with `validate.py`; one is chosen by a rule fixed in the notebook, and only that one runs `fastpath_bench.py`. Results go to Google Drive; weights go to a private Hugging Face repo only if the benchmark meets Jev's bar. |

Reproduce (about 80 minutes on 4 CPU cores; the output is about 0.8 GB and is not committed):

```sh
pip install laya
python scripts/laya-finetune/gen_data.py --n 900 --seed 20260930 --out scripts/laya-finetune/train.jsonl
python scripts/laya-finetune/train_cpu.py <laya snapshot dir> scripts/laya-finetune/train.jsonl ./laya-dhristi
python scripts/cloud-models/fastpath_bench.py --backends laya --laya-model ./laya-dhristi \
    --llm-from Benchmarks/results/fastpath-bench-v01.json --out Benchmarks/results/fastpath-bench-laya-ft-v01.json
```

Use it in the Warden with `WARDEN_FAST_PATH=laya WARDEN_LAYA_MODEL=./laya-dhristi`.

## Results so far (1 October 2026)

| Run | Data | Training | Own training steps right | Top choice, 41 scenes | Acts at 0.9 | Free-text answer |
|---|---|---|---|---|---|---|
| zero-shot | | | 23-24/120 | 17/41 | none | high everywhere (0.69-1.0) |
| v2 | `train.jsonl` (flat targets) | top 6 layers, 2 epochs | 29/120 | 16/41 | none (max 0.79) | about 0.17 everywhere |
| v3 | `train_v3.jsonl` (sharp targets) | top 6, 3 epochs, 1e-4 / 5e-4, update every 4 steps | 60/120 | 19/41 | none | about 0.1 everywhere |
| v4 | `train_v4.jsonl` (25% free text) | v3 + 3 epochs | 80/120 | 28/41 | 27 of 90 held-out decisions, 21 right; wrong on a free-text step | 0.24-0.44 everywhere |
| Colab `a-s2-e6` | 20,000 steps (v4 settings) | whole encoder, 6 epochs, A100 (sweep of 12, chosen on validation) | validation 1,619/1,619 | held-out 21/30 (design not printed) | 21 of 30 held-out, 19 right; wrong on `support-desc-free` (free text) and `profile-phone` | 0.05 or 0.95; AUROC 1.0 on generated steps; wrong side on 6 of 30 held-out cases |

v1/v2 underfit because each wrong option got 2% of the target (a calibrated model could not pass 0.9) and too few updates were made. The choice question trains once the targets are sharp. The free-text question did not train in any CPU run: it settles near the share of free-text steps in the data. None of these checkpoints is safe for the Warden; details and the acceptance bar for the GPU run are in `Docs/decisions/brain-cloud-models-jev.md`.

Reproduce v3 and v4 (each about 1.5-2 hours on 4 CPU cores):

```sh
EPOCHS=3 TRAIN_TOP_LAYERS=6 LR_ENCODER=1e-4 LR_HEAD=5e-4 GRAD_ACCUM=1 \
  python scripts/laya-finetune/train_cpu.py <laya snapshot dir> scripts/laya-finetune/train_v3.jsonl ./laya-dhristi-v3
EPOCHS=3 TRAIN_TOP_LAYERS=6 LR_ENCODER=1e-4 LR_HEAD=5e-4 GRAD_ACCUM=1 \
  python scripts/laya-finetune/train_cpu.py ./laya-dhristi-v3 scripts/laya-finetune/train_v4.jsonl ./laya-dhristi-v4
```

The training data is synthetic and written by us, like the evaluation cases. A good score here
shows the model learned this task's format on synthetic pages; it is not evidence about real sites.
