# Dhristi — pixel UI design direction

Distilled from the 25-pin **Dhristi Pixel Refs** board.

1. **Use an 8px base rhythm.** Build popup padding, card gaps, and icon hit areas from 8px multiples; allow 4px for micro-label spacing.
2. **Keep the canvas navy/paper.** Default tokens: `--ink: #101827`, `--navy: #162b46`, `--paper: #f3ead8`, `--mist: #c7d5d2`.
3. **Reserve saffron and green for meaning.** `--saffron: #d88732` is attention/action; `--trust: #5c8b63` is verified/healthy. Never use them as ambient neon decoration.
4. **Prefer 1–2px keylines.** Use dark pixel keylines around paper cards and controls; avoid soft shadows except a single offset 2px shadow on primary surfaces.
5. **Make corners stepped, not bubbly.** Use small 2–4px radii or chamfered pixel corners; avoid large SaaS pills except for compact trust chips.
6. **Adopt a tiny bitmap accent font only.** Keep body copy in a highly readable sans; use bitmap/monospace for IDs, timestamps, permission scopes, and telemetry values.
7. **Design icons as 16px silhouettes.** Use crisp 1-color icons with a consistent 16px grid, plus a 2-tone selected state. Avoid detailed illustrations in controls.
8. **Treat trust as a visible chip.** Pair a small shield/check glyph with labels such as `VERIFIED`, `LOCAL`, or `NO DATA SHARED`; show the reason on hover/focus, not only color.
9. **Use dashboard modules, not decoration.** Group scan result, origin, permission, and last-check time into bordered panels with explicit headings and a short action row.
10. **Make the extension popup feel like a calm instrument panel.** Target a narrow 360–420px width, fixed header, one primary action, and a clear “details/history” secondary route.
11. **Use pixel texture at low opacity.** Grid/noise/wave patterns may sit behind empty or loading states at ~6–10% contrast; never interfere with text contrast.
12. **Motion should be discrete.** Use 1–2 frame state changes, stepped progress, and instant focus outlines; no glowing loops or gradient morphs.

## Suggested component vocabulary

- Header: paper surface, navy title, tiny saffron location/status marker.
- Trust chip: green keyline + shield/check, text label, optional “why” affordance.
- Permission row: 16px icon, origin/domain, scope label, right-aligned state.
- Scan card: navy field with paper body, 3–5 metric cells, explicit timestamp.
- Primary CTA: saffron fill, navy text, 2px dark keyline, pressed state offset by 2px.
- Empty/loading state: low-contrast blue pixel texture with one calm explanatory sentence.
