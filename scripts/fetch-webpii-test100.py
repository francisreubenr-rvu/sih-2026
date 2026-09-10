#!/usr/bin/env python3
from pathlib import Path
import urllib.request,json,hashlib,datetime,concurrent.futures
R=Path(__file__).resolve().parents[1];raw=R/'Raw/datasets/webpii-test100';assets=R/'Prototype/app/bench-assets/webpii-test100';assets.mkdir(parents=True,exist_ok=True)
def get(url):
 with urllib.request.urlopen(url,timeout=90) as r:return r.read()
existing=assets/'manifest.json'
if existing.exists():
 frozen=json.loads(existing.read_text())
 for row in frozen['rows']:
  p=R/'Prototype'/row['file'].lstrip('/')
  assert hashlib.sha256(p.read_bytes()).hexdigest()==row['image_sha256'],f'Frozen asset mismatch: {p.name}'
 print('Frozen dataset already present and verified; no network request made.')
 raise SystemExit(0)
api=json.loads(get('https://huggingface.co/api/datasets/WebPII/webpii'))
revision=api['sha'];records=[]
for offset in [0,1000,2000,3000,4381]:
 url=f'https://datasets-server.huggingface.co/rows?dataset=WebPII%2Fwebpii&config=default&split=test&offset={offset}&length=20'
 response=json.loads(get(url));assert len(response['rows'])==20
 assert all('/'+revision+'/' in item['row']['image']['src'] for item in response['rows']), 'Viewer revision differs from repository snapshot'
 records.extend(response['rows'])
# Asset delivery URLs are ephemeral signed public URLs; store stable dataset coordinates instead.
def fetch_row(item):
 row=item['row'];index=item['row_idx'];filename=f'{index:04d}.png';target=assets/filename
 data=target.read_bytes() if target.exists() else get(row['image']['src']);target.write_bytes(data)
 metadata={k:v for k,v in row.items() if k!='image'}
 metadata.update(row_index=index,file='/app/bench-assets/webpii-test100/'+filename,image_bytes=len(data),image_sha256=hashlib.sha256(data).hexdigest())
 return metadata
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
 for record in pool.map(fetch_row,records):print('Downloaded',record['row_index'],flush=True)
# map consumed above: recover metadata deterministically without downloading again.
rows=[]
for item in records:
 row=item['row'];index=item['row_idx'];p=assets/f'{index:04d}.png';b=p.read_bytes();metadata={k:v for k,v in row.items() if k!='image'};metadata.update(row_index=index,file='/app/bench-assets/webpii-test100/'+p.name,image_bytes=len(b),image_sha256=hashlib.sha256(b).hexdigest());rows.append(metadata)
manifest={'dataset':'WebPII/webpii','revision':revision,'retrieved_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'split':'test','offsets':[0,1000,2000,3000,4381],'count_per_offset':20,'row_count':len(rows),'scope':'deterministic raster-only diagnostic; not random sample or full benchmark','source':'https://huggingface.co/datasets/WebPII/webpii','license':'Apache-2.0 root dataset card','transformation':'Signed temporary image URLs omitted; decoded API metadata and original downloaded image bytes retained','rows':rows}
(raw/'annotations.json').write_text(json.dumps(manifest,indent=2)+'\n');(assets/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
for source,dest in [('README.md','dataset-card.md'),('sample/README.md','sample-card-context.md')]:
 (raw/dest).write_bytes(get(f'https://huggingface.co/datasets/WebPII/webpii/raw/{revision}/{source}'))
print('Complete',len(rows),'rows',sum(r['image_bytes'] for r in rows),'bytes',revision,flush=True)
