# Facebook link analysis — implementation and live verification

12 November 2026, Asia/Manila. **Passed one real end-to-end run** using the supplied public share URL and the configured OpenAI provider. This feature analyzes one permitted public video; it is not account monitoring or social performance collection.

## Use

Open **Video Analysis -> Analyze from link**, paste an individual HTTPS Facebook video/Reel/share URL, confirm permission, and select **Retrieve and analyze**. Metadata/retrieval/validation/analysis stages appear as the job runs. Completion automatically opens the existing video report dialog. Uploading original files remains available alongside it.

Supported page hosts: facebook.com, www.facebook.com, m.facebook.com and web.facebook.com. Accepted shapes include /reel/<id>, /share/v/<code>, /share/r/<code>, /watch/?v=<id>, /video.php?v=<id>, and individual /<name>/videos/<id> variants. Profile/page/collection links, playlist parameters, embedded credentials, custom ports and other hosts are rejected.

## Actual live acceptance

Input: https://www.facebook.com/share/v/1A2a3Ttsos/
Resolved Reel: **969514082319139**.

| Check | Observed result |
|---|---|
| Share redirect | Resolved to /reel/969514082319139/ |
| Download | Original progressive MP4, approximately 2.7 MB; no sign-in or browser-cookie access |
| Container duration | 25.108042 seconds |
| Video stream duration | 25.000 seconds |
| Last decoded frame timestamp | 24.966667 seconds |
| Last scheduled sample | 24.900 seconds |
| Extracted frames | 17 |
| Audio transcript | 2 windows; 318 characters returned |
| Analysis report | Completed, validated, 8 findings |
| Provider models | gpt-4.1-mini / gpt-transcribe, as configured |
| UI | Browser observed automatic report opening, heading A closer look., status Analyzed, findings and transcript |
| Playback | HTTP Range 206 for 32 requested bytes; final sampled frame endpoint 200 image/jpeg |
| Reopening report | Persisted completed report reopened successfully; no new analysis queued |
| Failed retrieval | Nonexistent /reel/0/ failed with LINK_LOGIN; no video created for that job |
| Files after success/failure | 1 valid upload total, 0 temporary entries; analysis directory contains only its 17 saved frame artifacts |

One real analysis job was run. Its original audio was transcribed in the normal two extraction windows and visuals reviewed through OpenAI. No manual paid retry, Creative DNA request, creative review request or model/scoring change was made. Preflight retrieval/frame checks did not call OpenAI. A final downloader-only check also passed with the OS file ceiling enabled; the paid report was reused rather than regenerated.

The isolated test workspace is running at **http://localhost:5174**, API 127.0.0.1:3002. Its storage is `/private/tmp/pulse-facebook-live-m2TcYQ`, separate from server/data. It was restarted with final code and the completed report persisted without requeueing analysis. Temporary storage can be removed by the OS; it is not a production library migration. The ordinary application at localhost:5173 has the new feature and retains its existing library.

## Root cause and shared fix

Previously `server/src/media.js` used the container duration for all frame timestamps. The original Reel's 25.108042-second container extends beyond its 25-second video; the previous final sample would be 25.008 seconds, after the last decodable video frame. FFmpeg could finish without producing the final JPEG, causing extraction to fail.

`probeVideo` now records the selected video stream index/duration and inspects decodable tail frames using ffprobe. `extractFrames` schedules within video duration and clamps to the final decoded timestamp, rounding downward. It maps the same selected stream. No trim, audio shortening, remux or video re-encoding is performed. **metadata.duration remains the container duration**, and audioWindows/extractAudio/transcription behavior remains unchanged. The synthetic regression independently verifies video=25 seconds with longer audio, 17 accessible frames, and audio windows that retain the audio tail.

Existing analyses were not rewritten. Extra stream metadata applies only to new processing.

## Reuse and lifecycle

`createVideoStorage` centralizes existing container-signature/extension/size checks, UUID names, safe display names, atomic metadata save and failed-file cleanup. Both multipart uploads and downloaded files use it. Link downloads receive a bounded decode/duration check before commit, then enter the existing analysis queue and report validator/UI. Original upload behavior (including deferred analysis for niche post attachment) is preserved.

POST /api/video-links accepts JSON `{url, permitted:true}` and returns a job. GET /api/video-links/:id returns retrieval stage/progress and the saved video's current analysis state. No local filesystem paths/storage names are exposed. POST is limited to the trusted local frontend origin, loopback peer, and five starts per 15 minutes. This remains a private local prototype, not public account authentication.

The link service is independent of SocialMonitor reports. It works with zero posts and needs no JSON/CSV import. A future post action can submit its postUrl and explicit permission through this same endpoint, then use the returned local video ID with existing linking functionality. No SocialMonitor collector, database, authorization store or existing source data was touched.

Jobs are persisted separately as link-jobs.json, bounded to 100 retained entries. One retrieval runs at a time. A repeated identical successful/in-flight URL reuses its existing job/video rather than launching duplicate paid work. Analysis failures retain a complete saved video so existing report controls can explicitly retry analysis; retrieval failures do not create partial uploads. Interrupted retrievals are marked failed on restart and .link-* temporary workspaces are removed; paid jobs are not automatically retried.

## Retrieval boundary

