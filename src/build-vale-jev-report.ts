interface Alert {
	id: string;
	check: string;
	severity: string;
	message: string;
	match: string;
	line: number;
	context: { line: number; text: string }[];
	jev_probability: number;
	jev_probabilities: number[];
	jev_range: number;
	vale_jev_action: 'keep' | 'review' | 'suppress';
	action_agreement: number;
}

interface Page {
	path: string;
	alerts: Alert[];
}

function argument(name: string, fallback: string) {
	const index = process.argv.indexOf(name);
	return index >= 0 ? process.argv[index + 1]! : fallback;
}

function sampleByRule(pages: Page[], limitPerRule: number) {
	const byRule = new Map<string, (Alert & { path: string })[]>();
	for (const page of pages) for (const alert of page.alerts) {
		const group = byRule.get(alert.check) ?? [];
		group.push({ path: page.path, ...alert });
		byRule.set(alert.check, group);
	}
	return [...byRule.entries()].flatMap(([, alerts]) => {
		const sorted = alerts.sort((left, right) => left.jev_probability - right.jev_probability || left.id.localeCompare(right.id));
		if (sorted.length <= limitPerRule) return sorted;
		return Array.from({ length: limitPerRule }, (_, index) => sorted[Math.round(index * (sorted.length - 1) / (limitPerRule - 1))]!);
	}).sort((left, right) => left.check.localeCompare(right.check) || left.path.localeCompare(right.path) || left.line - right.line);
}

