# Configuration and first run

## Requirements

- Bun
- Vale
- A TypeSafe API key only for live semantic judgments

Copy `style-lab.config.example.json` to `style-lab.config.json`. Paths are resolved relative to the configuration file, which makes a shared config portable within a workspace.

Each project needs:

- `name`: stable identifier used in reports and raw-artifact directories
- `root`: repository or documentation root
- `include`: Markdown/MDX glob patterns relative to `root`
- `exclude`: optional generated, vendored, build, or dependency paths
- `max_files`: optional positive limit for a small first run; selection uses a stable path hash rather than the alphabetical head

The top-level `output_dir` is also relative to the configuration file. Each invocation creates a timestamped directory instead of overwriting an earlier run.

`parsing.max_unparsed_file_ratio` controls when missing source classification makes
the command exit unsuccessfully after preserving its artifacts. The default is `0`.
Format-specific parsing uses Markdown for `.md` and MDX for `.mdx`; an AST failure
degrades to protected lexical ranges and is visible in parse-health output.

## Safe sequence

From the Semantic Style Lab checkout:

```bash
bun install
bun run style-lab -- --config /path/to/style-lab.config.json --no-jev
```

Inspect `report.html`, `report.json`, `raw/<project>/vale.json`, and
`raw/<project>/source-health.json`. Confirm that the files and candidates are in
scope. Do not interpret style effectiveness until parse coverage is acceptable.

For a live run, set the key in the current shell and rerun without `--no-jev`:

```bash
export TYPESAFE_API_KEY="..."
bun run style-lab -- --config /path/to/style-lab.config.json
```

Use `--project <name>` to run only one configured project. The CLI prints the timestamped result directory to stdout.

## Fixed research rules

This release intentionally fixes the rule catalog:

- `command-line`
- `real-time`
- `setup`
- Google semicolon exceptions
- passive voice that may hide an operationally important actor

Configure repositories and scope, not arbitrary style packages. Expanding the rule catalog is calibration work, not first-time setup.
