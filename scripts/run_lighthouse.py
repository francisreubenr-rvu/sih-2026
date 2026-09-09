#!/usr/bin/env python3
"""Run all six requested measurements on the static local site, preserving each report."""
from pathlib import Path
import subprocess,json,statistics,datetime,hashlib,platform
R=Path(__file__).resolve().parents[1];out=R/'Benchmarks/results/lighthouse';out.mkdir(parents=True,exist_ok=True)
checks=[]
for profile in ['mobile','desktop']:
 for run in range(1,4):
  name=out/f'{profile}-{run}'
  cmd=['npm','exec','--yes','--package=lighthouse@12.8.2','--','lighthouse','http://127.0.0.1:4173','--quiet','--chrome-flags=--headless','--output=json','--output=html',f'--output-path={name}']
  if profile=='desktop':cmd+=['--preset=desktop']
  subprocess.run(cmd,check=True,cwd=R)
  d=json.loads(Path(str(name)+'.report.json').read_text());scores={k:v['score']*100 for k,v in d['categories'].items()}
  checks.append({'profile':profile,'run':run,'scores':scores,'report':str(Path(str(name)+'.report.json').relative_to(R)),'fetchTime':d['fetchTime'],'userAgent':d['userAgent'],'environment':d['environment']})
  print(profile,run,scores,flush=True)
medians={p:{k:statistics.median(x['scores'][k] for x in checks if x['profile']==p) for k in ['performance','accessibility','best-practices','seo']} for p in ['mobile','desktop']}
fingerprint=hashlib.sha256(b''.join(x.read_bytes() for x in sorted((R/'Website').rglob('*')) if x.is_file() and 'downloads' not in x.parts and x.suffix in ['.html','.css','.js','.svg'])).hexdigest()
record={'metric_id':'B09','scope':'local preparation website only','timestamp':datetime.datetime.now(datetime.timezone.utc).isoformat(),'instrument_version':'Lighthouse 12.8.2','build_or_commit':fingerprint,'environment':{'os':platform.platform(),'url':'http://127.0.0.1:4173','server':'Python static HTTP; loopback','browser':'Chrome launched by Lighthouse in clean temporary profile'},'sample_count':6,'computed_value':medians,'status':'pass' if all(v>90 for p in medians.values() for v in p.values()) else 'fail','runs':checks,'limitations':['Not public deployment evidence','Not domain prototype performance','Automated accessibility is not WCAG conformance','Human evaluation and saturation not established']}
(R/'Benchmarks/results/lighthouse-summary.json').write_text(json.dumps(record,indent=2)+'\n');print('Medians',medians,flush=True)
