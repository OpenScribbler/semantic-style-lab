# Semantic Style Lab

An experiment in compiling contextual style guidance into small, testable rule
records. Vale deterministically enumerates candidate terms; Jev classifies the
grammatical or literal context; the rule record maps that classification to the
expected form.

The first vertical slice checks three families whose punctuation depends on
context:

- `set up` / `setup` / `set-up`
- `command line` / `command-line`
- `real time` / `real-time`

This is intentionally different from asking a model to apply an entire style
guide. Each request contains marked passages and narrow semantic questions. The
default strategy uses independent Noul judgments and composes them into policy
with code.

## Setup

Requirements: Bun, Vale, and a TypeSafe API key for live Jev calls.

```bash
bun install
export TYPESAFE_API_KEY="ts_..."
```

Do not commit the API key. `.env` and `.env.local` are ignored.

## Enumerate candidates with Vale

```bash
bun run candidates -- test/corpus/contextual-vocabulary.md
```

Every configured form is intentionally reported. These are candidates, not
violations.

## Classify candidates with Jev

```bash
bun run audit -- test/corpus/contextual-vocabulary.md
bun run audit -- test/corpus/contextual-vocabulary.md --json
bun run audit -- test/corpus/contextual-vocabulary.md --output reports/sample.local.json
```

## Evaluate the labeled fixture set

```bash
bun run evaluate -- --strategy noul --runs 3 --output reports/contextual-vocabulary.local.json
bun run evaluate -- --strategy choice --runs 3 --output reports/contextual-vocabulary-choice.local.json
```

Build and evaluate the provenance-tracked real-world corpus:

```bash
bun run build:corpus
bun run evaluate -- --fixture test/fixtures/real-world-contextual-vocabulary.json --split heldout --strategy noul --runs 5 --output reports/real-world-heldout.local.json
bun run report:real-world
```

The initial fixture set contains correct forms, incorrect forms, UI/code/name
exceptions, and deliberately ambiguous passages. Expand it with naturally
occurring examples before using thresholds as a quality gate.
Multiple runs also measure whether Jev reaches a stable contextual and policy
decision for each fixture.

See the [HTML report](reports/contextual-vocabulary-eval.html) for the recorded
strategy comparison, end-to-end result, and next experiment. The
[Jev design notes](docs/jev-design-notes.md) map the relevant official guidance
to this architecture.

The larger [real-world HTML report](reports/real-world-experiment.html) compares
development and held-out results across two strategy versions. Corpus source
revisions, links, and licenses are under [`corpus/`](corpus/).

## Compile and test the Google style guide

The larger experiment inventories the public Google developer documentation
style guide, runs 12 initial semantic rules over 27 real Syllago pages, and
compares two constrained editors on 20 pages:

```bash
bun run compile:google-guide -- --vale-dir /path/to/vale/styles/Google
bun run audit:google-semantic -- --root /path/to/docs --output reports/audit.local.json
bun run experiment:editor-ab -- --root /path/to/docs --audit reports/audit.local.json --output reports/editor-ab.local.json
bun run report:google-experiment
```

The paired editor experiment does not change the source documentation. Its
compiled path accepts edits only when their source line maps to an enumerated
Jev finding; pages without findings skip the editor. This boundary matters: an
editor explicitly instructed not to invent unrelated violations still did so.

Open the [interactive Google-guide report](reports/google-style-experiment.html)
to label all 31 semantic findings, judge whether Vale could reliably own them,
and validate 23 scoped corrections. See the
[experiment notes](docs/google-style-experiment.md) for the design, recorded
results, and limitations.

The separate [Vale + Jev review](reports/vale-jev-experiment.html) tests the
refinement hypothesis on 256 alerts emitted by the actual Google Vale package.
Its 108-item review set hides Jev's judgment until after each human label and
computes precision, true-finding retention, and false-positive removal from the
saved labels. See the [Vale + Jev experiment notes](docs/vale-jev-experiment.md).

For a much shorter review, open the
[focused human escalation](reports/human-escalation.html). Four independent CLI
reviewers labeled the 108-alert sample and 31 semantic findings; a stronger
reasoning pass adjudicated their 28 splits. The focused report asks for only five
high-impact policy choices and eight calibration spot checks. Exact prompts, raw
responses, normalized labels, and consensus records are retained under
[`reports/reviewer-panel-raw/`](reports/reviewer-panel-raw/).

The completed [human calibration](reports/human-calibration-analysis.md) found
five agreements across seven decisive spot checks and one unsafe suppression in
the provisional global-threshold policy. The resulting Syllago decisions are
captured as [code-owned policy](policies/syllago-google-style.json); rerun the
analysis with `bun run analyze:human-calibration`.

The follow-up [semicolon calibration](reports/semicolon-calibration.html) separates
code from prose using exact MDX source spans, then applies a semicolon-specific Jev
clarity judgment to 13 real prose occurrences. Its six-case review is documented
in [the experiment notes](docs/semicolon-experiment.md), and every raw Jev request
and response is retained under [`reports/semicolon-raw/`](reports/semicolon-raw/).

## Design boundary

Use an ordinary Vale vocabulary or substitution when one form is always right.
Use a contextual rule when grammatical role or literal status changes the
preferred spelling, spacing, capitalization, or punctuation. Google notes that
hyphenation depends in part on whether a term precedes a noun or follows a verb:
<https://developers.google.com/style/hyphens>.

The reusable agent workflow is in
[`skills/contextual-vocabulary-audit/SKILL.md`](skills/contextual-vocabulary-audit/SKILL.md).
