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

## Design boundary

Use an ordinary Vale vocabulary or substitution when one form is always right.
Use a contextual rule when grammatical role or literal status changes the
preferred spelling, spacing, capitalization, or punctuation. Google notes that
hyphenation depends in part on whether a term precedes a noun or follows a verb:
<https://developers.google.com/style/hyphens>.

The reusable agent workflow is in
[`skills/contextual-vocabulary-audit/SKILL.md`](skills/contextual-vocabulary-audit/SKILL.md).
