# Local SocialMonitor sync — source inspection before implementation

12 November 2026. User-authorized transfer of existing local data only.

- Upstream `apps/app/src/core/transfer.ts:14-38` exports version-1 JSON through `exportAll(db, brandId)`. Its only runtime import is types.ts (pure helpers; no imports). exportAll performs SELECTs only, with no collection, browser, network or background invocation. It excludes auth/settings/token tables, but includes brand fields, comments and schedules. Those must not cross the worker boundary.
- Upstream `apps/app/src/core/db.ts:475-490` openDb invokes migrations and closeAnswered. It must NOT be used for this read-only operation. A native node:sqlite DatabaseSync(readOnly:true) supplies the same DB interface without migrations. A read transaction provides a consistent snapshot while the dashboard runs.
- Upstream `apps/app/src/server/routes.ts:346` provides authenticated /api/export. No credentials or cookies will be borrowed and no protected HTTP route will be requested. The local filesystem owner explicitly authorized independent export-function use; this is not HTTP authentication bypass.
- Upstream scripts/export.mjs creates a full SQLite backup, including protected tables; it is unsuitable for this transfer and will not be run.
- PULSE createNicheService.import already normalizes and atomically upserts a profile while preserving post links. Reuse it without changing its acceptance rules. Zero videos must fail before import, leaving saved reports intact.

The isolated worker will load only exact audited transfer.ts/types.ts hashes, open only the backend-configured source database read-only, select the requested configured TikTok profile, run the brand-scoped existing helper, and emit only an allowlisted version-1 profile/posts envelope. Full upstream export contents remain transient inside the worker; comments/private fields are never emitted, logged or stored in PULSE. The helper does transiently read them because upstream has no field-scoped export; this is not a least-privilege data-reading API.

Local sync is explicit button-triggered, not a timer or collection process. Its routes require loopback peers, loopback Host, trusted Origin, no forwarding headers, and a short-lived single-use capability for the sync mutation. This is local browser/CSRF protection, not multi-user authentication. Public deployment remains unsupported.

## Implemented workflow and configuration

Niche Intelligence -> enter the exact configured TikTok profile URL -> **Sync Local SocialMonitor**. Viewing/importing/polling never starts sync automatically. The button obtains a short-lived, single-use in-memory PULSE capability, then requests a transfer. No SocialMonitor authentication cookie, session token, password, or protected HTTP export endpoint is used.

