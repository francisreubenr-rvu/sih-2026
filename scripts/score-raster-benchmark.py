#!/usr/bin/env python3
"""Score preserved browser predictions against frozen WebPII annotations."""
from pathlib import Path
import json,math,collections,hashlib,argparse
R=Path(__file__).resolve().parents[1]
def clip(r,w,h):
 x=max(0,math.floor(r[0]));y=max(0,math.floor(r[1]));right=min(w,math.ceil(r[0]+r[2]));bottom=min(h,math.ceil(r[1]+r[3]));return (x,y,right-x,bottom-y) if right>x and bottom>y else None
def intersection(a,b):
 x=max(a[0],b[0]);y=max(a[1],b[1]);right=min(a[0]+a[2],b[0]+b[2]);bottom=min(a[1]+a[3],b[1]+b[3]);return (x,y,right-x,bottom-y) if right>x and bottom>y else None
def area(r):return r[2]*r[3] if r else 0
def union_area(rects):
 rs=[r for r in rects if r and r[2]>0 and r[3]>0];xs=sorted({x for r in rs for x in [r[0],r[0]+r[2]]});total=0
 for left,right in zip(xs,xs[1:]):
  spans=sorted((r[1],r[1]+r[3]) for r in rs if r[0]<right and r[0]+r[2]>left);length=0;end=-math.inf
  for y,bottom in spans:length+=max(0,bottom-max(y,end));end=max(end,bottom)
  total+=(right-left)*length
 return total
def iou(a,b):
 inter=area(intersection(a,b));return inter/(area(a)+area(b)-inter) if area(a)+area(b)>inter else 0
def match(predictions,truth):
 used=set();tp=0
 for p in sorted(predictions,key=lambda p:p['confidence'],reverse=True):
  rect=(p['x'],p['y'],p['width'],p['height']);candidates=[(iou(rect,g),i) for i,g in enumerate(truth) if i not in used];best=max(candidates,default=(0,-1))
  if best[0]>=.5:used.add(best[1]);tp+=1
 return tp,len(predictions)-tp,len(truth)-tp
def pct(values,p):return sorted(values)[math.ceil(len(values)*p)-1] if values else None
def main():
 parser=argparse.ArgumentParser();parser.add_argument('--run',default='v02');args=parser.parse_args();assert args.run.replace('-','').isalnum();path=R/f'Benchmarks/results/webpii-raster-{args.run}-browser.json';run=json.loads(path.read_text());manifest=json.loads((R/'Raw/datasets/webpii-test100/annotations.json').read_text());byid={r['rowIndex']:r for r in run['rows']};rows=[];counts=collections.Counter();kinds=collections.Counter()
 for sample in manifest['rows']:
  w,h=sample['image_width'],sample['image_height'];truth=[]
  for annotation in json.loads(sample['pii_elements_json']):
   if not annotation.get('visible'):continue
   rect=clip(tuple(annotation[k] for k in ['bbox_x','bbox_y','bbox_width','bbox_height']),w,h)
   if rect:truth.append(rect);kinds[annotation['key']]+=1
  observed=byid.get(sample['row_index']);row={'row_index':sample['row_index'],'source_id':sample['source_id'],'company':sample['company'],'variant':sample['variant'],'ground_truth_pii':len(truth),'ok':bool(observed and observed.get('ok'))};counts['attempts']+=1
  if row['ok']:
   assert observed['scene']['viewport']=={'width':w,'height':h},'Viewport/annotation mismatch invalidates coverage measurement'
   tp,fp,fn=match(observed['predictions'],truth);row.update(tp=tp,fp=fp,fn=fn,predictions=len(observed['predictions']));counts.update(tp=tp,fp=fp,fn=fn,executed=1)
   masks=[clip(tuple(r['rect'][k] for k in ['x','y','width','height']),w,h) for r in observed['scene']['regions']];masks=[m for m in masks if m];gt_area=union_area(truth);mask_area=union_area(masks);covered=union_area([intersection(a,b) for a in masks for b in truth]);outside=w*h-gt_area;outside_preserved=outside-(mask_area-covered)
   row.update(pii_pixel_area=gt_area,covered_pii_pixels=covered,masked_pixels=mask_area,total_pixels=w*h,outside_pii_pixels=outside,outside_pii_preserved_pixels=outside_preserved,exported_controls=len(observed['scene']['controls']))
   counts.update(pii_pixels=gt_area,covered_pii_pixels=covered,total_pixels=w*h,masked_pixels=mask_area,outside_pii_pixels=outside,outside_pii_preserved_pixels=outside_preserved,exported_controls=row['exported_controls'])
  else:row['error']=observed.get('error') if observed else 'Missing observation';counts.update(failed=1,fn=len(truth))
  rows.append(row)
 valid=[r for r in run['rows'] if r.get('ok')];latencies={key:{'sample_count':len(valid),'p50':pct([r[key] for r in valid],.5),'p95':pct([r[key] for r in valid],.95),'max':max((r[key] for r in valid),default=None)} for key in ['detectMs','inferenceMs','collectMs']}
 ratio=lambda a,b:a/b if b else None
 result={'scope':'100 external synthetic test screens through raster-only adapter; cross-taxonomy spatial diagnostic, not general PII classification or task utility','dataset':run['dataset'],'sample_count':len(rows),'unique_source_ids':len({s['source_id'] for s in manifest['rows']}),'companies':dict(collections.Counter(s['company'] for s in manifest['rows'])),'annotation_keys':dict(kinds),'counts':dict(counts),'localization':{'precision':ratio(counts['tp'],counts['tp']+counts['fp']),'recall':ratio(counts['tp'],counts['tp']+counts['fn']),'iou_threshold':.5,'confidence_threshold':.7,'class_matching':'ignored; diagnostic only'},'reconstruction':{'pii_pixel_coverage':ratio(counts['covered_pii_pixels'],counts['pii_pixels']),'outside_selected_pii_pixel_preservation':ratio(counts['outside_pii_preserved_pixels'],counts['outside_pii_pixels']),'masked_image_fraction':ratio(counts['masked_pixels'],counts['total_pixels'])},'resources':{'detectorCreationMs':run.get('detectorCreationMs'),'warmups':len(run['warmups']),'latency_ms':latencies,'heap_start':run.get('heapStart'),'heap_peak_measured':max((r['heap']['usedJSHeapSize'] for r in valid if r.get('heap')),default=None),'heap_after_dispose':run.get('heapAfterDispose'),'long_task_count':len(run.get('longTasks',[])),'long_task_duration_ms':sum(t['duration'] for t in run.get('longTasks',[])),'model_transfer_entries':run.get('resources')},'evidence_sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'limitations':run['limitations']+['Only pii_elements_json scored; outside these boxes is not guaranteed nonsensitive','Repeated variants and ordered selection limit population inference','Full-image exclusion may protect privacy while removing all visual utility','No annotated task controls in this dataset; cannot compute control precision/recall','Resource profile includes harness, images and retained results; not pure production memory','No full-flow latency or official weighted score computed'],'rows':rows}
 out=R/f'Benchmarks/results/webpii-raster-{args.run}-summary.json';out.write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({k:v for k,v in result.items() if k not in ['rows','annotation_keys','resources','limitations']},indent=2));print(json.dumps(latencies,indent=2))
if __name__=='__main__':main()
