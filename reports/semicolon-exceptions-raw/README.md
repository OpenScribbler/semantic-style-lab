# Compiled semicolon exception run provenance

Each run preserves the exact request and raw SDK response. The request includes
the compiled exception definitions and candidate text, but no expected labels or
prompt examples. The benchmark labels are joined only after inference.

The aggregate output is `../semicolon-exception-experiment.json`. The compiled
baseline is `../../compiled-rules/google-semicolons.json`; the post-calibration
runtime policy is `../../compiled-rules/google-semicolons-calibrated.json`.
