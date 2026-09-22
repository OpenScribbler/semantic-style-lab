---
name: semantic-style-audit
description: Set up, run, interpret, and carefully tune Semantic Style Lab audits for Markdown or MDX documentation repositories. Use when configuring project paths, running the fixed Vale-plus-Jev research rules, reviewing reports, collecting labels, or preparing localized findings for an editor LLM.
---

# Semantic Style Audit

Use the Semantic Style Lab CLI as an instrumented shadow-mode audit. Vale enumerates a fixed candidate set; source parsing removes non-prose spans; Jev supplies narrow probabilities; code decides whether to flag, review, or suppress. Do not replace this pipeline with a prompt containing an entire style guide.

## Choose the task

- Before any live Jev run or API-key troubleshooting, read [references/security.md](references/security.md).
- For first-time setup or repository selection, read [references/configuration.md](references/configuration.md).
- For interpreting results, collecting feedback, or changing thresholds and rule questions, read [references/calibration.md](references/calibration.md).

## Preserve these boundaries

- Keep `TYPESAFE_API_KEY` in the user's inherited environment. Check only whether it is non-empty. Never request, locate, read, print, copy, persist, or commit it.
- Start with `--no-jev`; confirm the intended files and Vale candidates before making live calls.
- Treat `flag`, `review`, and `suppress` as shadow-mode recommendations. Do not edit docs, modify CI, or hide findings unless the user separately asks.
- Preserve each run’s config snapshot, Vale output, exact Jev requests, and exact Jev responses. Do not overwrite prior runs.
- Keep evaluation labels out of Jev state, questions, and prompt examples. Join them only after inference.
- Do not perform the semantic judgments that the experiment is intended to measure Jev performing. If Jev was not called, report `unparsed` or `not evaluated`; never replace the missing result with an agent verdict.
- Do not narrow a failed corpus to parseable or favorable files and present that subset as the requested experiment. Fix or report the coverage failure first.
- Keep any agent-authored labels in a separate secondary diagnostic artifact and exclude them from primary effectiveness metrics unless the user explicitly adopts them as human labels.
- Use Choice for mutually exclusive grammatical or policy categories and small independent Noul questions for exceptions that can overlap. Keep deterministic syntax, thresholds, and action composition in code.
- Ask the user only about consequential disagreements, novel cases, and decisions that could authorize suppression. Do not ask them to label the entire report.

## Complete a run

Report the scanned file count, AST/fallback/unparsed coverage, candidate count, flag/review/suppress/unparsed totals, Jev call count, input-token cost, output paths, and errors. Link the HTML report and editor checklist. State whether Jev ran or the result came from `--no-jev`.

When changing code or calibration, run type checking and tests. Describe evidence for each threshold change, including unsafe suppressions and retained true findings; never present a threshold learned from a tiny fixture set as universally safe.
