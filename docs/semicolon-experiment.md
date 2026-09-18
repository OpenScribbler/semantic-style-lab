# Semicolon-specific experiment

## Question

Can deterministic syntax filtering plus a semicolon-specific Jev judgment improve
Google Vale's `Semicolons` alerts without hiding prose findings that the Syllago
owner considers useful?

## Corpus

The existing Syllago run contains 21 real Vale alerts:

- 8 MDX `import` semicolons, excluded deterministically
- 13 semicolons in documentation prose, sent to Jev

No synthetic or external passages were added. The six-case human calibration is
structurally sampled from the 13 prose occurrences; it is not a random prevalence
sample.

## Prose/code boundary

The classifier parses each complete MDX file and classifies the exact source offset
reported by Vale. It excludes frontmatter, fenced and indented code, inline code,
single- or multiline ESM imports and exports, MDX expressions, JSX/HTML tags,
`script`/`style`/`pre`/`code` regions, link destinations, and entities. It does not
exclude prose merely because that prose is nested inside an MDX component.

The current 21-alert corpus exercises eight real ESM imports. Automated fixtures
cover the other source categories so future alerts cannot silently enter the Jev
prose stage merely because they occur in a different kind of MDX code region.

## Jev judgment

Each prose occurrence receives one Noul question: would rewriting the marked
semicolon with a period, conjunction, colon, or restructuring *materially* improve
clarity? A merely possible rewrite is explicitly insufficient. Five runs preserve
the raw probability and measure stability.

The run used 25,820 input tokens and cost an estimated $0.0011 at $0.042 per
million input tokens. Scores were highly stable but compressed from 0.146 to
0.266. The previously human-labeled prose violation scored 0.164, so no automatic
threshold is authorized.

## Human calibration

Open `reports/semicolon-calibration.html`. It asks for six decisions covering
distinct clause relationships and hides the Jev result until after each answer.
The report saves choices locally and provides a copy-to-chat JSON action.

## Reproduce

```bash
bun run experiment:semicolon -- --runs 5
bun run report:semicolon
```
