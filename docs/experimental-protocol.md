# Experimental protocol

Semantic Style Lab exists to measure whether narrow Jev judgments improve a fixed
Vale candidate stream. An LLM agent may operate and inspect the experiment, but it
must not become an unreported replacement for Jev.

## Primary evidence

Primary semantic evidence consists of saved Jev responses composed into actions by
the checked-in code. Human labels may serve as ground truth when the person knowingly
provides them. The report must state file coverage, parse health, candidate coverage,
Jev call count, and tokens before claiming an improvement.

Do not count any of the following as primary effectiveness evidence:

- candidates for which Jev was not called;
- agent-authored labels or rewritten dispositions;
- a corpus narrowed after failure to include only parseable or favorable files;
- synthetic replacement cases presented as if they were natural-corpus results; or
- results produced after silently tuning questions or thresholds on the same cases.

## Agent role

An agent may configure repositories, run dry and live passes, verify source spans,
compare repeated Jev probabilities, preserve artifacts, diagnose software failures,
and identify a small set for human review. It must not answer the rule questions on
Jev's behalf when the pipeline skips inference.

An optional agent review is a secondary diagnostic artifact. Save it separately,
identify the model that produced it, and exclude it from primary precision, recall,
retention, and noise-removal claims unless a person later adopts those labels.

## Failure behavior

Unparsed candidates are `unparsed`, not `review`. Protected lexical fallback is
reported separately from an AST parse. If configured parse-health limits are
exceeded, preserve the artifacts, exit unsuccessfully, and fix the input pipeline
before interpreting semantic effectiveness.
