import remarkMdx from 'remark-mdx';
import remarkParse from 'remark-parse';
import { unified } from 'unified';

export type MdxSourceClass =
	| 'prose'
	| 'frontmatter'
	| 'fenced_or_indented_code'
	| 'inline_code'
	| 'mdx_module_syntax'
	| 'mdx_expression'
	| 'jsx_or_html_tag'
	| 'code_or_pre_block'
	| 'link_destination_or_entity'
	| 'unparseable_mdx';

interface PositionedNode {
	type?: string;
	position?: { start?: { offset?: number }; end?: { offset?: number } };
	[key: string]: unknown;
}

interface ProtectedRange {
	start: number;
	end: number;
	kind: Exclude<MdxSourceClass, 'prose' | 'unparseable_mdx'>;
}

const astKinds = new Map<string, ProtectedRange['kind']>([
	['code', 'fenced_or_indented_code'],
	['inlineCode', 'inline_code'],
	['mdxjsEsm', 'mdx_module_syntax'],
	['mdxFlowExpression', 'mdx_expression'],
	['mdxTextExpression', 'mdx_expression'],
	['mdxJsxAttributeValueExpression', 'mdx_expression'],
]);

function addRange(ranges: ProtectedRange[], start: number | undefined, end: number | undefined, kind: ProtectedRange['kind']) {
	if (typeof start === 'number' && typeof end === 'number' && end > start) ranges.push({ start, end, kind });
}

function walk(value: unknown, ranges: ProtectedRange[], seen = new Set<object>()) {
	if (!value || typeof value !== 'object' || seen.has(value)) return;
	seen.add(value);
	const node = value as PositionedNode;
	const kind = node.type && astKinds.get(node.type);
	if (kind) addRange(ranges, node.position?.start?.offset, node.position?.end?.offset, kind);
	for (const [key, child] of Object.entries(node)) {
		if (key !== 'position' && key !== 'data') walk(child, ranges, seen);
	}
}

function regexRanges(source: string, pattern: RegExp, kind: ProtectedRange['kind'], ranges: ProtectedRange[], inner?: (match: RegExpExecArray) => [number, number]) {
	for (const match of source.matchAll(pattern)) {
		const index = match.index!;
		const [start, end] = inner ? inner(match) : [index, index + match[0].length];
		addRange(ranges, start, end, kind);
	}
}

function frontmatterRange(source: string, ranges: ProtectedRange[]) {
	if (!source.startsWith('---\n') && !source.startsWith('---\r\n')) return;
	const match = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/.exec(source);
	if (match) addRange(ranges, 0, match[0].length, 'frontmatter');
}

function lexicalRanges(source: string, ranges: ProtectedRange[]) {
	frontmatterRange(source, ranges);
	regexRanges(source, /<(?:script|style|pre|code)\b[^>]*>[\s\S]*?<\/(?:script|style|pre|code)\s*>/gi, 'code_or_pre_block', ranges);
	regexRanges(source, /<\/?[A-Za-z][^>]*>|<>|<\/>/g, 'jsx_or_html_tag', ranges);
	regexRanges(source, /&(?:#[0-9]+|#x[0-9a-f]+|[A-Za-z][A-Za-z0-9]+);/gi, 'link_destination_or_entity', ranges);
	regexRanges(source, /\]\((?:\\.|[^)])*\)/g, 'link_destination_or_entity', ranges, (match) => {
		const start = match.index! + 2;
		return [start, match.index! + match[0].length - 1];
	});
	regexRanges(source, /<https?:\/\/[^>]+>/gi, 'link_destination_or_entity', ranges);
}

export function classifyMdxOffset(source: string, offset: number): MdxSourceClass {
	if (offset < 0 || offset >= source.length) throw new RangeError(`Offset ${offset} is outside the source.`);
	const ranges: ProtectedRange[] = [];
	try {
		const tree = unified().use(remarkParse).use(remarkMdx).parse(source);
		walk(tree, ranges);
	} catch {
		return 'unparseable_mdx';
	}
	lexicalRanges(source, ranges);
	const matches = ranges.filter((range) => offset >= range.start && offset < range.end);
	if (!matches.length) return 'prose';
	return matches.sort((left, right) => (left.end - left.start) - (right.end - right.start))[0]!.kind;
}

export function offsetAtLineColumn(source: string, line: number, column: number) {
	if (line < 1 || column < 0) throw new RangeError('Line is one-based and column is zero-based.');
	let offset = 0;
	for (let current = 1; current < line; current++) {
		const newline = source.indexOf('\n', offset);
		if (newline < 0) throw new RangeError(`Line ${line} is outside the source.`);
		offset = newline + 1;
	}
	return offset + column;
}
