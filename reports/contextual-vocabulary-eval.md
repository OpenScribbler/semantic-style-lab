# Contextual vocabulary evaluation

Generated from Jev 1.13.0 on 2026-09-17.

## Result

The approach is promising but not ready to automate edits.

- 30 labeled fixtures across three contextual term families
- 3 repeated runs, producing 90 decisions
- 83.3% exact context accuracy
- 87.8% style-policy accuracy
- 93.3% policy stability across runs
- 35,871 input tokens: approximately **$0.00151** at $0.042/MTok

`setup` reached 100% policy accuracy in the recorded run. `command-line` reached
76.7%, and `real-time` reached 86.7%. The main systematic failure was surface-form
anchoring: Jev sometimes treated an already hyphenated term as a modifier even
when a verb followed it.

## End-to-end sample

Vale enumerated seven prose candidates and skipped the inline-code occurrence.
The sample contained five intentionally incorrect forms. Jev surfaced three:

1. `complete the set up` → `complete the setup`
2. `from the command-line` → `from the command line`
3. `in real-time` → `in real time`

It missed two compound modifiers:

1. `command line client` → `command-line client`
2. `real time updates` → `real-time updates`

Observed recall on this tiny adversarial sample is therefore 60%. This is too
small to generalize, but it identifies the next useful experiment: separate
candidate enumeration from a more mechanical syntactic question about the word
immediately following the marked term.

## Interpretation

The architecture worked as intended:

- Vale found every configured surface form and supplied exact source locations.
- Jev received one marked occurrence and one bounded rule at a time.
- Rule records, rather than the model, mapped context to preferred spelling.
- UI and code literals could be preserved instead of globally allowlisted.

The experiment also showed why labeled fixtures matter. Early “ambiguous” cases
were actually awkward but classifiable sentences, and linguistics-heavy labels
reduced accuracy. Replacing those labels with observable relationships improved
the benchmark, but modifier recall remains the first issue to solve.

Raw data:

- [`contextual-vocabulary-eval.json`](contextual-vocabulary-eval.json)
- [`sample-audit.json`](sample-audit.json)
