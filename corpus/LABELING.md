# Corpus labeling protocol

Label the grammatical function of the marked occurrence without considering its
current spacing or hyphenation.

## Context labels

For `setup`:

- `verb_phrase`: expresses the action of configuring, arranging, installing, or
  preparing something, including passive voice;
- `noun`: names a configuration or preparation and is the head of its phrase;
- `modifier`: attributively modifies a separate following noun.

For `command-line` and `real-time`:

- `before_noun`: modifies a separate following noun;
- `standalone`: functions adverbially, predicatively, or as the head of its own
  phrase rather than modifying a following noun.

Literal UI text, code, quotations, and official names are excluded from this
corpus because counterfactual rewriting would destroy the literal. Those cases
remain covered by the original synthetic fixture set.

## Counterfactual expansion

Every labeled context is expanded across all configured surface forms. The
semantic label must stay constant. All variants of one seed stay in the same
development or held-out split.

## Limitations

- One reviewer labeled the seed set; there is no inter-annotator agreement score.
- The excerpts were deliberately selected to cover grammatical boundaries and
  are not a random sample of the three projects.
- Some excerpts are lightly normalized to remove Markdown or make a wrapped line
  self-contained. Each record links to the pinned source revision.
- The corpus covers three term families and does not estimate performance for an
  arbitrary style guide.
