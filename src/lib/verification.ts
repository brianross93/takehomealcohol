export type BeverageType = 'Distilled Spirits' | 'Wine' | 'Malt Beverage'

export type CheckStatus = 'pass' | 'warn' | 'fail'

export type ReviewStatus = 'ready' | 'review' | 'reject'

export type ApplicationFields = {
  beverageType: BeverageType
  brandName: string
  classType: string
  alcoholContent: string
  netContents: string
  bottlerName: string
  bottlerAddress: string
  countryOfOrigin: string
}

export type ExtractedFields = {
  rawText: string
  lines: string[]
  confidence: number
  brandName?: string
  classType?: string
  alcoholContent?: string
  netContents?: string
  bottler?: string
  countryOfOrigin?: string
  warningText?: string
}

export type VerificationCheck = {
  id: string
  label: string
  expected: string
  found: string
  status: CheckStatus
  score: number
  message: string
}

export type ReviewResult = {
  extracted: ExtractedFields
  checks: VerificationCheck[]
  status: ReviewStatus
  score: number
  durationMs: number
}

export const STANDARD_WARNING =
  'GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems.'

export const DEFAULT_APPLICATION: ApplicationFields = {
  beverageType: 'Distilled Spirits',
  brandName: 'OLD TOM DISTILLERY',
  classType: 'Kentucky Straight Bourbon Whiskey',
  alcoholContent: '45% Alc./Vol. (90 Proof)',
  netContents: '750 mL',
  bottlerName: 'Old Tom Distillery',
  bottlerAddress: 'Louisville, KY',
  countryOfOrigin: 'United States',
}

const CLASS_KEYWORDS =
  /\b(ABSINTHE|ALE|BEER|BOURBON|BRANDY|CABERNET|CHARDONNAY|GIN|LAGER|LIQUEUR|MALT|MERLOT|PINOT|RUM|RYE|SPIRITS|STOUT|TEQUILA|VODKA|WHISKEY|WHISKY|WINE)\b/i

function collapseWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function normalizeLoose(value: string) {
  return collapseWhitespace(
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[’‘`]/g, "'")
      .replace(/&/g, ' AND ')
      .toUpperCase()
      .replace(/[^A-Z0-9.%]+/g, ' '),
  )
}

function normalizeCompact(value: string) {
  return normalizeLoose(value).replace(/[^A-Z0-9]/g, '')
}

function normalizeExact(value: string) {
  return collapseWhitespace(value.replace(/[“”]/g, '"').replace(/[’‘]/g, "'"))
}

function boundedScore(score: number) {
  return Math.max(0, Math.min(1, Number(score.toFixed(3))))
}

function levenshtein(a: string, b: string) {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length

  const previous = Array.from({ length: b.length + 1 }, (_, index) => index)
  const current = Array.from({ length: b.length + 1 }, () => 0)

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + cost,
      )
    }
    previous.splice(0, previous.length, ...current)
  }

  return previous[b.length]
}

function textSimilarity(a: string, b: string) {
  const left = normalizeLoose(a)
  const right = normalizeLoose(b)

  if (!left || !right) return 0
  if (left === right) return 1
  if (left.includes(right) || right.includes(left)) return 0.96

  const distance = levenshtein(left, right)
  return boundedScore(1 - distance / Math.max(left.length, right.length))
}

function compactContains(haystack: string, needle: string) {
  const compactHaystack = normalizeCompact(haystack)
  const compactNeedle = normalizeCompact(needle)

  return compactNeedle.length > 0 && compactHaystack.includes(compactNeedle)
}

function bestLineMatch(lines: string[], expected: string) {
  return lines.reduce(
    (best, line) => {
      const score = textSimilarity(line, expected)
      return score > best.score ? { line, score } : best
    },
    { line: '', score: 0 },
  )
}

function parseAbv(value: string) {
  const percent = value.match(/(\d{1,2}(?:\.\d+)?)\s*%/)
  if (percent) return Number.parseFloat(percent[1])

  const alcoholByVolume = value.match(
    /(\d{1,2}(?:\.\d+)?)\s*(?:ABV|ALC\.?\/?VOL\.?|ALCOHOL\s+BY\s+VOLUME)/i,
  )
  if (alcoholByVolume) return Number.parseFloat(alcoholByVolume[1])

  const proof = value.match(/(\d{2,3}(?:\.\d+)?)\s*PROOF/i)
  if (proof) return Number.parseFloat(proof[1]) / 2

  return null
}

function parseVolumeMl(value: string) {
  const match = value.match(
    /(\d+(?:\.\d+)?)\s*(ML|MILLILITERS?|L|LITERS?|FL\.?\s*OZ\.?|OZ)\b/i,
  )
  if (!match) return null

  const amount = Number.parseFloat(match[1])
  const unit = normalizeLoose(match[2])

  if (unit.startsWith('L') && !unit.startsWith('ML')) return amount * 1000
  if (unit.includes('OZ')) return amount * 29.5735
  return amount
}

function statusFromChecks(checks: VerificationCheck[]): ReviewStatus {
  if (checks.some((check) => check.status === 'fail')) return 'reject'
  if (checks.some((check) => check.status === 'warn')) return 'review'
  return 'ready'
}

function missingCheck(id: string, label: string, expected: string): VerificationCheck {
  return {
    id,
    label,
    expected,
    found: 'Not found',
    status: 'fail',
    score: 0,
    message: 'No readable match was found on the label.',
  }
}

function compareTextField(
  id: string,
  label: string,
  expected: string,
  found: string | undefined,
  rawText: string,
  lines: string[],
  threshold = 0.86,
): VerificationCheck {
  if (!expected.trim()) {
    return {
      id,
      label,
      expected: 'Not supplied',
      found: found || 'Not found',
      status: 'warn',
      score: 0,
      message: 'Application data is missing; agent review required.',
    }
  }

  const candidate = found || bestLineMatch(lines, expected).line

  if (candidate && compactContains(candidate, expected)) {
    return {
      id,
      label,
      expected,
      found: candidate,
      status: 'pass',
      score: 1,
      message: 'Label text matches the application field.',
    }
  }

  if (id !== 'brandName' && compactContains(rawText, expected)) {
    return {
      id,
      label,
      expected,
      found: found || expected,
      status: 'pass',
      score: 1,
      message: 'Label text matches the application field.',
    }
  }

  if (!candidate) return missingCheck(id, label, expected)

  const score = textSimilarity(candidate, expected)
  if (score >= threshold) {
    return {
      id,
      label,
      expected,
      found: candidate,
      status: 'warn',
      score,
      message: 'Close match found; verify the difference is acceptable.',
    }
  }

  return {
    id,
    label,
    expected,
    found: candidate,
    status: 'fail',
    score,
    message: 'Label text does not match the application field.',
  }
}

function compareAlcohol(expected: string, found: string | undefined): VerificationCheck {
  const expectedAbv = parseAbv(expected)
  const foundAbv = found ? parseAbv(found) : null

  if (expectedAbv === null) {
    return {
      id: 'alcoholContent',
      label: 'Alcohol content',
      expected: 'Not supplied',
      found: found || 'Not found',
      status: 'warn',
      score: 0,
      message: 'Application ABV could not be parsed; agent review required.',
    }
  }

  if (foundAbv === null) return missingCheck('alcoholContent', 'Alcohol content', expected)

  const delta = Math.abs(expectedAbv - foundAbv)
  if (delta <= 0.1) {
    return {
      id: 'alcoholContent',
      label: 'Alcohol content',
      expected,
      found: found || String(foundAbv),
      status: 'pass',
      score: 1,
      message: 'ABV matches within 0.1 percentage points.',
    }
  }

  return {
    id: 'alcoholContent',
    label: 'Alcohol content',
    expected,
    found: found || String(foundAbv),
    status: delta <= 0.5 ? 'warn' : 'fail',
    score: boundedScore(1 - delta / Math.max(expectedAbv, foundAbv)),
    message:
      delta <= 0.5
        ? 'ABV is close but should be reviewed.'
        : 'ABV differs from the application.',
  }
}

function compareNetContents(expected: string, found: string | undefined): VerificationCheck {
  const expectedMl = parseVolumeMl(expected)
  const foundMl = found ? parseVolumeMl(found) : null

  if (expectedMl === null) {
    return {
      id: 'netContents',
      label: 'Net contents',
      expected: 'Not supplied',
      found: found || 'Not found',
      status: 'warn',
      score: 0,
      message: 'Application net contents could not be parsed; agent review required.',
    }
  }

  if (foundMl === null) return missingCheck('netContents', 'Net contents', expected)

  const delta = Math.abs(expectedMl - foundMl)
  if (delta <= 1) {
    return {
      id: 'netContents',
      label: 'Net contents',
      expected,
      found: found || `${Math.round(foundMl)} mL`,
      status: 'pass',
      score: 1,
      message: 'Net contents match the application.',
    }
  }

  return {
    id: 'netContents',
    label: 'Net contents',
    expected,
    found: found || `${Math.round(foundMl)} mL`,
    status: delta <= 10 ? 'warn' : 'fail',
    score: boundedScore(1 - delta / Math.max(expectedMl, foundMl)),
    message:
      delta <= 10
        ? 'Net contents are close but should be reviewed.'
        : 'Net contents differ from the application.',
  }
}

function compareWarning(rawText: string, warningText: string | undefined): VerificationCheck {
  const exactWarning = normalizeExact(STANDARD_WARNING)
  const exactRaw = normalizeExact(rawText)
  const found = warningText || 'Not found'

  if (exactRaw.includes(exactWarning)) {
    return {
      id: 'governmentWarning',
      label: 'Government warning',
      expected: STANDARD_WARNING,
      found: STANDARD_WARNING,
      status: 'pass',
      score: 1,
      message: 'Required warning text is present exactly.',
    }
  }

  if (!/government\s+warning\s*:/i.test(rawText)) {
    return missingCheck('governmentWarning', 'Government warning', STANDARD_WARNING)
  }

  if (!/GOVERNMENT\s+WARNING\s*:/u.test(rawText)) {
    return {
      id: 'governmentWarning',
      label: 'Government warning',
      expected: STANDARD_WARNING,
      found,
      status: 'fail',
      score: 0.4,
      message: 'Warning prefix must be uppercase: GOVERNMENT WARNING:',
    }
  }

  return {
    id: 'governmentWarning',
    label: 'Government warning',
    expected: STANDARD_WARNING,
    found,
    status: 'fail',
    score: textSimilarity(found, STANDARD_WARNING),
    message: 'Warning text is present but not word-for-word exact.',
  }
}

export function extractFields(rawText: string, confidence = 0): ExtractedFields {
  const text = rawText.replace(/\u00a0/g, ' ')
  const lines = text
    .split(/\r?\n/)
    .map((line) => collapseWhitespace(line))
    .filter(Boolean)

  const joined = lines.join(' ')
  const alcoholContent =
    joined.match(
      /\b\d{1,2}(?:\.\d+)?\s*%?\s*(?:ABV|ALC\.?\/?VOL\.?|ALCOHOL\s+BY\s+VOLUME)\b(?:\s*\(\s*\d{2,3}(?:\.\d+)?\s*PROOF\s*\))?/i,
    )?.[0] ||
    joined.match(/\b\d{1,2}(?:\.\d+)?\s*%\b(?:\s*(?:ALC\.?\/?VOL\.?|ABV))?/i)?.[0] ||
    joined.match(/\b\d{2,3}(?:\.\d+)?\s*PROOF\b/i)?.[0]

  const netContents = joined.match(
    /\b\d+(?:\.\d+)?\s*(?:ML|MILLILITERS?|L|LITERS?|FL\.?\s*OZ\.?|OZ)\b/i,
  )?.[0]

  const bottler = lines.find((line) =>
    /\b(BOTTLED|DISTILLED|PRODUCED|IMPORTED|PACKED)\s+BY\b/i.test(line),
  )

  const countryOfOrigin =
    joined.match(/\b(?:PRODUCT\s+OF|COUNTRY\s+OF\s+ORIGIN)\s*:?\s*([A-Z][A-Z\s.]{2,40})/i)?.[1] ||
    (/\bUNITED\s+STATES\b/i.test(joined) ? 'United States' : undefined)

  const warningMatch = joined.match(
    /GOVERNMENT\s+WARNING\s*:\s*\(1\)[\s\S]+?may\s+cause\s+health\s+problems\.?/i,
  )
  const warningText = warningMatch ? collapseWhitespace(warningMatch[0]) : undefined

  const classType = lines.find(
    (line) =>
      CLASS_KEYWORDS.test(line) &&
      !/\b(PROOF|ALC|ABV|BOTTLED|WARNING|CONTENTS?)\b/i.test(line),
  )

  const brandName = lines.find(
    (line) =>
      line.length >= 3 &&
      line.length <= 60 &&
      !CLASS_KEYWORDS.test(line) &&
      !/\b(PROOF|ALC|ABV|WARNING|BOTTLED|DISTILLED|PRODUCED|CONTENTS?|PRODUCT\s+OF)\b/i.test(
        line,
      ),
  )

  return {
    rawText: text,
    lines,
    confidence,
    brandName,
    classType,
    alcoholContent,
    netContents,
    bottler,
    countryOfOrigin: countryOfOrigin ? collapseWhitespace(countryOfOrigin) : undefined,
    warningText,
  }
}

export function verifyLabel(
  extracted: ExtractedFields,
  application: ApplicationFields,
  durationMs: number,
): ReviewResult {
  const bottlerExpected = collapseWhitespace(
    `${application.bottlerName} ${application.bottlerAddress}`,
  )

  const checks: VerificationCheck[] = [
    compareTextField(
      'brandName',
      'Brand name',
      application.brandName,
      extracted.brandName,
      extracted.rawText,
      extracted.lines,
      0.82,
    ),
    compareTextField(
      'classType',
      'Class/type',
      application.classType,
      extracted.classType,
      extracted.rawText,
      extracted.lines,
      0.82,
    ),
    compareAlcohol(application.alcoholContent, extracted.alcoholContent),
    compareNetContents(application.netContents, extracted.netContents),
    compareTextField(
      'bottler',
      'Bottler/producer',
      bottlerExpected,
      extracted.bottler,
      extracted.rawText,
      extracted.lines,
      0.74,
    ),
    compareTextField(
      'countryOfOrigin',
      'Country of origin',
      application.countryOfOrigin,
      extracted.countryOfOrigin,
      extracted.rawText,
      extracted.lines,
      0.86,
    ),
    compareWarning(extracted.rawText, extracted.warningText),
  ]

  const score = boundedScore(
    checks.reduce((sum, check) => sum + check.score, 0) / checks.length,
  )

  return {
    extracted,
    checks,
    status: statusFromChecks(checks),
    score,
    durationMs,
  }
}
