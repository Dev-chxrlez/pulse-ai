# Social post identification → uploaded media → creative insights

Implemented 12 November 2026. This extends the existing SocialMonitor **JSON-import** fallback; it does not enable live social collection, media downloading, or social authentication.

## Working user workflow

1. Import a permitted SocialMonitor version-1 JSON export on **Niche Intelligence**, selecting its TikTok profile URL. Existing identification, metrics, provenance, collection dates, deduplication and five-video limits remain in place.
2. Review the cards' actual views/likes/comments/shares, interaction-per-view ratios and publication/collection dates. Rankings and stronger/weaker sample-median labels remain withheld for missing or unequal publication-to-collection intervals. They describe measured counts, not creative effectiveness.
3. If a corresponding file already exists, select it, confirm that it matches the displayed account/post, and save the link. PULSE reads saved analysis and creative-review results. Viewing/linking does not queue model requests.
4. Otherwise choose **Upload corresponding video** on that card. The account, post ID and original post link remain visible. Preview the file and confirm it corresponds to that exact post and is permitted to use. The same reusable uploader and server validation accept MP4/MOV/WebM up to 100 MiB.
5. The targeted endpoint saves and links the file **without starting analysis**. Select **Analyze linked video** explicitly to use the existing FFmpeg/OpenAI workflow. API credits apply only when that action is taken (or an explicit creative-review request is made). Normal Video Analysis uploads retain their existing automatic-analysis behavior.
6. Once completed, the card displays saved hook/pacing/visual/CTA/product findings where available, with approximate frame/audio-window evidence links. Selecting evidence opens the original local player at that position. Missing categories are explicitly listed rather than invented.
7. Existing creative reviews show their saved score (or unscored state), coverage, criterion rationales, proposed hooks and prioritized edits. If no review exists, the normal explicit Generate/Retry action is available. No overall score is recomputed to circumvent coverage rules.
8. Review the **Creative Pattern Report**. It may correctly remain insufficient-data even when individual analyses are complete.

## Identity and association safeguards

The normalized SocialMonitor post ID, canonical post URL and all metric values stay together. The adapter remains TikTok-only, so its within-profile post-ID deduplication is equivalent to platform + post ID. Reimports preserve links for retained post IDs; source data never replaces PULSE analysis, media metadata, creative reviews or Performance CSV records.

Targeted upload: `POST /api/niche/:reportId/posts/:postId/video`, multipart field `video`, with `X-Pulse-Profile` matching the stored canonical account URL. This is a target-consistency check, **not authentication**. The server verifies the account/post and absence of a prior link before accepting the file, then rechecks atomically before linking. Existing links cannot be silently replaced through this endpoint.

If a concurrent match/reimport changes the target after media was saved, the operation reports that linking failed. The new file stays in the library without starting AI work; the user can select that saved file manually. Existing files and links remain intact. The application cannot prove that a user-selected file visually corresponds to a particular TikTok post; the preview, original-post reference, and explicit confirmation are the semantic identity check.

No changes were needed to the FFmpeg or OpenAI analysis implementation. Duration/resolution/decoding limits continue to apply during the existing analysis stage. Targeted uploads use the same extension, file-signature, size, UUID naming, persistence, cleanup and upload-rate controls as normal uploads.

## Creative Pattern Report rules

- Join imported post observations to **completed analyses of actual linked files**, never captions/thumbnails alone.
- All imported posts must have known positive, equal publication-to-collection elapsed intervals before performance-based pattern comparisons are considered. This is a cumulative-counter/elapsed-age proxy, not proof of equal audiences, measurement definitions or paid distribution.
- A view-based pattern requires at least four distinct analyzed assets with known views and at least two assets in each of two duration groups. These are conservative display rules, **not statistical validation**.
- Duplicate publications pointing to the same asset are not counted as independent examples; the current implementation withholds the pattern comparison in that case.
- The only structured attribute currently used is `analysis.metadata.duration`, derived from ffprobe. Groups are under 15 seconds, 15–30 seconds, and over 30 seconds. Each group shows supporting asset/post IDs, durations, views, sample size and median views.
- Hook style, product reveal timing, editing pace, CTA presence and visual structure are explicitly unsupported as pattern attributes. The current schema contains category-labeled prose and sampled evidence, not stable structured encodings of those attributes. Categories are not treated as presence/style labels, and prose is not classified through keyword guesses.
- When two eligible duration groups have different observed medians, one rule-based editing experiment is proposed: test two edits of the user's own video while changing duration only, then measure both at the same predefined age and record distribution differences. No causal effect, winning style, probability, or expected views is asserted.
- Tied medians do not produce a directional experiment. Insufficient data produces a reason and no recommendation.

