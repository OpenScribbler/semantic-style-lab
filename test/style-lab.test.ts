import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, describe, expect, test } from 'vitest';

import { auditProject, batchForQuestionLimit, buildStaticCandidates, buildStaticJevRequest, runStaticVale } from '../src/style-lab-audit';
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
		expect(Object.keys(request.questions).length).toBe(candidates.reduce((sum, candidate) => sum + (candidate.rule_kind === 'semicolon' || candidate.rule_id === 'setup' ? 3 : candidate.rule_kind === 'contextual-vocabulary' ? 2 : 1), 0));
	});

	test('respects the configured Jev question limit', async () => {
		const root = resolve('test/fixtures/shareable-docs');
		const file = resolve(root, 'guide.mdx');
		const { candidates } = await buildStaticCandidates('fixture', root, await runStaticVale(root, [file]), [file]);
		const batches = batchForQuestionLimit(candidates, 4);
		expect(batches.length).toBeGreaterThan(1);
		for (const batch of batches) {
			const questions = batch.reduce((sum, candidate) => sum + (candidate.rule_kind === 'semicolon' || candidate.rule_id === 'setup' ? 3 : candidate.rule_kind === 'contextual-vocabulary' ? 2 : 1), 0);
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
});
