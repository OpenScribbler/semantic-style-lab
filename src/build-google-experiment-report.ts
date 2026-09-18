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
	finding_count: number;
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
	return String(value ?? '')
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;');
}

function argument(name: string, fallback: string) {
	const index = process.argv.indexOf(name);
	return index >= 0 ? process.argv[index + 1]! : fallback;
}

function scopedSuggestions(result: EditorResult, findings: Finding[]) {
	if (result.method === 'baseline') return result.result.suggestions;
	return result.result.suggestions.filter((suggestion) => findings.some((finding) => finding.line === suggestion.line));
}

async function main() {
	const output = argument('--output', 'reports/google-style-experiment.html');
	const inventory = await Bun.file('google-guide/inventory.json').json();
	const v1 = await Bun.file('reports/syllago-google-semantic-v1.json').json();
	const v2 = await Bun.file('reports/syllago-google-semantic-v2.json').json();
	const ab = await Bun.file('reports/editor-ab-results.json').json();
	const findingsByPage = Object.fromEntries(v2.pages.map((page: { path: string; findings: Finding[] }) => [page.path, page.findings]));
	const editorResults = (ab.results as EditorResult[]).map((result) => ({
		...result,
		raw_suggestion_count: result.result.suggestions.length,
		suggestions: scopedSuggestions(result, findingsByPage[result.path] ?? []),
	}));
	const baseline = editorResults.filter((result) => result.method === 'baseline');
	const compiled = editorResults.filter((result) => result.method === 'compiled');
	const rawCompiled = compiled.reduce((sum, result) => sum + result.raw_suggestion_count, 0);
	const scopedCompiled = compiled.reduce((sum, result) => sum + result.suggestions.length, 0);
	const payload = JSON.stringify({
		v2,
		editorResults,
		metrics: {
			guide_pages: inventory.page_count,
			word_entries: inventory.word_list_entries,
			directive_candidates: inventory.actionable_candidate_count,
			vale_rules: inventory.vale_rule_count,
			guide_engine_split: inventory.by_primary_engine,
			vale_covered_pages: inventory.pages.filter((page: { vale_rules: unknown[] }) => page.vale_rules.length > 0).length,
			v1_findings: v1.finding_count,
			v2_findings: v2.finding_count,
			v2_candidates: v2.candidate_count,
			v2_questions: v2.question_count,
			input_tokens: v2.usage.input_tokens,
			jev_cost: v2.usage.input_tokens / 1_000_000 * 0.042,
			baseline_suggestions: baseline.reduce((sum, result) => sum + result.suggestions.length, 0),
			raw_compiled_suggestions: rawCompiled,
			scoped_compiled_suggestions: scopedCompiled,
			blocked_compiled_suggestions: rawCompiled - scopedCompiled,
		},
	}).replaceAll('<', '\\u003c');
	const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Google style × Jev: real-docs experiment</title>
<style>
:root{color-scheme:light;--ink:#152019;--muted:#627067;--paper:#f6f4ed;--card:#fff;--line:#d8ddd7;--green:#146c43;--amber:#a95c00;--red:#a2382b;--blue:#2456a6}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:15px/1.5 ui-sans-serif,system-ui,sans-serif}main{max-width:1180px;margin:auto;padding:40px 24px 80px}h1{font:700 clamp(32px,5vw,56px)/1.05 ui-serif,Georgia,serif;margin:0 0 12px}h2{margin-top:48px;font-size:26px}h3{margin:0 0 8px}.lede{font-size:19px;max-width:850px;color:#354139}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}.stat,.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px}.stat strong{display:block;font-size:29px}.stat span,.muted{color:var(--muted)}.callout{border-left:5px solid var(--blue);padding:14px 18px;background:#edf3ff}.finding{border-left:4px solid var(--amber);margin:10px 0}.flag{border-left-color:var(--red)}.pair{display:grid;grid-template-columns:1fr 1fr;gap:14px}.suggestion{padding:12px 0;border-top:1px solid var(--line)}code{background:#eef0ed;padding:2px 5px;border-radius:4px}.before{color:var(--red)}.after{color:var(--green)}button{border:1px solid #9ba69f;background:white;border-radius:7px;padding:7px 10px;cursor:pointer}button.selected{background:var(--ink);color:white}.toolbar{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}.pill{display:inline-block;font-size:12px;padding:2px 7px;border-radius:99px;background:#e8ece8}details{margin:14px 0}.page{margin:22px 0;padding-top:16px;border-top:2px solid var(--line)}@media(max-width:760px){.pair{grid-template-columns:1fr}}
</style></head><body><main>
<p class="muted">Semantic Style Lab · generated ${escapeHtml(new Date().toISOString())}</p>
<h1>Can a compiled style guide make an LLM editor useful?</h1>
<p class="lede">A real-docs experiment on 27 Syllago pages: compile the public Google guide, use Jev for narrow semantic judgments, and hand an editor a bounded checklist instead of an entire style guide.</p>

<h2>What we built</h2><div class="grid" id="inventory"></div>
<p class="callout"><strong>The key architecture:</strong> deterministic code finds candidates and enforces scope; Jev answers small contextual questions; the editor receives only prioritized, traceable findings. A prompt is not trusted to enforce its own boundary.</p>

<h2>First audit calibration</h2><div class="grid" id="audit-stats"></div>
<p>The v1 audit exposed a structural mistake: numbered conceptual lists were treated as procedures. V2 added local section context and a separate “is this actually a procedure?” probability. Procedure findings dropped from 21 to 1. This is a correction of a known error class, not a claim that all 31 remaining findings are correct.</p>

<h2>Paired editor experiment</h2>
<p>Twenty pages were reviewed twice. The baseline editor received the page plus a link to the full Google guide. The compiled editor received the page plus Jev's findings and matching rule records. Suggestions outside enumerated finding lines are rejected by the compiled pipeline.</p>
<div class="grid" id="editor-stats"></div>
<p class="callout">The raw compiled editor still invented out-of-scope edits—including on 3 of 4 zero-finding controls. The deterministic finding gate blocked those edits. This is direct evidence that “don't invent unrelated violations” is not an adequate prompt-only control.</p>

<h2>Blind A/B review</h2>
<p>Reviewer A and B are assigned per page. Choose the more useful edit set before revealing which workflow produced it. Choices stay in this browser; export them when finished.</p>
<div class="toolbar"><button id="export">Export review JSON</button><button id="clear">Clear saved review</button></div><div id="pairs"></div>

<h2>Review Jev findings</h2>
<p>Mark each finding useful, false positive, or uncertain. This supplies the human labels needed to tune thresholds and rule wording.</p><div id="findings"></div>

<h2>Interpretation</h2>
<div class="card"><p><strong>What this can establish:</strong> whether a compiled checklist reduces search and over-editing while preserving useful fixes on these pages.</p><p><strong>What it cannot establish yet:</strong> complete Google-guide coverage, generalization to other repositories, or production-grade precision. The inventory is a roadmap; the live semantic slice contains 12 rules.</p><p><strong>Recommended decision gate:</strong> label the 31 findings and the 20 A/B pairs. Expand the rule catalog only if scoped edits win on usefulness and the findings reach an acceptable precision for review—not automatic rewriting.</p></div>
</main><script>
const DATA=${payload};
const key='semantic-style-google-review-v1';
let review=JSON.parse(localStorage.getItem(key)||'{"pairs":{},"findings":{}}');
const save=()=>localStorage.setItem(key,JSON.stringify(review));
const stat=(n,label)=>'<div class="stat"><strong>'+n+'</strong><span>'+label+'</span></div>';
document.querySelector('#inventory').innerHTML=stat(DATA.metrics.guide_pages,'official guide pages inventoried')+stat(DATA.metrics.directive_candidates.toLocaleString(),'heuristic directive candidates')+stat(DATA.metrics.word_entries,'word-list entries')+stat(DATA.metrics.vale_rules,'local Google Vale rules')+stat(DATA.metrics.vale_covered_pages,'guide pages linked to Vale rules');
document.querySelector('#audit-stats').innerHTML=stat(DATA.metrics.v2_candidates,'candidate passages')+stat(DATA.metrics.v2_questions,'atomic Jev questions')+stat(DATA.metrics.v1_findings+' → '+DATA.metrics.v2_findings,'findings after calibration')+stat(DATA.metrics.input_tokens.toLocaleString(),'Jev input tokens')+stat('$'+DATA.metrics.jev_cost.toFixed(4),'estimated Jev input cost');
document.querySelector('#editor-stats').innerHTML=stat(DATA.metrics.baseline_suggestions,'baseline suggestions')+stat(DATA.metrics.raw_compiled_suggestions,'raw compiled-editor suggestions')+stat(DATA.metrics.scoped_compiled_suggestions,'scope-accepted suggestions')+stat(DATA.metrics.blocked_compiled_suggestions,'out-of-scope suggestions blocked');
const byPage=Object.groupBy(DATA.editorResults,r=>r.path);
const hash=s=>[...s].reduce((n,c)=>n+c.charCodeAt(0),0);
const suggestionHtml=s=>'<div class="suggestion"><span class="pill">line '+s.line+'</span> <strong>'+esc(s.rule)+'</strong><div class="before">− '+esc(s.original)+'</div><div class="after">+ '+esc(s.replacement)+'</div><small>'+esc(s.rationale)+'</small></div>';
function esc(s){const d=document.createElement('div');d.textContent=s;return d.innerHTML}
function renderPairs(){document.querySelector('#pairs').innerHTML=Object.entries(byPage).map(([path,items])=>{const ordered=hash(path)%2?[items.find(x=>x.method==='baseline'),items.find(x=>x.method==='compiled')]:[items.find(x=>x.method==='compiled'),items.find(x=>x.method==='baseline')];const labels=['A','B'];const choice=review.pairs[path];const cards=ordered.map((r,i)=>'<div class="card"><h3>Reviewer '+labels[i]+' <span class="pill">'+r.suggestions.length+' scoped edits</span></h3>'+(r.suggestions.map(suggestionHtml).join('')||'<p class="muted">No edits proposed.</p>')+'</div>').join('');return '<section class="page"><h3>'+esc(path)+'</h3><div class="pair">'+cards+'</div><div class="toolbar">'+['A','B','tie','neither'].map(v=>'<button data-pair="'+esc(path)+'" data-value="'+v+'" class="'+(choice===v?'selected':'')+'">'+v+'</button>').join('')+'</div><details><summary>Reveal workflows</summary><p>Reviewer A: <strong>'+ordered[0].method+'</strong>; Reviewer B: <strong>'+ordered[1].method+'</strong>. Jev findings on page: '+ordered[0].finding_count+'.</p></details></section>'}).join('')}
function renderFindings(){document.querySelector('#findings').innerHTML=DATA.v2.pages.filter(p=>p.findings.length).map(p=>'<section class="page"><h3>'+esc(p.path)+'</h3>'+p.findings.map(f=>{const id=p.path+':'+f.rule_id+':'+f.line;const choice=review.findings[id];return '<div class="card finding '+(f.status==='flag'?'flag':'')+'"><span class="pill">'+f.status+' '+Math.round(f.probability*100)+'%</span> <strong>'+esc(f.rule_label)+'</strong> · line '+f.line+'<p>'+esc(f.text)+'</p><div class="toolbar">'+['useful','false-positive','unsure'].map(v=>'<button data-finding="'+esc(id)+'" data-value="'+v+'" class="'+(choice===v?'selected':'')+'">'+v+'</button>').join('')+'</div></div>'}).join('')+'</section>').join('')}
renderPairs();renderFindings();
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.pair){review.pairs[b.dataset.pair]=b.dataset.value;save();renderPairs()}if(b.dataset.finding){review.findings[b.dataset.finding]=b.dataset.value;save();renderFindings()}});
document.querySelector('#export').onclick=()=>{const blob=new Blob([JSON.stringify(review,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='google-style-experiment-review.json';a.click();URL.revokeObjectURL(a.href)};
document.querySelector('#clear').onclick=()=>{if(confirm('Clear all saved review choices?')){review={pairs:{},findings:{}};save();renderPairs();renderFindings()}};
</script></body></html>`;
	await Bun.write(output, html);
	console.error(`Wrote ${output}: ${v2.finding_count} findings and ${ab.page_count} A/B pairs.`);
}

if (import.meta.main) main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
