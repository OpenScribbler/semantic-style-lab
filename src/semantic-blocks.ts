export type BlockType = 'heading' | 'paragraph' | 'numbered_item' | 'bullet_item';

export interface ProseBlock {
	id: string;
	type: BlockType;
	line: number;
	text: string;
	sectionHeading?: string;
	previousText?: string;
}

const inlineCode = /`[^`]+`/g;
const markdownLink = /\[([^\]]+)\]\([^)]+\)/g;

function cleanText(value: string) {
	return value
		.replace(inlineCode, '[code]')
		.replace(markdownLink, '$1')
		.replace(/<[^>]+>/g, ' ')
		.replace(/\{[^{}]*\}/g, ' ')
		.replace(/[*_~]/g, '')
		.replace(/\s+/g, ' ')
		.trim();
}

export function extractProseBlocks(source: string): ProseBlock[] {
	const lines = source.split(/\r?\n/);
	const blocks: ProseBlock[] = [];
	let inFrontmatter = lines[0]?.trim() === '---';
	let inFence = false;
	let pending: { type: BlockType; line: number; parts: string[] } | undefined;
	let sectionHeading: string | undefined;
	const flush = () => {
		if (!pending) return;
		const text = cleanText(pending.parts.join(' '));
		if (text.length >= 12) {
			blocks.push({
				id: `b${blocks.length + 1}`,
				type: pending.type,
				line: pending.line,
				text,
				sectionHeading,
				previousText: blocks.at(-1)?.text,
			});
			if (pending.type === 'heading') sectionHeading = text;
		}
		pending = undefined;
	};
	for (let index = 0; index < lines.length; index++) {
		const raw = lines[index]!;
		const trimmed = raw.trim();
		if (inFrontmatter) {
			if (index > 0 && trimmed === '---') inFrontmatter = false;
			continue;
		}
		if (/^(```|~~~)/.test(trimmed)) {
			flush();
			inFence = !inFence;
			continue;
		}
		if (inFence || /^import\s|^export\s/.test(trimmed)) continue;
		if (!trimmed || /^<!--|^\{\/\*|^<\/?[A-Z][^>]*>$/.test(trimmed)) {
			flush();
			continue;
		}
		const heading = trimmed.match(/^#{1,6}\s+(.+)/);
		const numbered = raw.match(/^\s*\d+[.)]\s+(.+)/);
		const bullet = raw.match(/^\s*[-+*]\s+(.+)/);
		if (heading || numbered || bullet) {
			flush();
			pending = {
				type: heading ? 'heading' : numbered ? 'numbered_item' : 'bullet_item',
				line: index + 1,
				parts: [heading?.[1] ?? numbered?.[1] ?? bullet?.[1] ?? ''],
			};
			continue;
		}
		if (/^\|/.test(trimmed) || /^:::/.test(trimmed)) {
			flush();
			continue;
		}
		if (!pending) pending = { type: 'paragraph', line: index + 1, parts: [] };
		pending.parts.push(trimmed);
	}
	flush();
	return blocks;
}
