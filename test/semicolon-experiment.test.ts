import { describe, expect, test } from 'vitest';

import { classifyMdxOffset } from '../src/mdx-source-classifier';
import { buildSemicolonRequest } from '../src/run-semicolon-experiment';

describe('semicolon experiment', () => {
	test.each([
		["import { Aside } from '@astrojs/starlight/components';", 'mdx_module_syntax'],
		['import {\n  Aside,\n  Tabs\n} from "components";', 'mdx_module_syntax'],
		['Use `const first = 1; const second = 2` here.', 'inline_code'],
		['```js\nconst first = 1;\n```', 'fenced_or_indented_code'],
		['The value is {(() => { first(); return second() })()}.', 'mdx_expression'],
		['<Widget example="first; second" />', 'jsx_or_html_tag'],
		['Read [the docs](https://example.com/a;b).', 'link_destination_or_entity'],
		['Copyright &copy; example.', 'link_destination_or_entity'],
		['---\ntitle: "First; second"\n---\nBody.', 'frontmatter'],
	])('classifies the exact semicolon in %s', (source, expected) => {
		expect(classifyMdxOffset(source, source.indexOf(';'))).toBe(expected);
	});

	test('keeps prose inside an MDX component eligible', () => {
		const source = '<Aside>First clause; second clause.</Aside>';
		expect(classifyMdxOffset(source, source.indexOf(';'))).toBe('prose');
	});

	test('asks one narrow clarity question for each prose candidate', () => {
		const candidate = {
			id: 'page.mdx:2:Google.Semicolons:10:;',
			path: 'page.mdx',
			check: 'Google.Semicolons',
			line: 2,
			match: ';',
			span: [12, 13] as [number, number],
			context: [{ line: 2, text: 'First clause; second clause.' }],
			target_text: 'First clause; second clause.',
			marked_text: 'First clause⟦;⟧ second clause.',
			source_class: 'prose' as const,
			jev_probability: 0.4,
			jev_probabilities: [0.4],
			vale_jev_action: 'review',
		};
		const request = buildSemicolonRequest([candidate]);
		expect(Object.keys(request.questions)).toEqual(['q1']);
		expect(request.state.candidates[0]?.marked_passage).toContain('⟦;⟧');
		expect(JSON.stringify(request.questions.q1)).toContain('materially improve clarity');
	});
});
