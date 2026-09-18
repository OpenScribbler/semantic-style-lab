# Human calibration result

The project owner completed all five policy choices and eight spot checks on 2026-09-18T21:25:20.358Z.

## Result

- Panel agreement: **5/7 decisive checks (71.4%)**
- Split semantic-case agreement: **2/4 (50%)**
- Human-uncertain checks: **1**
- Unsafe provisional Jev suppressions observed: **1**

This sample is deliberately small and stratified. These figures diagnose the workflow; they are not corpus-level accuracy estimates.

## What changed

The global suppression threshold is not validated. The pipeline correctly suppressed a semicolon in MDX import syntax at P(violation)=0.05, but also suppressed a prose semicolon at P(violation)=0.23 that the human marked as a violation. Semicolon handling now requires deterministic code/literal filtering followed by a rule-specific clarity judgment. It must remain review-only until that question is tested on more labeled prose examples.

The five policy decisions are encoded in `policies/syllago-google-style.json`. CLI and “content type” are project-level deterministic exceptions. Contractions are contextual suggestions rather than CI failures. Passive voice is reportable only when it hides an important actor or responsibility.

## Non-agreements

- `reader-address` at `moat/trust-tiers.mdx:59`: human **violation**, panel **not_violation** (disagree).
- `anthropomorphism` at `advanced/sandbox.mdx:14`: human **violation**, panel **not_violation** (disagree).
- `Google.ExcessiveClaims` at `advanced/team-setup.mdx:57`: human **uncertain**, panel **violation** (human uncertain).

## Next experiment

Build a compact, rule-balanced human set for semicolons, passive voice, reader address, and anthropomorphism. Include clear positives, clear negatives, code/literal exclusions, and boundary cases. Evaluate separate Jev questions and thresholds per family; do not reuse the current global 0.25/0.75 policy.
