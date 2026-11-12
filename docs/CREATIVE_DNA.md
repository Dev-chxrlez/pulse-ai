# Creative DNA & evidence-backed editing blueprints

Implemented 12 November 2026. Extends the existing PULSE analysis, local stores and Niche Intelligence page. It does not change scoring weights, add social collection or download media.

## Repository audit and design

The existing code supported completed video analyses, evidence references, creative reviews, strict evidence scoring, JSON/CSV import, scoped video upload/linking and a deterministic duration-only pattern report. The existing Phase 2 findings were narrative, not structured hook/style/story annotations. Therefore these new attributes are classified only through a separate, explicit structured AI extraction request, never by arbitrary keyword matching in application code. The existing duration report remains available.

DNA and blueprints have independent local stores and a sequential request queue. Imports, linking, report polling and viewing never call these paid generation methods. No new dependencies, social credentials, database migration or video-generation feature were added.

## Standalone access after audit remediation

Open any completed video from Overview or History to view and explicitly generate Creative DNA directly in its analysis details. No SocialMonitor report is required. Viewing and polling use GET only. Editing Blueprint still requires an imported niche report, even when its suggestions use only a selected target video rather than historical patterns. See [remediation and verification](AUDIT_REMEDIATION.md).

## User workflow

1. Import a permitted SocialMonitor export in Niche Intelligence; link the corresponding uploaded video and complete its normal video analysis.
2. On that card, select **Generate Creative DNA**. This is an explicit additional OpenAI request using the saved findings/evidence/transcript, not another viewing of the original media. API credits apply.
3. Inspect supported attributes, methods, uncertainty and source references. Select an evidence timestamp to open the corresponding local video moment. Unknown/conflicting attributes remain unknown.
4. Generate DNA for other linked analyzed files if desired. The Creative DNA patterns report excludes unknowns, stale records, missing metrics, unequal windows, insufficient groups and duplicate underlying assets.
5. In **AI Editing Blueprint**, enter a niche label and optionally choose your own analyzed target video. Select **Generate editing blueprint** explicitly. With no supported historical pattern, a completed target with supported findings is required, and suggestions are labeled individual creative guidance.
6. Saved matching results reopen without new generation. A changed source is flagged stale; re-generation is explicit. Failed requests can be retried explicitly. No paid generation is automatically retried after restart.

## Attribute contract

Each attribute contains `value`, evidence references, extraction method, uncertainty and an explanation. Referenced finding indexes must exist, be non-uncertain and contain evidence in an appropriate source category. Underlying frame/transcript indexes and timestamps must exist in the saved analysis. Inferences are labeled `supported_inference`, not a calibrated confidence percentage. Unknown or conflicting evidence yields an unknown/null value, never a silent categorical default.

| Attribute | Current support and boundary |
| --- | --- |
| hookType | question, problem, curiosity, storytelling, demonstration, direct, other, unknown; opening-hook findings only |
| hookClarity | clear, partial, unclear, unknown; opening-hook evidence |
| hookStartSeconds | Approximate earliest cited frame in the first 3 seconds, or null |
| editingPace | slow, moderate, fast, unknown; pacing evidence with at least two temporal observations |
| visualStyle | demonstration, talking_head, pov, montage, cinematic, mixed, other, unknown; visual-content findings |
| storyStructure | problem_solution, before_after, tutorial, review, narrative, showcase, other, unknown; multiple temporal observations |
| productRevealSeconds | Earliest cited product frame sample, or null; not a verified first reveal |
| firstSubjectAppearanceSeconds | Earliest cited visual-subject frame sample, or null; not a verified first appearance |
| ctaPresent | true when supported, otherwise null. Sparse samples cannot prove global absence, so false is rejected by this implementation |
| ctaType | follow, comment, share, visit, purchase, other, unknown; known only with supported CTA presence |
| ctaTimestampSeconds | Earliest cited CTA frame sample or null; audio windows do not establish exact speech onset |
| sceneChanges | Count of saved FFmpeg scene-change candidates, method `ffmpeg_scene_candidates`, uncertainty `measured_heuristic`; not verified cuts |
| openingSilenceSeconds | Always null / `not_measured` because the saved pipeline does not measure it; transcript-window starts are not silence measurements |

