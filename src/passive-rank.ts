import { resolve } from 'node:path';

import { PASSIVE_QUESTIONS } from './passive-lab';

// Rank mode for passive findings: a logistic model over run-mean Jev answers,
// trained offline by experiments/passive/export_weights.py. It orders the
// review list and never suppresses, because no gate passed on unseen pages.

export const PASSIVE_GUIDES = ['google', 'microsoft', 'redhat'] as const;
export type PassiveGuide = typeof PASSIVE_GUIDES[number];

export interface PassivePolicy {
	schema_version: 1;
	guide: PassiveGuide;
	model: 'logistic';
	runs: number;
	training: { items: number; violations: number; labels: string };
	questions: string[];
	features: { name: string; mean: number; sd: number; weight: number }[];
	bias: number;
}

// One run's answers: question -> Noul probability, or Choice option -> probability.
export type PassiveAnswers = Record<string, number | Record<string, number>>;

export async function loadPassivePolicy(guide: PassiveGuide): Promise<PassivePolicy> {
	const policy = await Bun.file(resolve(import.meta.dir, '../policies', `passive-${guide}.json`)).json() as PassivePolicy;
	for (const name of policy.questions) if (!PASSIVE_QUESTIONS[name]) throw new Error(`passive-${guide}.json asks unknown question ${name}.`);
	return policy;
}

function featureValue(runs: PassiveAnswers[], name: string) {
	const [question, option] = name.split('.', 2) as [string, string | undefined];
	const values = runs.flatMap((run) => {
		const answer = run[question];
		if (answer === undefined) return [];
		const value = option === undefined ? answer : typeof answer === 'object' ? answer[option] : undefined;
		return typeof value === 'number' ? [value] : [];
	});
	// A question no run answered reads 0.5, as in training.
	return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0.5;
}

export function passiveViolationProbability(policy: PassivePolicy, runs: PassiveAnswers[]) {
	const score = policy.features.reduce((sum, feature) => sum + feature.weight * (featureValue(runs, feature.name) - feature.mean) / feature.sd, policy.bias);
	return 1 / (1 + Math.exp(-score));
}
