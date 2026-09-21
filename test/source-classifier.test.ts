import { describe, expect, test } from 'vitest';

import { createSourceClassifier } from '../src/mdx-source-classifier';

describe('format-aware source classification', () => {
	test('parses Hugo Markdown without the MDX grammar', () => {
		const source = '<!-- overview -->\n\n{{< note >}}\nSet up the client.\n{{< /note >}}\n';
		const classifier = createSourceClassifier(source, 'markdown');
		expect(classifier.parser).toBe('markdown_ast');
		expect(classifier.degraded).toBe(false);
		expect(classifier.classify(source.indexOf('overview'))).toBe('html_comment');
		expect(classifier.classify(source.indexOf('note'))).toBe('template_syntax');
		expect(classifier.classify(source.indexOf('Set up'))).toBe('prose');
	});

	test('falls back lexically when MDX rejects Hugo syntax', () => {
		const source = '<!-- overview -->\n\n{{< note >}}\nSet up the client.\n{{< /note >}}\n';
		const classifier = createSourceClassifier(source, 'mdx');
		expect(classifier.parser).toBe('lexical_fallback');
		expect(classifier.parse_error).toBeTruthy();
		expect(classifier.classify(source.indexOf('overview'))).toBe('html_comment');
		expect(classifier.classify(source.indexOf('note'))).toBe('template_syntax');
		expect(classifier.classify(source.indexOf('Set up'))).toBe('prose');
	});

	test('protects code when lexical fallback is active', () => {
		const source = '<!-- force MDX fallback -->\nUse `const first = 1;` here.\n\n```js\nconst second = 2;\n```\n';
		const classifier = createSourceClassifier(source, 'mdx');
		expect(classifier.parser).toBe('lexical_fallback');
		expect(classifier.classify(source.indexOf(';'))).toBe('inline_code');
		expect(classifier.classify(source.lastIndexOf(';'))).toBe('fenced_or_indented_code');
	});

	test('protects MDX module syntax and expressions during lexical fallback', () => {
		const source = '<!-- force MDX fallback -->\nimport { Widget } from "./widget";\n\nText {(() => { first(); return second(); })()}\n';
		const classifier = createSourceClassifier(source, 'mdx');
		expect(classifier.parser).toBe('lexical_fallback');
		expect(classifier.classify(source.indexOf(';'))).toBe('mdx_module_syntax');
		expect(classifier.classify(source.lastIndexOf(';'))).toBe('mdx_expression');
	});

	test('treats rendered frontmatter title and description values as prose', () => {
		const source = '---\ntitle: Validate node setup\ndescription: >-\n  Configure the command line safely.\nslug: setup-internal\n---\nBody.\n';
		const classifier = createSourceClassifier(source, 'markdown');
		expect(classifier.classify(source.indexOf('setup'))).toBe('prose');
		expect(classifier.classify(source.indexOf('command line'))).toBe('prose');
		expect(classifier.classify(source.lastIndexOf('setup'))).toBe('frontmatter');
	});
});
