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

const EXTRACTION_IMAGE_WIDTH = 768
const EXTRACTION_JPEG_QUALITY = 0.86
const MAX_EXTRACTION_ATTEMPTS = 3

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function retryAfterMs(response: Response, fallbackMs: number) {
  const header = response.headers.get('Retry-After')
  if (!header) return fallbackMs

  const seconds = Number(header)
  if (Number.isFinite(seconds)) return seconds * 1000

  const dateMs = Date.parse(header)
  return Number.isFinite(dateMs) ? Math.max(0, dateMs - Date.now()) : fallbackMs
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Unable to read image file'))
    reader.onload = () => resolve(String(reader.result))
    reader.readAsDataURL(file)
  })
}

async function fileToDataUrl(file: File) {
  if (typeof createImageBitmap !== 'function') {
    return readFileAsDataUrl(file)
  }

  try {
    const bitmap = await createImageBitmap(file)
    const scale = bitmap.width > EXTRACTION_IMAGE_WIDTH ? EXTRACTION_IMAGE_WIDTH / bitmap.width : 1
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height

    const context = canvas.getContext('2d')
    if (!context) {
      bitmap.close()
      return readFileAsDataUrl(file)
    }

    context.drawImage(bitmap, 0, 0, width, height)
    bitmap.close()

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', EXTRACTION_JPEG_QUALITY)
    })

    if (!blob) return readFileAsDataUrl(file)

    return readFileAsDataUrl(new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), {
      type: 'image/jpeg',
    }))
  } catch {
    return readFileAsDataUrl(file)
  }
}

function valueOrUndefined(value: string | null | undefined) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

async function requestExtraction(
  fileName: string,
  imageDataUrl: string,
  onProgress: (progress: ExtractionProgress) => void,
) {
  for (let attempt = 1; attempt <= MAX_EXTRACTION_ATTEMPTS; attempt += 1) {
    const response = await fetch('/api/extract-label', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName,
        imageDataUrl,
      }),
    })

    if (response.ok) return response

    const retryable = [429, 502, 503, 504].includes(response.status)
    if (!retryable || attempt === MAX_EXTRACTION_ATTEMPTS) {
      const message = await response.text()
      throw new Error(message || `AI extraction failed with ${response.status}`)
    }

    const waitMs = retryAfterMs(response, 800 * 2 ** (attempt - 1))
    onProgress({
      status: `Waiting to retry extraction (${attempt + 1}/${MAX_EXTRACTION_ATTEMPTS})`,
      progress: Math.min(0.34 + attempt * 0.08, 0.58),
    })
    await sleep(waitMs)
  }

  throw new Error('AI extraction failed after retries')
}

export async function extractWithOpenAI(
  file: File,
  onProgress: (progress: ExtractionProgress) => void,
): Promise<ExtractedFields> {
  if (!file.type.startsWith('image/')) {
    throw new Error('OpenAI extraction only accepts image files')
  }

  onProgress({ status: 'Optimizing image', progress: 0.12 })
  const imageDataUrl = await fileToDataUrl(file)

  onProgress({ status: 'Reading with vision model', progress: 0.34 })
  const response = await requestExtraction(file.name, imageDataUrl, onProgress)
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
