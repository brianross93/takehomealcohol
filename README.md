# Alcohol Label Verification

Standalone prototype for reviewing alcohol beverage label artwork against application data. The app is designed around the take-home stakeholder notes: simple controls, batch review, fast feedback, no document storage, and firewall-friendly local processing.

## What It Does

- Accepts multiple label files in one batch.
- Supports image upload through browser OCR and text upload for quick reviewer testing.
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

This is a static Vite app and can be deployed to Vercel, Netlify, Azure Static Web Apps, or any static host.

- Build command: `npm run build`
- Output directory: `dist`
- No server secrets are required.

## Technical Approach

- `src/lib/ocr.ts` wraps Tesseract.js so OCR runs in the browser without sending label images to a third-party service.
- `src/lib/verification.ts` contains the deterministic review engine. The government warning is checked strictly; routine field matches allow limited fuzziness for casing and punctuation.
- `src/App.tsx` provides the agent-facing workflow: application record, upload queue, sample batch, status summary, explanations, raw OCR text, and CSV export.
- `public/samples/` contains two generated sample labels: one compliant and one intentionally defective.

The health warning rule is based on TTB guidance for beverage alcohol labels, including the current TTB pages for [distilled spirits health warnings](https://www.ttb.gov/regulated-commodities/beverage-alcohol/distilled-spirits/ds-labeling-home/ds-health-warning) and [malt beverage health warnings](https://www.ttb.gov/regulated-commodities/beverage-alcohol/beer/labeling/malt-beverage-health-warning).

## Assumptions And Tradeoffs

- This prototype does not persist files, OCR text, or review results.
- Browser OCR performance depends on image quality and the first Tesseract worker load. The sample text path demonstrates the review engine instantly; production could add a server-side vision model behind the same verifier.
- OCR text cannot reliably prove visual formatting such as bold weight or minimum type size. The prototype checks exact warning wording and uppercase prefix, then documents visual-format verification as a production extension.
- PDF and COLA integration are out of scope for this prototype.
