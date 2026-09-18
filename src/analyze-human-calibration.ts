type Verdict = 'violation' | 'not_violation' | 'uncertain';

interface Calibration {
	schema_version: number;
	exported_at: string;
	policies: Record<string, string>;
	cases: Record<string, Verdict>;
}

interface ConsensusItem {
	id: string;
	kind: 'vale_alert' | 'semantic_gap';
	path: string;
	line: number;
	rule: string;
	panel_agreement: string;
	proposed_verdict: Verdict;
	proposed_source: string;
}

interface ValeAlert {
	id: string;
	check: string;
	jev_probability: number;
	jev_probabilities: number[];
	vale_jev_action: 'keep' | 'review' | 'suppress';
}

const expectedPolicies = ['cli', 'content-type', 'contractions', 'semicolons', 'passive'];

function actionAssessment(action: ValeAlert['vale_jev_action'], verdict: Verdict) {
	if (verdict === 'uncertain') return 'appropriate_review_target';
	if (action === 'suppress') return verdict === 'violation' ? 'unsafe_suppression' : 'correct_suppression';
	if (action === 'keep') return verdict === 'violation' ? 'correct_keep' : 'false_positive_kept';
	return 'reviewed';
}

function percent(numerator: number, denominator: number) {
	return denominator ? Number((numerator / denominator * 100).toFixed(1)) : null;
}

async function main() {
	const calibration = await Bun.file('reports/human-calibration.json').json() as Calibration;
	const consensusReport = await Bun.file('reports/reviewer-panel-consensus.json').json();
	const valeReport = await Bun.file('reports/vale-jev-experiment.json').json();
	if (calibration.schema_version !== 1) throw new Error(`Unsupported calibration schema ${calibration.schema_version}`);
	for (const key of expectedPolicies) if (!calibration.policies[key]) throw new Error(`Missing policy choice: ${key}`);
	if (Object.keys(calibration.policies).length !== expectedPolicies.length) throw new Error('Calibration contains an unexpected policy choice.');
	if (Object.keys(calibration.cases).length !== 8) throw new Error('Expected exactly eight calibration cases.');

	const consensus = new Map<string, ConsensusItem>(consensusReport.items.map((item: ConsensusItem) => [item.id, item]));
	const valeAlerts = new Map<string, ValeAlert>();
	for (const page of valeReport.pages) for (const alert of page.alerts as ValeAlert[]) valeAlerts.set(`vale:${alert.id}`, alert);
	const comparisons = Object.entries(calibration.cases).map(([id, humanVerdict]) => {
		const panel = consensus.get(id);
		if (!panel) throw new Error(`Calibration case is absent from panel consensus: ${id}`);
		const alert = valeAlerts.get(id);
		return {
			id,
			kind: panel.kind,
			rule: panel.rule,
			path: panel.path,
			line: panel.line,
			human_verdict: humanVerdict,
			panel_verdict: panel.proposed_verdict,
			panel_source: panel.proposed_source,
			panel_agreement: panel.panel_agreement,
			comparison: humanVerdict === 'uncertain' ? 'human_uncertain' : humanVerdict === panel.proposed_verdict ? 'agree' : 'disagree',
			...(alert ? {
				jev_probability: alert.jev_probability,
				jev_probabilities: alert.jev_probabilities,
				provisional_action: alert.vale_jev_action,
				action_assessment: actionAssessment(alert.vale_jev_action, humanVerdict),
			} : {}),
		};
	});
	const decisive = comparisons.filter((item) => item.human_verdict !== 'uncertain');
	const agreements = decisive.filter((item) => item.comparison === 'agree');
	const semantic = decisive.filter((item) => item.kind === 'semantic_gap');
	const semanticAgreements = semantic.filter((item) => item.comparison === 'agree');
	const vale = comparisons.filter((item) => item.kind === 'vale_alert');
	const unsafeSuppressions = vale.filter((item) => item.action_assessment === 'unsafe_suppression');
	const result = {
		schema_version: 1,
		calibration_source: 'reports/human-calibration.json',
		policy_source: 'policies/syllago-google-style.json',
		counts: {
			policy_choices: Object.keys(calibration.policies).length,
			spot_checks: comparisons.length,
			decisive_spot_checks: decisive.length,
			panel_agreements: agreements.length,
			panel_disagreements: decisive.length - agreements.length,
			human_uncertain: comparisons.length - decisive.length,
			panel_agreement_percent_decisive: percent(agreements.length, decisive.length),
			semantic_agreement_percent_decisive: percent(semanticAgreements.length, semantic.length),
			unsafe_suppressions_observed: unsafeSuppressions.length,
		},
		conclusions: [
			'The model panel agrees with five of seven decisive human spot checks; that is useful triage, not ground truth.',
			'The split semantic cases agree with the human on two of four checks, so adjudicated semantic labels must not be expanded without more human examples.',
			'The global P(violation) <= 0.25 suppression rule is unsafe: it suppressed a prose semicolon the human marked as a violation.',
			'Code/literal filtering remains valuable: Jev assigned P(violation)=0.05 to the import semicolon, and the human confirmed it is not a violation.',
			'Use project policy before probabilistic judgment, then rule-specific Jev questions and thresholds, with uncertainty routed to review.',
		],
		comparisons,
	};
	await Bun.write('reports/human-calibration-analysis.json', `${JSON.stringify(result, null, 2)}\n`);
	const disagreements = comparisons.filter((item) => item.comparison !== 'agree').map((item) => `- \`${item.rule}\` at \`${item.path}:${item.line}\`: human **${item.human_verdict}**, panel **${item.panel_verdict}** (${item.comparison.replace('_', ' ')}).`).join('\n');
	const markdown = `# Human calibration result

The project owner completed all five policy choices and eight spot checks on ${calibration.exported_at}.

## Result

- Panel agreement: **${agreements.length}/${decisive.length} decisive checks (${percent(agreements.length, decisive.length)}%)**
- Split semantic-case agreement: **${semanticAgreements.length}/${semantic.length} (${percent(semanticAgreements.length, semantic.length)}%)**
- Human-uncertain checks: **${comparisons.length - decisive.length}**
- Unsafe provisional Jev suppressions observed: **${unsafeSuppressions.length}**

This sample is deliberately small and stratified. These figures diagnose the workflow; they are not corpus-level accuracy estimates.

## What changed

The global suppression threshold is not validated. The pipeline correctly suppressed a semicolon in MDX import syntax at P(violation)=0.05, but also suppressed a prose semicolon at P(violation)=0.23 that the human marked as a violation. Semicolon handling now requires deterministic code/literal filtering followed by a rule-specific clarity judgment. It must remain review-only until that question is tested on more labeled prose examples.

The five policy decisions are encoded in \`policies/syllago-google-style.json\`. CLI and “content type” are project-level deterministic exceptions. Contractions are contextual suggestions rather than CI failures. Passive voice is reportable only when it hides an important actor or responsibility.

## Non-agreements

${disagreements}

## Next experiment

Build a compact, rule-balanced human set for semicolons, passive voice, reader address, and anthropomorphism. Include clear positives, clear negatives, code/literal exclusions, and boundary cases. Evaluate separate Jev questions and thresholds per family; do not reuse the current global 0.25/0.75 policy.
`;
	await Bun.write('reports/human-calibration-analysis.md', markdown);
	console.error(`Wrote human calibration analysis: ${agreements.length}/${decisive.length} decisive panel agreements; ${unsafeSuppressions.length} unsafe suppression.`);
}

if (import.meta.main) main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
