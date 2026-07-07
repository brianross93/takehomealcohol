# Alcohol Label Verification

Standalone prototype for reviewing alcohol beverage label artwork against application data. The app is designed around the take-home stakeholder notes: simple controls, batch review, fast feedback, no document storage, and firewall-friendly local processing.

## What It Does

- Accepts multiple label files in one batch.
- Uses OpenAI vision extraction for image labels because conventional OCR is unreliable on stylized label artwork.
- Processes queued uploads with a small concurrency pool so large batches do not run strictly one-by-one.
- Supports manual pasted label text for quick reviewer testing.
- Compares extracted label text with application fields for brand, class/type, ABV, net contents, bottler/producer, country of origin, and the government warning.
- Returns a clear `Ready`, `Review`, or `Reject` decision with field-level explanations.
- Includes sample labels and CSV export for reviewer handoff.

## Running Locally

```bash
npm install
npm run dev
```

Open the local URL printed by Vite, usually `http://127.0.0.1:5173/`.

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
  - `OPENAI_EXTRACTION_MODEL`: defaults to `gpt-5.5`.

If the serverless function is not deployed or `OPENAI_API_KEY` is not configured, image extraction fails explicitly and can be retried after configuration is fixed. The app does not silently fall back to OCR.

## Technical Approach

- `netlify/functions/extract-label.ts` calls the OpenAI Responses API with image input and Structured Outputs to produce schema-constrained extraction JSON.
- `src/lib/aiExtraction.ts` sends image labels to the server-side vision extractor and returns schema-constrained fields to the verifier.
- `src/lib/verification.ts` contains the deterministic review engine. The government warning wording is checked strictly; routine field matches allow limited fuzziness for casing and punctuation and explain when a normalized match was accepted.
- `src/App.tsx` provides the agent-facing workflow: application record, upload queue, sample batch, status summary, explanations, extracted label text, and CSV export.
- `public/samples/` contains two generated sample labels: one compliant and one intentionally defective.

The health warning rule is based on TTB guidance for beverage alcohol labels, including the current TTB pages for [distilled spirits health warnings](https://www.ttb.gov/regulated-commodities/beverage-alcohol/distilled-spirits/ds-labeling-home/ds-health-warning) and [malt beverage health warnings](https://www.ttb.gov/regulated-commodities/beverage-alcohol/beer/labeling/malt-beverage-health-warning).

## Testing Labels

The repo includes 12 generated PNG labels with known expected outcomes and 12 rendered TTB sample pages for real-world layout variety. See `docs/test-plan.md`.

Useful commands:

```bash
npm run test:labels
npm run test:extract:openai -- --limit=1
```

## Assumptions And Tradeoffs

- This prototype does not persist files, extracted label text, or review results.
- Vision extraction is required for image labels. If a government network blocks the model endpoint, production should route to an approved internal or government cloud vision endpoint rather than silently degrading to conventional OCR.
- The vision extractor returns advisory fields for warning boldness, legibility, and unusually small/buried warning text. These advisories can send an otherwise passing label to `Review`, but final type-size and boldness calls should still be confirmed visually in production.
- PDF and COLA integration are out of scope for this prototype.
