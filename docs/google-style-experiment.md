# Google style guide compilation experiment

## Question

Can a deterministic pipeline and small Jev judgments turn a large style guide
into a bounded checklist that helps an LLM edit documentation more usefully than
the instruction “follow this style guide”?

This experiment tests that question on real Syllago documentation. It does not
modify the Syllago repository.

## Guide inventory

The compiler fetched the official Google developer documentation style guide
and recorded:

- 70 guide pages
- 598 word-list entries
- 1,241 heuristic directive candidates
- 36 rules in the local Google Vale package, linked to 22 guide pages
- a page-level routing estimate of 17 deterministic, 13 structural, 22 hybrid,
  14 semantic, and 4 reference pages

The 1,241 candidates are an intentionally recall-oriented index, not 1,241
validated rules. The first live slice contains 12 semantic rule records.

## Pipeline

```text
Markdown/MDX
  -> code extracts prose blocks and regex candidates
  -> Jev answers atomic contextual questions
  -> code combines prerequisite and violation probabilities
  -> thresholds produce pass, review, or flag
  -> rule records plus findings go to a constrained editor
  -> code rejects edits outside enumerated finding lines
```

Vale remains the right engine for stable spelling, punctuation, capitalization,
and syntax patterns. Jev is used where the same surface form can be correct or
incorrect depending on meaning: whether passive voice hides a necessary actor,
whether a pronoun is ambiguous, whether a claim minimizes real work, or whether
a numbered item is actually a procedural instruction.

## Calibration run

V1 evaluated 480 candidates on 27 pages and returned 58 findings. Inspection
found a systematic error: conceptual numbered lists, navigation choices, and
decision rows were treated as procedural steps.

V2 added the nearest section heading and preceding prose to each candidate. It
also asks an independent prerequisite question for procedure-only rules:
“Is this actually an instruction?” Code uses the lower of the prerequisite and
violation probabilities. V2 evaluated 471 candidates with 539 atomic questions
and returned 31 findings. Procedure findings fell from 21 to 1.

V2 used 158,517 input tokens, an estimated **$0.0067** at $0.042 per million
input tokens. This excludes editor-model cost.

The calibration also exposed an unresolved issue: all seven V1 directional
reference findings disappeared in V2, including an apparently valid
“top-right” reference. Human labels are required before changing that rule or
threshold.

## Editor follow-up

Twenty pages were each sent through two read-only editor calls:

- **Baseline:** the page plus a link and instruction to follow the entire Google
  style guide.
- **Compiled:** the page plus only the prioritized Jev findings and their rule
  records.

Both editors used the same output schema, maximum of eight suggestions, and
minimal exact-replacement requirement. Sixteen pages had findings and four were
zero-finding controls.

Recorded raw output:

- baseline: 155 suggestions, with 18 of 20 pages hitting the eight-suggestion cap
- compiled prompt: 57 suggestions
- compiled suggestions mapped to finding lines: 23
- compiled suggestions rejected as out of scope: 34

Most importantly, the raw compiled editor invented edits on three of four
zero-finding controls despite an explicit instruction not to invent unrelated
violations. The production-shaped harness now skips the compiled editor when a
page has no findings and rejects suggestions that do not map to a finding. This
is evidence for code-owned orchestration, not merely a stronger prompt.

An initial report asked reviewers to pick the more useful of the two page-level
outputs. That comparison was withdrawn: the editors had different candidate
sets, and a forced preference involving an empty output does not measure either
false positives or missed findings. The redesigned report independently labels
semantic findings, Vale feasibility, and the safety of scoped corrections. The
raw paired outputs remain historical evidence about prompt scope, not evidence
that Vale + Jev outperforms Vale.

## What remains unknown

Suggestion counts are not quality scores. The 31 findings need human labels,
including whether each issue requires semantic context or could be owned by a
deterministic Vale rule. The 23 finding-mapped corrections can then be accepted,
revised, or rejected. The interactive HTML report stores those choices in
browser local storage and can export them as JSON. Only after that review should
we estimate finding precision, edit acceptance, or rule-level expansion priorities.

This experiment also does not prove complete Google-guide coverage. The
inventory is a roadmap and the 12 rules are an initial semantic slice.
