#!/usr/bin/env bun
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import { auditProject, PIPELINE_VERSION, runStaticVale, selectRuleStratifiedFiles, STATIC_RULES, STATIC_RULE_SET_VERSION } from './style-lab-audit';
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

The configuration chooses which rules run (\`rules\`) and how passive voice
findings are handled (\`passive.mode\`: review or rank, with \`passive.guide\`).
The command runs in shadow mode and never edits documentation.`);
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
		let files;
		let vale;
		let sampling;
		if (project.sampling?.strategy === 'rule-stratified') {
			const eligible = await discoverProjectFiles(project, false);
			console.error(`${project.name}: enumerating Vale candidates across ${eligible.length} eligible files for rule-stratified sampling`);
			const allVale = await runStaticVale(project.root, eligible);
			const selection = selectRuleStratifiedFiles(project.root, eligible, allVale, project.max_files!, project.sampling.min_candidates_per_rule, config.rules);
			files = selection.files;
			sampling = selection.summary;
			vale = Object.fromEntries(files.map((file) => [resolve(file), allVale[resolve(file)] ?? []]));
		} else {
			files = await discoverProjectFiles(project);
		}
		console.error(`${project.name}: auditing ${files.length} files`);
		const rawDirectory = resolve(runDirectory, 'raw', project.name);
		const result = await auditProject({
			name: project.name,
			root: project.root,
			files,
			model: config.jev.model,
			noJev,
			rawDirectory,
			vale,
			sampling,
			rules: config.rules,
			passive: config.passive,
		});
		projects.push(result);
	}
	const findings = projects.flatMap((project) => project.findings);
	const inputTokens = projects.reduce((sum, project) => sum + project.usage.input_tokens, 0);
	const fallbackFiles = projects.reduce((sum, project) => sum + project.parse_health.fallback_files, 0);
	const unparsedFiles = projects.reduce((sum, project) => sum + project.parse_health.unparsed_files, 0);
	const summary = {
		files: projects.reduce((sum, project) => sum + project.files.length, 0),
		candidates: findings.length,
		flag: findings.filter((finding) => finding.action === 'flag').length,
		review: findings.filter((finding) => finding.action === 'review').length,
		suppress: findings.filter((finding) => finding.action === 'suppress').length,
		unparsed: findings.filter((finding) => finding.action === 'unparsed').length,
		ast_parsed_files: projects.reduce((sum, project) => sum + project.parse_health.ast_parsed_files, 0),
		fallback_files: fallbackFiles,
		unparsed_files: unparsedFiles,
		jev_calls: projects.reduce((sum, project) => sum + project.jev_call_count, 0),
		jev_candidates: projects.reduce((sum, project) => sum + project.jev_candidate_count, 0),
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
		pipeline_version: PIPELINE_VERSION,
		rule_set_version: STATIC_RULE_SET_VERSION,
		static_rules: STATIC_RULES.filter((rule) => config.rules.some((id) => rule.endsWith(id))),
		passive: config.passive,
		methodology: {
			primary_judgments: 'Jev probabilities composed by code',
			agent_role: 'Configure, execute, validate plumbing, and analyze saved evidence; never substitute agent judgments for skipped Jev calls.',
			excluded_from_effectiveness_metrics: ['unparsed candidates', 'agent-authored labels'],
		},
		summary,
		projects: projects.map(publicProject),
	};
	await Bun.write(resolve(runDirectory, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
	await Bun.write(resolve(runDirectory, 'editor-checklist.json'), `${JSON.stringify({ schema_version: 1, generated_at: generatedAt, pages: buildEditorChecklist(projects) }, null, 2)}\n`);
	await Bun.write(resolve(runDirectory, 'report.html'), buildHtmlReport({ ...report, projects }));
	await Bun.write(resolve(runDirectory, 'config.snapshot.json'), `${JSON.stringify({ ...config, config_path: undefined }, null, 2)}\n`);
	console.log(runDirectory);
	console.error(`${summary.candidates} candidates: ${summary.flag} flag, ${summary.review} review, ${summary.suppress} suppress, ${summary.unparsed} unparsed; ${summary.jev_candidates} reached Jev in ${summary.jev_calls} calls`);
	if (fallbackFiles) console.error(`Warning: ${fallbackFiles} files used protected lexical fallback; see raw/*/source-health.json.`);
	if (unparsedFiles) console.error(`Warning: ${unparsedFiles} files could not be classified; no Jev judgment was made for their candidates.`);
	const overLimit = projects.filter((project) => {
		const ratio = project.parse_health.files_total ? project.parse_health.unparsed_files / project.parse_health.files_total : 0;
		return ratio > config.parsing.max_unparsed_file_ratio;
	});
	if (overLimit.length) {
		console.error(`Parse-health limit exceeded for: ${overLimit.map((project) => project.name).join(', ')}. Report artifacts were preserved.`);
		process.exitCode = 2;
	}
}

if (import.meta.main) main().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exitCode = 1;
});
