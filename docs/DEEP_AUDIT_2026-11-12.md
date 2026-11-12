# PULSE AI: deep workflow audit

12 November 2026, Asia/Manila. Scope: registered account -> authorization -> post acquisition -> local transfer -> performance interpretation -> creative/video intelligence. This is a diagnostic audit, not a feature implementation.

## Conclusion

The real problem is an incomplete acquisition architecture, compounded by building downstream features before proving one authorized source account end-to-end. It is not merely a missing JSON file, installation issue, or API key.

PULSE has working local media analysis and an existing-data transfer mechanism. It does not currently deliver the requested automated, three-platform business-owner performance workflow. SocialMonitor's installed TikTok pipeline is not an official-only post acquisition path. Configuring keys alone would not repair that architecture.

## Current observations

| Observation | Audit result |
|---|---|
| SocialMonitor registered profiles | Three: one TikTok, one Instagram, one Facebook |
| SocialMonitor posts/comments | 0 / 0 |
| SocialMonitor collection runs/schedules | 0 / 0 |
| SocialMonitor network authorization records | 0 |
| TikTok/Meta app credentials in inspected .env files | Not configured in either application |
| PULSE saved niche reports from live API | 0 |
| PULSE videos | 2 |
| Saved analyses / creative reviews | 2 / 2 |
| Active analysis/review jobs | 0 |
| Both local health endpoints | Healthy |

Credential checks inspected presence only, never printed values. This does NOT establish that a developer app does not exist: the user says one is ready. Its external approval, scopes and redirect configuration were not verified. Inherited process-environment credentials were not inspected; the confirmed zero authorization rows alone establishes that no official connection is stored in this source database.

Registered URLs are identifiers. They are neither account-owner consent nor authorized API resource IDs. Instagram account eligibility and whether the registered Facebook URL represents an eligible managed Page were not verified. They cannot be established from a URL alone.

## Confirmed root causes and defects

### 1. Critical: the implemented connection transfers data but never acquires it

PULSE `server/src/niche/local-sync.js:18-35` checks localhost health, invokes a local export worker, validates the result and imports it. It never requests a social platform's posts. `sync-export.js:11` deliberately fails on an empty source. `socialmonitor.js:20-22` deliberately refuses live collection.

This explains the observed state exactly: empty source -> explicit zero-post failure -> no saved niche report. JSON transfer cannot create the missing source data. Calling the feature local sync was accurate; presenting it as progress sufficient to solve account intelligence was not.

### 2. Critical: upstream TikTok official API code is metric enrichment after public collection

SocialMonitor `apps/app/src/core/run.ts:258-262` obtains posts through the collector before calling `officialFigures` for TikTok. `core/collect/tiktok.ts:32-43` attempts public requests and falls back to a browser on failure. This path must not be invoked under the current restrictions.

`core/tiktok-api.ts:196-238` calls the official video-list API but only iterates over the already-supplied posts and replaces metrics when IDs match. It does not turn unmatched API videos into new collected posts. The function also updates network_tokens account metadata at line 214; it is not a read-only drop-in for the current transfer worker.

Therefore, adding app keys and connecting an account would NOT make this installed TikTok pipeline satisfy the requested official-only acquisition requirement. A deliberately separate official-only retrieval/mapping path is still needed, and must be proven against one authorized account before being described as working. No claim that this is impossible is justified; it is not implemented/verified here.

