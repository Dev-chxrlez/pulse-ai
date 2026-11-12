# Official-only TikTok acquisition

Implemented 12 November 2026. **Connector implemented and fixture-tested; live account acceptance NOT passed.** No extra platforms or analytics were added.

## Actual acceptance status

| Required proof | Result |
|---|---|
| Existing registration reused | One registered TikTok profile found; automatically selected source profile ID 3 |
| Developer app configured locally | No TIKTOK_CLIENT_KEY or TIKTOK_CLIENT_SECRET in inspected app .env files |
| Matching approved redirect verified | No; TIKTOK_REDIRECT_URI not explicitly configured |
| OAuth completed for this account | No stored TikTok connection/grant |
| Granted scopes | None locally available |
| Official user identity checked live | Not attempted; missing grant blocks before network |
| Actual eligible video response | Not obtained; this is NOT an authorized empty response |
| Actual API records persisted/displayed | No; no production niche report created |
| Automated official-response fixtures | Passed, including persistence and GET /api/niche ID/metric parity |

A developer app may exist in the user's external TikTok portal. Its approval, account eligibility, granted scopes and redirects were not independently verified. No credentials were invented, printed, copied into frontend code, or requested through chat.

## Commands

With the existing PULSE API running:

```
npm run tiktok:status
npm run tiktok:acquire
```

No JSON/CSV or URL entry. The worker reads SocialMonitor's existing TikTok registration. With more than one registration, explicitly choose its source ID:

```
npm run tiktok:status -- 3
npm run tiktok:acquire -- 3
```

The CLI uses the running PULSE backend and its existing local capability boundary. It does not instantiate a competing metadata-store writer. Backend ports/origin are the verified local defaults (3001 / localhost:5173). POSTs require loopback, trusted origin/custom header and a single-use capability. These are local prototype protections, not public multi-user authentication.

The real status command returned authorizationStored=false, grantedScopes=[], and all three explicit TikTok configuration flags false. The real acquisition command exited nonzero with TIKTOK_AUTH_REQUIRED before any TikTok request or post write. This confirms safe refusal only, not working acquisition.

## Existing OAuth inspection and exact prerequisites

SocialMonitor's existing `apps/app/src/core/tiktok-api.ts`:

- Lines 16–24 request user.info.basic, user.info.profile, user.info.stats and video.list; the default callback relay is an upstream Shades website.
- authorizeUrl binds a random state nonce to brand/user IDs for ten minutes. routes.ts has authenticated/admin connection initiation and a public state-validated callback.
- finishSignIn exchanges the authorization code and stores tokens/account metadata. It does not itself enforce the registered username or all granted scopes. The new acquisition connector fails closed on both before requesting videos.
- access refreshes tokens inside its enrichment implementation. That function was not imported or used. The new worker handles its own official refresh and persists rotated tokens in the same existing source connection row.

Configure these **only in `/Users/apple/Desktop/SocialMonitor/.env`**, not frontend code:

- TIKTOK_CLIENT_KEY: the key issued for the intended app.
- TIKTOK_CLIENT_SECRET: the matching app secret.
- TIKTOK_REDIRECT_URI: the exact static HTTPS URI registered for that app and backed by a verified callback/relay that reaches SocialMonitor's state-validated callback.

Restart SocialMonitor after configuration so its existing OAuth initiation uses it. Do not press its general Update button: that still has the disallowed collector path. Completing app-dashboard sign-in is separate from authorizing TikTok.

The connector minimally requires granted user.info.basic, user.info.profile (username identity), and video.list. **The unchanged upstream OAuth flow requests user.info.stats too.** That extra scope must also be available if using that unchanged flow. Do not assume adding three scopes in the portal makes an existing four-scope request valid. No OAuth scope list, callback routing, developer approval or relay was changed in this task.

Do not blindly use the upstream default third-party relay for an independently owned developer app. Its ownership/trust, registered URI and forwarding behavior have not been verified here. No public tunnel, server exposure, HTTPS workaround or new OAuth relay was deployed. The missing valid redirect/callback arrangement is a real acceptance blocker, not a completed setup step.

After the owner completes a legitimate OAuth flow, the registered brand must have a source network_tokens TikTok row with access_token, refresh_token, open_id, scope, expires_at and refresh_expires_at. Do not manually fabricate this row or paste access tokens into PULSE. This task reuses that existing authorization store; it does not add another OAuth implementation.

