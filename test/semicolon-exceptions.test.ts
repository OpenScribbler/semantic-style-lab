import { describe, expect, test } from 'vitest';

import { buildExceptionRequest, composeExceptionAction } from '../src/run-semicolon-exception-experiment';

const rule = {
	id: 'test',
	source: { default: 'Avoid semicolons.', url: 'https://example.com' },
	semantic_exceptions: [{ id: 'allowed', instructions: 'Is this allowed?', true_criteria: 'Allowed.', false_criteria: 'Not allowed.' }],
	composition: { suppress_if_any_exception_at_or_above: 0.75, review_if_any_exception_at_or_above: 0.4, otherwise: 'flag' as const },
	prompt_examples: [],
};

describe('semicolon exception compiler', () => {
	test('composes exception support conservatively', () => {
		expect(composeExceptionAction(0.8, rule)).toBe('suppress');
		expect(composeExceptionAction(0.5, rule)).toBe('review');
		expect(composeExceptionAction(0.2, rule)).toBe('flag');
	});

	test('keeps evaluation labels out of the Jev request', () => {
		const candidate = {
			id: 'case', origin: 'fixture', expected: 'acceptable' as const, expected_exception: 'allowed',
			passage: 'First clause; second clause.', marked_passage: 'First clause⟦;⟧ second clause.', left: 'First clause', right: 'second clause.',
		};
		const request = buildExceptionRequest([candidate], rule);
		expect(JSON.stringify(request)).not.toContain('acceptable');
		expect(JSON.stringify(request)).not.toContain('expected_exception');
		expect(request.state.prompt_examples).toEqual([]);
		expect(Object.keys(request.questions)).toEqual(['c1__allowed']);
	});

	test('records no unsafe suppressions in the held-out benchmark', async () => {
		const report = await Bun.file('reports/semicolon-exception-experiment.json').json();
		expect(report.metrics.unsafe_suppressions).toBe(0);
		expect(report.metrics.true_finding_retention).toBe(1);
		expect(report.metrics.acceptable_auto_suppressed).toBe(4);
		expect(report.metrics.acceptable).toBe(5);
	});

	test('keeps the ambiguous close-clause exception review-only', async () => {
		const compiled = await Bun.file('compiled-rules/google-semicolons-calibrated.json').json();
		const closeClauses = compiled.exceptions.find((item: { id: string }) => item.id === 'preferred_close_clauses');
		expect(closeClauses.suppress_at_or_above).toBeNull();
		expect(closeClauses.review_at_or_above).toBe(0.4);
	});
});