- Metadata extraction runs first. Reject playlists/multi-video responses, invalid IDs/page URLs, unknown duration, duration above the existing analysis limit and known excessive size before download.
- Only one progressive HTTPS MP4 is selected. Native yt-dlp downloading, fixed output name, no merging or external media downloader. The downloaded file is signature-checked, probed and size-checked again before storage.
- Explicit argv arrays with shell=false; URL follows `--`. Ignore downloader configuration and plugins. No username/password, netrc enablement, browser-cookie import or cookie file. Child environment contains PATH/LANG only; no OpenAI key is passed into the downloader. TLS certificate verification remains enabled. Anonymous HTTP cookies returned by public Facebook pages are not browser login credentials.
- Page redirects are resolved server-side, with every next URL checked against the supported Facebook video URL rules. Login/checkpoint destinations fail. Up to five redirects; HTTPS request timeout 15 seconds and DNS timeout five seconds per hop.
- yt-dlp uses an isolated loopback CONNECT proxy for **all** network requests. The proxy only permits supported Facebook hosts and Facebook's *.fbcdn.net media hosts over port 443. Plain HTTP proxy requests, unrelated destinations and private/reserved IPs are blocked. Each DNS result is checked and the selected public IPv4 is pinned to the socket, avoiding a second unchecked DNS resolution. IPv6 destinations are deliberately unsupported.
- Metadata+download subprocess time budget is 90 seconds (redirect resolution/binary detection have their own finite limits). Socket timeout 15 seconds, one retry, no fragment retries. Downloader output is bounded and upstream error text/URLs are not exposed through API errors.
- Native downloader max-filesize, final storage maxBytes, an OS RLIMIT_FSIZE per-file ceiling, and a 100-ms total-workspace monitor bound disk writes. The trusted Python launcher applies the ceiling then execs yt-dlp directly, without a shell. One progressive output avoids multi-stream merge storage. Proxy inbound traffic is capped at maxBytes + 12 MiB for TLS/page overhead; sockets and processes are closed on failure. This is not a general-purpose operating-system sandbox.
- Temporary downloads are removed after success/failure. Playback/analysis read the committed original; transcription WAVs are removed after use by the unchanged analysis pipeline.

## Installation/configuration

The current machine had no usable yt-dlp on PATH, so it was installed in a project-local ignored environment:

```
python3 -m venv server/.tools/yt-dlp
server/.tools/yt-dlp/bin/python -m pip install yt-dlp
```

Tested yt-dlp: **2025.10.14** under the installed Python 3.9. pip selected the compatible release and warned about Python 3.9 deprecation. No TLS checks were disabled. For future updates use a maintained Python version and re-run the real retrieval regression; newer downloader releases were not tested here.

Optional backend `YTDLP_PATH` selects a trusted executable; default discovery checks the local environment, PATH and Homebrew. `PYTHON_PATH` can select the trusted Python executable used for the OS file-limit launcher. FFmpeg/ffprobe and the existing backend OpenAI configuration are reused. No npm dependency was added.

For isolated UI testing, Vite supports backend-only `PULSE_API_TARGET=http://127.0.0.1:3002` with port 5174. Ordinary development retains 3001/5173. No secrets are exposed through that setting.

## Verification results

- npm test: **59 passed, 0 failed, 0 skipped**, including all previous 53 tests.
- npm run lint: passed.
- npm run build: passed.
- npm run check: passed (production library remains two saved analyses/two creative reviews, zero active jobs).
- New regressions: allowed/rejected URL shapes, reserved/private/mixed DNS, restricted proxy CONNECT refusals, timeout and OS/disk size limits, metadata limits before download, genuine synthetic audio-tail media, 17 decoded frames, full-duration audio windows, link-to-analysis/report, signature-based shared storage, repeated-job reuse, failed partial-file cleanup and persistence after restart. Automated AI calls are test doubles.
- Real browser/live OpenAI verification: passed as recorded above. This is separate evidence from fixture tests.
- Production preservation: all 35 preexisting metadata/analysis files are SHA-256 unchanged.

Intermediate failures corrected: Node's pinned HTTPS lookup initially needed its all-addresses callback shape; yt-dlp did not support a --no-netrc option (authentication remains disabled by default with config ignored); placing --max-downloads=1 on metadata extraction caused exit 101 before JSON output. The limit now applies only to downloading, and its observed maximum-reached exit (101) is accepted only before verifying the complete expected output file. These failures happened before paid analysis. A shared-storage lint issue was corrected. Final tests and live results above are from the corrected implementation.

## Files

Created: server/src/links/network.js, retrieve.js, service.js, routes.js, limit-download.py; server/src/video-storage.js; client/src/components/LinkAnalyzer.jsx; server/test/facebook-links.test.js; this document.

Modified: server/src/media.js, analysis.js, app.js; client/src/main.jsx, styles.css; client/vite.config.js; server/.env.example; .gitignore; README.md. Local downloader installation is ignored. No SocialMonitor edits, scoring changes or original media changes.

## Remaining limits / unverified cases

Only the supplied share-to-Reel URL was live-tested successfully. Other allowed video/watch/share shapes are validation-tested, not separately live-verified. Private/login-gated videos remain unsupported and are never worked around. Public availability, geography and Facebook extractor behavior can change. Only progressive HTTPS MP4 formats are supported by this first version; DASH/HLS-only videos fail rather than launch an unchecked downloader. Other unusual codecs, timebases, variable frame rates or corrupted media were not exhaustively live-tested. IPv6-only networks and Windows resource-limit support are not verified. Mobile layout was not separately exercised.

No Facebook API/account authorization, account metrics, automatic SocialMonitor collection, broader social integration or media rights verification is claimed. Permission is confirmed by the user; public accessibility alone is not a grant of rights. Existing development-only deployment restrictions remain.
