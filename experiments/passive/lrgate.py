import sys,os,json,collections,re;sys.path.insert(0,os.path.dirname(__file__))
import numpy as np
from lib import *; from score import labels,K,stab_over; from guidegate import guard,passages,GOOGLE
# Per-guide learned gate: logistic model on run-mean Jev features, trained on the tuning sets only
# (k8s, pairs). Suppress below ts, flag above tf, review between. Misses count strict-majority
# violations; agreement uses the panel label (tie = violation).
g=sys.argv[1]; ts=float(sys.argv[2]); tf=float(sys.argv[3]); lam=float(sys.argv[4]) if len(sys.argv)>4 else 1.0
L=labels(g); V,_=votes(f'{G}/{g}/panel'); PV,_=votes(f'{G}/{g}/pairs/panel')
if os.path.exists(f'{G}/{g}/h4/panel/item-key.json'): V.update(votes(f'{G}/{g}/h4/panel')[0])
for h in ('h5','h6'):
  if os.path.exists(f'{G}/{g}/rubric/{h}/panel/labels-codex.json'): V.update(votes(f'{G}/{g}/rubric/{h}/panel')[0])
def vec(F):
  out={}
  for i,f in F.items():
    v={}
    for q,runs in f.items():
      if isinstance(runs[0],dict):
        for k in runs[0]: v[f'{q}.{k}']=float(np.mean([r[k] for r in runs]))
      else: v[q]=float(np.mean(runs))
    out[i]=v
  return out
def strict(s,i):
  v=(PV if s=='pairs' else V).get((s,i)) or {}
  return sum(x=='violation' for x in v.values())>sum(x=='not_violation' for x in v.values())
sets={'k8s':K,'pairs':f'{G}/{g}/pairs','set1':BASES['set1'],'set2':BASES['set2'],'set3':BASES['set3']}
if os.path.exists(f'{G}/{g}/controls/run3/results.json'): sets['controls']=f'{G}/{g}/controls'
if os.environ.get('H4') and os.path.exists(f'{G}/{g}/h4/panel/labels-codex.json'): sets['h4']='.style-lab-k8s-heldout4'  # fresh held-out k8s pages
if os.environ.get('H5') and os.path.exists(f'{G}/{g}/rubric/h5/panel/labels-codex.json'): sets['h5']='.style-lab-k8s-heldout5'  # set 5: tuning since its one clean score
if os.environ.get('H6') and os.path.exists(f'{G}/{g}/rubric/h6/panel/labels-codex.json'): sets['h6']='.style-lab-k8s-heldout6'  # clean held-out set, scored once
EXTRA=[d for d in os.environ.get('EXTRA','').split(',') if d]  # extra single-run dirs (micro tests): trained on k8s+pairs, absent sets read 0.5
FX={s:features(b,dirs=DIRS+EXTRA) for s,b in sets.items()}; VX={s:vec(F) for s,F in FX.items()}; PX={s:passages(b) for s,b in sets.items()}
BLOCK=sys.argv[5].split(',') if len(sys.argv)>5 else []  # Google suppress blocks to apply: guard,aip,pf,ar,rc (or 'block' for all)
if BLOCK==['block']: BLOCK=['guard','aip','pf','ar','rc']
def agg(xs): return (np.mean(xs) if os.environ.get('BAGG')=='mean' else max(xs)) if xs else 0
def blocked(f,p):
  # BAGG=mean fires a block on the run mean; the default fires when any run crosses the threshold.
  a=(lambda q,t: np.mean(f.get(q,[0]))>=t) if os.environ.get('BAGG')=='mean' else (lambda q,t: any(x>=t for x in f.get(q,[0])))
  return (('guard' in BLOCK and guard(p)) or ('aip' in BLOCK and a('actor_in_passage',0.3)) or ('pf' in BLOCK and a('problem_followup',GOOGLE['pf']))
    or ('ar' in BLOCK and a('actor_referenced',GOOGLE['ar'])) or ('rc' in BLOCK and a('reader_could_act',float(os.environ.get('RC',GOOGLE['rc']))))
    or ('byp' in BLOCK and byphrase(p)) or ('hs' in BLOCK and a('hidden_stance_holder',0.5)) or ('hp' in BLOCK and a('hidden_actor_pointer',0.2))
    or ('past' in BLOCK and re.search(r'⟦(?:was|were|has been|have been|had been)\b|\b(?:is|are) ⟦being\b',p)) or ('used' in BLOCK and re.search(r'⟦(?:is|are) used⟧',p))
    or ('pre' in BLOCK and agg([x['prerequisite'] for x in f.get('redhat_voice',[])])>=float(os.environ.get('PRE','0.25')))
    or ('mv' in BLOCK and agg([x['violation'] for x in f.get('microsoft_voice',[])])>=float(os.environ.get('MV','0.2')))
    or ('mr' in BLOCK and agg([sum(x[k] for k in ('reader_performs','named_performer','hidden_stance','hidden_work','other_violation')) for x in f.get('microsoft_rubric',[])])>=float(os.environ.get('MR','0.3')))
    or ('being' in BLOCK and '⟦being ' in p)
    or ('op' in BLOCK and agg([x['other_person'] for x in f.get('actor_kind',[])])>=float(os.environ.get('OP','0.5'))))