The official TikTok API itself does support authorized listing: POST /v2/video/list/ with a user bearer token and video.list scope. The limitation above is this application architecture, not proof TikTok lacks a supported endpoint. Source: [TikTok List Videos](https://developers.tiktok.com/docs/en/tiktok-api-v2-video-list).

### 3. High: local official authorization is absent

Read-only SQLite counts show zero network_tokens. The inspected .env files have no TIKTOK_CLIENT_KEY/TIKTOK_CLIENT_SECRET or META_APP_ID/META_APP_SECRET configured. Source readiness checks: SocialMonitor core/tiktok-api.ts:25-26 and core/meta-api.ts:34-35. OAuth completion persists connection records, but none exists now.

The developer app may exist externally. Local configuration, matching app redirect URI, account consent, granted scopes, token lifetime and correct account identity remain unverified. A user being signed into SocialMonitor's dashboard is application authentication, not authorization from TikTok/Meta.

This is an external access/configuration blocker AND an unimplemented acquisition path, not something the business owner should be asked to solve by uploading another export.

### 4. High: registered-account discovery is not implemented in PULSE

`client/src/components/NicheIntelligence.jsx:21,28-36` still maintains a manually entered profileUrl and disables sync until it is supplied. `server/src/niche/sync-routes.js:24` accepts that URL. `sync-export.js:5` looks up the matching TikTok account internally, but there is no account-list endpoint that returns the three source registrations to the frontend.

The latest request to remove duplicate URL entry was interrupted before implementation. It has not been completed. This is a local engineering gap that does not require developer credentials to fix. It would remove friction, but would not produce posts or authorize the accounts.

### 5. High: the current PULSE import contract is TikTok-only

`server/src/niche/socialmonitor.js:10-18,40-60` parses TikTok profile and video URLs, numeric TikTok post IDs and TikTok metric rows. `sync-export.js:5,14` filters TikTok only. Instagram is explicitly unsupported; Facebook is rejected by TikTok URL validation.

SocialMonitor having three profile rows does not make PULSE a three-platform integration. Adding labels or listing those rows would still not establish retrieval, normalization or correct metric semantics for Instagram and Facebook.

SocialMonitor does have an official Meta retrieval function: `core/meta-api.ts:368-381` reads connected Page/Instagram resources through Graph API; it returns null without a stored connection. Its broader orchestration has alternative web paths. Reusing the overall Update action is not evidence of an official-only workflow. A separately verified connected-resource path would be required. This audit did not invoke it or fetch Meta account data.

### 6. High: the statistical gate conflicts with ordinary one-time snapshots

`server/src/niche/statistics.js:3-7` requires exactly equal positive publication-to-collection ages for every post. `server/src/dna/patterns.js:6` withholds all DNA performance patterns when that test fails.

A normal snapshot collects several posts now that were published on different dates. Their ages differ. I reproduced that behavior with four explicitly synthetic, in-memory diagnostic rows: the result was comparable=false, no rankings, and the unequal-interval reason. Nothing was saved to either application.

Thus even successful API retrieval of recent posts will commonly show counts but no comparisons or DNA performance patterns. This is a measurement-design mismatch, not a reason to silently remove the guard. Comparing lifetime totals as if equally exposed would be misleading. The product needs a justified observation-window design or clearly bounded descriptive outputs before promising performance patterns.

Further constraints: only five posts retained (`socialmonitor.js:68`), at least two distinct known analyzed assets in each of two groups (`dna/patterns.js:18-19`), and unknown/incomplete evidence excluded. The smallest eligible four-asset comparison fits under five, but leaves almost no room for missingness or multiple categories. These are safeguards, not statistical validation.

### 7. Medium: sync replaces snapshots instead of building a performance timeline

`server/src/niche/service.js:39-43` replaces the existing same-profile record, preserves matching video links for unchanged IDs, and keeps only the newly selected posts. It does not append metric observations over time. Older posts outside the retained five disappear from that profile snapshot.

Consequently the current niche store cannot substantiate account growth, time-series trends, or what has been happening over time. Successful repeated imports do not change that. Existing local video records are separate and are not deleted by this replacement.

### 8. Medium: metadata acquisition does not feed automatic video analysis

`socialmonitor.js:60` explicitly sets mediaUrl=null. The sync allowlist (`sync-export.js:18`) contains no original media file. A social permalink/thumbnail/embed is not an original video file.

Current video insights require a corresponding local file, explicit linking, completed analysis and optional explicit DNA generation. No permitted automatic-download path was established. Claiming automatic creative analysis from only API metadata would be false.

Standalone DNA is exposed for completed local videos (`AnalysisReport.jsx:45`). Blueprint still requires a niche report (`dna/service.js:26`), even where target-video-only guidance would otherwise be supported. That is a separate product constraint, not an API access issue.

### 9. Medium: the local sync boundary is a prototype, not account authentication

`sync-routes.js:9-23` restricts peer/Host/origin/forwarding headers and issues a short-lived single-use capability. That provides a local browser/CSRF boundary. It does not authenticate an individual business user or defeat a malicious local process that can spoof headers. The frontend cannot safely become a public multi-user service with this alone.

`sync-worker.js:17-24` pins audited helper hashes and opens SQLite readOnly/query_only. Good protections, but the broad upstream export helper still transiently reads brand fields/comments/schedules (`SocialMonitor core/transfer.ts:23-30`) before the allowlist excludes them. This is not a least-privilege upstream export API. Credential tables are not part of that helper's export, and raw comments/private fields are not forwarded into PULSE persistence.

The API health commit is pinned as well as source hashes (`local-sync.js:20`). A healthy upgraded installation can be reported as unavailable; this is an intentional compatibility gate but the current message does not distinguish version mismatch from downtime. These limitations did not cause today's empty-source failure.

### 10. High: acceptance tests did not validate the intended product outcome

The tests genuinely check validation, persistence, safe failure, filtering, concurrency and local security rules. The populated sync test injects a fixture export; it does not authenticate a real social account, retrieve real posts, inspect granted scopes or verify live media accessibility.

46 passing tests establish those implemented contracts. They do not establish an authorized working social integration, account eligibility, meaningful niche statistics, or correct real DNA model interpretation. Reporting test counts without leading with the missing end-to-end acceptance proof gave a misleading impression of readiness.

## What is confirmed, and what is not

Confirmed locally: upload/storage/playback functionality covered by regression tests; two saved analyses/reviews; standalone DNA UI/API readiness; JSON normalization/persistence; safe existing-data sync and its genuine zero-post result; no successful niche import; no stored social authorization.

Not confirmed: a single authorized social account retrieved end-to-end, usable granted platform permissions, correct multi-platform mapping, real populated-worker transfer, available original social video files, real DNA/blueprint provider output quality, or meaningful historical performance comparisons. No new empirical claims are made about external app approval or platform account eligibility.

## Why earlier work failed the requirement

The intended outcome was hands-off account performance intelligence. Implementation proceeded through installation -> export -> sync -> reporting UI without first proving a permitted source retrieval. Each layer was individually plausible but depended on an unproven upstream capability. When the source stayed empty, import/UX fixes could not repair acquisition. Explaining only missing credentials also omitted the installed TikTok architecture and downstream measurement blockers.

This was a sequencing and communication failure in the engineering work, not simply user setup being incomplete. I should have established the acquisition proof first, made the TikTok enrichment limitation explicit, and reported later work as downstream infrastructure rather than a functioning social workflow.

## Correct acceptance gate before further feature claims

The first decisive proof is one official, authorized account response with account identity verified, at least one real post returned if that account has eligible posts, and requested metric availability recorded without fabricated substitutions. Persist its mapped observations and show the same source IDs/counts in PULSE. Stop and report any missing scopes, account mismatch, empty eligible account, or rejected token. No protected-page or browser fallback.

Only after that proof should automatic account discovery/selection, refresh behavior and other platforms be expanded. Discovery can be built independently, but must not be presented as data access. Performance reporting then needs a measurement plan consistent with the returned data. Media analysis remains conditional on actually obtaining permitted files.

No credential or authorization setup was performed in this audit. No feature edits are being proposed as a substitute for that proof.

## Verification performed for this audit

- Read both source trees: collector orchestration, official adapters, sync worker/routes, normalization, persistence, frontend controls, statistical gates and blueprint requirements.
- Read-only SQLite aggregate counts; no tokens/passwords/cookies/private media accessed or printed.
- Presence-only .env checks, scoped as described above.
- Local health/status GETs; no live collection or mutation requests.
- One nonpersisted statistical diagnostic reproduced the snapshot-age gate.
- npm test: **46 passed, 0 failed, 0 skipped**.
- npm run lint: passed.
- npm run build: passed.
- npm run check: passed; 2 analyses, 2 reviews, 0 active jobs.
- No paid OpenAI or social-platform data requests. Official TikTok developer documentation was read for endpoint verification; this is not an account API call.

Only this report was added to project source/documentation. Build output was regenerated by the requested checks. Application code and source-account data were not modified. Final protected-file fingerprint comparison is recorded after the checks.

Final SHA-256 verification: all 35 preexisting PULSE metadata/analysis files are byte-for-byte unchanged.
