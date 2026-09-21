# Run a real-repository experiment

Use Semantic Style Lab to measure whether its fixed Vale + Jev pipeline reduces
unhelpful Vale candidates while preserving useful findings in this repository:

`[TARGET_REPOSITORY_PATH]`

Read `skills/semantic-style-audit/SKILL.md` and its relevant references before
running anything. Do not edit the target repository, its Vale configuration, or CI.
Follow `skills/semantic-style-audit/references/security.md` for every live call.
The human supplies the key through the inherited environment; never request, find,
read, display, or persist it.

## Experimental invariant

Jev must perform the semantic judgments being measured. You may configure the run,
inspect source spans, verify parsing, compare saved probabilities, and diagnose the
software. You must not:

- answer a skipped Jev question yourself;
- translate an unevaluated candidate into `flag`, `review`, or `suppress`;
- narrow the corpus to parseable or favorable files and call that the requested run;
- use your own labels as primary precision, retention, or noise-removal evidence; or
- tune rules on the evaluated cases before recording the baseline.

If you create a secondary agent review, save it separately with the model identity,
call it provisional, and exclude it from primary metrics unless the user explicitly
adopts those labels.

## Procedure

1. Create an ignored `style-lab.config.json` with representative include/exclude
   globs and a small `max_files` sample. Keep `parsing.max_unparsed_file_ratio` at
   `0` for the first run.
2. Run `--no-jev` first. Inspect `source-health.json` and report AST, fallback, and
   unparsed coverage. If the limit fails, preserve the artifacts and fix or report
   the input problem; do not substitute your own review or select a friendlier subset.
3. After coverage is acceptable, run the identical configuration with Jev. The key
   must come from `TYPESAFE_API_KEY`; never print or store it.
4. Preserve every timestamped run, raw Vale output, source-health record, and exact
   Jev request and response.
5. Report file and candidate coverage, Jev call count, flag/review/suppress/unparsed
   totals by rule, tokens, cost, and run-to-run stability. State clearly which
   candidates actually reached Jev.
6. Escalate no more than five consequential cases for human judgment.

Link the HTML report, JSON report, editor checklist, and raw artifact directory.
