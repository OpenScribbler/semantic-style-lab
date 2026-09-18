import { resolve } from 'node:path';

import { noul, TypeSafeClient } from '@typesafe-ai/sdk';
import type { NoulQuestion, NoulResponse } from '@typesafe-ai/sdk';

interface ValeAlert {
	Action: { Name: string; Params: string[] | null };
	Span: [number, number];
	Check: string;
	Description: string;
	Link: string;
	Message: string;
	Severity: string;
	Match: string;
	Line: number;
}

function argument(name: string, fallback?: string) {
	const index = process.argv.indexOf(name);
	return index >= 0 ? process.argv[index + 1] : fallback;
}

function localContext(source: string, line: number) {
	const lines = source.split(/\r?\n/);
	const start = Math.max(0, line - 2);
	const end = Math.min(lines.length, line + 1);
	return lines.slice(start, end).map((text, index) => ({ line: start + index + 1, text }));
}

async function runVale(repo: string, paths: string[]) {
	const process = Bun.spawn(['vale', '--output=JSON', ...paths], {
		cwd: repo,
		stdout: 'pipe',
		stderr: 'pipe',
	});
	const [exitCode, stdout, stderr] = await Promise.all([
		process.exited,
		new Response(process.stdout).text(),
		new Response(process.stderr).text(),
	]);
	if (exitCode > 1 || !stdout.trim()) throw new Error(`Vale failed (${exitCode}): ${stderr}`);
	return JSON.parse(stdout) as Record<string, ValeAlert[]>;
}

async function judgePage(path: string, source: string, alerts: ValeAlert[]) {
	if (alerts.length === 0) return { path, alerts: [], usage: { input_tokens: 0, output_tokens: 0 } };
	if (alerts.length > 255) throw new Error(`${path}: ${alerts.length} Vale alerts exceed the API question limit`);
	const candidates = alerts.map((alert, index) => ({
		id: `q${index + 1}`,
		check: alert.Check,
		severity: alert.Severity,
		message: alert.Message,
		matched_text: alert.Match,
		recommended_replacements: alert.Action.Params ?? [],
		target_line: alert.Line,
		local_context: localContext(source, alert.Line),
	}));
	const questions: Record<string, NoulQuestion> = Object.fromEntries(candidates.map((candidate, index) => [
		candidate.id,
		noul(
			{
				question: 'Is this Vale alert a real, actionable violation of the stated Google documentation style rule in the target passage?',
				inspect: `candidates[${index}]`,
				policy: 'Vale has already identified a surface-pattern candidate. Judge whether the alert is correct in this specific prose context; do not search for other issues.',
				focus: 'Use the check name, message, matched text, proposed replacement, and local context. Preserve code, literal UI text, product names, quotations, domain terminology, and intended technical meaning.',
			},
			{
				true: 'The matched prose violates exactly the reported rule, and acting on this alert would improve conformance without changing the intended technical meaning.',
				false: 'The alert is a contextual false positive, the rule is inapplicable, the match is literal or protected text, or the recommendation would be wrong or harmful here.',
			},
		),
	]));
	const response = await new TypeSafeClient().systemOne({
		model: 'jev-latest',
		state: { page: path, candidates },
		questions,
	});
	return {
		path,
		usage: response.usage,
		alerts: alerts.map((alert, index) => {
			const probability = (response.answers[`q${index + 1}`] as NoulResponse).noul;
			return {
				id: `${path}:${alert.Line}:${alert.Check}:${alert.Span[0]}:${alert.Match}`,
				check: alert.Check,
				severity: alert.Severity,
				message: alert.Message,
				match: alert.Match,
				line: alert.Line,
				span: alert.Span,
				link: alert.Link,
				action: alert.Action,
				context: localContext(source, alert.Line),
				jev_probability: probability,
				vale_jev_action: probability >= 0.75 ? 'keep' : probability <= 0.25 ? 'suppress' : 'review',
			};
		}),
	};
}

