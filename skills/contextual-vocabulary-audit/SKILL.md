---
name: contextual-vocabulary-audit
description: Build or run context-sensitive terminology checks that combine Vale candidate enumeration with Jev classification. Use when spelling, spacing, hyphenation, capitalization, or punctuation depends on grammatical role, UI text, code, or official names; do not use for globally valid substitutions that Vale can enforce deterministically.
---

# Contextual vocabulary audit

Use Vale to enumerate every configured variant and Jev to classify why the term is used. Keep style policy in versioned rule records; do not load an entire style guide into the editing prompt.

## Audit

1. Locate the relevant rule records under `rules/contextual-vocabulary/`.
2. Run `bun run candidates -- <files...>` and confirm that Vale finds variants without linting code spans.
3. Pre-parse observable boundaries in code. For compound modifiers, extract the actual word after the candidate; do not ask Jev about an abstract “following noun” when the boundary can be supplied explicitly.
4. Run `bun run audit -- <files...> --json --strategy noul` with `TYPESAFE_API_KEY` set.
5. Inspect the raw Noul signals. Treat `flag` as a proposed terminology violation, `review` as a plausible candidate, `uncertain` as a low-support candidate, and `preserve` as an intentional literal or name.
6. For an edit, give the editing model only the finding, its rule record, and the local passage. Request a minimal diff and preserve code, UI labels, quotations, and official names.
7. Re-run the audit after editing. Never silence a family merely to remove a valid exception; add a labeled fixture or refine its questions.

## Add a rule

Create a rule only when at least two surface forms can be correct depending on context. Use an ordinary Vale substitution or vocabulary entry when one form is globally preferred.

Define:

- every candidate variant and its Vale candidate check;
- mutually exclusive grammatical or literal contexts;
- the expected form for each actionable context;
- explicit preservation contexts for UI, code, quotations, and official names;
- an ambiguous choice that routes uncertain prose to review;
- labeled correct, incorrect, literal, and ambiguous fixtures.

Ask Jev atomic semantic questions, not whether the prose is correct. Prefer Noul for independent yes/no properties such as literal status, verb use, or whether an explicitly supplied next word is a modified noun. Compose those probabilities into a context in code. Use Choice only when the alternatives are naturally mutually exclusive. The rule record maps the composed context to policy, keeping the decision auditable and independently testable.
