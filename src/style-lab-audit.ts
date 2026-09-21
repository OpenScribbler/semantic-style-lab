import { mkdir } from 'node:fs/promises';
import { extname, relative, resolve } from 'node:path';

import { noul, TypeSafeClient } from '@typesafe-ai/sdk';
import type { NoulQuestion, NoulResponse } from '@typesafe-ai/sdk';

import { decideStatus } from './jev';
import { composeContext, followingWordForModifier } from './jev-noul';
import { createSourceClassifier, offsetAtLineColumn } from './mdx-source-classifier';
import type { MarkdownFormat, MdxSourceClass, SourceParser } from './mdx-source-classifier';
import { loadRules } from './rules';
import type { Candidate as VocabularyCandidate, ContextualRule, ValeAlert } from './types';

export type AuditAction = 'flag' | 'review' | 'suppress' | 'unparsed';

interface ExtendedValeAlert extends ValeAlert {
	Action?: { Name?: string; Params?: string[] | null };
	Description?: string;
	Link?: string;
}

interface SemanticException {
	id: string;
	instructions: string;
	true_criteria: string;
	false_criteria: string;
}

interface SemicolonRule {
	id: string;
	source: { default: string; url: string };
	semantic_exceptions: SemanticException[];
}

export interface StaticCandidate {
	id: string;
	project: string;
	file: string;
	absolute_file: string;
	line: number;
	span: [number, number];
	check: string;
	rule_id: string;
	rule_kind: 'contextual-vocabulary' | 'semicolon' | 'passive-hidden-actor';
	match: string;
	message: string;
	link?: string;
	context: string;
	marked_context: string;
	source_class: MdxSourceClass;
	source_parser: SourceParser;
}

export interface SourceHealth {
	file: string;
	format: MarkdownFormat;
	parser: SourceParser;
	degraded: boolean;
	parse_error?: string;
	candidate_count: number;
}

export interface ParseHealthSummary {
	files_total: number;
	ast_parsed_files: number;
	fallback_files: number;
	unparsed_files: number;
	fallback_candidates: number;
	unparsed_candidates: number;
}

export interface AuditFinding extends Omit<StaticCandidate, 'absolute_file'> {
	action: AuditAction;
	reason: string;
	expected_form?: string | null;
	signals: Record<string, number>;
}

export interface RawExchange {
	request: unknown;
	response: unknown;
	candidate_ids: string[];
}

export interface ProjectAudit {
	name: string;
	root: string;
	files: string[];
	vale_alert_count: number;
	candidate_count: number;
	jev_call_count: number;
	jev_candidate_count: number;
	usage: { input_tokens: number; output_tokens: number };
	findings: AuditFinding[];
	raw_exchanges: RawExchange[];
	raw_vale: Record<string, ExtendedValeAlert[]>;
	source_health: SourceHealth[];
	parse_health: ParseHealthSummary;
}

const checkKinds = new Map<string, Pick<StaticCandidate, 'rule_id' | 'rule_kind'>>([
	['Lab.ContextualCommandLine', { rule_id: 'command-line', rule_kind: 'contextual-vocabulary' }],
	['Lab.ContextualRealTime', { rule_id: 'real-time', rule_kind: 'contextual-vocabulary' }],
	['Lab.ContextualSetup', { rule_id: 'setup', rule_kind: 'contextual-vocabulary' }],
	['Lab.Semicolons', { rule_id: 'google-semicolons', rule_kind: 'semicolon' }],
	['Lab.PassiveHiddenActor', { rule_id: 'google-passive-hidden-actor', rule_kind: 'passive-hidden-actor' }],
]);

const labRoot = resolve(import.meta.dir, '..');
const valeConfig = resolve(labRoot, '.vale.ini');

function chunks<T>(items: T[], size: number) {
	const result: T[][] = [];
	for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
	return result;
}

export async function runStaticVale(root: string, files: string[]) {
	const combined: Record<string, ExtendedValeAlert[]> = {};
	for (const batch of chunks(files, 200)) {
		const child = Bun.spawn(['vale', `--config=${valeConfig}`, '--output=JSON', ...batch], {
			cwd: root,
			stdout: 'pipe',
			stderr: 'pipe',
		});
		const [stdout, stderr, exitCode] = await Promise.all([
			new Response(child.stdout).text(),
			new Response(child.stderr).text(),
			child.exited,
		]);
		if (![0, 1].includes(exitCode)) throw new Error(`Vale exited ${exitCode}: ${stderr.trim()}`);
		const parsed = JSON.parse(stdout || '{}') as Record<string, ExtendedValeAlert[]>;
		for (const [file, alerts] of Object.entries(parsed)) combined[resolve(root, file)] = alerts;
	}
	return combined;
}