Numeric onset/appearance values must equal the earliest relevant cited frame sample and stay within saved duration; invented times and audio-window-derived exact onsets are rejected. Methods and timing caveats are visible in the UI. Schema constraints sent to OpenAI encode eligible finding indexes and timestamp choices, and independent runtime checks still reject invalid output.

## Source identity, persistence and statuses

`DATA_DIR/creative-dna.json` stores one current record per video ID: schema version, source analysis SHA-256 reference/version/models/completion time, extraction model, attributes, timestamp, status and safe error diagnostics. Original video metadata, analyses and creative reviews are not overwritten.

During explicit generation, the available local file is SHA-256 hashed through a stream. This identifies byte-identical files uploaded under different IDs. If the file is unavailable, DNA can still classify saved evidence, but independent-asset pattern comparisons are withheld. Hashing does not prove authorship, permissions or that a user matched the right social post. Differently encoded copies of the same footage are not detected as duplicates; that still requires user review.

Statuses: Ready before a record exists; queued/processing while generating; completed when supported inferred attributes exist; insufficient_evidence when all classification fields remain unknown; failed with a safe error/diagnostic. Completed and insufficient-evidence records are reused for the same analysis reference. Changed source analyses are marked stale. Restarted queued jobs become failed without automatically repeating provider calls.

Writes use the existing serialized atomic JSON store, under the existing single-process data-directory lock. The generation queue accepts at most ten pending jobs and the mutation API permits ten requests per 15 minutes/IP. This remains a private local prototype, not a multi-tenant production service.

## Deterministic pattern discovery

The separate DNA pattern report joins valid post associations, completed analyses, current DNA references and real exported metrics. It compares hook type, editing pace, early/later first-cited product samples, supported CTA presence, visual style and story structure. No application code classifies free text into those groups.

Rules:

- Reuse the existing requirement that publication/collection elapsed intervals are known, positive and equal across the imported profile sample. This assumes cumulative counts and is not proof of equal audiences, distribution, or metric observation semantics.
- Require at least two distinct assets per group and two eligible groups. Unknowns, conflicting values, stale DNA and missing metric inputs are excluded per attribute/metric.
- Reject repeated video IDs and byte-identical asset hashes as independent evidence; withhold comparisons when asset identity is unavailable.
- Keep views and `(likes + comments + shares) / views × 100` separate. Ratios require positive views and all three interaction counts. Reach and impressions are never substituted.
- Show descriptive medians, sample counts, supporting post/video IDs and source evidence. No causal, confidence, winning-style, predictive-accuracy or virality claim is made.
- Five imported posts often cannot satisfy these safeguards. Two-per-group is a display rule, not a statistical reliability threshold. An insufficient-data explanation is a correct outcome.

CTA true-versus-false comparisons are generally unavailable because this sampling scheme does not prove absence. Supporting a false label would require an explicit reliable whole-video absence measurement/annotation, not relaxed validation.

## Editing blueprint

`DATA_DIR/editing-blueprints.json` stores explicit generated plans with selected niche, optional target video, source snapshot/hash, schema version, model, timestamp, evidence and safe status/error diagnostics. Matching completed plans are reused. Updates to imported observations, pattern evidence or target analysis invalidate their source snapshot; stale plans are flagged and not presented as current recommendations.

A plan includes proposed opening structure, editing sequence, pacing, reveal timing when supported, CTA guidance, limitations, and one A/B experiment with a proposed fixed observation age and a measurable views or interaction-per-view criterion. Proposed edit timings are planning suggestions, never new observed measurements.

Every supported section must cite relevant historical pattern IDs or supported findings from the user's target video. The request schema constrains IDs and basis choices, and the runtime validator checks scope and references. Unsupported sections cite nothing and explain insufficiency. Unknown data does not become a recommendation.

