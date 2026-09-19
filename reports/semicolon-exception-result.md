# Compiled semicolon exception result

The exception-oriented compilation produced **0 unsafe suppressions**, automatically classified **9/12** cases correctly, and routed **3/12** to review. Four of five acceptable alerts were removed automatically. No labeled examples were included in the Jev request.

## Interpretation

- **Conjunctive connector:** clean separation; eligible for conservative automatic suppression.
- **Complex series:** clean separation; eligible for conservative automatic suppression.
- **Closely related clauses:** no separation; review-only.

This supersedes the earlier conclusion that Jev adds no value to semicolon handling. The direct clarity question added no value; the compiled exception checks do.

| Case | Expected | Action | Max P(exception) |
| --- | --- | --- | ---: |
| `using-syllago/tui.mdx:52:Google.Semicolons:167:;` | violation | review | 0.480 |
| `moat/index.mdx:45:Google.Semicolons:150:;` | violation | review | 0.418 |
| `moat/index.mdx:80:Google.Semicolons:52:;` | violation | flag | 0.386 |
| `moat/trust-tiers.mdx:83:Google.Semicolons:200:;` | violation | flag | 0.354 |
| `using-syllago/how-to/install-community-skill.mdx:41:Google.Semicolons:132:;` | violation | flag | 0.244 |
| `moat/index.mdx:99:Google.Semicolons:58:;` | violation | flag | 0.356 |
| `getting-started/core-concepts.mdx:6:Google.Semicolons:321:;` | violation | flag | 0.324 |
| `fixture:allowed:close-clauses:centroid` | acceptable | review | 0.466 |
| `fixture:allowed:connector:therefore` | acceptable | suppress | 0.970 |
| `fixture:allowed:connector:that-is` | acceptable | suppress | 0.890 |
| `fixture:allowed:complex-series:priorities` | acceptable | suppress | 0.910 |
| `fixture:allowed:complex-series:review` | acceptable | suppress | 0.870 |

Model: `jev-1.13.0`; five runs; 37,755 input tokens; estimated input cost $0.0016.
