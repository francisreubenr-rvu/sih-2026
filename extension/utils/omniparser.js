import { loopbackHttpUrl } from './loopback.js';

// OmniParser element detection adapter.
//
// detectElements() is the single entry point the agent loop calls after a
// screenshot has been redacted. It calls a local omniparserserver instance
// (microsoft/OmniParser, omnitool/omniparserserver) and returns a normalized
// list of UI elements, or a safe "unavailable" result.
//
// Contract (verified against omnitool/omniparserserver/omniparserserver.py
// and util/utils.py in microsoft/OmniParser):
//   POST /parse/  body {"base64_image": "<raw base64, no data: prefix>"}
//   response      {"som_image_base64", "parsed_content_list", "latency"}
//   each parsed_content_list item:
//     {"type": "text"|"icon", "bbox": [x1,y1,x2,y2] as 0..1 ratios of image
//      size, "interactivity": bool, "content": string|null}
//
// Any hard failure (timeout, network error, HTTP error, unrecognized body)
// returns "unavailable" without throwing, so a dead or misbehaving parser can
// never block the agent loop.

const DEFAULT_ENDPOINT = 'http://localhost:7860';
const TIMEOUT_MS = 3000;
const MAX_DESCRIPTION_LENGTH = 240;

export async function detectElements({ dataUrl, enabled, endpoint, viewport }) {
  if (!enabled) {
    return { available: false, status: 'disabled', elements: [] };
  }
  if (!dataUrl) {
    return { available: false, status: 'unavailable', elements: [] };
  }

  const base = String(endpoint || DEFAULT_ENDPOINT).replace(/\/+$/, '');
  if (!loopbackHttpUrl(base)) {
    return {
      available: false,
      status: 'unavailable',
      error: 'omniparserUrl must be http(s) on 127.0.0.1, localhost, or ::1',
      elements: [],
    };
  }
  const base64Image = stripDataUrlPrefix(dataUrl);
  if (!base64Image) {
    return { available: false, status: 'unavailable', error: 'invalid data URL', elements: [] };
  }

  try {
    const res = await fetch(`${base}/parse/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base64_image: base64Image }),
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    if (!res.ok) {
      return { available: false, status: 'unavailable', error: `HTTP ${res.status}`, elements: [] };
    }
    const payload = await readJson(res);
    if (!payload || !Array.isArray(payload.parsed_content_list)) {
      return { available: false, status: 'unavailable', error: 'unrecognized OmniParser response', elements: [] };
    }
    return { available: true, status: 'ready', elements: normalize(payload.parsed_content_list, viewport) };
  } catch (error) {
    return { available: false, status: 'unavailable', error: describeError(error), elements: [] };
  }
}

// A capture data URL looks like "data:image/png;base64,AAAA...". OmniParser
// wants the raw base64 payload only, no prefix.
function stripDataUrlPrefix(dataUrl) {
  const value = String(dataUrl || '');
  if (!value.startsWith('data:')) return null;
  const comma = value.indexOf(',');
  if (comma === -1) return null;
  return value.slice(comma + 1);
}

async function readJson(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function describeError(error) {
  if (error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
    return 'OmniParser timed out';
  }
  return error && error.message ? error.message : 'OmniParser request failed';
}

// Normalize parsed_content_list items to { bbox, description, interactable }.
// bbox arrives as 0..1 ratios of the source image; convert to CSS px using
// the scan viewport so the result lines up with DOM element coordinates in
// the prompt. Drops items with a non-finite or inverted bbox.
function normalize(items, viewport) {
  const hasViewport =
    viewport &&
    Number.isFinite(viewport.width) &&
    viewport.width > 0 &&
    Number.isFinite(viewport.height) &&
    viewport.height > 0;
  const w = hasViewport ? viewport.width : 1;
  const h = hasViewport ? viewport.height : 1;

  const out = [];
  for (const item of items) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const raw = item.bbox;
    const rx1 = Number(raw?.[0]);
    const ry1 = Number(raw?.[1]);
    const rx2 = Number(raw?.[2]);
    const ry2 = Number(raw?.[3]);
    if (![rx1, ry1, rx2, ry2].every(Number.isFinite)) continue;
    if (rx2 <= rx1 || ry2 <= ry1) continue;
    out.push({
      bbox: hasViewport
        ? [Math.round(rx1 * w), Math.round(ry1 * h), Math.round(rx2 * w), Math.round(ry2 * h)]
        : [rx1, ry1, rx2, ry2],
      description: String(item.content || item.type || 'Detected UI element').slice(0, MAX_DESCRIPTION_LENGTH),
      interactable: item.interactivity === true
    });
  }
  return out;
}
