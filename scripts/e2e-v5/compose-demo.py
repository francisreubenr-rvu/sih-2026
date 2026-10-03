"""Compose the demo video from record-demo.mjs output: page and side panel side by side, captions from
marks.json, a title card and an end card. Long idle stretches (the planner waiting) are sped up and
labelled on screen; nothing is cut. Light backgrounds only (DESIGN.md binding UI rules).

    python3 scripts/e2e-v5/compose-demo.py --demo <E2E_OUT dir> --fonts <dir with Anton-Regular.ttf,
        Montserrat.ttf> --facts <json> --out <dir>

--facts holds the numbers printed on the end card, counted from this run's relay log, e.g.
{"cloud_requests": 29, "personal_values": 0, "date": "3 October 2026"}.
Writes dhristi-demo.mp4, dhristi-demo.srt (the on-screen captions on the final timeline) and
timeline.json (scene start times, for writing the voiceover).
"""

import argparse
import json
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

W, H, FPS = 1920, 1080, 25
BG = (244, 247, 251)        # light blue-grey, the deck's panel tint
NAVY = (31, 58, 104)        # text
SLATE = (84, 98, 120)       # secondary text
ORANGE = (200, 90, 20)      # accent text (darkened deck orange, AA on BG)
ORANGE_TINT = (253, 235, 217)
LINE = (201, 211, 224)
PAGE_W, PANEL_W, VID_H = 760, 460, 900
PAGE_X, PANEL_X, VID_Y = 600, 1400, 130
SPEED, IDLE_GAP, KEEP_HEAD, KEEP_TAIL, MIN_CUE = 4, 12.0, 5.0, 3.0, 2.5


def font(fonts, name, size, weight=None):
    f = ImageFont.truetype(str(Path(fonts) / name), size)
    if weight:
        try:
            f.set_variation_by_axes([weight])
        except Exception:
            pass
    return f


def wrap(draw, text, f, width):
    lines, line = [], ""
    for word in text.split():
        trial = f"{line} {word}".strip()
        if draw.textlength(trial, font=f) <= width:
            line = trial
        else:
            lines.append(line)
            line = word
    if line:
        lines.append(line)
    return lines


def background(fonts, path):
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    d.text((60, 44), "DHRISTI", font=font(fonts, "Anton-Regular.ttf", 64), fill=NAVY)
    d.text((62, 128), "Live demo · synthetic test pages", font=font(fonts, "Montserrat.ttf", 24, 600), fill=SLATE)
    label = font(fonts, "Montserrat.ttf", 22, 700)
    d.text((PAGE_X, VID_Y - 36), "WEBSITE (SYNTHETIC)", font=label, fill=SLATE)
    d.text((PANEL_X, VID_Y - 36), "DHRISTI SIDE PANEL", font=label, fill=SLATE)
    for x, w in ((PAGE_X, PAGE_W), (PANEL_X, PANEL_W)):
        d.rectangle((x - 1, VID_Y - 1, x + w, VID_Y + VID_H), outline=LINE, width=1)
    d.text((60, H - 56), "SIH26171 · Team rm -rf /* · Team ID 168225", font=font(fonts, "Montserrat.ttf", 18, 500), fill=SLATE)
    im.save(path)


