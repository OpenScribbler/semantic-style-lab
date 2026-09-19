import { describe, expect, test } from 'vitest';

describe('human calibration artifacts', () => {
	test('preserves every requested human decision', async () => {
		const calibration = await Bun.file('reports/human-calibration.json').json();
		expect(Object.keys(calibration.policies)).toHaveLength(5);
		expect(Object.keys(calibration.cases)).toHaveLength(8);
	});

	test('records the observed global-threshold failure', async () => {
		const analysis = await Bun.file('reports/human-calibration-analysis.json').json();
		expect(analysis.counts.panel_agreements).toBe(5);
		expect(analysis.counts.decisive_spot_checks).toBe(7);
		expect(analysis.counts.unsafe_suppressions_observed).toBe(1);
		expect(analysis.comparisons).toContainEqual(expect.objectContaining({
			id: 'vale:getting-started/core-concepts.mdx:6:Google.Semicolons:321:;',
			human_verdict: 'violation',
			provisional_action: 'suppress',
			action_assessment: 'unsafe_suppression',
		}));
	});

	test('turns project preferences into explicit routing policy', async () => {
		const policy = await Bun.file('policies/syllago-google-style.json').json();
		expect(policy.rules['Google.WordList:CLI'].routing).toBe('deterministic_override');
		expect(policy.rules['Google.Semicolons'].routing).toBe('compiled_exception_filter');
		expect(policy.rules['Google.Passive'].decision).toBe('hidden-actor');
	});
});
