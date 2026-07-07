# Alcohol Label Verification

Standalone prototype for reviewing alcohol beverage label artwork against application data. The app is designed around the take-home stakeholder notes: simple controls, batch review, fast feedback, no document storage, and reliable vision extraction for stylized label artwork.

## What It Does

- Accepts multiple uploaded files in one batch.
- Uses OpenAI vision extraction for image labels because conventional OCR is unreliable on stylized label artwork.
- Extracts PNG, JPG, and WEBP label images; CSV uploads are treated as application-record imports.
- PDF and HEIC/HEIF uploads surface explicit unsupported-format errors in this prototype instead of flowing into verification.
- Processes queued uploads with a small concurrency pool, retry/backoff for transient API limits, and per-item results as soon as each label finishes.
- Filters completed rows to `Ready`, `Review`, or `Missing` so agents can focus on exceptions in large batches.
- Supports manual pasted label text for quick reviewer testing.
- Includes a `Samples` button that preloads review fixtures without needing local files.
- Compares extracted label text with application fields for brand, class/type, ABV, net contents, bottler/producer, country of origin, and the government warning.
- Returns a clear `Ready`, `Review`, or `Missing` triage status with field-level explanations. The classifier does not make the final regulatory decision; it calls attention to what the human agent should review.
- Includes sample labels and CSV export for reviewer handoff.

## Running Locally

```bash
npm install
npm run dev
```

Open the local URL printed by Vite, usually `http://127.0.0.1:5173/`. This runs the UI, sample flow, pasted-text flow, and deterministic verifier.

For local image extraction through the Netlify Function route:

```bash
netlify dev
```

That requires `OPENAI_API_KEY` in `.env.local`. The deployed app is already configured for image extraction.

Quality checks:

```bash
npm run lint
npm run build
```

## Netlify Deployment

Deployed application URL: `https://alcoholclassifier.netlify.app`

The front end is a Vite app and the `/api/extract-label` route is a Netlify Function. The OpenAI API key stays server-side.

- Build command: `npm run build`
- Output directory: `dist`
- Functions directory: `netlify/functions`
- Optional environment variables:
  - `OPENAI_API_KEY`: enables the vision extraction endpoint.
  - `OPENAI_EXTRACTION_MODEL`: defaults to `gpt-5.4-mini`.
  - `OPENAI_IMAGE_DETAIL`: defaults to `low`; set to `high` if a deployment needs more visual detail and can tolerate slower calls.

If the serverless function is not deployed or `OPENAI_API_KEY` is not configured, image extraction fails explicitly and can be retried after configuration is fixed. The app does not silently fall back to OCR.

## Batch Input Shape

Single-label review uses the form on the left because it mirrors the current workflow: an agent has one application open and checks one label against it.

Batch review supports a CSV application import plus image uploads. CSV files can be uploaded through the main batch picker/dropzone or the dedicated `Import CSV` control. The CSV is keyed by image filename:

```csv
fileName,brandName,classType,alcoholContent,netContents,bottlerName,bottlerAddress,countryOfOrigin,beverageType
old-tom.png,OLD TOM DISTILLERY,Kentucky Straight Bourbon Whiskey,45% Alc./Vol. (90 Proof),750 mL,Old Tom Distillery,"Louisville, KY",United States,Distilled Spirits
```

Rows without a matching CSV record use the manual application form. The results CSV includes whether the application record came from CSV or manual entry. PNG, JPG, and WEBP labels are extractable in the prototype; PDF and HEIC/HEIF files are accepted by the uploader but produce an explicit unsupported-format queue error so agents know to convert them rather than receiving misleading compliance failures.

## Technical Approach

- `netlify/functions/extract-label.ts` calls the OpenAI Responses API with image input and Structured Outputs to produce schema-constrained extraction JSON.
- `src/lib/aiExtraction.ts` downscales uploaded image labels to a 768px-wide JPEG before sending them to the server-side vision extractor, which keeps the single-label path closer to the five-second usability target.
- `src/lib/aiExtraction.ts` retries rate-limited or transient extraction failures and honors `Retry-After`.
- `src/lib/verification.ts` contains the deterministic review engine. Required fields use a green/yellow/red model: green means the label appears to match the application, yellow means the field is present but differs or needs human attention, and red means the required field was not found.
- Alcohol content includes an internal ABV/proof consistency check, so a label that prints `45% Alc./Vol.` and an inconsistent proof value is flagged for agent review even if the ABV alone matches the application.
- `src/App.tsx` provides the agent-facing workflow: application record, upload queue, sample batch, status summary, explanations, extracted label text, and CSV export.
- `public/samples/` contains two generated sample labels: one compliant and one intentionally defective.

