import { describe, expect, test } from 'vitest';

import { parseEvalArgs } from '../src/evaluate';
import { decideStatus } from '../src/jev';
import { loadRules } from '../src/rules';
import type { Candidate } from '../src/types';

const candidate: Candidate = {
	id: 'test',
	file: 'test.md',
	line: 1,
	span: [1, 5],
	match: 'setup',
	context: 'Setup the provider.',
	ruleId: 'setup',
};

describe('contextual rules', () => {
	test('keeps the default fixture when only output is specified', () => {
		expect(parseEvalArgs(['--output', 'report.json'])).toEqual({
			fixturePath: 'test/fixtures/contextual-vocabulary.json',
			output: 'report.json',
			runs: 1,
		});
	});

	test('loads and validates the three initial rules', async () => {
		const rules = await loadRules();
		expect(rules.map((rule) => rule.id)).toEqual(['command-line', 'real-time', 'setup']);
	});

	test('flags a confident mismatch', async () => {
		const setup = (await loadRules()).find((rule) => rule.id === 'setup')!;
		expect(decideStatus(candidate, setup, 'verb_phrase', 0.95)).toEqual({
			expectedForm: 'set up',
			status: 'flag',
		});
	});

	test('passes the expected form and preserves literals', async () => {
		const setup = (await loadRules()).find((rule) => rule.id === 'setup')!;
		expect(decideStatus({ ...candidate, match: 'set up' }, setup, 'verb_phrase', 0.95).status).toBe(
			'pass',
		);
		expect(decideStatus(candidate, setup, 'literal', 0.95).status).toBe('preserve');
	});

	test('separates low-confidence mismatches from review candidates', async () => {
		const setup = (await loadRules()).find((rule) => rule.id === 'setup')!;
		expect(decideStatus(candidate, setup, 'verb_phrase', 0.4).status).toBe('uncertain');
		expect(decideStatus(candidate, setup, 'verb_phrase', 0.6).status).toBe('review');
	});
});
