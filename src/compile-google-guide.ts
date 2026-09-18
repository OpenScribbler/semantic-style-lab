import { load } from 'cheerio';

type Engine = 'deterministic' | 'structural' | 'hybrid' | 'semantic' | 'reference';

const BASE_URL = 'https://developers.google.com';
const INDEX_URL = `${BASE_URL}/style`;
const directive = /^(?:always|avoid|choose|do not|don't|ensure|include|keep|make|never|prefer|put|spell|use|write)\b/i;

const structural = new Set([
	'accessibility',
	'code-samples',
	'cross-references',
	'filenames',
	'headings',
	'headings-targets',
	'html-formatting',
	'images',
	'lists',
	'markdown',
	'semantic-tagging',
	'tables',
	'text-formatting',
]);
const deterministic = new Set([
	'capitalization',
	'colons',
	'commas',
	'dashes',
	'dates-times',
	'ellipses',
	'hyphens',
	'mathematical-notation',
	'numbers',
	'parentheses',
	'periods',
	'phone-numbers',
	'quotation-marks',
	'semicolons',
	'slashes',
	'spelling',
	'units-of-measure',
]);
const semantic = new Set([
	'anthropomorphism',
	'excessive-claims',
	'future',
	'inclusive-documentation',
	'jargon',
	'paragraph-structure',
	'person',
	'prescriptive-documentation',
	'pronouns',
	'sentence-structure',
	'timeless-documentation',
	'tone',
	'translation',
	'voice',
]);
const reference = new Set(['highlights', 'other-sources', 'philosophy', 'whats-new']);

function engineFor(slug: string): Engine {
	if (reference.has(slug)) return 'reference';
	if (semantic.has(slug)) return 'semantic';
	if (structural.has(slug)) return 'structural';
	if (deterministic.has(slug)) return 'deterministic';
	return 'hybrid';
}

async function fetchHtml(url: string) {
	const response = await fetch(url);
	if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
	return response.text();
}

async function mapLimit<T, U>(items: T[], limit: number, fn: (item: T) => Promise<U>) {
	const output: U[] = new Array(items.length);
	let next = 0;
	await Promise.all(
		Array.from({ length: Math.min(limit, items.length) }, async () => {
			while (next < items.length) {
				const index = next++;
				output[index] = await fn(items[index]!);
			}
		}),
	);
	return output;
}

function parseValeCoverage(directory?: string) {
	if (!directory) return Promise.resolve<Record<string, string[]>>({});
	return Array.fromAsync(new Bun.Glob('*.yml').scan({ cwd: directory, absolute: true })).then(
		async (paths) => {
			const coverage: Record<string, string[]> = {};
			for (const path of paths) {
				const source = await Bun.file(path).text();
				const link = source.match(/^link:\s*['"]?(https:\/\/developers\.google\.com\/style\/([^'"\s]+))/m);
				if (!link) continue;
				const slug = link[2]!;
				(coverage[slug] ??= []).push(path.split('/').at(-1)!.replace(/\.yml$/, ''));
			}
			return coverage;
		},
	);
}

async function main() {
	const valeIndex = process.argv.indexOf('--vale-dir');
	const valeDirectory = valeIndex >= 0 ? process.argv[valeIndex + 1] : undefined;
	if (valeIndex >= 0 && !valeDirectory) throw new Error('--vale-dir requires a directory');
	const indexHtml = await fetchHtml(INDEX_URL);
	const index = load(indexHtml);
	const slugs = [
		...new Set(
			index('a[href^="/style/"]')
				.map((_, element) => index(element).attr('href')?.match(/^\/style\/([a-z0-9-]+)$/)?.[1])
				.get()
				.filter(Boolean),
		),
	].sort();
	const valeCoverage = await parseValeCoverage(valeDirectory);
	const pages = await mapLimit(slugs, 8, async (slug) => {
		const url = `${BASE_URL}/style/${slug}`;
		const $ = load(await fetchHtml(url));
		const article = $('.devsite-article-body').first();
		article.find('pre,script,style,devsite-ai-page-summary').remove();
		const actionableCandidateCount = article
			.find('p,li,dd')
			.toArray()
			.filter((element) => {
				const item = $(element);
				if (item.hasClass('example') || item.find('.compare-better,.compare-worse').length) return false;
				return directive.test(item.text().replace(/\s+/g, ' ').trim());
			}).length;
		return {
			slug,
			title: $('h1.devsite-page-title').first().text().replace(/\s+/g, ' ').trim(),
			url,
			primary_engine: engineFor(slug),
			heading_count: article.find('h2,h3,h4').length,
			actionable_candidate_count: actionableCandidateCount,
			word_list_entries: slug === 'word-list' ? article.find('dt[id]').length : undefined,
			vale_rules: valeCoverage[slug] ?? [],
			status: (valeCoverage[slug]?.length ?? 0) > 0 ? 'partially_implemented' : 'inventoried',
		};
	});
	const byEngine = Object.fromEntries(
		(['deterministic', 'structural', 'hybrid', 'semantic', 'reference'] as Engine[]).map(
			(engine) => [engine, pages.filter((page) => page.primary_engine === engine).length],
		),
	);
	const inventory = {
		generated_at: new Date().toISOString(),
		source: INDEX_URL,
		page_count: pages.length,
		word_list_entries: pages.find((page) => page.slug === 'word-list')?.word_list_entries ?? 0,
		actionable_candidate_count: pages.reduce(
			(total, page) => total + page.actionable_candidate_count,
			0,
		),
		vale_rule_count: new Set(Object.values(valeCoverage).flat()).size,
		by_primary_engine: byEngine,
		pages,
	};
	await Bun.write('google-guide/inventory.json', `${JSON.stringify(inventory, null, 2)}\n`);
	console.error(
		`Inventoried ${inventory.page_count} pages, ${inventory.word_list_entries} word-list entries, and ${inventory.actionable_candidate_count} directive candidates.`,
	);
}

if (import.meta.main) main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
