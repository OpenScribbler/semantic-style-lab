import json,sys,collections
# Score reviewers against a guide's written gold labels, per reviewer and per clause, in one label mode.
g=sys.argv[1]; d=sys.argv[2]; key=json.load(open(f'{d}/item-key.json')); V=collections.defaultdict(dict)
for r in ('codex','antigravity','claude'):
  for l in json.load(open(f'{d}/labels-{r}.json'))['labels']: V[l['id']][r]=l['verdict']
want=lambda i:'violation' if key[i]['label']=='violation' else 'not_violation'
per={r:sum(V[i].get(r)==want(i) for i in key) for r in ('codex','antigravity','claude')}
unan=[i for i in key if len(V[i])==3 and all(v==want(i) for v in V[i].values())]
bycl=collections.Counter(key[i]['clause'] for i in key); okcl=collections.Counter(key[i]['clause'] for i in unan)
print(d,'per reviewer',per,'of',len(key),'unanimous-correct',len(unan))
print(' clause unanimous/total',{c:f'{okcl[c]}/{n}' for c,n in bycl.items()})
if '-v' in sys.argv:
  for i in key:
    if i not in unan: print(' ',i,key[i]['clause'],key[i]['label'],V[i])
