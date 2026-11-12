# Phase 3 Creative Review evidence rejection

Investigated 11 November 2026. No paid OpenAI requests were made. No stored analyses were reset, edited, or regenerated. A before/after SHA-256 check confirmed the entire local video metadata file stayed byte-for-byte unchanged.

## Confirmed failure mechanism

The reported message is emitted only by the criterion/category guard in `server/src/creative.js` (currently line 80; line 44 before this change). Reaching this guard proves:

1. The creative response passed its structural schema, including five distinct criterion IDs.
2. The current criterion had a numeric rating.
3. Its `findingIndexes` was non-empty.
4. Every supplied index pointed to an existing, non-uncertain analysis finding with evidence.
5. None of those findings had a category allowed for that criterion.

Missing, out-of-range, uncertain or evidence-free references produce the preceding, different unsupported-findings error. Unknown criteria (`rating: null`) do not require evidence and bypass the numeric category guard. Local reproduction confirms that behavior. There is no demonstrated validator bug accepting/rejecting an otherwise contract-valid category reference.

The generation contract was weaker than the acceptance contract. Previously, the outbound schema allowed any nonnegative integer as a finding index, independent of criterion/category. Category matching and null-for-unsupported rules existed in prose and the post-generation validator, but were not encoded in the outbound response schema. The model could therefore generate schema-valid, semantically invalid ratings. Positional finding indexes were implicit in the input array; underlying frame/transcript indexes were also present and could be confused with them.

The confirmed defect is that request/acceptance contract gap. The exact model reasoning or original erroneous indexes cannot be reconstructed from the existing records.

## Saved analysis inspection

Inspected locally using a whitelist of status, category, certainty, reference indexes and reference-existence flags. No media, filename, transcript, report prose or API key was printed.

- Both saved records have `analysisStatus: completed`, `creativeStatus: failed`, the exact reported error, and no saved creative output or diagnostic.
- One analysis contains only `opening_hook` and `visual_content` findings. Its supported score mapping is hook → `[0]`, clarity → `[1]`, pacing/text/CTA → `[]`. The latter three must remain unknown. Its maximum assessed rubric weight is 55%, so it should not get an overall score.
- The other contains all eight analysis categories. Its eligible mapping is hook → `[0]`, clarity → `[1,2,5]`, pacing → `[4]`, text → `[3]`, CTA → `[6]`.
- Every underlying frame/transcript reference checked exists. The saved Phase 2 evidence is not orphaned.

A two-finding report is legitimate under the existing Phase 2 schema, even though its analysis prompt requests broader coverage. This investigation does not change Phase 2 or try to manufacture missing findings.

## Historical field identification: important limit

**The exact original failing criterion and field position are not recoverable.** The old provider discarded rejected response content when validation threw, and the service persisted only the generic message. No raw creative response or structural failure metadata was present in the saved record or discovered local response fixtures. Available backend output did not identify the creative criterion. Transport abort/EPIPE messages do not explain this validator branch.

The known historical field class is `criteria[*].findingIndexes`, paired with a numeric `criteria[*].rating`. A valid-but-shifted index, wrong-category citation, or confusion with a frame/transcript index that happens to identify an existing finding can all reach this same guard. The old generic error cannot distinguish them. This report does not invent a historical criterion.

The sanitized reproduction identifies **`criteria[2].findingIndexes`, criterion `pacing`, value `[1]`, category `visual_content`**, rejected against allowed category `pacing`. This is explicitly a reconstruction, not the original OpenAI response. It reproduces the exact UI error for both saved category layouts. Returning that unsupported criterion as `rating: null, findingIndexes: []` succeeds.

## Request trace

1. `client/src/components/CreativeReview.jsx`: Generate/Retry calls `requestCreative(video.id)`.
2. `client/src/api.js`: POST `/api/videos/:id/creative`.
3. `server/src/app.js`: resolve the record; queue the creative job; return 202 (or reuse a completed review).
4. `server/src/creative-service.js`: use the completed saved analysis; invoke the provider.
5. `server/src/provider.js`: call Responses with a strict JSON schema; reject refusal/incomplete output; parse `output_text`; call `validateCreative` before returning.
6. `server/src/creative-service.js`: independently validate again, then compute/save scores. On rejection, save failed status/error instead. No rejected review is scored or saved as successful.
7. `server/src/store.js`: serialize metadata writes with atomic rename. Frontend library polling receives the persisted creative error and displays it.

## Minimal fix

- `server/src/creative.js:36`: derive eligible finding indexes from the existing supported-finding and category rules.
- `server/src/creative.js:41`: build a per-analysis request schema. Numeric criteria must cite eligible indexes; a criterion with none permits only null and an empty reference array. The runtime validator remains authoritative and continues rejecting invalid output. No rating coercion or silent fallback is introduced.
- `server/src/provider.js:29`: send explicit zero-based `findingIndex` labels and per-criterion `eligibleFindingIndexes`. Distinguish finding indexes from frame/transcript indexes and require unknowns where no eligible evidence exists.
- `server/src/provider.js:30`: use the evidence-constrained request schema. Nested `anyOf` and enum constraints follow [official Structured Outputs guidance](https://developers.openai.com/api/docs/guides/structured-outputs).
- `server/src/creative.js:63`: attach allowlisted structural diagnostics to evidence errors: criterion ID, field path, integer reference indexes, enum category names, and eligible indexes. No model prose is included.
- `server/src/creative-service.js:30`: log/persist that safe diagnostic on future failures. Existing failed records remain untouched; only an explicitly requested new attempt writes new state.

No frontend behavior, scoring weights, accepted evidence categories, Phase 2 reports, media, performance data, or automatic retry behavior was changed.

## Tests and results

New sanitized fixture: `server/test/fixtures/creative-evidence.json`. It contains category layouts and a reconstructed failure only, explicitly not a captured production response.

New regressions in `server/test/creative-evidence.test.js` verify:

- The exact error is reproducible for sparse and full finding layouts.
- Valid creative reviews pass; legitimately unsupported criteria remain null and do not inflate coverage/scores.
- Missing fields/evidence, out-of-range indexes, frame-index confusion, uncertain findings and wrong-category evidence remain rejected.
- The generated request schema limits numeric references per criterion and forbids numeric ratings when no eligible findings exist.
- The adapter supplies explicit finding indexes and mappings; a deliberately invalid stub response is still rejected rather than silently repaired.
- Future failure diagnostics identify the exact criterion/field, survive persistence, exclude placeholder private prose, and leave the analysis unchanged.

Verification run:

- `npm test`: **20 passed, 0 failed, 0 skipped**. All provider calls in these tests are local stubs; no paid API requests.
- `npm run lint`: **passed**.
- `npm run build`: **passed**.
- Local metadata hash before vs after: **unchanged**.

## Is another paid retry required?

Not for the diagnosis or regression tests; those are complete without one. A new, explicit creative-review request is required to generate a usable review and verify the updated contract against the real provider. The previous rejected response is unavailable, so there is no saved output to safely replay or salvage into a score. The application has not performed this retry automatically. Existing analyses can be reused as-is; no video upload or Phase 2 analysis reset is needed.

If a later controlled request still fails validation, inspect its saved `creativeDiagnostic` or safe validation log instead of repeatedly retrying. That identifies the actual new criterion and field. The exact historical field remains unrecoverable.
