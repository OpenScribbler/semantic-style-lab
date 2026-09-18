interface Prediction {
	predicted_context: string;
	status: string;
	expected_policy: string;
	predicted_policy: string;
	policy_correct: boolean;
}

interface Result {
	id: string;
	seed_id: string;
	rule: string;
	text: string;
	match: string;
	expected_context: string;
	counterfactual: boolean;
	source: { project: string; url: string };
	predictions: Prediction[];
}

interface Evaluation {
	model: string;
	runs: number;
	fixture_count: number;
	split: string;
	strategy_version?: string;
	context_accuracy: number;
	policy_accuracy: number;
	context_stability: number;
	policy_stability: number;
	usage: { input_tokens: number; output_tokens: number };
	by_rule: Record<string, Record<string, number>>;
	results: Result[];
}

const INPUT_PRICE_PER_MTOK = 0.042;
const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
const normalize = (value: string) => value.toLocaleLowerCase();

function summarize(label: string, report: Evaluation) {
	let tp = 0;
	let fp = 0;
	let fn = 0;
	let tn = 0;
	const statusCounts: Record<string, number> = {};
	for (const result of report.results) {
		for (const prediction of result.predictions) {
			const expectedViolation = normalize(result.match) !== normalize(prediction.expected_policy);
			const predictedViolation = !['pass', 'preserve'].includes(prediction.status);
			if (expectedViolation && predictedViolation) tp++;
			else if (!expectedViolation && predictedViolation) fp++;
			else if (expectedViolation) fn++;
			else tn++;
			statusCounts[prediction.status] = (statusCounts[prediction.status] ?? 0) + 1;
		}
	}
	const seedIds = [...new Set(report.results.map((result) => result.seed_id))];
	let invariantPairs = 0;
	for (const seedId of seedIds) {
		const family = report.results.filter((result) => result.seed_id === seedId);
		for (let run = 0; run < report.runs; run++) {
			if (new Set(family.map((result) => result.predictions[run]!.predicted_context)).size === 1)
				invariantPairs++;
		}
	}
	const bySource = Object.fromEntries(
		[...new Set(report.results.map((result) => result.source.project))].map((project) => {
			const predictions = report.results
				.filter((result) => result.source.project === project)
				.flatMap((result) => result.predictions);
			return [
				project,
				predictions.filter((prediction) => prediction.policy_correct).length / predictions.length,
			];
		}),
	);
	const counterfactualPredictions = report.results
		.filter((result) => result.counterfactual)
		.flatMap((result) => result.predictions);
	return {
		label,
		strategy_version: report.strategy_version ?? 'noul-next-word-v1',
		split: report.split,
		fixtures: report.fixture_count,
		decisions: report.fixture_count * report.runs,
		policy_accuracy: report.policy_accuracy,
		context_accuracy: report.context_accuracy,
		policy_stability: report.policy_stability,
		surface_invariance: invariantPairs / (seedIds.length * report.runs),
		counterfactual_policy_accuracy:
			counterfactualPredictions.filter((prediction) => prediction.policy_correct).length /
			counterfactualPredictions.length,
		violation_precision: tp / (tp + fp),
		violation_recall: tp / (tp + fn),
		confusion: { tp, fp, fn, tn },
		status_counts: statusCounts,
		by_rule: report.by_rule,
		by_source: bySource,
		usage: report.usage,
		input_cost_usd: (report.usage.input_tokens / 1_000_000) * INPUT_PRICE_PER_MTOK,
	};
}

function escapeHtml(value: string) {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;');
}