Historical guidance is labeled exploratory historical observation. Without supported patterns, guidance must be labeled individual creative advice, not niche-performance evidence. If neither supported patterns nor supported target findings exist, generation is rejected before a provider call. Inputs provide aggregate observations, not reference creators' scripts for copying. No video is automatically rewritten or rendered.

The A/B criterion compares the chosen metric at the same proposed post-publication age. A higher result for variant B is an exploratory result, not statistical significance, proven uplift or causal evidence. The proposed design still needs human review for confounders and practical feasibility.

## API

| Method | Endpoint | Behavior |
| --- | --- | --- |
| GET | `/api/intelligence/videos/:id` | DNA record/readiness/provider-configuration flags; read-only |
| POST | `/api/intelligence/videos/:id` | Explicit generation/retry; reuse a current completed record |
| GET | `/api/intelligence/blueprints?reportId=…` | Saved plans and source-staleness flags |
| POST | `/api/intelligence/blueprints` | JSON `{reportId,niche,targetVideoId}`; explicit generation/reuse |

The existing `/api/niche` reports now include joined DNA and DNA-pattern summaries. Getters do not call OpenAI. API configuration readiness does not validate account billing or model access.

## Files created and modified

Created:

- `server/src/dna/schema.js`: attribute contracts, source references, request schema and evidence/timing validation.
- `server/src/dna/patterns.js`: deterministic grouping and medians.
- `server/src/dna/blueprint.js`: blueprint request constraints and evidence validation.
- `server/src/dna/service.js`: isolated persistence, hashing, caching, queueing and generation.
- `server/src/dna/routes.js`: explicit local generation/read APIs.
- `client/src/components/CreativeDna.jsx`, `DnaPatterns.jsx`, `EditingBlueprint.jsx`: dashboard controls and evidence displays.
- `server/test/dna.test.js`: nine regression tests with multiple validation cases.
- This document.

Modified: `server/src/provider.js`, `server/src/app.js`, `server/src/niche/service.js`, `client/src/components/NicheInsights.jsx`, `NicheIntelligence.jsx`, `NichePatterns.jsx`, `client/src/styles.css`, and documentation. Existing analysis/scoring/CSV/media-download behavior was not replaced. No dependencies added.

## Actual verification

- `npm test`: **39 passed, 0 failed, 0 skipped**. All 30 existing regression tests still pass. The final restricted run initially blocked nine HTTP tests with localhost `listen EPERM`; rerunning with local-server permission passed all 39.
- `npm run lint`: passed.
- `npm run build`: passed.

New tests cover supported extraction, unknowns, absent/conflicting evidence, incorrect categories, nonexistent references, invalid times, unsupported labels, source identity, duplicate requests, cached results, stale analysis detection, file hashing, provider failures/retries, unchanged analysis/review data, equal/unequal windows, missing views/interactions, insufficient groups, duplicate underlying assets, median calculations, relevant blueprint citations, missing-evidence refusal, source invalidation and persistence after restart. Imports are asserted to trigger no generation. Model requests use local stubs; no paid AI or social-platform calls were made.

One intermediate test failed because the test provider's fail-once flag kept failing on subsequent retries; the fixture was corrected. Final results above are from the subsequent passing run, not an assertion that every intermediate run passed.

## Live-demo readiness and remaining limitations

The local implementation and automated workflow are ready for a controlled rehearsal. It is **not yet verified for a live demonstration**: browser-control access was unavailable, and no real DNA/blueprint provider request or genuine niche dataset was tested. Rehearse one explicit DNA extraction and one blueprint, inspect every cited observation and timing caveat, and retain saved valid results as a fallback. Those real calls use API credits.

Classification accuracy is not established. Evidence existence is validated, but model interpretation is not independently verified. Temporal attributes describe cited frame samples. Opening silence remains unmeasured. No scraping, social downloading, social login system, video generation, predictive model, scoring-rule replacement or public authentication has been added. Existing deployment limitations still apply.
