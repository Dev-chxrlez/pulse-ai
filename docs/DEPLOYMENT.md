# Deployment preparation

No deployment has been performed by this audit. The app still defaults to a local, single-user environment.

## Current runtime contract

- Node.js 22.12+; use the workspace lockfile with `npm ci`.
- FFmpeg and ffprobe must be executable by the backend. Set `FFMPEG_PATH`/`FFPROBE_PATH` where automatic discovery is unavailable.
- `HOST` defaults to `127.0.0.1`; a container host may need `0.0.0.0`. Set `PORT` to its assigned port.
- `DATA_DIR` must be on a persistent, private writable volume. It contains videos, JSON metadata, frame files, and import records. Keep exactly one backend process per data directory. The process lock is local protection, not a distributed lock or database.
- Queues run inside that process. The backend must stay alive after HTTP responses finish; short-lived serverless functions are unsuitable for this implementation.
- `OPENAI_API_KEY` is backend-only. Configure compatible vision/transcription models and account billing/access. Keep environment files, uploads, and reports out of Git and public frontend assets.
- `FRONTEND_ORIGIN` controls CORS; it is not access control.

## Public-access blocker

Authentication and authorization are **not implemented**. Do not publicly expose the current upload, media, report, CSV, or paid-analysis endpoints. Before public access, implement user sessions and per-user ownership checks for every record, media/frame route, import preview, matching action, and comparison. Add persistent quotas/abuse controls and restrict access to the backend's provider credentials.

For a single-user hackathon demo, an authenticated private access gateway covering **all** UI and API/media routes can be considered while real account isolation is developed. It must actually prevent direct backend access; an unprotected backend URL defeats a frontend-only gate. This has not been configured or tested.

## Frontend/backend routing

The built frontend currently requests relative `/api` URLs, including media, frames, templates, uploads, polling, comparisons and imports.

- **Single origin:** build the frontend, set `SERVE_CLIENT=true`, and start the backend. Express serves `client/dist` and all API routes. This is what local `npm run demo` exercises.
- **Vercel frontend + separate backend:** route `/api/*` through to the backend using the deployment's supported proxy configuration. Preserve multipart uploads, byte-range headers, response bodies, query strings, error status codes, and cookies if sessions use them. Verify the platform's actual body-size and timeout limits against the configured 100 MiB uploads. A rewrite alone does not guarantee compatibility. If proxy limits are too low, implement direct authenticated uploads/private object storage and update every API/media URL deliberately.

Host/domain selection and provider-specific configuration remain open. No hosting compatibility, deployment success, public authentication or upload-limit compatibility is claimed.

## Go-live verification

After access control and routing are implemented, test an authenticated upload → analysis → creative review → comparison → genuine CSV import → matching. Confirm unauthorized users cannot read or mutate any media/metadata; test logout/session expiry, quota exhaustion, large uploads, HTTP Range, restart persistence, and upstream errors. Use only real metrics in the demo. Maintain a backup of the private data directory before migration.
