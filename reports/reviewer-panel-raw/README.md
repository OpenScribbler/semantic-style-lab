# Reviewer panel raw artifacts

These files are durable experiment inputs and outputs, not a disposable cache.
They allow the panel labels to be audited or re-parsed without paying for and
rerunning the model calls.

## Reviewers

| Directory | CLI configuration |
| --- | --- |
| `antigravity/` | `agy` 1.2.5, default model, low effort, sandboxed, structured output |
| `claude/` | Claude Code 2.1.277, Haiku, low effort, restricted and safe modes |
| `copilot/` | GitHub Copilot CLI 1.0.85, auto model with efficiency routing, 30-credit hard cap |
| `codex/` | Codex CLI, configured default model, read-only sandbox, structured output |
| `adjudicator/` | Claude Code Sonnet, high effort, restricted and safe modes, $2 hard cap |

The first four reviewers received the same 139 items without Jev probabilities or
decisions. The adjudicator received only the 28 items on which fewer than three
panel reviewers agreed, together with the panel verdicts and rationales.

## File convention

Each model chunk has three files:

- `chunk-NNN.prompt.json`: exact item set and complete prompt.
- `chunk-NNN.response.json`: complete captured stdout, stderr, exit code, and
  capture metadata. This file is written before parsing or validation.
- `chunk-NNN.labels.json`: normalized, schema-validated labels used downstream.

The Claude third chunk returned one malformed candidate ID while returning all
40 requested labels. Its normalized labels file records the original ID, repaired
ID, and edit distance; the raw response is unchanged.

Top-level normalized reports are in `reports/reviewer-panel-*.json`. The merged
record with every reviewer verdict, rationale, consensus status, and adjudication
is `reports/reviewer-panel-consensus.json`.
