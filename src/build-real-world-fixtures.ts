import type { Fixture } from './types';

interface SourceRecord {
	name: string;
	repository: string;
	revision: string;
	root: string;
	license: string;
	license_url: string;
}

interface Seed extends Omit<Fixture, 'source' | 'split'> {
	split: 'dev' | 'heldout';
	source: string;
	path: string;
	line: number;
}

const variants: Record<string, string[]> = {
	setup: ['set up', 'setup', 'set-up'],
	'command-line': ['command line', 'command-line'],
	'real-time': ['real time', 'real-time'],
};

function preserveInitialCase(original: string, replacement: string) {
	return /^[A-Z]/.test(original)
		? replacement[0]!.toLocaleUpperCase() + replacement.slice(1)
		: replacement;
}

export function expandSeeds(seeds: Seed[], sources: Record<string, SourceRecord>) {
	return seeds.flatMap((seed) => {
		if (!seed.text.includes(seed.match)) throw new Error(`${seed.id}: match not found in text`);
		const source = sources[seed.source];
		if (!source) throw new Error(`${seed.id}: unknown source ${seed.source}`);
		const familyVariants = variants[seed.rule];
		if (!familyVariants) throw new Error(`${seed.id}: unknown rule ${seed.rule}`);
		return familyVariants.map((rawVariant, variantIndex) => {
			const variant = preserveInitialCase(seed.match, rawVariant);
			return {
				id: `${seed.id}-v${variantIndex + 1}`,
				rule: seed.rule,
				text: seed.text.replace(seed.match, variant),
				match: variant,
				expected_context: seed.expected_context,
				split: seed.split,
				seed_id: seed.id,
				counterfactual: variant.toLocaleLowerCase() !== seed.match.toLocaleLowerCase(),
				source: {
					project: seed.source,
					name: source.name,
					revision: source.revision,
					path: seed.path,
					line: seed.line,
					url: `${source.repository}/blob/${source.revision}/${source.root}/${seed.path}#L${seed.line}`,
					license: source.license,
					license_url: source.license_url,
				},
			};
		});
	});
}

async function main() {
	const seeds = (await Bun.file('corpus/real-world-seeds.json').json()) as Seed[];
	const sources = (await Bun.file('corpus/sources.json').json()) as Record<string, SourceRecord>;
	const fixtures = expandSeeds(seeds, sources);
	await Bun.write(
		'test/fixtures/real-world-contextual-vocabulary.json',
		`${JSON.stringify(fixtures, null, 2)}\n`,
	);
	console.error(`Wrote ${fixtures.length} fixtures from ${seeds.length} source occurrences.`);
}

if (import.meta.main) main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
