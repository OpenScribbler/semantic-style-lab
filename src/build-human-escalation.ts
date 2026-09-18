interface Label {
	id: string;
	verdict: 'violation' | 'not_violation' | 'uncertain';
	vale_fit: string;
	confidence: number;
	rationale: string;
}

interface Item {
	id: string;
	kind: 'vale_alert' | 'semantic_gap';
	path: string;
	line: number;
	rule: string;
	rule_summary: string;
	matched_text?: string;
	passage: string;
}

function countsFor(labels: Label[]) {
	return Object.fromEntries(['violation', 'not_violation', 'uncertain'].map((verdict) => [verdict, labels.filter((label) => label.verdict === verdict).length]));
}

function winner(counts: Record<string, number>) {
	return Object.entries(counts).sort((left, right) => right[1] - left[1])[0]![0];
}

async function main() {
	const reviewers = ['antigravity', 'claude', 'copilot', 'codex'];
	const items = await Bun.file('experiments/reviewer-panel-items.json').json() as Item[];
	const reports = await Promise.all(reviewers.map((reviewer) => Bun.file(`reports/reviewer-panel-${reviewer}.json`).json()));
	const adjudication = await Bun.file('reports/reviewer-panel-adjudication.json').json();
	const adjudicated = new Map<string, Label>(adjudication.labels.map((label: Label) => [label.id, label]));
	const consensus = items.map((item) => {
		const reviews = reports.map((report, index) => ({ reviewer: reviewers[index], ...report.labels.find((label: Label) => label.id === item.id) }));
		const counts = countsFor(reviews);
		const maximum = Math.max(...Object.values(counts));
		const adjudicator = adjudicated.get(item.id);
		return {
			...item,
			reviews,
			panel_counts: counts,
			panel_agreement: maximum === 4 ? 'unanimous' : maximum === 3 ? 'majority' : 'split',
			adjudicator,
			proposed_verdict: maximum >= 3 ? winner(counts) : adjudicator?.verdict ?? 'uncertain',
			proposed_source: maximum === 4 ? 'unanimous_panel' : maximum === 3 ? 'panel_majority' : 'reasoning_adjudicator',
		};
	});
	await Bun.write('reports/reviewer-panel-consensus.json', `${JSON.stringify({
		generated_at: new Date().toISOString(), reviewers, item_count: consensus.length,
		counts: {
			unanimous: consensus.filter((item) => item.panel_agreement === 'unanimous').length,
			majority: consensus.filter((item) => item.panel_agreement === 'majority').length,
			split: consensus.filter((item) => item.panel_agreement === 'split').length,
		},
		items: consensus,
	}, null, 2)}\n`);

	const selectedIds = [
		'semantic:getting-started/why-syllago.mdx:ambiguous-pronoun:22',
		'semantic:moat/trust-tiers.mdx:reader-address:59',
		'semantic:advanced/sandbox.mdx:anthropomorphism:14',
		'semantic:advanced/team-setup.mdx:excessive-claim:156',
		'vale:advanced/team-setup.mdx:37:Google.Timeless:31:latest',
	];
	for (const agreement of ['unanimous', 'majority']) {
		for (const verdict of ['violation', 'not_violation']) {
			const match = consensus.find((item) => item.panel_agreement === agreement && item.proposed_verdict === verdict && !selectedIds.includes(item.id));
			if (match) selectedIds.push(match.id);
		}
	}
	const cases = selectedIds.slice(0, 8).map((id) => consensus.find((item) => item.id === id)!).filter(Boolean);
	const policies = [
		{ id: 'cli', title: 'Established term: CLI', question: 'How should Syllago treat “CLI” in prose?', impact: '51 Vale alerts', options: [['allow','Allow CLI when the meaning is clear or it is part of a product name'],['strict','Follow Google strictly: use command-line tool/interface'],['context','Decide case by case']] },
		{ id: 'content-type', title: 'Product terminology: content type', question: 'Is “content type” an intentional Syllago domain term?', impact: '16 Vale alerts', options: [['allow','Keep content type as Syllago terminology'],['replace','Prefer Google’s media type'],['context','Decide case by case']] },
		{ id: 'contractions', title: 'Contractions', question: 'Should the docs enforce Google’s preference for contractions?', impact: '36 Vale alerts', options: [['prefer','Prefer contractions such as don’t and can’t'],['ignore','Do not enforce contractions'],['context','Decide case by case']] },
		{ id: 'semicolons', title: 'Semicolons', question: 'How should semicolon alerts behave?', impact: '21 Vale alerts', options: [['context','Flag only when the semicolon harms clarity'],['avoid','Prefer replacing semicolons'],['ignore','Disable this rule']] },
		{ id: 'passive', title: 'Passive voice', question: 'When should passive voice be reported?', impact: '84 Vale alerts', options: [['hidden-actor','Only when it hides an important actor or responsibility'],['all','Report most passive constructions'],['ignore','Disable this rule']] },
	];
	const payload = JSON.stringify({ policies, cases, counts: { unanimous: 64, majority: 47, split: 28, total: 139 } }).replaceAll('<', '\\u003c');
	const output = 'reports/human-escalation.html';
	const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Focused human calibration</title><style>
:root{color-scheme:dark;--ink:#edf5ef;--muted:#9eada3;--paper:#0d1210;--card:#151c18;--line:#334039;--amber:#f0b45c;--blue:#73a7ff;--button:#1d2721;--callout:#132238;--pill:#24312a}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:15px/1.5 system-ui,sans-serif}main{max-width:960px;margin:auto;padding:40px 24px 80px}h1{font:700 clamp(34px,5vw,54px)/1.05 Georgia,serif;margin:0 0 12px}h2{margin-top:44px}.lede{font-size:19px;color:#c4d0c8;max-width:800px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}.stat,.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px}.stat strong{display:block;font-size:28px}.muted,.stat span{color:var(--muted)}.callout{border-left:5px solid var(--blue);background:var(--callout);padding:14px 18px}.card{margin:14px 0}.toolbar{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}button{color:var(--ink);border:1px solid #53645a;background:var(--button);border-radius:7px;padding:8px 11px;cursor:pointer}button.selected{background:var(--blue);color:#08111d}.pill{display:inline-block;font-size:12px;padding:2px 7px;border-radius:99px;background:var(--pill)}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#0b100d;border:1px solid var(--line);padding:12px;border-radius:8px}.progress{position:sticky;top:0;background:#111914ee;border:1px solid var(--line);border-radius:10px;padding:10px 14px;z-index:2}.question{font-size:17px;font-weight:700}.case{border-left:4px solid var(--amber)}details{margin-top:10px}
</style></head><body><main><p class="muted">Semantic Style Lab · focused escalation</p><h1>Thirteen decisions, not 193</h1><p class="lede">Five policy choices configure high-volume rule families. Eight spot checks calibrate the model panel. Everything else remains traceable in the saved consensus and raw reviewer files.</p>
<div class="grid"><div class="stat"><strong>64</strong><span>unanimous panel labels</span></div><div class="stat"><strong>47</strong><span>three-of-four labels</span></div><div class="stat"><strong>28</strong><span>reasoning-adjudicated splits</span></div><div class="stat"><strong>${cases.length + policies.length}</strong><span>decisions for you</span></div></div>
<p class="callout"><strong>This is active calibration, not replacement ground truth.</strong> If your spot checks disagree with the panel often, we expand only the affected rule family. If they agree, the remaining pseudo-labels can support exploratory—not final—metrics.</p>
<div class="toolbar"><button id="export">Export my calibration</button><button id="clear">Clear</button></div><div id="progress" class="progress"></div><h2>1. High-leverage policy choices</h2><div id="policies"></div><h2>2. Eight spot checks</h2><p>These include the least-settled semantic cases plus a small audit of cases the panel considered easy. The panel decision stays hidden until after you answer.</p><div id="cases"></div></main><script>
const DATA=${payload};const key='style-human-escalation-v1';let review={policies:{},cases:{}};try{review=JSON.parse(localStorage.getItem(key)||'{"policies":{},"cases":{}}')}catch{}const save=()=>localStorage.setItem(key,JSON.stringify(review));const esc=s=>{const d=document.createElement('div');d.textContent=s;return d.innerHTML};const buttons=(kind,id,options,current)=>'<div class="toolbar">'+options.map(o=>'<button data-kind="'+kind+'" data-id="'+esc(id)+'" data-value="'+o[0]+'" class="'+(current===o[0]?'selected':'')+'">'+esc(o[1])+'</button>').join('')+'</div>';
function render(){document.querySelector('#policies').innerHTML=DATA.policies.map(p=>'<div class="card"><span class="pill">'+esc(p.impact)+'</span><h3>'+esc(p.title)+'</h3><p class="question">'+esc(p.question)+'</p>'+buttons('policies',p.id,p.options,review.policies[p.id])+'</div>').join('');document.querySelector('#cases').innerHTML=DATA.cases.map(c=>'<div class="card case"><span class="pill">'+esc(c.path)+':'+c.line+'</span> <span class="pill">'+esc(c.rule)+'</span><h3>'+esc(c.rule_summary)+'</h3><pre>'+esc(c.passage)+'</pre><p class="question">Should this be reported as a style violation?</p>'+buttons('cases',c.id,[['violation','Yes — report it'],['not_violation','No — acceptable'],['uncertain','Not sure']],review.cases[c.id])+'<details><summary>Reveal panel after answering</summary><p>Proposed: <strong>'+esc(c.proposed_verdict)+'</strong> via '+esc(c.proposed_source)+'. Votes: '+Object.entries(c.panel_counts).map(x=>x[0]+' '+x[1]).join(', ')+'.</p>'+(c.adjudicator?'<p>Adjudicator: '+esc(c.adjudicator.rationale)+' ('+Math.round(c.adjudicator.confidence*100)+'%)</p>':'')+'</details></div>').join('');const done=Object.keys(review.policies).length+Object.keys(review.cases).length;document.querySelector('#progress').textContent=done+' of '+(DATA.policies.length+DATA.cases.length)+' decisions complete'}render();document.addEventListener('click',e=>{const b=e.target.closest('button[data-id]');if(!b)return;review[b.dataset.kind][b.dataset.id]=b.dataset.value;save();render()});document.querySelector('#export').onclick=()=>{const blob=new Blob([JSON.stringify({schema_version:1,exported_at:new Date().toISOString(),...review},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='focused-style-calibration.json';a.click();URL.revokeObjectURL(a.href)};document.querySelector('#clear').onclick=()=>{if(confirm('Clear calibration?')){review={policies:{},cases:{}};save();render()}};
</script></body></html>`;
	await Bun.write(output, html);
	console.error(`Wrote ${output}: ${policies.length} policy choices and ${cases.length} spot checks.`);
}

if (import.meta.main) main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
