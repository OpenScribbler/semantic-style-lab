import { noul, TypeSafeClient } from '@typesafe-ai/sdk';
import type { NoulQuestion, NoulResponse } from '@typesafe-ai/sdk';

import { extractProseBlocks } from './semantic-blocks';

interface SemanticRule {
	id: string;
	label: string;
	source_url: string;
	summary: string;
	candidate: { patterns?: string[]; block_types?: string[]; match_all?: boolean };
	question: string;
	true_criteria: string;
	false_criteria: string;
	review_at: number;
	flag_at: number;
	requires_procedure?: boolean;
}

interface Candidate {
	id: string;
	rule: SemanticRule;
	block: ReturnType<typeof extractProseBlocks>[number];
	markedText: string;
}

function candidatesFor(source: string, rules: SemanticRule[]) {
	const blocks = extractProseBlocks(source);
	const candidates: Candidate[] = [];
	for (const block of blocks) {
		for (const rule of rules) {
			if (rule.candidate.block_types && !rule.candidate.block_types.includes(block.type)) continue;
			let markedText = block.text;
			if (!rule.candidate.match_all) {
				const match = rule.candidate.patterns
					?.map((pattern) => block.text.match(new RegExp(pattern, 'i')))
					.find(Boolean);
				if (!match?.[0]) continue;
				markedText = block.text.replace(match[0], `⟦${match[0]}⟧`);
			}
			candidates.push({ id: `q${candidates.length + 1}`, rule, block, markedText });
		}
	}
	return { blocks, candidates };
}

async function auditPage(path: string, source: string, rules: SemanticRule[]) {
	const { blocks, candidates } = candidatesFor(source, rules);
	if (candidates.length === 0)
		return { path, block_count: blocks.length, candidate_count: 0, question_count: 0, usage: { input_tokens: 0, output_tokens: 0 }, findings: [], evaluations: [] };
	if (candidates.length > 255) throw new Error(`${path}: ${candidates.length} questions exceeds the API limit`);
	const questions: Record<string, NoulQuestion> = Object.fromEntries(
		candidates.flatMap((candidate, index) => {
			const entries: [string, NoulQuestion][] = [[
				candidate.id,
				noul(
				{
					question: candidate.rule.question,
					inspect: `candidates[${index}]`,
					policy: candidate.rule.summary,
					focus: 'Evaluate target_text. Use section_heading and previous_text only to resolve its local meaning. Treat product names, code placeholders, UI labels, examples, and quoted source text as literal when applicable.',
				},
				{ true: candidate.rule.true_criteria, false: candidate.rule.false_criteria },
			),
			]];
			if (candidate.rule.requires_procedure) {
				entries.push([
					`${candidate.id}__is_procedure`,
					noul(
						{
							question: 'Is target_text a procedural instruction that tells the reader to perform an action?',
							inspect: `candidates[${index}]`,
							policy: 'Procedure rules apply only to actual instructions, not every numbered list.',
							focus: 'Use the section heading and preceding text to distinguish a task step from a conceptual list, navigation choice, consequence, state, criterion, or decision-table row.',
						},
						{
							true: 'The item directs the reader to take a concrete action as part of a task.',
							false: 'The item explains, categorizes, summarizes, navigates, states a consequence, or describes a decision without directing an action.',
						},
					),
				]);
			}
			return entries;
		}),
	);
	if (Object.keys(questions).length > 255) throw new Error(`${path}: ${Object.keys(questions).length} questions exceeds the API limit`);
	const response = await new TypeSafeClient().systemOne({
		model: 'jev-latest',
		state: {
			page: path,
			candidates: candidates.map((candidate) => ({
				rule_id: candidate.rule.id,
				block_type: candidate.block.type,
				line: candidate.block.line,
				target_text: candidate.markedText,
				section_heading: candidate.block.sectionHeading ?? null,
				previous_text: candidate.block.previousText ?? null,
			})),
		},
		questions,
	});
	const evaluations = candidates.map((candidate) => {
		const rawProbability = (response.answers[candidate.id] as NoulResponse).noul;
		const procedureProbability = candidate.rule.requires_procedure
			? (response.answers[`${candidate.id}__is_procedure`] as NoulResponse).noul
			: undefined;
		const probability = procedureProbability === undefined
			? rawProbability
			: Math.min(rawProbability, procedureProbability);
		const status =
			probability >= candidate.rule.flag_at
				? 'flag'
				: probability >= candidate.rule.review_at
					? 'review'
					: 'pass';
		return {
			rule_id: candidate.rule.id,
			rule_label: candidate.rule.label,
			source_url: candidate.rule.source_url,
			line: candidate.block.line,
			block_type: candidate.block.type,
			text: candidate.block.text,
			marked_text: candidate.markedText,
			section_heading: candidate.block.sectionHeading,
			previous_text: candidate.block.previousText,
			probability,
			raw_probability: rawProbability,
			procedure_probability: procedureProbability,
			status,
		};
	});
	return {
		path,
		block_count: blocks.length,
		candidate_count: candidates.length,
		question_count: Object.keys(questions).length,
		usage: response.usage,
		findings: evaluations.filter((evaluation) => evaluation.status !== 'pass'),
		evaluations,
	};
}

async function main() {
	if (!process.env.TYPESAFE_API_KEY?.trim()) throw new Error('TYPESAFE_API_KEY is not set.');
	const rootIndex = process.argv.indexOf('--root');
	const root = rootIndex >= 0 ? process.argv[rootIndex + 1] : undefined;
	const pagesIndex = process.argv.indexOf('--pages');
	const pagesPath = pagesIndex >= 0 ? process.argv[pagesIndex + 1] : 'experiments/syllago-pages.json';
	const outputIndex = process.argv.indexOf('--output');
	const output = outputIndex >= 0 ? process.argv[outputIndex + 1] : undefined;
	if (!root) throw new Error('--root requires the documentation content root');
	if (!output) throw new Error('--output requires a report path');
	const paths = (await Bun.file(pagesPath).json()) as string[];
	const rules = (await Bun.file('google-guide/semantic-rules.json').json()) as SemanticRule[];
	const pages = await Promise.all(
		paths.map(async (path) => auditPage(path, await Bun.file(`${root}/${path}`).text(), rules)),
	);
	const report = {
		generated_at: new Date().toISOString(),
		model: 'jev-latest',
		strategy_version: 'google-semantic-v2',
		root,
		page_count: pages.length,
		rule_count: rules.length,
		candidate_count: pages.reduce((total, page) => total + page.candidate_count, 0),
		question_count: pages.reduce((total, page) => total + page.question_count, 0),
		finding_count: pages.reduce((total, page) => total + page.findings.length, 0),
		usage: {
			input_tokens: pages.reduce((total, page) => total + page.usage.input_tokens, 0),
			output_tokens: pages.reduce((total, page) => total + page.usage.output_tokens, 0),
		},
		by_rule: Object.fromEntries(
			rules.map((rule) => [
				rule.id,
				{
					candidates: pages.flatMap((page) => page.evaluations).filter((item) => item.rule_id === rule.id).length,
					findings: pages.flatMap((page) => page.findings).filter((item) => item.rule_id === rule.id).length,
				},
			]),
		),
		pages,
	};
	await Bun.write(output, `${JSON.stringify(report, null, 2)}\n`);
	console.error(`Wrote ${output}: ${report.candidate_count} candidates, ${report.finding_count} findings.`);
}

if (import.meta.main) main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
