#!/usr/bin/env python3
"""Hash the reviewed Git index inventory, excluding this self-referential manifest."""
from pathlib import Path
import subprocess,json,hashlib,datetime
R=Path(__file__).resolve().parents[1]
output='Docs/delivery-manifest.json'
files=[]
for name in sorted(subprocess.check_output(['git','ls-files','-z'],cwd=R).decode().split('\0')):
 if not name or name==output:continue
 p=R/name
 if not p.is_file():continue
 b=p.read_bytes();files.append({'path':name,'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()})
record={'created_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'status':'ENGINEERING CANDIDATE - NOT SUBMISSION READY','problem':'SIH26171','scope':'Reviewed Git inventory; current file contents. Excludes this manifest, ignored runtime data, dependency installs and generated local builds. Hash presence does not establish validation.','source_commit_before_manifest':subprocess.check_output(['git','rev-parse','HEAD'],cwd=R,text=True).strip(),'historical_manifest':'Docs/history/preparation-delivery-manifest.json','files':files}
(R/output).write_text(json.dumps(record,indent=2)+'\n')
print(f'Hashed {len(files)} files')
