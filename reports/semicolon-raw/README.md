# Semicolon Jev run provenance

Each of the five runs preserves two files:

- `run-NNN.request.json`: exact structured state, questions, and candidate order
- `run-NNN.response.json`: raw SDK response, model version, answers, and token usage

The combined report is `../semicolon-experiment.json`. No thresholds are applied;
the prose probabilities remain raw evidence until human calibration is complete.
