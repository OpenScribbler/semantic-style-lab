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
```

Run the candidate-only pass without a key. Before a live run, follow the
[secure API-key workflow](docs/api-key-security.md): keep the key outside the
repository, load it into the shell yourself, and then launch the agent from that
shell. Never paste a key into an agent prompt. `.env` and `.env.local` are ignored,
but an external, permission-restricted file is safer.

## Run the shareable CLI

The portable shadow-mode command scans one or more configured documentation
repositories with a deliberately fixed research rule set. Copy the example and
edit repository paths and Markdown/MDX globs:

```bash
cp style-lab.config.example.json style-lab.config.json
bun run style-lab -- --config style-lab.config.json --no-jev
```

The no-Jev pass validates file discovery and Vale candidates without requiring a
key or spending tokens. After reviewing that result, set `TYPESAFE_API_KEY` and
run the same command without `--no-jev`. Use `--project <name>` to select one of
several configured repositories.

Every invocation creates a timestamped directory under `output_dir` containing a
dark HTML report, complete JSON, a page-localized editor checklist, a config
snapshot, source-parse health, raw Vale output, and every exact Jev request and
response. Markdown and MDX use different parsers; protected lexical fallback is
reported explicitly rather than silently blocking Jev. The command does not edit
documentation or change CI.

The [experimental protocol](docs/experimental-protocol.md) makes the measurement
boundary explicit: an LLM agent can operate and diagnose the experiment, but it
cannot substitute its own style judgments for Jev, count skipped candidates as
semantic review, or narrow a failed corpus and present that subset as the requested
result.

Agents should start from the checked-in
[secure test-run prompt](prompts/secure-test-run.md), which
combines the experimental procedure with explicit secret-handling boundaries.
The lower-level [real-repository experiment prompt](prompts/run-real-repo-experiment.md)
explicitly prevents an agent from doing Jev's semantic work or turning missing
inference into favorable metrics.

The companion [Semantic Style Audit Agent Skill](skills/semantic-style-audit/SKILL.md)
helps an LLM configure repositories, run the CLI safely, interpret uncertainty,
collect a small amount of high-value human feedback, and tune compiled rules as
evidence accumulates. Keep it in the repository for project-aware agents, or copy
the `skills/semantic-style-audit` directory into an agent's normal skills directory
to make it available across projects.

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

The follow-up [semicolon experiment](docs/semicolon-experiment.md) first separates
code from prose using exact MDX source spans. A broad Jev clarity question failed
calibration, but compiling Google's three documented exceptions into independent
questions produced a useful filter: it retained all seven human-labeled findings,
suppressed four of five acceptable cases, and sent three ambiguous cases to review.
See the [dark HTML result](reports/semicolon-exception-result.html), the
[calibrated rule](compiled-rules/google-semicolons-calibrated.json), and every
saved request and raw response under
[`reports/semicolon-exceptions-raw/`](reports/semicolon-exceptions-raw/).

## Design boundary

Use an ordinary Vale vocabulary or substitution when one form is always right.
Use a contextual rule when grammatical role or literal status changes the
preferred spelling, spacing, capitalization, or punctuation. Google notes that
hyphenation depends in part on whether a term precedes a noun or follows a verb:
<https://developers.google.com/style/hyphens>.

The reusable agent workflow is in
[`skills/contextual-vocabulary-audit/SKILL.md`](skills/contextual-vocabulary-audit/SKILL.md).
