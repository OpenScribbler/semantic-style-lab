import json,sys,os,collections
sys.path.insert(0,os.path.dirname(__file__)); from lib import *; from guidegate import *
# Score a guide gate: agreement and misses per item set, automation and stability on k8s.
K='.style-lab-k8s-passive-lab'
STAB={'A':(4,5,6),'B':(7,8,9),'C':(10,11,12)}
def stab_over(x):
  n=STAB[x]; o={d:[f'{K}/stab/gq{m}' for m in n] for d in ('guide','kind','fact')}; o['voice']=[f'{K}/stab/gv{m}' for m in n]; o['fill']=[f'{K}/stab/fq{m}' for m in n]; o['subj']=[f'{K}/stab/ss{m}' for m in n]; o['ptr']=[f'{K}/stab/ps{m}' for m in n]; o['mrub']=[f'{K}/stab/mr{m}' for m in n]; return o
def labels(g):
  """(source,id) -> label for the main panel, pairs, and controls (controls use the guide's own verdict)."""
  V,key=votes(f'{G}/{g}/panel'); L={k:label(v) for k,v in V.items()}
  PV,_=votes(f'{G}/{g}/pairs/panel'); L.update({('pairs',i):label(v) for (s,i),v in PV.items()})
  if os.path.exists(f'{G}/{g}/h4/panel/item-key.json'):
    HV,_=votes(f'{G}/{g}/h4/panel'); L.update({k:label(v) for k,v in HV.items()})
  for h in ('h5','h6'):
    if os.path.exists(f'{G}/{g}/rubric/{h}/panel/labels-codex.json'):
      HV,_=votes(f'{G}/{g}/rubric/{h}/panel'); L.update({k:label(v) for k,v in HV.items()})
  if os.path.exists(f'{G}/{g}/controls/key.json'):
    for i,cid in json.load(open(f'{G}/{g}/controls/key.json')).items(): L[('controls',i)]='viol' if cid.endswith('|rejected') else 'ok'
  return L
def tally(acts,L,src):
  t=collections.Counter(); bad=[]
  for i,(a,why) in acts.items():
    l=L.get((src,i)); t[(a,l)]+=1
    if a=='suppress' and l=='viol': bad.append(i)
  auto=sum(v for (a,l),v in t.items() if a!='review' and l)
  ok=t[('flag','viol')]+t[('suppress','ok')]
  return dict(n=len(acts),auto=sum(v for (a,_),v in t.items() if a!='review'),agree=f'{ok}/{auto}',miss=len(bad),false_flag=t[('flag','ok')],missed=bad)
def score(g,P,sets=('base','A','B'),verbose=False):
  L=labels(g); out={}
  runs=[gate(K,P)]+[gate(f'{K}/stab/set{x}',P,stab_over(x)) for x in sets if x!='base']
  ids=list(runs[0]); out['k8s']=tally(runs[0],L,'k8s')
  out['k8s']['auto_sets']=[sum(r[i][0]!='review' for i in ids) for r in runs]
  out['k8s']['stable']=f"{sum(len({r[i][0] for r in runs})==1 for i in ids)}/{len(ids)}"
  for s,b in [('set1',BASES['set1']),('set2',BASES['set2']),('set3',BASES['set3'])]: out[s]=tally(gate(b,P),L,s)
  out['pairs']=tally(gate(f'{G}/{g}/pairs',P),L,'pairs')
  if os.path.exists(f'{G}/{g}/controls/run3/results.json'): out['controls']=tally(gate(f'{G}/{g}/controls',P),L,'controls')
  for k,v in out.items():
    m=v.pop('missed'); print(f'{k:9}',v,m if verbose else '')
  return out
if __name__=='__main__':
  g=sys.argv[1]; P=dict(GOOGLE); P.update(json.loads(sys.argv[2]) if len(sys.argv)>2 else {})
  score(g,P,verbose=True)