def caption_card(fonts, scene, text, path):
    im = Image.new("RGBA", (500, 640), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.text((0, 0), scene, font=font(fonts, "Anton-Regular.ttf", 46), fill=ORANGE)
    f = font(fonts, "Montserrat.ttf", 34, 600)
    y = 84
    for line in wrap(d, text, f, 490):
        d.text((0, y), line, font=f, fill=NAVY)
        y += 48
    im.save(path)


def speed_badge(fonts, path):
    f = font(fonts, "Montserrat.ttf", 24, 700)
    text = f"Sped up {SPEED}×: the planner is waiting"
    im = Image.new("RGBA", (500, 60), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((0, 0, 499, 59), radius=30, fill=ORANGE_TINT + (255,), outline=ORANGE + (255,), width=2)
    d.text((26, 14), text, font=f, fill=ORANGE)
    im.save(path)


def card(fonts, lines, path):
    im = Image.new("RGB", (W, H), (255, 255, 255))
    d = ImageDraw.Draw(im)
    y = 300
    for text, name, size, weight, colour, gap in lines:
        f = font(fonts, name, size, weight)
        for line in wrap(d, text, f, 1500):
            d.text(((W - d.textlength(line, font=f)) / 2, y), line, font=f, fill=colour)
            y += int(size * 1.35)
        y += gap
    im.save(path)


def run(cmd):
    subprocess.run(cmd, check=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--demo", required=True)
    ap.add_argument("--fonts", required=True)
    ap.add_argument("--facts", required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    demo, out = Path(a.demo), Path(a.out)
    work = out / "work"
    work.mkdir(parents=True, exist_ok=True)
    m = json.loads((demo / "marks.json").read_text())
    facts = json.loads(Path(a.facts).read_text())

    # Scenes: pairing, then one per task mark.
    titles = ["PAIRING", "PROTECTED RUN", "NAVIGATION", "DESTRUCTIVE STEP"]
    marks = m["marks"]
    cues, scene = [], 0
    for i, mk in enumerate(marks[:-1]):
        if mk["scene"] == "task":
            scene += 1
        cues.append({"start": mk["t"] / 1000, "end": marks[i + 1]["t"] / 1000, "scene": titles[min(scene, 3)],
                     "text": mk["caption"]})
    total = m["durationMs"] / 1000
    # Readability: a cue stays up at least MIN_CUE seconds when the next one has time to spare, and a
    # repeated question says why it came back.
    for prev, c in zip(cues, cues[1:]):
        if prev["end"] - prev["start"] < MIN_CUE and c["end"] - c["start"] > MIN_CUE * 2:
            prev["end"] = c["start"] = prev["start"] + MIN_CUE
        if c["text"] == prev["text"] or c["text"] == prev.get("raw"):
            c["raw"] = c["text"]
            c["text"] = ("The planner tried the delete again, so Dhristi asked again. Skip"
                         if "Destructive" in c["text"] else "The next step changes something too, so Dhristi asks again")

    background(a.fonts, work / "bg.png")
    speed_badge(a.fonts, work / "badge.png")
    for i, c in enumerate(cues):
        caption_card(a.fonts, c["scene"], c["text"], work / f"cap{i}.png")

    # Pass 1: real-time composite with captions.
    inputs = ["-loop", "1", "-framerate", str(FPS), "-i", str(work / "bg.png"),
              "-i", m["pageVideo"], "-i", m["panelVideo"]]
    for i in range(len(cues)):
        inputs += ["-loop", "1", "-framerate", str(FPS), "-i", str(work / f"cap{i}.png")]
    po, no = m["pageOffsetMs"] / 1000, m["panelOffsetMs"] / 1000
    fc = [
        f"[1:v]trim=start={po:.3f}:duration={total:.3f},setpts=PTS-STARTPTS,fps={FPS},crop={PAGE_W}:{VID_H}:0:0[pg]",
        f"[2:v]trim=start={no:.3f}:duration={total:.3f},setpts=PTS-STARTPTS,fps={FPS},crop={PANEL_W}:{VID_H}:0:0[pn]",
        f"[0:v]trim=duration={total:.3f}[bg]",
        f"[bg][pg]overlay={PAGE_X}:{VID_Y}[v0]",
        f"[v0][pn]overlay={PANEL_X}:{VID_Y}[v1]",
    ]
    last = "v1"
    for i, c in enumerate(cues):
        fc.append(f"[{last}][{i + 3}:v]overlay=60:260:enable='between(t,{c['start']:.2f},{c['end']:.2f})'[c{i}]")
        last = f"c{i}"
    run(["ffmpeg", "-v", "error", "-y", *inputs, "-filter_complex", ";".join(fc), "-map", f"[{last}]",
         "-t", f"{total:.3f}", "-r", str(FPS), "-c:v", "libx264", "-crf", "16", "-pix_fmt", "yuv420p", str(work / "realtime.mp4")])

    # Segments: idle stretches between cues run at SPEED, with the badge on screen.
    segs, cursor = [], 0.0
    for c in cues:
        if c["end"] - c["start"] > IDLE_GAP:
            a0, b0 = c["start"] + KEEP_HEAD, c["end"] - KEEP_TAIL
            segs += [(cursor, a0, 1), (a0, b0, SPEED)]
            cursor = b0
    segs.append((cursor, total, 1))

    def out_time(t):
        acc = 0.0
        for s, e, sp in segs:
            if t <= e:
                return acc + (max(t, s) - s) / sp
            acc += (e - s) / sp
        return acc

    # Title and end cards.
    card(a.fonts, [
        ("DHRISTI: Privacy-Preserving Browser Tool", "Anton-Regular.ttf", 84, None, NAVY, 30),
        ("Live demo of the working build", "Montserrat.ttf", 40, 600, ORANGE, 40),
        ("SIH26171 · On-device Visual Perception for Light-weight Browser Agents", "Montserrat.ttf", 30, 500, SLATE, 10),
        ("Team rm -rf /* · Team ID 168225", "Montserrat.ttf", 30, 500, SLATE, 10),
    ], work / "title.png")
    card(a.fonts, [
        ("What this recording shows", "Anton-Regular.ttf", 72, None, NAVY, 30),
        (f"{facts['cloud_requests']} requests reached the cloud planner in this run, and "
         f"{facts['personal_values']} of them carried a personal value from the pages. They carried tokens instead.",
         "Montserrat.ttf", 34, 600, NAVY, 30),
        ("Limits: synthetic test pages only, not real accounts. The 200 ms latency target is not met yet, "
         "and no study with outside users has been run yet.", "Montserrat.ttf", 30, 500, SLATE, 30),
        (f"Recorded {facts['date']}: Chrome extension, local Warden (GLiNER on this computer), "
         "Laya reviewer, Groq planner.", "Montserrat.ttf", 26, 500, SLATE, 0),
    ], work / "end.png")

    parts = []
    for name, dur in (("title", 5), ("end", 10)):
        run(["ffmpeg", "-v", "error", "-y", "-loop", "1", "-framerate", str(FPS), "-i", str(work / f"{name}.png"),
             "-vf", f"fade=in:0:12,fade=out:st={dur - 0.5}:d=0.5", "-t", str(dur), "-r", str(FPS),
             "-c:v", "libx264", "-crf", "16", "-pix_fmt", "yuv420p", str(work / f"{name}.mp4")])
    parts.append(work / "title.mp4")
    for i, (s, e, sp) in enumerate(segs):
        seg = work / f"seg{i}.mp4"
        vf = f"trim=start={s:.3f}:end={e:.3f},setpts=(PTS-STARTPTS)/{sp},fps={FPS}"
        cmd = ["ffmpeg", "-v", "error", "-y", "-i", str(work / "realtime.mp4")]
        if sp != 1:
            cmd += ["-i", str(work / "badge.png"), "-filter_complex", f"[0:v]{vf}[s];[s][1:v]overlay=60:{H - 150}"]
        else:
            cmd += ["-vf", vf]
        run(cmd + ["-r", str(FPS), "-c:v", "libx264", "-crf", "16", "-pix_fmt", "yuv420p", str(seg)])
        parts.append(seg)
    parts.append(work / "end.mp4")
    (work / "parts.txt").write_text("".join(f"file '{p}'\n" for p in parts))
    run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(work / "parts.txt"),
         "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-shortest", "-c:v", "libx264", "-crf", "18",
         "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", str(out / "dhristi-demo.mp4")])

    # Captions and timeline on the final clock (title card first).
    def stamp(t):
        ms = int(round(t * 1000))
        return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}"
    srt, timeline = [], [{"start": 0.0, "scene": "TITLE", "text": "title card"}]
    for i, c in enumerate(cues, start=1):
        s, e = 5 + out_time(c["start"]), 5 + out_time(c["end"])
        srt.append(f"{i}\n{stamp(s)} --> {stamp(e)}\n{c['text']}\n")
        timeline.append({"start": round(s, 1), "end": round(e, 1), "scene": c["scene"], "text": c["text"]})
    end_at = 5 + out_time(total)
    timeline.append({"start": round(end_at, 1), "end": round(end_at + 10, 1), "scene": "END", "text": "end card"})
    (out / "dhristi-demo.srt").write_text("\n".join(srt), encoding="utf-8")
    (out / "timeline.json").write_text(json.dumps({"segments": segs, "timeline": timeline}, indent=2), encoding="utf-8")
    print(f"duration {end_at + 10:.1f}s, segments {segs}")


if __name__ == "__main__":
    main()
