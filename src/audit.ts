import { classifyCandidates } from './jev';
import { loadRules } from './rules';
import { extractCandidates } from './vale';

const args = process.argv.slice(2);
const json = args.includes('--json');
const files = args.filter((argument) => !argument.startsWith('--'));
if (files.length === 0) {
	console.error('Usage: bun run audit -- <file...> [--json]');
	process.exit(2);
}

const rules = await loadRules();
const candidates = await extractCandidates(files, rules);
const result = await classifyCandidates(candidates, rules);
const report = {
	generated_at: new Date().toISOString(),
	files,
	candidate_count: candidates.length,
	model: result.model,
	usage: result.usage,
	findings: result.results.filter((item) => item.status !== 'pass' && item.status !== 'preserve'),
	classifications: result.results,
};

if (json) console.log(JSON.stringify(report, null, 2));
else {
	console.log(`${candidates.length} candidates; ${report.findings.length} findings (${result.model})`);
	for (const item of report.findings) {
		console.log(
			`${item.candidate.file}:${item.candidate.line} ${item.status.toUpperCase()} ${item.candidate.match} → ${item.expectedForm ?? 'human review'} (${item.choice}, ${item.probability.toFixed(2)})`,
		);
	}
}
