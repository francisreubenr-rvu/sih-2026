/**
 * Local-only selective redaction.
 * Pixelates sensitive regions while preserving surrounding layout pixels for
 * human review. Output must never enter API payloads — egress stays semantic
 * (makeScene / requestSchema). A detector miss must not authorize raw upload.
 */

const SENSITIVE_KINDS = new Set(['face', 'private', 'field', 'password', 'media']);

export function isSensitiveKind(kind) {
  return SENSITIVE_KINDS.has(kind);
}

/** Clamp and floor a region against image bounds. Returns null if empty. */
export function clipRegion(rect, width, height, padding = 0) {
  if (![rect?.x, rect?.y, rect?.width, rect?.height, width, height, padding].every(Number.isFinite)) return null;
  if (rect.width <= 0 || rect.height <= 0 || width < 1 || height < 1 || padding < 0) return null;
  const x = Math.max(0, Math.floor(rect.x - padding));
  const y = Math.max(0, Math.floor(rect.y - padding));
  const right = Math.min(width, Math.ceil(rect.x + rect.width + padding));
  const bottom = Math.min(height, Math.ceil(rect.y + rect.height + padding));
  return right > x && bottom > y ? { x, y, width: right - x, height: bottom - y } : null;
}

/**
 * Pixelate one axis-aligned region in-place on RGBA ImageData-like buffers.
 * blockSize controls mosaic coarseness (higher = stronger obfuscation).
 */
export function pixelateRegion(data, width, height, rect, blockSize = 12) {
  if (!(data instanceof Uint8ClampedArray || data instanceof Uint8Array)) throw new Error('Invalid image buffer');
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) throw new Error('Invalid image shape');
  if (data.length !== width * height * 4) throw new Error('Invalid image shape');
  if (!Number.isInteger(blockSize) || blockSize < 2 || blockSize > 64) throw new Error('Invalid block size');
  const region = clipRegion(rect, width, height);
  if (!region) return 0;
  let covered = 0;
  for (let by = region.y; by < region.y + region.height; by += blockSize) {
    for (let bx = region.x; bx < region.x + region.width; bx += blockSize) {
      const bw = Math.min(blockSize, region.x + region.width - bx);
      const bh = Math.min(blockSize, region.y + region.height - by);
      // Subsample average for large blocks (stride 2) — faster local preview, same mosaic intent.
      const stride = (bw >= 8 && bh >= 8) ? 2 : 1;
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let y = by; y < by + bh; y += stride) {
        for (let x = bx; x < bx + bw; x += stride) {
          const i = (y * width + x) * 4;
          r += data[i]; g += data[i + 1]; b += data[i + 2]; a += data[i + 3]; n++;
        }
      }
      if (!n) continue;
      r = (r / n) | 0; g = (g / n) | 0; b = (b / n) | 0; a = (a / n) | 0;
      for (let y = by; y < by + bh; y++) {
        const row = y * width;
        for (let x = bx; x < bx + bw; x++) {
          const i = (row + x) * 4;
          data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = a;
          covered++;
        }
      }
    }
  }
  return covered;
}

/**
 * Copy source RGBA, pixelate each sensitive region, return a new buffer.
 * Non-sensitive pixels are byte-identical to the source.
 */
export function redactSelective(source, width, height, regions, { blockSize = 12, kinds = SENSITIVE_KINDS, padding = 2 } = {}) {
  if (!(source instanceof Uint8ClampedArray || source instanceof Uint8Array)) throw new Error('Invalid image buffer');
  if (source.length !== width * height * 4) throw new Error('Invalid image shape');
  if (!Array.isArray(regions) || regions.length > 2000) throw new Error('Invalid regions');
  const out = new Uint8ClampedArray(source);
  const applied = [];
  for (const region of regions) {
    if (!kinds.has(region.kind)) continue;
    const clipped = clipRegion(region.rect, width, height, padding);
    if (!clipped) continue;
    const pixels = pixelateRegion(out, width, height, clipped, blockSize);
    if (pixels > 0) applied.push({ kind: region.kind, rect: clipped, pixels });
  }
  return { data: out, width, height, applied, mode: 'selective-pixelate', localOnly: true };
}

/**
 * Paint selective redaction onto a canvas context when a bitmap/ImageData source
 * is available. Falls back to opaque wireframe paint via paintFallback when not.
 * Never returns image bytes for network use.
 */
