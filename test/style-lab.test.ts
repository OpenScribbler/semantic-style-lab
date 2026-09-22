import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, describe, expect, test } from 'vitest';

import { auditProject, batchForQuestionLimit, buildStaticCandidates, buildStaticJevRequest, composePassive, composeVocabulary, runStaticVale, selectRuleStratifiedFiles } from '../src/style-lab-audit';
import type { StaticCandidate } from '../src/style-lab-audit';
import { loadRules } from '../src/rules';
import { discoverProjectFiles, loadStyleLabConfig } from '../src/style-lab-config';

const temporary: string[] = [];

afterEach(async () => {
	await Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe('shareable style-lab CLI', () => {
	test('loads relative multi-project configuration and honors excludes', async () => {
		const directory = await mkdtemp(resolve(tmpdir(), 'style-lab-config-'));
		temporary.push(directory);
		await mkdir(resolve(directory, 'repo/docs/generated'), { recursive: true });
		await Bun.write(resolve(directory, 'repo/docs/index.md'), '# Included\n');
		await Bun.write(resolve(directory, 'repo/docs/generated/api.md'), '# Excluded\n');
		await Bun.write(resolve(directory, 'style-lab.config.json'), JSON.stringify({
			schema_version: 1,
			projects: [{ name: 'fixture', root: './repo', include: ['docs/**/*.md'], exclude: ['**/generated/**'] }],
		}));
		const config = await loadStyleLabConfig(resolve(directory, 'style-lab.config.json'))
		expect(config.projects[0]?.root).toBe(resolve(directory, 'repo'));
		expect(await discoverProjectFiles(config.projects[0]!)).toEqual([resolve(directory, 'repo/docs/index.md')]);
		expect(config.parsing.max_unparsed_file_ratio).toBe(0);
	});

	test('accepts an explicit empty exclusion list', async () => {
		const directory = await mkdtemp(resolve(tmpdir(), 'style-lab-empty-excludes-'));
		temporary.push(directory);
		await mkdir(resolve(directory, 'repo/docs'), { recursive: true });
		await Bun.write(resolve(directory, 'repo/docs/index.md'), '# Included\n');
		await Bun.write(resolve(directory, 'style-lab.config.json'), JSON.stringify({
			schema_version: 1,
			projects: [{ name: 'fixture', root: './repo', include: ['docs/**/*.md'], exclude: [] }],
		}));
		const config = await loadStyleLabConfig(resolve(directory, 'style-lab.config.json'));
		expect(config.projects[0]?.exclude).toEqual([]);
	});

	test('uses stable hash sampling instead of the alphabetical head', async () => {
		const directory = await mkdtemp(resolve(tmpdir(), 'style-lab-sampling-'));
		temporary.push(directory);
		await mkdir(resolve(directory, 'docs'), { recursive: true });
		for (let index = 0; index < 30; index++) await Bun.write(resolve(directory, 'docs', `page-${String(index).padStart(2, '0')}.md`), `# Page ${index}\n`);
		const project = { name: 'sample', root: directory, include: ['docs/**/*.md'], exclude: [], max_files: 5 };
		const first = await discoverProjectFiles(project);
		const second = await discoverProjectFiles(project);
		expect(first).toEqual(second);
		expect(first).not.toEqual(Array.from({ length: 5 }, (_, index) => resolve(directory, 'docs', `page-${String(index).padStart(2, '0')}.md`)));
	});

	test('selects a bounded sample with candidates from every available rule', async () => {
		const directory = await mkdtemp(resolve(tmpdir(), 'style-lab-stratified-'));
		temporary.push(directory);
		const files = ['passive.md', 'command.md', 'realtime.md', 'semicolon.md', 'setup.md', 'empty.md'].map((name) => resolve(directory, name));
		const alert = (Check: string) => ({ Check, Line: 1, Span: [1, 1] as [number, number], Match: 'x', Message: 'x', Severity: 'suggestion' });
		const vale = {
			[files[0]!]: Array.from({ length: 20 }, () => alert('Lab.PassiveHiddenActor')),
			[files[1]!]: Array.from({ length: 3 }, () => alert('Lab.ContextualCommandLine')),
			[files[2]!]: Array.from({ length: 3 }, () => alert('Lab.ContextualRealTime')),
			[files[3]!]: Array.from({ length: 3 }, () => alert('Lab.Semicolons')),
			[files[4]!]: Array.from({ length: 3 }, () => alert('Lab.ContextualSetup')),
			[files[5]!]: [],
		};
		const selected = selectRuleStratifiedFiles(directory, files, vale, 5, 3);
		expect(selected.files).toHaveLength(5);
		expect(selected.files).not.toContain(files[5]);
		expect(Object.values(selected.summary.target_met).every(Boolean)).toBe(true);
		expect(selected.summary.selected_candidates).toMatchObject({
			'google-passive-hidden-actor': 20,
			'google-semicolons': 3,
			'command-line': 3,
			'real-time': 3,
			setup: 3,
		});
	});

	test('reports an unavailable stratification target without treating it as met', () => {
		const path = resolve('/tmp/rare.md');
		const alert = { Check: 'Lab.ContextualRealTime', Line: 1, Span: [1, 1] as [number, number], Match: 'x', Message: 'x', Severity: 'suggestion' };
		const selected = selectRuleStratifiedFiles('/tmp', [path], { [path]: [alert] }, 5, 3);
		expect(selected.summary.target_met['real-time']).toBe(false);
		expect(selected.summary.all_available_selected['real-time']).toBe(true);
	});

	test('uses the fixed Vale catalog for MDX candidates', async () => {
		const root = resolve('test/fixtures/shareable-docs');
		const file = resolve(root, 'guide.mdx');
		const vale = await runStaticVale(root, [file]);
		const { candidates } = await buildStaticCandidates('fixture', root, vale, [file]);
		expect(new Set(candidates.map((candidate) => candidate.rule_kind))).toEqual(new Set([
			'contextual-vocabulary', 'semicolon', 'passive-hidden-actor',
		]));
		expect(candidates.some((candidate) => candidate.match.includes('ready'))).toBe(false);
	});

	test('audits Hugo Markdown and keeps rendered frontmatter prose visible', async () => {
		const root = resolve('test/fixtures/shareable-docs');
		const file = resolve(root, 'hugo-guide.md');
		const vale = await runStaticVale(root, [file]);
		const built = await buildStaticCandidates('hugo', root, vale, [file]);
		expect(built.parse_health).toMatchObject({ ast_parsed_files: 1, fallback_files: 0, unparsed_files: 0 });
		expect(built.candidates.find((candidate) => candidate.line === 2 && candidate.rule_id === 'setup')?.source_class).toBe('prose');
		expect(built.candidates.find((candidate) => candidate.line === 3 && candidate.rule_id === 'command-line')?.source_class).toBe('prose');
		expect(built.candidates.some((candidate) => candidate.marked_context.includes('const setup'))).toBe(false);
	});

	test('builds narrow questions without evaluation labels', async () => {
		const root = resolve('test/fixtures/shareable-docs');
		const file = resolve(root, 'guide.mdx');
		const { candidates } = await buildStaticCandidates('fixture', root, await runStaticVale(root, [file]), [file]);
		const rule = await Bun.file('compiled-rules/google-semicolons.json').json();
		const request = buildStaticJevRequest(candidates, 'jev-latest', rule);
		const serialized = JSON.stringify(request);
		expect(serialized).not.toContain('expected_label');
		expect(serialized).not.toContain('acceptable');
		expect(Object.keys(request.questions).length).toBe(candidates.reduce((sum, candidate) => sum + (candidate.rule_kind === 'semicolon' || candidate.rule_id === 'setup' ? 3 : 1), 0));
		for (const [index, candidate] of candidates.entries()) {
			const key = `c${index + 1}`;
			if (candidate.rule_id === 'command-line' || candidate.rule_id === 'real-time') expect(request.questions[`${key}__function`]?.type).toBe('choice');
			if (candidate.rule_kind === 'passive-hidden-actor') expect(request.questions[`${key}__responsibility`]?.type).toBe('choice');
		}
	});

	test('respects the configured Jev question limit', async () => {
		const root = resolve('test/fixtures/shareable-docs');
		const file = resolve(root, 'guide.mdx');
		const { candidates } = await buildStaticCandidates('fixture', root, await runStaticVale(root, [file]), [file]);
		const batches = batchForQuestionLimit(candidates, 4);
		expect(batches.length).toBeGreaterThan(1);
		for (const batch of batches) {
			const questions = batch.reduce((sum, candidate) => sum + (candidate.rule_kind === 'semicolon' || candidate.rule_id === 'setup' ? 3 : 1), 0);
			expect(questions).toBeLessThanOrEqual(4);
		}
	});

	test('supports a no-key shadow run', async () => {
		const root = resolve('test/fixtures/shareable-docs');
		const rawDirectory = await mkdtemp(resolve(tmpdir(), 'style-lab-raw-'));
		temporary.push(rawDirectory);
		const result = await auditProject({
			name: 'fixture', root, files: [resolve(root, 'guide.mdx')], model: 'jev-latest', batchQuestionLimit: 200, noJev: true, rawDirectory,
		});
		expect(result.candidate_count).toBeGreaterThan(0);
		expect(result.raw_exchanges).toHaveLength(0);
		expect(result.findings.every((finding) => ['review', 'suppress'].includes(finding.action))).toBe(true);
		expect(await Bun.file(resolve(rawDirectory, 'vale.json')).exists()).toBe(true);
	});

	test('uses exclusive Choice results for compound modifiers', async () => {
		const candidate: StaticCandidate = {
			id: 'fixture:guide.md:1:Lab.ContextualCommandLine:5', project: 'fixture', file: 'guide.md', absolute_file: '/tmp/guide.md',
			line: 1, span: [5, 16], check: 'Lab.ContextualCommandLine', rule_id: 'command-line', rule_kind: 'contextual-vocabulary',
			match: 'command line', message: 'candidate', context: 'Use a command line tool.', marked_context: 'Use a ⟦command line⟧ tool.',
			source_class: 'prose', source_parser: 'markdown_ast',
		};
		const finding = composeVocabulary(candidate, 'c1', { answers: { c1__function: {
			choice: 'before_noun', confidence: 0.93, probabilities: { before_noun: 0.94, standalone: 0.03, literal: 0.01, ambiguous: 0.02 },
		} } }, await loadRules());
		expect(finding.action).toBe('flag');
		expect(finding.expected_form).toBe('command-line');
	});

	test('requires positive evidence before suppressing a passive candidate', () => {
		const candidate: StaticCandidate = {
			id: 'fixture:guide.md:1:Lab.PassiveHiddenActor:1', project: 'fixture', file: 'guide.md', absolute_file: '/tmp/guide.md',
			line: 1, span: [1, 13], check: 'Lab.PassiveHiddenActor', rule_id: 'google-passive-hidden-actor', rule_kind: 'passive-hidden-actor',
			match: 'is terminated', message: 'candidate', context: 'The Pod is terminated.', marked_context: 'The Pod ⟦is terminated⟧.',
			source_class: 'prose', source_parser: 'markdown_ast',
		};
		const response = (choice: string, probability: number) => ({ answers: { c1__responsibility: {
			choice, confidence: probability, probabilities: {
				missing_actor_matters: choice === 'missing_actor_matters' ? probability : (1 - probability) / 3,
				actor_clear_from_context: choice === 'actor_clear_from_context' ? probability : (1 - probability) / 3,
				actor_not_needed: choice === 'actor_not_needed' ? probability : (1 - probability) / 3,
				not_passive_or_unclear: choice === 'not_passive_or_unclear' ? probability : (1 - probability) / 3,
			},
		} } });
		expect(composePassive(candidate, 'c1', response('actor_not_needed', 0.7)).action).toBe('review');
		expect(composePassive(candidate, 'c1', response('actor_not_needed', 0.9)).action).toBe('suppress');
		expect(composePassive(candidate, 'c1', response('missing_actor_matters', 0.8)).action).toBe('flag');
	});
});