async function main() {
	const input = argument('--input', 'reports/vale-jev-experiment.json');
	const output = argument('--output', 'reports/vale-jev-experiment.html');
	const report = await Bun.file(input).json();
	const sample = sampleByRule(report.pages as Page[], Number(argument('--per-rule', '12')));
	const payload = JSON.stringify({ report, sample }).replaceAll('<', '\\u003c');
	const cost = report.usage.input_tokens / 1_000_000 * 0.042;
	const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Vale + Jev hypothesis test</title>
<style>
:root{color-scheme:dark;--ink:#edf5ef;--muted:#9eada3;--paper:#0d1210;--card:#151c18;--line:#334039;--green:#73d49e;--amber:#f0b45c;--red:#ff9385;--blue:#73a7ff;--button:#1d2721;--callout:#132238;--pill:#24312a}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:15px/1.5 ui-sans-serif,system-ui,sans-serif}main{max-width:1040px;margin:auto;padding:40px 24px 80px}h1{font:700 clamp(32px,5vw,54px)/1.05 ui-serif,Georgia,serif;margin:0 0 12px}h2{margin-top:48px;font-size:26px}h3{margin:4px 0 12px}.lede{font-size:19px;max-width:850px;color:#c4d0c8}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px}.stat,.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px}.stat strong{display:block;font-size:28px}.stat span,.muted{color:var(--muted)}.callout{border-left:5px solid var(--blue);padding:14px 18px;background:var(--callout)}.alert{margin:14px 0;border-left:4px solid var(--amber)}.toolbar{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}button{color:var(--ink);border:1px solid #53645a;background:var(--button);border-radius:7px;padding:7px 10px;cursor:pointer}button:hover{border-color:var(--blue)}button.selected{background:var(--blue);border-color:var(--blue);color:#08111d}.pill{display:inline-block;font-size:12px;padding:2px 7px;border-radius:99px;background:var(--pill)}.eyebrow{color:var(--blue);font-size:12px;font-weight:750;letter-spacing:.08em;text-transform:uppercase;margin:14px 0 0}.question{font-size:17px;font-weight:700;margin:18px 0 4px}.help{color:var(--muted);margin:4px 0 10px}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#0b100d;border:1px solid var(--line);padding:12px;border-radius:8px}mark{background:#674b13;color:#fff0bd;border-radius:3px;padding:1px 2px}details{margin-top:12px}.progress{position:sticky;top:0;z-index:2;background:#111914ee;border:1px solid var(--line);border-radius:10px;padding:10px 14px;backdrop-filter:blur(8px)}table{width:100%;border-collapse:collapse}th,td{text-align:left;border-bottom:1px solid var(--line);padding:8px}
</style></head><body><main>
<p class="muted">Semantic Style Lab · generated ${new Date().toISOString()}</p>
<h1>Does Jev improve real Vale alerts?</h1>
<p class="lede">Vale generated the candidates. Jev independently judged whether each alert is a real, actionable violation in context. Human labels determine whether Jev removes noise without suppressing legitimate findings.</p>

<h2>Design</h2>
<div class="grid"><div class="stat"><strong>${report.page_count}</strong><span>real Syllago pages</span></div><div class="stat"><strong>${report.vale_alert_count}</strong><span>actual Google Vale alerts</span></div><div class="stat"><strong>${report.run_count}</strong><span>Jev runs per alert</span></div><div class="stat"><strong>${sample.length}</strong><span>stratified review sample</span></div><div class="stat"><strong>$${cost.toFixed(4)}</strong><span>estimated Jev input cost</span></div></div>
<p class="callout"><strong>Primary hypothesis:</strong> suppressing low-probability alerts increases precision while retaining true Vale findings. The sample includes up to 12 probability-spaced alerts per Vale rule, so evaluate rule-level behavior rather than treating it as a prevalence-weighted corpus sample.</p>

<h2>Provisional pipeline output</h2><div class="grid"><div class="stat"><strong>${report.vale_jev.keep}</strong><span>keep automatically</span></div><div class="stat"><strong>${report.vale_jev.review}</strong><span>send to review</span></div><div class="stat"><strong>${report.vale_jev.suppress}</strong><span>suppress provisionally</span></div><div class="stat"><strong>${Math.round(report.pages.flatMap((page: Page) => page.alerts).filter((alert: Alert) => alert.action_agreement === 1).length / report.vale_alert_count * 100)}%</strong><span>same action in all runs</span></div></div>
<p>These counts are not results. The 0.25 suppression and 0.75 keep thresholds were declared before labeling and must be calibrated against your judgments.</p>

<h2>Human ground truth</h2>
<p>Nothing in these cards has been edited. Each card first shows what Vale reported, followed by the unchanged documentation passage that triggered it. Judge the Vale alert before expanding its Jev details.</p>
<div class="toolbar"><button id="export">Export labels and metrics</button><button id="clear">Clear labels</button></div><div id="progress" class="progress"></div><div id="metrics" class="grid"></div><div id="report-error" class="callout" hidden></div><div id="alerts"></div>

<h2>Interpretation boundary</h2>
<p>This experiment measures refinement only within Vale's candidate universe. It can measure false-positive reduction and retention of true Vale findings. It cannot measure violations Vale never nominated; the separate semantic-gap report covers that question.</p>
</main><script>
window.addEventListener('error',event=>{const box=document.querySelector('#report-error');box.hidden=false;box.textContent='The interactive report could not render: '+event.message});
const DATA=${payload};const key='vale-jev-review-v1';let labels={};try{labels=JSON.parse(localStorage.getItem(key)||'{}')}catch(error){console.warn(error)}const save=()=>{try{localStorage.setItem(key,JSON.stringify(labels))}catch(error){console.warn(error)}};const esc=s=>{const d=document.createElement('div');d.textContent=s;return d.innerHTML};
function highlightMatch(text,match){const index=text.indexOf(match);if(index<0)return esc(text);return esc(text.slice(0,index))+'<mark>'+esc(match)+'</mark>'+esc(text.slice(index+match.length))}
function contextHtml(a){return a.context.map(row=>String(row.line).padStart(4,' ')+' | '+(row.line===a.line?highlightMatch(row.text,a.match):esc(row.text))).join('\\n')}
function render(){document.querySelector('#alerts').innerHTML=DATA.sample.map(a=>{const label=labels[a.id];return '<div class="card alert"><span class="pill">'+esc(a.check)+'</span> <span class="pill">'+esc(a.path)+':'+a.line+'</span><p class="eyebrow">Vale alert</p><h3>'+esc(a.message)+'</h3><p><strong>Exact text Vale matched:</strong> <code>'+esc(a.match)+'</code></p><p class="eyebrow">Original documentation — unchanged</p><pre>'+contextHtml(a)+'</pre><p class="question">Should Vale show this alert to a writer?</p><p class="help"><strong>Yes</strong> if Vale correctly identified a Google-style violation in this context. <strong>No</strong> if this is a contextual false positive or following the alert would make the documentation worse.</p><div class="toolbar">'+[['violation','Yes — show it'],['not-violation','No — false positive'],['uncertain','Not sure']].map(v=>'<button data-id="'+esc(a.id)+'" data-value="'+v[0]+'" class="'+(label===v[0]?'selected':'')+'">'+v[1]+'</button>').join('')+'</div><details><summary>Reveal Jev judgment after labeling</summary><p><strong>'+a.vale_jev_action+'</strong> · mean P(violation) '+a.jev_probability.toFixed(2)+' · runs '+a.jev_probabilities.map(p=>p.toFixed(2)).join(', ')+'</p></details></div>'}).join('');renderMetrics()}
function pct(n,d){return d?Math.round(n/d*100)+'%':'—'}
function renderMetrics(){const labeled=DATA.sample.filter(a=>labels[a.id]==='violation'||labels[a.id]==='not-violation');const tp=labeled.filter(a=>labels[a.id]==='violation');const fp=labeled.filter(a=>labels[a.id]==='not-violation');const forwarded=labeled.filter(a=>a.vale_jev_action!=='suppress');const forwardedTp=forwarded.filter(a=>labels[a.id]==='violation');const forwardedFp=forwarded.filter(a=>labels[a.id]==='not-violation');const suppressedTp=tp.filter(a=>a.vale_jev_action==='suppress');const suppressedFp=fp.filter(a=>a.vale_jev_action==='suppress');document.querySelector('#progress').textContent=Object.keys(labels).length+' of '+DATA.sample.length+' alerts labeled';document.querySelector('#metrics').innerHTML='<div class="stat"><strong>'+pct(tp.length,labeled.length)+'</strong><span>Vale precision on labeled sample</span></div><div class="stat"><strong>'+pct(forwardedTp.length,forwarded.length)+'</strong><span>Vale + Jev forwarded precision</span></div><div class="stat"><strong>'+pct(forwardedTp.length,tp.length)+'</strong><span>true-finding retention</span></div><div class="stat"><strong>'+pct(suppressedFp.length,fp.length)+'</strong><span>false positives removed</span></div><div class="stat"><strong>'+suppressedTp.length+'</strong><span>true findings wrongly suppressed</span></div>'}
render();document.addEventListener('click',event=>{const button=event.target.closest('button[data-id]');if(!button)return;labels[button.dataset.id]=button.dataset.value;save();render()});document.querySelector('#export').onclick=()=>{const labeled=DATA.sample.map(a=>({id:a.id,path:a.path,line:a.line,check:a.check,human_label:labels[a.id]||null,jev_probability:a.jev_probability,vale_jev_action:a.vale_jev_action}));const blob=new Blob([JSON.stringify({schema_version:1,experiment:'vale-plus-jev',exported_at:new Date().toISOString(),labels:labeled},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='vale-jev-review.json';a.click();URL.revokeObjectURL(a.href)};document.querySelector('#clear').onclick=()=>{if(confirm('Clear all labels?')){labels={};save();render()}};
</script></body></html>`;
	await Bun.write(output, html);
	console.error(`Wrote ${output}: ${sample.length} alerts sampled from ${report.vale_alert_count}.`);
}

if (import.meta.main) main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
