"""Narrated demo video with no silent stretches: the footage is fitted to the narration.

Each scene of the real-time composite (compose-demo.py's work/realtime.mp4) is paired with a block of
narration. The scene is sped up or slowed (down to 0.6x) to the narration's length, so the voice runs from the first
second to the last. A scene sped up 1.5x or more carries an on-screen badge with its factor; a scene
whose narration would need it slower than 0.6x holds its last frame instead. Title and end cards carry
the team's names.

Voices:
  --engine kokoro      Kokoro (hexgrad/Kokoro-82M), run locally. --hindi sets the Hindi female voice's
                       share in a blend with the British female voice; British pronunciation.
  --engine elevenlabs  ElevenLabs text to speech. Needs ELEVENLABS_API_KEY and --voice-id; the key is
                       read from the environment and never written anywhere.
  --engine files       Recorded clips, one per paragraph of script.txt, in --clips (sorted by name;
                       any format ffmpeg reads), e.g. exported from the ElevenLabs app.

    python scripts/e2e-v5/narrate-demo.py --demo <E2E_OUT> --realtime <compose out>/work/realtime.mp4 \
        --fonts <dir> --facts <json> --out <dir> [--engine kokoro --hindi 0.5]
"""

import argparse
import importlib.util
import json
import os
import subprocess
from pathlib import Path

import numpy as np
import soundfile as sf

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("compose_demo", HERE / "compose-demo.py")
cd = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cd)

SR = 24000
GAP = 0.3         # breath between blocks, seconds
MIN_SPEED = 0.6   # slower than this, hold the last frame instead
TEAM = ["Francis", "Gopreeth", "Hiranmayi", "Varun", "Koushaik", "Niharika"]

TITLE = ("This is Dhristi, a privacy-preserving browser tool, built for Smart India Hackathon by Francis, "
         "Gopreeth, Hiranmayi, Varun, Koushaik and Niharika. Everything you see is the working build, "
         "running on synthetic test pages.")
END = ("In this run, twenty-nine requests reached the cloud planner, and not one carried a personal value. "
       "These are synthetic pages, our two-hundred-millisecond latency target isn't met yet, and we haven't "
       "tested with outside users yet. Thank you for watching Dhristi.")


def scenes(marks):
    """(start, end, narration) on the real-time clock, from record-demo.mjs marks."""
    t = lambda m: m["t"] / 1000
    tasks = [m for m in marks if m["scene"] == "task"]
    q3 = [m for m in marks if m["scene"] == "question" and m["t"] > tasks[2]["t"]]
    results = [m for m in marks if m["scene"] == "result"]
    end = t(marks[-1])
    return [
        (0.0, t(tasks[0]),
         "First, the Chrome extension pairs with the Warden, a small service running on this computer. Until "
         "the Warden proves the pairing code, the extension sends nothing at all."),
        (t(tasks[0]), t(results[0]),
         "Task one: update the contact email and save. Before anything leaves, the page is read and redacted "
         "on the device, so the name and the email become tokens. The cloud planner proposes typing the email. "
         "That changes something, so Dhristi asks first, and we approve. The same happens for the Save button."),
        (t(results[0]), t(tasks[1]),
         "Saved. The real address was filled in locally, from its token. Now the Sent view: this is exactly "
         "what reached the cloud planner. You can see the tokens, but never the email or the name."),
        (t(tasks[1]), t(tasks[2]),
         "Task two, on a bank page: open the account statements. The detector isn't sure whether Account "
         "statements is an account number, so it stops and asks. It's only a link label, so we keep it. Our "
         "Laya reviewer then judges the click as plain navigation that serves the task, so it runs without "
         "a question."),
        (t(tasks[2]), t(q3[0]) + 5.0,
         "Task three: delete the account. Deleting is destructive, so Dhristi always asks, whatever the planner "
         "or the reviewer thinks. We skip it."),
        (t(q3[0]) + 5.0, t(q3[-1]) - 0.2,
         "The planner doesn't give up. It waits, reads the page again, and after a few steps proposes the "
         "delete a second time. That proposal goes through the same local checks, so Dhristi asks again, and "
         "again we skip. Every one of these planning requests carried only tokens."),
        (t(q3[-1]) - 0.2, end,
         "A third attempt brings a third question, and a third skip. The planner finishes, and the page "
         "confirms that nothing was deleted."),
    ]


