interface ExceptionValue {
	probability: number;
	probabilities: number[];
	range: number;
}

interface Result {
	id: string;
	origin: string;
	passage: string;
	expected: 'violation' | 'acceptable';
	expected_exception: string | null;
	action: 'flag' | 'review' | 'suppress';
	max_exception_probability: number;
	exceptions: Record<string, ExceptionValue>;
}

function percent(value: number) {
	return `${Math.round(value * 100)}%`;
}

function escapeHtml(value: string) {
	return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

async function main() {
	const report = await Bun.file('reports/semicolon-exception-experiment.json').json();
	const results = report.results as Result[];
	const rows = results.map((result) => {
		const expected = result.expected === 'violation' ? 'flag' : 'suppress';
		const outcome = result.action === expected ? 'correct' : result.action === 'review' ? 'review' : 'wrong';
		return `<tr><td><span class="pill ${outcome}">${outcome}</span></td><td>${escapeHtml(result.expected)}</td><td>${escapeHtml(result.action)}</td><td><code>${escapeHtml(result.id)}</code></td><td>${result.max_exception_probability.toFixed(3)}</td></tr>`;
	}).join('');
	const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Compiled semicolon rule result</title><style>
:root{color-scheme:dark;--ink:#edf5ef;--muted:#9eada3;--paper:#0d1210;--card:#151c18;--line:#334039;--blue:#73a7ff;--green:#73d49e;--amber:#f0b45c;--red:#ff9385;--callout:#132238}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:15px/1.5 system-ui,sans-serif}main{max-width:1060px;margin:auto;padding:40px 24px 80px}h1{font:700 clamp(34px,5vw,54px)/1.05 Georgia,serif;margin:0 0 12px}h2{margin-top:42px}.lede{font-size:19px;color:#c4d0c8;max-width:860px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px}.stat,.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px}.stat strong{display:block;font-size:28px}.stat span,.muted{color:var(--muted)}.callout{border-left:5px solid var(--blue);background:var(--callout);padding:14px 18px}.good{border-left-color:var(--green)}.warning{border-left-color:var(--amber)}table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line)}th,td{text-align:left;border-bottom:1px solid var(--line);padding:9px;vertical-align:top}code{overflow-wrap:anywhere}.pill{display:inline-block;font-size:12px;padding:2px 7px;border-radius:99px;background:#24312a}.pill.correct{color:var(--green)}.pill.review{color:var(--amber)}.pill.wrong{color:var(--red)}
</style></head><body><main><p class="muted">Semantic Style Lab · compiled-rule baseline</p><h1>The rule shape was the difference.</h1><p class="lede">The same Jev model that failed the broad clarity question successfully verified explicit Google semicolon exceptions—with no examples in its prompt.</p>
<div class="grid"><div class="stat"><strong>${report.metrics.automatic_correct}</strong><span>automatic correct</span></div><div class="stat"><strong>${report.metrics.reviewed}</strong><span>routed to review</span></div><div class="stat"><strong>${report.metrics.unsafe_suppressions}</strong><span>unsafe suppressions</span></div><div class="stat"><strong>${report.metrics.acceptable_auto_suppressed}/${report.metrics.acceptable}</strong><span>acceptable auto-suppressed</span></div><div class="stat"><strong>$${report.estimated_input_cost_usd.toFixed(4)}</strong><span>five Jev runs</span></div></div>
<h2>What changed</h2><p class="callout good"><strong>Default-flag, exception-verification:</strong> code removed non-prose spans; Jev independently tested complex-series, conjunctive-connector, and preferred-close-clauses exceptions; code suppressed only a strongly supported exception.</p>
<p class="callout"><strong>No example leakage:</strong> the request contained zero labeled examples. Seven human violations and five policy-derived acceptable fixtures were used only after inference to score the output.</p>
<h2>Where it worked</h2><div class="grid"><div class="card"><h3>Conjunctive connector</h3><p>Acceptable fixtures scored 0.89–0.97. Human violations stayed below 0.17.</p></div><div class="card"><h3>Complex series</h3><p>Acceptable fixtures scored 0.87–0.91. Human violations stayed below 0.33.</p></div></div>
<h2>Where it did not separate</h2><p class="callout warning"><strong>Closely related clauses remains review-only.</strong> The acceptable case scored 0.466, while two human violations scored 0.480 and 0.418. No threshold can separate those three safely.</p>
<h2>All held-out cases</h2><table><thead><tr><th>Outcome</th><th>Expected</th><th>Action</th><th>Case</th><th>Max P(exception)</th></tr></thead><tbody>${rows}</tbody></table>
<h2>Compiler decision</h2><p>Auto-suppress strongly supported connector and complex-series exceptions. Never auto-suppress the closely-related-clauses exception from this evidence; route it to review. Otherwise retain the Vale alert.</p>
</main></body></html>`;
	await Bun.write('reports/semicolon-exception-result.html', html);
	const markdownRows = results.map((result) => `| \`${result.id}\` | ${result.expected} | ${result.action} | ${result.max_exception_probability.toFixed(3)} |`).join('\n');
	const markdown = `# Compiled semicolon exception result

The exception-oriented compilation produced **${report.metrics.unsafe_suppressions} unsafe suppressions**, automatically classified **${report.metrics.automatic_correct}/12** cases correctly, and routed **${report.metrics.reviewed}/12** to review. Four of five acceptable alerts were removed automatically. No labeled examples were included in the Jev request.

## Interpretation

- **Conjunctive connector:** clean separation; eligible for conservative automatic suppression.
- **Complex series:** clean separation; eligible for conservative automatic suppression.
- **Closely related clauses:** no separation; review-only.

This supersedes the earlier conclusion that Jev adds no value to semicolon handling. The direct clarity question added no value; the compiled exception checks do.

| Case | Expected | Action | Max P(exception) |
| --- | --- | --- | ---: |
${markdownRows}

Model: \`${report.model}\`; five runs; ${report.usage.input_tokens.toLocaleString()} input tokens; estimated input cost $${report.estimated_input_cost_usd.toFixed(4)}.
`;
	await Bun.write('reports/semicolon-exception-result.md', markdown);
	console.error('Wrote semicolon exception HTML and Markdown reports.');
}

if (import.meta.main) main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