async function main() {
	if (!process.env.TYPESAFE_API_KEY?.trim()) throw new Error('TYPESAFE_API_KEY is not set.');
	const repo = argument('--repo');
	if (!repo) throw new Error('--repo requires the documentation repository root');
	const pagesPath = argument('--pages', 'experiments/syllago-pages.json')!;
	const output = argument('--output', 'reports/vale-jev-experiment.json')!;
	const contentPrefix = argument('--content-prefix', 'src/content/docs')!;
	const runCount = Number(argument('--runs', '3'));
	const paths = (await Bun.file(pagesPath).json()) as string[];
	const repoPaths = paths.map((path) => `${contentPrefix}/${path}`);
	const vale = await runVale(repo, repoPaths);
	const sources = await Promise.all(repoPaths.map((repoPath) => Bun.file(resolve(repo, repoPath)).text()));
	const runs: Awaited<ReturnType<typeof judgePage>>[][] = [];
	for (let run = 0; run < runCount; run++) {
		console.error(`Jev run ${run + 1}/${runCount}`);
		runs.push(await Promise.all(paths.map((path, index) => judgePage(path, sources[index]!, vale[repoPaths[index]!] ?? []))));
	}
	const actionFor = (probability: number) => probability >= 0.75 ? 'keep' : probability <= 0.25 ? 'suppress' : 'review';
	const pages = runs[0]!.map((page, pageIndex) => ({
		path: page.path,
		alerts: page.alerts.map((alert, alertIndex) => {
			const probabilities = runs.map((run) => run[pageIndex]!.alerts[alertIndex]!.jev_probability);
			const probability = probabilities.reduce((sum, value) => sum + value, 0) / probabilities.length;
			const actions = probabilities.map(actionFor);
			const actionCounts = Object.fromEntries(['keep', 'review', 'suppress'].map((action) => [action, actions.filter((value) => value === action).length]));
			return {
				...alert,
				jev_probability: probability,
				jev_probabilities: probabilities,
				jev_range: Math.max(...probabilities) - Math.min(...probabilities),
				vale_jev_action: actionFor(probability),
				action_agreement: Math.max(...Object.values(actionCounts)) / probabilities.length,
			};
		}),
	}));
	const alerts = pages.flatMap((page) => page.alerts);
	const report = {
		generated_at: new Date().toISOString(),
		hypothesis: 'Filtering real Vale alerts with narrow Jev judgments improves precision while retaining true Vale findings.',
		model: 'jev-latest',
		run_count: runCount,
		thresholds: { keep_at_or_above: 0.75, suppress_at_or_below: 0.25, otherwise: 'review' },
		repo,
		page_count: pages.length,
		vale_alert_count: alerts.length,
		vale_jev: {
			keep: alerts.filter((alert) => alert.vale_jev_action === 'keep').length,
			review: alerts.filter((alert) => alert.vale_jev_action === 'review').length,
			suppress: alerts.filter((alert) => alert.vale_jev_action === 'suppress').length,
		},
		usage: {
			input_tokens: runs.flat().reduce((sum, page) => sum + page.usage.input_tokens, 0),
			output_tokens: runs.flat().reduce((sum, page) => sum + page.usage.output_tokens, 0),
		},
		by_rule: Object.fromEntries([...new Set(alerts.map((alert) => alert.check))].sort().map((check) => {
			const matching = alerts.filter((alert) => alert.check === check);
			return [check, {
				vale_alerts: matching.length,
				keep: matching.filter((alert) => alert.vale_jev_action === 'keep').length,
				review: matching.filter((alert) => alert.vale_jev_action === 'review').length,
				suppress: matching.filter((alert) => alert.vale_jev_action === 'suppress').length,
			}];
		})),
		pages,
	};
	await Bun.write(output, `${JSON.stringify(report, null, 2)}\n`);
	console.error(`Wrote ${output}: ${report.vale_alert_count} Vale alerts; ${report.vale_jev.keep} keep, ${report.vale_jev.review} review, ${report.vale_jev.suppress} suppress.`);
}

if (import.meta.main) main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
