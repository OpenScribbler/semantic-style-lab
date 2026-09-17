---
name: contextual-vocabulary-audit
description: Build or run context-sensitive terminology checks that combine Vale candidate enumeration with Jev classification. Use when spelling, spacing, hyphenation, capitalization, or punctuation depends on grammatical role, UI text, code, or official names; do not use for globally valid substitutions that Vale can enforce deterministically.
---

# Contextual vocabulary audit

Use Vale to enumerate every configured variant and Jev to classify why the term is used. Keep style policy in versioned rule records; do not load an entire style guide into the editing prompt.

## Audit

1. Locate the relevant rule records under `rules/contextual-vocabulary/`.
2. Run `bun run candidates -- <files...>` and confirm that Vale finds variants without linting code spans.
3. Run `bun run audit -- <files...> --json` with `TYPESAFE_API_KEY` set.
4. Treat `flag` as a proposed terminology violation, `review` as a plausible candidate, `uncertain` as a low-confidence candidate, and `preserve` as an intentional literal or name.
5. For an edit, give the editing model only the finding, its rule record, and the local passage. Request a minimal diff and preserve code, UI labels, quotations, and official names.
6. Re-run the audit after editing. Never silence a family merely to remove a valid exception; add a labeled fixture or refine its contexts.

## Add a rule

Create a rule only when at least two surface forms can be correct depending on context. Use an ordinary Vale substitution or vocabulary entry when one form is globally preferred.

Define:

- every candidate variant and its Vale candidate check;
- mutually exclusive grammatical or literal contexts;
- the expected form for each actionable context;
- explicit preservation contexts for UI, code, quotations, and official names;
- an ambiguous choice that routes uncertain prose to review;
- labeled correct, incorrect, literal, and ambiguous fixtures.

Ask Jev to classify the contextual function, not to decide correctness directly. The rule record maps the selected function to policy, keeping the decision auditable and independently testable.
