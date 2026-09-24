import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

interface PanelItem {
	id: string;
	kind: 'vale_alert' | 'semantic_gap';
	path: string;
	line: number;
	rule: string;
	rule_summary: string;
	matched_text?: string;
	passage: string;
}

interface PanelLabel {
	id: string;
	verdict: 'violation' | 'not_violation' | 'uncertain';
	vale_fit: 'deterministic' | 'semantic' | 'uncertain' | 'not_applicable';
	confidence: number;
	rationale: string;
}

interface ReviewerCall {
	exit_code: number;
	stdout: string;
	stderr: string;
	last_message?: string;
}

interface Alert {
	id: string;
	check: string;
	message: string;
	match: string;
	line: number;
	context: { line: number; text: string }[];
	jev_probability: number;
}

function argument(name: string, fallback?: string) {
	const index = process.argv.indexOf(name);
	return index >= 0 ? process.argv[index + 1] : fallback;
}

function sampleValeAlerts(pages: { path: string; alerts: Alert[] }[], limitPerRule = 12) {
	const byRule = new Map<string, (Alert & { path: string })[]>();
	for (const page of pages) for (const alert of page.alerts) {
		const group = byRule.get(alert.check) ?? [];
		group.push({ path: page.path, ...alert });
		byRule.set(alert.check, group);
	}
	return [...byRule.values()].flatMap((alerts) => {
		const sorted = alerts.sort((left, right) => left.jev_probability - right.jev_probability || left.id.localeCompare(right.id));
		if (sorted.length <= limitPerRule) return sorted;
		return Array.from({ length: limitPerRule }, (_, index) => sorted[Math.round(index * (sorted.length - 1) / (limitPerRule - 1))]!);
	});
}

async function buildItems() {
	const vale = await Bun.file('reports/vale-jev-experiment.json').json();
	const semantic = await Bun.file('reports/syllago-google-semantic-v2.json').json();
	const valeItems: PanelItem[] = sampleValeAlerts(vale.pages).map((alert) => ({
		id: `vale:${alert.id}`,
		kind: 'vale_alert',
		path: alert.path,
		line: alert.line,
		rule: alert.check,
		rule_summary: alert.message,
		matched_text: alert.match,
		passage: alert.context.map((row) => `${row.line} | ${row.text}`).join('\n'),
	}));
	const semanticItems: PanelItem[] = semantic.pages.flatMap((page: { path: string; findings: Array<{ rule_id: string; rule_label: string; line: number; text: string }> }) => page.findings.map((finding) => ({
		id: `semantic:${page.path}:${finding.rule_id}:${finding.line}`,
		kind: 'semantic_gap' as const,
		path: page.path,
		line: finding.line,
		rule: finding.rule_id,
		rule_summary: finding.rule_label,
		passage: finding.text,
	})));
	return [...valeItems, ...semanticItems];
}

function promptFor(items: PanelItem[], guide: string) {
	// A rule text every item shares (such as a rubric) is stated once rather than per item.
	const shared = new Set(items.map(item => item.rule_summary)).size === 1 && items.length > 1 ? items[0].rule_summary : undefined;
	const listed = shared ? items.map(({ rule_summary: _, ...item }) => item) : items;
	return `Independently review documentation style candidates against ${guide}. You are a labeling reviewer, not an editor.

For every item:
- verdict=violation only when the exact reported rule genuinely applies to this passage and acting on it would improve conformance with that guide without harming technical meaning.
- verdict=not_violation for contextual false positives, literal UI/code/product text, inapplicable rules, or harmful recommendations.
- verdict=uncertain only when the supplied passage is insufficient or the rule permits a genuine judgment call.
- For semantic_gap items, vale_fit says whether a conventional deterministic Vale/regex rule could reliably make this decision with acceptable noise: deterministic, semantic, or uncertain.
- For vale_alert items, vale_fit must be not_applicable.
- Give calibrated confidence and a rationale of at most 18 words.
- Treat each item independently. Return every id exactly once and do not add ids.

${shared ? `Every item is judged against this rule:\n${shared}\n\n` : ''}Items:
${JSON.stringify(listed, null, 2)}`;
}

function parseJson(text: string) {
	const unfenced = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
	try { return JSON.parse(unfenced); } catch {}
	const start = unfenced.indexOf('{');
	const end = unfenced.lastIndexOf('}');
	if (start < 0 || end <= start) throw new Error(`Reviewer did not return JSON: ${text.slice(0, 500)}`);
	return JSON.parse(unfenced.slice(start, end + 1));
}

