# Passive voice triage: what I learned

I tested whether a linter and a small classifier model could settle most passive-voice flags without a person, for two style guides. Neither gate passed. On 200 passages from Kubernetes pages the gates had never seen, each gate hid 2 real violations, and my thresholds allow 0. The method works as triage that ranks flags, but it can't safely suppress them.

## What I set out to test

A style linter flags every match of a pattern, and a writer then decides which flags are real. I wanted cheap, repeatable software to make most of those decisions. A linter finds candidates, a classifier model answers narrow questions about each one, and code makes the decision. A person sees only what the code can't decide.

I picked passive voice because the same words can pass or fail depending on meaning. A linter finds every passive, but only a judgment about who performs the action can decide one. It was also the largest rule in my Google style guide inventory, with 9,542 candidates against 432 for semicolons.

## How the gate works

1. **Vale finds candidates.** A Vale rule matches a form of "be" plus a past participle in the Kubernetes docs prose.
2. **Jev answers questions.** Jev is a classifier model that returns a probability for each answer option and writes no text. Each request holds one candidate, marked in brackets inside its paragraph, list item, or table row, plus the section heading, the previous block, and the page type. An instruction tells Jev to judge only the marked words and to treat all text as data. I asked 27 questions, one per request, 3 times each.
3. **A gate decides.** A logistic regression, a simple statistical model that weights each answer, turns the answers into one violation probability. Below a low threshold the gate suppresses the candidate, above a high one it flags it, and between them it sends it to review.
4. **Rules catch known gaps.** Fixed rules send some suppressions to review anyway, such as past-tense passives, "is used", "being", and passives with a by-phrase.
5. **Reviewers label.** Codex (GPT), Antigravity (Gemini), and Claude (Opus) each judged every candidate against a written rubric for the guide. The majority vote is the label, and a blind Opus adjudicator settled split votes.

## Asking Jev the right questions

Most of the tuning went into the questions. My first questions asked Jev for the verdict, such as whether a passive hides an actor the reader needs. Jev picked a safe exception for 4 of the 9 violations I had labeled. Later, one question that walked all the Microsoft rubric steps filed 11 of 12 sampled reader-performed violations under an allowed exception.

So I split the verdict into single facts and let code combine them:

- Does the reader take the marked action?
- Does the passage name who performs it?
- Does it report a result rather than describe a step?
- Is it the kind of step a person takes?

These questions did best. "Is it a person's step" and "does the reader take the action" scored AUC 0.85 and 0.83 on the tuning set. AUC measures ranking: at 0.85, a random violation outranks a random acceptable passive 85% of the time, and 0.5 is chance. Other questions listed a guide's exceptions as answer options, so Jev picked which one applied.

Three other findings shaped the requests:

- **One candidate and one question per request.** When I batched questions, neighboring candidates shifted Jev's answers.
- **More context didn't help.** Adding the section heading and previous block changed AUC by less than 0.01.
- **Jev can't name the performer.** spaCy, a parser, picked performer candidates, and Jev judged only whether each pick performs the action. That worked on written sentence pairs (AUC 0.81) but not on real docs (0.57).

## How I scored a gate

I built a gate for the Google guide first. It met the pass thresholds on the tuning set with fresh Jev runs: 54-55% automated, 95-96% stable, and 93.8% agreement. I never scored it on unseen pages, and 2 of its suppressions stayed disputed. Scored against Red Hat labels, the same gate reached only 82.7% agreement with 12 misses, because each guide exempts different passives. So I built one gate each for Red Hat and Microsoft and made unseen pages the test.

A gate passes only when it meets all four thresholds on a set it has never seen.

| Threshold | Bar | Why it matters |
|---|---|---|
| Agreement | At least 90% of automated decisions match the labels | An automated call must almost always be right |
| Stability | At least 95% of items get the same action across 3 runs | Jev's answers vary slightly from run to run |
| Automation | At least 50% of items decided without review | Below half, a person still reads most flags |
| Misses | 0 suppressed violations | A suppressed violation never reaches a person |

A set counts as held out only until I look at its results. After that, it shapes the next gate and becomes a tuning set.

