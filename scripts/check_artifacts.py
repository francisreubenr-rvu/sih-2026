#!/usr/bin/env python3
"""Structural integrity checks; does not claim product correctness or slide visual quality."""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit,unquote
import json,zipfile,xml.etree.ElementTree as ET,re,urllib.request
R=Path(__file__).resolve().parents[1];checks=[]
def check(ok,label):
 checks.append({'name':label,'pass':bool(ok)})
 if not ok:raise AssertionError(label)
for f in R.rglob('*.json'):
 if '.git' not in f.parts:json.loads(f.read_text())
check(True,'All JSON parses')
for name,count in [('submission-blueprint',6),('expanded-pitch-blueprint',15)]:
 with zipfile.ZipFile(R/'Docs'/f'{name}.pptx') as z:
  slides=[n for n in z.namelist() if re.fullmatch(r'ppt/slides/slide\d+\.xml',n)]
  check(len(slides)==count,f'{name}: {count} slides')
  for n in slides:
   words=' '.join(t.text or '' for t in ET.fromstring(z.read(n)).iter('{http://schemas.openxmlformats.org/drawingml/2006/main}t'))
   check('NOT SUBMISSION READY' in words,f'{name}/{n}: visible notice')
  if count==15:check(len([n for n in z.namelist() if re.fullmatch(r'ppt/notesSlides/notesSlide\d+\.xml',n)])==15,'All expanded slides have notes')
 check((R/'Docs'/f'{name}.pdf').read_bytes().startswith(b'%PDF'),f'{name}: PDF signature')
for name in ['process-documentation','preparation-brief']:check((R/'Docs'/f'{name}.pdf').read_bytes().startswith(b'%PDF'),f'{name}: PDF signature')
class Links(HTMLParser):
 def __init__(self):super().__init__();self.paths=[];self.ids=set();self.h1=0
 def handle_starttag(self,tag,attrs):
  a=dict(attrs)
  if 'id' in a:self.ids.add(a['id'])
  if tag=='h1':self.h1+=1
  for key in ['href','src']:
   if key in a:self.paths.append(a[key])
p=Links();p.feed((R/'Website/index.html').read_text());check(p.h1==1,'Website has one h1')
for link in p.paths:
 u=urlsplit(link)
 if u.scheme:continue
 if u.path:check((R/'Website'/unquote(u.path)).is_file(),'Local resource exists: '+u.path)
 if u.fragment:check(u.fragment in p.ids,'Anchor exists: '+u.fragment)
for path in ['/','/app.js','/style.css','/downloads/preparation-brief.pdf','/downloads/guardrails.json']:
 with urllib.request.urlopen('http://127.0.0.1:4173'+path,timeout=10) as response:check(response.status==200,'HTTP 200 '+path)
(R/'Benchmarks/results/artifact-checks.json').write_text(json.dumps({'scope':'structural integrity only','checks':checks,'passed':len(checks)},indent=2)+'\n')
print(f'{len(checks)} structural checks passed. Domain implementation not tested.')
