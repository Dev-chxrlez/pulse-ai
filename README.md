# PULSE AI

Upload. Analyze. Predict. Improve.

Video intelligence for Manila Hack 2026, MEASURE. Phases 1–3 include local uploads, automatic video analysis, creative assessments, hook suggestions, and comparisons. Phase 4 now adds validated historical CSV imports, video matching, and descriptive performance summaries. No predictive model, fabricated analytics, or social API integration is included.

## Run locally

Requires Node.js 22.12+ (tested on 26.13), npm, FFmpeg, and ffprobe.

```sh
npm install
brew install ffmpeg # macOS; use your platform's package manager elsewhere
```

If `server/.env` does not exist, copy `server/.env.example` to it. Preserve an existing `.env`. Add your OpenAI API key there, then run:

```sh
npm run dev
```

Open **http://localhost:5173**. The backend listens on **127.0.0.1:3001**; Vite proxies `/api`. If changing the API port, update `client/vite.config.js`. Match `FRONTEND_ORIGIN` to your frontend origin. After editing environment variables, restart the backend.

```sh
npm run dev -w client
npm run dev -w server
npm run build
npm run lint
npm test
```

## Upload and analyze

Upload one MP4, MOV, or WebM, up to **100 MiB (104,857,600 bytes)**. Container signatures are checked independently of browser MIME types. Codec support varies; MOV may need an external player. Playback supports HTTP Range requests and original downloads.

When configured, new uploads are automatically queued for analysis. Existing uploads can be analyzed from their detail view. Setup issues do not prevent uploads. Analysis has a default **180-second** limit, adjustable with `MAX_ANALYSIS_SECONDS` between 3 and 600. Excessive resolution and undecodable media fail with actionable errors.

FFmpeg/ffprobe extract real metadata, up to 17 sampled JPEG frames (denser in the first three seconds), candidate scene changes, and mono audio. Audio is transcribed in a 0–3 second opening window and subsequent windows of up to 30 seconds. Frame positions are approximate; audio windows are not word-level timestamps. Audio chunks and temporary workspaces are removed after each job. Videos without audio skip transcription.

