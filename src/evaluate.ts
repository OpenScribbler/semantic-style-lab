import { classifyCandidates } from './jev';
import { classifyCandidatesWithNoul } from './jev-noul';
import { loadRules } from './rules';
import type { Candidate, ClassificationStrategy, Fixture } from './types';

export function parseEvalArgs(args: string[]) {
	const fixtureIndex = args.indexOf('--fixture');
	const fixturePath = fixtureIndex >= 0 ? args[fixtureIndex + 1] : 'test/fixtures/contextual-vocabulary.json';
	const outputIndex = args.indexOf('--output');
	const output = outputIndex >= 0 ? args[outputIndex + 1] : undefined;
	const runsIndex = args.indexOf('--runs');
	const runs = runsIndex >= 0 ? Number(args[runsIndex + 1]) : 1;
	const strategyIndex = args.indexOf('--strategy');
	const strategy = (strategyIndex >= 0 ? args[strategyIndex + 1] : 'choice') as ClassificationStrategy;
	if (!fixturePath) throw new Error('--fixture requires a path');
	if (outputIndex >= 0 && !output) throw new Error('--output requires a path');
	if (!Number.isInteger(runs) || runs < 1 || runs > 10) throw new Error('--runs must be an integer from 1 to 10');
	if (!['choice', 'noul'].includes(strategy)) throw new Error('--strategy must be choice or noul');
	return { fixturePath, output, runs, strategy };
}

async function main() {
	const { fixturePath, output, runs, strategy } = parseEvalArgs(process.argv.slice(2));
	const fixtures = (await Bun.file(fixturePath).json()) as Fixture[];
	const rules = await loadRules();
	const candidates: Candidate[] = fixtures.map((fixture, index) => ({
		id: fixture.id,
		file: fixturePath,
		line: index + 1,
		span: [1, fixture.match.length],
		match: fixture.match,
		context: fixture.text.replace(fixture.match, `⟦${fixture.match}⟧`),
		ruleId: fixture.rule,
	}));
	const ruleById = new Map(rules.map((rule) => [rule.id, rule]));
	const classifyRun = async () => {
		const run =
			strategy === 'noul'
				? await classifyCandidatesWithNoul(candidates, rules)
				: await classifyCandidates(candidates, rules);
		return {
			model: run.model,
			usage: run.usage,
			results: run.results.map((classification, index) => {
				const fixture = fixtures[index];
				const rule = ruleById.get(fixture.rule)!;
				const expectedContext = rule.contexts[fixture.expected_context];
				const expectedPolicy = expectedContext.preserve
					? 'preserve'
					: expectedContext.expected ?? 'review';
				const predictedContext = rule.contexts[classification.choice];
				const predictedPolicy = predictedContext.preserve
					? 'preserve'
					: predictedContext.expected ?? 'review';
				return {
					predicted_context: classification.choice,
					confidence: classification.confidence,
					probability: classification.probability,
					signals: classification.signals,
					status: classification.status,
					expected_form: classification.expectedForm,
					expected_policy: expectedPolicy,
					predicted_policy: predictedPolicy,
					context_correct: classification.choice === fixture.expected_context,
					policy_correct: expectedPolicy === predictedPolicy,
				};
			}),
		};
	};
	const completedRuns = await Promise.all(Array.from({ length: runs }, classifyRun));
	const results = fixtures.map((fixture, fixtureIndex) => {
		const predictions = completedRuns.map((run) => run.results[fixtureIndex]);
		return {
			...fixture,
			predictions,
			context_stable: new Set(predictions.map((prediction) => prediction.predicted_context)).size === 1,
			policy_stable: new Set(predictions.map((prediction) => prediction.predicted_policy)).size === 1,
		};
	});
	const contextCorrect = completedRuns.reduce(
		(total, run) => total + run.results.filter((result) => result.context_correct).length,
		0,
	);
	const policyCorrect = completedRuns.reduce(
		(total, run) => total + run.results.filter((result) => result.policy_correct).length,
		0,
	);
	const denominator = fixtures.length * runs;
	const byRule = Object.fromEntries(
		rules.map((rule) => {
			const subset = results.filter((result) => result.rule === rule.id);
			const predictions = subset.flatMap((result) => result.predictions);
			return [
				rule.id,
				{
					count: subset.length,
					context_accuracy: predictions.length
						? predictions.filter((result) => result.context_correct).length / predictions.length
						: 0,
					policy_accuracy: predictions.length
						? predictions.filter((result) => result.policy_correct).length / predictions.length
						: 0,
					context_stability: subset.length
						? subset.filter((result) => result.context_stable).length / subset.length
						: 0,
				},
			];
		}),
	);
	const report = {
		generated_at: new Date().toISOString(),
		strategy,
		model: completedRuns[0]?.model,
		runs,
		usage: {
			input_tokens: completedRuns.reduce((total, run) => total + run.usage.input_tokens, 0),
			output_tokens: completedRuns.reduce((total, run) => total + run.usage.output_tokens, 0),
		},
		fixture_count: results.length,
		context_accuracy: denominator ? contextCorrect / denominator : 0,
		policy_accuracy: denominator ? policyCorrect / denominator : 0,
		context_stability: results.length
			? results.filter((result) => result.context_stable).length / results.length
			: 0,
		policy_stability: results.length
			? results.filter((result) => result.policy_stable).length / results.length
			: 0,
		by_rule: byRule,
		results,
	};
	const rendered = `${JSON.stringify(report, null, 2)}\n`;
	if (output) {
		await Bun.write(output, rendered);
		console.error(`Wrote ${output}`);
	} else process.stdout.write(rendered);
}

if (import.meta.main) {
	main().catch((error: unknown) => {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	});
}
