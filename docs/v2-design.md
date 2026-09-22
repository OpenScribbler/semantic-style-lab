# Vale + Jev v2 experiment

V2 addresses defects found by the first Kubernetes baseline. It remains a
shadow-mode research rule set, not a production quality gate.

## Baseline evidence

The v1 baseline ran the same 20 Kubernetes pages three times. It parsed all 20
files, sent 485 of 490 candidates to Jev, and produced stable actions for 488
candidates. It also showed that raw action reduction was not effectiveness:

- the passive question returned probabilities from 0.08 through 0.24 against a
  0.75 flag threshold, causing near-universal suppression;
- the binary modifier signal treated similar `command line` constructions
  inconsistently; and
- a lexical indentation heuristic overrode valid Markdown AST paragraphs inside
  lists.

## V2 changes

1. Successful Markdown/MDX AST parses now own code-versus-prose classification.
   Indentation regexes run only during degraded lexical fallback.
2. `command line` and `real time` use one Choice question over mutually exclusive
   grammatical categories: modifier, standalone phrase, literal text, or
   ambiguous. The state includes the marked passage, following word, and following
   text.
3. Passive candidates use one Choice question that distinguishes materially
   missing responsibility, an actor clear from context, an unnecessary actor, and
   an unclear/non-passive match.
4. Passive composition requires positive evidence. A low probability no longer
   means “safe to suppress”: `missing_actor_matters` flags at 0.75, the two safe
   categories suppress at 0.85, and everything else goes to review. These are
   conservative research thresholds, not calibrated production thresholds.
5. Optional rule-stratified sampling enumerates Vale candidates over the eligible
   corpus before inference, then selects a bounded set of files that covers each
   available rule. Reports distinguish a met target from a rule whose entire
   corpus is smaller than the requested target.

Semicolon exceptions remain independent Noul questions because more than one
exception can plausibly apply. `setup` also keeps its independently reusable
literal, modifier, and verb-phrase signals because that path performed usefully in
the baseline.

## Frozen v2 dry corpus

The initial Kubernetes v2 configuration requests 15 candidates per rule with 50
files as a ceiling. Across 619 eligible files, Vale found only four `real-time`
candidates. The deterministic selector chose eight files containing:

| Rule | Available | Selected |
| --- | ---: | ---: |
| `command-line` | 274 | 22 |
| `real-time` | 4 | 4 |
| `setup` | 241 | 15 |
| `google-semicolons` | 432 | 18 |
| `google-passive-hidden-actor` | 9,542 | 237 |

All eight files parsed through the Markdown AST. The dry run contains 296 total
candidates, 295 semantic candidates awaiting Jev, and one deterministic source
exclusion. The four `real-time` cases are the entire available population under
the configured scope, not a 15-case sample.

## Next measurement

Run this exact frozen configuration three times without tuning between runs. Then
compare action stability and inspect a small, deliberately sampled set of flags,
reviews, and high-confidence suppressions. Agent labels remain secondary triage;
effectiveness claims require adopted human labels or another declared ground truth.
