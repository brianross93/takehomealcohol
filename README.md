# Alcohol Label Verification

Standalone prototype for reviewing alcohol beverage label artwork against submitted application data.

**Live app:** [https://alcoholclassifier.netlify.app](https://alcoholclassifier.netlify.app)

The app is built around the core reviewer scenario: an agent opens an application, looks at the submitted label artwork, and checks whether the label matches the application fields. The prototype uses vision extraction for label images, deterministic comparison logic for field checks, and a human-in-the-loop final decision.

## Quick Demo

Open the [deployed Netlify app](https://alcoholclassifier.netlify.app). No setup or API key is needed for the hosted demo.

1. The top review station loads a provided packet of 8 submitted forms and matching label images.
2. AI analysis starts automatically for the current form and prefetches the next two labels.
3. Review the field checklist:
   - green means the label appears to match the application,
   - yellow means the field is present but needs agent review,
   - red means the required field appears missing.
4. Click `Accept` or `Reject` as the agent decision. The app records that separately from the AI recommendation and advances to the next form.
5. Keyboard shortcuts: `A` or Right Arrow accepts; `R` or Left Arrow rejects.

The custom upload panel below the review station starts empty. It is intentionally separate from the provided demo queue so evaluators can test their own files without clearing the demo.

## Workflows

### Provided Review Queue

The provided queue represents the take-home scenario directly: a submitted application record plus attached label artwork.

- The data lives in `public/preloaded-submissions/application-records.csv`.
- Matching label images live in `public/preloaded-submissions/`.
- The `Provided forms` button reloads that CSV and image packet into the top review station.
- The queue prefetches just in time: when item N is open, N, N+1, and N+2 are analyzed in the background.
- In production, the same pipeline could run as an overnight or arrival-time batch job so agents arrive to a fully pre-analyzed queue.

### Custom Upload

Use the lower `Custom upload` panel to test new labels.

- Upload PNG, JPG, WEBP, or CSV files through the dropzone.
- Import a CSV whose `fileName` values match image filenames for true application-vs-label comparison.
- Or fill the application record form manually, upload an image, and click `Verify`.
- If the manual form is blank and there is no matching CSV row, the app extracts fields from the image and marks the source as `Extracted draft`. That mode is useful for checking extraction quality, but it is not a true comparison against a submitted application.
- PDF and HEIC/HEIF uploads show explicit unsupported-format errors in this prototype instead of producing misleading compliance failures.

## What It Checks

The verifier checks the required fields from the assignment context:

- brand name
- class/type
- alcohol content
- net contents
- bottler/producer name and address
- country of origin for imports
- government warning

It also checks ABV/proof consistency and treats warning typography concerns, such as non-bold prefix or tiny/buried text, as advisory review flags.

The app returns one AI recommendation per label:

- `Ready`: no material issue found.
- `Review`: a field is present but differs, is ambiguous, or has advisory visual-format concerns.
- `Missing`: a required field appears absent.

The AI recommendation is not the final regulatory decision. The agent's `Accept` or `Reject` decision is stored separately in the exported CSV as `agentDecision` with `agentDecisionAt`.

## CSV Input Shape

Batch custom review supports a CSV application import plus image uploads. The CSV is keyed by image filename:

```csv
fileName,brandName,classType,alcoholContent,netContents,bottlerName,bottlerAddress,countryOfOrigin,beverageType
old-tom.png,OLD TOM DISTILLERY,Kentucky Straight Bourbon Whiskey,45% Alc./Vol. (90 Proof),750 mL,Old Tom Distillery,"Louisville, KY",United States,Distilled Spirits
```

Supported `beverageType` values:

- `Distilled Spirits`
- `Wine`
- `Malt Beverage`

Rows without a matching CSV record use the manual application form when it contains data. If both CSV and manual fields are absent, custom image uploads use the extracted-draft behavior described above.

## Running Locally

Install dependencies:

```bash
npm install
```

Run the Vite UI:

```bash
npm run dev
```

Open the local URL printed by Vite, usually `http://127.0.0.1:5173/`. This is enough for the UI, provided queue loading, text fixtures, and deterministic verifier behavior.

For local image extraction through the Netlify Function route, run:

```bash
netlify dev
```

Create `.env.local` in the project root for local extraction:

```bash
OPENAI_API_KEY=...
OPENAI_EXTRACTION_MODEL=gpt-5.4-mini
OPENAI_IMAGE_DETAIL=low
```

The deployed Netlify app is already configured with its server-side API key. Do not commit `.env.local`.

Quality checks:

```bash
npm run lint
npm run build
```

## Deployment

The production prototype is deployed on Netlify:

- URL: [https://alcoholclassifier.netlify.app](https://alcoholclassifier.netlify.app)
- Build command: `npm run build`
- Publish directory: `dist`
- Functions directory: `netlify/functions`
- Serverless route: `/api/extract-label`

Environment variables:

- `OPENAI_API_KEY`: required for image extraction.
- `OPENAI_EXTRACTION_MODEL`: defaults to `gpt-5.4-mini`.
- `OPENAI_IMAGE_DETAIL`: defaults to `low`; use `high` for harder labels if slower extraction is acceptable.

If the function is missing or the API key is not configured, image extraction fails explicitly and the queue item shows a retryable error. The app does not silently fall back to OCR.

## Technical Approach

- `netlify/functions/extract-label.ts` calls the OpenAI Responses API with image input and Structured Outputs.
- `src/lib/aiExtraction.ts` compresses uploaded label images before extraction, retries transient/rate-limit failures, and honors `Retry-After`.
- `src/lib/verification.ts` contains deterministic comparison logic for the application fields, warning wording, ABV/proof consistency, and visual-format advisory flags.
- `src/App.tsx` implements the provided review queue, prefetching, custom upload queue, extracted-draft flow, agent decisions, filters, retries, and CSV export.
- No files, extracted text, or review decisions are persisted by the prototype.

## Testing Assets

Additional test assets and prompts are included:

- `docs/test-application-forms.csv`: application records for generated test images.
- `docs/test-image-prompts.md`: prompts for generating matching bottle/container photos.
- `docs/test-plan.md`: fixture coverage and extraction smoke-test notes.
- `public/test-labels/generated/`: generated labels with expected outcomes.
- `public/test-labels/ttb/`: rendered official TTB sample pages for extraction/layout variety.

Useful commands:

```bash
npm run test:labels
npm run test:extract:openai -- --limit=1
```

## Performance Notes

Measured on July 7, 2026 with generated label images and the deployed Netlify prototype:

| Path | Result |
| --- | ---: |
| Original deployed image flow before optimization | ~11.1s |
| Optimized deployed browser upload flow after warmup | ~5.3s |
| Optimized deployed function call with compressed image | ~5.2-5.8s |
| Optimized local direct OpenAI call with compressed image | ~3-4s |

Sarah's usability concern was that nobody will use the tool if results take much longer than about 5 seconds. The single-label path is near that target, and the provided review queue makes perceived latency lower by prefetching the next labels while the agent reviews the current one.

Small deployed batch validation:

| Batch Check | Result |
| --- | ---: |
| Generated labels uploaded with matching CSV application records | 36 |
| Synthetic `429 Retry-After` responses injected before real retries | 5 |
| Real extraction POSTs after retry | 36 |
| Final queue state | 36/36 done, 0 stuck, 0 extraction errors |
| Triage statuses vs fixture manifest | 36/36 matched |
| Wall-clock time | ~50.8s |

Production should validate final concurrency and cost against the agency's chosen model endpoint. The prototype caps batch concurrency at 5 to reduce rate-limit pressure.

## Assumptions And Tradeoffs

- Vision extraction is required for image labels. OCR was removed because it performed poorly on stylized fonts, curved labels, glare, and non-standard layouts.
- A cloud OpenAI call is acceptable for this prototype because files are not persisted and the API key stays server-side.
- For production, the extractor should sit behind a single interface and swap to Azure OpenAI in the agency's own Azure/FedRAMP tenant, keeping inference inside the approved network boundary.
- Uploaded images are compressed for latency. Production should retain an optional high-detail retry path for very small print, glare, or unusually low-resolution photos.
- PDF page rendering and HEIC/HEIF normalization are out of scope for the prototype. Production should add preprocessing that converts those inputs to images before extraction.
- Warning wording is checked deterministically. Warning boldness, legibility, and tiny/buried text are advisory vision-model judgments that can escalate a label to `Review`, but they do not legally clear typography on their own.
- A production system could use agent decisions and AI/agent disagreements as audit data and model-improvement input. That learning loop is out of scope for this prototype.
- COLA integration is out of scope for this prototype.
