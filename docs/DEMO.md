# PULSE AI demo runbook

## Before presenting

1. Run `npm run check`. It prints readiness flags and saved report counts, never the API key. Configuration readiness does not verify OpenAI billing or model access.
2. Run `npm run lint`, `npm test`, and `npm run build`. Tests use genuine/generated media with isolated OpenAI test doubles; they do not validate AI accuracy.
3. Prepare two real short videos with visibly different opening/edit choices. Keep each comfortably within the configured analysis duration and upload size limits. Generate and inspect saved analysis and creative reviews before the demo. Confirm source references, transcription, hook proposals, and rubric rationales against the originals.
4. If historical data is available, use a genuine platform CSV. Check publication/measurement dates, counts, account identity, and video matches. If no real data exists, demonstrate the empty state and template; never replace it with invented performance numbers.
5. Stop `npm run dev` before starting `npm run demo`. Both use the same saved data by default. A data-directory lock prevents two backend writers. A hard crash may leave a lock. Inspect its recorded PID and confirm no backend owns the directory before removing only that lock; the application does not automatically reclaim it.
6. Run `npm run demo`, then open **http://localhost:4173**. This builds the UI and serves the UI, media and API from one backend process. Keep that terminal open. `DEMO_PORT` can override 4173. `DEMO_DATA_DIR` can point to a separate absolute data directory for an isolated rehearsal; that starts with its own library.
7. Check the actual browser: desktop and narrow viewport, keyboard navigation, preview seeking, report filters, comparison selection and CSV preview. Automated API checks do not establish visual correctness.

## Three-minute walkthrough

- **0:00–0:25 — Problem.** “Creators usually see performance data after publishing. PULSE helps them inspect creative choices before they publish.” Show the actual library and explain that scores and real historical metrics remain distinct.
- **0:25–1:10 — Evidence.** Open a saved analysis. Show the opening frames, transcript, and one finding. Select its reference to seek the original. Explain that frames are sampled and transcript ranges are extraction windows, not exact word timing.
- **1:10–1:55 — Action.** Show a saved creative review: a criterion rating, its rationale, one proposed hook, and a concrete edit. Open the rubric explanation. These are subjective creative assessments, not probabilities or predicted views.
- **1:55–2:25 — Choice.** Compare two saved reviews. Show shared evidence coverage and a specific difference. Do not declare a performance winner.
- **2:25–2:50 — Measurement.** If genuine data exists, show imported metrics, provenance, and matching. Explain that descriptive groups do not establish causality or validated prediction. Otherwise show the CSV template and state that real historical data is still needed.
- **2:50–3:00 — Next.** “The next step is evaluating historical prediction against reliable matched data with a held-out baseline.” Do not claim that this model already exists.

## Live upload and fallback

A live upload can demonstrate automatic status changes when network/model latency permits. Do not promise a fixed completion time. Keep inspected saved reports ready for the main walkthrough. If a live request fails, show the actual error, explain it, and open a saved report; do not present the saved report as the failed live request's output.

A Responses report, creative review, comparison and original media reopen from local storage without additional model calls. New analysis and creative requests still need Internet access and API credits. Failed jobs are retried explicitly; restarting marks interrupted work failed and does not automatically repeat paid calls. Queued work continues on the backend when a dialog is closed.

## Audit status

The automated suite covers upload validation, audio/frame extraction, no-audio handling, provider-response validation, saved creative scores, comparisons, CSV preview/import/matching, full workflow restart persistence, client network messages and data-directory locking. All AI outputs in tests are labeled test doubles in temporary storage. No synthetic performance data is inserted into the user's library.

A manual browser pass and inspection of the user's actual creative reviews remain necessary. The user previously confirmed a live Phase 2 analysis worked; that is not a validated model-accuracy result.
