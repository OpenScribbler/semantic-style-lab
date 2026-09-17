import type { ContextualRule } from './types';

function assertProbability(value: unknown, field: string, file: string): asserts value is number {
	if (typeof value !== 'number' || value < 0 || value > 1) {
		throw new Error(`${file}: ${field} must be between 0 and 1`);
	}
}

export function validateRule(value: unknown, file = 'rule'): asserts value is ContextualRule {
	if (!value || typeof value !== 'object') throw new Error(`${file}: rule must be an object`);
	const rule = value as Partial<ContextualRule>;
	for (const field of ['id', 'label', 'vale_check', 'question'] as const) {
		if (typeof rule[field] !== 'string' || !rule[field]) throw new Error(`${file}: missing ${field}`);
	}
	if (!Array.isArray(rule.variants) || rule.variants.length === 0) {
		throw new Error(`${file}: variants must not be empty`);
	}
	if (!rule.contexts || typeof rule.contexts !== 'object' || Object.keys(rule.contexts).length < 2) {
		throw new Error(`${file}: contexts must contain at least two choices`);
	}
	for (const [name, context] of Object.entries(rule.contexts)) {
		if (!context.description) throw new Error(`${file}: context ${name} needs a description`);
		if (context.preserve && context.expected) {
			throw new Error(`${file}: context ${name} cannot preserve and replace`);
		}
	}
	assertProbability(rule.review_at, 'review_at', file);
	assertProbability(rule.flag_at, 'flag_at', file);
	if (rule.flag_at < rule.review_at) throw new Error(`${file}: flag_at must be at least review_at`);
}

export async function loadRules(directory = 'rules/contextual-vocabulary') {
	const rules: ContextualRule[] = [];
	for await (const path of new Bun.Glob('*.yaml').scan({ cwd: directory, absolute: true })) {
		const parsed = Bun.YAML.parse(await Bun.file(path).text());
		validateRule(parsed, path);
		rules.push(parsed);
	}
	return rules.sort((left, right) => left.id.localeCompare(right.id));
}
