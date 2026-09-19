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

## First Jev formulation: broad clarity

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

The project owner labeled all six as violations. Combined with the earlier prose
anchor, all seven human-labeled prose semicolons are actionable. At the provisional
0.25 suppression threshold, the generic Jev judgment retains five of seven true
findings; the semicolon-specific judgment retains only one of seven.

This rejects the broad clarity question, not Jev suppression in every possible
formulation. The question did not encode Google's default-to-avoid policy or ask
whether one of the guide's narrow exceptions applied. The exact labels and
analysis are in `reports/semicolon-calibration.json` and
`reports/semicolon-calibration-analysis.md`.

## Compiled exception formulation

The follow-up compiler preserves Google's policy structure:

1. Vale finds semicolons.
2. The MDX source classifier removes code and other non-prose spans.
3. The default action for every remaining occurrence is `flag`.
4. Three independent Jev questions test the documented exceptions: complex
   series, conjunctive connectors, and unusually close clauses.
5. Ordinary code combines the probabilities using predeclared thresholds.

The benchmark contains the seven real, human-labeled violations plus five held-out
acceptable fixtures derived from the policy categories. Evaluation labels and
expected exception types are not included in Jev requests. No prompt examples are
used, so the result measures the compiled criteria rather than example matching.

Across five runs (36 independent judgments per run), the compiled formulation:

- retained all 7 human-labeled violations;
- suppressed 4 of 5 acceptable cases;
- produced 0 unsafe suppressions;
- resolved 9 of 12 cases automatically and routed 3 to review; and
- used 37,755 input tokens, costing about $0.0016 at $0.042/MTok.

The conjunctive-connector and complex-series exceptions separated in this small
benchmark. The close-clauses exception did not: its acceptable fixture overlapped
two human violations. The calibrated compiler therefore makes that exception
review-only rather than allowing it to suppress an alert.

This is enough to justify a larger real-world calibration set, but not a claim of
production accuracy. Open `reports/semicolon-exception-result.html` for the dark
HTML report. The versioned compiler record is
`compiled-rules/google-semicolons-calibrated.json`; exact requests and responses
are retained under `reports/semicolon-exceptions-raw/`.

## Reproduce

```bash
bun run experiment:semicolon -- --runs 5
bun run report:semicolon
bun run analyze:semicolon-calibration
bun run experiment:semicolon-exceptions -- --runs 5
bun run report:semicolon-exceptions
```
