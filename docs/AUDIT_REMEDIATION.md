# Audit remediation — 12 November 2026

## Confirmed issues before edits

1. Standalone DNA is already supported by `server/src/dna/routes.js:5,9` and `server/src/dna/service.js:17,47`: a completed saved analysis is required, no niche report. DNA has its own atomic store, source hash/version validation, caching and request deduplication. However, `client/src/components/AnalysisReport.jsx:44` renders only creative review; `CreativeDna` is mounted from NicheInsights only. This hides an available feature from ordinary analyzed videos.
2. Blueprint `contextFor` in `server/src/dna/service.js:24-32` unconditionally looks up an imported niche report before examining optional target findings. Individual guidance is supported within a report, not standalone without a report. No API expansion is justified in this task.
3. `client/src/components/NicheIntelligence.jsx:27,29` exposes Analyze Profile, but `server/src/niche/socialmonitor.js:20-22` always returns SOURCE_UNSUPPORTED. Remove this misleading action while preserving import and saved reports.
4. Import diagnostics in `server/src/niche/routes.js:17-21` use INVALID_EXPORT for both malformed JSON and wrong export envelopes. `server/src/niche/socialmonitor.js:69` uses NO_VIDEO_POSTS for both zero candidate videos and rejected video rows. Improve frontend diagnostics with shallow preflight/context while keeping the canonical backend normalization and evidence rules unchanged. Explain global Settings -> Data -> Export everything instead of overview JSON.

## Preservation baseline

Before edits, SHA-256 fingerprints were saved outside the repository for videos.json and every analysis artifact. No private names, content or keys were output. Final fingerprints will be compared after verification.

## Implemented changes

- Added `client/src/components/VideoDna.jsx`: reads the existing standalone GET endpoint, displays saved results using CreativeDna, provides loading/network recovery, and connects evidence to the existing video player's seek callback. Mounted only for completed analyses in AnalysisReport. No generation on mount, viewing or polling. The existing explicit generation button owns POSTs; caching, queueing, evidence validation and storage are unchanged.
- Updated shared CreativeDna copy to disclose API credits and explicit generation.
- Removed the Analyze Profile form/action from NicheIntelligence. Kept the profile URL, JSON import, source capability information and saved reports. No backend collect behavior or protections changed.
- Added `client/src/nicheImport.js` for shallow JSON/envelope checks and contextual server-error explanations. Missing profile, zero videos, invalid candidate video rows, unsupported platform and malformed/wrong-format JSON are distinct. Existing successful-import counts and per-record skipped/warning notices remain. The backend still performs canonical normalization; no acceptance rules or API contracts were changed.
- Documented the exact export action and mandatory blueprint report dependency.
- Added one standalone HTTP integration regression and one import-diagnostic regression. Existing stubs and temporary stores only; no paid calls.

## Verification results

- `npm test`: 41 passed, 0 failed, 0 skipped; all previous 39 tests pass. New standalone test verifies GET makes no provider call, POST works with zero niche reports, cached results avoid another call, results reopen from persistent storage, blueprint without a report fails before provider invocation, and video metadata is unchanged.
- `npm run lint`: passed.
- `npm run build`: passed.
- `npm run check`: passed; two saved analyses, two saved creative reviews, zero active jobs; storage, metadata, FFmpeg and backend key-presence checks passed. No billing/model access verified.
- Browser: opened an existing analyzed video; Creative DNA shows Ready and Generate Creative DNA without an import. Did not click generation. Niche page has no Analyze Profile button; supported import, export instructions and empty/saved-report area remain accessible.
- Both real saved videos' standalone GET endpoints report ready=true and available=true, with no saved DNA record. These are readiness results, not a claim that a real model response has passed validation.
- SHA-256 comparison: videos.json (both records, analyses and creative reviews) plus all 34 analysis artifacts are byte-for-byte unchanged.
- No real import committed, paid model call, social-platform request, social-source change, data reset or dependency addition.

## Limitations and next end-to-end test

Creative DNA now has a standalone UI for ordinary completed videos, backed by the existing service. Real provider output is still unverified. Editing Blueprint continues to require a valid imported niche report, plus supported historical patterns or eligible findings from an optional completed target video. Individual guidance means no supported historical pattern is required; it does not remove the report prerequisite.

The current local SocialMonitor dataset has no video posts and PULSE has no niche report. No automatic local SocialMonitor connection or new social-data retrieval was added. A permitted populated version-1 export remains an external prerequisite for niche patterns/blueprints. Performance CSV does not automatically supply a niche report.

Next single real end-to-end test: open one of the two existing analyzed videos, explicitly select Generate Creative DNA once, wait for its terminal state, inspect evidence and unknown values, close/reopen the video and verify saved results are reused. This uses API credits and was intentionally not performed. It needs no social import. A completed or insufficient-evidence result is valid depending on source support; a failed provider response must be diagnosed rather than hidden by weaker validation.
