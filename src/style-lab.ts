#!/usr/bin/env bun
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import { auditProject, STATIC_RULES, STATIC_RULE_SET_VERSION } from './style-lab-audit';
import { discoverProjectFiles, loadStyleLabConfig } from './style-lab-config';
import { buildEditorChecklist, buildHtmlReport } from './style-lab-report';

function argument(name: string) {
	const index = process.argv.indexOf(name);
	return index >= 0 ? process.argv[index + 1] : undefined;
}

function usage() {
	console.log(`Semantic Style Lab

Usage:
  bun run style-lab -- --config style-lab.config.json [options]

Options:
  --config <path>   Configuration file (default: style-lab.config.json)
  --project <name>  Run one configured project
  --no-jev          Enumerate candidates without calling Jev
  --help            Show this help

The rule set is fixed in this research release. The command runs in shadow mode
and never edits documentation.`);
}

function publicProject(project: Awaited<ReturnType<typeof auditProject>>) {
	const { raw_exchanges: _rawExchanges, raw_vale: _rawVale, ...record } = project;
	return record;
}

async function main() {
	if (process.argv.includes('--help') || process.argv.includes('-h')) {
		usage();
		return;
	}
	const configPath = argument('--config') ?? 'style-lab.config.json';
	const selectedName = argument('--project');
	const noJev = process.argv.includes('--no-jev');
	const config = await loadStyleLabConfig(configPath);
	const selected = selectedName ? config.projects.filter((project) => project.name === selectedName) : config.projects;
	if (selectedName && selected.length === 0) throw new Error(`No configured project named ${selectedName}.`);
	const stamp = new Date().toISOString().replaceAll(':', '').replaceAll('.', '-');
	const runDirectory = resolve(config.output_dir, `run-${stamp}`);
	await mkdir(runDirectory, { recursive: true });
	const projects = [];
	for (const project of selected) {
		const files = await discoverProjectFiles(project);
		console.error(`${project.name}: auditing ${files.length} files`);
		const rawDirectory = resolve(runDirectory, 'raw', project.name);
		const result = await auditProject({
			name: project.name,
			root: project.root,
			files,
			model: config.jev.model,
			batchQuestionLimit: config.jev.batch_question_limit,
			noJev,
			rawDirectory,
		});
		projects.push(result);
	}
	const findings = projects.flatMap((project) => project.findings);
	const inputTokens = projects.reduce((sum, project) => sum + project.usage.input_tokens, 0);
	const summary = {
		files: projects.reduce((sum, project) => sum + project.files.length, 0),
		candidates: findings.length,
		flag: findings.filter((finding) => finding.action === 'flag').length,
		review: findings.filter((finding) => finding.action === 'review').length,
		suppress: findings.filter((finding) => finding.action === 'suppress').length,
		input_tokens: inputTokens,
		estimated_input_cost_usd: inputTokens / 1_000_000 * 0.042,
	};
	const generatedAt = new Date().toISOString();
	const report = {
		schema_version: 1,
		generated_at: generatedAt,
		config_path: config.config_path,
		model: noJev ? 'not-called' : config.jev.model,
		no_jev: noJev,
		rule_set_version: STATIC_RULE_SET_VERSION,
		static_rules: STATIC_RULES,
		summary,
		projects: projects.map(publicProject),
	};
	await Bun.write(resolve(runDirectory, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
	await Bun.write(resolve(runDirectory, 'editor-checklist.json'), `${JSON.stringify({ schema_version: 1, generated_at: generatedAt, pages: buildEditorChecklist(projects) }, null, 2)}\n`);
	await Bun.write(resolve(runDirectory, 'report.html'), buildHtmlReport({ ...report, projects }));
	await Bun.write(resolve(runDirectory, 'config.snapshot.json'), `${JSON.stringify({ ...config, config_path: undefined }, null, 2)}\n`);
	console.log(runDirectory);
	console.error(`${summary.candidates} candidates: ${summary.flag} flag, ${summary.review} review, ${summary.suppress} suppress`);
}

if (import.meta.main) main().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exitCode = 1;
});
