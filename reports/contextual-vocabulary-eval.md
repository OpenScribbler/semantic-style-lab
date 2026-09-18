# Contextual vocabulary strategy comparison

Generated from Jev 1.13.0 on 2026-09-17.

## Result

The next-word Noul strategy reached **98.9% policy accuracy** across 90 decisions
and surfaced all five seeded errors in the end-to-end sample. The result is strong
enough to justify a larger real-prose evaluation, but not automatic editing.

| Strategy | Policy accuracy | Policy stability | Input tokens | Input cost |
| --- | ---: | ---: | ---: | ---: |
| One multi-class Choice | 92.2% | 96.7% | 35,871 | $0.00151 |
| Naive atomic Noul | 81.1% | 96.7% | 39,411 | $0.00166 |
| Noul with parsed next word | **98.9%** | 96.7% | 36,957 | $0.00155 |

Costs use $0.042 per million input tokens and exclude output charges.

## Why the second strategy failed

Breaking a Choice into yes/no questions was not sufficient. The abstract question
“Does the marked term modify a following noun?” still let Jev count a noun inside
the marked phrase or anchor on its current hyphenation. Policy accuracy fell to
81.1%.

The third strategy used code to extract the actual word after the candidate. Jev
then answered whether that explicit word was a noun modified by the marked term.
That narrow boundary removed all repeated `real-time` errors and left one unstable
literal classification in 90 decisions.

## End-to-end sample

Vale enumerated seven prose candidates and skipped the configured inline-code
occurrence. The next-word Noul audit surfaced all five seeded errors:

1. `complete the set up` → `complete the setup`
2. `command line client` → `command-line client`
3. `from the command-line` → `from the command line`
4. `real time updates` → `real-time updates`
5. `in real-time` → `in real time`

All five were routed to review rather than edited automatically.

## Interpretation

The experiment supports a specific architecture:

1. Vale or regex over-finds known surface forms.
2. Code extracts any reliable structural facts, such as the exact following word.
3. Jev supplies narrow semantic probabilities: literal status, verb use, and the
   grammatical role of the supplied next word.
4. Versioned rule records map the composed semantic context to expected style.
5. An editing LLM receives only a bounded finding and local passage.

Next, freeze the prompts and evaluate at least 100 naturally occurring examples
from multiple documentation projects. Split threshold calibration from held-out
evaluation and report violation precision and recall, not just context accuracy.

Raw data:

- [Choice](contextual-vocabulary-choice-latest.json)
- [Naive Noul](contextual-vocabulary-noul.json)
- [Next-word Noul](contextual-vocabulary-noul-next-word.json)
- [End-to-end audit](sample-audit-noul.json)
