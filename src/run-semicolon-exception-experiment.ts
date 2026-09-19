import { mkdir } from 'node:fs/promises';

import { noul, TypeSafeClient } from '@typesafe-ai/sdk';
import type { NoulQuestion, NoulResponse } from '@typesafe-ai/sdk';

interface SemanticException {
	id: string;
	instructions: string;
	true_criteria: string;
	false_criteria: string;
}

interface CompiledRule {
	id: string;
	source: { default: string; url: string };
	semantic_exceptions: SemanticException[];
	composition: {
		suppress_if_any_exception_at_or_above: number;
		review_if_any_exception_at_or_above: number;
		otherwise: 'flag';
	};
	prompt_examples: unknown[];
}

interface BenchmarkCase {
	id: string;
	origin: string;
	passage?: string;
	expected: 'violation' | 'acceptable';
	expected_exception: string | null;
}

interface Candidate extends BenchmarkCase {
	passage: string;
	marked_passage: string;
	left: string;
	right: string;
}

function argument(name: string, fallback?: string) {
	const index = process.argv.indexOf(name);
	return index >= 0 ? process.argv[index + 1] : fallback;
}

function splitCandidate(candidate: BenchmarkCase, passage: string): Candidate {
	const index = passage.indexOf(';');
	if (index < 0) throw new Error(`${candidate.id} has no semicolon.`);
	return {
		...candidate,
		passage,
		marked_passage: `${passage.slice(0, index)}⟦;⟧${passage.slice(index + 1)}`,
		left: passage.slice(0, index).trim(),
		right: passage.slice(index + 1).trim(),
	};
}

export function composeExceptionAction(maxProbability: number, rule: CompiledRule) {
	if (maxProbability >= rule.composition.suppress_if_any_exception_at_or_above) return 'suppress' as const;
	if (maxProbability >= rule.composition.review_if_any_exception_at_or_above) return 'review' as const;
	return rule.composition.otherwise;
}

export function buildExceptionRequest(candidates: Candidate[], rule: CompiledRule) {
	const questions: Record<string, NoulQuestion> = {};
	for (const [candidateIndex] of candidates.entries()) for (const semanticException of rule.semantic_exceptions) {
		questions[`c${candidateIndex + 1}__${semanticException.id}`] = noul(
			{
				question: semanticException.instructions,
				inspect: `candidates[${candidateIndex}]`,
				focus: 'Judge only the semicolon enclosed in ⟦;⟧. Use the complete passage plus the explicitly separated left and right text. Evaluate this exception independently of the other exceptions.',
			},
			{ true: semanticException.true_criteria, false: semanticException.false_criteria },
		);
	}
	return {
		model: 'jev-latest',
		state: {
			rule_default: rule.source.default,
			rule_source: rule.source.url,
			prompt_examples: rule.prompt_examples as string[],
			candidates: candidates.map((candidate) => ({
				marked_passage: candidate.marked_passage,
				left_of_semicolon: candidate.left,
				right_of_semicolon: candidate.right,
			})),
		},
		questions,
	};
}

