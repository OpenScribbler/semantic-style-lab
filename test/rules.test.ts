import { describe, expect, test } from 'vitest';

import { parseEvalArgs } from '../src/evaluate';
import { decideStatus } from '../src/jev';
import {
	buildNoulRequest,
	composeContext,
	followingWord,
	followingWordForModifier,
} from '../src/jev-noul';
import { loadRules } from '../src/rules';
import type { Candidate } from '../src/types';

const candidate: Candidate = {
	id: 'test',
	file: 'test.md',
	line: 1,
	span: [1, 5],
	match: 'setup',
	context: '⟦Setup⟧ the provider.',
	ruleId: 'setup',
};

describe('contextual rules', () => {
	test('keeps the default fixture when only output is specified', () => {
		expect(parseEvalArgs(['--output', 'report.json'])).toEqual({
			fixturePath: 'test/fixtures/contextual-vocabulary.json',
			output: 'report.json',
			runs: 1,
			strategy: 'choice',
			split: 'all',
		});
	});

	test('accepts a held-out fixture split', () => {
		expect(parseEvalArgs(['--split', 'heldout']).split).toBe('heldout');
	});

	test('accepts the atomic Noul evaluation strategy', () => {
		expect(parseEvalArgs(['--strategy', 'noul', '--runs', '3']).strategy).toBe('noul');
	});

	test('loads and validates the three initial rules', async () => {
		const rules = await loadRules();
		expect(rules.map((rule) => rule.id)).toEqual(['command-line', 'real-time', 'setup']);
	});

	test('builds independent semantic signals and composes policy contexts', async () => {
		const rules = await loadRules();
		const request = buildNoulRequest([candidate], rules);
		expect(Object.keys(request.questions)).toEqual([
			'test__literal',
			'test__modifies_following_noun',
			'test__verb_phrase',
		]);
		const setup = rules.find((rule) => rule.id === 'setup')!;
		expect(
			composeContext(setup, {
				literal: 0.02,
				verb_phrase: 0.96,
				modifies_following_noun: 0.03,
			}),
		).toEqual({ context: 'verb_phrase', probability: 0.96 });
		expect(
			composeContext(setup, {
				literal: 0.99,
				verb_phrase: 0.01,
				modifies_following_noun: 0.8,
			}),
		).toEqual({ context: 'literal', probability: 0.99 });
	});

	test('extracts only an actual word after the marked occurrence', () => {
		expect(followingWord('Use the ⟦command line⟧ interface.')).toBe('interface');
		expect(followingWord('Updates arrive in ⟦real time⟧.')).toBeNull();
		expect(followingWordForModifier('The ⟦command line⟧ itself changed.')).toBeNull();
		expect(followingWordForModifier('Updates arrive in ⟦real time⟧ by polling.')).toBeNull();
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
