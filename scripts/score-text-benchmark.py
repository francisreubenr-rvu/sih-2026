#!/usr/bin/env python3
"""Independent, frozen annotation scorer for the local WebPII OCR experiment.

This reads browser output after inference. It never sends ground truth to a model.
Metrics describe annotated value recovery and intended redraw text, not privacy proof.
"""
import argparse
import collections
import hashlib
import json
import math
from pathlib import Path
import re
import unicodedata

ROOT = Path(__file__).resolve().parents[1]
ANNOTATIONS = ROOT / 'Raw/datasets/webpii-test100/annotations.json'
ANNOTATIONS_SHA256 = 'c71e4c76a0c2bf51d382792b85a3cea5f5e3b6a24791e1b7bc777fac48b600c3'
PROTOCOL = 'webpii-text-v01'
OVERLAP = 0.5
RETAIN_CONFIDENCE = 70
# This list is the declared utility proxy, not a dataset-wide safe-text taxonomy.
PRODUCT_KEY = re.compile(r'^PRODUCT\d+_(?:NAME|BRAND|PRICE|QUANTITY|NUM_RATINGS|RATING|BREADCRUMB|DESC|SIZE)$')


def finite(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def tokens(value):
    """NFKC/casefold and Unicode alphanumeric runs; no fuzzy OCR correction."""
    if isinstance(value, list):
        value = ' '.join(str(item) for item in value)
    if value is None or isinstance(value, (dict, bool)):
        return []
    return re.findall(r'[^\W_]+', unicodedata.normalize('NFKC', str(value)).casefold())


def rectangle(values, width, height):
    if len(values) != 4 or not all(finite(v) for v in values):
        raise ValueError('Non-finite or nonnumeric geometry')
    x, y, w, h = values
    if w <= 0 or h <= 0:
        return None
    right, bottom = min(width, x + w), min(height, y + h)
    x, y = max(0, x), max(0, y)
    return (x, y, right - x, bottom - y) if right > x and bottom > y else None


def intersection(a, b):
    x, y = max(a[0], b[0]), max(a[1], b[1])
    right, bottom = min(a[0] + a[2], b[0] + b[2]), min(a[1] + a[3], b[1] + b[3])
    return (x, y, right - x, bottom - y) if right > x and bottom > y else None


def union_area(rectangles):
    rects = [r for r in rectangles if r is not None]
    xs = sorted({v for r in rects for v in (r[0], r[0] + r[2])})
    result = 0
    for left, right in zip(xs, xs[1:]):
        spans = sorted((r[1], r[1] + r[3]) for r in rects if r[0] < right and r[0] + r[2] > left)
        end, height = -math.inf, 0
        for top, bottom in spans:
            height += max(0, bottom - max(top, end))
            end = max(end, bottom)
        result += (right - left) * height
    return result


def word_overlap(word, boxes):
    rect = word['_rect']
    return union_area([intersection(rect, box) for box in boxes]) / (rect[2] * rect[3])


def retained(word):
    return not word['sensitive'] and word['confidence'] >= RETAIN_CONFIDENCE


def extract_groups(sample, field, utility=False):
    """Group repeated line boxes for one key/value, not word-vs-entity IoU."""
    grouped, excluded = {}, collections.Counter()
    width, height = sample['image_width'], sample['image_height']
    for annotation in json.loads(sample.get(field, '[]')):
        excluded['source_annotations'] += 1
        if annotation.get('visible') is not True:
            excluded['not_visible'] += 1
            continue
        rect = rectangle([annotation[k] for k in ('bbox_x', 'bbox_y', 'bbox_width', 'bbox_height')], width, height)
        if rect is None:
            excluded['outside_or_empty_bounds'] += 1
            continue
        if annotation.get('element_type') not in ('text', 'input'):
            excluded['non_text'] += 1
            continue
        key = annotation.get('key', '')
        if utility and not PRODUCT_KEY.fullmatch(key):
            excluded['outside_utility_allowlist'] += 1
            continue
        normalized = tokens(annotation.get('value'))
        if not normalized:
            excluded['no_alphanumeric_value'] += 1
            continue
        identity = (key, tuple(normalized))
        group = grouped.setdefault(identity, {'key': key, 'tokens': normalized, 'boxes': [], 'source_annotations': 0, 'element_types': set()})
        group['source_annotations'] += 1
        group['element_types'].add(annotation['element_type'])
        if rect not in group['boxes']:
            group['boxes'].append(rect)
    return list(grouped.values()), excluded


def visible_pii_boxes(sample):
    boxes = []
    for annotation in json.loads(sample['pii_elements_json']):
        if annotation.get('visible') is True:
            rect = rectangle([annotation[k] for k in ('bbox_x', 'bbox_y', 'bbox_width', 'bbox_height')], sample['image_width'], sample['image_height'])
            if rect:
                boxes.append(rect)
    return boxes


def validate_observations(run, samples):
    if not isinstance(run, dict) or not isinstance(run.get('rows'), list):
        raise ValueError('Input must contain a rows array')
    expected = {s['row_index']: s for s in samples}
    if len(expected) != len(samples):
        raise ValueError('Duplicate row in frozen annotations')
    observed = {}
    for row in run['rows']:
        if not isinstance(row, dict) or type(row.get('rowIndex')) is not int or row['rowIndex'] not in expected:
            raise ValueError('Unknown or invalid observed row index')
        index = row['rowIndex']
        if index in observed:
            raise ValueError(f'Duplicate observed row {index}')
        sample = expected[index]
        if row.get('sourceId') != sample['source_id'] or row.get('variant') != sample['variant']:
            raise ValueError(f'Source or variant mismatch at row {index}')
        if type(row.get('ok')) is not bool:
            raise ValueError(f'Nonboolean status at row {index}')
        if row.get('width') != sample['image_width'] or row.get('height') != sample['image_height']:
            raise ValueError(f'Image dimension mismatch at row {index}')
        validated = dict(row)
        validated['words'] = []
        if row['ok']:
            if row.get('imageSha256') != sample.get('image_sha256'):
                raise ValueError(f'Frozen image hash mismatch at row {index}')
            if not isinstance(row.get('words'), list) or len(row['words']) > 3000:
                raise ValueError(f'Invalid word list at row {index}')
            for word in row['words']:
                if not isinstance(word, dict) or not isinstance(word.get('text'), str) or len(word['text']) > 512 or type(word.get('sensitive')) is not bool:
                    raise ValueError(f'Invalid OCR word at row {index}')
                if not finite(word.get('confidence')) or not 0 <= word['confidence'] <= 100:
                    raise ValueError(f'Invalid OCR confidence at row {index}')
                r = word.get('rect', {})
                if not isinstance(r, dict):
                    raise ValueError(f'Invalid OCR rectangle at row {index}')
                rect = rectangle([r.get(k) for k in ('x', 'y', 'width', 'height')], row['width'], row['height'])
                if rect is None or any(r[k] != v for k, v in zip(('x', 'y', 'width', 'height'), rect)):
                    raise ValueError(f'OCR word is empty or outside image at row {index}')
                validated['words'].append({**word, '_rect': rect})
            for key in ('ocrMs', 'nerMs', 'totalMs'):
                if not finite(row.get(key)) or row[key] < 0:
                    raise ValueError(f'Invalid {key} at row {index}')
        elif row.get('words'):
            raise ValueError(f'Failed row {index} must not contain scored words')
        observed[index] = validated
    return observed


def match_group(group, words):
    selected = [w for w in words if word_overlap(w, group['boxes']) >= OVERLAP]
    expected = collections.Counter(group['tokens'])
    def matched(predicate):
        actual = collections.Counter(t for w in selected if predicate(w) for t in tokens(w['text']))
        return sum((expected & actual).values())
    recognized = matched(lambda w: True)
    # Credit withheld tokens only if no retained copy of that token remains.
    kept = matched(retained)
    marked = matched(lambda w: w['sensitive'])
    return {'key': group['key'], 'element_types': sorted(group['element_types']),
            'source_annotations': group['source_annotations'], 'unique_boxes': len(group['boxes']),
            'expected_tokens': sum(expected.values()), 'recognized_tokens': recognized,
            'pii_marked_tokens': marked, 'retained_tokens': kept,
            'withheld_recognized_tokens': recognized - kept,
            'geometrically_associated_ocr_words': len(selected)}


def ratio(n, d):
    return n / d if d else None


def percentile(values, p):
    return sorted(values)[math.ceil(len(values) * p) - 1] if values else None


def score(run, manifest):
    if run.get('dataset') != {'name': manifest.get('dataset'), 'revision': manifest.get('revision')}:
        raise ValueError('Dataset identity or revision mismatch')
    samples = manifest['rows']
    observed = validate_observations(run, samples)
    counts = collections.Counter(attempts=len(samples), executed=0, failed=0, missing=0)
    pii_counts, utility_counts = collections.Counter(), collections.Counter()
    exclusions = {'pii': collections.Counter(), 'utility': collections.Counter()}
    result_rows = []
    for sample in samples:
        index = sample['row_index']
        row = observed.get(index)
        ok = bool(row and row['ok'])
        counts['executed' if ok else 'failed'] += 1
        counts['missing'] += int(row is None)
        words = row['words'] if ok else []
        pii, pii_ex = extract_groups(sample, 'pii_elements_json')
        utility, utility_ex = extract_groups(sample, 'product_elements_json', utility=True)
        all_pii = visible_pii_boxes(sample)
        eligible = []
        for group in utility:
            if any(intersection(a, b) for a in group['boxes'] for b in all_pii):
                utility_ex['groups_excluded_for_pii_overlap'] += 1
            else:
                eligible.append(group)
        exclusions['pii'].update(pii_ex)
        exclusions['utility'].update(utility_ex)
        detail = {'row_index': index, 'source_id': sample['source_id'], 'variant': sample['variant'], 'ok': ok,
                  'pii_groups': [], 'utility_groups': []}
        if not ok:
            detail['error'] = str(row.get('error', 'Recorded failure') if row else 'Missing observation')[:500]
        for groups, target, output in ((pii, pii_counts, detail['pii_groups']), (eligible, utility_counts, detail['utility_groups'])):
            for group in groups:
                matched = match_group(group, words)
                output.append(matched)
                target['groups'] += 1
                target['failed_screen_groups'] += int(not ok)
                for key in ('expected_tokens', 'recognized_tokens', 'pii_marked_tokens', 'retained_tokens', 'withheld_recognized_tokens'):
                    target[key] += matched[key]
                complete = matched['recognized_tokens'] == matched['expected_tokens']
                target['fully_recognized_groups'] += int(complete)
                target['fully_withheld_recognized_groups'] += int(complete and matched['retained_tokens'] == 0)
                target['groups_with_recognized_retained_text'] += int(matched['retained_tokens'] > 0)
        # Geometry-only overlap is independent of exact text matching. It flags possible
        # exposure when OCR is misspelled; it is not asserted to be a true PII leak.
        overlapping = [w for w in words if word_overlap(w, all_pii) >= OVERLAP]
        detail['pii_region_ocr_words'] = len(overlapping)
        detail['pii_region_retained_ocr_words'] = sum(retained(w) for w in overlapping)
        counts['pii_region_ocr_words'] += len(overlapping)
        counts['pii_region_retained_ocr_words'] += detail['pii_region_retained_ocr_words']
        counts['completed_screens_with_possible_geometric_exposure'] += int(detail['pii_region_retained_ocr_words'] > 0)
        counts['completed_screens_with_exact_retained_pii'] += int(any(g['retained_tokens'] for g in detail['pii_groups']))
        counts['ocr_words'] += len(words)
        counts['retained_ocr_words'] += sum(retained(w) for w in words)
        result_rows.append(detail)
    valid = [r for r in observed.values() if r['ok']]
    latency = {k: {'sample_count': len(valid), 'p50': percentile([r[k] for r in valid], .5),
                   'p95': percentile([r[k] for r in valid], .95), 'max': max((r[k] for r in valid), default=None)}
               for k in ('ocrMs', 'nerMs', 'totalMs')}
    return {
        'protocol': PROTOCOL,
        'scope': 'Frozen 100-screen external synthetic slice; annotated-value recovery and intended text redraw diagnostic only',
        'dataset': {'name': manifest.get('dataset'), 'revision': manifest.get('revision'), 'split': manifest.get('split'),
                    'unique_source_ids': len({s['source_id'] for s in samples}),
                    'companies': dict(collections.Counter(s.get('company', 'unknown') for s in samples))},
        'counts': dict(counts), 'pii': {'counts': dict(pii_counts),
            'annotated_value_token_recovery': ratio(pii_counts['recognized_tokens'], pii_counts['expected_tokens']),
            'marked_token_coverage_of_annotated_values': ratio(pii_counts['pii_marked_tokens'], pii_counts['expected_tokens']),
            'marked_fraction_of_recognized_tokens': ratio(pii_counts['pii_marked_tokens'], pii_counts['recognized_tokens']),
            'withheld_recognized_token_coverage_of_annotated_values': ratio(pii_counts['withheld_recognized_tokens'], pii_counts['expected_tokens']),
            'exact_retained_token_lower_bound_fraction': ratio(pii_counts['retained_tokens'], pii_counts['expected_tokens']),
            'fully_recognized_and_withheld_group_fraction': ratio(pii_counts['fully_withheld_recognized_groups'], pii_counts['groups'])},
        'utility': {'scope': 'Allowlisted product text excluding any annotated PII overlap; not task usefulness or universally non-sensitive text',
            'counts': dict(utility_counts),
            'annotated_value_token_recovery': ratio(utility_counts['recognized_tokens'], utility_counts['expected_tokens']),
            'retained_annotated_value_token_fraction': ratio(utility_counts['retained_tokens'], utility_counts['expected_tokens']),
            'retained_fraction_of_recognized_tokens': ratio(utility_counts['retained_tokens'], utility_counts['recognized_tokens']),
            'pii_marked_fraction_of_recognized_product_tokens': ratio(utility_counts['pii_marked_tokens'], utility_counts['recognized_tokens'])},
        'annotated_token_precision_proxy': {
            'value': ratio(pii_counts['pii_marked_tokens'], pii_counts['pii_marked_tokens'] + utility_counts['pii_marked_tokens']),
            'scope': 'Marked exact tokens among selected PII and eligible product annotations only; other predictions are unscored. Not global PII precision.'},
        'annotation_exclusions': {k: dict(v) for k, v in exclusions.items()}, 'successful_screen_latency_ms': latency,
        'limitations': [
            'All frozen rows remain denominators; failed/missing rows receive no recognition or withholding credit and their exposure is unknown.',
            'Expected values may be clipped, truncated, hidden in password fields or not fully painted; annotated-value recovery is not pure OCR recall.',
            'Same key and normalized value across line boxes form one group; repeated separate occurrences with that identity are collapsed, so this is not instance recall.',
            'Token multiset overlap ignores order and punctuation, requires exact normalized tokens, and can miss or coincidentally match partial OCR text.',
            'Each group scores independently; overlapping labels may count the same word more than once. Geometry-only word counts count each word once.',
            'Retained means policy flag false and OCR confidence at least 70; this estimates intended redraw text, not verified canvas pixels or actual outbound leakage.',
            'No retained exact match is not evidence of no PII: OCR errors, unannotated PII, images and partial characters remain outside this exact-match indicator.',
            'Utility allowlist treats product descriptions as contextual text for this experiment only. Order, search and misc fields are not assumed safe.',
            'No original-image preservation, task completion, CPU/energy, general privacy guarantee or official weighted score is calculated.',
            'Ordered sample and repeated variants from one company limit generalization; this suite is a development diagnostic after inspection.'
        ], 'rows': result_rows}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    if args.output.exists():
        parser.error('Output exists; retain old evidence and choose a fresh filename')
    annotation_bytes = ANNOTATIONS.read_bytes()
    if hashlib.sha256(annotation_bytes).hexdigest() != ANNOTATIONS_SHA256:
        parser.error('Frozen annotation hash mismatch')
    manifest = json.loads(annotation_bytes)
    if len(manifest['rows']) != 100:
        parser.error('Expected all 100 frozen annotation rows')
    raw = args.input.read_bytes()
    result = score(json.loads(raw), manifest)
    result['evidence_sha256'] = {'input': hashlib.sha256(raw).hexdigest(), 'annotations': ANNOTATIONS_SHA256,
                               'scorer': hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}
    # Exclusive creation prevents accidental evidence replacement even during a race.
    with args.output.open('x') as out:
        json.dump(result, out, indent=2, allow_nan=False)
        out.write('\n')
    print(json.dumps({k: v for k, v in result.items() if k not in ('rows', 'limitations')}, indent=2))


if __name__ == '__main__':
    main()
