import { classifyCandidates } from './jev';
import { classifyCandidatesWithNoul } from './jev-noul';
import { loadRules } from './rules';
import { extractCandidates } from './vale';

const args = process.argv.slice(2);
const json = args.includes('--json');
const strategyIndex = args.indexOf('--strategy');
const strategy = strategyIndex >= 0 ? args[strategyIndex + 1] : 'noul';
const outputIndex = args.indexOf('--output');
const output = outputIndex >= 0 ? args[outputIndex + 1] : undefined;
if (!['choice', 'noul'].includes(strategy ?? '')) {
	console.error('--strategy must be choice or noul');
	process.exit(2);
}
if (outputIndex >= 0 && !output) {
	console.error('--output requires a path');
	process.exit(2);
}
const files = args.filter(
	(argument, index) =>
		!argument.startsWith('--') && index !== strategyIndex + 1 && index !== outputIndex + 1,
);
if (files.length === 0) {
	console.error(
		'Usage: bun run audit -- <file...> [--json] [--strategy choice|noul] [--output report.json]',
	);
	process.exit(2);
}

const rules = await loadRules();
const candidates = await extractCandidates(files, rules);
const result =
	strategy === 'noul'
		? await classifyCandidatesWithNoul(candidates, rules)
		: await classifyCandidates(candidates, rules);
const report = {
	generated_at: new Date().toISOString(),
	files,
	candidate_count: candidates.length,
	model: result.model,
	strategy,
	strategy_version: result.strategyVersion,
	usage: result.usage,
	findings: result.results.filter((item) => item.status !== 'pass' && item.status !== 'preserve'),
	classifications: result.results,
};

if (output) {
	await Bun.write(output, `${JSON.stringify(report, null, 2)}\n`);
	console.error(`Wrote ${output}`);
} else if (json) console.log(JSON.stringify(report, null, 2));
else {
	console.log(`${candidates.length} candidates; ${report.findings.length} findings (${result.model})`);
	for (const item of report.findings) {
		console.log(
			`${item.candidate.file}:${item.candidate.line} ${item.status.toUpperCase()} ${item.candidate.match} → ${item.expectedForm ?? 'human review'} (${item.choice}, ${item.probability.toFixed(2)})`,
		);
	}
}
