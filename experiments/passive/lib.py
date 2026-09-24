import json,collections,glob,os
# Shared loaders for the Microsoft and Red Hat passive experiments.
G='.style-lab-guides'
REVIEWERS=['codex','antigravity','claude']
LAB=os.environ.get('LABELS','')  # 'rubric' reads the rubric relabel under {g}/rubric/ in place of the rule-only labels
BASES={'k8s':'.style-lab-k8s-passive-lab','set1':'.style-lab-voice-supplemental','set2':'.style-lab-voice-heldout','set3':'.style-lab-voice-heldout3'}
DIRS=['paragraph','reader','actor','prob','ref','result','fact','kind','auto','resp','guide','voice','fill','subj','ptr','mrub']

def load(d):
  A=collections.defaultdict(dict)
  f=f'{d}/results.json'
  if not os.path.exists(f): return None
  for r in json.load(open(f))['results']:
    a=r['answer']
    if a: A[r['candidate_id']][r['question']]=a['probabilities'] if a['type']=='choice' else a['noul']
  return A

def features(base,runs=(1,2,3),dirs=DIRS,overrides=None):
  """id -> question -> list of per-run answers. overrides maps dir name -> list of run dirs."""
  F=collections.defaultdict(lambda: collections.defaultdict(list))
  seen=set()
  for d in dirs:
    paths=(overrides or {}).get(d) or [f'{base}/{d}-run{n}' for n in runs]
    for p in paths:
      rp=os.path.realpath(p)
      if rp in seen: continue
      seen.add(rp); L=load(p)
      if L is None: continue
      for i,qs in L.items():
        for q,v in qs.items(): F[i][q].append(v)
  return F

def votes(panel,adjudicate=True):
  """Panel dir -> (source,id) -> {reviewer: verdict}."""
  parts=panel.split('/'); root='/'.join(parts[:2])
  if LAB and parts[2]!=LAB: parts=parts[:2]+[LAB]+parts[2:]; panel='/'.join(parts)
  if parts[2]=='rubric': root+='/rubric'  # a path given with rubric/ already in it still reads the rubric adjudication
  key=json.load(open(f'{panel}/item-key.json')); V=collections.defaultdict(dict)
  for r in REVIEWERS:
    f=f'{panel}/labels-{r}.json'
    if not os.path.exists(f): continue
    for l in json.load(open(f))['labels']:
      k=key[l['id']]; V[(k.get('source','pairs'),k.get('id',l['id']))][r]=l['verdict']
  # A blind Opus adjudicator's verdict replaces the votes on split items (adjudicate/key.json + chunk-*.out.json).
  d=f"{root}/adjudicate"
  if adjudicate and os.path.exists(f'{d}/key.json'):
    ak=json.load(open(f'{d}/key.json'))
    for o in glob.glob(f'{d}/chunk-*.out.json'):
      for x in json.load(open(o)):
        m=ak[x['id']]
        if m['panel']!=panel: continue
        k=key[m['pid']]; V[(k.get('source','pairs'),k.get('id',m['pid']))]={'adjudicator':x['verdict']}
  return V,key

def label(v):
  """Majority of decided votes; a tie counts as a violation."""
  vi=sum(x=='violation' for x in v.values()); ok=sum(x=='not_violation' for x in v.values())
  if vi+ok==0: return None
  return 'viol' if vi>=ok else 'ok'
