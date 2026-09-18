type Verdict = 'violation' | 'not_violation' | 'uncertain';

interface Candidate {
	id: string;
	path: string;
	line: number;
	source_class: string;
	jev_probability: number;
	semicolon_clarity_probability: number | null;
}

function percent(numerator: number, denominator: number) {
	return denominator ? Number((numerator / denominator * 100).toFixed(1)) : null;
}

async function main() {
	const calibration = await Bun.file('reports/semicolon-calibration.json').json() as { labels: Record<string, Verdict>; exported_at: string };
	const prior = await Bun.file('reports/human-calibration.json').json() as { cases: Record<string, Verdict> };
	const experiment = await Bun.file('reports/semicolon-experiment.json').json() as { candidates: Candidate[]; counts: Record<string, unknown> };
	if (Object.keys(calibration.labels).length !== 6) throw new Error('Expected six new semicolon calibration labels.');
	const labels = new Map<string, Verdict>(Object.entries(calibration.labels));
	const anchorId = 'getting-started/core-concepts.mdx:6:Google.Semicolons:321:;';
	const anchorVerdict = prior.cases[`vale:${anchorId}`];
	if (!anchorVerdict) throw new Error('The earlier prose-semicolon anchor is missing.');
	labels.set(anchorId, anchorVerdict);
	const labeled = [...labels].map(([id, humanVerdict]) => {
		const candidate = experiment.candidates.find((item) => item.id === id);
		if (!candidate) throw new Error(`Semicolon candidate not found: ${id}`);
		return {
			id,
			path: candidate.path,
			line: candidate.line,
			human_verdict: humanVerdict,
			generic_probability: candidate.jev_probability,
			specific_probability: candidate.semicolon_clarity_probability,
			generic_action_at_0_25: candidate.jev_probability <= 0.25 ? 'suppress' : candidate.jev_probability >= 0.75 ? 'keep' : 'review',
			specific_action_at_0_25: candidate.semicolon_clarity_probability! <= 0.25 ? 'suppress' : candidate.semicolon_clarity_probability! >= 0.75 ? 'keep' : 'review',
		};
	});
	const decisiveViolations = labeled.filter((item) => item.human_verdict === 'violation');
	const genericRetained = decisiveViolations.filter((item) => item.generic_action_at_0_25 !== 'suppress');
	const specificRetained = decisiveViolations.filter((item) => item.specific_action_at_0_25 !== 'suppress');
	const result = {
		schema_version: 1,
		calibration_source: 'reports/semicolon-calibration.json',
		prior_anchor_source: 'reports/human-calibration.json',
		experiment_source: 'reports/semicolon-experiment.json',
		counts: {
			new_human_labels: Object.keys(calibration.labels).length,
			labeled_prose_cases: labeled.length,
			human_violations: decisiveViolations.length,
			human_non_violations: labeled.filter((item) => item.human_verdict === 'not_violation').length,
			deterministic_non_prose_exclusions: experiment.counts.deterministic_syntax_exclusions,
		},
		provisional_threshold_comparison: {
			threshold: 0.25,
			generic_true_findings_retained: genericRetained.length,
			generic_true_finding_retention_percent: percent(genericRetained.length, decisiveViolations.length),
			specific_true_findings_retained: specificRetained.length,
			specific_true_finding_retention_percent: percent(specificRetained.length, decisiveViolations.length),
		},
		decision: {
			routing: 'deterministic_source_filter_then_keep_prose_alert',
			use_jev_to_suppress: false,
			rationale: 'All seven structurally varied, human-labeled prose semicolons are violations. The semicolon-specific Jev question would suppress six at the provisional threshold.',
		},
		labeled_cases: labeled,
	};
	await Bun.write('reports/semicolon-calibration-analysis.json', `${JSON.stringify(result, null, 2)}\n`);
	const rows = labeled.map((item) => `| \`${item.path}:${item.line}\` | ${item.human_verdict} | ${item.generic_probability.toFixed(3)} | ${item.specific_probability!.toFixed(3)} | ${item.specific_action_at_0_25} |`).join('\n');
	const markdown = `# Semicolon calibration result

All six new real-prose cases were labeled as violations. Combined with the earlier prose anchor, all **7/7 structurally varied prose semicolons** are actionable under the Syllago policy.

## Decision

Do not use Jev to suppress semicolon alerts. Parse the complete MDX file, discard candidates whose exact source span is non-prose, and retain every remaining Vale semicolon alert for the writer.

This is a useful negative result: Jev is not adding value to this rule. The deterministic MDX boundary is the improvement over Vale alone.

## Threshold comparison

- Generic Jev judgment at the provisional 0.25 suppression threshold: **${genericRetained.length}/${decisiveViolations.length} true findings retained (${percent(genericRetained.length, decisiveViolations.length)}%)**
- Semicolon-specific Jev judgment at 0.25: **${specificRetained.length}/${decisiveViolations.length} retained (${percent(specificRetained.length, decisiveViolations.length)}%)**
- Deterministic source filter followed by retaining prose alerts: **${decisiveViolations.length}/${decisiveViolations.length} labeled true findings retained**

The rule-specific question was stable across five runs, but consistently on the wrong side of the action boundary. Stability is not correctness.

## Labeled prose cases

| Passage | Human | Generic P(violation) | Specific P(clarity improvement) | Specific action at 0.25 |
| --- | --- | ---: | ---: | --- |
${rows}

## Scope

The seven labels are deliberately selected and do not estimate corpus prevalence. They are sufficient to reject automatic suppression in this experiment because every observed suppression error hides a finding the owner wants to see. The six remaining prose alerts can safely remain visible without further labeling.
`;
	await Bun.write('reports/semicolon-calibration-analysis.md', markdown);
	console.error(`Wrote semicolon calibration analysis: specific Jev retained ${specificRetained.length}/${decisiveViolations.length} labeled true findings at 0.25.`);
}

if (import.meta.main) main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