The health warning rule is based on TTB guidance for beverage alcohol labels, including the current TTB pages for [distilled spirits health warnings](https://www.ttb.gov/regulated-commodities/beverage-alcohol/distilled-spirits/ds-labeling-home/ds-health-warning) and [malt beverage health warnings](https://www.ttb.gov/regulated-commodities/beverage-alcohol/beer/labeling/malt-beverage-health-warning).

## Testing Labels

The repo includes 12 generated PNG labels with known expected outcomes and 12 rendered TTB sample pages for real-world layout variety. See `docs/test-plan.md`.

For manual image-generation testing, use `docs/test-application-forms.csv` as the batch application records and `docs/test-image-prompts.md` for ten matching label prompts: seven expected `Ready` results and three expected `Review` results.

Useful commands:

```bash
npm run test:labels
npm run test:extract:openai -- --limit=1
```

## Performance Notes

Measured on July 7, 2026 with the generated Old Tom label image and the deployed Netlify prototype:

| Path | Result |
| --- | ---: |
| Original deployed image flow before optimization | ~11.1s |
| Optimized deployed browser upload flow after warmup | ~5.3s |
| Optimized deployed function call with compressed image | ~5.2-5.8s |
| Optimized local direct OpenAI call with compressed image | ~3-4s |

The prototype is accurate and close to Sarah's "about 5 seconds" target on the deployed path. The remaining variance appears to be mostly serverless/function overhead plus network variability; the same compressed image/model path is under 5 seconds when called locally. A production deployment should keep the same extractor interface but run it as a warm, colocated service rather than a cold serverless function.

For 200-300 label batches, the UI renders results as each item completes, shows completed/total progress, running triage counts, ETA, and filters to `Review` or `Missing` rows. The default concurrency is capped at 5 to reduce rate-limit pressure.

Small deployed batch validation:

| Batch Check | Result |
| --- | ---: |
| Generated labels uploaded with matching CSV application records | 36 |
| Synthetic `429 Retry-After` responses injected before real retries | 5 |
| Real extraction POSTs after retry | 36 |
| Final queue state | 36/36 done, 0 stuck, 0 extraction errors |
| Verdicts vs fixture manifest | 36/36 matched |
| Wall-clock time | ~50.8s |

Production should validate final concurrency and cost against the agency's chosen model deployment; a planning estimate for 300 optimized labels is low single-digit dollars, but the exact value depends on the contracted model endpoint and image detail setting.

## Assumptions And Tradeoffs

- This prototype does not persist files, extracted label text, or review results.
- Vision extraction is required for image labels. For the prototype, the cloud OpenAI call is acceptable because no documents are stored and the API key stays server-side. For production, the extractor should sit behind a single interface and swap the endpoint to Azure OpenAI in the agency's own Azure/FedRAMP tenant, keeping inference inside the approved network boundary and avoiding the firewall failure mode Marcus described.
- Uploaded images are compressed for latency before extraction. Production should retain an optional high-detail retry path for edge cases such as very small print, severe glare, or unusually low-resolution source photos.
- PDF page rendering and HEIC/HEIF normalization are out of scope for the prototype. Production should add a preprocessing stage that splits PDF batches into page images and normalizes iPhone HEIC uploads to JPEG before calling the same extraction interface.
- The warning wording check is deterministic but still routes to human review instead of making a final agency decision. Warning boldness, legibility, and unusually small/buried warning text are advisory vision-model judgments: concerns send an otherwise passing label to `Review`; clean or unknown visual-format results do not legally clear typography on their own.
- A production version could capture agent decisions and use them to tune thresholds, prompts, regression tests, and reviewer-specific guidance over time. That learning loop is intentionally out of scope for this prototype.
- COLA integration is out of scope for this prototype.
