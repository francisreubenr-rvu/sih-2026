#!/usr/bin/env python3
"""Validate evidence references and aggregate manually reviewed gate states.

File existence never creates a pass. A pass requires explicit review plus evidence.
Exit 1 for rejected/unverified release, 2 for malformed configuration.

Options:
  --dry-run          compute and print the ledger; do not overwrite Benchmarks/release-status.json.
                     Also reports whether the committed ledger matches what would be written.
  --max-behind N     treat a pass whose evidence commit is more than N commits behind HEAD as
                     unknown (demotion only; nothing is ever promoted). Off by default.

Freshness: for every pass, the evidence commit is the rule's explicit `evidence_commit` when
present, else the last commit touching any of its required_evidence / evidence_refs paths.
`commits_behind` is how far HEAD has moved since. It is reported for every pass and changes a
status only under --max-behind.

Subjects (added 3 October 2026): a gate may list `subjects`, the code paths its evidence
certifies (e.g. Website/ for G12, warden/ for G06). For those gates freshness also reports
`subject_commits_since_evidence`, the commits since the evidence commit that touched a subject,
and --max-behind demotes on that count instead of commits_behind. A cosmetic commit to an evidence
document no longer makes a pass look fresh, and a code change the evidence never saw makes it stale.

Evidence status: when a required evidence file is JSON with a top-level `status` of pass, fail or
unknown that disagrees with the gate, the conflict is reported (never acted on).
"""
import argparse,json,sys,datetime,csv,subprocess
from pathlib import Path
R=Path(__file__).resolve().parents[1]
LEDGER=R/'Benchmarks/release-status.json'

def git(*args):
 try:
  out=subprocess.run(['git',*args],cwd=R,capture_output=True,text=True,check=True).stdout.strip()
  return out or None
 except (OSError,subprocess.CalledProcessError):
  return None

def freshness(rule,head):
 if head is None:return {'evidence_commit':None,'commits_behind':None,'source':'git unavailable'}
 explicit=rule.get('evidence_commit')
 if explicit:
  commit=git('rev-parse','--verify','--quiet',f'{explicit}^{{commit}}');source='evidence_commit'
 else:
  paths=[p.rstrip('/') for p in rule['required_evidence']+rule.get('evidence_refs',[])]
  commit=git('log','-1','--format=%H','--',*paths) if paths else None;source='last commit touching evidence'
 if commit is None:return {'evidence_commit':explicit,'commits_behind':None,'source':f'{source} (not resolvable)'}
 behind=git('rev-list','--count',f'{commit}..{head}')
 out={'evidence_commit':commit[:12],'commits_behind':int(behind) if behind else 0,'source':source}
 subjects=[p.rstrip('/') for p in rule.get('subjects',[])]
 if subjects:
  touched=git('rev-list','--count',f'{commit}..{head}','--',*subjects)
  out['subject_commits_since_evidence']=int(touched) if touched else 0
 return out

def evidence_status_conflicts(rule):
 out=[]
 for p in rule['required_evidence']:
  f=R/p
  if f.suffix!='.json' or not f.is_file():continue
  try:st=json.loads(f.read_text()).get('status')
  except (OSError,ValueError,AttributeError):continue
  if st in ('pass','fail','unknown') and st!=rule['status']:out.append({'path':p,'evidence_status':st})
 return out

def main():
 ap=argparse.ArgumentParser(description=__doc__.split('\n')[0])
 ap.add_argument('--dry-run',action='store_true')
 ap.add_argument('--max-behind',type=int,default=None)
 opts=ap.parse_args()
 try:
  guards=json.loads((R/'Guardrails/guardrails.json').read_text());bench=json.loads((R/'Benchmarks/definitions.json').read_text())
  rules=guards['rules'];metrics=bench['metrics'];ids=[r['id'] for r in rules]
  assert len(ids)==len(set(ids)), 'duplicate guardrail IDs'
  mids=[m['id'] for m in metrics];assert len(mids)==len(set(mids)), 'duplicate metric IDs'
  csvrows=list(csv.DictReader((R/'Benchmarks/definitions.csv').open()));assert len(csvrows)==len(metrics),'CSV/JSON count mismatch'
  head=git('rev-parse','HEAD')
  results=[];stale=[]
  for rule in rules:
   assert rule['status'] in ['pass','fail','unknown'],'invalid gate status'
   status=rule['status'];missing=[p for p in rule['required_evidence'] if not (R/p).exists()]
   # An explicit pass with missing records fails closed.
   if status=='pass' and missing:status='unknown'
   entry={'id':rule['id'],'name':rule['name'],'status':status,'reason':rule['reason'],'missing_evidence':missing}
   conflicts=evidence_status_conflicts(rule)
   if conflicts:entry['evidence_status_conflicts']=conflicts
   if rule['status']=='pass':
    entry['freshness']=fresh=freshness(rule,head)
    behind=fresh.get('subject_commits_since_evidence',fresh['commits_behind'])
    if opts.max_behind is not None and status=='pass' and (behind is None or behind>opts.max_behind):
     entry['status']='unknown';stale.append(rule['id'])
   results.append(entry)
  overall='fail' if any(x['status']=='fail' for x in results) else ('unknown' if any(x['status']=='unknown' for x in results) else 'pass')
  record={'timestamp':datetime.datetime.now(datetime.timezone.utc).isoformat(),'head_commit':head,'scope':'complete SIH26171 competition entry','status':overall,'submission_ready':overall=='pass','saturation_achieved':False,'counts':{s:sum(x['status']==s for x in results) for s in ['pass','fail','unknown']},'rules':results,'limitations':['This aggregator checks recorded review states and evidence presence; it does not execute or authenticate all tests.','Website-only measurements do not validate the domain prototype.','Freshness counts commits since evidence last changed; it does not prove the evidence still describes HEAD.']}
  summary={k:record[k] for k in ['status','submission_ready','counts']}
  summary['pass_freshness']={x['id']:x['freshness']['commits_behind'] for x in results if 'freshness' in x}
  summary['subject_commits_since_evidence']={x['id']:x['freshness']['subject_commits_since_evidence'] for x in results if 'subject_commits_since_evidence' in x.get('freshness',{})}
  conflicts={x['id']:x['evidence_status_conflicts'] for x in results if x.get('evidence_status_conflicts')}
  if conflicts:summary['evidence_status_conflicts']=conflicts
  if stale:summary['demoted_stale']=stale
  if opts.dry_run:
   try:
    committed=json.loads(LEDGER.read_text())
    key=lambda rec:[(x['id'],x['status']) for x in rec.get('rules',[])]
    summary['committed_ledger_matches']=committed.get('counts')==record['counts'] and key(committed)==key(record)
   except (OSError,ValueError):
    summary['committed_ledger_matches']=False
   summary['written']=False
  else:
   LEDGER.write_text(json.dumps(record,indent=2)+'\n');summary['written']=True
  print(json.dumps(summary,indent=2));return 0 if overall=='pass' else 1
 except (KeyError,ValueError,AssertionError,OSError) as e:
  print('Invalid evaluation configuration:',e,file=sys.stderr);return 2

if __name__=='__main__':sys.exit(main())
