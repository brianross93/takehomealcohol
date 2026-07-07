# Label Test Plan

Use a compact set with deliberate coverage rather than hundreds of random labels.

## Recommended Count

- 12 generated labels with known expected results.
- 12 official TTB sample pages for layout and extraction variety.
- 3-5 real product photos later, if time allows and licensing is clear.

This is enough for a take-home prototype because it demonstrates judgment: clean passes, hard OCR/vision cases, and known compliance failures.

## Generated Fixtures

Generated images live in `public/test-labels/generated/`.

Run:

```bash
npm run test:labels
```

The manifest is `public/test-labels/generated/manifest.json`. It includes the expected status and matching application fields for each case.

Coverage:

- compliant distilled spirits label
- brand punctuation/case variation
- title-case warning prefix
- wrong ABV
- wrong net contents
- missing government warning
- low contrast/glare
- angled photo
- imported tequila/country-of-origin case
- wine label with sulfites
- tiny warning text
- altered warning wording

## Official TTB Fixtures

Rendered official TTB sample pages live in `public/test-labels/ttb/`.

Sources:

- Wine sample labels: `https://www.ttb.gov/system/files/images/pdfs/wine_bam/c10-sample-wine-labels.pdf`
- Malt beverage sample labels: `https://www.ttb.gov/system/files/images/beer/labeling/malt-beverage-example-labels.pdf`

These are not perfect scored fixtures because many pages contain multiple labels plus explanatory text. Use them to test extraction robustness and reviewer experience.

## OpenAI Extraction Smoke Test

Set:

```bash
OPENAI_API_KEY=...
```

Or create `.env.local` in the project root:

```bash
OPENAI_API_KEY=...
OPENAI_EXTRACTION_MODEL=gpt-5.5
```

Then run one label:

```bash
npm run test:extract:openai -- --limit=1
```

Run all generated labels:

```bash
npm run test:extract:openai
```

Results are written to `tmp/openai-extraction-results.json`.

The smoke test checks extraction quality. The app still uses deterministic code for compliance decisions.