| Set | Items | What it holds | Role |
|---|---|---|---|
| Tuning set | 465 | Candidates from 18 Kubernetes pages | Fit every gate |
| Contrast pairs | 120 | Written sentence pairs: one side passes a guide's exception, the other fails it | Tuning, and a check on the rubrics |
| Sets 1-3 | 120 each | Earlier batches of Kubernetes candidates | Held out at first, tuning later |
| Set 4 | 150 | Candidates from 53 unseen pages | Held out, then scored twice |
| Set 5 | 200 | Candidates from unseen pages | Held out, scored once, then tuning |
| Set 6 | 200 | Candidates from 126 unseen pages | Final test, scored once |

## What happened

Every held-out set exposed new misses, apart from Red Hat on set 5:

| Held-out set | Red Hat: automated, agreement, misses | Microsoft: automated, agreement, misses |
|---|---|---|
| Set 4 (150 items) | 48.0%, 90.3%, 2 | 32.0%, 83.3%, 1 |
| Set 5 (200 items) | 49.5%, 96.0%, 0 | 43.0%, 93.0%, 1 |
| Set 6 (200 items, final) | 52.0%, 97.1%, 2 | 47.5%, 87.4%, 2 |

Red Hat came closest. It failed only the zero-miss threshold, and its tuning-set stability was 452 of 465 items. Microsoft failed all four thresholds, including stability at 436 of 465 items (93.8%).

On set 6, the Red Hat gate hid 2 of the 30 labeled violations, and the Microsoft gate hid 2 of 79. The missed sentences read as ordinary prose:

- "That IP can now be used to interact with the frontend service." The reader performs the action.
- "...under certain conditions that are explained later in this topic." The writer performs it.
- "...the status of the condition is defaulted to False." Kubernetes, named earlier in the sentence, performs it.

## Why the gate fell short

The labels weren't what failed. Two of the 4 set 6 misses were violations that all 3 reviewers agreed on, and the gate's features scored them as safe. Detection wasn't the problem either. [PassivePy](https://pypi.org/project/PassivePy/) reports 0.97-0.98 accuracy at finding passives. In one set 5 miss, spaCy picked the right performer, and Jev still judged the passive acceptable (0.38).

The misses trace back to what makes passive voice hard:

- The verdict depends on who performs the action, and a sentence often doesn't say.
- The verdict depends on why the writer hid the performer, such as emphasis, blame, or an unknown actor.
- The exceptions differ between guides, so the same sentence passes one guide and fails another.

## Lessons for running experiments like this

1. **Freeze the gate, then score a held-out set once.** A set scored twice becomes a tuning set. I needed 6 sets, because every look at a result shaped the next gate.
2. **Fix the labels before you tune anything.** Reviewers applying the rule text alone agreed with the other reviewers' majority on only 81-88% of items. A written rubric per guide raised set 6 unanimity to 173 of 200 items (Red Hat) and 141 of 200 (Microsoft). The gate can't be more accurate than its labels.
3. **Size the test set for the claim.** Zero observed misses proves little on a small set. To show a miss rate under 1% with 95% confidence, a gate needs about 300 suppressed violations in a row with no miss. Set 6 held only 30 Red Hat violations.
4. **Run micro tests before full runs.** One run on existing sets ruled out wider context and parser-picked performers, with no new labels.
5. **Keep every raw output.** A label-loading bug once reported 4 misses that did not exist. The raw files let me find the bug without rerunning anything.
6. **Watch for correlated judges.** The adjudicator and one reviewer were both Opus, and the rubric was tuned on the same pairs it was checked against. Both make the labels more circular than they look.

## What it means for products

The pattern works as triage, but not as a safe filter. It automated about half the passive candidates at 87-97% agreement, and it could not promise that it never hides a real violation.

