import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

interface Label {
	id: string;
	verdict: 'violation' | 'not_violation' | 'uncertain';
	vale_fit: 'deterministic' | 'semantic' | 'uncertain' | 'not_applicable';
	confidence: number;
	rationale: string;
}

function parseJson(text: string) {
	const value = JSON.parse(text);
	if (value.structured_output) return value.structured_output;
	if (typeof value.result === 'string') return JSON.parse(value.result);
	return value;
}

async function main() {
	const reviewers = ['antigravity', 'claude', 'copilot', 'codex'];
	const items = await Bun.file('experiments/reviewer-panel-items.json').json();
	const reports = await Promise.all(reviewers.map((reviewer) => Bun.file(`reports/reviewer-panel-${reviewer}.json`).json()));
	const disagreements = items.flatMap((item: { id: string }) => {
		const reviews = reports.map((report, index) => ({ reviewer: reviewers[index], ...report.labels.find((label: Label) => label.id === item.id) }));
		const counts = Object.values(Object.groupBy(reviews, (review) => review.verdict)).map((group) => group!.length);
		return Math.max(...counts) < 3 ? [{ ...item, reviews }] : [];
	});
	const schemaPath = resolve('schemas/reviewer-panel.schema.json');
	const schema = await Bun.file(schemaPath).text();
	const rawDirectory = resolve('reports/reviewer-panel-raw/adjudicator');
	await mkdir(rawDirectory, { recursive: true });
	const chunkSize = 14;
	const labels: Label[] = [];
	for (let start = 0; start < disagreements.length; start += chunkSize) {
		const chunk = disagreements.slice(start, start + chunkSize);
		const prompt = `Act as the final adjudicator for documentation-style cases on which four independent reviewers split. Apply the Google developer documentation style rule stated in each item to the exact passage.

Choose violation, not_violation, or uncertain. Resolve reviewer mistakes rather than voting mechanically. Use uncertain only for a genuine policy choice or insufficient context. For semantic_gap items, also decide whether ordinary deterministic Vale/regex logic can reliably make the decision. Keep each rationale under 24 words. Return every id exactly once.

Disputed items and reviewer evidence:
${JSON.stringify(chunk, null, 2)}`;
		const name = `chunk-${String(start / chunkSize + 1).padStart(3, '0')}`;
		const promptPath = resolve(rawDirectory, `${name}.prompt.json`);
		const responsePath = resolve(rawDirectory, `${name}.response.json`);
		const labelsPath = resolve(rawDirectory, `${name}.labels.json`);
		await Bun.write(promptPath, `${JSON.stringify({ items: chunk, prompt }, null, 2)}\n`);
		let raw: { exit_code: number; stdout: string; stderr: string };
		if (await Bun.file(responsePath).exists()) {
			raw = await Bun.file(responsePath).json();
		} else {
			console.error(`adjudicator: items ${start + 1}-${start + chunk.length}/${disagreements.length}`);
			const process = Bun.spawn([
				'claude', '-p', '--model', 'sonnet', '--effort', 'high', '--restricted', '--safe-mode',
				'--no-session-persistence', '--max-budget-usd', '2', '--output-format', 'json', '--json-schema', schema,
			], { stdin: new Blob([prompt]), stdout: 'pipe', stderr: 'pipe' });
			const [exitCode, stdout, stderr] = await Promise.all([process.exited, new Response(process.stdout).text(), new Response(process.stderr).text()]);
			raw = { exit_code: exitCode, stdout, stderr };
			await Bun.write(responsePath, `${JSON.stringify({ captured_at: new Date().toISOString(), ...raw }, null, 2)}\n`);
		}
		if (raw.exit_code !== 0) throw new Error(`Adjudicator failed: ${raw.stderr.slice(-2000)}`);
		const parsed = parseJson(raw.stdout) as { labels: Label[] };
		const expected = new Set(chunk.map((item: { id: string }) => item.id));
		if (parsed.labels.length !== chunk.length || parsed.labels.some((label) => !expected.has(label.id))) throw new Error(`${name}: adjudicator ids did not match.`);
		await Bun.write(labelsPath, `${JSON.stringify(parsed, null, 2)}\n`);
		labels.push(...parsed.labels);
	}
	await Bun.write('reports/reviewer-panel-adjudication.json', `${JSON.stringify({
		generated_at: new Date().toISOString(), reviewer: 'claude-sonnet-high-adjudicator', item_count: disagreements.length, labels,
	}, null, 2)}\n`);
	console.error(`Wrote adjudication for ${labels.length} disputed items.`);
}

if (import.meta.main) main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