def byphrase(p):
  # A by-phrase later in the same sentence names the actor (the guard only checks right after the marker).
  e=p.find('⟧'); return bool(re.search(r'\bby\s+(?:the|a|an|its|your)?\s*[\w`]', re.split(r'[.;:]\s', p[e+1:],1)[0]))
# Only questions answered on every set, and only this guide's own voice question.
other='microsoft_voice' if g=='redhat' else 'redhat_voice'
names=sorted(set.intersection(*[{k for v in VX[s].values() for k in v} for s in sets if s not in (('controls','h4','h5','h6','set1','set2','set3') if EXTRA else ('controls','h4','h5','h6'))])-{k for k in {k for v in VX['k8s'].values() for k in v} if k.startswith(other)})
def mat(vs): return np.array([[v.get(n,0.5) for n in names] for v in vs])
tr=[(s,i) for s in ('k8s','pairs') for i in VX[s] if L.get((s,i))]
X=mat([VX[s][i] for s,i in tr]); y=np.array([L[k]=='viol' for k in tr],float)
mu=X.mean(0); sd=X.std(0)+1e-6
w=np.zeros(len(names)+1); Xb=np.c_[(X-mu)/sd,np.ones(len(X))]
for _ in range(4000):
  p=1/(1+np.exp(-Xb@w)); w-=0.1*(Xb.T@(p-y)/len(y)+lam*np.r_[w[:-1],0]/len(y))
def prob(vs): return 1/(1+np.exp(-np.c_[(mat(vs)-mu)/sd,np.ones(len(vs))]@w))
def act(p): return 'suppress' if p<ts else 'flag' if p>tf else 'review'
res={}
for s in sets:
  ids=list(VX[s]); A=dict(zip(ids,map(act,prob([VX[s][i] for i in ids]))))
  if BLOCK: A={i:('review' if a=='suppress' and blocked(FX[s][i],PX[s].get(i,'')) else a) for i,a in A.items()}
  t=collections.Counter((a,L.get((s,i))) for i,a in A.items()); auto=sum(v for (a,l),v in t.items() if a!='review')
  lab=sum(v for (a,l),v in t.items() if a!='review' and l); ok=t[('flag','viol')]+t[('suppress','ok')]
  miss=[i for i,a in A.items() if a=='suppress' and L.get((s,i))=='viol' and strict(s,i)]
  tie=sum(a=='suppress' and L.get((s,i))=='viol' for i,a in A.items())-len(miss)
  res[s]=A; print(f'{s:9} n {len(ids)} auto {auto} agree {ok}/{lab}={ok/max(lab,1):.3f} miss {len(miss)} tie-suppressed {tie}',miss)
# Stability: k8s actions under stability sets A, B, C (only the guide, kind, fact, voice dirs are rerun).
runs=[res['k8s']]
for x in 'ABC':
  FS=features(f'{K}/stab/set{x}',overrides=stab_over(x)); VS=vec(FS); r=dict(zip(res['k8s'],map(act,prob([VS[i] for i in res['k8s']]))))
  if BLOCK: r={i:('review' if a=='suppress' and blocked(FS[i],PX['k8s'].get(i,'')) else a) for i,a in r.items()}
  runs.append(r)
ids=list(res['k8s']); print('k8s stable base+A+B', sum(len({r[i] for r in runs[:3]})==1 for i in ids),'/',len(ids),' base+A+B+C',sum(len({r[i] for r in runs})==1 for i in ids),' auto per set',[sum(r[i]!='review' for i in ids) for r in runs])
if os.environ.get('UNSTABLE'):
  for i in ids:
    acts=[r[i] for r in runs]
    if len(set(acts[:3]))>1: print('U',acts,L.get(('k8s',i)),f"{float(prob([VX['k8s'][i]])[0]):.2f}",PX['k8s'].get(i,'')[:90])
if os.environ.get('DIST'):
  P=dict(zip(ids,prob([VX['k8s'][i] for i in ids])))
  for lo,hi in [(0,.1),(.1,.2),(.2,.3),(.3,.5),(.5,.7),(.7,.8),(.8,.9),(.9,1.01)]:
    b=[i for i in ids if lo<=P[i]<hi]; print(f'p[{lo},{hi})',len(b),'viol',sum(L.get(('k8s',i))=='viol' for i in b),'acts',collections.Counter(res['k8s'][i] for i in b))