function contextAt(source: string, line: number, span: [number, number]) {
	const lines = source.split(/\r?\n/);
	const target = lines[line - 1] ?? '';
	const start = Math.max(0, span[0] - 1);
	const end = Math.max(start, span[1]);
	const marked = `${target.slice(0, start)}⟦${target.slice(start, end)}⟧${target.slice(end)}`;
	const first = Math.max(0, line - 2);
	const last = Math.min(lines.length, line + 1);
	return {
		context: lines.slice(first, last).join('\n').trim(),
		marked: lines.slice(first, last).map((value, index) => first + index === line - 1 ? marked : value).join('\n').trim(),
	};
}

function markdownFormat(path: string): MarkdownFormat {
	return extname(path).toLocaleLowerCase() === '.mdx' ? 'mdx' : 'markdown';
}

export function summarizeParseHealth(sourceHealth: SourceHealth[]): ParseHealthSummary {
	return {
		files_total: sourceHealth.length,
		ast_parsed_files: sourceHealth.filter((item) => item.parser === 'markdown_ast' || item.parser === 'mdx_ast').length,
		fallback_files: sourceHealth.filter((item) => item.parser === 'lexical_fallback').length,
		unparsed_files: sourceHealth.filter((item) => item.parser === 'unparsed').length,
		fallback_candidates: sourceHealth.filter((item) => item.parser === 'lexical_fallback').reduce((sum, item) => sum + item.candidate_count, 0),
		unparsed_candidates: sourceHealth.filter((item) => item.parser === 'unparsed').reduce((sum, item) => sum + item.candidate_count, 0),
	};
}

export async function buildStaticCandidates(project: string, root: string, vale: Record<string, ExtendedValeAlert[]>, files = Object.keys(vale)) {
	const candidates: StaticCandidate[] = [];
	const sourceHealth: SourceHealth[] = [];
	for (const absoluteFile of [...files].map((file) => resolve(root, file)).sort()) {
		const alerts = vale[absoluteFile] ?? [];
		const source = await Bun.file(absoluteFile).text();
		const classifier = createSourceClassifier(source, markdownFormat(absoluteFile));
		const local = relative(root, absoluteFile).replaceAll('\\', '/');
		const relevantAlerts = alerts.filter((alert) => checkKinds.has(alert.Check));
		sourceHealth.push({
			file: local,
			format: classifier.format,
			parser: classifier.parser,
			degraded: classifier.degraded,
			...(classifier.parse_error ? { parse_error: classifier.parse_error } : {}),
			candidate_count: relevantAlerts.length,
		});
		for (const alert of relevantAlerts) {
			const kind = checkKinds.get(alert.Check);
			if (!kind) continue;
			const offset = offsetAtLineColumn(source, alert.Line, alert.Span[0] - 1);
			const context = contextAt(source, alert.Line, alert.Span);
			candidates.push({
				id: `${project}:${local}:${alert.Line}:${alert.Check}:${alert.Span[0]}`,
				project,
				file: local,
				absolute_file: absoluteFile,
				line: alert.Line,
				span: alert.Span,
				check: alert.Check,
				...kind,
				match: alert.Match,
				message: alert.Message,
				...(alert.Link ? { link: alert.Link } : {}),
				context: context.context,
				marked_context: context.marked,
				source_class: classifier.classify(offset),
				source_parser: classifier.parser,
			});
		}
	}
	return { candidates, source_health: sourceHealth, parse_health: summarizeParseHealth(sourceHealth) };
}

function questionCount(candidate: StaticCandidate) {
	if (candidate.rule_kind === 'semicolon') return 3;
	if (candidate.rule_kind === 'passive-hidden-actor') return 1;
	return candidate.rule_id === 'setup' ? 3 : 2;
}