Official references: [Login Kit web prerequisites and redirect rules](https://developers.tiktok.com/docs/en/login-kit-web), [user-info fields/scopes](https://developers.tiktok.com/docs/en/tiktok-api-v2-get-user-info), [token lifecycle and rotation](https://developers.tiktok.com/docs/en/oauth-user-access-token-management).

## Independent acquisition path

`server/src/tiktok/connector.js` imports only PULSE normalization/error helpers. It never imports SocialMonitor collectors, orchestration, browsers, challenge handling or AI services.

1. Validate existing registered URL and handle.
2. Require a stored account grant and required scopes.
3. Refresh access when its remaining lifetime is <=60 seconds; reject missing/expired refresh grants or missing app config. Use returned lifetimes, not hardcoded token durations. Persist rotation before continuing.
4. GET `https://open.tiktokapis.com/v2/user/info/?fields=open_id,username`. Both open_id and username must match the stored grant/registered account; missing username fails closed.
5. POST `https://open.tiktokapis.com/v2/video/list/` with explicit fields and max_count=20. Follow returned decreasing timestamp cursors; reject missing/repeated/non-advancing cursors.
6. Bound acquisition to five pages (at most 100 returned rows before deduplication); report hasMore when more history remains. A bounded incomplete result is never labeled a complete account history.
7. Map official IDs, original URLs, descriptions, publication dates and views/likes/comment/share counts. Null/unavailable metrics and publication dates stay null. Captions missing in official records remain null in official persisted records. Verify returned URLs belong to the authorized account; reject incompatible/missing URLs instead of inventing them. No cover image or media file is downloaded.
8. Stamp actual observation time after successful retrieval; deduplicate IDs deterministically and report duplicates. Validate the mapped batch with the existing adapter before any post persistence.
9. A verified terminal empty list returns authorized_empty/persisted=false. Existing reports are preserved. Provider/mapping errors also preserve the previous report.
10. Valid mapped records go directly to the existing PULSE Niche service (not the empty SocialMonitor posts table). Its existing five-post display/storage cap remains; receivedVideos versus retainedVideos are different. Original URLs are additionally preserved as originalPostUrl while postUrl retains existing canonical form. Links for unchanged IDs remain intact.

The worker reads native SQLite without migrations. Registration/grant reads use a read-only connection. Only an actual successful refresh opens a write connection, solely to compare-and-swap the existing network_tokens token/expiry/scope fields. Concurrent source rotation fails explicitly. No other source records are written and tokens never cross worker stdout/IPC or enter PULSE's report store. Secrets used for refresh are read from the source .env inside the worker's isolated environment. Keys supplied only through another process's inherited environment are not automatically available to this worker.

Server-generated normalized records carry source=tiktok_official and provenance.method=official_tiktok_api, accountIdentityVerified=true, independentlyVerified=false. The final flag avoids claiming independent verification of platform metrics. Existing Niche reports identify official source metadata. No new dashboard was built; real saved reports would use its existing refresh/load and post rendering.

Missing grant, missing scope, token rejection, identity mismatch, rate limits, malformed response, pagination failure and unavailable API have distinct safe errors. Provider error text, request bodies, secrets and raw private data are never logged. Source credentials remain protected by the existing local OS/data-directory boundary; no new encryption/vault claims are made.

## Verification

- npm test: **53 passed, 0 failed, 0 skipped** (all previous 46 pass).
- npm run lint: passed.
- npm run build: passed.
- npm run check: passed; two analyses/reviews, zero active jobs.
- Seven new mocked regression tests cover unauthorized grants, absent scopes, identity mismatch/missing identity, independent listing from no existing posts, documented response mapping, pagination and bad cursors, duplicates, null metrics/times/captions, expired access/refresh, rotated-token persistence order, refresh scope/account rejection, provider errors, authorized empty, bounded-history indication, concurrent acquisition refusal, repeated persistent snapshots, existing video matches, unchanged protected stores, and same post IDs/metrics returned by PULSE's GET /api/niche.
- Fixture records exist only in temporary test stores. No fake source/production records were inserted.
- All 35 preexisting production PULSE metadata/analysis files remained byte-identical. Source still has zero posts, grants and runs. SocialMonitor tracked source remains unchanged.
- No OpenAI calls, public-page collection, browser automation, media download or social account API call was made. Only developer documentation and local service endpoints were accessed.

Fixture tests are not proof of a real OAuth completion, real token refresh, eligible videos, live metrics or browser display of real records. Those acceptance items remain blocked by the prerequisites above. Do not proceed to additional platforms or change the ranking gate to manufacture results.

## Files

Created: server/src/tiktok/connector.js, worker.js, local.js; scripts/tiktok-official.mjs; server/test/tiktok-official.test.js; this report.

Modified: package.json (status/acquire scripts), server/src/app.js (official service wiring), server/src/niche/sync-routes.js (capability-protected official actions), server/src/niche/service.js (official provenance/original URL/null-caption preservation), client/src/components/NicheIntelligence.jsx (accurate source label only), README.md. No dependencies, SocialMonitor source edits, score changes, statistical-gate changes or media resets.
