# Real-world contextual vocabulary experiment

## Result

The frozen v2 strategy reached **97.1% policy accuracy** over 350 held-out decisions. Violation precision was **100.0%** and recall was **97.5%**. Surface invariance—giving every spelling of the same sentence the same context—was **96.0%**.

| Benchmark | Policy accuracy | Counterfactual accuracy | Surface invariance | Violation precision | Violation recall | Input cost |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| v1 development | 89.4% | 86.5% | 84.0% | 92.4% | 97.0% | $0.00667 |
| v1 held out | 91.4% | 89.5% | 90.7% | 95.5% | 96.5% | $0.00647 |
| v2 development | 99.7% | 99.5% | 99.3% | 100.0% | 100.0% | $0.00633 |
| v2 held out | 97.1% | 95.0% | 96.0% | 100.0% | 97.5% | $0.00634 |

The corpus contains 60 hand-labeled source contexts from pinned Kubernetes, Docker, and GitHub documentation revisions. Expanding each context across its term family's surface forms creates 140 fixtures, including 80 counterfactual forms. The split is 70 development and 70 held-out fixtures; variants of one source sentence never cross splits.

## What changed in v2

Development failures exposed two separate problems. Code now rejects closed-class following words such as `by`, `and`, `are`, and `itself` before calling Jev. The modifier Noul also distinguishes a noun used as the direct object of `set up` from a noun modified by `setup`.

No further prompt or policy changes were made before the v2 held-out run.

The original synthetic suite also passed all 90 repeated policy decisions, and
the end-to-end adversarial sample still surfaced all five seeded violations.

## Remaining failures

- [setup-02](https://github.com/kubernetes/website/blob/05915f1428ddc49ecd59d71ac584add1411df5da/content/en/docs/setup/best-practices/multiple-zones.md#L127): `setup` in “The behavior does vary depending on exactly how your cluster is setup.”
- [setup-02](https://github.com/kubernetes/website/blob/05915f1428ddc49ecd59d71ac584add1411df5da/content/en/docs/setup/best-practices/multiple-zones.md#L127): `set-up` in “The behavior does vary depending on exactly how your cluster is set-up.”
- [setup-16](https://github.com/github/docs/blob/2320b38e746de554f7f3d2b83520bc0f26485abc/content/sponsors/sponsoring-open-source-contributors/paying-for-github-sponsors-by-invoice.md#L4): `set-up` in “Organizations can set-up invoicing to sponsor accounts.”

The remaining errors are concentrated in `setup` verb phrases, particularly passive voice and a borderline hyphenated counterfactual. They remain review candidates; this experiment does not authorize automatic edits.

## Limitations

One reviewer labeled a deliberately selected corpus; there is no inter-annotator
agreement score and this is not a random sample of the source projects. Excerpts
are lightly normalized and the experiment covers only three term families.

## Reproduce

```bash
bun run build:corpus
bun run evaluate -- --fixture test/fixtures/real-world-contextual-vocabulary.json --split heldout --strategy noul --runs 5 --output reports/real-world-heldout.local.json
```