export function batchForQuestionLimit(candidates: StaticCandidate[], limit: number) {
	const batches: StaticCandidate[][] = [];
	let current: StaticCandidate[] = [];
	let count = 0;
	for (const candidate of candidates) {
		const needed = questionCount(candidate);
		if (needed > limit) throw new Error(`${candidate.id} requires ${needed} questions, above the configured limit ${limit}.`);
		if (current.length && count + needed > limit) {
			batches.push(current);
			current = [];
			count = 0;
		}
		current.push(candidate);
		count += needed;
	}
	if (current.length) batches.push(current);
	return batches;
}

function addVocabularyQuestions(questions: Record<string, NoulQuestion>, key: string, index: number, candidate: StaticCandidate) {
	const inspect = `candidates[${index}]`;
	questions[`${key}__literal`] = noul(
		{
			question: `Must the marked occurrence in \`${inspect}.marked_context\` be preserved exactly because it reproduces literal text?`,
			focus: 'Literal text includes code, a UI label, a direct quotation, or an official product or feature name. Ordinary prose is not literal.',
		},
		{ true: 'The marked occurrence reproduces literal source text or an official name.', false: 'The occurrence is ordinary prose governed by the style rule.' },
	);
	questions[`${key}__modifier`] = noul(
		{
			question: `In \`${inspect}.marked_context\`, does the marked occurrence modify a noun that immediately follows it?`,
			focus: 'Judge grammatical function independently of the current spelling or punctuation. A noun used as the object of “set up” does not count as a noun modified by the target.',
		},
		{ true: 'The marked occurrence acts as a modifier for the following noun.', false: 'It is standalone, a verb phrase, literal text, or does not modify the following noun.' },
	);
	if (candidate.rule_id === 'setup') questions[`${key}__verb`] = noul(
		{
			question: `Does the marked occurrence in \`${inspect}.marked_context\` express the action of configuring, installing, arranging, or preparing something?`,
			focus: 'Judge its grammatical function independently of whether it is written set up, setup, or set-up.',
		},
		{ true: 'It functions as a verb phrase expressing an action.', false: 'It functions as a noun, modifier, or literal text.' },
	);
}

function addSemicolonQuestions(questions: Record<string, NoulQuestion>, key: string, index: number, exceptions: SemanticException[]) {
	for (const exception of exceptions) questions[`${key}__${exception.id}`] = noul(
		{
			question: exception.instructions,
			inspect: `candidates[${index}]`,
			focus: 'Judge only the semicolon enclosed in ⟦;⟧. Evaluate this exception independently of the other exceptions.',
		},
		{ true: exception.true_criteria, false: exception.false_criteria },
	);
}

function addPassiveQuestion(questions: Record<string, NoulQuestion>, key: string, index: number) {
	questions[`${key}__hidden_actor`] = noul(
		{
			question: `Does the marked passive construction in \`candidates[${index}].marked_context\` hide an actor or responsibility that the reader needs in order to act, configure the system, understand a requirement, or troubleshoot?`,
			focus: 'Judge the reported construction only. Passive voice is not automatically a violation. Do not require an actor when it is unknown, irrelevant, obvious, intentionally generalized, or when the sentence appropriately emphasizes the object or result.',
		},
		{
			true: 'Naming who or what performs the action would give the reader operationally important responsibility or troubleshooting information.',
			false: 'The actor is irrelevant, obvious, unknown, deliberately generalized, already clear from context, or unnecessary for the reader’s task.',
		},
	);
}

export function buildStaticJevRequest(candidates: StaticCandidate[], model: string, semicolonRule: SemicolonRule) {
	const questions: Record<string, NoulQuestion> = {};
	for (const [index, candidate] of candidates.entries()) {
		const key = `c${index + 1}`;
		if (candidate.rule_kind === 'contextual-vocabulary') addVocabularyQuestions(questions, key, index, candidate);
		else if (candidate.rule_kind === 'semicolon') addSemicolonQuestions(questions, key, index, semicolonRule.semantic_exceptions);
		else addPassiveQuestion(questions, key, index);
	}
	return {
		model,
		state: {
			rule_defaults: { semicolons: semicolonRule.source.default, passive_voice: 'Flag only when passive voice hides useful responsibility.' },
			candidates: candidates.map((candidate) => ({
				file: candidate.file,
				line: candidate.line,
				rule_id: candidate.rule_id,
				matched_text: candidate.match,
				marked_context: candidate.marked_context,
				following_word: followingWordForModifier(candidate.marked_context),
			})),
		},
		questions,
	};
}

