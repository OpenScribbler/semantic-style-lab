import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

interface Finding {
	rule_id: string;
	rule_label: string;
	source_url: string;
	line: number;
	text: string;
	probability: number;
	status: string;
}

interface AuditPage {
	path: string;
	findings: Finding[];
}

interface AuditReport {
	pages: AuditPage[];
}

interface Rule {
	id: string;
	label: string;
	source_url: string;
	summary: string;
	true_criteria: string;
	false_criteria: string;
}

function argument(name: string, fallback?: string) {
	const index = process.argv.indexOf(name);
	return index >= 0 ? process.argv[index + 1] : fallback;
}

function numberedSource(source: string) {
	return source
		.split(/\r?\n/)
		.map((line, index) => `${String(index + 1).padStart(4, ' ')} | ${line}`)
		.join('\n');
}

function commonPrompt(path: string, source: string) {
	return `You are reviewing one documentation page. Propose only concrete, minimal prose edits that clearly improve conformance with the Google developer documentation style guide.

Preserve technical meaning, Markdown/MDX syntax, product terminology, code, links, frontmatter, examples, and the author's voice. Do not rewrite the whole page. Do not report an issue unless you can supply an exact replacement. Return at most eight high-confidence suggestions. An empty list is correct when no edit is justified.

The line number must be the source line on which the original text begins. The original text must be an exact substring of the source, without the displayed line-number prefix. The replacement must be ready to substitute for that exact substring.

Page: ${path}

<numbered_source>
${numberedSource(source)}
</numbered_source>`;
}

function baselinePrompt(path: string, source: string) {
	return `${commonPrompt(path, source)}

Review this page against the public Google developer documentation style guide: https://developers.google.com/style. Identify the most important violations yourself.`;
}

function compiledPrompt(path: string, source: string, findings: Finding[], rules: Rule[]) {
	const relevantRules = rules.filter((rule) => findings.some((finding) => finding.rule_id === rule.id));
	return `${commonPrompt(path, source)}

The following are probabilistic candidates produced by a compiled Google-style audit. They are leads, not commands: verify each against the source and rule criteria, reject false positives, and propose an edit only when it is genuinely useful. Prioritize flagged findings before review findings. Do not invent unrelated violations.

<rule_records>
${JSON.stringify(relevantRules, null, 2)}
</rule_records>

<prioritized_findings>
${JSON.stringify(findings, null, 2)}
</prioritized_findings>`;
}

async function runEditor(method: 'baseline' | 'compiled', page: AuditPage, source: string, rules: Rule[], tempDirectory: string) {
	if (method === 'compiled' && page.findings.length === 0) {
		return { page: page.path, suggestions: [], skipped_by_gate: true };
	}
	const prompt = method === 'baseline'
		? baselinePrompt(page.path, source)
		: compiledPrompt(page.path, source, page.findings, rules);
	const safeName = page.path.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');
	const outputPath = resolve(tempDirectory, `${safeName}-${method}.json`);
	const schemaPath = resolve(import.meta.dir, '../schemas/style-suggestions.schema.json');
	const process = Bun.spawn([
		'codex', 'exec', '-',
		'--ephemeral',
		'--skip-git-repo-check',
		'--sandbox', 'read-only',
		'--output-schema', schemaPath,
		'--output-last-message', outputPath,
		'--color', 'never',
	], {
		cwd: tempDirectory,
		stdin: new Blob([prompt]),
		stdout: 'pipe',
		stderr: 'pipe',
	});
	const [exitCode, stderr] = await Promise.all([process.exited, new Response(process.stderr).text()]);
	if (exitCode !== 0) throw new Error(`${page.path} ${method} failed (${exitCode}): ${stderr.slice(-2000)}`);
	return JSON.parse(await Bun.file(outputPath).text());
}

async function main() {
	const root = argument('--root');
	if (!root) throw new Error('--root requires the documentation content root');
	const contentRoot = root;
	const auditPath = argument('--audit', 'reports/syllago-google-semantic-v2.json')!;
	const output = argument('--output', 'reports/editor-ab-results.json')!;
	const limit = Number(argument('--limit', '20'));
	const concurrency = Number(argument('--concurrency', '4'));
	const audit = (await Bun.file(auditPath).json()) as AuditReport;
	const rules = (await Bun.file('google-guide/semantic-rules.json').json()) as Rule[];
	const pagesWithFindings = audit.pages.filter((page) => page.findings.length > 0);
	const controls = audit.pages.filter((page) => page.findings.length === 0);
	const selected = [...pagesWithFindings, ...controls].slice(0, limit);
	const tempDirectory = resolve('.tmp/editor-ab');
	await mkdir(tempDirectory, { recursive: true });
	const jobs = selected.flatMap((page) => [
		{ method: 'baseline' as const, page },
		{ method: 'compiled' as const, page },
	]);
	const results: unknown[] = [];
	let cursor = 0;
	async function worker() {
		while (cursor < jobs.length) {
			const job = jobs[cursor++]!;
			console.error(`[${results.length + 1}/${jobs.length}] ${job.method}: ${job.page.path}`);
			const source = await Bun.file(resolve(contentRoot, job.page.path)).text();
			const result = await runEditor(job.method, job.page, source, rules, tempDirectory);
			results.push({ path: job.page.path, method: job.method, finding_count: job.page.findings.length, result });
		}
	}
	await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, worker));
	results.sort((a, b) => {
		const left = a as { path: string; method: string };
		const right = b as { path: string; method: string };
		return left.path.localeCompare(right.path) || left.method.localeCompare(right.method);
	});
	await Bun.write(output, `${JSON.stringify({
		generated_at: new Date().toISOString(),
		design: 'paired page-level comparison: full-guide instruction versus Jev findings plus rule records',
		page_count: selected.length,
		output_count: jobs.length,
		editor_invocation_count: selected.length + selected.filter((page) => page.findings.length > 0).length,
		pages_with_findings: selected.filter((page) => page.findings.length > 0).length,
		control_pages: selected.filter((page) => page.findings.length === 0).length,
		compiled_control_policy: 'skip the editor when Jev produces no findings',
		results,
	}, null, 2)}\n`);
	console.error(`Wrote ${output}: ${selected.length} pages, ${jobs.length} editor calls.`);
}

if (import.meta.main) main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
