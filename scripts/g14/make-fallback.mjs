// Turns one G14 rehearsal run into the labelled fallback recording: the fixture page and the side
// panel side by side, a label bar naming the build and date, and a caption for each journey step,
// timed from the run's own event log. Also writes the captions as WebVTT.
//
//   node scripts/g14/make-fallback.mjs <run dir> <out.webm>
//
// Needs ffmpeg with libvpx-vp9 and the DejaVu Sans font.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const [dir, out] = process.argv.slice(2);
if (!dir || !out) throw new Error('usage: make-fallback.mjs <run dir> <out.webm>');
const row = JSON.parse(readFileSync(`${dir}/row.json`, 'utf8'));
if (row.result !== 'success') throw new Error(`run ${row.index} was not a success; record a successful run`);
const FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
const t0 = row.video_offsets_s.page;          // page recording starts here on the run clock
const lag = row.video_offsets_s.panel - t0;   // the panel recording starts this much later

const dur = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', `${dir}/page.webm`], { encoding: 'utf8' }));
const HOLD_START = 3; // seconds the first frame is held, before the journey plays in real time
const HOLD_END = 6;   // seconds the last frame is held
const say = (e) => (e.step === 'confirm'
  ? (/state-changing/.test(e.text) ? 'The Warden asked before a state-changing step; answered: run this step' : `Confirmation answered: ${e.text.replace(/^Confirmation answered: /, '').slice(0, 70)}`)
  : `Step ${e.step}: ${e.text}`);
// One caption at a time: events less than 0.4 s apart share a line; each line runs until the next.
const caps = [{ t: 0, text: 'Reset: fresh Warden, recording relay, extension copy and browser profile' }];
for (const e of row.events.filter((x) => x.step !== 'reset')) {
  const t = HOLD_START + Math.max(0, e.t - t0);
  const last = caps[caps.length - 1];
  if (t - last.t < 0.4 && last.t > 0) last.text += `  |  ${say(e)}`; else caps.push({ t, text: say(e) });
}
const total = HOLD_START + dur + HOLD_END;
caps.forEach((c, i) => { c.end = i + 1 < caps.length ? caps[i + 1].t : total; });

const esc = (s) => s.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, '\u2019').replace(/%/g, '\\%').replace(/,/g, '\\,');
const label = `Recorded fallback. Dhristi v5, build ${row.build_sha.slice(0, 7)}, recorded ${row.date_utc.slice(0, 10)}. Synthetic page; real Groq planner; journey in real time, first and last frames held.`;
const draw = [
  `drawbox=x=0:y=0:w=iw:h=40:color=white@1:t=fill`,
  `drawtext=fontfile=${FONT}:text='${esc(label)}':x=12:y=12:fontsize=15:fontcolor=0x1a1a1a`,
  `drawbox=x=0:y=ih-64:w=iw:h=64:color=white@1:t=fill`,
  // a merged caption takes two lines, one per event
  ...caps.flatMap((c) => c.text.split('  |  ').slice(0, 2).map((line, k, all) => `drawtext=fontfile=${FONT}:text='${esc(line.slice(0, 120))}':x=12:y=h-${all.length === 2 ? 54 - 26 * k : 42}:fontsize=17:fontcolor=0x1a1a1a:enable='between(t,${c.t.toFixed(2)},${c.end.toFixed(2)})'`)),
].join(',');

// panel video: line up its slightly later start by repeating its first frame
const filter = [
  `[1:v]tpad=start_duration=${lag.toFixed(3)}:start_mode=clone[p]`,
  `[0:v][p]hstack=inputs=2,pad=iw:ih+104:0:40:white[s]`,
  `[s]tpad=start_duration=${HOLD_START}:start_mode=clone:stop_duration=${HOLD_END}:stop_mode=clone,${draw}[v]`,
].join(';');
execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', `${dir}/page.webm`, '-i', `${dir}/panel.webm`, '-filter_complex', filter, '-map', '[v]',
  '-t', total.toFixed(2), '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '36', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '4', out], { stdio: 'inherit' });

const ts = (s) => new Date(s * 1000).toISOString().slice(11, 23);
writeFileSync(out.replace(/\.webm$/, '.vtt'), `WEBVTT\n\nNOTE ${label}\n\n` + caps.map((c, i) => `${i + 1}\n${ts(c.t)} --> ${ts(c.end)}\n${c.text}\n`).join('\n'));
console.log(`wrote ${out} (${total.toFixed(1)} s; journey ${dur.toFixed(1)} s in real time) and its .vtt with ${caps.length} captions`);
