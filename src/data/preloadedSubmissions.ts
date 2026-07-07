import type { ApplicationFields } from '../lib/verification'

export type PreloadedSubmission = {
  id: string
  name: string
  imagePath: string
  application: ApplicationFields
}

const basePath = '/preloaded-submissions'

export const PRELOADED_SUBMISSIONS: PreloadedSubmission[] = [
  {
    id: '01-stones-throw',
    name: '01-stones-throw.png',
    imagePath: `${basePath}/01-stones-throw.png`,
    application: {
      beverageType: 'Distilled Spirits',
      brandName: "Stone's Throw",
      classType: 'American Single Malt Whiskey',
      alcoholContent: '48% Alc./Vol. (96 Proof)',
      netContents: '750 mL',
      bottlerName: "Stone's Throw Spirits",
      bottlerAddress: 'Denver, CO',
      countryOfOrigin: 'United States',
    },
  },
  {
    id: '02-sierra-norte',
    name: '02-sierra-norte.png',
    imagePath: `${basePath}/02-sierra-norte.png`,
    application: {
      beverageType: 'Distilled Spirits',
      brandName: 'Sierra Norte',
      classType: 'Tequila Blanco',
      alcoholContent: '40% Alc./Vol. (80 Proof)',
      netContents: '750 mL',
      bottlerName: 'Borderline Imports',
      bottlerAddress: 'Austin, TX',
      countryOfOrigin: 'Mexico',
    },
  },
  {
    id: '03-copper-rail-rum',
    name: '03-copper-rail-rum.png',
    imagePath: `${basePath}/03-copper-rail-rum.png`,
    application: {
      beverageType: 'Distilled Spirits',
      brandName: 'Copper Rail Rum',
      classType: 'Caribbean Rum',
      alcoholContent: '42% Alc./Vol. (84 Proof)',
      netContents: '750 mL',
      bottlerName: 'Copper Rail Distilling',
      bottlerAddress: 'Charleston, SC',
      countryOfOrigin: 'United States',
    },
  },
  {
    id: '04-lake-moon-brewing',
    name: '04-lake-moon-brewing.png',
    imagePath: `${basePath}/04-lake-moon-brewing.png`,
    application: {
      beverageType: 'Malt Beverage',
      brandName: 'Lake Moon Brewing',
      classType: 'American Lager',
      alcoholContent: '5.2% Alc. by Vol.',
      netContents: '12 FL OZ',
      bottlerName: 'Lake Moon Brewing Co.',
      bottlerAddress: 'Milwaukee, WI',
      countryOfOrigin: 'United States',
    },
  },
  {
    id: '05-north-star-gin',
    name: '05-north-star-gin.png',
    imagePath: `${basePath}/05-north-star-gin.png`,
    application: {
      beverageType: 'Distilled Spirits',
      brandName: 'North Star Gin',
      classType: 'London Dry Gin',
      alcoholContent: '47% Alc./Vol. (94 Proof)',
      netContents: '750 mL',
      bottlerName: 'North Star Spirits',
      bottlerAddress: 'Portland, ME',
      countryOfOrigin: 'United States',
    },
  },
  {
    id: '06-old-tom-bad-abv',
    name: '06-old-tom-bad-abv.png',
    imagePath: `${basePath}/06-old-tom-bad-abv.png`,
    application: {
      beverageType: 'Distilled Spirits',
      brandName: 'OLD TOM DISTILLERY',
      classType: 'Kentucky Straight Bourbon Whiskey',
      alcoholContent: '45% Alc./Vol. (90 Proof)',
      netContents: '750 mL',
      bottlerName: 'Old Tom Distillery',
      bottlerAddress: 'Louisville, KY',
      countryOfOrigin: 'United States',
    },
  },
  {
    id: '07-sierra-norte-bad-net-contents',
    name: '07-sierra-norte-bad-net-contents.png',
    imagePath: `${basePath}/07-sierra-norte-bad-net-contents.png`,
    application: {
      beverageType: 'Distilled Spirits',
      brandName: 'Sierra Norte',
      classType: 'Tequila Blanco',
      alcoholContent: '40% Alc./Vol. (80 Proof)',
      netContents: '750 mL',
      bottlerName: 'Borderline Imports',
      bottlerAddress: 'Austin, TX',
      countryOfOrigin: 'Mexico',
    },
  },
  {
    id: '08-copper-rail-bad-warning',
    name: '08-copper-rail-bad-warning.png',
    imagePath: `${basePath}/08-copper-rail-bad-warning.png`,
    application: {
      beverageType: 'Distilled Spirits',
      brandName: 'Copper Rail Rum',
      classType: 'Caribbean Rum',
      alcoholContent: '42% Alc./Vol. (84 Proof)',
      netContents: '750 mL',
      bottlerName: 'Copper Rail Distilling',
      bottlerAddress: 'Charleston, SC',
      countryOfOrigin: 'United States',
    },
  },
]
