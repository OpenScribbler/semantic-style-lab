interface Suggestion {
	line: number;
	rule: string;
	original: string;
	replacement: string;
	rationale: string;
	confidence: number;
}

interface EditorResult {
	path: string;
	method: 'baseline' | 'compiled';
	result: { suggestions: Suggestion[] };
}

interface Finding {
	rule_id: string;
	rule_label: string;
	line: number;
	text: string;
	probability: number;
	status: string;
}

function escapeHtml(value: unknown) {
	return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function argument(name: string, fallback: string) {
	const index = process.argv.indexOf(name);
	return index >= 0 ? process.argv[index + 1]! : fallback;
}

async function main() {
	const output = argument('--output', 'reports/google-style-experiment.html');
	const inventory = await Bun.file('google-guide/inventory.json').json();
	const v1 = await Bun.file('reports/syllago-google-semantic-v1.json').json();
	const v2 = await Bun.file('reports/syllago-google-semantic-v2.json').json();
	const ab = await Bun.file('reports/editor-ab-results.json').json();
	const findingsByPage = Object.fromEntries(v2.pages.map((page: { path: string; findings: Finding[] }) => [page.path, page.findings]));
	const compiled = (ab.results as EditorResult[]).filter((result) => result.method === 'compiled');
	const scopedEdits = compiled.flatMap((result) => result.result.suggestions
		.filter((suggestion) => (findingsByPage[result.path] ?? []).some((finding: Finding) => finding.line === suggestion.line))
		.map((suggestion) => ({ path: result.path, ...suggestion })));
	const payload = JSON.stringify({
		v2,
		scopedEdits,
		metrics: {
			guide_pages: inventory.page_count,
			directive_candidates: inventory.actionable_candidate_count,
			vale_rules: inventory.vale_rule_count,
			v1_findings: v1.finding_count,
			v2_findings: v2.finding_count,
			v2_candidates: v2.candidate_count,
			v2_questions: v2.question_count,
			jev_cost: v2.usage.input_tokens / 1_000_000 * 0.042,
			baseline_suggestions: (ab.results as EditorResult[]).filter((result) => result.method === 'baseline').reduce((sum, result) => sum + result.result.suggestions.length, 0),
			raw_compiled_suggestions: compiled.reduce((sum, result) => sum + result.result.suggestions.length, 0),
			scoped_compiled_suggestions: scopedEdits.length,
		},
	}).replaceAll('<', '\\u003c');
	const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Google style × Jev evidence review</title>
<style>
:root{color-scheme:dark;--ink:#edf5ef;--muted:#9eada3;--paper:#0d1210;--card:#151c18;--line:#334039;--green:#73d49e;--amber:#f0b45c;--red:#ff9385;--blue:#73a7ff;--button:#1d2721;--callout:#132238;--pill:#24312a}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:15px/1.5 ui-sans-serif,system-ui,sans-serif}main{max-width:1080px;margin:auto;padding:40px 24px 80px}h1{font:700 clamp(32px,5vw,54px)/1.05 ui-serif,Georgia,serif;margin:0 0 12px}h2{margin-top:48px;font-size:26px}h3{margin:0 0 8px}.lede{font-size:19px;max-width:850px;color:#c4d0c8}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px}.stat,.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px}.stat strong{display:block;font-size:29px}.stat span,.muted{color:var(--muted)}.callout{border-left:5px solid var(--blue);padding:14px 18px;background:var(--callout)}.finding{border-left:4px solid var(--amber);margin:12px 0}.flag{border-left-color:var(--red)}.edit{margin:12px 0}.suggestion{padding:10px 0}.before{color:var(--red)}.after{color:var(--green)}code{background:#202a24;padding:2px 5px;border-radius:4px}button{color:var(--ink);border:1px solid #53645a;background:var(--button);border-radius:7px;padding:7px 10px;cursor:pointer}button:hover{border-color:var(--blue)}button.selected{background:var(--blue);border-color:var(--blue);color:#08111d}.toolbar{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0}.pill{display:inline-block;font-size:12px;padding:2px 7px;border-radius:99px;background:var(--pill)}.question{margin:14px 0 3px;font-weight:650}.page{margin:24px 0;padding-top:18px;border-top:2px solid var(--line)}.progress{position:sticky;top:0;z-index:2;background:#111914ee;border:1px solid var(--line);border-radius:10px;padding:10px 14px;backdrop-filter:blur(8px)}
</style></head><body><main>
<p class="muted">Semantic Style Lab · generated ${escapeHtml(new Date().toISOString())}</p>
<h1>What did Jev find beyond deterministic style checks?</h1>
<p class="lede">Label the evidence from the existing Google-guide experiment. This review asks whether each finding is real, whether a deterministic Vale rule could decide it reliably, and whether a proposed correction is safe.</p>

<h2>Experiment boundary</h2><div class="grid" id="inventory"></div>
<p class="callout"><strong>This is not a Vale-versus-Jev benchmark.</strong> The semantic audit used regex candidate enumeration plus Jev. Its job is to identify promising semantic gap rules. A separate experiment runs actual Vale alerts through Jev and compares both systems against human labels.</p>

<h2>Semantic audit calibration</h2><div class="grid" id="audit-stats"></div>
<p>V2 added local section context and an independent procedure prerequisite. Procedure false positives fell sharply, but all remaining findings still need human ground truth.</p>

<h2>Label semantic findings</h2>
<p>Answer both questions independently. “Vale could decide it” means a deterministic rule could distinguish valid and invalid uses with acceptable noise—not merely that Vale could match the word.</p>
<div class="toolbar"><button id="export">Export review JSON</button><button id="clear">Clear saved review</button></div>
<div id="progress" class="progress"></div><div id="report-error" class="callout" hidden></div><div id="findings"></div>

<h2>Validate scoped corrections</h2>
<p>This is a secondary downstream check, not an A/B contest. Review only corrections that code mapped back to an enumerated finding.</p><div id="edits"></div>

<h2>What the old editor comparison established</h2><div class="grid" id="editor-stats"></div>
<p>The whole-guide editor and compiled-checklist editor were solving different search problems, so choosing a “more useful” output was not a fair measure of Vale + Jev. The retained observation is narrower: prompt-only scope control failed, and deterministic gating blocked out-of-scope edits. The raw outputs remain available in the JSON report for inspection.</p>
</main><script>
window.addEventListener('error',event=>{const box=document.querySelector('#report-error');box.hidden=false;box.textContent='The interactive report could not render: '+event.message});
const DATA=${payload};
const key='semantic-style-google-evidence-review-v2';
let review={findings:{},edits:{}};
try{review=JSON.parse(localStorage.getItem(key)||'{"findings":{},"edits":{}}')}catch(error){console.warn('Review storage unavailable.',error)}
const save=()=>{try{localStorage.setItem(key,JSON.stringify(review))}catch(error){console.warn('Could not persist review choices.',error)}};
const esc=s=>{const d=document.createElement('div');d.textContent=s;return d.innerHTML};
const stat=(n,label)=>'<div class="stat"><strong>'+n+'</strong><span>'+label+'</span></div>';
document.querySelector('#inventory').innerHTML=stat(DATA.metrics.guide_pages,'guide pages inventoried')+stat(DATA.metrics.directive_candidates.toLocaleString(),'directive candidates')+stat(DATA.metrics.vale_rules,'Google Vale rules')+stat('12','semantic rules tested');
document.querySelector('#audit-stats').innerHTML=stat(DATA.metrics.v2_candidates,'candidate passages')+stat(DATA.metrics.v2_questions,'atomic questions')+stat(DATA.metrics.v1_findings+' → '+DATA.metrics.v2_findings,'findings after calibration')+stat('$'+DATA.metrics.jev_cost.toFixed(4),'estimated Jev input cost');
document.querySelector('#editor-stats').innerHTML=stat(DATA.metrics.baseline_suggestions,'whole-guide suggestions')+stat(DATA.metrics.raw_compiled_suggestions,'raw checklist suggestions')+stat(DATA.metrics.scoped_compiled_suggestions,'finding-mapped corrections');
const buttons=(id,field,values,current)=>'<div class="toolbar">'+values.map(v=>'<button data-id="'+esc(id)+'" data-field="'+field+'" data-value="'+v[0]+'" class="'+(current===v[0]?'selected':'')+'">'+v[1]+'</button>').join('')+'</div>';
function renderFindings(){document.querySelector('#findings').innerHTML=DATA.v2.pages.filter(p=>p.findings.length).map(p=>'<section class="page"><h3>'+esc(p.path)+'</h3>'+p.findings.map(f=>{const id=p.path+':'+f.rule_id+':'+f.line;const r=review.findings[id]||{};return '<div class="card finding '+(f.status==='flag'?'flag':'')+'"><span class="pill">'+f.status+' '+Math.round(f.probability*100)+'%</span> <strong>Rule being tested: '+esc(f.rule_label)+'</strong> · line '+f.line+'<p class="question">Original documentation passage — unchanged</p><p>'+esc(f.text)+'</p><p class="question">Does this original passage violate the rule named above?</p>'+buttons(id,'verdict',[['violation','Yes — violation'],['not-violation','No — acceptable'],['uncertain','Not sure']],r.verdict)+'<p class="question">Could a deterministic Vale rule make this decision reliably?</p>'+buttons(id,'vale_fit',[['yes','Yes'],['no','No — needs semantic context'],['uncertain','Not sure']],r.vale_fit)+'</div>'}).join('')+'</section>').join('');renderProgress()}
function renderEdits(){document.querySelector('#edits').innerHTML=DATA.scopedEdits.map((s,index)=>{const id=s.path+':'+s.line+':'+index;const r=review.edits[id]||{};return '<div class="card edit"><span class="pill">'+esc(s.path)+' · line '+s.line+'</span> <strong>'+esc(s.rule)+'</strong><div class="suggestion"><p class="question">Original text</p><div class="before">− '+esc(s.original)+'</div><p class="question">Proposed replacement</p><div class="after">+ '+esc(s.replacement)+'</div><small>'+esc(s.rationale)+'</small></div><p class="question">Is the proposed replacement safe and sufficient?</p>'+buttons(id,'verdict',[['accept','Accept'],['revise','Needs revision'],['reject','Reject']],r.verdict)+'</div>'}).join('');renderProgress()}
function renderProgress(){const total=DATA.v2.finding_count*2+DATA.scopedEdits.length;const done=Object.values(review.findings).reduce((n,r)=>n+(r.verdict?1:0)+(r.vale_fit?1:0),0)+Object.values(review.edits).reduce((n,r)=>n+(r.verdict?1:0),0);document.querySelector('#progress').textContent=done+' of '+total+' review decisions complete'}
renderFindings();renderEdits();
document.addEventListener('click',event=>{const button=event.target.closest('button[data-id]');if(!button)return;const bucket=button.closest('.finding')?review.findings:review.edits;const item=bucket[button.dataset.id]||(bucket[button.dataset.id]={});item[button.dataset.field]=button.dataset.value;save();renderFindings();renderEdits()});
document.querySelector('#export').onclick=()=>{const blob=new Blob([JSON.stringify({schema_version:2,experiment:'google-semantic-gap-review',exported_at:new Date().toISOString(),...review},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='google-semantic-gap-review.json';a.click();URL.revokeObjectURL(a.href)};
document.querySelector('#clear').onclick=()=>{if(confirm('Clear all saved review choices?')){review={findings:{},edits:{}};save();renderFindings();renderEdits()}};
</script></body></html>`;
	await Bun.write(output, html);
	console.error(`Wrote ${output}: ${v2.finding_count} finding reviews and ${scopedEdits.length} correction reviews.`);
}

if (import.meta.main) main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
