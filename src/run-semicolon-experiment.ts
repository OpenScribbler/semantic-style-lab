import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import { noul, TypeSafeClient } from '@typesafe-ai/sdk';
import type { NoulQuestion, NoulResponse } from '@typesafe-ai/sdk';

import { classifyMdxOffset, offsetAtLineColumn } from './mdx-source-classifier';
import type { MdxSourceClass } from './mdx-source-classifier';

interface ContextLine {
	line: number;
	text: string;
}

interface InputAlert {
	id: string;
	check: string;
	line: number;
	match: string;
	span: [number, number];
	context: ContextLine[];
	jev_probability: number;
	jev_probabilities: number[];
	vale_jev_action: string;
}

interface Candidate extends InputAlert {
	path: string;
	target_text: string;
	marked_text: string;
	source_class: MdxSourceClass;
}

function argument(name: string, fallback?: string) {
	const index = process.argv.indexOf(name);
	return index >= 0 ? process.argv[index + 1] : fallback;
}

function mean(values: number[]) {
	return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function markFirstSemicolon(text: string) {
	return text.replace(';', '⟦;⟧');
}

export function buildSemicolonRequest(candidates: Candidate[]) {
	const state = {
		project_policy: 'In Syllago prose, report a semicolon only when replacing it with a period, conjunction, colon, or restructuring would materially improve clarity. Semicolons are not categorically forbidden.',
		candidates: candidates.map((candidate) => ({
			path: candidate.path,
			line: candidate.line,
			marked_passage: candidate.marked_text,
			local_context: candidate.context.map((row) => `${row.line} | ${row.text}`),
		})),
	};
	const questions: Record<string, NoulQuestion> = Object.fromEntries(candidates.map((_, index) => [
		`q${index + 1}`,
		noul(
			{
				question: `Would rewriting the marked semicolon in \`candidates[${index}].marked_passage\` materially improve clarity for a technical-documentation reader?`,
				focus: `Judge only the semicolon enclosed in ⟦;⟧. Use the complete passage and local context. A merely possible rewrite is not enough: answer yes only when a period, conjunction, colon, or restructuring would make the relationship easier to understand or the sentence easier to scan. Preserve technical meaning and links.`,
			},
			{
				true: 'The semicolon makes the relationship or sentence structure meaningfully harder to understand, and a concrete rewrite would materially improve clarity.',
				false: 'The semicolon clearly and concisely connects closely related clauses; rewriting it would be neutral, optional, or less clear.',
			},
		),
	]));
	return { model: 'jev-latest', state, questions };
}

async function main() {
	if (!process.env.TYPESAFE_API_KEY?.trim()) throw new Error('TYPESAFE_API_KEY is not set.');
	const input = argument('--input', 'reports/vale-jev-experiment.json')!;
	const output = argument('--output', 'reports/semicolon-experiment.json')!;
	const rawDirectory = argument('--raw-dir', 'reports/semicolon-raw')!;
	const reuseRaw = process.argv.includes('--reuse-raw');
	const runCount = Number(argument('--runs', '5'));
	if (!Number.isInteger(runCount) || runCount < 1) throw new Error('--runs must be a positive integer.');
	const source = await Bun.file(input).json();
	const repo = argument('--repo', source.repo)!;
	const contentPrefix = argument('--content-prefix', 'src/content/docs')!;
	const candidates: Candidate[] = (await Promise.all(source.pages.map(async (page: { path: string; alerts: InputAlert[] }) => {
		const fileSource = await Bun.file(resolve(repo, contentPrefix, page.path)).text();
		return page.alerts.filter((alert) => alert.check === 'Google.Semicolons').map((alert) => {
			const targetText = alert.context.find((row) => row.line === alert.line)?.text ?? '';
			// Vale reports one-based columns in Span; source offsets are zero-based.
			const semicolonOffset = offsetAtLineColumn(fileSource, alert.line, alert.span[0] - 1);
			if (fileSource[semicolonOffset] !== ';') throw new Error(`${page.path}:${alert.line}: Vale span does not point to a semicolon.`);
			return {
				...alert,
				path: page.path,
				target_text: targetText,
				marked_text: markFirstSemicolon(targetText),
				source_class: classifyMdxOffset(fileSource, semicolonOffset),
			};
		});
	}))).flat();
	const prose = candidates.filter((candidate) => candidate.source_class === 'prose');
	const request = buildSemicolonRequest(prose);
	await mkdir(rawDirectory, { recursive: true });
	const runs: { answers: Record<string, NoulResponse>; usage: { input_tokens: number; output_tokens: number }; model: string }[] = [];
	for (let run = 0; run < runCount; run++) {
		const number = String(run + 1).padStart(3, '0');
		const requestPath = `${rawDirectory}/run-${number}.request.json`;
		const responsePath = `${rawDirectory}/run-${number}.response.json`;
		const requestRecord = {
			run: run + 1,
			candidate_ids: prose.map((candidate) => candidate.id),
			request,
		};
		let response;
		if (reuseRaw && await Bun.file(requestPath).exists() && await Bun.file(responsePath).exists()) {
			const savedRequest = await Bun.file(requestPath).json();
			if (JSON.stringify(savedRequest.candidate_ids) !== JSON.stringify(requestRecord.candidate_ids)) throw new Error(`${requestPath} does not match the current prose candidates.`);
			console.error(`Reusing semicolon-specific Jev run ${run + 1}/${runCount}`);
			response = await Bun.file(responsePath).json();
		} else {
			await Bun.write(requestPath, `${JSON.stringify(requestRecord, null, 2)}\n`);
			console.error(`Semicolon-specific Jev run ${run + 1}/${runCount}`);
			response = await new TypeSafeClient().systemOne(request);
			await Bun.write(responsePath, `${JSON.stringify(response, null, 2)}\n`);
		}
		runs.push(response as typeof runs[number]);
	}
	const results = candidates.map((candidate) => {
		if (candidate.source_class !== 'prose') return {
			...candidate,
			deterministic_action: 'exclude_non_prose',
			semicolon_clarity_probabilities: null,
			semicolon_clarity_probability: null,
			semicolon_clarity_range: null,
		};
		const index = prose.indexOf(candidate);
		const probabilities = runs.map((run) => (run.answers[`q${index + 1}`] as NoulResponse).noul);
		return {
			...candidate,
			deterministic_action: 'send_to_semantic_judgment',
			semicolon_clarity_probabilities: probabilities,
			semicolon_clarity_probability: mean(probabilities),
			semicolon_clarity_range: Math.max(...probabilities) - Math.min(...probabilities),
		};
	});
	const usage = {
		input_tokens: runs.reduce((sum, run) => sum + run.usage.input_tokens, 0),
		output_tokens: runs.reduce((sum, run) => sum + run.usage.output_tokens, 0),
	};
	await Bun.write(output, `${JSON.stringify({
		schema_version: 1,
		generated_at: new Date().toISOString(),
		hypothesis: 'Deterministic syntax filtering plus a semicolon-specific Jev clarity judgment improves on both Vale alone and a generic Jev violation judgment.',
		model: runs[0]?.model ?? 'jev-latest',
		run_count: runCount,
		input,
		policy: request.state.project_policy,
		thresholds: null,
		threshold_note: 'No automatic Jev threshold is authorized until the prose judgments receive human labels.',
		counts: {
			vale_candidates: candidates.length,
			deterministic_syntax_exclusions: candidates.length - prose.length,
			exclusions_by_source_class: Object.fromEntries([...new Set(candidates.filter((candidate) => candidate.source_class !== 'prose').map((candidate) => candidate.source_class))].sort().map((sourceClass) => [sourceClass, candidates.filter((candidate) => candidate.source_class === sourceClass).length])),
			prose_candidates: prose.length,
		},
		usage,
		estimated_input_cost_usd: usage.input_tokens / 1_000_000 * 0.042,
		candidates: results,
	}, null, 2)}\n`);
	console.error(`Wrote ${output}: ${candidates.length} candidates; ${candidates.length - prose.length} syntax exclusions; ${prose.length} prose judgments.`);
}

if (import.meta.main) main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