class Kokoro:
    def __init__(self, hindi):
        from kokoro import KPipeline
        self.pipe = KPipeline(lang_code="b", repo_id="hexgrad/Kokoro-82M")
        self.voice = (1 - hindi) * self.pipe.load_voice("bf_emma") + hindi * self.pipe.load_voice("hf_alpha")

    def __call__(self, text):
        parts = [a for _, _, a in self.pipe(text, voice=self.voice, speed=1.0)]
        return np.concatenate([p.numpy() if hasattr(p, "numpy") else p for p in parts]).astype(np.float32)


class ElevenLabs:
    def __init__(self, voice_id, model):
        import requests
        self.requests, self.voice_id, self.model = requests, voice_id, model
        self.key = os.environ["ELEVENLABS_API_KEY"]

    def __call__(self, text):
        r = self.requests.post(
            f"https://api.elevenlabs.io/v1/text-to-speech/{self.voice_id}",
            params={"output_format": "pcm_24000"},
            headers={"xi-api-key": self.key, "accept": "audio/pcm"},
            json={"text": text, "model_id": self.model,
                  "voice_settings": {"stability": 0.5, "similarity_boost": 0.75}},
            timeout=120)
        r.raise_for_status()
        return np.frombuffer(r.content, dtype="<i2").astype(np.float32) / 32768.0


def trim(clip, floor=0.01, keep=0.04):
    """Drop the synthesiser's leading and trailing silence, so blocks join with only GAP between them."""
    loud = np.flatnonzero(np.abs(clip) > floor)
    if not len(loud):
        return clip
    return clip[max(0, loud[0] - int(keep * SR)): loud[-1] + int(keep * SR)]


class Files:
    """Recorded clips, taken in name order, one per narration block."""
    def __init__(self, folder):
        self.paths = sorted(p for p in Path(folder).iterdir() if p.is_file())
        self.i = 0

    def __call__(self, text):
        path = self.paths[self.i]
        self.i += 1
        pcm = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"],
                             check=True, capture_output=True).stdout
        return np.frombuffer(pcm, dtype="<f4").copy()


