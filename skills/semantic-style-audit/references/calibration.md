# Review and calibration

## Read the artifacts

Use `report.html` for a human overview and `editor-checklist.json` for page-localized LLM work. Treat `report.json` as the durable composed result. Raw evidence is under `raw/<project>/`:

- `vale.json`
- `source-health.json`
- `jev-NNN.request.json`
- `jev-NNN.response.json`

Diagnose a surprising result in this order: source span and prose classification, Vale candidate, exact Jev state, individual Noul probabilities, then code composition.

## Collect small, useful feedback

Prioritize:

1. A proposed suppression that might hide a real violation.
2. A review result close to an action threshold.
3. Reviewer or model disagreement.
4. A new linguistic structure not represented in existing calibration data.

Record the user’s label separately from the saved request and response. Keep the original result immutable so later experiments can be reproduced.

An agent's own labels are useful only for secondary triage. Save them separately,
name the reviewing model, and do not use them as ground truth or as a substitute
for Jev output. If no Jev request exists for a candidate, the result is unevaluated,
not a semantic `review` decision.

## Tune conservatively

A static Vale rule proposes candidates. A compiled semantic rule should record its default action, exclusions, typed questions, composition, thresholds, calibration source, and version.

- Use deterministic code for syntax, file scope, exact spelling, and exclusions.
- Use Jev for contextual meaning that regex cannot determine.
- Use Choice when one exclusive interpretation must win; use separate Noul questions when several exceptions may independently apply.
- Allow auto-suppression only for an exception category that separates acceptable cases from genuine violations on held-out target-domain data.
- Keep overlapping categories review-only.
- Re-run old labeled cases after any question, context, model, or threshold change.

Track true-finding retention, false-positive removal, unsafe suppressions, review workload, run-to-run stability, tokens, and cost per candidate. A useful improvement reduces noise while preserving findings; raw accuracy alone can conceal an unsafe tradeoff.

## Prepare editor work

Give an editor LLM one page at a time from `editor-checklist.json`. Require a minimal patch limited to enumerated findings. After a patch, rerun the audit and Vale; do not assume the editor preserved either technical meaning or style conformance.
