# Semicolon calibration result

All six new real-prose cases were labeled as violations. Combined with the earlier prose anchor, all **7/7 structurally varied prose semicolons** are actionable under the Syllago policy.

## Decision

Do not use Jev to suppress semicolon alerts. Parse the complete MDX file, discard candidates whose exact source span is non-prose, and retain every remaining Vale semicolon alert for the writer.

This is a useful negative result: Jev is not adding value to this rule. The deterministic MDX boundary is the improvement over Vale alone.

## Threshold comparison

- Generic Jev judgment at the provisional 0.25 suppression threshold: **5/7 true findings retained (71.4%)**
- Semicolon-specific Jev judgment at 0.25: **1/7 retained (14.3%)**
- Deterministic source filter followed by retaining prose alerts: **7/7 labeled true findings retained**

The rule-specific question was stable across five runs, but consistently on the wrong side of the action boundary. Stability is not correctness.

## Labeled prose cases

| Passage | Human | Generic P(violation) | Specific P(clarity improvement) | Specific action at 0.25 |
| --- | --- | ---: | ---: | --- |
| `using-syllago/tui.mdx:52` | violation | 0.193 | 0.146 | suppress |
| `moat/index.mdx:45` | violation | 0.267 | 0.162 | suppress |
| `moat/index.mdx:80` | violation | 0.267 | 0.170 | suppress |
| `moat/trust-tiers.mdx:83` | violation | 0.337 | 0.168 | suppress |
| `using-syllago/how-to/install-community-skill.mdx:41` | violation | 0.280 | 0.216 | suppress |
| `moat/index.mdx:99` | violation | 0.267 | 0.266 | review |
| `getting-started/core-concepts.mdx:6` | violation | 0.230 | 0.164 | suppress |

## Scope

The seven labels are deliberately selected and do not estimate corpus prevalence. They are sufficient to reject automatic suppression in this experiment because every observed suppression error hides a finding the owner wants to see. The six remaining prose alerts can safely remain visible without further labeling.