def run(cmd):
    subprocess.run(cmd, check=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--demo", required=True)
    ap.add_argument("--realtime", required=True)
    ap.add_argument("--fonts", required=True)
    ap.add_argument("--facts", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--engine", choices=["kokoro", "elevenlabs", "files"], default="kokoro")
    ap.add_argument("--clips", help="directory of recorded clips for --engine files")
    ap.add_argument("--credit", default="Narration: synthetic voice.", help="end card line naming the voice")
    ap.add_argument("--hindi", type=float, default=0.5)
    ap.add_argument("--voice-id")
    ap.add_argument("--model", default="eleven_multilingual_v2")
    a = ap.parse_args()
    out, work = Path(a.out), Path(a.out) / "work"
    work.mkdir(parents=True, exist_ok=True)
    marks = json.loads((Path(a.demo) / "marks.json").read_text())["marks"]
    facts = json.loads(Path(a.facts).read_text())
    speak = (Kokoro(a.hindi) if a.engine == "kokoro" else ElevenLabs(a.voice_id, a.model)
             if a.engine == "elevenlabs" else Files(a.clips))

    # Narration first; everything else is timed to it.
    sc = scenes(marks)
    texts = [TITLE] + [s[2] for s in sc] + [END]
    clips = [trim(speak(t)) for t in texts]
    secs = [len(c) / SR for c in clips]

    team = " · ".join(TEAM)
    cd.card(a.fonts, [
        ("DHRISTI: Privacy-Preserving Browser Tool", "Anton-Regular.ttf", 84, None, cd.NAVY, 30),
        ("Live demo of the working build", "Montserrat.ttf", 40, 600, cd.ORANGE, 40),
        ("SIH26171 · Team rm -rf /* · Team ID 168225", "Montserrat.ttf", 30, 500, cd.SLATE, 10),
        (team, "Montserrat.ttf", 32, 700, cd.NAVY, 0),
    ], work / "title.png")
    cd.card(a.fonts, [
        ("What this recording shows", "Anton-Regular.ttf", 72, None, cd.NAVY, 30),
        (f"{facts['cloud_requests']} requests reached the cloud planner in this run, and "
         f"{facts['personal_values']} of them carried a personal value from the pages. They carried tokens instead.",
         "Montserrat.ttf", 34, 600, cd.NAVY, 30),
        ("Limits: synthetic test pages only, not real accounts. The 200 ms latency target is not met yet, "
         "and no study with outside users has been run yet.", "Montserrat.ttf", 30, 500, cd.SLATE, 30),
        (f"Team rm -rf /*: {team}", "Montserrat.ttf", 28, 700, cd.NAVY, 16),
        (f"Recorded {facts['date']}. {a.credit}", "Montserrat.ttf", 24, 500, cd.SLATE, 0),
    ], work / "end.png")

    parts, plan = [], []
    for name, sec in (("title", secs[0]), ("end", secs[-1])):
        dur = round(sec + 0.4, 2)
        run(["ffmpeg", "-v", "error", "-y", "-loop", "1", "-framerate", str(cd.FPS), "-i", str(work / f"{name}.png"),
             "-vf", f"fade=in:0:8,fade=out:st={dur - 0.3}:d=0.3", "-t", str(dur), "-r", str(cd.FPS),
             "-c:v", "libx264", "-crf", "16", "-pix_fmt", "yuv420p", str(work / f"{name}.mp4")])
    title_dur, end_dur = round(secs[0] + 0.4, 2), round(secs[-1] + 0.4, 2)

    parts.append(work / "title.mp4")
    plan.append({"part": "title", "seconds": title_dur})
    for i, (s, e, _) in enumerate(sc):
        target = secs[i + 1] + GAP
        speed = (e - s) / target
        vf = f"trim=start={s:.3f}:end={e:.3f},setpts=(PTS-STARTPTS)/{max(speed, MIN_SPEED):.4f},fps={cd.FPS}"
        if speed < MIN_SPEED:
            vf += f",tpad=stop_mode=clone:stop_duration={target - (e - s) / MIN_SPEED:.3f}"
        seg = work / f"seg{i}.mp4"
        cmd = ["ffmpeg", "-v", "error", "-y", "-i", a.realtime]
        if speed >= 1.5:
            badge = work / f"badge{i}.png"
            make_badge(a.fonts, f"Sped up {speed:.1f}×", badge)
            cmd += ["-i", str(badge), "-filter_complex", f"[0:v]{vf}[s];[s][1:v]overlay=60:{cd.H - 150}"]
        else:
            cmd += ["-vf", vf]
        run(cmd + ["-t", f"{target:.3f}", "-r", str(cd.FPS), "-c:v", "libx264", "-crf", "16", "-pix_fmt", "yuv420p", str(seg)])
        parts.append(seg)
        plan.append({"part": f"scene{i + 1}", "real_seconds": round(e - s, 2), "seconds": round(target, 2),
                     "speed": round(speed, 2)})
    parts.append(work / "end.mp4")
    plan.append({"part": "end", "seconds": end_dur})

    # Audio laid on the same clock: each block starts where its part starts.
    total = sum(p["seconds"] for p in plan)
    track = np.zeros(int((total + 1) * SR), dtype=np.float32)
    cursor = 0.0
    for p, clip in zip(plan, clips):
        i = int((cursor + (0.1 if p["part"] == "title" else 0.0)) * SR)
        track[i:i + len(clip)] += clip[: len(track) - i]
        cursor += p["seconds"]
    track = track / (float(np.max(np.abs(track))) or 1.0) * 0.89
    sf.write(work / "voice.wav", track, SR)

    (work / "parts.txt").write_text("".join(f"file '{p}'\n" for p in parts))
    run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(work / "parts.txt"),
         "-i", str(work / "voice.wav"), "-map", "0:v", "-map", "1:a", "-shortest",
         "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k",
         "-movflags", "+faststart", str(out / "dhristi-demo-narrated.mp4")])
    (out / "script.txt").write_text("\n\n".join(texts) + "\n", encoding="utf-8")
    (out / "plan.json").write_text(json.dumps({"engine": a.engine, "hindi_share": a.hindi if a.engine == "kokoro" else None,
                                               "parts": plan, "total_seconds": round(total, 1)}, indent=2))
    print(json.dumps(plan))


def make_badge(fonts, text, path):
    from PIL import Image, ImageDraw
    f = cd.font(fonts, "Montserrat.ttf", 26, 700)
    im = Image.new("RGBA", (300, 60), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((0, 0, 299, 59), radius=30, fill=cd.ORANGE_TINT + (255,), outline=cd.ORANGE + (255,), width=2)
    d.text(((300 - d.textlength(text, font=f)) / 2, 13), text, font=f, fill=cd.ORANGE)
    im.save(path)


if __name__ == "__main__":
    main()