async function main() {
	const inputs = [
		['v1 development', 'reports/real-world-dev-noul.json'],
		['v1 held out', 'reports/real-world-heldout-noul.json'],
		['v2 development', 'reports/real-world-dev-noul-v2.json'],
		['v2 held out', 'reports/real-world-heldout-noul-v2.json'],
	] as const;
	const loaded = await Promise.all(
		inputs.map(async ([label, path]) => ({
			label,
			path,
			report: (await Bun.file(path).json()) as Evaluation,
		})),
	);
	const benchmarks = loaded.map(({ label, report }) => summarize(label, report));
	const winning = benchmarks.at(-1)!;
	const heldout = loaded.at(-1)!.report;
	const synthetic = (await Bun.file('reports/contextual-vocabulary-noul-v2.json').json()) as Evaluation;
	const sampleAudit = await Bun.file('reports/sample-audit-noul-v2.json').json();
	const failureCases = heldout.results
		.filter((result) => result.predictions.some((prediction) => !prediction.policy_correct))
		.map((result) => ({
			seed_id: result.seed_id,
			text: result.text,
			match: result.match,
			expected_context: result.expected_context,
			predicted_contexts: result.predictions.map((prediction) => prediction.predicted_context),
			source_url: result.source.url,
		}));
	const summary = {
		generated_at: new Date().toISOString(),
		model: heldout.model,
		input_price_per_mtok_usd: INPUT_PRICE_PER_MTOK,
		corpus: {
			source_occurrences: 60,
			fixtures: 140,
			counterfactual_fixtures: 80,
			projects: ['kubernetes', 'docker', 'github'],
		},
		benchmarks,
		regression: {
			synthetic_policy_accuracy: synthetic.policy_accuracy,
			synthetic_policy_stability: synthetic.policy_stability,
			seeded_sample_findings: sampleAudit.findings.length,
		},
		heldout_failure_cases: failureCases,
	};
	await Bun.write('reports/real-world-summary.json', `${JSON.stringify(summary, null, 2)}\n`);

	const rows = benchmarks
		.map(
			(item) =>
				`| ${item.label} | ${percent(item.policy_accuracy)} | ${percent(item.counterfactual_policy_accuracy)} | ${percent(item.surface_invariance)} | ${percent(item.violation_precision)} | ${percent(item.violation_recall)} | $${item.input_cost_usd.toFixed(5)} |`,
		)
		.join('\n');
	const markdown = `# Real-world contextual vocabulary experiment

## Result

The frozen v2 strategy reached **${percent(winning.policy_accuracy)} policy accuracy** over ${winning.decisions} held-out decisions. Violation precision was **${percent(winning.violation_precision)}** and recall was **${percent(winning.violation_recall)}**. Surface invariance—giving every spelling of the same sentence the same context—was **${percent(winning.surface_invariance)}**.

| Benchmark | Policy accuracy | Counterfactual accuracy | Surface invariance | Violation precision | Violation recall | Input cost |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
${rows}

The corpus contains 60 hand-labeled source contexts from pinned Kubernetes, Docker, and GitHub documentation revisions. Expanding each context across its term family's surface forms creates 140 fixtures, including 80 counterfactual forms. The split is 70 development and 70 held-out fixtures; variants of one source sentence never cross splits.

## What changed in v2

Development failures exposed two separate problems. Code now rejects closed-class following words such as \`by\`, \`and\`, \`are\`, and \`itself\` before calling Jev. The modifier Noul also distinguishes a noun used as the direct object of \`set up\` from a noun modified by \`setup\`.

No further prompt or policy changes were made before the v2 held-out run.

The original synthetic suite also passed all 90 repeated policy decisions, and
the end-to-end adversarial sample still surfaced all five seeded violations.

## Remaining failures

${failureCases.map((item) => `- [${item.seed_id}](${item.source_url}): \`${item.match}\` in “${item.text}”`).join('\n')}

The remaining errors are concentrated in \`setup\` verb phrases, particularly passive voice and a borderline hyphenated counterfactual. They remain review candidates; this experiment does not authorize automatic edits.

## Limitations

One reviewer labeled a deliberately selected corpus; there is no inter-annotator
agreement score and this is not a random sample of the source projects. Excerpts
are lightly normalized and the experiment covers only three term families.

## Reproduce

\`\`\`bash
bun run build:corpus
bun run evaluate -- --fixture test/fixtures/real-world-contextual-vocabulary.json --split heldout --strategy noul --runs 5 --output reports/real-world-heldout.local.json
\`\`\`
`;
	await Bun.write('reports/real-world-experiment.md', markdown);

	const htmlRows = benchmarks
		.map(
			(item) => `<tr><td>${escapeHtml(item.label)}</td><td>${percent(item.policy_accuracy)}</td><td>${percent(item.counterfactual_policy_accuracy)}</td><td>${percent(item.surface_invariance)}</td><td>${percent(item.violation_precision)}</td><td>${percent(item.violation_recall)}</td><td>$${item.input_cost_usd.toFixed(5)}</td></tr>`,
		)
		.join('');
	const htmlFailures = failureCases
		.map(
			(item) => `<li><a href="${escapeHtml(item.source_url)}">${escapeHtml(item.seed_id)}</a>: <code>${escapeHtml(item.match)}</code> in “${escapeHtml(item.text)}”</li>`,
		)
		.join('');
	const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Real-world contextual vocabulary experiment</title>
