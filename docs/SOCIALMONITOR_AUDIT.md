# SocialMonitor capability audit and Niche Intelligence fallback

Audited **12 November 2026 (Asia/Manila)** against commit [`53302c9704a50dd3aea2518df08c35637d0e2b2b`](https://github.com/Shades-Media-Group/SocialMonitor/commit/53302c9704a50dd3aea2518df08c35637d0e2b2b). The source was cloned to temporary storage for inspection, outside PULSE. No upstream dependencies, server, browser, scheduler, collector or AI process were run.

## Decision before implementation

**No live SocialMonitor collection is enabled.** There is a useful JSON transfer interface, but the audited TikTok orchestration includes a protected-page browser fallback with automation suppression. That conflicts with the user's explicit no-circumvention constraints. Its optional official TikTok code enriches already-collected posts and requires separate credentials/consent; it is not a verified official-only arbitrary-profile discovery interface.

A key-presence-only local check found no `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET` or `SOCIALMONITOR_URL` configured in the PULSE environment. No social credentials or session contents were inspected. A public webpage's accessibility is not a determination that automated collection is permitted. No real TikTok/Instagram profile was requested or experimentally collected.

The permitted minimum is an **offline JSON-import adapter**, isolated from the main upload/analysis/CSV/creative modules. This meets the request's stop-condition fallback, not the full live-profile success path.

## Verified source capabilities

All entries below are **source inspection**, not live platform behavior. The pinned file/line links are the evidence; documentation claims are not treated as successful experiments.

| Question | Finding | Pinned source |
| --- | --- | --- |
| Profile URLs | TikTok and Instagram profile links are parsed and canonicalized; this is code support, not a verified successful collection. | [apps/app/src/core/store.ts:29](https://github.com/Shades-Media-Group/SocialMonitor/blob/53302c9704a50dd3aea2518df08c35637d0e2b2b/apps/app/src/core/store.ts#L29) |
| Recent TikTok videos | The public collector reads newest items and applies a configurable limit; it also supports photos, which this PULSE fallback excludes. | [apps/app/src/core/collect/tiktok-public.ts:149](https://github.com/Shades-Media-Group/SocialMonitor/blob/53302c9704a50dd3aea2518df08c35637d0e2b2b/apps/app/src/core/collect/tiktok-public.ts#L149); [apps/app/src/core/collect/tiktok.ts:154](https://github.com/Shades-Media-Group/SocialMonitor/blob/53302c9704a50dd3aea2518df08c35637d0e2b2b/apps/app/src/core/collect/tiktok.ts#L154) |
| Permalinks / publication / captions | TikTok mapping produces ext_id, a video/photo page URL, posted_at from createTime, and caption from desc. | [apps/app/src/core/collect/tiktok.ts:187](https://github.com/Shades-Media-Group/SocialMonitor/blob/53302c9704a50dd3aea2518df08c35637d0e2b2b/apps/app/src/core/collect/tiktok.ts#L187) |
| Views / likes / comments / shares | TikTok maps playCount, diggCount, commentCount and shareCount, preferring statsV2. Availability depends on the source response; no experimental live availability is established. | [apps/app/src/core/collect/tiktok.ts:188](https://github.com/Shades-Media-Group/SocialMonitor/blob/53302c9704a50dd3aea2518df08c35637d0e2b2b/apps/app/src/core/collect/tiktok.ts#L188); [apps/app/src/core/collect/tiktok-public.ts:14](https://github.com/Shades-Media-Group/SocialMonitor/blob/53302c9704a50dd3aea2518df08c35637d0e2b2b/apps/app/src/core/collect/tiktok-public.ts#L14) |
| Post video file URL | Not exposed by Post/CollectedPost or TikTok toPost. thumb_url is cover imagery. Comment media_url is a separate field for attachments, not the post video. | [apps/app/src/core/types.ts:74](https://github.com/Shades-Media-Group/SocialMonitor/blob/53302c9704a50dd3aea2518df08c35637d0e2b2b/apps/app/src/core/types.ts#L74); [apps/app/src/core/types.ts:135](https://github.com/Shades-Media-Group/SocialMonitor/blob/53302c9704a50dd3aea2518df08c35637d0e2b2b/apps/app/src/core/types.ts#L135); [apps/app/src/core/collect/tiktok.ts:195](https://github.com/Shades-Media-Group/SocialMonitor/blob/53302c9704a50dd3aea2518df08c35637d0e2b2b/apps/app/src/core/collect/tiktok.ts#L195) |
| Logged-out collection | Node requests without signed-in cookies are attempted first. The collector catches failure and opens a logged-out browser fallback. | [apps/app/src/core/collect/tiktok.ts:29](https://github.com/Shades-Media-Group/SocialMonitor/blob/53302c9704a50dd3aea2518df08c35637d0e2b2b/apps/app/src/core/collect/tiktok.ts#L29); [apps/app/src/core/collect/tiktok-public.ts:115](https://github.com/Shades-Media-Group/SocialMonitor/blob/53302c9704a50dd3aea2518df08c35637d0e2b2b/apps/app/src/core/collect/tiktok-public.ts#L115) |
| Protection handling | The fallback waits for WAF checks, uses visitor cookies for subsequent page requests and suppresses automation indicators. CAPTCHA detection stops the collector. PULSE does not invoke this fallback. | [apps/app/src/core/collect/tiktok.ts:50](https://github.com/Shades-Media-Group/SocialMonitor/blob/53302c9704a50dd3aea2518df08c35637d0e2b2b/apps/app/src/core/collect/tiktok.ts#L50); [apps/app/src/core/collect/tiktok.ts:104](https://github.com/Shades-Media-Group/SocialMonitor/blob/53302c9704a50dd3aea2518df08c35637d0e2b2b/apps/app/src/core/collect/tiktok.ts#L104); [apps/app/src/core/collect/browser.ts:55](https://github.com/Shades-Media-Group/SocialMonitor/blob/53302c9704a50dd3aea2518df08c35637d0e2b2b/apps/app/src/core/collect/browser.ts#L55) |
| Official TikTok credentials | Optional Login Kit / Display API integration needs client key/secret, consent and stored network tokens for the connected account. It does not authorize arbitrary niche profiles. | [docs/tiktok.md:5](https://github.com/Shades-Media-Group/SocialMonitor/blob/53302c9704a50dd3aea2518df08c35637d0e2b2b/docs/tiktok.md#L5); [apps/app/src/core/tiktok-api.ts:16](https://github.com/Shades-Media-Group/SocialMonitor/blob/53302c9704a50dd3aea2518df08c35637d0e2b2b/apps/app/src/core/tiktok-api.ts#L16); [apps/app/src/core/tiktok-api.ts:107](https://github.com/Shades-Media-Group/SocialMonitor/blob/53302c9704a50dd3aea2518df08c35637d0e2b2b/apps/app/src/core/tiktok-api.ts#L107) |
| Official TikTok collection scope | officialFigures calls video/list and overlays counts onto an existing posts array. The orchestrator invokes public collection before this enrichment, rather than using it as an independent official TikTok discovery path. | [apps/app/src/core/tiktok-api.ts:196](https://github.com/Shades-Media-Group/SocialMonitor/blob/53302c9704a50dd3aea2518df08c35637d0e2b2b/apps/app/src/core/tiktok-api.ts#L196); [apps/app/src/core/run.ts:258](https://github.com/Shades-Media-Group/SocialMonitor/blob/53302c9704a50dd3aea2518df08c35637d0e2b2b/apps/app/src/core/run.ts#L258) |
| Instagram browser adapter | Public profile web API, browser cookies/headers, login-dependent comment reading; returns post/reel URLs, captions, dates, possible views/likes/comments. Shares remain null. | [apps/app/src/core/collect/instagram.ts:35](https://github.com/Shades-Media-Group/SocialMonitor/blob/53302c9704a50dd3aea2518df08c35637d0e2b2b/apps/app/src/core/collect/instagram.ts#L35); [apps/app/src/core/collect/instagram.ts:65](https://github.com/Shades-Media-Group/SocialMonitor/blob/53302c9704a50dd3aea2518df08c35637d0e2b2b/apps/app/src/core/collect/instagram.ts#L65); [apps/app/src/core/collect/instagram.ts:99](https://github.com/Shades-Media-Group/SocialMonitor/blob/53302c9704a50dd3aea2518df08c35637d0e2b2b/apps/app/src/core/collect/instagram.ts#L99) |
| Official Meta support | Optional connected-account/business-discovery routes exist with Meta app keys and account permissions. igPost retains media type, permalink, thumbnail, counts; VIDEO media_url is not preserved as a downloadable post field. Instagram is not integrated into PULSE by this task. | [apps/app/src/core/meta-api.ts:34](https://github.com/Shades-Media-Group/SocialMonitor/blob/53302c9704a50dd3aea2518df08c35637d0e2b2b/apps/app/src/core/meta-api.ts#L34); [apps/app/src/core/meta-public.ts:68](https://github.com/Shades-Media-Group/SocialMonitor/blob/53302c9704a50dd3aea2518df08c35637d0e2b2b/apps/app/src/core/meta-public.ts#L68); [apps/app/src/core/meta-public.ts:176](https://github.com/Shades-Media-Group/SocialMonitor/blob/53302c9704a50dd3aea2518df08c35637d0e2b2b/apps/app/src/core/meta-public.ts#L176); [apps/app/src/core/meta-api.ts:296](https://github.com/Shades-Media-Group/SocialMonitor/blob/53302c9704a50dd3aea2518df08c35637d0e2b2b/apps/app/src/core/meta-api.ts#L296) |
| Data model / database | Native node:sqlite DatabaseSync, local SQLite data directory; posts and metric-history tables exist. Post records carry fetched_at, which is not independently verified per-metric observation provenance. | [apps/app/src/core/db.ts:1](https://github.com/Shades-Media-Group/SocialMonitor/blob/53302c9704a50dd3aea2518df08c35637d0e2b2b/apps/app/src/core/db.ts#L1); [apps/app/src/core/db.ts:51](https://github.com/Shades-Media-Group/SocialMonitor/blob/53302c9704a50dd3aea2518df08c35637d0e2b2b/apps/app/src/core/db.ts#L51) |
| API interface | Local JSON HTTP routes include GET /api/posts with brand/network filters and GET /api/export. Export supports brand selection. These are not unauthenticated integration endpoints. | [apps/app/src/server/routes.ts:344](https://github.com/Shades-Media-Group/SocialMonitor/blob/53302c9704a50dd3aea2518df08c35637d0e2b2b/apps/app/src/server/routes.ts#L344); [apps/app/src/server/routes.ts:501](https://github.com/Shades-Media-Group/SocialMonitor/blob/53302c9704a50dd3aea2518df08c35637d0e2b2b/apps/app/src/server/routes.ts#L501) |
| API authorization | API/media access normally requires a session; route guards enforce user/brand privileges. PULSE does not copy cookies or disable these checks. | [apps/app/src/server/main.ts:171](https://github.com/Shades-Media-Group/SocialMonitor/blob/53302c9704a50dd3aea2518df08c35637d0e2b2b/apps/app/src/server/main.ts#L171); [apps/app/src/server/routes.ts:145](https://github.com/Shades-Media-Group/SocialMonitor/blob/53302c9704a50dd3aea2518df08c35637d0e2b2b/apps/app/src/server/routes.ts#L145) |
| JSON transfer | Version-1 dump: app, version, exported_at, tables containing profiles/posts and other tables. Only selected profile/post fields are imported by PULSE; no settings, comments, browser data or credentials are retained. | [apps/app/src/core/transfer.ts:4](https://github.com/Shades-Media-Group/SocialMonitor/blob/53302c9704a50dd3aea2518df08c35637d0e2b2b/apps/app/src/core/transfer.ts#L4); [apps/app/src/core/transfer.ts:14](https://github.com/Shades-Media-Group/SocialMonitor/blob/53302c9704a50dd3aea2518df08c35637d0e2b2b/apps/app/src/core/transfer.ts#L14) |
| MCP | Stdio MCP tools wrap the dashboard API; posts tool emits compact text, not raw JSON. Its generic fetch does not attach a session, while the current server normally requires one; compatibility is not experimentally verified. | [apps/app/src/mcp/main.ts:1](https://github.com/Shades-Media-Group/SocialMonitor/blob/53302c9704a50dd3aea2518df08c35637d0e2b2b/apps/app/src/mcp/main.ts#L1); [apps/app/src/mcp/main.ts:12](https://github.com/Shades-Media-Group/SocialMonitor/blob/53302c9704a50dd3aea2518df08c35637d0e2b2b/apps/app/src/mcp/main.ts#L12); [apps/app/src/mcp/main.ts:157](https://github.com/Shades-Media-Group/SocialMonitor/blob/53302c9704a50dd3aea2518df08c35637d0e2b2b/apps/app/src/mcp/main.ts#L157) |
| CLI / independent operation | Package scripts start a separate dashboard/API and MCP process. No standalone authenticated TikTok discovery JSON CLI is shown by these scripts. It can run separately from PULSE. | [apps/app/package.json:6](https://github.com/Shades-Media-Group/SocialMonitor/blob/53302c9704a50dd3aea2518df08c35637d0e2b2b/apps/app/package.json#L6); [README.md:41](https://github.com/Shades-Media-Group/SocialMonitor/blob/53302c9704a50dd3aea2518df08c35637d0e2b2b/README.md#L41) |
| Dependencies | Separate app uses Playwright, MCP SDK, WebAuthn server, fflate, nodemailer and Zod; root adds Preact/Vite/TypeScript and Yarn tooling. None were installed into PULSE for this integration. | [apps/app/package.json:14](https://github.com/Shades-Media-Group/SocialMonitor/blob/53302c9704a50dd3aea2518df08c35637d0e2b2b/apps/app/package.json#L14); [package.json:18](https://github.com/Shades-Media-Group/SocialMonitor/blob/53302c9704a50dd3aea2518df08c35637d0e2b2b/package.json#L18) |
| License / maturity | MIT copyright Shades Media Group; notice required for copies/substantial portions. Package version 0.1.1; README labels development status. PULSE vendors no upstream implementation. | [LICENSE:1](https://github.com/Shades-Media-Group/SocialMonitor/blob/53302c9704a50dd3aea2518df08c35637d0e2b2b/LICENSE#L1); [apps/app/package.json:1](https://github.com/Shades-Media-Group/SocialMonitor/blob/53302c9704a50dd3aea2518df08c35637d0e2b2b/apps/app/package.json#L1); [README.md:25](https://github.com/Shades-Media-Group/SocialMonitor/blob/53302c9704a50dd3aea2518df08c35637d0e2b2b/README.md#L25) |

## Field mapping implemented in PULSE

The adapter accepts the real `exportAll` version-1 shape, not a fictional SocialMonitor API response. It identifies the selected profile by `profiles.network`, canonical `profiles.url`, `profiles.handle`, and `posts.profile_id`.

| PULSE field | Audited export field / policy |
| --- | --- |
| platform / account / profileUrl | matched TikTok profile; normalized HTTPS profile URL |
| postId | posts.ext_id, preserved as a string |
| postUrl | posts.url; must agree with selected TikTok account and post ID |
| publishedAt | posts.posted_at; null remains null |
| description | posts.caption, not the upstream AI-generated description |
| metrics.views | posts.views; no reach/impressions substitution |
| metrics.likes / comments / shares | posts.likes / comments_count / shares |
| collectedAt | posts.fetched_at only, never exported_at or PULSE import time |
| mediaUrl | always null: no post-video URL exists in the audited normalized shape |
| source / provenance | socialmonitor + user_supplied_json; independentlyVerified:false |

Unknown counts remain null; real zeros are preserved. Invalid values are skipped with warnings. Post IDs are deduplicated; the newest timestamped reading wins within a file. At most five newest-by-known-publication-date video posts from the export are retained. Unknown publication dates sort last. These are not asserted to be the account's current newest videos. Importing the same profile replaces its local snapshot and preserves links to unchanged post IDs; it does not create metric history or overwrite existing Performance CSV records.

## Chosen architecture

```text
Niche Intelligence page
  → Express /api/niche/import (local multipart JSON)
  → independent SocialMonitor export adapter
  → allowlisted normalization (one TikTok profile / five video posts)
  → niche.json + descriptive statistics
  → optional link to a separately user-uploaded PULSE video
  → existing saved analysis / creative-review detail view
```

No source service URL, cookies, social login tokens, browser sessions or arbitrary network destinations are configured. No backend downloads occur. Post links open only as validated original-page links; they are never treated as media. Since remote acquisition is absent, SSRF download protections are not being claimed as implemented; they remain a prerequisite for any future downloader.

The fallback retains no comments, account-token tables, brand descriptions, browser storage, thumbnails, raw JSON or unknown fields. Original uploaded video metadata/analysis and Performance CSV storage are separate and unchanged by niche imports. The existing local data-directory lock protects all JSON stores at the process entry point.

## Features that work

- TikTok HTTPS profile validation; explicit unsupported Instagram/short-link/foreign-host handling.
- Analyze Profile checks the supported integration boundary and reports `SOURCE_UNSUPPORTED`; it does not pretend that collection ran.
- Import a matching SocialMonitor JSON export, show real available post links/captions/counts/timestamps, import warnings and provenance, and persist the normalized report.
- Exported authorization errors and collection failures are distinguished from usable historical metadata; original error text is not retained/displayed.
- User-uploaded video matching/unlinking, pending/completed analysis status, and opening existing evidence/creative reports. Linking does not start another paid AI job.
- Reimport deduplication and local persistence, maximum 1 MiB input, 5,000 source posts/1,000 source profiles, five retained videos, 20 reports, and mutation rate limits.
- Exploratory views/interaction-per-view comparisons **only** when all posts have known positive, exactly equal elapsed publication-to-collection intervals. These are cumulative-counter/elapsed-age proxies, not verified equal audience or distribution conditions. Ratios require views > 0 and known likes/comments/shares; rankings withhold missing inputs. A median baseline needs at least three measured posts and refers only to this small imported sample.
- With unequal/incomplete intervals, raw metrics remain visible in publication order; top/bottom rankings and baseline are withheld. No lifetime-view ranking is presented as age-independent.

## Blocked / intentionally not implemented

- Live arbitrary-account discovery through SocialMonitor, including browser fallbacks.
- Integration with its authenticated API or MCP via copied session cookies.
- A standalone official TikTok collection path or developer-account setup.
- Instagram collection.
- Video extraction/download from webpages, thumbnails or comment attachments.
- Fresh collection dates/metrics when merely importing an old export.
- Account-wide causal explanations, high-performing-topic claims from captions alone, generated niche hooks/editing pace/story-structure advice, or cross-post visual patterns without analyzed media and comparable real data.
- New AI niche recommendations. A linked upload may already have its own creative review; that is clearly labeled separately, not attributed to SocialMonitor or to a niche-level model.
- Predictions, virality probabilities or validated accuracy statistics.

## Setup and use

1. Obtain a permitted version-1 JSON export from a separately operated SocialMonitor instance using its authenticated export action. Use a single-brand export if the full file exceeds 1 MiB. This audit does not recommend running the blocked browser collection path to create demo data.
2. Do not upload a SQLite backup, browser profile, cookies, MCP transcript or credential bundle. The supported JSON export excludes network-token/settings tables, but may contain comments or other private material: select a narrowly scoped export. PULSE retains only selected post/profile fields.
3. Open Niche Intelligence, enter the matching TikTok profile URL, and select **Import SocialMonitor JSON**. The app says JSON-import-only; **Analyze Profile** returns the live-collection blocker.
4. Inspect timestamps, warnings and missing metrics. Rankings may correctly remain unavailable.
5. If permitted video files are available, upload them through the existing Video Analysis page and link them to posts. Open their normal reports for evidence-based creative suggestions. No media is fetched from social URLs.

No new PULSE dependencies or credentials are required for the fallback. SocialMonitor itself needs its separately documented runtime/setup; it was not installed or started by this task. No real SocialMonitor export was supplied, so real-export compatibility is source-mapped and fixture-tested, not empirically proven with a user dataset.

## Files changed

Created: `server/src/niche/socialmonitor.js`, `statistics.js`, `service.js`, `routes.js`; `client/src/components/NicheIntelligence.jsx`; `server/test/niche.test.js`; this audit.

Modified: `server/src/app.js` (mount isolated routes), `client/src/main.jsx` (navigation/page), `client/src/api.js` (preserve structured error code), `client/src/styles.css` (page styles), and `README.md` (usage).

No upstream source bodies or runtime were copied into PULSE, so no bundled upstream code notice is required. Attribution: SocialMonitor by Shades Media Group, MIT-licensed, at the pinned repository above. Any future copying of substantial code must retain its copyright and full license notice; names/logos have separate upstream trademark rules. No SocialMonitor branding assets are used.

## Test evidence

Executed locally:

- `npm test`: **26 passed, 0 failed, 0 skipped**. Includes all previous video-analysis, creative-evidence, comparison, performance-import, restart and storage-lock regressions.
- `npm run lint`: passed.
- `npm run build`: passed.

New tests cover strict profile URLs, unsupported Instagram, blocked/unavailable live source with **zero outgoing social requests**, export structure/provider-error payloads, missing metrics, real zero preservation, duplicate reading selection, bad permalinks, absent media, unequal/missing windows, exploratory ranking, safe credential/comment omission, persistence, video linking/unlinking, upload limits and HTTP errors. Fixtures are hand-authored structural examples in isolated temporary storage, not scraped or presented as actual accounts.

Not verified: live SocialMonitor behavior, developer permissions, real social data retrieval, a user's real export, source media accessibility, AI niche recommendation quality, or rendered browser/mobile layout. No paid AI request, social collection, authentication change, public service or deployment was performed.

## Hackathon recommendation

Include **only the clearly labeled local JSON-import fallback**, with a genuine permitted export and user-supplied video files if available. Rehearse it before the demo. Keep the existing upload/creative/CSV workflow as the primary demonstration. Do not pitch paste-a-profile automatic niche analysis as working: the source-access blocker is substantive and remains unresolved.

## Subsequent media-linking extension

The later [social-video creative integration](NICHE_CREATIVE_INTEGRATION.md) adds direct post-specific file upload, inline reuse of saved editing insights, and a conservative structured-duration pattern report. The source audit above remains a record of the original fallback implementation. Live collection, social media downloading, and unsupported style inference remain disabled.