function unwrapResponse(value: unknown): unknown {
	if (Array.isArray(value)) return { labels: value };
	if (!value || typeof value !== 'object') return typeof value === 'string' ? unwrapResponse(parseJson(value)) : value;
	const record = value as Record<string, unknown>;
	if (Array.isArray(record.labels)) return record;
	for (const key of ['structured_output', 'result', 'response', 'content']) {
		if (record[key] !== undefined) return unwrapResponse(record[key]);
	}
	return value;
}

async function callClaude(prompt: string, schema: string): Promise<ReviewerCall> {
	const process = Bun.spawn([
		'claude', '-p', '--model', argument('--model', 'haiku')!, '--effort', 'low', '--restricted', '--safe-mode',
		'--no-session-persistence', '--output-format', 'json', '--json-schema', schema,
	], { stdin: new Blob([prompt]), stdout: 'pipe', stderr: 'pipe' });
	const [code, stdout, stderr] = await Promise.all([process.exited, new Response(process.stdout).text(), new Response(process.stderr).text()]);
	return { exit_code: code, stdout, stderr };
}

async function callCopilot(prompt: string): Promise<ReviewerCall> {
	const process = Bun.spawn([
		'copilot', '-p', prompt, '-s', ...(argument('--model') ? ['--model', argument('--model')!] : ['--model', 'auto', '--auto-tier', 'efficiency']),
		'--no-custom-instructions', '--disable-builtin-mcps', '--no-ask-user', '--max-ai-credits', '30',
	], { stdout: 'pipe', stderr: 'pipe' });
	const [code, stdout, stderr] = await Promise.all([process.exited, new Response(process.stdout).text(), new Response(process.stderr).text()]);
	return { exit_code: code, stdout, stderr };
}

async function callAntigravity(prompt: string, schemaPath: string): Promise<ReviewerCall> {
	const process = Bun.spawn([
		'agy', '--sandbox', '--disable-slash-commands', '--effort', 'low',
		'--output-format', 'json', '--json-schema', schemaPath, '--print', prompt,
	], { stdout: 'pipe', stderr: 'pipe' });
	const [code, stdout, stderr] = await Promise.all([process.exited, new Response(process.stdout).text(), new Response(process.stderr).text()]);
	return { exit_code: code, stdout, stderr };
}

async function callCodex(prompt: string, schemaPath: string, outputPath: string): Promise<ReviewerCall> {
	const process = Bun.spawn([
		'codex', 'exec', '-', '--ephemeral', '--skip-git-repo-check', '--sandbox', 'read-only',
		'--output-schema', schemaPath, '--output-last-message', outputPath, '--color', 'never',
	], { stdin: new Blob([prompt]), stdout: 'pipe', stderr: 'pipe' });
	const [code, stdout, stderr] = await Promise.all([process.exited, new Response(process.stdout).text(), new Response(process.stderr).text()]);
	const lastMessage = await Bun.file(outputPath).exists() ? await Bun.file(outputPath).text() : undefined;
	return { exit_code: code, stdout, stderr, last_message: lastMessage };
}

function editDistance(left: string, right: string) {
	const row = Array.from({ length: right.length + 1 }, (_, index) => index);
	for (let leftIndex = 1; leftIndex <= left.length; leftIndex++) {
		let previous = row[0]!;
		row[0] = leftIndex;
		for (let rightIndex = 1; rightIndex <= right.length; rightIndex++) {
			const saved = row[rightIndex]!;
			row[rightIndex] = Math.min(
				row[rightIndex]! + 1,
				row[rightIndex - 1]! + 1,
				previous + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
			);
			previous = saved;
		}
	}
	return row[right.length]!;
}