- **Flag and rank. Don't suppress silently.** A false flag costs a writer a few seconds. A suppressed violation is invisible, so no one can catch it later.
- **Encode each guide's policy separately.** Microsoft and Red Hat gave opposite verdicts on the same sentences, because Red Hat exempts actions the system performs and Microsoft doesn't. A single "passive voice" rule can't serve both.
- **Rules with listed exceptions fit this pattern. Rules that need intent don't.** The semicolon rule, with 3 named exceptions, had 0 unsafe suppressions on a 12-item benchmark.
- **Labeling is the real cost, not inference.** Jev calls cost fractions of a cent per page. Each 200-item set needed 3 reviewers, an adjudicator, and a frozen rubric.

## Would people or other tools do better?

Each would improve one part, but none removes the need for hundreds of labeled violations to back a zero-miss claim.

### Human judges

Human judges would make the labels more valid, but probably not more consistent.

- **LLM labels drift from the owner's reading.** In the earlier Vale and Jev experiment, the LLM panel matched me on 5 of 7 decisive spot checks. The adjudicator matched me on only 2 of 4 split cases.
- **Humans disagree on style too.** Annotators judging preposition use reached kappa 0.63 ([Tetreault and Chodorow 2008](https://aclanthology.org/W08-1205.pdf)). Kappa is an agreement score that discounts agreement by chance, where 1 is perfect and 0 is chance. Annotators judging whether a sentence was correct reached kappa 0.16-0.40 at 56-78% raw agreement ([Rozovskaya and Roth 2010](https://aclanthology.org/W10-1004.pdf)). I found no published agreement figure for passive acceptability.
- **One owner helps most on the edge rulings.** A person who owns the guide can rule on the rubric's hard cases and label the split items. On set 6, those were 59 items for Microsoft and 27 for Red Hat.
- **Volume still costs time.** At about 30 seconds per item, one 200-item set costs a person about 1.7 hours per guide. That time is an estimate.

### Other models and tools

- **A frontier LLM as the gate costs more and agrees less than hoped.** The 3 reviewers were unanimous on only 141 of 200 set 6 items for Microsoft and 173 for Red Hat. For narrow code rules, the approach works: [Checkstyle+](https://arxiv.org/html/2510.23068) raised recall from 0.73 to 0.99 at 0.99 precision on 9 Java rules.
- **A cascade with a proven bound fits this gate's shape.** [Trust or Escalate](https://arxiv.org/abs/2407.18370) uses a cheap judge first and escalates to a stronger one when confidence is low. It guarantees a chosen level of agreement with humans, reaching over 80% agreement at almost 80% coverage.

## Has anyone solved this?

I didn't find anyone who has. Every tool I checked detects passive voice. None decides whether a passive is acceptable under a guide's exceptions, and none publishes accuracy for that judgment.

| Tool | What it does with passive voice |
|---|---|
| [Vale, Microsoft package](https://raw.githubusercontent.com/errata-ai/Microsoft/master/Microsoft/Passive.yml) | Matches "be" plus about 150 participles, as a suggestion, with no exceptions |
| [LanguageTool](https://community.languagetool.org/rule/show/PASSIVE_VOICE?lang=en&subId=5) | Runs a pattern rule that is off by default |
| [Microsoft Word and Editor](https://learn.microsoft.com/en-us/answers/questions/5221144/i-lost-the-ability-to-use-active-passive-voice-in) | Offers a separate setting for passives with an unknown actor. The source is a Q&A answer, not product docs |
| [Grammarly](https://www.grammarly.com/passive-voice-checker) | Detects passives and suggests active rewrites |
| [Acrolinx](https://www.acrolinx.com/blog/passive-to-active-voice-converters/) | Detects passives and suggests rewrites tailored to a style guide, with no published exception logic |
| [Writer](https://support.writer.com/article/27-team-styleguide) | Lets a team choose passive or active voice, with undocumented detection |
| [write-good](https://github.com/btford/write-good) | Calls itself a "naive linter" |
| [proselint](https://github.com/amperser/proselint), [alex](https://github.com/get-alex/alex) | Have no passive check |

The nearest projects are a method and two partial tools. Trust or Escalate is the method. [Corelight's style guide helper](https://corelight.com/blog/microsoft-style-guide-llm) sends Vale alerts to an LLM for rewrites, and it reports no accuracy. Checkstyle+ applies the idea to code. I couldn't verify Hemingway's or Harper's passive checks.

## Is passive voice the hardest case?

Passive voice is near the top for rules a linter can find, but it isn't the hardest rule in a style guide. Rules about tone, audience, jargon, or conciseness are harder, because no linter can nominate a candidate, so this method doesn't reach them at all. Rules with a finite list of exceptions are easier, as the semicolon result shows.

## Ranking instead of gating

The same models rank well even though they gate badly. A gate has to put every violation on the right side of one threshold. A ranking only has to put most violations above most acceptable passives. On the held-out set 6, the per-guide model ordered candidates like this:

| Guide | Violations in set 6 | Ranking AUC | Violations in the top quarter | Violations in the top half |
|---|---|---|---|---|
| Red Hat | 30 of 200 | 0.91 | 24 | 29 |
| Microsoft | 79 of 200 | 0.89 | 45 | 65 |

A reviewer who starts at the top of the Red Hat queue finds 29 of the 30 violations in the first 100 items. The CLI now offers this as `passive.mode: rank`. It lists every passive finding for review, most likely violation first, and suppresses nothing.

The Google model has weaker backing. It was trained on the Kubernetes tuning set alone, with labels from LLM reviewers and no rubric, and it was never scored on unseen pages. Cross-validated by page on that tuning set, its ranking AUC is 0.88.

## An open-weights alternative: Laya

[Laya](https://github.com/NandhaKishorM/laya) is an Apache 2.0 model from Convai Innovations with Jev's three question types and a Jev-style request format. It runs locally: on a laptop CPU, with no GPU, it loaded in 28 seconds and then answered in a median 613 ms per call. That makes it the obvious candidate for teams that can't send docs to a hosted service.

I replayed 4 of Jev's stored set 6 questions through Laya's English checkpoint, request for request, on all 200 items. Each cell is the ranking AUC against the rubric labels, Jev (mean of 3 runs) first and Laya second. An AUC of 0.5 is chance. `actor_needed` runs in reverse for both models, so its distance from 0.5 is what counts.

| Question | Type | Red Hat AUC, Jev / Laya | Microsoft AUC, Jev / Laya | Correlation of the two models' answers |
|---|---|---|---|---|
| `redhat_voice` | Choice | 0.65 / 0.45 | — | −0.05 |
| `microsoft_voice` | Choice | — | 0.66 / 0.52 | −0.07 |
| `reader_is_actor` | Noul | 0.83 / 0.51 | 0.79 / 0.61 | 0.08 |
| `actor_needed` | Noul | 0.33 / 0.44 | 0.41 / 0.50 | −0.01 |

Laya's answers didn't track Jev's on any question, and they sat near chance against the labels. On the two guide questions, it picked the same top option as Jev on only 11% (Red Hat) and 20% (Microsoft) of items. Rewriting the structured instructions as a plain sentence didn't change that. I didn't rebuild a full per-guide model on Laya's answers, because that needs all 27 questions, 3 times each.

This tests Laya out of the box on questions written for Jev. Laya publishes a checkpoint meant for fine-tuning, and the 1,500 labels per guide from this experiment are the kind of data that could train it. `experiments/passive/laya_compare.py` reruns the comparison.

## What to try next

- **Change the contract.** Accept a small, measured miss rate and report it. That gives up the pass thresholds, so it needs a new decision. Ranking, the other option, is now in the CLI.
- **Bound the miss rate with statistics.** Methods such as [conformal risk control](https://arxiv.org/abs/2208.02814) pick the suppression threshold from labeled data, so the miss rate stays under a chosen bound. They bound a rate, so none of them can promise zero misses.
- **Train a task-specific classifier.** I now hold about 1,500 labeled candidates per guide. A small fine-tuned model could learn the rare patterns that Jev's fixed questions miss.
- **Test the active rewrite directly.** The Microsoft rubric asks whether an active rewrite needs an invented actor. A generative model can write that rewrite, and Jev can then judge it with a yes/no question.
- **Get a human gold set from the style owner.** About 200 items labeled by one person who owns the guide would measure how valid the LLM labels are.
- **Try other docs.** Every set came from the Kubernetes docs. The results may not hold for another docs set.
