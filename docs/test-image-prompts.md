# Test Image Prompts

Upload `docs/test-application-forms.csv` with the ten generated images. Save each generated image with the filename shown in its section. The CSV represents the submitted application records; the image prompt represents the submitted bottle or container photo.

For every prompt, ask the image generator for a realistic photo that an applicant might submit from an office: the bottle or container is standing upright on a desk or review table, the label is attached to the container, the whole label is visible, the camera is mostly front-facing, and the label text is readable. Avoid product-ad styling, hands, dramatic lighting, heavy blur, or cropping. Do not add extra brand or compliance text beyond what is listed. If the generator misspells the long government warning, regenerate the image.

## 01 Old Tom Compliant

Filename: `01-old-tom-compliant.png`
Expected result: `Ready`

Prompt:

```text
Create a realistic high-resolution photo submitted from an applicant's office: a bourbon bottle standing upright on a desk under normal office lighting, with an aged cream front label attached to the bottle, black vintage typography, and a thin decorative border. The camera should be mostly front-facing so the entire label is visible and readable. The label must contain exactly this readable text:

OLD TOM DISTILLERY
KENTUCKY STRAIGHT BOURBON WHISKEY
45% Alc./Vol. (90 Proof)
750 mL
Bottled by Old Tom Distillery, Louisville, KY
Product of United States
GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems.

Make GOVERNMENT WARNING: all caps and bold. Do not add or change any words.
```

## 02 Stone's Throw Case And Punctuation

Filename: `02-stones-throw-case.png`
Expected result: `Ready`

Prompt:

```text
Create a realistic high-resolution photo submitted from an applicant's office: a whiskey bottle standing upright on a review table under normal office lighting, with a modern mountain distillery label attached to the bottle, white paper, dark green and black ink, and crisp readable typography. The camera should be mostly front-facing so the entire label is visible and readable. The label must contain exactly this readable text:

STONE'S THROW
AMERICAN SINGLE MALT WHISKEY
48% Alc./Vol. (96 Proof)
750 mL
Bottled by Stone's Throw Spirits, Denver, CO
Product of United States
GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems.

Make GOVERNMENT WARNING: all caps and bold. Do not add or change any words.
```

## 03 Sierra Norte Import

Filename: `03-sierra-norte-import.png`
Expected result: `Ready`

Prompt:

```text
Create a realistic high-resolution photo submitted from an applicant's office: a tequila bottle standing upright on a desk under normal office lighting, with a restrained agave artwork label attached to the bottle, ivory paper, blue and black ink, and crisp readable typography. The camera should be mostly front-facing so the entire label is visible and readable. The label must contain exactly this readable text:

SIERRA NORTE
TEQUILA BLANCO
40% Alc./Vol. (80 Proof)
750 mL
Imported by Borderline Imports, Austin, TX
Product of Mexico
GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems.

Make GOVERNMENT WARNING: all caps and bold. Do not add or change any words.
```

## 04 Downriver Cabernet

Filename: `04-downriver-cabernet.png`
Expected result: `Ready`

Prompt:

```text
Create a realistic high-resolution photo submitted from an applicant's office: a wine bottle standing upright on a desk under normal office lighting, with a refined vineyard-style label attached to the bottle, off-white paper, burgundy accents, and very readable typography. The camera should be mostly front-facing so the entire label is visible and readable. The label must contain exactly this readable text:

DOWNRIVER CELLARS
CALIFORNIA CABERNET SAUVIGNON
13.8% Alc. by Vol.
750 mL
Bottled by Downriver Cellars, Napa, CA
Product of United States
Contains Sulfites
GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems.

Make GOVERNMENT WARNING: all caps and bold. Do not add or change any words.
```

## 05 Copper Rail Rum

Filename: `05-copper-rail-rum.png`
Expected result: `Ready`

Prompt:

```text
Create a realistic high-resolution photo submitted from an applicant's office: a rum bottle standing upright on a review table under normal office lighting, with a cream label attached to the bottle, copper and black ink, maritime line art, and readable typography. The camera should be mostly front-facing so the entire label is visible and readable. The label must contain exactly this readable text:

COPPER RAIL RUM
CARIBBEAN RUM
42% Alc./Vol. (84 Proof)
750 mL
Bottled by Copper Rail Distilling, Charleston, SC
Product of United States
GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems.

Make GOVERNMENT WARNING: all caps and bold. Do not add or change any words.
```

