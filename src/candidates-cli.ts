import { loadRules } from './rules';
import { extractCandidates } from './vale';

const files = process.argv.slice(2);
if (files.length === 0) {
	console.error('Usage: bun run candidates -- <file...>');
	process.exit(2);
}

const candidates = await extractCandidates(files, await loadRules());
console.log(JSON.stringify({ candidate_count: candidates.length, candidates }, null, 2));
