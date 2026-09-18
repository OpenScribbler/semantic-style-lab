# Real-world corpus notice

The benchmark contains short, lightly normalized documentation excerpts with
pinned source revisions and direct source links. Normalization removes markup or
makes a wrapped fragment self-contained. Counterfactual fixtures then alter only
the target term's spacing or hyphenation. Attribution and license information for
every source project is recorded in `sources.json` and propagated into the
generated fixture file.

- Kubernetes documentation: CC BY 4.0
- Docker documentation: Apache-2.0
- GitHub documentation: CC BY 4.0

The seed records are hand-labeled for the grammatical function of the target
occurrence. A development/held-out assignment is made at the seed level, so all
surface variants of one sentence remain in the same split.
