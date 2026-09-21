# Use the TypeSafe API key securely

TypeSafe's SDK reads `TYPESAFE_API_KEY` from the environment. Keep the key out of
this repository, configuration files, prompts, chat, command arguments, reports,
and shell history.

## One-time local setup

Create a private configuration directory and open a file in an editor. Typing the
key in an editor avoids putting the literal secret in shell history.

```bash
mkdir -p "$HOME/.config/semantic-style-lab"
chmod 700 "$HOME/.config/semantic-style-lab"
umask 077
${EDITOR:-nano} "$HOME/.config/semantic-style-lab/env"
chmod 600 "$HOME/.config/semantic-style-lab/env"
```

Put this line in the file, replacing the placeholder in the editor:

```bash
export TYPESAFE_API_KEY="YOUR_KEY_HERE"
```

Do not put this file inside a Git checkout. The repository ignores `.env` files as
a backstop, not as its primary secret-storage mechanism. A password manager or
OS-native secret store that injects environment variables is also appropriate.

## Start a test session

Environment variables are copied into a process when it starts. Loading the key in
another terminal—or after an agent is already running—cannot update that agent.
Exit the running agent first, load the key yourself, and launch it again from the
same shell.

To resume the most recent Claude Code conversation in this checkout, run:

```bash
cd /path/to/semantic-style-lab
source "$HOME/.config/semantic-style-lab/env"
if test -n "$TYPESAFE_API_KEY"; then
  echo "TypeSafe key is available"
  claude --continue
else
  echo "TypeSafe key is absent; Claude was not started"
fi
```

This is fail-closed: the agent does not start if the variable is absent. Replace
`claude --continue` with `claude`, `agy`, or another agent command when starting a
new session. Run the command from the same working directory as the earlier Claude
session for `--continue` to select that conversation.

For a direct run without an agent:

```bash
source "$HOME/.config/semantic-style-lab/env"
bun run style-lab -- --config style-lab.config.json
```

The safe presence check is `test -n "$TYPESAFE_API_KEY"`. Do not use `echo`,
`printenv`, `env`, shell tracing (`set -x`), or file-display commands to inspect
the value.

If an already-running agent cannot see the variable, it must be restarted as shown
above. Do not paste the key into chat and do not instruct the agent to search the
filesystem for it.

## Rules for agents

An agent running terminal commands must:

- never request, read, print, copy, transform, summarize, or persist the key;
- check only whether `TYPESAFE_API_KEY` is non-empty;
- stop before a live call if it is absent and tell the human to load it outside
  the agent session;
- never search home directories, environment dumps, shell history, process state,
  or files for credentials;
- never place the key in a config file, command argument, prompt, report, log,
  issue, commit, or generated artifact; and
- run `--no-jev` first, because candidate discovery and parse validation require
  no secret and incur no API cost.

An agent with shell access can technically access inherited environment variables.
These instructions reduce accidental disclosure; they are not an isolation
boundary. Use only agents and extensions you trust, prefer a scoped/revocable key
when TypeSafe offers one, and rotate the key if it may have been exposed.

## CI

Store the key in the CI provider's encrypted repository or organization secrets as
`TYPESAFE_API_KEY`. Inject it only into the live audit step. Do not expose secrets
to workflows from untrusted forks, and do not enable debug tracing around that
step.

## If a key is exposed

Revoke or rotate it in TypeSafe immediately, replace the locally stored value, and
remove it from any logs or artifacts. If it entered Git history, rotation is still
required even after the history is cleaned.

See TypeSafe's [JavaScript SDK documentation](https://docs.typesafe.ai/sdk/javascript)
for the environment-variable requirement.
