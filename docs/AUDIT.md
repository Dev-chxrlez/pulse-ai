# PULSE AI — implementation and demo-readiness audit

Audit date: **11 November 2026 (Asia/Manila)**  
Scope: current local implementation, automated regression tests, build, readiness checks, and review of known runtime/deployment limitations. This is not a penetration test, accessibility certification, load test, or independent validation of AI accuracy.

## Overall assessment

**Local MVP: implemented and passing automated checks.** The upload → analysis → creative review → comparison → CSV import → video matching workflow passes a combined regression test and survives backend restart in isolated test storage.

**Live demo: conditional readiness.** A live Phase 2 analysis was confirmed working by the user. One saved analysis is present, but no saved creative reviews exist at audit time. Real Phase 3 reviews, comparison material, actual CSV data, and a manual browser rehearsal are still needed.

**Public deployment: not ready.** Authentication/authorization and deployment-specific storage/routing controls remain unimplemented. No deployment was performed. Historical prediction is intentionally not trained or validated.

## Fresh verification results

| Command | Result | Evidence / qualification |
| --- | --- | --- |
| `npm run lint` | PASS | Frontend, backend, tests, and utility scripts checked |
| `npm run build` | PASS | Vite production build; 1,583 modules transformed |
| `npm test` | PASS | 15 passed, 0 failed, 0 skipped; approximately 3.3 seconds in this run |
| `npm run check` | PASS | Key configured, FFmpeg ready, storage writable, metadata readable |

Readiness snapshot: **1 saved analysis; 0 saved creative reviews; 0 active jobs**. Configuration presence does not verify billing, quota, or access to every configured model. No API key or private video filename is included in this report.

The previous demo-hardening pass also served the built frontend and `/api/health` successfully from the same local origin on port 4173 with isolated temporary storage. That smoke-test process was stopped afterward. This audit did not repeat paid OpenAI calls or inspect new live creative outputs.

## Feature status

| Area | Implemented behavior | Verification level |
| --- | --- | --- |
| Uploads | MP4/MOV/WebM; 100 MiB limit; signature checks; UUID storage names; failed-file cleanup | Automated HTTP tests, including actual oversize rejection |
| Library and media | Persistent metadata, video details, original download, HTTP Range seeking | Automated full/range retrieval and restart persistence; browser codec compatibility still manual |
| Video processing | ffprobe metadata; sampled frames; audio windows; scene-change candidates; no-audio handling | Real FFmpeg extraction from generated fixtures |
| AI analysis | Structured reports, evidence-reference validation, persistent stages, explicit retries | Adapter/error tests use test doubles; user confirmed one live analysis worked |
| Creative review | Five weighted criteria, unknowns preserved, source-linked rationales, proposed hooks, edit priorities | Validation, scoring, persistence, and request-deduplication tests; live review not verified in this audit |
| Comparisons | Two or three saved creative reviews, shared-criterion scores, independent playback | API calculations and complete workflow tested; interactive layout not verified |
| Historical data | CSV preview, validation, duplicate-safe commit, provenance, matching/unlinking, descriptive summaries | Multipart HTTP tests, concurrent import tests, persistence and grouping tests |
| Prediction | Explicit untrained status; no performance probabilities or fabricated accuracy | Code/test assertions; no model exists to evaluate |
| Demo mode | Built UI and API served together; private local binding; data-directory lock | Same-origin smoke check and lock tests |

The 15 tests cover multiple assertions and requests; this count is not a measure of test coverage percentage, product accuracy, or security completeness.

## Findings and priorities

### P0 — Block public exposure: no authentication or authorization

Anyone able to reach the current backend can access its APIs, request paid work, and access stored media/reports. Localhost binding limits the default exposure, but CORS and rate limits do not replace identity or ownership checks.

**Required before public access:** authentication plus authorization on every media, report, import, matching and comparison route; deployment-appropriate quotas and abuse controls. A private single-user gateway is an alternative demo arrangement only if it covers the backend itself and prevents direct bypass. Neither arrangement has been implemented or verified.

### P1 — Finish real demo material and manual rehearsal

