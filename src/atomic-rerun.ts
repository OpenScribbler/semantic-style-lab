import { mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

import { TypeSafeClient } from '@typesafe-ai/sdk';

import { loadRules } from './rules';
import { buildStaticJevRequest, composeSemicolon, composeVocabulary } from './style-lab-audit';
import type { StaticCandidate } from './style-lab-audit';

// Reruns an audit report's Jev-judged candidates with one candidate and one
// question per request, then composes each finding with the audit's own gates.
// It tests whether batching, rather than the questions, caused a verdict.

function argument(name: string) {
	const index = process.argv.indexOf(name);
	return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
	const reportPath = argument('--report');
	const out = argument('--out');
	const checks = (argument('--checks') ?? 'Lab.ContextualCommandLine,Lab.Semicolons').split(',');
	if (!reportPath || !out) throw new Error('Usage: bun src/atomic-rerun.ts --report <report.json> --out <dir> [--checks a,b]');
	if (!process.env.TYPESAFE_API_KEY?.trim()) throw new Error('TYPESAFE_API_KEY is not set. See docs/api-key-security.md.');
	const report = await Bun.file(reportPath).json() as { model: string; projects: { findings: (StaticCandidate & { action: string })[] }[] };
	const candidates = report.projects[0]!.findings.filter((finding) => checks.includes(finding.check) && finding.source_class === 'prose');
	const rules = await loadRules(resolve('rules/contextual-vocabulary'));
	const semicolonRule = await Bun.file('compiled-rules/google-semicolons.json').json();
	const client = new TypeSafeClient();
	await mkdir(resolve(out, 'raw'), { recursive: true });
	const findings = [];
	for (const candidate of candidates) {
		const whole = buildStaticJevRequest([candidate], report.model, semicolonRule);
		const answers: Record<string, unknown> = {};
		for (const [id, question] of Object.entries(whole.questions)) {
			const request = { ...whole, questions: { [id]: question } };
			const response = await client.systemOne(request);
			const stem = `${createHash('sha256').update(candidate.id).digest('hex').slice(0, 16)}-${id}`;
			await Bun.write(resolve(out, 'raw', `${stem}.json`), `${JSON.stringify({ candidate_id: candidate.id, request, response }, null, 2)}\n`);
			answers[id] = response.answers[id];
		}
		const finding = candidate.rule_kind === 'contextual-vocabulary'
			? composeVocabulary(candidate, 'c1', { answers }, rules)
			: composeSemicolon(candidate, 'c1', { answers }, semicolonRule.semantic_exceptions);
		findings.push({ ...finding, batched_action: candidate.action });
	}
	await Bun.write(resolve(out, 'findings.json'), `${JSON.stringify({ generated_at: new Date().toISOString(), report: reportPath, findings }, null, 2)}\n`);
	console.log(`${findings.length} candidates rerun atomically`);
}

if (import.meta.main) main().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exitCode = 1;
});
