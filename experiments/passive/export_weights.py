import sys,os,json,io,runpy,contextlib,collections
sys.path.insert(0,os.path.dirname(__file__))
os.environ["LABELS"]="rubric"  # lib reads LABELS at import; both frozen gates use rubric labels
import numpy as np
from lib import features,DIRS
# Export each guide's logistic model to policies/passive-<guide>.json for the CLI's rank mode.
# Microsoft and Red Hat rerun lrgate.py with the frozen set 6 settings, so the weights match the
# scored gate. Google has no rubric labels and no pairs: it trains on k8s alone, with the
# conservative label the Google gate was tuned on (any reviewer not saying acceptable = violation).
HERE=os.path.dirname(os.path.abspath(__file__)); K='.style-lab-k8s-passive-lab'
FROZEN={
  'redhat':(dict(BAGG='mean',PRE='0.25',OP='0.5',RC='0.22',LABELS='rubric'),['0.2','0.8','1','rc,hs,hp,past,pre,used']),
  'microsoft':(dict(BAGG='mean',RC='0.25',MV='0.15',LABELS='rubric'),['0.04','0.6','1','rc,mv,past,hs,byp,being']),
}
def from_lrgate(g):
  env,args=FROZEN[g]; os.environ.update(env); sys.argv=['lrgate.py',g,*args]
  with contextlib.redirect_stdout(io.StringIO()): m=runpy.run_path(f'{HERE}/lrgate.py',run_name='export')
  return m['names'],m['mu'],m['sd'],m['w'],len(m['y']),int(m['y'].sum()),'k8s + pairs, rubric labels (panel majority, tie = violation)'
def google_labels():
  G='.style-lab-guides/google/labels'; lab=collections.defaultdict(list)
  key=json.load(open(f'{K}/blind/key.json')); key2=json.load(open(f'{K}/blind/key2.json'))
  for f,k in [('blind-a',key),('blind-c',key),('opus0',key2),('opus1',key2),('opus2',key2)]:
    for l in json.load(open(f'{G}/{f}.json'))['labels']:
      if k[l['id']]['source']=='k8s': lab[k[l['id']]['id']].append(l['verdict'])
  for l in json.load(open(f'{K}/blind/panel2-codex.json'))['labels']:
    if key2[l['id']]['source']=='k8s': lab[key2[l['id']]['id']].append(l['verdict'])
  return {i:any(x not in ('not_violation','acceptable') for x in v) for i,v in lab.items()}
def from_google(lam=1.0):
  F=features(K,dirs=[d for d in DIRS if d not in ('mrub','fill')]); L=google_labels()
  V={i:{(f'{q}.{k}' if isinstance(r[0],dict) else q):float(np.mean([x[k] for x in r] if isinstance(r[0],dict) else r))
        for q,r in f.items() if q not in ('redhat_voice','microsoft_voice') for k in (r[0] if isinstance(r[0],dict) else [None])} for i,f in F.items()}
  names=sorted({n for v in V.values() for n in v}); ids=[i for i in V if i in L]
  X=np.array([[V[i].get(n,0.5) for n in names] for i in ids]); y=np.array([L[i] for i in ids],float)
  mu=X.mean(0); sd=X.std(0)+1e-6; w=np.zeros(len(names)+1); Xb=np.c_[(X-mu)/sd,np.ones(len(X))]
  for _ in range(4000):  # same fit as lrgate.py
    p=1/(1+np.exp(-Xb@w)); w-=0.1*(Xb.T@(p-y)/len(y)+lam*np.r_[w[:-1],0]/len(y))
  return names,mu,sd,w,len(y),int(y.sum()),'k8s only, conservative LLM labels (any vote other than acceptable = violation); never scored on unseen pages'
if __name__=='__main__':
  for g in sys.argv[1:] or ['microsoft','redhat','google']:
    names,mu,sd,w,n,pos,src=from_google() if g=='google' else from_lrgate(g)
    out=dict(schema_version=1,guide=g,model='logistic',runs=3,training=dict(items=n,violations=pos,labels=src),
      questions=sorted({x.split('.')[0] for x in names}),
      features=[dict(name=x,mean=round(float(m),6),sd=round(float(s),6),weight=round(float(c),6)) for x,m,s,c in zip(names,mu,sd,w[:-1])],
      bias=round(float(w[-1]),6))
    path=os.path.join(HERE,'..','..','policies',f'passive-{g}.json')
    with open(path,'w') as f: f.write(json.dumps(out,indent=2)+'\n')
    print(g,len(names),'features',len(out['questions']),'questions',n,'items',pos,'violations')