The saved library contains one analysis and no creative reviews. Automated outputs are test doubles and cannot serve as evidence that real hook suggestions or ratings are useful.

**Next:** inspect a real creative review, analyze a second contrasting video, compare saved reviews, and import genuine metrics only if available. Verify source references, transcription/OCR, proposed claims and the mobile/keyboard experience. Browser automation was unavailable during the hardening pass; no visual-accessibility pass is claimed.

### P1 — Confirm a persistent, single-process hosting design

Metadata uses serialized atomic JSON writes; queues are in process. A lock prevents concurrent entry-point processes sharing the directory and fails closed on a leftover lock. This does not provide distributed coordination, transactional media/database updates, or guaranteed durability after abrupt power loss.

**Required for hosting:** persistent private storage, one backend process per directory, backup/recovery procedure, and a host that keeps FFmpeg/background work alive. Moving to multiple instances requires a database, shared private object storage, and durable job coordination. Stale lock recovery must confirm that the previous owner is stopped before removing the lock.

### P1 — Validate frontend/backend upload routing before deployment

The frontend uses relative `/api` URLs. A separated frontend/backend needs routing that preserves multipart requests, Range headers, query strings and status codes. Compatibility with 100 MiB uploads and provider timeouts has not been established for a chosen hosting configuration.

**Next:** choose the hosting arrangement, configure access control and routing, then repeat authenticated end-to-end tests on that actual deployment. No Vercel/backend deployment success is claimed.

### P2 — Account for model and evidence limitations

Frames are sampled, transcript timestamps represent extraction windows, and scene changes are threshold candidates. Structured validation checks schema and source-reference existence; it does not establish that an observation or a quoted caption is correct. Creative ratings are subjective, and suggested wording may still need factual review.

**Action:** inspect original media and retain method/limitations labels. Never describe rubric scores as virality probabilities, expected views, measured engagement, or validated prediction accuracy.

### P2 — Keep historical findings descriptive

CSV metrics are user supplied. Missing values, different measurement windows, publication age, paid distribution, account audiences, and repeated links can confound comparisons. The three-distinct-video display rule for duration-group medians is not statistical validation. Duplicate identities are skipped; this is not a metric snapshot time-series system.

**Action:** validate real data quality and define a consistent target/window before considering modeling. Use held-out evaluation and a baseline before making any accuracy claim. No training or evaluation has occurred.

## Fixes completed during demo hardening

- Added one-command local demo mode and a key-safe readiness command.
- Unified actionable client messages for offline, timeout, non-JSON proxy responses, and API errors.
- Cleared an old upload selection when a newly chosen file fails validation.
- Prevented stale refresh responses from overwriting newer library state.
- Added an exclusive data-directory lock at backend startup.
- Added a combined full-workflow/restart regression test and focused client-error/lock tests.
- Wrote a demo runbook and deployment requirements.

These fixes reduce known failure modes; they do not establish production readiness.

## Explicitly not verified

- New live OpenAI creative-review generation or live comparison quality.
- Human accuracy of transcripts, visual findings, hook proposals, or scores.
- Browser visual layout, mobile rendering, full keyboard behavior, or native playback across codecs/browsers.
- Heavy concurrent use, disk exhaustion, backup restoration, or abrupt power-loss behavior.
- Public authentication, tenant isolation, deployed routing/upload limits, or hosting persistence.
- Penetration testing or a fresh dependency vulnerability scan during this report run.
- Predictive-model performance, calibration, generalization, or causal effects.

## Recommended next steps

1. Open the saved analyzed video and generate/inspect a creative review.
2. Add a second real cut and verify a useful side-by-side comparison.
3. Rehearse using saved real reports, with a clear fallback if a live provider call fails.
4. Test the browser manually using the runbook, including narrow viewport and errors.
5. Implement and verify access controls before attempting a public deployment.
6. Select compatible hosting, protect/backup private data, and repeat the workflow there.

Supporting documents: [demo runbook](DEMO.md), [deployment preparation](DEPLOYMENT.md), and [setup documentation](../README.md).
