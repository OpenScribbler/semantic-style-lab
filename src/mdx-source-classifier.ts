import remarkMdx from 'remark-mdx';
import remarkParse from 'remark-parse';
import { unified } from 'unified';

export type MarkdownFormat = 'markdown' | 'mdx';
export type SourceParser = 'markdown_ast' | 'mdx_ast' | 'lexical_fallback' | 'unparsed';

export type MdxSourceClass =
	| 'prose'
	| 'frontmatter'
	| 'fenced_or_indented_code'
	| 'inline_code'
	| 'mdx_module_syntax'
	| 'mdx_expression'
	| 'jsx_or_html_tag'
	| 'html_comment'
	| 'template_syntax'
	| 'code_or_pre_block'
	| 'link_destination_or_entity'
	| 'unparsed_source';

interface PositionedNode {
	type?: string;
	position?: { start?: { offset?: number }; end?: { offset?: number } };
	[key: string]: unknown;
}

interface ProtectedRange {
	start: number;
	end: number;
	kind: Exclude<MdxSourceClass, 'prose' | 'unparsed_source'>;
}

interface OffsetRange {
	start: number;
	end: number;
}

export interface SourceClassifier {
	format: MarkdownFormat;
	parser: SourceParser;
	degraded: boolean;
	parse_error?: string;
	classify(offset: number): MdxSourceClass;
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

function frontmatterInfo(source: string) {
	const opener = source.startsWith('---\n') || source.startsWith('---\r\n')
		? '---'
		: source.startsWith('+++\n') || source.startsWith('+++\r\n')
			? '+++'
			: null;
	if (!opener) return null;
	const escaped = opener.replaceAll('+', '\\+');
	const match = new RegExp(`^${escaped}\\r?\\n[\\s\\S]*?\\r?\\n${escaped}(?:\\r?\\n|$)`).exec(source);
	if (!match) return null;
	return { start: 0, end: match[0].length, syntax: opener === '---' ? 'yaml' as const : 'toml' as const };
}

function renderedFrontmatterRanges(source: string, frontmatter: ReturnType<typeof frontmatterInfo>) {
	const ranges: OffsetRange[] = [];
	if (!frontmatter) return ranges;
	const block = source.slice(frontmatter.start, frontmatter.end);
	const pattern = frontmatter.syntax === 'yaml'
		? /^(title|description)[ \t]*:[ \t]*(.*)$/gmi
		: /^(title|description)[ \t]*=[ \t]*(.*)$/gmi;
	for (const match of block.matchAll(pattern)) {
		const lineStart = match.index!;
		const value = match[2] ?? '';
		const valueStart = lineStart + match[0].length - value.length;
		if (value && !/^[>|][-+]?\s*$/.test(value)) {
			ranges.push({ start: valueStart, end: valueStart + value.length });
			continue;
		}
		if (frontmatter.syntax !== 'yaml') continue;
		let cursor = lineStart + match[0].length;
		while (cursor < block.length) {
			const newlineLength = block.startsWith('\r\n', cursor) ? 2 : block[cursor] === '\n' ? 1 : 0;
			if (!newlineLength) break;
			const nextStart = cursor + newlineLength;
			const nextEndRaw = block.indexOf('\n', nextStart);
			const nextEnd = nextEndRaw < 0 ? block.length : nextEndRaw;
			const line = block.slice(nextStart, nextEnd).replace(/\r$/, '');
			const content = /^(\s+)(.*)$/.exec(line);
			if (!content) break;
			if (content[2]) ranges.push({ start: nextStart + content[1].length, end: nextStart + line.length });
			cursor = nextEnd;
		}
	}
	return ranges;
}

function lexicalRanges(source: string, ranges: ProtectedRange[], format: MarkdownFormat, protectMarkdownCodeLexically: boolean) {
	const frontmatter = frontmatterInfo(source);
	if (frontmatter) addRange(ranges, frontmatter.start, frontmatter.end, 'frontmatter');
	// AST code nodes are authoritative when parsing succeeds. Markdown permits
	// indented prose inside list items, so the lexical four-space heuristic is
	// only safe as a degraded fallback.
	if (protectMarkdownCodeLexically) {
		regexRanges(source, /^(?: {0,3})(?:`{3,}|~{3,})[^\n]*(?:\r?\n[\s\S]*?)?^(?: {0,3})(?:`{3,}|~{3,})[ \t]*$/gm, 'fenced_or_indented_code', ranges);
		regexRanges(source, /^(?:(?: {4}|\t).*(?:\r?\n|$))+/gm, 'fenced_or_indented_code', ranges);
		regexRanges(source, /(`+)(?!`)[\s\S]*?\1/g, 'inline_code', ranges);
	}
	regexRanges(source, /{{[<%][\s\S]*?[>%]}}/g, 'template_syntax', ranges);
	// A Hugo mermaid shortcode body is diagram source, not prose.
	regexRanges(source, /{{<\s*mermaid\b[^}]*>}}[\s\S]*?{{<\s*\/mermaid\s*>}}/g, 'code_or_pre_block', ranges);
	regexRanges(source, /<!--(?:[\s\S]*?)-->/g, 'html_comment', ranges);
	if (format === 'mdx') {
		regexRanges(source, /^(?:import|export)\b[^;\n]*(?:;|\r?\n|$)/gm, 'mdx_module_syntax', ranges);
		regexRanges(source, /^(?:import|export)\b[\s\S]*?^[ \t]*};?[ \t]*$/gm, 'mdx_module_syntax', ranges);
		regexRanges(source, /\{(?:[^{}]|\{[^{}]*\})*\}/g, 'mdx_expression', ranges);
	}
	regexRanges(source, /<(?:script|style|pre|code)\b[^>]*>[\s\S]*?<\/(?:script|style|pre|code)\s*>/gi, 'code_or_pre_block', ranges);
	regexRanges(source, /<\/?[A-Za-z][^>]*>|<>|<\/>/g, 'jsx_or_html_tag', ranges);
	regexRanges(source, /&(?:#[0-9]+|#x[0-9a-f]+|[A-Za-z][A-Za-z0-9]+);/gi, 'link_destination_or_entity', ranges);
	regexRanges(source, /\]\((?:\\.|[^)])*\)/g, 'link_destination_or_entity', ranges, (match) => {
		const start = match.index! + 2;
		return [start, match.index! + match[0].length - 1];
	});
	regexRanges(source, /<https?:\/\/[^>]+>/gi, 'link_destination_or_entity', ranges);
	return renderedFrontmatterRanges(source, frontmatter);
}