function readNoul(response: { answers: Record<string, unknown> }, id: string) {
	const answer = response.answers[id] as NoulResponse | undefined;
	if (!answer || typeof answer.noul !== 'number') throw new Error(`Jev response is missing Noul answer ${id}.`);
	return answer.noul;
}

function stripPrivate(candidate: StaticCandidate) {
	const { absolute_file: _absoluteFile, ...publicCandidate } = candidate;
	return publicCandidate;
}

function composeVocabulary(candidate: StaticCandidate, key: string, response: { answers: Record<string, unknown> }, rules: ContextualRule[]): AuditFinding {
	const rule = rules.find((item) => item.id === candidate.rule_id);
	if (!rule) throw new Error(`Missing contextual rule ${candidate.rule_id}.`);
	const signals = {
		literal: readNoul(response, `${key}__literal`),
		modifies_following_noun: readNoul(response, `${key}__modifier`),
		...(candidate.rule_id === 'setup' ? { verb_phrase: readNoul(response, `${key}__verb`) } : {}),
	};
	const composed = composeContext(rule, signals);
	const vocabularyCandidate: VocabularyCandidate = {
		id: candidate.id,
		file: candidate.file,
		line: candidate.line,
		span: candidate.span,
		match: candidate.match,
		context: candidate.marked_context,
		ruleId: candidate.rule_id,
	};
	const decision = decideStatus(vocabularyCandidate, rule, composed.context, composed.probability);
	const action: AuditAction = decision.status === 'flag' ? 'flag' : decision.status === 'review' || decision.status === 'uncertain' ? 'review' : 'suppress';
	return {
		...stripPrivate(candidate), action,
		reason: `${composed.context} context (${composed.probability.toFixed(3)}); ${decision.status}`,
		expected_form: decision.expectedForm,
		signals: Object.fromEntries(Object.entries(signals).filter((entry): entry is [string, number] => typeof entry[1] === 'number')),
	};
}

function composeSemicolon(candidate: StaticCandidate, key: string, response: { answers: Record<string, unknown> }, exceptions: SemanticException[]): AuditFinding {
	const signals = Object.fromEntries(exceptions.map((exception) => [exception.id, readNoul(response, `${key}__${exception.id}`)]));
	const autoExceptions = ['complex_series', 'conjunctive_connector'];
	const suppressing = autoExceptions.find((id) => (signals[id] ?? 0) >= 0.75);
	const reviewing = Object.entries(signals).find(([, probability]) => probability >= 0.4)?.[0];
	const action: AuditAction = suppressing ? 'suppress' : reviewing ? 'review' : 'flag';
	const reason = suppressing
		? `Strongly supported ${suppressing} exception.`
		: reviewing
			? `${reviewing} may apply; human review required.`
			: 'No Google semicolon exception reached the review threshold.';
	return { ...stripPrivate(candidate), action, reason, signals };
}

function composePassive(candidate: StaticCandidate, key: string, response: { answers: Record<string, unknown> }): AuditFinding {
	const probability = readNoul(response, `${key}__hidden_actor`);
	const action: AuditAction = probability >= 0.75 ? 'flag' : probability <= 0.25 ? 'suppress' : 'review';
	const reason = action === 'flag'
		? 'The passive construction likely hides responsibility the reader needs.'
		: action === 'suppress'
			? 'The omitted actor is likely unnecessary in this context.'
			: 'Whether the omitted actor matters is uncertain.';
	return { ...stripPrivate(candidate), action, reason, signals: { hidden_actor: probability } };
}

function deterministicFinding(candidate: StaticCandidate): AuditFinding | null {
	if (candidate.source_class === 'prose') return null;
	if (candidate.source_class === 'unparsed_source') return {
		...stripPrivate(candidate), action: 'unparsed', reason: 'The source could not be classified. No Jev judgment was made.', signals: {},
	};
	return {
		...stripPrivate(candidate), action: 'suppress', reason: `Deterministically excluded ${candidate.source_class}.`, signals: {},
	};
}