Individual saved AI editing observations/reviews remain distinct from the descriptive, deterministic duration-group report. Creative ratings are never substituted for measured views or interaction counts.

## Optional future authorized-media interface — disabled design only

A future adapter could implement a boundary such as:

```text
resolveAuthorizedMedia({ platform, account, postId, permissionReference })
  → { verifiedSource, authorizationScope, expiresAt, boundedReadableStream }
```

It must not accept an arbitrary webpage URL as a media download target. Before enabling a provider, verify its permitted content-access mechanism and scope for that account/post. Keep any necessary provider secrets on the backend; do not import browser cookies or social sessions into PULSE.

The actual downloader must validate HTTPS destinations and ports, reject credentials in URLs, use a verified source-host allowlist, resolve and reject private/loopback/link-local/reserved IPv4/IPv6 destinations, prevent DNS rebinding, and revalidate every redirect (or disable redirects). Bound response size while streaming, connection/body timeouts, concurrent requests and disk usage. Verify container signatures and ffprobe duration/resolution before invoking analysis. Feed FFmpeg a validated local file, never a remote social URL. Handle temporary authorization failures without scraper/downloader fallbacks.

There is **no remote-media adapter, downloader, browser bypass, or third-party downloader enabled by this change**. The design above is a prerequisite for a future verified provider, not a claim of completed SSRF protection for an existing download feature.

## Files created

- `server/src/niche/patterns.js`: saved-insight projection and deterministic duration pattern report.
- `client/src/components/Uploader.jsx`: extracted original uploader, now reusable for targeted attachments with confirmation.
- `client/src/components/NicheInsights.jsx`: saved observations, timing links, explicit analysis/review controls, scores and edits.
- `client/src/components/NichePatterns.jsx`: counts, source-linked duration groups, insufficient-data reasons and proposed experiment.
- `server/test/niche-creative.test.js`: saved evidence reuse, incomplete/unsupported patterns, target checks, actual fixture upload/linking, and changed-target protection.
- This document.

Modified: `server/src/app.js` (shared upload route for normal and targeted files), `server/src/niche/service.js` (joins/attachment checks), `server/src/niche/statistics.js` (above-median labels and at least two known values per ranking), `client/src/main.jsx` (uploader import, evidence seek target), `client/src/api.js` (optional upload path/headers), `client/src/components/NicheIntelligence.jsx` (contextual uploads and inline insights), `client/src/styles.css`, `server/test/workflow.test.js` and documentation.

## Verification

Executed: `npm test` — **30 passed, 0 failed, 0 skipped**; `npm run lint` — passed; `npm run build` — passed.

Tests use local fixtures, generated real media, and explicit model stubs. No paid AI calls, social-platform requests, stored user-video resets or external setup were performed. The full workflow test now imports a social post, links an already analyzed/reviewed asset, and confirms measured metrics coexist with the saved score/evidence without increasing model-call counts.

Coverage includes original IDs/metrics, duplicate imports, invalid URLs, missing counts, zero views, unequal windows, withheld rankings, saved insight lookup, no invented categories/scores, uploaded-file validation, wrong-account/missing-post refusal before saving, refusal to replace existing links, race-safe attachment, persistence, and preservation of existing upload/CSV/creative workflows.

Not verified: rendered browser/mobile behavior, semantic correctness of a user's file-to-social-post confirmation, real SocialMonitor export data, live provider output quality, or usefulness/statistical reliability of the exploratory experiment. Existing source-access and public-authentication limitations remain unchanged.

## Next step

Rehearse with a genuine permitted export and corresponding files. Inspect saved evidence on two individual videos before trying a duration-group comparison; five imported posts may still be insufficient. If style-pattern discovery is later needed, first design and validate explicit structured creative attributes instead of guessing from prose.

## Subsequent Creative DNA extension

[Creative DNA & editing blueprints](CREATIVE_DNA.md) adds explicit evidence-validated AI classification, a separate deterministic style-pattern engine, and explicit blueprint generation. The duration-only report documented here remains available. Live collection and remote video downloading remain disabled.
