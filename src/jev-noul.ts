import { noul, TypeSafeClient } from '@typesafe-ai/sdk';
import type { NoulQuestion, NoulResponse } from '@typesafe-ai/sdk';

import { decideStatus } from './jev';
import type { Candidate, Classification, ContextualRule } from './types';

export interface SemanticSignals extends Record<string, number | undefined> {
	literal: number;
	verb_phrase?: number;
	modifies_following_noun: number;
}

const signalId = (candidateId: string, signal: keyof SemanticSignals) =>
	`${candidateId}__${signal}`;

export function followingWord(markedPassage: string) {
	const afterTarget = markedPassage.split('⟧', 2)[1] ?? '';
	return afterTarget.match(/^\s+([\p{L}\p{N}_]+)/u)?.[1] ?? null;
}

export function buildNoulRequest(candidates: Candidate[], rules: ContextualRule[]) {
	const ruleById = new Map(rules.map((rule) => [rule.id, rule]));
	const questions: Record<string, NoulQuestion> = {};
	for (const [index, candidate] of candidates.entries()) {
		const rule = ruleById.get(candidate.ruleId);
		if (!rule) throw new Error(`Unknown rule: ${candidate.ruleId}`);
		const inspect = `candidates[${index}]`;
		questions[signalId(candidate.id, 'literal')] = noul(
			{
				question: `Must the marked occurrence in \`${inspect}.passage\` be preserved exactly because it reproduces literal text?`,
				marked_target: `The target is enclosed in ⟦brackets⟧ and is also available at \`${inspect}.marked_term\`.`,
				focus:
					'Answer about this occurrence only. Literal text includes code, a UI label, a direct quotation, or an official product or feature name. Ordinary prose is not literal.',
			},
			{
				true: 'The marked occurrence reproduces code, UI text, a quotation, or an official name and must keep its source spelling.',
				false: 'The marked occurrence is ordinary prose whose spelling can be governed by the style rule.',
			},
		);
		if (followingWord(candidate.context)) {
			questions[signalId(candidate.id, 'modifies_following_noun')] = noul(
				{
					question: `In \`${inspect}.passage\`, is \`${inspect}.following_word\` a noun that the marked ⟦...⟧ occurrence modifies?`,
					focus:
						'Judge the grammatical role of the explicitly supplied following_word in the full passage. Determine it independently of the marked term\'s current spelling, spacing, capitalization, or hyphenation. Answer no when following_word is a verb, preposition, adverb, or other non-noun.',
				},
				{
					true: 'following_word is a noun, and the marked occurrence acts as its modifier.',
					false: 'following_word is not a noun modified by the marked occurrence.',
				},
			);
		}
		if (rule.id === 'setup') {
			questions[signalId(candidate.id, 'verb_phrase')] = noul(
				{
					question: `Does the marked occurrence in \`${inspect}.passage\` express the action of configuring, installing, arranging, or preparing something?`,
					focus:
						'Determine its grammatical function independently of whether it is currently written set up, setup, or set-up. Answer no when it names a configuration or modifies a following noun.',
				},
				{
					true: 'The marked occurrence functions as a verb phrase expressing an action.',
					false: 'The marked occurrence functions as a noun, modifier, or literal text rather than an action.',
				},
			);
		}
	}
	return {
		model: 'jev-latest',
		state: {
			candidates: candidates.map((candidate) => ({
				marked_term: candidate.match,
				passage: candidate.context,
				following_word: followingWord(candidate.context),
				style_family: candidate.ruleId,
				file: candidate.file,
				line: candidate.line,
			})),
		},
		questions,
	};
}

function support(...probabilities: number[]) {
	return Math.min(...probabilities);
}

export function composeContext(rule: ContextualRule, signals: SemanticSignals) {
	if (signals.literal >= 0.5) {
		return { context: 'literal', probability: signals.literal };
	}
	const nonliteral = 1 - signals.literal;
	const modifier = signals.modifies_following_noun;
	if (rule.id !== 'setup') {
		return modifier >= 0.5
			? { context: 'before_noun', probability: support(nonliteral, modifier) }
			: { context: 'standalone', probability: support(nonliteral, 1 - modifier) };
	}
	const verb = signals.verb_phrase ?? 0;
	if (verb >= 0.5 && modifier >= 0.5) {
		return { context: 'ambiguous', probability: support(nonliteral, verb, modifier) };
	}
	if (verb >= 0.5) {
		return { context: 'verb_phrase', probability: support(nonliteral, verb, 1 - modifier) };
	}
	if (modifier >= 0.5) {
		return { context: 'modifier', probability: support(nonliteral, 1 - verb, modifier) };
	}
	return { context: 'noun', probability: support(nonliteral, 1 - verb, 1 - modifier) };
}

export async function classifyCandidatesWithNoul(candidates: Candidate[], rules: ContextualRule[]) {
	if (candidates.length === 0)
		return { model: 'not-called', usage: { input_tokens: 0, output_tokens: 0 }, results: [] };
	if (!process.env.TYPESAFE_API_KEY?.trim()) throw new Error('TYPESAFE_API_KEY is not set.');
	const request = buildNoulRequest(candidates, rules);
	const response = await new TypeSafeClient().systemOne(request);
	const ruleById = new Map(rules.map((rule) => [rule.id, rule]));
	const read = (id: string) => (response.answers[id] as NoulResponse).noul;
	const results: Classification[] = candidates.map((candidate) => {
		const rule = ruleById.get(candidate.ruleId)!;
		const signals: SemanticSignals = {
			literal: read(signalId(candidate.id, 'literal')),
			modifies_following_noun: followingWord(candidate.context)
				? read(signalId(candidate.id, 'modifies_following_noun'))
				: 0,
			...(rule.id === 'setup'
				? { verb_phrase: read(signalId(candidate.id, 'verb_phrase')) }
				: {}),
		};
		const composed = composeContext(rule, signals);
		return {
			candidate,
			choice: composed.context,
			confidence: null,
			probability: composed.probability,
			strategy: 'noul',
			signals,
			...decideStatus(candidate, rule, composed.context, composed.probability),
			model: response.model,
		};
	});
	return { model: response.model, usage: response.usage, results };
}
