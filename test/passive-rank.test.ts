import { mkdtemp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, describe, expect, test } from 'vitest';

import { loadPassivePolicy, PASSIVE_GUIDES, passiveViolationProbability } from '../src/passive-rank';
import type { PassiveAnswers } from '../src/passive-rank';
import { loadStyleLabConfig, RULE_IDS } from '../src/style-lab-config';

const temporary: string[] = [];

afterEach(async () => {
	await Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function config(extra: Record<string, unknown>) {
	const directory = await mkdtemp(resolve(tmpdir(), 'style-lab-passive-'));
	temporary.push(directory);
	await Bun.write(resolve(directory, 'style-lab.config.json'), JSON.stringify({
		schema_version: 1,
		projects: [{ name: 'fixture', root: '.', include: ['**/*.md'] }],
		...extra,
	}));
	return loadStyleLabConfig(resolve(directory, 'style-lab.config.json'));
}

describe('passive rank mode', () => {
	// Real k8s run answers; expected values come from experiments/passive/lrgate.py
	// with the frozen set 6 settings (Microsoft, Red Hat) or the exported Google model.
	test('reproduces the Python model on real Jev answers', async () => {
		const fixture = await Bun.file(resolve(import.meta.dir, 'fixtures/passive-rank.json')).json() as Record<string, { id: string; runs: PassiveAnswers[]; expected: number }[]>;
		for (const guide of PASSIVE_GUIDES) {
			const policy = await loadPassivePolicy(guide);
			expect(fixture[guide]).toHaveLength(4);
			for (const item of fixture[guide]!) expect(passiveViolationProbability(policy, item.runs)).toBeCloseTo(item.expected, 4);
		}
	});

	test('reads an unanswered question as 0.5, as training did', async () => {
		const policy = await loadPassivePolicy('redhat');
		const expected = 1 / (1 + Math.exp(-policy.features.reduce((sum, feature) => sum + feature.weight * (0.5 - feature.mean) / feature.sd, policy.bias)));
		expect(passiveViolationProbability(policy, [{}, {}, {}])).toBeCloseTo(expected, 10);
	});

	test('defaults to every rule and review-only passive handling', async () => {
		const loaded = await config({});
		expect(loaded.rules).toEqual([...RULE_IDS]);
		expect(loaded.passive).toEqual({ mode: 'review' });
	});

	test('accepts a rule subset and a ranked guide', async () => {
		const loaded = await config({ rules: ['google-semicolons', 'google-passive-hidden-actor'], passive: { mode: 'rank', guide: 'microsoft' } });
		expect(loaded.rules).toEqual(['google-semicolons', 'google-passive-hidden-actor']);
		expect(loaded.passive).toEqual({ mode: 'rank', guide: 'microsoft' });
	});

	test('rejects unknown rules, unknown guides, and rank mode without a guide', async () => {
		await expect(config({ rules: ['oxford-comma'] })).rejects.toThrow('unknown rule oxford-comma');
		await expect(config({ passive: { mode: 'rank', guide: 'chicago' } })).rejects.toThrow('passive.guide must be one of');
		await expect(config({ passive: { mode: 'rank' } })).rejects.toThrow('passive.guide is required');
		await expect(config({ passive: { mode: 'suppress', guide: 'google' } })).rejects.toThrow('passive.mode must be review or rank');
	});
});