function errorMessage(error: unknown) {
	return error instanceof Error ? error.message : String(error);
}

export function createSourceClassifier(source: string, format: MarkdownFormat): SourceClassifier {
	let parser: SourceParser = format === 'mdx' ? 'mdx_ast' : 'markdown_ast';
	let parseError: string | undefined;
	const ranges: ProtectedRange[] = [];
	try {
		const processor = format === 'mdx' ? unified().use(remarkParse).use(remarkMdx) : unified().use(remarkParse);
		walk(processor.parse(source), ranges);
	} catch (error) {
		parser = 'lexical_fallback';
		parseError = errorMessage(error);
	}
	let visibleFrontmatter: OffsetRange[] = [];
	try {
		visibleFrontmatter = lexicalRanges(source, ranges, format, parser === 'lexical_fallback');
	} catch (error) {
		return {
			format,
			parser: 'unparsed',
			degraded: true,
			parse_error: [parseError, errorMessage(error)].filter(Boolean).join('; '),
			classify: () => 'unparsed_source',
		};
	}
	return {
		format,
		parser,
		degraded: parser === 'lexical_fallback',
		...(parseError ? { parse_error: parseError } : {}),
		classify(offset: number) {
			if (offset < 0 || offset >= source.length) throw new RangeError(`Offset ${offset} is outside the source.`);
			if (visibleFrontmatter.some((range) => offset >= range.start && offset < range.end)) return 'prose';
			const matches = ranges.filter((range) => offset >= range.start && offset < range.end);
			if (!matches.length) return 'prose';
			return matches.sort((left, right) => (left.end - left.start) - (right.end - right.start))[0]!.kind;
		},
	};
}

export function classifyMdxOffset(source: string, offset: number): MdxSourceClass {
	return createSourceClassifier(source, 'mdx').classify(offset);
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
