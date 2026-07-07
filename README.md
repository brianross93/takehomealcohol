# Alcohol Label Verification

Standalone prototype for reviewing alcohol beverage label artwork against application data. The app is designed around the take-home stakeholder notes: simple controls, batch review, fast feedback, no document storage, and firewall-friendly local processing.

## What It Does

- Accepts multiple label files in one batch.
- Uses an optional OpenAI vision extractor for image labels, with browser OCR fallback when the API route is unavailable.
- Supports text upload for quick reviewer testing.
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

## Deployment

The front end is a Vite app. The optional `/api/extract-label` route is written as a Vercel-style serverless function so the OpenAI API key stays server-side.

- Build command: `npm run build`
- Output directory: `dist`
- Optional environment variables:
  - `OPENAI_API_KEY`: enables the vision extraction endpoint.
  - `OPENAI_EXTRACTION_MODEL`: defaults to `gpt-5.5`.

If the serverless route is not deployed or `OPENAI_API_KEY` is not configured, the app still works through local OCR fallback and pasted text.

## Technical Approach

- `api/extract-label.ts` calls the OpenAI Responses API with image input and Structured Outputs to produce schema-constrained extraction JSON.
- `src/lib/aiExtraction.ts` tries the server-side vision extractor first, then falls back cleanly.
- `src/lib/ocr.ts` wraps Tesseract.js so fallback OCR runs in the browser without sending label images to a third-party service.
- `src/lib/verification.ts` contains the deterministic review engine. The government warning is checked strictly; routine field matches allow limited fuzziness for casing and punctuation.
- `src/App.tsx` provides the agent-facing workflow: application record, upload queue, sample batch, status summary, explanations, raw OCR text, and CSV export.
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

- This prototype does not persist files, OCR text, or review results.
- Vision extraction is preferred for stylized fonts, curved labels, glare, and non-standard layouts. OCR remains as a resilience path for network-blocked environments.
- OCR text cannot reliably prove visual formatting such as bold weight or minimum type size. The prototype checks exact warning wording and uppercase prefix, then documents visual-format verification as a production extension.
- PDF and COLA integration are out of scope for this prototype.
