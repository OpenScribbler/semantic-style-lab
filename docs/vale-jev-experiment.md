# Vale + Jev refinement experiment

## Hypothesis

Filtering real Vale alerts with narrow Jev judgments improves alert precision
without suppressing legitimate Google style findings.

This is separate from the semantic-gap experiment. Vale is the only candidate
generator here. Jev does not search the page for additional issues.

## Method

1. Run the configured Google Vale package on the 27-page Syllago sample.
2. Preserve every Vale alert, rule name, message, match, proposed replacement,
   source line, and local context.
3. Ask one Noul per alert: is this exact alert a real, actionable violation of
   the stated rule in context?
4. Repeat the judgment three times and preserve every probability.
5. Apply a provisional code-owned policy to the mean probability:
   - 0.75 or higher: keep
   - 0.25 or lower: suppress
   - otherwise: review
6. Compare the policy with human ground-truth labels.

The thresholds were selected before labeling and are not treated as validated.

## Unlabeled run

- 27 pages
- 256 actual Vale alerts
- 3 Jev runs per alert
- 320,991 input tokens
- estimated Jev input cost: $0.0135 at $0.042 per million tokens
- provisional actions: 2 keep, 220 review, 34 suppress
- 249 of 256 alerts (97%) received the same action in all three runs

The probability distribution is conservative: the median mean probability is
0.49. That makes human calibration essential. A stable uncertain answer is not
evidence that the candidate is correct or incorrect.

## Human review

The HTML report contains a 108-alert stratified sample. It includes up to 12
probability-spaced alerts from every Vale rule triggered in the corpus. This
supports rule-level diagnosis, but it is not a prevalence-weighted sample for a
single overall corpus score.

The reviewer labels each Vale alert as a real violation, not a violation, or
uncertain before revealing Jev's judgment. Once labels exist, the report computes:

- Vale precision on the labeled sample
- Vale + Jev forwarded precision
- retention of true Vale findings
- false-positive removal
- true findings incorrectly suppressed

This experiment cannot measure violations Vale never nominated. The redesigned
Google semantic evidence report addresses that separate gap question.

## Model-panel triage

Manual review of 108 Vale alerts plus 31 semantic findings was too expensive for
the project owner. Four independent CLI reviewers—Claude, GitHub Copilot, Codex,
and Antigravity—therefore labeled the same 139 items without seeing Jev's answer.
They produced:

- 64 unanimous verdicts
- 47 three-of-four majority verdicts
- 28 split verdicts

A high-effort reasoning reviewer adjudicated only the 28 splits using the four
verdicts and rationales as evidence. These are pseudo-labels for triage, not a
replacement for human ground truth.

The focused human report requests 13 decisions: five project-policy choices that
affect high-volume rule families and eight spot checks. If the spot checks reveal
systematic disagreement, review expands only for the affected rule family.

Every model call is reproducible. For each chunk, the repository retains the
exact prompt, raw stdout/stderr response envelope, and normalized labels under
`reports/reviewer-panel-raw/`. The complete panel labels, adjudication, and merged
consensus are stored as separate JSON reports.

## Reproduce

```bash
bun run experiment:vale-jev -- \
  --repo /path/to/syllago-docs \
  --pages experiments/syllago-pages.json \
  --runs 3 \
  --output reports/vale-jev-experiment.json

bun run report:vale-jev

bun run experiment:reviewer-panel -- --reviewer antigravity
bun run experiment:reviewer-panel -- --reviewer claude
bun run experiment:reviewer-panel -- --reviewer copilot
bun run experiment:reviewer-panel -- --reviewer codex
bun run experiment:adjudicate-panel
bun run report:human-escalation
```
