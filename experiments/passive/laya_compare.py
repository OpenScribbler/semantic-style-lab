import glob,json,os,sys,time
sys.path.insert(0,os.path.dirname(__file__))
from lib import G,votes,label
# Replays stored set 6 Jev requests through Laya (https://github.com/NandhaKishorM/laya) and
# compares the two models on the same requests. Run from the repository root with a Python
# that has `laya` installed. Laya's requests and answers are saved beside Jev's.
from laya import Router

H6='.style-lab-k8s-heldout6'; OUT=f'{H6}/laya'
# (question, run directory prefix, answer key that counts as the positive reading)
QUESTIONS=[('redhat_voice','voice','violation'),('microsoft_voice','voice','violation'),
  ('reader_is_actor','reader',None),('actor_needed','paragraph',None)]
os.makedirs(OUT,exist_ok=True)

def auc(pos,neg):
  return sum((p>n)+0.5*(p==n) for p in pos for n in neg)/(len(pos)*len(neg))

def corr(a,b):
  ma,mb=sum(a)/len(a),sum(b)/len(b)
  num=sum((x-ma)*(y-mb) for x,y in zip(a,b))
  return num/(sum((x-ma)**2 for x in a)*sum((y-mb)**2 for y in b))**0.5

def value(a,key):
  return a['probabilities'][key] if key else a['noul']

labels={g:{i:label(v) for (s,i),v in votes(f'{G}/{g}/rubric/h6/panel')[0].items() if label(v)} for g in ('redhat','microsoft')}
router=Router(); ms=[]
for q,d,key in QUESTIONS:
  jev={}
  for n in (1,2,3):
    for r in json.load(open(f'{H6}/{d}-run{n}/results.json'))['results']:
      if r['question']==q and r['answer']: jev.setdefault(r['candidate_id'],[]).append(value(r['answer'],key))
  rows={}
  for f in sorted(glob.glob(f'{H6}/{d}-run1/raw/*-{q}.json')):
    x=json.load(open(f)); cid=x['candidate_id']
    if cid not in jev: continue
    out=f'{OUT}/{os.path.basename(f)}'
    if os.path.exists(out): y=json.load(open(out))['response']
    else:
      req=x['request']; t=time.time(); y=router.predict(req['state'],req['questions']); ms.append((time.time()-t)*1000)
      json.dump({'candidate_id':cid,'request':req,'response':y},open(out,'w'),default=str)
    rows[cid]=(sum(jev[cid])/len(jev[cid]),value(y['answers']['answer'],key))
  ids=list(rows); line=f"{q}: n={len(ids)} r(jev_mean3,laya)={corr([rows[i][0] for i in ids],[rows[i][1] for i in ids]):.2f}"
  for g in ([q.split('_')[0]] if key else ('redhat','microsoft')):
    L=labels[g]; li=[i for i in ids if i in L]
    for m,name in ((0,'jev'),(1,'laya')):
      line+=f" {g}_AUC_{name}={auc([rows[i][m] for i in li if L[i]=='viol'],[rows[i][m] for i in li if L[i]=='ok']):.2f}"
  print(line)
if ms: print(f'laya_ms_median={sorted(ms)[len(ms)//2]:.0f} calls={len(ms)}')
