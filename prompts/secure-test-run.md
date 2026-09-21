# Secure Semantic Style Lab test prompt

Copy this prompt into Claude or another coding agent after you have loaded
`TYPESAFE_API_KEY` yourself and launched the agent from that shell. Replace the two
bracketed paths first.

---

Use the Semantic Style Lab checkout at:

`[SEMANTIC_STYLE_LAB_PATH]`

Test this documentation repository in shadow mode:

`[TARGET_REPOSITORY_PATH]`

Read `skills/semantic-style-audit/SKILL.md` and all references it routes you to,
including its security instructions. Then follow
`prompts/run-real-repo-experiment.md`.

Security boundaries:

- Do not ask me to paste or disclose an API key.
- Do not read, print, copy, transform, log, persist, or search for secrets.
- Do not run `echo "$TYPESAFE_API_KEY"`, `printenv`, `env`, `set -x`, inspect
  process environments, read secret files, or search shell history.
- You may only check whether the inherited variable exists with
  `test -n "$TYPESAFE_API_KEY"`.
- If it is absent, stop before the live run and tell me to load it in the parent
  shell and restart the agent. Do not look for a key or create one.
- Never put a secret in repository files, configuration, prompts, command
  arguments, reports, logs, commits, issues, or chat.

Experimental boundaries:

- Run the identical configuration with `--no-jev` first and inspect parse health.
- Jev must make every semantic judgment being measured. Do not answer Jev's
  questions yourself, fill in skipped results, or use your own style opinions as
  primary evidence.
- Do not narrow a failed corpus to favorable files and present it as the requested
  experiment. Fix the tool or report the coverage failure.
- Do not edit the target documentation repository or its CI.
- Preserve the timestamped config snapshot, source-health data, Vale output, exact
  Jev requests, and exact Jev responses. Do not overwrite earlier runs.
- Do not tune against evaluated cases until the baseline is saved.

At the end, report scanned files; AST, fallback, and unparsed coverage; candidate
counts; which candidates reached Jev; flag/review/suppress/unparsed totals by rule;
Jev calls, tokens, and estimated cost; run stability; errors; and paths to the HTML
report, JSON report, editor checklist, and raw artifacts. Escalate at most five
consequential cases for human judgment.

---
