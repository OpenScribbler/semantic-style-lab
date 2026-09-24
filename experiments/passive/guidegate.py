import json,re,glob,os,sys,collections
sys.path.insert(0,os.path.dirname(__file__)); from lib import *
# Google passive gate rebuilt on lib.features, plus per-guide knobs.
# P holds the knobs; every threshold applies to all 3 runs ("any" for blocks, "all" for paths).
GOOGLE=dict(ra=0.6,rr=0.6,pf=0.5,ar=0.25,rc=0.22,flag_rr=0.6,flag_ra=0.3,
  block_kind={},          # actor_kind option -> block suppress when prob >= t in any run
  sys_suppress=None,      # software prob >= t in all runs opens a suppress path (Red Hat system actor)
  sys_ra=0.3,             # sys path also needs reader_is_actor < this in all runs
  sys_reader=0.1, sys_other=0.2,  # sys path needs actor_kind reader/other_person below these in all runs
  sys_blocks=('guard','aip','pf'),  # which suppress blocks the sys path keeps
  flag_block_sw=None,     # software prob >= t in all runs sends a flag to review
  no_suppress=False,      # stage 2 never suppresses
  extra_suppress=[], extra_flag=[], unflag=[])  # rules [(q.k,op,t),...] every run must clear: review->suppress, review->flag, flag->review
def passages(base):
  d=f'{base}/reader-run1/raw'; out={}
  for f in glob.glob(f'{d}/*.json'):
    x=json.load(open(f)); out[x['candidate_id']]=x['request']['state']['passage']
  return out
def guard(p):
  s=p.find('⟦'); e=p.find('⟧')
  return bool(re.match(r'\s+by\s', p[e+1:e+60])) or bool(re.search(r'\b[Ii]t\s+(?:\w+\s+)?$', p[max(0,s-12):s]))
def gate(base,P,overrides=None):
  F=features(base,overrides=overrides); pas=passages(base); acts={}
  for i,f in F.items():
    if 'construction' not in f or 'reader_is_actor' not in f: continue
    def all_(q,t,k=None): return all((x[k] if k else x)>=t for x in f[q])
    def any_(q,t,k=None): return any((x[k] if k else x)>=t for x in f[q])
    def blocked():
      return (guard(pas.get(i,'')) or any_('actor_in_passage',0.3) or any_('problem_followup',P['pf'])
        or any_('actor_referenced',P['ar']) or any_('reader_could_act',P['rc'])
        or any(any_('actor_kind',t,k) for k,t in P['block_kind'].items()))
    def sysblocked():
      B=P['sys_blocks']
      return (('guard' in B and guard(pas.get(i,''))) or ('aip' in B and any_('actor_in_passage',0.3)) or ('pf' in B and any_('problem_followup',P['pf']))
        or ('ar' in B and any_('actor_referenced',P['ar'])) or ('rc' in B and any_('reader_could_act',P['rc'])))
    def stage2():
      if all_('reader_is_actor',P['ra']): return 'flag','ra'
      if P['no_suppress']: return 'review','s2'
      if all(x<0.4 for x in f['reader_unsure']) and all_('result_report',P['rr']) and not blocked(): return 'suppress','rr'
      if P['sys_suppress'] is not None and all_('actor_kind',P['sys_suppress'],'software') and all(x<P['sys_ra'] for x in f['reader_is_actor']) \
        and all(x['reader']<P['sys_reader'] and x['other_person']<P['sys_other'] for x in f['actor_kind']) and not sysblocked():
        return 'suppress','sys'
      return 'review','s2'
    def s1():
      c=f['construction']; un=[x['passive_actor_unnamed'] for x in c]; nm=[x['passive_actor_named'] for x in c]
      if all(u<=0.3 for u in un):
        if all(n>=0.5 for n in nm): return 'flag','s1'
        if all(n<0.5 for n in nm) and not blocked(): return 'suppress','s1'
        return 'review','s1'
      if all(u>=0.6 for u in un): return stage2()
      if all(u+n>=0.5 for u,n in zip(un,nm)): return ('flag','s1') if all(n>=0.5 for n in nm) else stage2()
      return 'review','s1'
    a=s1()
    if a==('review','s2') and all(x<P['flag_rr'] for x in f['result_report']) and all_('reader_is_actor',P['flag_ra']): a=('flag','f2')
    if a[0]=='flag' and a[1]!='s1' and P['flag_block_sw'] is not None and all_('actor_kind',P['flag_block_sw'],'software'): a=('review','sw')
    def fires(rule):
      def ok(n,op,t):
        q,_,k=n.partition('.'); runs=f.get(q)
        if not runs: return False
        xs=[r[k] for r in runs] if k else runs
        return all(x>=t for x in xs) if op=='>=' else all(x<t for x in xs)
      return all(ok(*c) for c in rule)
    if a[0]=='flag' and any(fires(r) for r in P['unflag']): a=('review','unflag')
    if a[0]=='review' and a[1]!='unflag':
      if any(fires(r) for r in P['extra_flag']): a=('flag','xf')
      elif any(fires(r) for r in P['extra_suppress']): a=('suppress','xs')
    acts[i]=a
  return acts
