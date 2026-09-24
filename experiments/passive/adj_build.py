import json,sys,os,collections
# Blind adjudication input for the rubric relabel: every item whose three rubric votes are not unanimous,
# across the given panels, in chunks of 40. The adjudicator sees the rule, the rubric, and the passage only.
g=sys.argv[1]; G='.style-lab-guides'; R=f'{G}/{g}/rubric'; d=f'{R}/adjudicate'; os.makedirs(d,exist_ok=True)
rule=json.load(open(os.path.join(os.path.dirname(__file__),'rules.json')))[g]; todo=[]
for p in sys.argv[2].split(','):
  panel=f'{R}/{p}'; items={x['id']:x for x in json.load(open(f'{panel}/items.json'))}; V=collections.defaultdict(dict)
  for r in ('codex','antigravity','claude'):
    for l in json.load(open(f'{panel}/labels-{r}.json'))['labels']: V[l['id']][r]=l['verdict']
  todo+=[(panel,i) for i in items if len(V[i])<3 or len(set(V[i].values()))>1]
key={};chunks=collections.defaultdict(list)
for n,(panel,i) in enumerate(todo,1):
  aid=f'j{n:04d}'; key[aid]={'panel':panel,'pid':i}
  it=next(y for y in json.load(open(f'{panel}/items.json')) if y['id']==i)
  chunks[(n-1)//40+1].append({'id':aid,'matched_text':it['matched_text'],'passage':it['passage']})
for c,xs in chunks.items(): json.dump(xs,open(f'{d}/chunk-{c:02d}.json','w'),indent=1,ensure_ascii=False)
json.dump(key,open(f'{d}/key.json','w'),indent=1)
open(f'{d}/prompt.txt','w').write(f"""You are an independent style adjudicator. Judge each candidate against this style guide rule, applied with the rubric below, as a careful editor for {rule['name']} would. The rule wins if the rubric ever differs from it.

RULE (verbatim):
{rule['rule']}

RUBRIC:
{open(os.path.join(os.path.dirname(__file__),g,'rubric.md')).read()}
Each item gives a passage; the marked construction is between ⟦ and ⟧. Judge only the marked construction, not other sentences. Pick one verdict per item: "violation" or "not_violation".
""")
print(g,'split items',len(todo),'chunks',len(chunks))
