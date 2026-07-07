import { STANDARD_WARNING } from '../lib/verification'

export type SampleLabel = {
  id: string
  name: string
  imagePath: string
  rawText: string
}

export const SAMPLE_LABELS: SampleLabel[] = [
  {
    id: 'old-tom-compliant',
    name: 'old-tom-compliant.svg',
    imagePath: '/samples/old-tom-compliant.svg',
    rawText: [
      'OLD TOM DISTILLERY',
      'Kentucky Straight Bourbon Whiskey',
      '45% Alc./Vol. (90 Proof)',
      '750 mL',
      'Bottled by: Old Tom Distillery, Louisville, KY',
      'Product of United States',
      STANDARD_WARNING,
    ].join('\n'),
  },
  {
    id: 'old-tom-review',
    name: 'old-tom-review.svg',
    imagePath: '/samples/old-tom-review.svg',
    rawText: [
      "Old Tom Distiller's Reserve",
      'Kentucky Bourbon Whiskey',
      '43% Alc./Vol. (86 Proof)',
      '750 mL',
      'Bottled by: Old Tom Distillery, Louisville, KY',
      'Product of United States',
      'Government Warning: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of risk of birth defects. (2) Consumption of alcoholic beverages may impair your ability to drive or operate machinery, and may cause health problems.',
    ].join('\n'),
  },
]
