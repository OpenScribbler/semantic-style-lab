# Secret handling

The human must load `TYPESAFE_API_KEY` before launching the agent. Treat the
inherited value as opaque.

You may run only this presence check:

```bash
test -n "$TYPESAFE_API_KEY"
```

Never request that the human paste the key. Never read, print, copy, transform,
log, persist, or search for it. In particular, do not run `echo` on the variable,
dump the environment, enable shell tracing, inspect process environments, display
credential files, search home directories or shell history, or place a secret in
a config, argument, prompt, report, issue, commit, or artifact.

If the variable is absent, stop before the live run. Tell the human to exit the
agent, load the key in the parent shell, and restart the agent. Candidate discovery
can continue with `--no-jev` if that remains useful.

An inherited environment variable is available to the agent's process; these
rules prevent accidental handling but are not a sandbox. The human should use only
trusted agents and rotate a key that may have been exposed. The repository-level
guide is `docs/api-key-security.md`.
