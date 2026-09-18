import { describe, expect, test } from 'vitest';

import { extractProseBlocks } from '../src/semantic-blocks';

describe('semantic Markdown blocks', () => {
	test('carries local section and preceding-block context', () => {
		const blocks = extractProseBlocks(`# Page title

Introductory context for the page.

## Install the tool

Before you begin, authenticate.

1. Run the installer.
2. Verify the result.`);

		expect(blocks.at(-1)).toMatchObject({
			type: 'numbered_item',
			text: 'Verify the result.',
			sectionHeading: 'Install the tool',
			previousText: 'Run the installer.',
		});
	});

	test('does not treat fenced code or frontmatter as prose', () => {
		const blocks = extractProseBlocks(`---
title: Hidden metadata
---

Visible documentation text.

\`\`\`yaml
title: Hidden example
\`\`\``);

		expect(blocks.map((block) => block.text)).toEqual(['Visible documentation text.']);
	});
});
