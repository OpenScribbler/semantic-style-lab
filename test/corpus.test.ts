import { describe, expect, test } from 'vitest';

import { expandSeeds } from '../src/build-real-world-fixtures';

describe('real-world counterfactual corpus', () => {
	test('keeps surface variants together and preserves provenance', async () => {
		const seeds = await Bun.file('corpus/real-world-seeds.json').json();
		const sources = await Bun.file('corpus/sources.json').json();
		const fixtures = expandSeeds(seeds, sources);
		expect(fixtures).toHaveLength(140);
		expect(fixtures.filter((fixture) => fixture.split === 'dev')).toHaveLength(70);
		expect(fixtures.filter((fixture) => fixture.split === 'heldout')).toHaveLength(70);
		expect(new Set(fixtures.map((fixture) => fixture.source.revision)).size).toBe(3);
		for (const seed of seeds) {
			const family = fixtures.filter((fixture) => fixture.seed_id === seed.id);
			expect(new Set(family.map((fixture) => fixture.split))).toEqual(new Set([seed.split]));
			expect(new Set(family.map((fixture) => fixture.expected_context))).toEqual(
				new Set([seed.expected_context]),
			);
		}
	});
});
