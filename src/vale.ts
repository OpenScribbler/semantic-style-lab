import type { Candidate, ContextualRule, ValeAlert } from './types';

async function runVale(files: string[]) {
	if (!Bun.which('vale')) throw new Error('Vale is not on PATH. Install it from https://vale.sh/docs/install and rerun.');
	const child = Bun.spawn(['vale', '--output=JSON', ...files], { stdout: 'pipe', stderr: 'pipe' });
	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
		child.exited,
	]);
	if (![0, 1].includes(exitCode)) throw new Error(`Vale exited ${exitCode}: ${stderr.trim()}`);
	return JSON.parse(stdout || '{}') as Record<string, ValeAlert[]>;
}

function surroundingContext(source: string, line: number, span: [number, number]) {
	const lines = source.split(/\r?\n/);
	const target = lines[line - 1] ?? '';
	const marked = `${target.slice(0, span[0] - 1)}⟦${target.slice(span[0] - 1, span[1])}⟧${target.slice(span[1])}`;
	return lines
		.slice(Math.max(0, line - 2), Math.min(lines.length, line + 1))
		.map((value, index) => (Math.max(0, line - 2) + index === line - 1 ? marked : value))
		.join('\n')
		.trim();
}

export async function extractCandidates(files: string[], rules: ContextualRule[]) {
	const alerts = await runVale(files);
	const ruleByCheck = new Map(rules.map((rule) => [rule.vale_check, rule]));
	const candidates: Candidate[] = [];
	for (const [file, findings] of Object.entries(alerts)) {
		const source = await Bun.file(file).text();
		for (const finding of findings) {
			const rule = ruleByCheck.get(finding.Check);
			if (!rule) continue;
			candidates.push({
				id: `c${candidates.length}`,
				file,
				line: finding.Line,
				span: finding.Span,
				match: finding.Match,
				context: surroundingContext(source, finding.Line, finding.Span),
				ruleId: rule.id,
			});
		}
	}
	return candidates;
}
