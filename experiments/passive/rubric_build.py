import json,sys,os,random;sys.path.insert(0,os.path.dirname(__file__))
from guidegate import passages
# Copy every labeled item set into {g}/rubric/ with the frozen rubric appended to the rule text,
# and build the set 5 items (fresh k8s pages) the same way. Ids and keys stay the same, so the
# rubric labels line up with the rule-only labels item for item.
g=sys.argv[1]; G='.style-lab-guides'; rule=json.load(open(os.path.join(os.path.dirname(__file__),'rules.json')))[g]
summary=f"{rule['name']}: {rule['rule']}\n\nApply the rule with this rubric. The rule wins if the two ever differ.\n\n"+open(os.path.join(os.path.dirname(__file__),g,'rubric.md')).read()
def write(d,items,key):
  os.makedirs(d,exist_ok=True)
  for x in items: x['rule_summary']=summary
  json.dump(items,open(f'{d}/items.json','w'),indent=1); json.dump(key,open(f'{d}/item-key.json','w'),indent=1)
  print(d,len(items))
for sub in sys.argv[2].split(','):
  if sub in ('h5','h6'):
    k=int(sub[1]); P=passages(f'.style-lab-k8s-heldout{k}'); ids=sorted(P); random.Random(k).shuffle(ids); items=[];key={}
    for n,i in enumerate(ids,1):
      p=P[i]; iid=f'{g[0]}{k}{n:03d}'; m=p[p.find('⟦')+1:p.find('⟧')]
      items.append({'id':iid,'kind':'vale_alert','path':f'{g}/{iid}.md','line':1,'rule':'passive-voice','rule_summary':'',
        'matched_text':m,'passage':'1 | '+' '.join(p.split())})
      key[iid]={'source':sub,'id':i}
    write(f'{G}/{g}/rubric/{sub}/panel',items,key)
  else:
    src=f'{G}/{g}/{sub}'
    write(f'{G}/{g}/rubric/{sub}',json.load(open(f'{src}/items.json')),json.load(open(f'{src}/item-key.json')))
