import json,sys,os
# Build panel items from a guide's written gold cases, judged against the rule alone (gold/panel)
# or against the rule plus rubric (rubric/gold/panel). Same ids in both.
g=sys.argv[1]; mode=sys.argv[2]; G='.style-lab-guides'; rule=json.load(open(os.path.join(os.path.dirname(__file__),'rules.json')))[g]
summary=f"{rule['name']}: {rule['rule']}"
if mode=='rubric': summary+="\n\nApply the rule with this rubric. The rule wins if the two ever differ.\n\n"+open(os.path.join(os.path.dirname(__file__),g,'rubric.md')).read()
d=f'{G}/{g}/gold/panel' if mode=='rule' else f'{G}/{g}/rubric/gold/panel'; os.makedirs(d,exist_ok=True)
# Written to the Microsoft rubric v1; later versions reverse these (intransitive items, version status lines,
# a class-of-actors by-phrase) or leave them on the state/passive line (mg065).
DROP={'microsoft':('intransitive','mg065','mg068','mg087','mg088','mg089','mg090')}
items=[];key={}
for x in json.load(open(f'{G}/{g}/gold/cases-raw.json')):
  if x['id'] in DROP.get(g,()) or x['clause'] in DROP.get(g,()): continue
  t=x['text'].replace(x['match'],f"⟦{x['match']}⟧",1)
  items.append({'id':x['id'],'kind':'vale_alert','path':f"{g}/{x['id']}.md",'line':1,'rule':'passive-voice','rule_summary':summary,'matched_text':x['match'],'passage':f'1 | {t}'})
  key[x['id']]={'source':'gold','id':x['id'],'label':x['label'],'clause':x['clause']}
json.dump(items,open(f'{d}/items.json','w'),indent=1); json.dump(key,open(f'{d}/item-key.json','w'),indent=1); print(d,len(items))