## 06 Lake Moon Lager

Filename: `06-lake-moon-lager.png`
Expected result: `Ready`

Prompt:

```text
Create a realistic high-resolution photo submitted from an applicant's office: a beer bottle standing upright on a desk under normal office lighting, with a label attached to the bottle, a quiet lake illustration, navy and gold accents, and crisp readable typography. The camera should be mostly front-facing so the entire label is visible and readable. The label must contain exactly this readable text:

LAKE MOON BREWING
AMERICAN LAGER
5.2% Alc. by Vol.
12 FL OZ
Brewed and bottled by Lake Moon Brewing Co., Milwaukee, WI
Product of United States
GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems.

Make GOVERNMENT WARNING: all caps and bold. Do not add or change any words.
```

## 07 North Star Gin

Filename: `07-north-star-gin.png`
Expected result: `Ready`

Prompt:

```text
Create a realistic high-resolution photo submitted from an applicant's office: a gin bottle standing upright on a desk under normal office lighting, with a botanical label attached to the bottle, white paper, black and pale blue ink, and crisp readable typography. The camera should be mostly front-facing so the entire label is visible and readable. The label must contain exactly this readable text:

NORTH STAR GIN
LONDON DRY GIN
47% Alc./Vol. (94 Proof)
750 mL
Bottled by North Star Spirits, Portland, ME
Product of United States
GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems.

Make GOVERNMENT WARNING: all caps and bold. Do not add or change any words.
```

## 08 Bad ABV

Filename: `08-bad-abv-old-tom.png`
Expected result: `Reject`
Reason: the application CSV says `45% Alc./Vol. (90 Proof)`, but this label says `40% Alc./Vol. (80 Proof)`.

Prompt:

```text
Create a realistic high-resolution photo submitted from an applicant's office: a bourbon bottle standing upright on a desk under normal office lighting, with an aged cream front label attached to the bottle, black vintage typography, and a thin decorative border. The camera should be mostly front-facing so the entire label is visible and readable. The label must contain exactly this readable text:

OLD TOM DISTILLERY
KENTUCKY STRAIGHT BOURBON WHISKEY
40% Alc./Vol. (80 Proof)
750 mL
Bottled by Old Tom Distillery, Louisville, KY
Product of United States
GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems.

Make GOVERNMENT WARNING: all caps and bold. Do not add or change any words.
```

## 09 Bad Net Contents

Filename: `09-bad-net-contents-sierra.png`
Expected result: `Reject`
Reason: the application CSV says `750 mL`, but this label says `700 mL`.

Prompt:

```text
Create a realistic high-resolution photo submitted from an applicant's office: a tequila bottle standing upright on a desk under normal office lighting, with a restrained agave artwork label attached to the bottle, ivory paper, blue and black ink, and crisp readable typography. The camera should be mostly front-facing so the entire label is visible and readable. The label must contain exactly this readable text:

SIERRA NORTE
TEQUILA BLANCO
40% Alc./Vol. (80 Proof)
700 mL
Imported by Borderline Imports, Austin, TX
Product of Mexico
GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems.

Make GOVERNMENT WARNING: all caps and bold. Do not add or change any words.
```

## 10 Bad Warning Wording

Filename: `10-bad-warning-copper-rail.png`
Expected result: `Reject`
Reason: the required government warning is present-looking but not word-for-word exact.

Prompt:

```text
Create a realistic high-resolution photo submitted from an applicant's office: a rum bottle standing upright on a review table under normal office lighting, with a cream label attached to the bottle, copper and black ink, maritime line art, and readable typography. The camera should be mostly front-facing so the entire label is visible and readable. The label must contain exactly this readable text:

COPPER RAIL RUM
CARIBBEAN RUM
42% Alc./Vol. (84 Proof)
750 mL
Bottled by Copper Rail Distilling, Charleston, SC
Product of United States
GOVERNMENT WARNING: (1) According to the Surgeon General, pregnant women should not drink alcoholic beverages. (2) Drinking alcoholic beverages may impair your ability to drive or operate machinery and may cause health problems.

Make GOVERNMENT WARNING: all caps and bold. Do not add or change any words.
```
