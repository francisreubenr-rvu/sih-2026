#!/usr/bin/env python3
"""Validate evidence references and aggregate manually reviewed gate states.

File existence never creates a pass. A pass requires explicit review plus evidence.
Exit 1 for rejected/unverified release, 2 for malformed configuration.
"""
import json,sys,datetime,csv
from pathlib import Path
R=Path(__file__).resolve().parents[1]
try:
 guards=json.loads((R/'Guardrails/guardrails.json').read_text());bench=json.loads((R/'Benchmarks/definitions.json').read_text())
 rules=guards['rules'];metrics=bench['metrics'];ids=[r['id'] for r in rules]
 assert len(ids)==len(set(ids)), 'duplicate guardrail IDs'
 mids=[m['id'] for m in metrics];assert len(mids)==len(set(mids)), 'duplicate metric IDs'
 csvrows=list(csv.DictReader((R/'Benchmarks/definitions.csv').open()));assert len(csvrows)==len(metrics),'CSV/JSON count mismatch'
 results=[]
 for rule in rules:
  assert rule['status'] in ['pass','fail','unknown'],'invalid gate status'
  status=rule['status'];missing=[p for p in rule['required_evidence'] if not (R/p).exists()]
  # An explicit pass with missing records fails closed.
  if status=='pass' and missing:status='unknown'
  results.append({'id':rule['id'],'name':rule['name'],'status':status,'reason':rule['reason'],'missing_evidence':missing})
 overall='fail' if any(x['status']=='fail' for x in results) else ('unknown' if any(x['status']=='unknown' for x in results) else 'pass')
 record={'timestamp':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'complete SIH26171 competition entry','status':overall,'submission_ready':overall=='pass','saturation_achieved':False,'counts':{s:sum(x['status']==s for x in results) for s in ['pass','fail','unknown']},'rules':results,'limitations':['This aggregator checks recorded review states and evidence presence; it does not execute or authenticate all tests.','Website-only measurements do not validate the domain prototype.']}
 (R/'Benchmarks/release-status.json').write_text(json.dumps(record,indent=2)+'\n');print(json.dumps({k:record[k] for k in ['status','submission_ready','counts']},indent=2));sys.exit(0 if overall=='pass' else 1)
except (KeyError,ValueError,AssertionError,OSError) as e:
 print('Invalid evaluation configuration:',e,file=sys.stderr);sys.exit(2)