Backend configuration (enabled in this Mac's existing server/.env without printing or replacing its secrets):

```
SOCIALMONITOR_LOCAL_ROOT=/Users/apple/Desktop/SocialMonitor
# Only if the source uses a different database location:
# SOCIALMONITOR_LOCAL_DATABASE=/absolute/path/to/socialmonitor.db
```

Restart the backend after environment changes. No new dependencies were installed. Node 26.13.0 provides native SQLite and TypeScript stripping here; the integration requires those capabilities. SocialMonitor's API must be running at fixed loopback 127.0.0.1:4401. Health requires audited commit 53302c9; worker imports require exact SHA-256 hashes of audited transfer.ts/types.ts. Source changes intentionally fail closed pending review.

A separate short-lived worker uses an empty environment (no inherited API keys), native SQLite readOnly plus query_only, a read transaction, memory/output/time limits, and brand-scoped exportAll. No persistent synchronization daemon, schedule or new social API was added. It never imports upstream server/main.ts, db.openDb, collectors or browser modules. Configured source filesystem access is authorized by the OS account running PULSE; this is not per-user SocialMonitor authorization and must stay local/private.

Only profile id/network/url/handle/last_status and selected post profile_id/network/ext_id/url/kind/caption/posted_at/fetched_at/views/likes/comments_count/shares cross IPC. Fields are not coerced or defaulted before canonical validation. Credentials, raw errors, private brand fields, comments, schedules and other accounts never cross that boundary. The upstream helper still reads its brand-scoped extra fields transiently within the worker; upstream has no narrower export function. No raw export is saved. Duplicate configured source profiles for the same account are rejected as ambiguous rather than arbitrarily selecting one.

The existing normalizer and Niche service preserve source IDs, links, times, null/zero metrics, duplicate selection and warnings. Reports label provenance method local_readonly_export while retaining auditedCommit, exportedAt and independentlyVerified=false. Same-profile sync replaces the metric snapshot and retains video matches for unchanged post IDs; it does not create historical metric time series. Import failures leave the previous report untouched.

POST /api/niche/local-sync/session issues a 60-second grant only to the trusted local page. POST /api/niche/local-sync requires that bearer grant, consumes it once, and requires the same loopback/origin/header guards. Foreign/missing origins, non-loopback peers/Host, forwarded requests and missing custom headers are rejected. Rate limits and one transfer at a time constrain abuse. This capability bootstrap does not authenticate individual local OS users or defend against malicious software already running as this user. It is not a public authentication scheme, and the existing prototype must not be publicly deployed.

## Real-source behavior verified

The selected configured TikTok account was checked through the real button in Chrome. The worker found the account and returned SYNC_EMPTY, HTTP 422:

> SocialMonitor contains zero posts. No import was performed and no collection was started.

No niche report or successful import was claimed. The actual source still contains zero posts and zero runs. Source database and WAL SHA-256 bytes were unchanged across this browser sync. All 35 preexisting PULSE metadata/analysis files were also unchanged from the preimplementation fingerprint baseline. SocialMonitor tracked source remained clean. Local configuration was the only private PULSE environment change.

## Tests and results

- npm test: **46 passed, 0 failed, 0 skipped**; all prior 41 regressions pass.
- npm run lint: passed.
- npm run build: passed.
- npm run check: passed; two saved analyses, two creative reviews, zero active jobs; FFmpeg/key-presence/storage checks pass. No provider billing/model call verified.
- Five new regression tests cover approved field filtering, profile/brand selection, missing/ambiguous profile, zero posts, no video rows, unsupported envelopes, populated temporary fixtures, duplicate rows, invalid metrics, missing metrics, repeat upserts, preserved links/stores, unavailable/unconfigured source, concurrent sync refusal, unknown-source execution refusal, safe errors, trusted origin/Host/forwarding guards, missing/replayed capabilities, and unchanged metadata. Tests use temporary stores and local doubles. No fixture was inserted into the user's real source database.
- Intermediate failures: the first test run exposed an incomplete analysis test fixture and an HTTP test client that ignored its overridden Host header. The fixture was completed and Host rejection was verified with node:http. No product validation was weakened. Final suite above passed after these corrections.
- Browser: verified the exact Sync Local SocialMonitor action and real zero-post response, without file selection.
- No social-platform requests or paid OpenAI calls were made. The only live source HTTP request is read-only localhost /api/health.

## Files changed

Created: server/src/niche/sync-export.js, sync-worker.js, local-sync.js, sync-routes.js; server/test/local-sync.test.js; this document.

Modified: server/src/app.js (route mounting), server/src/niche/service.js (local-transfer provenance only), client/src/components/NicheIntelligence.jsx (explicit sync, progress/error/count/missing-metric messages and provenance), server/.env.example, README.md. Local server/.env contains the opt-in source path. No SocialMonitor source change, normalization-rule change, evidence-score change or dependency addition.

## Remaining blocker

Local existing-data transfer is implemented and its real empty-source path is verified. A populated real-data transfer is not verified because SocialMonitor has no posts. The feature does not retrieve TikTok data, activate collectors, make platform authorization available, or make niche performance patterns meaningful without sufficient comparable real records. Obtain permitted existing data through an authorized source; do not trigger the protected-page fallback. Before independently importing data into SocialMonitor and restarting it, remember its existing automatic scheduler/backfill behavior described in the earlier installation audit; this transfer never starts or changes those operations.
