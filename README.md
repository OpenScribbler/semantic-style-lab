# Semantic Style Lab

Research code and results for style rules that a pattern can't settle alone,
such as "use `setup` as a noun, `set up` as a verb" or "avoid passive voice unless
the actor doesn't matter." Vale finds the candidates, a classifier model answers
narrow questions about each one, and code decides.

- **Who it's for:** docs teams who already run Vale and want to know whether a
  model can settle the flags Vale can only raise.
- **Status:** a research record with a working CLI. The CLI reports in shadow
  mode and never edits docs or CI.
- **Headline result:** the passive voice gates hid real violations on unseen
  pages, so the CLI never suppresses passive findings. It ranks them instead, and
  the top half of the ranked queue held 29 of 30 Red Hat violations.
- **What you need:** Bun and Vale. Live classifier calls also need a TypeSafe API
  key.

The rest of this page covers the vocabulary rules first, then the CLI, the
experiments, and [common questions](#common-questions).

## How the rules work

Each rule is a small, testable record. Vale enumerates candidate terms, Jev
classifies the grammatical or literal context, and the rule record maps that
classification to the expected form.

The first vertical slice checks three families whose punctuation depends on
context:

- `set up` / `setup` / `set-up`
- `command line` / `command-line`
- `real time` / `real-time`

This is intentionally different from asking a model to apply an entire style
guide. Each request contains marked passages and narrow semantic questions. The
pipeline uses Choice for exclusive grammatical categories and independent Noul
judgments for exceptions that can overlap, then composes the results into policy
with code.

## Setup

Requirements: [Bun](https://bun.sh), [Vale](https://vale.sh/docs/install), and
a TypeSafe API key for live Jev calls.

Jev is a classifier model from [TypeSafe](https://docs.typesafe.ai). It answers a
fixed question with a probability for each answer option and never writes text.
This repo doesn't cover signing up for a key. Runs are cheap: a live rank-mode
run on one Kubernetes page made 1,248 Jev calls with 596,000 input tokens for
$0.025, at September 2026 prices.

```bash
bun install
bun test
```

Run the candidate-only pass without a key. Before a live run, follow the
[secure API-key workflow](docs/api-key-security.md): keep the key outside the
repository, load it into the shell yourself, and then launch the agent from that
shell. Never paste a key into an agent prompt. `.env` and `.env.local` are ignored,
but an external, permission-restricted file is safer.

## Run the shareable CLI

The portable shadow-mode command scans one or more configured documentation
repositories with a small research rule set. Copy the example and edit
repository paths and Markdown/MDX globs:

```bash
cp style-lab.config.example.json style-lab.config.json
bun run style-lab -- --config style-lab.config.json --no-jev
```

The no-Jev pass validates file discovery and Vale candidates without requiring a
key or spending tokens. After reviewing that result, set `TYPESAFE_API_KEY` and
run the same command without `--no-jev`. Use `--project <name>` to select one of
several configured repositories.

For a bounded research sample, set `max_files` and enable `rule-stratified`
sampling. The CLI enumerates Vale candidates across the eligible corpus before
Jev runs, selects files that cover each available fixed rule, and records both
available and selected counts. This avoids accidentally measuring hundreds of
passive candidates while leaving a rarer rule untested.

### Choose rules and passive triage

`rules` lists the rules to run. It defaults to all 5: `command-line`,
`real-time`, `setup`, `google-semicolons`, and `google-passive-hidden-actor`.

`passive` sets how the CLI handles passive voice findings:

| Key | Values | Effect |
|---|---|---|
| `mode` | `review` (default) | Every passive finding goes to review, and Jev is not called for it. |
| | `rank` | Jev answers the guide's single-fact questions 3 times per finding. A logistic model turns the answers into a violation probability, and the report lists passive findings from most to least likely. Every passive finding still goes to review. |
| `guide` | `google`, `microsoft`, `redhat` | The guide whose model ranks the findings. Required for `rank`. |

Rank mode never suppresses, because no passive gate met the pass thresholds on
unseen pages. It helps you choose where to start reviewing. On the held-out
Kubernetes set, the top half of the Red Hat queue held 29 of 30 violations, and
the top half of the Microsoft queue held 65 of 79. The Google model has weaker
backing: it was trained on Kubernetes pages alone and never scored on unseen
pages. Rank mode costs about 75 Jev calls per passive finding.

The models live in `policies/passive-<guide>.json`, and
`experiments/passive/export_weights.py` rebuilds them from the lab data.

The [passive voice experiment](docs/passive-voice-experiment.md) records why
per-guide passive gates missed the zero-miss threshold on unseen Kubernetes pages.
[`experiments/passive/`](experiments/passive/) holds the code, questions, and
rubrics. The Jev responses and labels aren't tracked, so you can read the method
but can't rerun it from this repo. `test/fixtures/passive-rank.json` is the one
replayable slice.

The [v2 experiment design](docs/v2-design.md) records the Kubernetes baseline
failures, the revised typed judgments and conservative composition policy, and
the frozen rule-stratified dry corpus.

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
style guide, runs 12 initial semantic rules over 27 real pages from the docs for
[Syllago](https://github.com/OpenScribbler/syllago), an open-source tool for
moving AI coding-assistant content between tools, and
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

## Common questions

### Does this replace editors?

No. The passive voice result argues the opposite: the models hid real violations
whenever they suppressed a flag, so the CLI sends every passive finding to a
person and only changes the order. The expensive part was labeling enough
examples to trust a gate, not running the model. See
[what it means for products](docs/passive-voice-experiment.md#what-it-means-for-products).

### Why Jev instead of asking a general LLM yes or no?

Jev returns a probability for every answer option, so code can set thresholds,
average repeated runs, and rank findings. A generative model returns text to
parse, and its confidence isn't exposed the same way. That's a design reason,
not a measured one: this repo never ran a general LLM as the classifier, so it
can't say whether one would be more accurate. The closest evidence is the
labeling panel. Three frontier models reviewing the same passives agreed
unanimously on only 141 of 200 Microsoft items.

### Can I use my own style guide?

Yes, but plan for labeling rather than prompting. A vocabulary rule is one record
in [`rules/`](rules/) plus labeled examples in `test/`. A judgment rule like
passive voice needs its own questions, a written rubric, and labeled candidates
for each guide. The shipped passive models took about 1,500 labeled candidates
per guide. [`experiments/passive/`](experiments/passive/) shows how those were
built, and the
[Semantic Style Audit skill](skills/semantic-style-audit/SKILL.md) walks an agent
through tuning rules as labels accumulate.

### Isn't this just LLMs grading LLMs?

Partly, and the write-up says so. The labels came from 3 LLM reviewers and an
LLM adjudicator applying a written rubric, and in an earlier experiment they
matched the guide owner on 5 of 7 spot checks. A human gold set is on the list
under [what to try next](docs/passive-voice-experiment.md#what-to-try-next).

### Who made this?

[Holden Hewett](https://github.com/holdenhewett), a technical writer, built it
with AI coding agents under the
[experimental protocol](docs/experimental-protocol.md). To cite it, link the
repository and the commit you used. Results from your own docs are welcome as
GitHub issues.

## Design boundary

Use an ordinary Vale vocabulary or substitution when one form is always right.
Use a contextual rule when grammatical role or literal status changes the
preferred spelling, spacing, capitalization, or punctuation. Google notes that
hyphenation depends in part on whether a term precedes a noun or follows a verb:
<https://developers.google.com/style/hyphens>.

The reusable agent workflow is in
[`skills/contextual-vocabulary-audit/SKILL.md`](skills/contextual-vocabulary-audit/SKILL.md).
