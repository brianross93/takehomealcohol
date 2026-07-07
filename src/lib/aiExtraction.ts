import { extractFields, type ExtractedFields } from './verification'

type AiExtractionPayload = {
  rawText?: string
  brandName?: string | null
  classType?: string | null
  alcoholContent?: string | null
  netContents?: string | null
  bottler?: string | null
  countryOfOrigin?: string | null
  warningText?: string | null
  warningPrefixBold?: boolean | null
  warningLegible?: boolean | null
  warningRelativeSize?: 'acceptable' | 'small' | 'unknown' | null
  warningFormatNotes?: string[] | null
  confidence?: number
}

type ExtractionProgress = {
  status: string
  progress: number
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Unable to read image file'))
    reader.onload = () => resolve(String(reader.result))
    reader.readAsDataURL(file)
  })
}

function valueOrUndefined(value: string | null | undefined) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

export async function extractWithOpenAI(
  file: File,
  onProgress: (progress: ExtractionProgress) => void,
): Promise<ExtractedFields> {
  if (!file.type.startsWith('image/')) {
    throw new Error('OpenAI extraction only accepts image files')
  }

  onProgress({ status: 'Preparing image', progress: 0.12 })
  const imageDataUrl = await fileToDataUrl(file)

  onProgress({ status: 'Reading with vision model', progress: 0.34 })
  const response = await fetch('/api/extract-label', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileName: file.name,
      imageDataUrl,
    }),
  })

  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || `AI extraction failed with ${response.status}`)
  }

  const payload = (await response.json()) as AiExtractionPayload
  const rawText = payload.rawText || ''
  const confidence =
    typeof payload.confidence === 'number' ? Math.round(payload.confidence * 100) : 90
  const extracted = extractFields(rawText, confidence)

  onProgress({ status: 'Validating extraction', progress: 0.82 })

  return {
    ...extracted,
    source: 'ai',
    brandName: valueOrUndefined(payload.brandName) || extracted.brandName,
    classType: valueOrUndefined(payload.classType) || extracted.classType,
    alcoholContent: valueOrUndefined(payload.alcoholContent) || extracted.alcoholContent,
    netContents: valueOrUndefined(payload.netContents) || extracted.netContents,
    bottler: valueOrUndefined(payload.bottler) || extracted.bottler,
    countryOfOrigin: valueOrUndefined(payload.countryOfOrigin) || extracted.countryOfOrigin,
    warningText: valueOrUndefined(payload.warningText) || extracted.warningText,
    warningPrefixBold:
      typeof payload.warningPrefixBold === 'boolean'
        ? payload.warningPrefixBold
        : extracted.warningPrefixBold,
    warningLegible:
      typeof payload.warningLegible === 'boolean'
        ? payload.warningLegible
        : extracted.warningLegible,
    warningRelativeSize: payload.warningRelativeSize || extracted.warningRelativeSize,
    warningFormatNotes: payload.warningFormatNotes || extracted.warningFormatNotes,
  }
}
