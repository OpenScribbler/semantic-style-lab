# Passive voice gate

The code, rubrics, and rule texts behind the Microsoft and Red Hat passive voice
gates. The results and lessons are in
[`docs/passive-voice-experiment.md`](../../docs/passive-voice-experiment.md).

Neither gate passed the pass thresholds, so treat this as a method to study and
extend, not a filter to deploy.

## What is here

| File | Role |
|---|---|
| `rules.json` | Each guide's passive voice rule text and source URL. [`NOTICE.md`](NOTICE.md) covers the quoted text |
| `microsoft/rubric.md`, `redhat/rubric.md` | The frozen rubrics the reviewers applied |
| `lib.py` | Loads Jev answers, reviewer votes, and adjudicated labels |
| `guidegate.py` | Fixed guard rules and the Google gate's settings |
| `lrgate.py` | The per-guide gate: trains, applies, and scores it |
| `score.py` | Label loading and stability-run paths shared by `lrgate.py` |
| `rubric_build.py`, `gold_build.py` | Build reviewer items with the rule text and rubric |
| `adj_build.py` | Builds blind adjudication chunks for split votes |
| `gold_score.py` | Scores reviewers against labels taken from the guide's own examples |
| `export_weights.py` | Writes each guide's model to `policies/passive-<guide>.json` for the CLI's rank mode |
| `laya_compare.py` | Replays set 6 Jev requests through [Laya](https://github.com/NandhaKishorM/laya), an open-weights model, and compares the answers |

The data is not tracked. Jev requests and responses, reviewer labels, and
adjudications for all sets take about 1 GB. The scripts expect them in the
gitignored `.style-lab-guides/` and `.style-lab-k8s-*` directories at the
repository root, and you run every command from the root.

The scripts need Python 3 and [uv](https://docs.astral.sh/uv/). Every script
except `laya_compare.py` runs under `uv run --with numpy python`, and
`laya_compare.py` needs a Python with `laya` installed. An exploratory step used
spaCy to pick performer candidates, and that step isn't scripted here.

## Run the method

1. **Find candidates.** Run the shareable CLI with `--no-jev` over a docs repo.
   `styles/Lab/PassiveHiddenActor.yml` nominates each passive. For a held-out
   set, sample at most 4 candidates per page from pages no other set contains.
2. **Ask Jev.** Run each question group 3 times, one output directory per group
   and run. Each directory name must match an entry in `DIRS` in `lib.py`.

   ```bash
   bun src/passive-lab.ts --candidates <report.json> --root <docs root> \
     --out <set dir>/reader-run1 --questions reader_is_actor
   ```

   | Directory | Questions |
   |---|---|
   | `paragraph` | construction, reader_unsure, actor_identity, actor_needed, google_voice |
   | `reader` | reader_is_actor |
   | `actor` | actor_in_passage |
   | `prob` | problem_followup |
   | `ref` | actor_referenced, reader_could_act |
   | `result` | result_report |
   | `fact` | instruction_nearby, trigger_named, process_chain, reader_controls, subject_is_topic |
   | `kind` | passage_kind |
   | `auto` | automatic_no_owner |
   | `resp` | responsibility_needed |
   | `guide` | actor_kind, blame_avoided |
   | `voice` | redhat_voice, microsoft_voice |
   | `subj` | active_subject_available |
   | `ptr` | hidden_actor_pointer, hidden_stance_holder |
   | `mrub` | microsoft_rubric |

3. **Label.** Build reviewer items with `rubric_build.py <guide>`, then run
   `bun run experiment:reviewer-panel` once each for `codex`, `antigravity`, and
   `claude`, with `--model opus` for Claude. Build adjudication chunks for split votes with
   `adj_build.py <guide>` and have a blind reviewer judge them.
4. **Freeze, then score.** Choose a gate on the tuning sets only, record the
   command, and score the held-out set once. These are the gates frozen before
   set 6:

   ```bash
   H6=1 BAGG=mean PRE=0.25 OP=0.5 RC=0.22 LABELS=rubric \
     uv run --with numpy python experiments/passive/lrgate.py redhat 0.2 0.8 1 rc,hs,hp,past,pre,used
   H6=1 BAGG=mean RC=0.25 MV=0.15 LABELS=rubric \
     uv run --with numpy python experiments/passive/lrgate.py microsoft 0.04 0.6 1 rc,mv,past,hs,byp,being
   ```

   The positional arguments are the guide, the suppress threshold, the flag
   threshold, the regularization weight, and the blocks that send a suppression
   to review. Environment variables set block thresholds (`RC`, `MV`, `PRE`,
   `OP`), average runs instead of taking the maximum (`BAGG=mean`), read rubric
   labels (`LABELS=rubric`), and add held-out sets to the scoring (`H4`, `H5`,
   `H6`).

## Rank in the CLI

`export_weights.py` retrains each guide's logistic model and writes its
features, means, standard deviations, and weights to `policies/`. The Microsoft
and Red Hat models come from `lrgate.py` with the frozen set 6 settings. The
Google model trains on the Kubernetes tuning set alone, because Google has no
rubric labels and no pairs set. Its label counts a candidate as a violation when
any reviewer said anything other than acceptable, which is the reading the Google
gate was tuned on. Its labels are in the gitignored
`.style-lab-guides/google/labels/`.

```bash
uv run --with numpy python experiments/passive/export_weights.py
```

The CLI's `passive.mode: rank` applies these weights to fresh Jev answers. It asks
each question the model needs 3 times, averages the runs, and orders the review
list by the resulting probability. `test/fixtures/passive-rank.json` holds real
Kubernetes answers with the Python model's probabilities, and the tests check that
the TypeScript port matches them.

## Known gaps

- The script that sampled sets 4-6 was not kept. The rule it applied is in
  step 1.
- The scripts use short, terse names and hard-coded data paths. They record
  what ran, and they are not a library.
- `lrgate.py` here differs from the frozen copy only in how it finds its
  imports. Both copies print the same set 6 scores.