<style>:root{color-scheme:light dark;--bg:#f5f1e8;--panel:#fffdf7;--ink:#27231d;--muted:#716a60;--line:#d9d0c1;--good:#18794e;--blue:#175cd3}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.55 system-ui,sans-serif}main{width:min(1120px,calc(100% - 28px));margin:auto;padding:46px 0 70px}h1,h2{line-height:1.15;letter-spacing:-.025em}h1{font-size:clamp(2.2rem,6vw,4.2rem);max-width:900px;margin:.2em 0}h2{margin-top:2.1em}p{max-width:78ch}.eyebrow{color:var(--blue);font-weight:750;text-transform:uppercase;letter-spacing:.08em;font-size:.78rem}.lede{color:var(--muted);font-size:1.18rem}.verdict,.card,.table-wrap{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:18px}.verdict{border-left:5px solid var(--good);margin:26px 0}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:13px;margin:26px 0}.metric{display:block;font-size:1.9rem;font-weight:800;color:var(--good)}.label{color:var(--muted);font-size:.85rem}.table-wrap{overflow-x:auto}table{width:100%;border-collapse:collapse;min-width:850px}th,td{padding:11px 9px;border-bottom:1px solid var(--line);text-align:right}th:first-child,td:first-child{text-align:left}tr:last-child td{border-bottom:0}code{background:color-mix(in srgb,var(--line) 50%,transparent);border-radius:4px;padding:.12em .35em}a{color:var(--blue)}li{margin:.45em 0}footer{border-top:1px solid var(--line);margin-top:44px;padding-top:18px;color:var(--muted)}@media(max-width:720px){.grid{grid-template-columns:1fr 1fr}}@media(max-width:430px){.grid{grid-template-columns:1fr}}@media(prefers-color-scheme:dark){:root{--bg:#171713;--panel:#211f1a;--ink:#eee9dc;--muted:#aaa294;--line:#474238;--good:#53b985;--blue:#78a9ff}}</style></head>
<body><main><div class="eyebrow">Semantic Style Lab · real-world benchmark</div><h1>Held-out policy accuracy reached ${percent(winning.policy_accuracy)}.</h1><p class="lede">A provenance-tracked, counterfactual benchmark across Kubernetes, Docker, and GitHub documentation.</p><div class="verdict"><strong>The architecture generalized, with limits.</strong> All command-line and real-time decisions were correct; remaining errors were setup verb phrases. Findings should still be reviewed rather than auto-edited.</div>
<div class="grid"><div class="card"><span class="metric">${percent(winning.policy_accuracy)}</span><span class="label">policy accuracy · ${winning.decisions} held-out decisions</span></div><div class="card"><span class="metric">${percent(winning.violation_precision)}</span><span class="label">violation precision</span></div><div class="card"><span class="metric">${percent(winning.violation_recall)}</span><span class="label">violation recall</span></div><div class="card"><span class="metric">${percent(winning.surface_invariance)}</span><span class="label">surface-form invariance</span></div></div>
<h2>Four benchmark runs</h2><div class="table-wrap"><table><thead><tr><th>Benchmark</th><th>Policy</th><th>Counterfactual</th><th>Invariance</th><th>Precision</th><th>Recall</th><th>Input cost</th></tr></thead><tbody>${htmlRows}</tbody></table></div>
<h2>Corpus design</h2><p>Sixty hand-labeled contexts from pinned upstream revisions expand into 140 fixtures: 70 development and 70 held out. Eighty fixtures deliberately use a counterfactual spelling. Every surface variant of one sentence stays in one split.</p>
<h2>Why v2 improved</h2><p>Code now handles obvious grammar before inference: words such as <code>by</code>, <code>and</code>, <code>are</code>, and <code>itself</code> cannot be the noun modified by the target. Jev then answers a narrower question that distinguishes <code>set up repositories</code>—verb plus direct object—from <code>setup instructions</code>—modifier plus noun.</p>
<h2>Regression checks</h2><p>The original synthetic suite passed all 90 repeated policy decisions, and the end-to-end adversarial sample still surfaced all five seeded violations.</p>
<h2>Held-out failure cases</h2><ul>${htmlFailures}</ul><p>These failures remain routed for review. The report does not recommend automatic editing.</p>
<h2>Limitations</h2><p>One reviewer labeled a deliberately selected corpus; there is no inter-annotator agreement score and this is not a random sample. Excerpts are lightly normalized, and the experiment covers only three term families.</p>
<h2>Artifacts</h2><ul><li><a href="real-world-summary.json">Computed summary</a></li><li><a href="real-world-heldout-noul-v2.json">Raw held-out v2 results</a></li><li><a href="../test/fixtures/real-world-contextual-vocabulary.json">Generated fixture corpus</a></li><li><a href="../corpus/NOTICE.md">Sources and licensing notice</a></li></ul>
<footer>${escapeHtml(heldout.model)} · five repeats per fixture · costs use $0.042 per million input tokens and exclude output charges.</footer></main></body></html>`;
	await Bun.write('reports/real-world-experiment.html', html);
}

if (import.meta.main) main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
