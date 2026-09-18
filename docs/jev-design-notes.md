# Jev design notes for contextual style checks

The official TypeSafe guidance fits this experiment unusually well: keep workflow
and policy in code, and use Jev for narrow, typed judgments over unstructured
language. The live documentation is the source of truth; the installed TypeSafe
agent skill is a compact implementation guide.

## The useful patterns

1. **Code owns the workflow.** Vale enumerates known surface forms, versioned rule
   records map semantic context to house style, and code decides whether to flag,
   review, or preserve. Jev does not rewrite prose or interpret the whole guide.
2. **Pre-parse before asking.** The value-extraction cookbook recommends
   recall-oriented regex candidate finding followed by a constrained Jev judgment.
   Here, Vale finds the term and code extracts the first word after it.
3. **Ask atomic questions.** A Noul returns `P(yes)` for one defined proposition.
   We independently ask whether the occurrence is literal, whether the explicit
   next word is a noun modified by it, and—for `setup`—whether it expresses an
   action.
4. **Batch shared state.** All independent questions for a page or fixture batch
   share one structured state and are evaluated in one request.
5. **Do not confuse confidence with correctness.** Choice confidence describes
   concentration among supplied options. Noul supplies a direct yes probability.
   Neither eliminates the need for labeled target-domain fixtures and calibrated
   review thresholds.

## What the experiment changed

The first Choice classifier asked Jev to select a grammatical context. A naive
Noul decomposition was worse because “following noun” remained abstract. Jev
occasionally counted a noun inside the marked phrase or followed the current
hyphenation.

The successful version makes the boundary concrete:

```text
Vale candidate -> code extracts following_word -> Jev judges that word's role
               -> code composes signals -> rule record supplies expected form
```

This reached 98.9% policy accuracy across 90 repeated decisions on the small
synthetic fixture set. That is evidence for the decomposition, not a production
quality claim. The corpus must grow to include real documentation, difficult
literal boundaries, headings, tables, links, and multiple sentence structures.

## Relevant official documentation

- [How to build with System One](https://docs.typesafe.ai/concepts/how-to-build-with-system-one)
- [State](https://docs.typesafe.ai/concepts/state)
- [Noul](https://docs.typesafe.ai/primitives/noul)
- [Choice](https://docs.typesafe.ai/primitives/choice)
- [Confidence](https://docs.typesafe.ai/confidence)
- [Pre-parsed value extraction](https://docs.typesafe.ai/cookbooks/pre_parsed_value_extraction_cookbook)
- [TypeSafe agent skill](https://github.com/typesafe-ai/skills)