function validateLabels(value: unknown, items: PanelItem[]) {
	const labels = (value as { labels?: PanelLabel[] }).labels;
	if (!Array.isArray(labels)) throw new Error('Reviewer response has no labels array.');
	const expected = new Set(items.map((item) => item.id));
	let actual = new Set(labels.map((label) => label.id));
	const repairs: { returned_id: string; expected_id: string; distance: number }[] = [];
	const missing = [...expected].filter((id) => !actual.has(id));
	const unexpected = labels.filter((label) => !expected.has(label.id));
	if (missing.length === unexpected.length && missing.length > 0) {
		for (const label of unexpected) {
			const ranked = missing
				.filter((id) => !repairs.some((repair) => repair.expected_id === id))
				.map((id) => ({ id, distance: editDistance(label.id, id) }))
				.sort((left, right) => left.distance - right.distance);
			if (ranked[0] && ranked[0].distance <= 4 && (!ranked[1] || ranked[0].distance < ranked[1].distance)) {
				repairs.push({ returned_id: label.id, expected_id: ranked[0].id, distance: ranked[0].distance });
				label.id = ranked[0].id;
			}
		}
		actual = new Set(labels.map((label) => label.id));
	}
	if (labels.length !== items.length || actual.size !== items.length || [...expected].some((id) => !actual.has(id))) {
		throw new Error(`Reviewer returned ${labels.length}/${items.length} labels or mismatched ids.`);
	}
	return { labels, id_repairs: repairs };
}

async function main() {
	const reviewer = argument('--reviewer');
	if (!reviewer || !['claude', 'copilot', 'codex', 'antigravity'].includes(reviewer)) throw new Error('--reviewer must be claude, copilot, codex, or antigravity');
	const output = argument('--output', `reports/reviewer-panel-${reviewer}.json`)!;
	const chunkSize = Number(argument('--chunk-size', '40'));
	const itemsPath = argument('--items');
	const items: PanelItem[] = itemsPath ? await Bun.file(itemsPath).json() : await buildItems();
	if (!itemsPath) await Bun.write('experiments/reviewer-panel-items.json', `${JSON.stringify(items, null, 2)}\n`);
	const schemaPath = resolve('schemas/reviewer-panel.schema.json');
	const schema = await Bun.file(schemaPath).text();
	const tempDirectory = resolve('.tmp/reviewer-panel');
	const rawDirectory = resolve(argument('--raw-dir', 'reports/reviewer-panel-raw')!, reviewer);
	await mkdir(tempDirectory, { recursive: true });
	await mkdir(rawDirectory, { recursive: true });
	const labels: PanelLabel[] = [];
	for (let start = 0; start < items.length; start += chunkSize) {
		const chunk = items.slice(start, start + chunkSize);
		console.error(`${reviewer}: items ${start + 1}-${start + chunk.length}/${items.length}`);
		const prompt = promptFor(chunk, argument('--guide', 'the Google developer documentation style guide')!);
		const chunkName = `chunk-${String(start / chunkSize + 1).padStart(3, '0')}`;
		const promptPath = resolve(rawDirectory, `${chunkName}.prompt.json`);
		const responsePath = resolve(rawDirectory, `${chunkName}.response.json`);
		const labelsPath = resolve(rawDirectory, `${chunkName}.labels.json`);
		await Bun.write(promptPath, `${JSON.stringify({
			reviewer, item_start: start, item_end: start + chunk.length - 1, items: chunk, prompt,
		}, null, 2)}\n`);
		let call: ReviewerCall;
		if (await Bun.file(responsePath).exists()) {
			console.error(`${reviewer}: reusing captured ${chunkName}`);
			call = await Bun.file(responsePath).json() as ReviewerCall;
		} else {
			call = reviewer === 'claude'
				? await callClaude(prompt, schema)
				: reviewer === 'copilot'
					? await callCopilot(prompt)
					: reviewer === 'antigravity'
						? await callAntigravity(prompt, schemaPath)
						: await callCodex(prompt, schemaPath, resolve(tempDirectory, `codex-${start}.json`));
			await Bun.write(responsePath, `${JSON.stringify({
				reviewer, item_start: start, item_end: start + chunk.length - 1, captured_at: new Date().toISOString(), ...call,
			}, null, 2)}\n`);
		}
		if (call.exit_code !== 0) throw new Error(`${reviewer} failed (${call.exit_code}): ${call.stderr.slice(-2000)}`);
		const responseText = reviewer === 'codex' ? call.last_message ?? call.stdout : call.stdout;
		const value = unwrapResponse(parseJson(responseText));
		const validated = validateLabels(value, chunk);
		await Bun.write(labelsPath, `${JSON.stringify(validated, null, 2)}\n`);
		labels.push(...validated.labels);
	}
	await Bun.write(output, `${JSON.stringify({
		generated_at: new Date().toISOString(), reviewer, item_count: items.length, labels,
	}, null, 2)}\n`);
	console.error(`Wrote ${output}: ${labels.length} labels.`);
}

if (import.meta.main) main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
