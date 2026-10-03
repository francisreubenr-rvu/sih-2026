"""Synthetic voiceover for the demo video, with Kokoro (hexgrad/Kokoro-82M, Apache-2.0), run locally.

The voice is a blend of Kokoro's British English female voice with a share of its Hindi female voice,
spoken with British English pronunciation: mostly UK, with a light Indian colour. --hindi sets the
share. Each block starts at its scene in timeline.json (written by compose-demo.py with a 5 s title).

    python scripts/e2e-v5/voiceover-demo.py --timeline <video>/timeline.json --out <dir> [--hindi 0.25]
    python scripts/e2e-v5/voiceover-demo.py --samples --out <dir>   # one sentence at three blends

Writes voiceover.wav and plan.json ({"title_s", "end_s"}) for compose-demo.py --audio.
"""

import argparse
import json
from pathlib import Path

import numpy as np
import soundfile as sf
from kokoro import KPipeline

SR = 24000
UK, HI = "bf_emma", "hf_alpha"

# (anchor caption prefix in timeline.json, text). Spelled for speech: "Dhristi", not "DHRISTI".
BLOCKS = [
    ("TITLE", "This is Dhristi, our privacy-preserving browser tool. Everything you see is the working "
              "build, on synthetic test pages."),
    ("Pair the extension", "First, the Chrome extension pairs with the Warden, a small service on this computer. "
                           "Until the Warden proves the code, nothing is sent."),
    ("Task 1", "We ask it to update the contact email and save. The page is redacted on the device: the name "
               "and email become tokens before anything leaves. Typing the email changes something, so Dhristi "
               "asks first. Same for Save."),
    ("Page: \"Saved", "Saved. The real address was filled in locally from its token. The Sent view shows exactly "
                      "what reached the cloud: tokens, never the email or the name."),
    ("Task 2", "Now a bank page: open the account statements. The detector isn't sure whether Account statements "
               "is an account number, so it asks. It's a link label, so we keep it. Our Laya reviewer judges the "
               "click as plain navigation, so it runs without a question."),
    ("Task 3", "Finally, delete the account. Deleting is destructive, so Dhristi always asks, whatever the planner "
               "or the reviewer thinks. We skip it. The planner tries again, and Dhristi asks again. Each time, we "
               "skip. Nothing was deleted."),
    ("END", "In this run, twenty-nine requests reached the cloud planner, and none carried a personal value. "
            "These are synthetic pages, our two-hundred-millisecond latency target isn't met yet, and we haven't "
            "tested with outside users yet. That's Dhristi."),
]


def voice(pipe, hindi):
    return (1 - hindi) * pipe.load_voice(UK) + hindi * pipe.load_voice(HI)


def speak(pipe, v, text, speed=1.0):
    parts = [a for _, _, a in pipe(text, voice=v, speed=speed)]
    return np.concatenate([p.numpy() if hasattr(p, "numpy") else p for p in parts])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--timeline")
    ap.add_argument("--out", required=True)
    ap.add_argument("--hindi", type=float, default=0.25)
    ap.add_argument("--samples", action="store_true")
    a = ap.parse_args()
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    pipe = KPipeline(lang_code="b", repo_id="hexgrad/Kokoro-82M")

    if a.samples:
        line = BLOCKS[1][1]
        for h in (0.15, 0.25, 0.35):
            sf.write(out / f"sample-hindi-{int(h * 100)}.wav", speak(pipe, voice(pipe, h), line), SR)
        return

    v = voice(pipe, a.hindi)
    clips = [speak(pipe, v, text) for _, text in BLOCKS]
    lens = [len(c) / SR for c in clips]
    title_s = max(5.0, round(lens[0] + 1.2, 1))
    end_s = max(10.0, round(lens[-1] + 1.5, 1))
    shift = title_s - 5.0

    tl = json.loads(Path(a.timeline).read_text())["timeline"]
    starts = [0.4]
    for anchor, _ in BLOCKS[1:-1]:
        starts.append(next(c["start"] for c in tl if c["text"].startswith(anchor)) + shift + 0.3)
    starts.append(next(c["start"] for c in tl if c["scene"] == "END") + shift + 0.5)
    total = starts[-1] - 0.5 + end_s

    # A block may run into the next scene's start by at most 0.4 s; otherwise say it faster.
    for i in range(len(clips) - 1):
        room = starts[i + 1] - starts[i] + 0.4
        speed = 1.0
        while lens[i] > room and speed < 1.25:
            speed = round(speed + 0.05, 2)
            clips[i] = speak(pipe, v, BLOCKS[i][1], speed)
            lens[i] = len(clips[i]) / SR
        if lens[i] > room:
            raise SystemExit(f"block {i} is {lens[i]:.1f}s for {room:.1f}s even at 1.25x; shorten its text")

    track = np.zeros(int(total * SR) + SR, dtype=np.float32)
    for s, c in zip(starts, clips):
        i = int(s * SR)
        track[i:i + len(c)] += c[: len(track) - i]
    peak = float(np.max(np.abs(track))) or 1.0
    track = track / peak * 0.89
    sf.write(out / "voiceover.wav", track, SR)
    plan = {"title_s": title_s, "end_s": end_s, "hindi_share": a.hindi, "voices": [UK, HI],
            "blocks": [{"start": round(s, 2), "seconds": round(l, 2)} for s, l in zip(starts, lens)]}
    (out / "plan.json").write_text(json.dumps(plan, indent=2))
    print(json.dumps(plan))


if __name__ == "__main__":
    main()