export function paintSelectivePreview(ctx, source, scene, { blockSize = 12, paintFallback } = {}) {
  if (!ctx?.canvas) throw new Error('Canvas context required');
  const width = scene?.viewport?.width;
  const height = scene?.viewport?.height;
  if (!Number.isInteger(width) || !Number.isInteger(height)) throw new Error('Invalid scene viewport');
  ctx.canvas.width = width;
  ctx.canvas.height = height;
  if (!source) {
    if (typeof paintFallback !== 'function') throw new Error('No source and no wireframe fallback');
    paintFallback(ctx, scene);
    return { mode: 'wireframe-fallback', localOnly: true, preservedRatio: null };
  }
  let imageData;
  if (typeof ImageData !== 'undefined' && source instanceof ImageData) {
    if (source.width !== width || source.height !== height) throw new Error('Source dimensions must match viewport');
    imageData = source;
  } else if (source.data && source.width === width && source.height === height) {
    imageData = { data: source.data, width, height };
  } else {
    throw new Error('Unsupported selective preview source');
  }
  const start = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const result = redactSelective(imageData.data, width, height, scene.regions || [], { blockSize });
  const elapsedMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - start;
  if (typeof ImageData !== 'undefined' && ctx.putImageData) {
    ctx.putImageData(new ImageData(result.data, width, height), 0, 0);
  } else if (ctx.putImageData && typeof createImageData === 'function') {
    const frame = createImageData(width, height);
    frame.data.set(result.data);
    ctx.putImageData(frame, 0, 0);
  } else {
    // Node/test path without canvas ImageData: leave buffer in result only.
  }
  // Draw approved control outlines on top so the review surface stays actionable.
  ctx.save();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#0b1f3a';
  ctx.fillStyle = 'rgba(11, 31, 58, 0.08)';
  ctx.font = '12px system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  for (const c of scene.controls || []) {
    const r = c.rect;
    ctx.fillRect(r.x, r.y, r.width, r.height);
    ctx.strokeRect(r.x + 0.5, r.y + 0.5, Math.max(0, r.width - 1), Math.max(0, r.height - 1));
    ctx.fillStyle = '#0b1f3a';
    ctx.fillText(`${c.id} ${c.label}`, r.x + 6, r.y + r.height / 2);
    ctx.fillStyle = 'rgba(11, 31, 58, 0.08)';
  }
  ctx.restore();
  const total = width * height;
  const redacted = result.applied.reduce((n, a) => n + a.pixels, 0);
  return {
    mode: 'selective-pixelate',
    localOnly: true,
    elapsedMs,
    redactedPixels: redacted,
    preservedRatio: total ? (total - redacted) / total : null,
    regionsApplied: result.applied.length,
  };
}

/**
 * Rubric-oriented redaction scores against labeled boxes.
 * coverage = fraction of ground-truth PII pixels that fall inside any redacted region.
 * preservation = fraction of non-PII pixels that remain unredacted.
 * Both reported separately; never blended into a single vanity score.
 */
export function scoreRedactionPrecision({ width, height, groundTruthPii, redactedRegions, iouThreshold = 0.5 }) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) throw new Error('Invalid image shape');
  if (!Array.isArray(groundTruthPii) || !Array.isArray(redactedRegions)) throw new Error('Invalid score inputs');
  const piiMask = new Uint8Array(width * height);
  const redactedMask = new Uint8Array(width * height);
  const paint = (mask, rect) => {
    const r = clipRegion(rect, width, height);
    if (!r) return;
    for (let y = r.y; y < r.y + r.height; y++) {
      for (let x = r.x; x < r.x + r.width; x++) mask[y * width + x] = 1;
    }
  };
  for (const box of groundTruthPii) paint(piiMask, box.rect || box);
  for (const box of redactedRegions) paint(redactedMask, box.rect || box);
  let pii = 0, piiCovered = 0, nonPii = 0, nonPiiPreserved = 0;
  for (let i = 0; i < piiMask.length; i++) {
    if (piiMask[i]) {
      pii++;
      if (redactedMask[i]) piiCovered++;
    } else {
      nonPii++;
      if (!redactedMask[i]) nonPiiPreserved++;
    }
  }
  // Instance-level IoU matching for detection-style P/R (separate from pixel coverage).
  const matched = new Set();
  let tp = 0;
  for (const pred of redactedRegions) {
    let best = 0, bestIdx = -1;
    for (let i = 0; i < groundTruthPii.length; i++) {
      if (matched.has(i)) continue;
      const score = boxIou(pred.rect || pred, groundTruthPii[i].rect || groundTruthPii[i]);
      if (score > best) { best = score; bestIdx = i; }
    }
    if (best >= iouThreshold && bestIdx >= 0) { tp++; matched.add(bestIdx); }
  }
  const fp = redactedRegions.length - tp;
  const fn = groundTruthPii.length - tp;
  return {
    piiPixelCoverage: pii ? piiCovered / pii : null,
    nonPiiPreservation: nonPii ? nonPiiPreserved / nonPii : null,
    piiPixels: pii,
    piiCoveredPixels: piiCovered,
    nonPiiPixels: nonPii,
    nonPiiPreservedPixels: nonPiiPreserved,
    instancePrecision: tp + fp ? tp / (tp + fp) : null,
    instanceRecall: tp + fn ? tp / (tp + fn) : null,
    truePositives: tp,
    falsePositives: fp,
    falseNegatives: fn,
    status: 'unit_fixture_only',
  };
}

function boxIou(a, b) {
  const ax2 = a.x + a.width, ay2 = a.y + a.height;
  const bx2 = b.x + b.width, by2 = b.y + b.height;
  const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y);
  const right = Math.min(ax2, bx2), bottom = Math.min(ay2, by2);
  const inter = Math.max(0, right - x) * Math.max(0, bottom - y);
  const union = a.width * a.height + b.width * b.height - inter;
  return union > 0 ? inter / union : 0;
}