The backend sends frames and audio to OpenAI. These requests use your API credits. The default models are `gpt-4.1-mini` for vision/creative review and `gpt-transcribe` for transcription; override them in `server/.env` with compatible models available to your account. See [OpenAI image inputs](https://developers.openai.com/api/docs/guides/images-vision), [structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs), and [transcription](https://developers.openai.com/api/docs/guides/speech-to-text).

Reports distinguish observations, inferences, and uncertain findings. Frame/audio references are validated against supplied evidence. A valid reference does not guarantee the model interpreted it correctly. Inspect the media, OCR, and transcript yourself. Scene changes use a 0.3 threshold at 4 fps; they are not verified edits or a complete measure of pacing.

## Creative review and comparisons

Open an analyzed video and select **Generate creative review**. This makes one additional OpenAI request based on its saved analysis. It does not reprocess or resend the original media. Reviews persist; opening a saved review or comparing reviews makes no new AI request. Failed reviews can be retried. Interrupted jobs are marked failed rather than automatically repeating paid work.

Eight AI-rated criteria use explicit ratings: 0 severe weakness, 1 needs work, 2 mixed/adequate, 3 strong, 4 especially effective. A ninth, platform format fit, is measured from the video's dimensions (9:16 = 4, portrait 4:5/3:4 = 3, square = 2, horizontal = 1). Missing evidence remains unknown. An AI rating needs references to supported findings in a relevant category. Creative judgments are subjective and can vary between model runs. Criteria follow Google's ABCD framework (Attract, Brand, Connect, Direct) and TikTok/Meta short-form guidance.

| Criterion | Weight |
| --- | --- |
| Opening hook | 22% |
| Message clarity | 16% |
| Pacing | 12% |
| Call to action | 12% |
| Early branding | 10% |
| Text readability | 8% |
| Works without sound | 8% |
| Emotional connection | 7% |
| Platform format fit (measured) | 5% |

Reviews generated before a criterion existed show it as unknown; **Update review to latest rubric** re-runs only such outdated reviews (one AI request each).

Overall score = `100 × Σ(weight × rating / 4) / assessed weight`, rounded to an integer. A score is shown only with at least three assessed criteria and 60% rubric weight. Coverage is rubric weight, **not confidence**. Criteria rated 3–4 are highlighted as strengths and 0–1 as weaknesses. Proposed hooks and prioritized edits cite saved findings; they are suggestions, not observations of the original footage.

On **Compare Videos**, select two or three analyzed videos. Generate any missing creative reviews, then compare. Videos appear side by side with independent playback, criterion ratings, evidence links, and edit priorities. Shared scores use only criteria assessed in every selected video, with the same minimum coverage requirement. Other criteria remain visible but are excluded from the shared score. No winner or performance probability is asserted.

**Creative scores are not predicted views, actual engagement measurements, virality probabilities, or validated performance metrics.** Historical prediction remains a future phase requiring real imported performance data and proper evaluation.

## Historical performance (Phase 4 foundation)

Open **Performance** and download the blank header-only CSV template. Fill it with real platform data. Choose the CSV to preview it; nothing is saved until **Import valid rows** is selected. Invalid and duplicate rows are skipped explicitly, with counts. Missing metrics remain `null`; zero remains zero. No imported data is sent to an AI provider.

Required columns: `video_id`, `platform`, `published_at`, `views`.

Optional columns: `likes`, `comments`, `shares`, `saves`, `observed_at`, `account`, `pulse_video_id`, `filename`.

- Use UTF-8, comma-separated CSV, up to 1 MiB and 2,000 data rows. Quoted commas, CRLF, and a UTF-8 BOM are supported. Header case/spaces/hyphens are normalized. `publication_date`/`published_date`/`date` alias `published_at`; `snapshot_date` aliases `observed_at`; `upload_id` aliases `pulse_video_id`; `video_filename` aliases `filename`. Duplicate or missing required headers are rejected. Unknown columns are listed as ignored.
- Counts must be nonnegative safe whole numbers without thousands separators. Blank optional counts mean unknown. Dates must be real `YYYY-MM-DD` dates or ISO timestamps with an explicit timezone. Measurement dates cannot precede publication; future dates are flagged. A date-only measurement on the publication day is allowed because its time is unknown.
- `video_id` is the platform's external identifier (leading zeros preserved). Duplicate identity is normalized platform + exact account string + exact video ID. Reimports skip duplicates and never replace saved metrics. This is one observation per identity, not a time-series snapshot store. Use consistent account names; an unspecified account may mix audiences. Different platforms/accounts remain separate identities.
- `pulse_video_id` explicitly links an uploaded PULSE video. An exact `video_id` equal to a local PULSE ID can also link; previews show the match before import. An unknown explicit PULSE ID invalidates the row. Filename matches only suggest a possible link: select the correct uploaded file and **Save match** after import. Selecting **Not matched** and saving unlinks a record. Multiple publications may link to the same creative asset.
- Every saved row keeps import ID, original source filename, CSV ending line number, import time, normalized metrics, and matching state. Data is atomically persisted to `DATA_DIR/performance.json` with the same single-process restrictions as video metadata. Previews are held only in memory for 15 minutes, with at most 10 pending previews. Restarting expires previews. The local dataset is limited to 10,000 records; import/match mutations are limited to 30 per 15 minutes per IP.
- Interactions per view = `(likes + comments + shares) / views × 100`, shown only when all three metrics are known and views exceed zero. This is not a unique-viewer engagement rate and may exceed 100%.
- Duration groups use matched, completed video analyses and remain separate by platform/account. They show record count, distinct matched assets, and median views only when at least three distinct assets exist. That display rule is **not** a statistical reliability threshold. Repeated publications are not independent training examples. Varying audience, measurement windows, publication age, and paid distribution prevent causal conclusions.

No historical model is trained or evaluated by this feature. The next modeling decision requires real matched data, a meaningful target and measurement window, leakage/quality checks, a baseline, and held-out evaluation. Importing rows alone never establishes prediction accuracy.

## API

| Method | Endpoint | Behavior |
| --- | --- | --- |
| GET | `/api/health` | API health, analysis readiness, upload limit |
| GET | `/api/analysis/setup` | Missing configuration and tool readiness |
| POST | `/api/videos` | Multipart `video`; save and queue analysis when ready |
| GET | `/api/videos` | Persisted library, newest first |
| GET | `/api/videos/:id` | Record including saved reports/statuses |
| GET | `/api/videos/:id/file` | Range-capable playback (`?download=1` for original) |
| GET | `/api/videos/:id/frames/:index` | A completed analysis frame |
| POST | `/api/videos/:id/analyze` | Start/retry analysis; completed jobs are reused |
| POST | `/api/videos/:id/creative` | Start/retry creative review; completed jobs are reused |
| GET | `/api/compare?ids=id1,id2` | Compare 2–3 distinct completed creative reviews |
| GET | `/api/performance` | Historical records, matches, descriptive summaries |
| GET | `/api/performance/template` | Header-only CSV template |
| POST | `/api/performance/preview` | Multipart `csv`; validate without saving |
| POST | `/api/performance/imports/:id` | Commit valid nonduplicate preview rows |
| PATCH | `/api/performance/:id/match` | JSON `{ "videoId": "local-id" }`; `null` unlinks |

Errors use `{ "error": { "code": "…", "message": "…" } }`. Keys, raw upstream errors, local paths, and stack traces are not returned.

## Storage and limits

Uploads, frames, metadata and reports live under `server/data/` by default, outside the frontend. `DATA_DIR` can override this. Upload storage names are generated UUIDs. JSON writes are serialized and atomically renamed. Keep **one backend process per data directory**; this is not a distributed database. Invalid metadata fails startup rather than silently discarding it. Abrupt termination can leave orphan workspaces/files requiring maintenance.

Analysis and creative review each have an in-process sequential queue. The analysis queue accepts up to 20 pending jobs; creative review accepts 10. Upload and analysis request limits are 20 per 15 minutes per client IP; creative requests are limited to 10. Limits reset at restart. HTTP requests return before background jobs finish; the UI polls their persisted status. API setup readiness confirms configuration/tools, not billing or model access.

This remains an **unauthenticated local development prototype**. Public hosting requires authentication, per-user authorization, private managed storage, a database, isolated media processing and deployment-appropriate abuse controls. CORS is not authentication. Never put API keys in frontend files or commit `.env`. API `store:false` is used for Responses calls; it is not a claim of zero retention by the provider.

## Verification

`npm test` uses isolated temporary storage, a real tiny WebM fixture, generated FFmpeg video/audio, real local HTTP requests, and explicitly labeled OpenAI test doubles. It tests upload validation/size limits, cleanup, range streaming, persistence, extraction, no-audio handling, retries, interrupted state recovery, structured evidence validation, weighted scores, missing criteria, shared-coverage comparisons, and deduplication of creative requests. Historical tests also cover CSV quotes/BOM, missing vs zero metrics, calendar dates, duplicates, concurrent commits, preview expiry, matching/unlinking, provenance, persistence, and descriptive grouping. Tests make no paid API calls and do not measure AI accuracy. The FFmpeg integration test is skipped if the tools are missing; inspect test output.

Manual check:

1. Upload a short video with speech and text. Inspect its saved transcript, frames, and findings.
2. Generate a creative review. Inspect each rationale and source; check proposed hooks contain no invented claims.
3. Add another analyzed video, generate its review, and compare both cuts. Try three videos and partial evidence coverage.
4. Refresh/restart and verify reports persist without more model requests.
5. In Performance, preview your real CSV, inspect errors/warnings, and import valid rows. Match originals, verify totals/provenance, and check that refreshing retains links. Reimport to confirm duplicates are skipped.
6. Check network errors, retries, keyboard interactions, and narrow-screen layout.

For connection issues, confirm the backend is running and check `/api/health`. A 401 indicates key configuration; 429 can indicate rate/billing limits. Inspect account access for unsupported model errors. The frontend build alone does not host the API; deployment will require separate backend hosting and routing.

## Demo and audit commands

- `npm run check`: prints local readiness flags and saved report counts without keys or private filenames. It makes no provider request.
- `npm run demo`: builds the frontend and serves UI/API/media together at **http://localhost:4173**. Stop `npm run dev` first: both use the same data by default, and a process lock prevents concurrent writers. `DEMO_PORT` and an absolute `DEMO_DATA_DIR` support isolated rehearsals. Local demo mode does not add public authentication.

See [the demo runbook](docs/DEMO.md) for the walkthrough and fallback plan, and [deployment preparation](docs/DEPLOYMENT.md) for runtime requirements and remaining public-access blockers. No deployment or hosting account changes are performed by these commands.

## Niche Intelligence — SocialMonitor JSON fallback

Live social collection is intentionally **not enabled**. The audited source's TikTok browser fallback conflicts with this integration's access restrictions; its official account integration is not an independent arbitrary-profile collector. See the [pinned capability audit and limitations](docs/SOCIALMONITOR_AUDIT.md).

Open **Niche Intelligence**, enter a TikTok profile URL, and import that profile's permitted SocialMonitor version-1 JSON export. Use a brand-scoped export under 1 MiB. Up to five video posts are normalized, with original links, available counts and collection dates. Missing metrics stay unknown. Imports are user supplied, not independently verified live collection. **Analyze Profile** reports the live-source blocker without calling a social site.

PULSE never accepts social credentials/cookies or downloads video from these links. Upload a video you have permission to use through the existing workflow and link it to the imported post. Saved analysis/creative reviews open normally; niche import/linking triggers no paid model call.

Raw counts are shown in publication order. Rankings/baselines are withheld for missing or unequal publication-to-collection intervals; any equal-age comparison is exploratory and assumes cumulative counts. No generated niche editing recommendations, causal claims or prediction probabilities are produced by this fallback.

New endpoints: `GET /api/niche`, `GET /api/niche/source`, `POST /api/niche/collect` (explicitly blocked), multipart `POST /api/niche/import` with `profileUrl` and `export`, and JSON `PATCH /api/niche/:reportId/posts/:postId/match` with `videoId` or null. Reports persist separately in `DATA_DIR/niche.json`; no Performance CSV records or video analyses are overwritten. Keep this prototype local/private.

### Manual post entry (TikTok, Instagram, Facebook)

The main way to fill Niche Intelligence when no social API is connected. Under **Track an account**, choose a platform and handle, then **Add a post**: paste its link and type the exact views/likes/comments/shares from the app's insights. Blank stays unknown, never zero, and rounded values like `1.2K` are rejected. Post links are checked against the platform and, where the URL names it, the account. Short links (vm.tiktok.com, fb.watch) must be expanded first. **Update metrics** records a new measurement time. Manual reports hold up to 50 posts and are never overwritten by a SocialMonitor import of the same account. Deleting a report keeps library videos and analyses. Facebook posts can **Retrieve video from Facebook** through the existing link analyzer (permission required; analysis costs apply).

**Fetch numbers** reads one public post once with plain yt-dlp (no login, cookies, browser impersonation or retries) and pre-fills the form; nothing is saved until you add the post. For Facebook, exact views/reactions/comments are read from the public page's own data (e.g. `"play_count_reduced":"7.7K","play_count":7768`). An exact value is used only when it sits beside that post's displayed figure, rounds back to it and is unambiguous; otherwise the rounded value is kept and marked ≈. Facebook does not expose shares or saves publicly. TikTok intermittently blocks these requests; when blocked, enter the numbers manually.

Comparison rule: if every post has the same publication-to-measurement age, that age is used as before. Otherwise only posts that were **at least 7 days old when measured** are ranked on lifetime counts, and newer posts are shown but excluded. This is a stated proxy, because older posts can still gain views. It is not a statistical guarantee.

Endpoints: `POST /api/niche/manual` `{platform, account}`; `POST /api/niche/:reportId/posts` `{postUrl, publishedAt, collectedAt?, description?, metrics}`; `PATCH` and `DELETE /api/niche/:reportId/posts/:postId`; `DELETE /api/niche/:reportId`.

### Comment feedback

Platforms do not show comment text to logged-out visitors, so comments are pasted: open the post, expand and copy the comments, and paste them under **Comments** on the post in Niche Intelligence. One AI request classifies each comment as positive, neutral, criticism (genuine feedback about the video) or bashing (insults/harassment with no usable feedback), counts questions, lists recurring themes, what viewers liked and criticized, and concrete changes for the next video. Counts must add up or the result is rejected. Only the summary is stored; pasted text and commenter names are discarded. The Performance page totals sentiment across posts under **Audience feedback**.

### Attach media and inspect editing alongside social metrics

Niche Intelligence cards now support **Upload corresponding video** directly. Confirm the displayed account/post and file preview; the existing uploader validates and saves the file, then links it. This targeted path defers AI work until you select **Analyze linked video**. Normal Video Analysis uploads still start analysis automatically when configured. Existing linked analyses/reviews reopen without extra model calls.

Cards show saved findings, approximate evidence timestamps, creative ratings/coverage, hooks and edits beside the imported metrics. Missing categories and unknown scores stay unknown. The Creative Pattern Report uses structured duration only, requires comparable measurements and multiple distinct analyzed videos per group, and otherwise reports insufficient data. No style is inferred from unsupported prose and no performance probability is generated.

See [workflow, limitations, changed files, tests and the disabled future media interface](docs/NICHE_CREATIVE_INTEGRATION.md).

### Creative DNA and editing blueprints

For a linked video with completed analysis, use **Generate Creative DNA** explicitly. Supported classifications, source evidence and uncertainty persist separately from original analyses/reviews. No DNA generation runs on import, matching, viewing or polling. Opening silence remains unknown; scene changes are FFmpeg candidates, and event times describe cited samples rather than exact onsets.

The Creative DNA pattern report compares known attributes only with comparable observed metrics and at least two distinct assets per group. It excludes duplicate IDs/content hashes and unknown/stale evidence. With insufficient historical patterns, an explicit **AI Editing Blueprint** can use a selected analyzed target as clearly labeled individual creative guidance. Both generation actions use API credits; saved matching records are reused.

See [Creative DNA implementation, evidence rules, tests and demo limitations](docs/CREATIVE_DNA.md). No original scoring rules were changed and no prediction accuracy is claimed.

Creative DNA is also available directly in any completed video’s analysis details, without a social import. Editing Blueprint still requires an imported niche report. See [audit remediation and current verification](docs/AUDIT_REMEDIATION.md).

### Sync existing local SocialMonitor data

In **Niche Intelligence**, enter a configured TikTok profile URL and select **Sync Local SocialMonitor**. With backend `SOCIALMONITOR_LOCAL_ROOT` configured, this uses the audited export helper in a read-only worker and the existing importer; no manual JSON selection is needed. It never collects posts or starts browser automation. An empty source returns an explicit zero-post error and preserves saved reports. Sync remains local/private and explicit, with short-lived local capabilities; it is not public deployment authentication. See [setup, security boundary, tested behavior and limitations](docs/LOCAL_SOCIALMONITOR_SYNC.md).

### Official-only TikTok acquisition (live acceptance pending)

`npm run tiktok:status` checks the existing registered account and local grant/configuration without exposing tokens. `npm run tiktok:acquire` uses an already owner-authorized SocialMonitor grant, verifies identity, lists videos through TikTok's official API, and persists them through the running PULSE Niche service. It requires no JSON/CSV or duplicate URL registration and never invokes SocialMonitor's collectors. Current local grant/app configuration is missing, so live retrieval is **not verified**. See [prerequisites, exact OAuth blockers, commands and test results](docs/TIKTOK_OFFICIAL_ACQUISITION.md).

### Analyze a public Facebook video link

**Video Analysis → Analyze from link** retrieves one permitted public Facebook video/Reel/share link, validates metadata and the downloaded file, then reuses the existing analysis queue and report view. Confirm permission before starting; OpenAI charges apply. No Facebook sign-in or browser cookies are used. Install the local yt-dlp environment described in [setup and live verification](docs/FACEBOOK_LINK_ANALYSIS.md), or configure backend `YTDLP_PATH`. Limits and private-network/redirect checks are enforced server-side. The shared frame sampler now respects decodable video duration when audio is longer; transcription retains the original audio duration. The supplied Reel passed a real isolated end-to-end run with 17 frames and a transcript.

## Create: brand videos from proven ad styles

**Create** turns a short-form ad style into a 9:16 video for the user's own brand. Pick one of three styles (Bold Hook, Product Reveal, Story Captions), enter brand name, tagline, description, colors and an optional PNG/JPG/WebP logo (≤3 MiB). Previews are rendered live in the browser and are free.

1. **Write script** (one AI request) drafts a hook, three lines and a CTA using only facts from the description; every field is editable.
2. **Generate video** is the only step that calls **ElevenLabs** (text-to-speech with timestamps). Identical script + voice is served from a local cache. The video is rendered locally with Remotion (pinned 4.0.539) and saved under `DATA_DIR/creations/`.
3. **Score it in PULSE** copies the result into the library and runs the normal analysis.

Setup: add `ELEVENLABS_API_KEY` to `server/.env` and restart the backend. Optional `ELEVENLABS_MODEL` (default `eleven_multilingual_v2`). The first render downloads Remotion's headless browser once. Styles are generic short-form patterns; only the user's own logo and words are used. Remotion is free for individuals and small teams; check its license for larger companies.
