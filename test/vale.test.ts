import { describe, expect, test } from 'vitest';

import { loadRules } from '../src/rules';
import { extractCandidates } from '../src/vale';

describe('Vale candidate extraction', () => {
	test('enumerates contextual variants while skipping inline code', async () => {
		const candidates = await extractCandidates(
			['test/corpus/contextual-vocabulary.md'],
			await loadRules(),
		);
		expect(candidates.length).toBe(7);
		expect(candidates.map((candidate) => candidate.match.toLowerCase())).not.toContain('`setup`');
		expect(new Set(candidates.map((candidate) => candidate.ruleId))).toEqual(
			new Set(['setup', 'command-line', 'real-time']),
		);
		expect(candidates[0].context).toContain('⟦Set up⟧');
		expect(candidates[1].context).toContain('the ⟦set up⟧');
	});
});