export async function auditProject(options: {
	name: string;
	root: string;
	files: string[];
	model: string;
	batchQuestionLimit: number;
	noJev?: boolean;
	rawDirectory?: string;
}) : Promise<ProjectAudit> {
	const vale = await runStaticVale(options.root, options.files);
	if (options.rawDirectory) {
		await mkdir(options.rawDirectory, { recursive: true });
		await Bun.write(resolve(options.rawDirectory, 'vale.json'), `${JSON.stringify(vale, null, 2)}\n`);
	}
	const built = await buildStaticCandidates(options.name, options.root, vale, options.files);
	const { candidates } = built;
	if (options.rawDirectory) await Bun.write(
		resolve(options.rawDirectory, 'source-health.json'),
		`${JSON.stringify({ summary: built.parse_health, files: built.source_health }, null, 2)}\n`,
	);
	const deterministic = candidates.map(deterministicFinding).filter((item): item is AuditFinding => Boolean(item));
	const semantic = candidates.filter((candidate) => candidate.source_class === 'prose');
	if (options.noJev) {
		return {
			name: options.name, root: options.root, files: options.files.map((file) => relative(options.root, file).replaceAll('\\', '/')),
			vale_alert_count: candidates.length, candidate_count: candidates.length,
			jev_call_count: 0, jev_candidate_count: 0,
			usage: { input_tokens: 0, output_tokens: 0 }, raw_exchanges: [],
			raw_vale: vale,
			source_health: built.source_health,
			parse_health: built.parse_health,
			findings: [...deterministic, ...semantic.map((candidate): AuditFinding => ({
				...stripPrivate(candidate), action: 'review', reason: 'Jev was disabled; semantic classification was not attempted.', signals: {},
			}))],
		};
	}
	if (semantic.length && !process.env.TYPESAFE_API_KEY?.trim()) throw new Error('TYPESAFE_API_KEY is not set. Use --no-jev to enumerate candidates without calling Jev.');
	const contextualRules = await loadRules(resolve(labRoot, 'rules/contextual-vocabulary'));
	const semicolonRule = await Bun.file(resolve(labRoot, 'compiled-rules/google-semicolons.json')).json() as SemicolonRule;
	const findings = [...deterministic];
	const rawExchanges: RawExchange[] = [];
	let inputTokens = 0;
	let outputTokens = 0;
	for (const [batchIndex, batch] of batchForQuestionLimit(semantic, options.batchQuestionLimit).entries()) {
		const request = buildStaticJevRequest(batch, options.model, semicolonRule);
		const exchangeNumber = String(batchIndex + 1).padStart(3, '0');
		if (options.rawDirectory) await Bun.write(
			resolve(options.rawDirectory, `jev-${exchangeNumber}.request.json`),
			`${JSON.stringify({ candidate_ids: batch.map((candidate) => candidate.id), request }, null, 2)}\n`,
		);
		const response = await new TypeSafeClient().systemOne(request);
		if (options.rawDirectory) await Bun.write(
			resolve(options.rawDirectory, `jev-${exchangeNumber}.response.json`),
			`${JSON.stringify(response, null, 2)}\n`,
		);
		inputTokens += response.usage.input_tokens;
		outputTokens += response.usage.output_tokens;
		rawExchanges.push({ request, response, candidate_ids: batch.map((candidate) => candidate.id) });
		for (const [index, candidate] of batch.entries()) {
			const key = `c${index + 1}`;
			if (candidate.rule_kind === 'contextual-vocabulary') findings.push(composeVocabulary(candidate, key, response, contextualRules));
			else if (candidate.rule_kind === 'semicolon') findings.push(composeSemicolon(candidate, key, response, semicolonRule.semantic_exceptions));
			else findings.push(composePassive(candidate, key, response));
		}
	}
	return {
		name: options.name,
		root: options.root,
		files: options.files.map((file) => relative(options.root, file).replaceAll('\\', '/')),
		vale_alert_count: candidates.length,
		candidate_count: candidates.length,
		jev_call_count: rawExchanges.length,
		jev_candidate_count: semantic.length,
		usage: { input_tokens: inputTokens, output_tokens: outputTokens },
		findings: findings.sort((left, right) => left.file.localeCompare(right.file) || left.line - right.line),
		raw_exchanges: rawExchanges,
		raw_vale: vale,
		source_health: built.source_health,
		parse_health: built.parse_health,
	};
}

export const STATIC_RULES = [
	'contextual-vocabulary: command-line',
	'contextual-vocabulary: real-time',
	'contextual-vocabulary: setup',
	'google-semicolons',
	'google-passive-hidden-actor',
] as const;

export const STATIC_RULE_SET_VERSION = 'google-research-v1';
export const PIPELINE_VERSION = 'style-lab-v2';