function mean(values: number[]) {
	return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function classificationMetrics(results: { expected: string; action: string }[]) {
	const violations = results.filter((result) => result.expected === 'violation');
	const acceptable = results.filter((result) => result.expected === 'acceptable');
	return {
		violations: violations.length,
		acceptable: acceptable.length,
		unsafe_suppressions: violations.filter((result) => result.action === 'suppress').length,
		true_finding_retention: violations.filter((result) => result.action !== 'suppress').length / violations.length,
		acceptable_auto_suppressed: acceptable.filter((result) => result.action === 'suppress').length,
		acceptable_sent_to_review: acceptable.filter((result) => result.action === 'review').length,
		acceptable_incorrectly_flagged: acceptable.filter((result) => result.action === 'flag').length,
		automatic_correct: results.filter((result) => (result.expected === 'violation' && result.action === 'flag') || (result.expected === 'acceptable' && result.action === 'suppress')).length,
		reviewed: results.filter((result) => result.action === 'review').length,
	};
}

async function main() {
	if (!process.env.TYPESAFE_API_KEY?.trim()) throw new Error('TYPESAFE_API_KEY is not set.');
	const rulePath = argument('--rule', 'compiled-rules/google-semicolons.json')!;
	const benchmarkPath = argument('--benchmark', 'experiments/semicolon-exception-benchmark.json')!;
	const sourcePath = argument('--source', 'reports/semicolon-experiment.json')!;
	const output = argument('--output', 'reports/semicolon-exception-experiment.json')!;
	const rawDirectory = argument('--raw-dir', 'reports/semicolon-exceptions-raw')!;
	const runCount = Number(argument('--runs', '5'));
	const rule = await Bun.file(rulePath).json() as CompiledRule;
	const benchmark = await Bun.file(benchmarkPath).json() as { cases: BenchmarkCase[] };
	const source = await Bun.file(sourcePath).json();
	const candidates = benchmark.cases.map((item) => {
		const passage = item.passage ?? source.candidates.find((candidate: { id: string }) => candidate.id === item.id)?.target_text;
		if (!passage) throw new Error(`No passage found for ${item.id}`);
		return splitCandidate(item, passage);
	});
	const request = buildExceptionRequest(candidates, rule);
	await mkdir(rawDirectory, { recursive: true });
	const runs: { model: string; answers: Record<string, NoulResponse>; usage: { input_tokens: number; output_tokens: number } }[] = [];
	for (let run = 0; run < runCount; run++) {
		const number = String(run + 1).padStart(3, '0');
		const requestRecord = { run: run + 1, rule: rulePath, benchmark: benchmarkPath, candidate_ids: candidates.map((candidate) => candidate.id), request };
		await Bun.write(`${rawDirectory}/run-${number}.request.json`, `${JSON.stringify(requestRecord, null, 2)}\n`);
		console.error(`Semicolon exception Jev run ${run + 1}/${runCount}`);
		const response = await new TypeSafeClient().systemOne(request);
		await Bun.write(`${rawDirectory}/run-${number}.response.json`, `${JSON.stringify(response, null, 2)}\n`);
		runs.push(response as typeof runs[number]);
	}
	const results = candidates.map((candidate, candidateIndex) => {
		const exceptions = Object.fromEntries(rule.semantic_exceptions.map((semanticException) => {
			const probabilities = runs.map((run) => run.answers[`c${candidateIndex + 1}__${semanticException.id}`]!.noul);
			return [semanticException.id, { probability: mean(probabilities), probabilities, range: Math.max(...probabilities) - Math.min(...probabilities) }];
		}));
		const maxExceptionProbability = Math.max(...Object.values(exceptions).map((value) => value.probability));
		return {
			...candidate,
			exceptions,
			max_exception_probability: maxExceptionProbability,
			action: composeExceptionAction(maxExceptionProbability, rule),
		};
	});
	const usage = {
		input_tokens: runs.reduce((sum, run) => sum + run.usage.input_tokens, 0),
		output_tokens: runs.reduce((sum, run) => sum + run.usage.output_tokens, 0),
	};
	const report = {
		schema_version: 1,
		generated_at: new Date().toISOString(),
		model: runs[0]?.model ?? 'jev-latest',
		run_count: runCount,
		rule: rulePath,
		benchmark: benchmarkPath,
		prompt_example_count: rule.prompt_examples.length,
		composition: rule.composition,
		usage,
		estimated_input_cost_usd: usage.input_tokens / 1_000_000 * 0.042,
		metrics: classificationMetrics(results),
		results,
	};
	await Bun.write(output, `${JSON.stringify(report, null, 2)}\n`);
	console.error(`Wrote ${output}: ${report.metrics.unsafe_suppressions} unsafe suppressions; ${report.metrics.acceptable_auto_suppressed}/${report.metrics.acceptable} acceptable cases auto-suppressed.`);
}

if (import.meta.main) main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
